import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { execSync } from 'node:child_process';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://' + PROJECT_REF + '.supabase.co';

function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const prodSecretsPath = path.join(os.homedir(), '.pedidos', 'prod-secrets.json');
  if (fs.existsSync(prodSecretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
      if (parsed.SUPABASE_SERVICE_ROLE_KEY) return parsed.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch (_err) {
      void _err;
      // Ignorar fallo de lectura de archivo local
    }
  }
  try {
    const out = execSync('npx.cmd supabase projects api-keys --project-ref ' + PROJECT_REF + ' --output json', { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const item = (parsed.keys || []).find(k => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch (_err) {
    void _err;
    // Ignorar fallo de CLI
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado en entorno ni recuperable');
}

const TABLES = [
  'pedidos',
  'envios_formulario',
  'archivos',
  'upload_reservations',
  'archivo_pedido',
  'solicitudes_informacion',
  'notas_pedido',
  'entregas_pedido',
  'pedido_asignaciones',
  'comunicaciones_pedido',
  'domain_events',
  'audit_log',
  'submission_sessions',
  'solicitante_sesiones',
  'solicitante_access_tokens',
  'tracking_recovery_tokens',
  'enlaces_material',
  'enlace_pedido',
  'archivo_solicitud_informacion',
  'enlace_solicitud_informacion',
  'usuarios_acceso',
  'categorias_servicio',
  'tipos_servicio',
  'configuracion_sistema',
  'pedido_sequences'
];

export async function runLogicalBackup(options = {}) {
  const SERVICE_KEY = getServiceKey();
  const backupDir = options.backupDir || path.join(os.homedir(), '.pedidos', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const snapshot = {
    metadata: {
      version: '1.0',
      project_ref: PROJECT_REF,
      created_at: new Date().toISOString(),
      counts: {}
    },
    tables: {}
  };

  console.log('[BACKUP] Conectando a Supabase Producción (' + PROJECT_REF + ')...');

  for (const table of TABLES) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=*', {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        Range: '0-9999'
      }
    });

    if (!res.ok) {
      console.warn('[WARN] Tabla ' + table + ' retornó status ' + res.status);
      snapshot.tables[table] = [];
      snapshot.metadata.counts[table] = 0;
      continue;
    }

    const rows = await res.json();
    snapshot.tables[table] = rows;
    snapshot.metadata.counts[table] = Array.isArray(rows) ? rows.length : 0;
    console.log(' - [' + table + '] ' + snapshot.metadata.counts[table] + ' registros exportados.');
  }

  const rawJson = JSON.stringify(snapshot, null, 2);
  const rawBytes = Buffer.from(rawJson, 'utf8');

  // Encryption using AES-256-GCM
  const secretKeyPath = path.join(os.homedir(), '.pedidos', 'backup.key');
  let encryptionKey;
  if (fs.existsSync(secretKeyPath)) {
    encryptionKey = Buffer.from(fs.readFileSync(secretKeyPath, 'utf8').trim(), 'hex');
  } else {
    encryptionKey = crypto.randomBytes(32);
    fs.writeFileSync(secretKeyPath, encryptionKey.toString('hex'), { mode: 0o600, encoding: 'utf8' });
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const finalPackage = Buffer.concat([iv, authTag, encrypted]);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, 'prod-backup-' + timestamp + '.enc');

  fs.writeFileSync(backupFilePath, finalPackage, { mode: 0o600 });

  // Summary metadata file (non-sensitive counts only)
  const metaPath = path.join(backupDir, 'prod-backup-' + timestamp + '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    file: path.basename(backupFilePath),
    size_bytes: finalPackage.length,
    sha256: crypto.createHash('sha256').update(finalPackage).digest('hex'),
    created_at: snapshot.metadata.created_at,
    counts: snapshot.metadata.counts
  }, null, 2), { mode: 0o600, encoding: 'utf8' });

  // Retention: keep last 30 daily backups
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('prod-backup-') && f.endsWith('.enc'));
  if (files.length > 30) {
    files.sort();
    const toDelete = files.slice(0, files.length - 30);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(backupDir, f));
        const m = f.replace('.enc', '.meta.json');
        if (fs.existsSync(path.join(backupDir, m))) fs.unlinkSync(path.join(backupDir, m));
      } catch {
        // Ignorar errores de limpieza de archivos antiguos
      }
    }
  }

  console.log('[SUCCESS] Backup cifrado completado: ' + backupFilePath + ' (' + finalPackage.length + ' bytes)');
  return { backupFilePath, metaPath, counts: snapshot.metadata.counts };
}

if (process.argv[1] && process.argv[1].includes('backup-prod-database.mjs')) {
  runLogicalBackup().catch(err => {
    console.error('[ERROR] Error en backup:', err);
    process.exit(1);
  });
}
