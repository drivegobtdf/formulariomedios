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
 * Catálogo canónico de Claves Primarias de las 35 tablas respaldadas.
 * Contempla claves simples (id u otros nombres) y claves compuestas.
 */
export const TABLE_PRIMARY_KEYS = {
  // Claves primarias compuestas
  archivo_pedido: ['archivo_id', 'pedido_id'],
  enlace_pedido: ['enlace_id', 'pedido_id'],

  // Claves primarias simples con nombres distintos de 'id'
  configuracion_sistema: ['key'],
  pedido_sequences: ['anio'],
  usuarios_acceso: ['user_id'],

  // Tablas estándar con 'id'
  categorias_servicio: ['id'],
  tipos_servicio: ['id'],
  envios_formulario: ['id'],
  pedidos: ['id'],
  archivos: ['id'],
  upload_reservations: ['id'],
  enlaces_material: ['id'],
  solicitudes_informacion: ['id'],
  notas_pedido: ['id'],
  nota_pedido_historial: ['id'],
  pedido_asignaciones: ['id'],
  entregas_pedido: ['id'],
  comunicaciones_pedido: ['id'],
  domain_events: ['id'],
  audit_log: ['id'],
  submission_sessions: ['id'],
  solicitante_sesiones: ['id'],
  solicitante_access_tokens: ['id'],
  tracking_recovery_tokens: ['id'],
  notificaciones_usuario: ['id'],
  pedido_versiones: ['id'],
  pedido_etiquetas: ['id'],
  pedido_checklist_items: ['id'],
  pedido_drive_folders: ['id'],
  entrega_archivos: ['id'],
  revision_solicitudes: ['id'],
  revision_pedidos: ['id'],
  revision_archivos: ['id'],
  archivo_solicitud_informacion: ['id'],
  enlace_solicitud_informacion: ['id'],
};

/**
 * Genera sentencias SQL de restauración transaccional a partir del snapshot.
 *
 * Estrategias de Conflicto (conflictStrategy):
 *  - 'error' (por defecto seguro): Emite INSERT simple sin ON CONFLICT. Si ya existe un registro
 *    con la misma clave, PostgreSQL aborta de forma fail-closed impidiendo cualquier sobrescritura inadvertida.
 *  - 'upsert': Actualiza los campos divergentes. REQUIERE AUTORIZACIÓN EXPLÍCITA (confirmOverwrite: true),
 *    evitando que un rollback automático sobrescriba datos más recientes sin decisión operativa consciente.
 *  - 'do_nothing': Ignora duplicados. Requiere obligatoriamente options.allowIgnoreDuplicates=true.
 *
 * Integridad Referencial Universal:
 *  - Valida dinámicamente el 100% de las Foreign Keys (simples y compuestas) del catálogo pg_constraint.
 *
 * Protección contra Modos Destructivos:
 *  - Bloqueo tajante de cualquier TRUNCATE no autorizado.
 *  - Prohibición absoluta de operaciones destructivas en entorno productivo.
 */
export function generateRestoreSql(snapshot, options = {}) {
  const tables = snapshot.tables || {};
  const statements = [];

  // 1. Guarda de Seguridad contra Acciones Destructivas no Autorizadas
  if (options.truncateBeforeInsert || options.destructiveTruncate) {
    const isProduction =
      process.env.ENVIRONMENT === 'production' ||
      snapshot.metadata?.project_ref === 'uwzgyirilafgnbpmrkic';

    if (isProduction) {
      throw new Error(
        '[SECURITY_FATAL] Prohibido terminantemente ejecutar truncados destructivos en entorno productivo.'
      );
    }

    if (options.confirmDestructiveAction !== 'CONFIRM_DESTRUCTIVE_TRUNCATE_RESET') {
      throw new Error(
        '[SECURITY_BLOCK] Modo destructivo no autorizado: se rechazó el truncado de tablas. ' +
        'Requiere confirmación explícita (confirmDestructiveAction: "CONFIRM_DESTRUCTIVE_TRUNCATE_RESET").'
      );
    }
  }

  // 2. Validación de Estrategia de Conflicto
  // POR DEFECTO SEGURO: 'error' (no sobrescribe datos inadvertidamente)
  const conflictStrategy = options.conflictStrategy || 'error';

  if (conflictStrategy === 'upsert' && !options.confirmOverwrite) {
    throw new Error(
      '[RESTORE_SAFETY_BLOCK] La estrategia "upsert" sobrescribe registros existentes en la base de datos. ' +
      'Requiere decisión operativa explícita (confirmOverwrite: true o --overwrite).'
    );
  }

  if (conflictStrategy === 'do_nothing' && !options.allowIgnoreDuplicates) {
    throw new Error(
      '[RESTORE_ERROR] La estrategia "do_nothing" oculta divergencias de datos en silencio. ' +
      'Debe autorizarse explícitamente con allowIgnoreDuplicates: true, o usar "error" / "upsert".'
    );
  }

  statements.push('-- RESTORE SCRIPT GENERADO POR SISTEMA PEDIDOS');
  statements.push(`-- Snapshot version: ${snapshot.metadata?.version || '1.1'}`);
  statements.push(`-- Timestamp: ${snapshot.metadata?.created_at || new Date().toISOString()}`);
  statements.push(`-- Conflict Strategy: ${conflictStrategy}`);
  statements.push('BEGIN;');
  statements.push("SET LOCAL session_replication_role = 'replica';"); // Desactiva temporalmente triggers durante la carga controlada

  if (options.destructiveTruncate && options.confirmDestructiveAction === 'CONFIRM_DESTRUCTIVE_TRUNCATE_RESET') {
    statements.push('\n-- TRUNCADO DESTRUCTIVO AUTORIZADO EXCLUSIVAMENTE PARA ENTORNO DESECHABLE');
    for (const table of [...RESTORE_ORDER].reverse()) {
      statements.push(`TRUNCATE TABLE public.${table} CASCADE;`);
    }
  }

  for (const table of RESTORE_ORDER) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    statements.push(`\n-- Tabla: public.${table} (${rows.length} registros)`);

    // Resolver claves primarias para la tabla
    const configuredPks = TABLE_PRIMARY_KEYS[table] || ['id'];

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

      const rowHasAllPks = configuredPks.every(pk => cols.includes(pk));

      if (conflictStrategy === 'upsert' && rowHasAllPks) {
        const pkTarget = configuredPks.map(pk => `"${pk}"`).join(', ');
        const updateCols = cols.filter(c => !configuredPks.includes(c));
        if (updateCols.length > 0) {
          const updateAssignments = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
          statements.push(
            `INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT (${pkTarget}) DO UPDATE SET ${updateAssignments};`
          );
        } else {
          statements.push(`INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT (${pkTarget}) DO NOTHING;`);
        }
      } else if (conflictStrategy === 'do_nothing') {
        const conflictTarget = rowHasAllPks ? ` (${configuredPks.map(pk => `"${pk}"`).join(', ')})` : '';
        statements.push(`INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT${conflictTarget} DO NOTHING;`);
      } else {
        // 'error' / fail-closed estricto: sin ON CONFLICT para que colisiones de PK aborten la transacción
        statements.push(`INSERT INTO public.${table} (${colList}) VALUES (${valList});`);
      }
    }
  }

  // =====================================================================
  // 3. VERIFICACIÓN EXHAUSTIVA DE INTEGRIDAD REFERENCIAL POST-RESTAURACIÓN
  // Itera sobre el 100% de las Foreign Keys (simples y compuestas) de pg_constraint
  // =====================================================================
  statements.push('\n-- Verificación exhaustiva de integridad referencial para TODAS las foreign keys (simples y compuestas) del esquema public');
  statements.push('DO $$');
  statements.push('DECLARE');
  statements.push('  r RECORD;');
  statements.push('  v_sql text;');
  statements.push('  v_orphan_count integer;');
  statements.push('  v_total_violations integer := 0;');
  statements.push('  v_error_details text := \'\';');
  statements.push('  v_join_clause text;');
  statements.push('  v_not_null_clause text;');
  statements.push('  i integer;');
  statements.push('  v_child_col text;');
  statements.push('  v_parent_col text;');
  statements.push('BEGIN');
  statements.push('  FOR r IN');
  statements.push('    SELECT');
  statements.push('      c.conname AS constraint_name,');
  statements.push('      src_tbl.relname AS child_table,');
  statements.push('      dst_tbl.relname AS parent_table,');
  statements.push('      c.conrelid,');
  statements.push('      c.confrelid,');
  statements.push('      c.conkey,');
  statements.push('      c.confkey,');
  statements.push('      array_length(c.conkey, 1) AS key_len');
  statements.push('    FROM pg_constraint c');
  statements.push('    JOIN pg_class src_tbl ON c.conrelid = src_tbl.oid');
  statements.push('    JOIN pg_namespace src_ns ON src_tbl.relnamespace = src_ns.oid');
  statements.push('    JOIN pg_class dst_tbl ON c.confrelid = dst_tbl.oid');
  statements.push('    JOIN pg_namespace dst_ns ON dst_tbl.relnamespace = dst_ns.oid');
  statements.push('    WHERE c.contype = \'f\'');
  statements.push('      AND src_ns.nspname = \'public\'');
  statements.push('      AND dst_ns.nspname = \'public\'');
  statements.push('  LOOP');
  statements.push('    v_join_clause := \'\';');
  statements.push('    v_not_null_clause := \'\';');
  statements.push('    FOR i IN 1..r.key_len LOOP');
  statements.push('      SELECT attname INTO v_child_col FROM pg_attribute WHERE attrelid = r.conrelid AND attnum = r.conkey[i];');
  statements.push('      SELECT attname INTO v_parent_col FROM pg_attribute WHERE attrelid = r.confrelid AND attnum = r.confkey[i];');
  statements.push('      IF i > 1 THEN');
  statements.push('        v_join_clause := v_join_clause || \' AND \';');
  statements.push('        v_not_null_clause := v_not_null_clause || \' AND \';');
  statements.push('      END IF;');
  statements.push('      v_join_clause := v_join_clause || format(\'parent.%I = child.%I\', v_parent_col, v_child_col);');
  statements.push('      v_not_null_clause := v_not_null_clause || format(\'child.%I IS NOT NULL\', v_child_col);');
  statements.push('    END LOOP;');
  statements.push('');
  statements.push('    v_sql := format(');
  statements.push('      \'SELECT count(*) FROM public.%I child WHERE (%s) AND NOT EXISTS (SELECT 1 FROM public.%I parent WHERE %s)\',');
  statements.push('      r.child_table, v_not_null_clause, r.parent_table, v_join_clause');
  statements.push('    );');
  statements.push('    EXECUTE v_sql INTO v_orphan_count;');
  statements.push('');
  statements.push('    IF v_orphan_count > 0 THEN');
  statements.push('      v_total_violations := v_total_violations + v_orphan_count;');
  statements.push('      v_error_details := v_error_details || format(');
  statements.push('        E\'\\n- FK [%s] (%s): %s registro(s) huerfano(s) en %s -> %s\',');
  statements.push('        r.constraint_name, v_join_clause, v_orphan_count, r.child_table, r.parent_table');
  statements.push('      );');
  statements.push('    END IF;');
  statements.push('  END LOOP;');
  statements.push('');
  statements.push('  IF v_total_violations > 0 THEN');
  statements.push('    RAISE EXCEPTION \'[RESTORE_INTEGRITY_FAIL] Se detectaron % violaciones de integridad referencial:%s\', v_total_violations, v_error_details;');
  statements.push('  END IF;');
  statements.push('END $$;');

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
  const overwrite = args.includes('--overwrite') || args.includes('--confirm-overwrite');
  const conflictStrategy = args.includes('--upsert') ? 'upsert' : args.includes('--error') ? 'error' : undefined;

  if (!filePath) {
    console.error('Uso: node restore-database-backup.mjs <ruta-al-backup.enc> [--verify-only] [--as-sql] [--upsert --confirm-overwrite]');
    process.exit(1);
  }

  runLogicalRestore(filePath, {
    verifyOnly,
    target: asSql ? 'sql_file' : undefined,
    conflictStrategy,
    confirmOverwrite: overwrite,
  }).catch(err => {
    console.error('[ERROR] Error en restauración:', err.message);
    process.exit(1);
  });
}
