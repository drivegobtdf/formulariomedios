import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PROD_REF = 'uwzgyirilafgnbpmrkic';
export const PROD_BASELINE_LAST_MIGRATION = '20261029164500_submission_tracking_recovery_lookup.sql';

/**
 * Tablas opcionales en backup pre-migración porque son creadas por las migraciones
 * candidatas 202611* (CAM-08 / INC-05) y aún no existen en PROD antes de `supabase db push`.
 */
export const OPTIONAL_PRE_MIGRATION_TABLES = [
  'nota_pedido_historial',
  '_mock_drive_storage',
];

/**
 * Catálogo completo de las 43 tablas de datos del esquema public en orden topológico.
 * Incluye catálogos, envíos, pedidos, archivos, solicitudes de información, notas e historial,
 * entregas, revisiones, comunicaciones, sesiones, tableros privados y auditoría de purga.
 */
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
  'enlaces_material',
  'enlace_pedido',
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
  'notificaciones_usuario',
  'tableros_privados',
  'tablero_miembros',
  'tablero_columnas',
  'tablero_tarjetas',
  'tablero_tarjeta_checklists',
  'tablero_tarjeta_comentarios',
  'admin_purge_operations',
  'admin_purge_items',
];

/**
 * Construye un manifiesto verificable del esquema SQL a partir del directorio `supabase/migrations`,
 * distinguiendo las 88 migraciones base productivas (<= 20261029164500) y las migraciones candidatas (202611*),
 * e incluyendo sentencias deterministas de rollback de esquema no destructivo.
 */
export function buildSchemaSnapshot(options = {}) {
  const migrationsDir = options.migrationsDir || path.resolve(__dirname, '..', 'supabase', 'migrations');
  const baselineCutoff = options.baselineCutoff || PROD_BASELINE_LAST_MIGRATION;

  const migrations = [];
  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      const version = file.split('_')[0];
      const phase = file <= baselineCutoff ? 'baseline_prod' : 'candidate_pending';
      migrations.push({
        file,
        version,
        phase,
        size_bytes: Buffer.byteLength(content, 'utf8'),
        sha256,
      });
    }
  }

  const rollbackDdlStatements = [
    '-- Rollback no destructivo de triggers y constraints introducidos en lote 202611*',
    'DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;',
    'DROP TRIGGER IF EXISTS trg_domain_events_sync_reabierto ON public.domain_events;',
    'DROP TRIGGER IF EXISTS trg_pedidos_protect_reabierto ON public.pedidos;',
    'ALTER TABLE public.envios_formulario DROP CONSTRAINT IF EXISTS chk_envios_interno_correo_requerido;',
  ];

  const canonicalPayload = JSON.stringify({
    baseline_cutoff: baselineCutoff,
    tables: TABLES,
    optional_pre_migration_tables: OPTIONAL_PRE_MIGRATION_TABLES,
    migrations,
    rollback_ddl: rollbackDdlStatements,
  });

  const schemaSha256 = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');

  return {
    schema_version: '1.2',
    baseline_cutoff: baselineCutoff,
    total_migrations: migrations.length,
    baseline_migrations_count: migrations.filter(m => m.phase === 'baseline_prod').length,
    candidate_migrations_count: migrations.filter(m => m.phase === 'candidate_pending').length,
    tables_catalog: [...TABLES],
    optional_pre_migration_tables: [...OPTIONAL_PRE_MIGRATION_TABLES],
    migrations,
    rollback_ddl: rollbackDdlStatements,
    schema_sha256: schemaSha256,
  };
}

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

function isMissingRelationError(status, errText = '') {
  if (status === 404) return true;
  if (status === 400 && (
    errText.includes('PGRST205') ||
    errText.includes('42P01') ||
    errText.includes('Could not find the table') ||
    errText.includes('does not exist')
  )) {
    return true;
  }
  return false;
}

/**
 * Consulta y pagina los registros de una tabla respetando PostgREST Range header.
 * Si la tabla está declarada como opcional pre-migración (`allowMissingTable: true`) y el
 * servidor responde que aún no existe (404 / PGRST205 / 42P01 en offset 0), retorna `[]`
 * y notifica mediante `onMissingTable`. Para cualquier tabla base o cualquier otro error HTTP
 * (401, 403, 500, 503, etc.), aborta de forma estrictamente fail-closed.
 */
export async function fetchTableRowsPaged(table, fetchFn, options = {}) {
  const pageSize = options.pageSize || 1000;
  const allowMissingTable = options.allowMissingTable === true;
  let offset = 0;
  let allRows = [];
  let hasMore = true;
  let expectedTotal = null;

  while (hasMore) {
    const rangeHeader = `${offset}-${offset + pageSize - 1}`;
    const res = await fetchFn(table, rangeHeader);

    if (!res.ok) {
      const errText = typeof res.text === 'function' ? await res.text() : '';
      if (offset === 0 && allowMissingTable && isMissingRelationError(res.status, errText)) {
        if (typeof options.onMissingTable === 'function') {
          options.onMissingTable(table, { status: res.status, detail: errText || res.statusText });
        }
        return [];
      }
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
 * Verifica la integridad completa de un archivo de backup (.enc y opcionalmente .meta.json),
 * incluyendo metadatos, conteo exacto de tablas y hash criptográfico del manifiesto de esquema.
 */
export function verifyBackupFile(backupFilePath, options = {}) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`[VERIFY_ERROR] Archivo de backup no existe: ${backupFilePath}`);
  }

  const fileBytes = fs.readFileSync(backupFilePath);
  const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

  const metaPath = backupFilePath.replace(/\.enc$/, '.meta.json');
  let metaObj = null;
  if (fs.existsSync(metaPath)) {
    metaObj = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (metaObj.sha256 && metaObj.sha256 !== actualSha256) {
      throw new Error(`[VERIFY_ERROR] Checksum SHA-256 no coincide para ${backupFilePath}. Esperado: ${metaObj.sha256}, Real: ${actualSha256}`);
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

  let schemaVerified = false;
  if (snapshot.schema) {
    const expectedSchemaHash = snapshot.schema.schema_sha256;
    const recomputedPayload = JSON.stringify({
      baseline_cutoff: snapshot.schema.baseline_cutoff,
      tables: snapshot.schema.tables_catalog,
      optional_pre_migration_tables: snapshot.schema.optional_pre_migration_tables,
      migrations: snapshot.schema.migrations,
      rollback_ddl: snapshot.schema.rollback_ddl,
    });
    const actualSchemaHash = crypto.createHash('sha256').update(recomputedPayload, 'utf8').digest('hex');
    if (expectedSchemaHash && expectedSchemaHash !== actualSchemaHash) {
      throw new Error(
        `[VERIFY_ERROR] El manifiesto de esquema dentro del backup fue alterado. Esperado: ${expectedSchemaHash}, Real: ${actualSchemaHash}`
      );
    }
    if (metaObj?.schema_sha256 && metaObj.schema_sha256 !== actualSchemaHash) {
      throw new Error(
        `[VERIFY_ERROR] El checksum de esquema en .meta.json (${metaObj.schema_sha256}) no coincide con el snapshot (${actualSchemaHash}).`
      );
    }
    schemaVerified = true;
  } else if (options.requireSchema === true) {
    throw new Error('[VERIFY_ERROR] Se requirió verificación de esquema pero el snapshot carece de bloque schema.');
  }

  return {
    valid: true,
    sha256: actualSha256,
    schemaVerified,
    schemaSha256: snapshot.schema?.schema_sha256 || null,
    metadata: snapshot.metadata,
    missingTables: snapshot.metadata.missing_tables || [],
    tableCount: Object.keys(snapshot.tables).length,
    totalRecords: Object.values(snapshot.metadata.counts || {}).reduce((a, b) => a + b, 0),
  };
}

/**
 * Ejecuta el backup lógico completo (esquema + datos) con paginación, tolerancia controlada
 * para tablas pre-migración aún inexistentes, fail-closed para tablas nucleares y cifrado AES-256-GCM.
 */
export async function runLogicalBackup(options = {}) {
  const projectRef = options.projectRef || process.env.SUPABASE_PROJECT_REF || DEFAULT_PROD_REF;
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || ('https://' + projectRef + '.supabase.co');
  const serviceKey = options.serviceKey || getServiceKey(projectRef);
  const tablesList = options.tables || TABLES;
  const pageSize = options.pageSize || 1000;
  const optionalTables = new Set(options.optionalTables || OPTIONAL_PRE_MIGRATION_TABLES);
  const allowPreMigrationMissing = options.allowPreMigrationMissing !== false;

  const backupDir = options.backupDir || path.join(os.homedir(), '.pedidos', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const schemaSnapshot = buildSchemaSnapshot(options);

  const snapshot = {
    metadata: {
      version: '1.2',
      project_ref: projectRef,
      created_at: new Date().toISOString(),
      counts: {},
      missing_tables: [],
      schema_sha256: schemaSnapshot.schema_sha256,
    },
    schema: schemaSnapshot,
    tables: {},
  };

  console.log('[BACKUP] Conectando a Supabase (' + projectRef + ')...');

  const defaultFetch = async (table, rangeHeader) => {
    return fetch(supabaseUrl + '/rest/v1/' + table + '?select=*', {
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        Range: rangeHeader,
        Prefer: 'count=exact',
      },
    });
  };
  const fetchFn = options.fetchFn || defaultFetch;

  for (const table of tablesList) {
    const isOptionalPreMigration = allowPreMigrationMissing && optionalTables.has(table);
    let wasMissing = false;
    const rows = await fetchTableRowsPaged(table, fetchFn, {
      pageSize,
      allowMissingTable: isOptionalPreMigration,
      onMissingTable: (missingTable) => {
        wasMissing = true;
        snapshot.metadata.missing_tables.push(missingTable);
      },
    });
    snapshot.tables[table] = rows;
    snapshot.metadata.counts[table] = rows.length;
    if (wasMissing) {
      console.log(' - [' + table + '] 0 registros (tabla pre-migración aún inexistente en origen, registrada en missing_tables).');
    } else {
      console.log(' - [' + table + '] ' + rows.length + ' registros exportados.');
    }
  }

  // Cifrado AES-256-GCM
  const encryptionKey = resolveEncryptionKey(options);
  const finalPackage = encryptBackupData(snapshot, encryptionKey);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, 'prod-backup-' + timestamp + '.enc');
  fs.writeFileSync(backupFilePath, finalPackage, { mode: 0o600 });

  // Archivo de metadata y checksums SHA-256 (datos + esquema)
  const sha256 = crypto.createHash('sha256').update(finalPackage).digest('hex');
  const metaPath = path.join(backupDir, 'prod-backup-' + timestamp + '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    file: path.basename(backupFilePath),
    size_bytes: finalPackage.length,
    sha256,
    schema_sha256: schemaSnapshot.schema_sha256,
    total_migrations: schemaSnapshot.total_migrations,
    baseline_migrations_count: schemaSnapshot.baseline_migrations_count,
    candidate_migrations_count: schemaSnapshot.candidate_migrations_count,
    created_at: snapshot.metadata.created_at,
    missing_tables: snapshot.metadata.missing_tables,
    counts: snapshot.metadata.counts,
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

  console.log('[SUCCESS] Backup cifrado (esquema + datos) completado: ' + backupFilePath + ' (' + finalPackage.length + ' bytes)');
  return {
    backupFilePath,
    metaPath,
    sha256,
    schemaSha256: schemaSnapshot.schema_sha256,
    missingTables: snapshot.metadata.missing_tables,
    counts: snapshot.metadata.counts,
    snapshot,
  };
}

if (process.argv[1] && process.argv[1].includes('backup-prod-database.mjs')) {
  runLogicalBackup().catch(err => {
    console.error('[ERROR] Error en backup:', err.message);
    process.exit(1);
  });
}
