import fs from 'node:fs';
import path from 'node:path';
import {
  TABLES,
  resolveEncryptionKey,
  decryptBackupPackage,
  verifyBackupFile,
} from './backup-prod-database.mjs';

/**
 * Orden canónico topológico para restauración respetando dependencias referenciales.
 */
export const RESTORE_ORDER = [
  // 1. Catálogos y configuración independientes
  'categorias_servicio',
  'tipos_servicio',
  'configuracion_sistema',
  'pedido_sequences',
  'usuarios_acceso',

  // 2. Envíos y pedidos base
  'envios_formulario',
  'pedidos',
  'archivos',
  'upload_reservations',
  'archivo_pedido',
  'enlace_pedido',
  'enlaces_material',

  // 3. Solicitudes de información y respuestas
  'solicitudes_informacion',
  'archivo_solicitud_informacion',
  'enlace_solicitud_informacion',

  // 4. Notas e historial, asignaciones y carpetas
  'notas_pedido',
  'nota_pedido_historial',
  'pedido_asignaciones',
  'pedido_drive_folders',
  'pedido_versiones',
  'pedido_etiquetas',
  'pedido_checklist_items',

  // 5. Entregas y revisiones
  'entregas_pedido',
  'entrega_archivos',
  'revision_solicitudes',
  'revision_pedidos',
  'revision_archivos',

  // 6. Comunicaciones, sesiones y auditoría
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
 * Genera sentencias SQL de restauración transaccional a partir del snapshot.
 * Usa INSERT ... ON CONFLICT DO UPDATE o REPLACE dentro de un bloque seguro.
 */
export function generateRestoreSql(snapshot, options = {}) {
  const tables = snapshot.tables || {};
  const statements = [];

  statements.push('-- RESTORE SCRIPT GENERADO POR SISTEMA PEDIDOS');
  statements.push(`-- Snapshot version: ${snapshot.metadata?.version || '1.0'}`);
  statements.push(`-- Timestamp: ${snapshot.metadata?.created_at || new Date().toISOString()}`);
  statements.push('BEGIN;');
  statements.push("SET LOCAL session_replication_role = 'replica';"); // Desactiva triggers y constraints durante la carga

  for (const table of RESTORE_ORDER) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    statements.push(`\n-- Tabla: public.${table} (${rows.length} registros)`);
    if (options.truncateBeforeInsert) {
      statements.push(`TRUNCATE TABLE public.${table} CASCADE;`);
    }

    // Insertar registros en lotes
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'boolean' || typeof v === 'number') return String(v);
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });

      const colList = cols.map(c => `"${c}"`).join(', ');
      const valList = vals.join(', ');
      statements.push(`INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;`);
    }
  }

  // Verificación de integridad referencial posterior antes de consolidar la transacción
  statements.push("\n-- Verificación de integridad referencial y coherencia de datos");
  statements.push("DO $$");
  statements.push("DECLARE");
  statements.push("  v_orphan_count integer;");
  statements.push("BEGIN");
  statements.push("  -- Verificar notas_pedido huérfanas");
  statements.push("  SELECT count(*) INTO v_orphan_count FROM public.notas_pedido n LEFT JOIN public.pedidos p ON n.pedido_id = p.id WHERE p.id IS NULL;");
  statements.push("  IF v_orphan_count > 0 THEN");
  statements.push("    RAISE EXCEPTION '[RESTORE_INTEGRITY_FAIL] Se detectaron % notas de pedido sin pedido asociado.', v_orphan_count;");
  statements.push("  END IF;");
  statements.push("END $$;");

  statements.push("\nSET LOCAL session_replication_role = 'origin';");
  statements.push('COMMIT;');
  return statements.join('\n');
}

/**
 * Procedimiento de restauración lógica y rollback.
 */
export async function runLogicalRestore(backupFilePath, options = {}) {
  console.log(`[RESTORE] Verificando integridad del archivo: ${backupFilePath}...`);
  const verification = verifyBackupFile(backupFilePath, options);
  console.log(`[RESTORE] Verificación exitosa. Tablas: ${verification.tableCount}, Total registros: ${verification.totalRecords}`);

  if (options.verifyOnly) {
    return { success: true, verified: true, verification };
  }

  const fileBytes = fs.readFileSync(backupFilePath);
  const key = resolveEncryptionKey({ ...options, autoGenerate: false });
  const snapshot = decryptBackupPackage(fileBytes, key);

  if (options.target === 'sql_file') {
    const outPath = options.outputPath || backupFilePath.replace(/\.enc$/, '.restore.sql');
    const sql = generateRestoreSql(snapshot, options);
    fs.writeFileSync(outPath, sql, 'utf8');
    console.log(`[RESTORE] Script SQL de restauración generado en: ${outPath}`);
    return { success: true, sqlPath: outPath, verification };
  }

  return { success: true, snapshot, verification };
}

// Ejecución CLI
if (process.argv[1] && process.argv[1].includes('restore-database-backup.mjs')) {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const verifyOnly = args.includes('--verify-only');
  const asSql = args.includes('--as-sql');

  if (!filePath) {
    console.error('Uso: node restore-database-backup.mjs <ruta-al-backup.enc> [--verify-only] [--as-sql]');
    process.exit(1);
  }

  runLogicalRestore(filePath, {
    verifyOnly,
    target: asSql ? 'sql_file' : undefined,
  }).catch(err => {
    console.error('[ERROR] Error en restauración:', err.message);
    process.exit(1);
  });
}
