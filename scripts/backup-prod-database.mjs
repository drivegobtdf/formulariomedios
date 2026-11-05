import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export const DEFAULT_PROD_REF = 'uwzgyirilafgnbpmrkic';

export const TABLES = [
  'categorias_servicio',
  'tipos_servicio',
  'configuracion_sistema',
  'pedido_sequences',
  'usuarios_acceso',
  'envios_formulario',
  'pedidos',
  'archivos',
  'upload_reservations',
  'archivo_pedido',
  'enlace_pedido',
  'enlaces_material',
  'solicitudes_informacion',
  'archivo_solicitud_informacion',
  'enlace_solicitud_informacion',
  'notas_pedido',
  'nota_pedido_historial',
  'pedido_asignaciones',
  'pedido_drive_folders',
  'pedido_versiones',
  'pedido_etiquetas',
  'pedido_checklist_items',
  'entregas_pedido',
  'entrega_archivos',
  'revision_solicitudes',
  'revision_pedidos',
  'revision_archivos',
  'comunicaciones_pedido',
  'domain_events',
  'audit_log',
  'submission_sessions',
  'solicitante_sesiones',
  'solicitante_access_tokens',
  'tracking_recovery_tokens',
  'notificaciones_usuario'
];

/**
 * Resuelve la clave de cifrado AES-256-GCM.
 * Prioridad: options.encryptionKey -> process.env.BACKUP_ENCRYPTION_KEY -> ~/.pedidos/backup.key
 */
export function resolveEncryptionKey(options = {}) {
  if (options.encryptionKey) {
    if (Buffer.isBuffer(options.encryptionKey) && options.encryptionKey.length === 32) {
      return options.encryptionKey;
    }
    if (typeof options.encryptionKey === 'string' && options.encryptionKey.trim().length === 64) {
      return Buffer.from(options.encryptionKey.trim(), 'hex');
    }
  }

  if (process.env.BACKUP_ENCRYPTION_KEY) {
    const raw = process.env.BACKUP_ENCRYPTION_KEY.trim();
    if (raw.length === 64) {
      return Buffer.from(raw, 'hex');
    }
    throw new Error('[BACKUP_SECURITY] BACKUP_ENCRYPTION_KEY debe ser una cadena hexadecimal de 64 caracteres (32 bytes).');
  }

  const keyDir = options.keyDir || path.join(os.homedir(), '.pedidos');
  const secretKeyPath = path.join(keyDir, 'backup.key');

  if (fs.existsSync(secretKeyPath)) {
    const hex = fs.readFileSync(secretKeyPath, 'utf8').trim();
    if (hex.length === 64) {
      return Buffer.from(hex, 'hex');
    }
    throw new Error(`[BACKUP_SECURITY] Clave en ${secretKeyPath} es inválida (debe tener 64 caracteres hex).`);
  }

  if (options.autoGenerate !== false) {
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    }
    const newKey = crypto.randomBytes(32);
    fs.writeFileSync(secretKeyPath, newKey.toString('hex'), { mode: 0o600, encoding: 'utf8' });
    return newKey;
  }

  throw new Error('[BACKUP_SECURITY] Clave de cifrado no configurada ni recuperable.');
}

export function getServiceKey(projectRef = DEFAULT_PROD_REF) {
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
    }
  }
  try {
    const out = execSync('npx.cmd supabase projects api-keys --project-ref ' + projectRef + ' --output json', { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const item = (parsed.keys || []).find(k => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch (_err) {
    void _err;
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado en entorno ni recuperable');
}

/**
 * Consulta y pagina los registros de una tabla respetando PostgREST Range header.
 * Si cualquier petición falla (status >= 400), aborta de forma fail-closed.
 */
export async function fetchTableRowsPaged(table, fetchFn, options = {}) {
  const pageSize = options.pageSize || 1000;
  let offset = 0;
  let allRows = [];
  let hasMore = true;
  let expectedTotal = null;

  while (hasMore) {
    const rangeHeader = `${offset}-${offset + pageSize - 1}`;
    const res = await fetchFn(table, rangeHeader);

    if (!res.ok) {
      const errText = typeof res.text === 'function' ? await res.text() : '';
      throw new Error(
        `[BACKUP_ERROR] Fallo crítico exportando tabla "${table}" (offset ${offset}, status ${res.status}): ${errText || res.statusText}`
      );
    }

    const rows = typeof res.json === 'function' ? await res.json() : [];
    if (!Array.isArray(rows)) {
      throw new Error(`[BACKUP_ERROR] Respuesta inesperada para tabla "${table}": se esperaba array de registros.`);
    }

    allRows.push(...rows);

    const contentRange = (typeof res.headers?.get === 'function' ? res.headers.get('content-range') : null) || '';
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)$/);
      if (match && match[1] !== '*') {
        expectedTotal = parseInt(match[1], 10);
        if (allRows.length >= expectedTotal) {
          hasMore = false;
        }
      }
    }

    if (rows.length < pageSize) {
      if (expectedTotal !== null && allRows.length < expectedTotal) {
        throw new Error(
          `[BACKUP_ERROR] Truncamiento detectado en tabla "${table}": se esperaban ${expectedTotal} registros según Content-Range, pero solo se recuperaron ${allRows.length}.`
        );
      }
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }

  return allRows;
}

export const MAGIC_HEADER = Buffer.from('PED1', 'utf8');

/**
 * Cifra un objeto JavaScript arbitrario usando AES-256-GCM.
 * Formato del paquete: [PED1: 4 bytes][IV: 12 bytes][AuthTag: 16 bytes][Ciphertext]
 */
export function encryptBackupData(dataObj, encryptionKey) {
  const rawJson = JSON.stringify(dataObj);
  const rawBytes = Buffer.from(rawJson, 'utf8');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, iv, authTag, encrypted]);
}

/**
 * Desencripta y valida criptográficamente la integridad del paquete de backup.
 * Soporta de forma transparente tanto el nuevo formato con cabecera mágica (PED1),
 * como los respaldos históricos legacy (IV 12B + AuthTag 16B + Ciphertext).
 * Lanza excepción si la clave es errónea o el paquete fue alterado en 1 solo bit.
 */
export function decryptBackupPackage(packageBuffer, encryptionKey) {
  if (!Buffer.isBuffer(packageBuffer)) {
    packageBuffer = Buffer.from(packageBuffer);
  }
  if (packageBuffer.length < 28) {
    throw new Error('[RESTORE_ERROR] Paquete de backup demasiado corto para contener IV y AuthTag (mínimo 28 bytes).');
  }

  let iv;
  let authTag;
  let encryptedData;

  const hasMagic = packageBuffer.length >= 32 && packageBuffer.subarray(0, 4).equals(MAGIC_HEADER);

  if (hasMagic) {
    iv = packageBuffer.subarray(4, 16);
    authTag = packageBuffer.subarray(16, 32);
    encryptedData = packageBuffer.subarray(32);
  } else {
    // Formato histórico: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    iv = packageBuffer.subarray(0, 12);
    authTag = packageBuffer.subarray(12, 28);
    encryptedData = packageBuffer.subarray(28);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Verifica la integridad completa de un archivo de backup (.enc y opcionalmente .meta.json).
 */
export function verifyBackupFile(backupFilePath, options = {}) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`[VERIFY_ERROR] Archivo de backup no existe: ${backupFilePath}`);
  }

  const fileBytes = fs.readFileSync(backupFilePath);
  const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

  const metaPath = backupFilePath.replace(/\.enc$/, '.meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.sha256 && meta.sha256 !== actualSha256) {
      throw new Error(`[VERIFY_ERROR] Checksum SHA-256 no coincide para ${backupFilePath}. Esperado: ${meta.sha256}, Real: ${actualSha256}`);
    }
  }

  const key = resolveEncryptionKey({ ...options, autoGenerate: false });
  const snapshot = decryptBackupPackage(fileBytes, key);

  if (!snapshot.metadata || !snapshot.tables) {
    throw new Error('[VERIFY_ERROR] El snapshot no contiene estructura válida (metadata/tables).');
  }

  for (const [table, expectedCount] of Object.entries(snapshot.metadata.counts || {})) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows)) {
      throw new Error(`[VERIFY_ERROR] Tabla ${table} ausente o no es array en snapshot.`);
    }
    if (rows.length !== expectedCount) {
      throw new Error(`[VERIFY_ERROR] Discrepancia en conteo para ${table}: esperado=${expectedCount}, real=${rows.length}`);
    }
  }

  return {
    valid: true,
    sha256: actualSha256,
    metadata: snapshot.metadata,
    tableCount: Object.keys(snapshot.tables).length,
    totalRecords: Object.values(snapshot.metadata.counts || {}).reduce((a, b) => a + b, 0),
  };
}

/**
 * Ejecuta el backup lógico completo con paginación, fail-closed y cifrado AES-256-GCM.
 */
export async function runLogicalBackup(options = {}) {
  const projectRef = options.projectRef || process.env.SUPABASE_PROJECT_REF || DEFAULT_PROD_REF;
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || ('https://' + projectRef + '.supabase.co');
  const serviceKey = options.serviceKey || getServiceKey(projectRef);
  const tablesList = options.tables || TABLES;
  const pageSize = options.pageSize || 1000;

  const backupDir = options.backupDir || path.join(os.homedir(), '.pedidos', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const snapshot = {
    metadata: {
      version: '1.1',
      project_ref: projectRef,
      created_at: new Date().toISOString(),
      counts: {}
    },
    tables: {}
  };

  console.log('[BACKUP] Conectando a Supabase (' + projectRef + ')...');

  // Función de fetch real o inyectada por opciones para pruebas locales
  const defaultFetch = async (table, rangeHeader) => {
    return fetch(supabaseUrl + '/rest/v1/' + table + '?select=*', {
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        Range: rangeHeader,
        Prefer: 'count=exact'
      }
    });
  };
  const fetchFn = options.fetchFn || defaultFetch;

  for (const table of tablesList) {
    const rows = await fetchTableRowsPaged(table, fetchFn, { pageSize });
    snapshot.tables[table] = rows;
    snapshot.metadata.counts[table] = rows.length;
    console.log(' - [' + table + '] ' + rows.length + ' registros exportados.');
  }

  // Cifrado AES-256-GCM
  const encryptionKey = resolveEncryptionKey(options);
  const finalPackage = encryptBackupData(snapshot, encryptionKey);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, 'prod-backup-' + timestamp + '.enc');
  fs.writeFileSync(backupFilePath, finalPackage, { mode: 0o600 });

  // Archivo de metadata y checksums SHA-256
  const sha256 = crypto.createHash('sha256').update(finalPackage).digest('hex');
  const metaPath = path.join(backupDir, 'prod-backup-' + timestamp + '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    file: path.basename(backupFilePath),
    size_bytes: finalPackage.length,
    sha256,
    created_at: snapshot.metadata.created_at,
    counts: snapshot.metadata.counts
  }, null, 2), { mode: 0o600, encoding: 'utf8' });

  // Retención: conservar los últimos 30 backups
  if (options.skipRetention !== true) {
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
          // Ignorar limpieza de archivos antiguos
        }
      }
    }
  }

  console.log('[SUCCESS] Backup cifrado completado: ' + backupFilePath + ' (' + finalPackage.length + ' bytes)');
  return { backupFilePath, metaPath, sha256, counts: snapshot.metadata.counts, snapshot };
}

if (process.argv[1] && process.argv[1].includes('backup-prod-database.mjs')) {
  runLogicalBackup().catch(err => {
    console.error('[ERROR] Error en backup:', err.message);
    process.exit(1);
  });
}
