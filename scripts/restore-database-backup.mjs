import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  TABLES,
  DEFAULT_PROD_REF,
  PROD_BASELINE_LAST_MIGRATION,
  capturePedidosTitleSnapshot,
  fetchTableRowsPaged,
  getServiceKey,
  resolveEncryptionKey,
  decryptBackupPackage,
  verifyBackupFile,
} from './backup-prod-database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Orden canónico topológico para restauración de las 43 tablas respetando dependencias referenciales.
 */
export const RESTORE_ORDER = [
  // 1. Catálogos y configuración independientes
  'categorias_servicio',
  'tipos_servicio',
  'configuracion_sistema',
  'pedido_sequences',
  'usuarios_acceso',

  // 2. Envíos, pedidos base, archivos y enlaces (enlaces_material antes de enlace_pedido)
  'envios_formulario',
  'pedidos',
  'archivos',
  'upload_reservations',
  'archivo_pedido',
  'enlaces_material',
  'enlace_pedido',

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
  'notificaciones_usuario',

  // 7. Tableros privados colaborativos (Fase 4C)
  'tableros_privados',
  'tablero_miembros',
  'tablero_columnas',
  'tablero_tarjetas',
  'tablero_tarjeta_checklists',
  'tablero_tarjeta_comentarios',

  // 8. Operaciones e ítems de purga administrativa (Saga durable)
  'admin_purge_operations',
  'admin_purge_items',
];

/**
 * Catálogo canónico de Claves Primarias de las 43 tablas respaldadas.
 * Contempla claves simples (id u otros nombres) y claves compuestas.
 */
export const TABLE_PRIMARY_KEYS = {
  // Claves primarias compuestas (4 tablas N:M)
  archivo_pedido: ['archivo_id', 'pedido_id'],
  enlace_pedido: ['enlace_id', 'pedido_id'],
  archivo_solicitud_informacion: ['solicitud_informacion_id', 'archivo_id'],
  enlace_solicitud_informacion: ['solicitud_informacion_id', 'enlace_id'],

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
  tableros_privados: ['id'],
  tablero_miembros: ['id'],
  tablero_columnas: ['id'],
  tablero_tarjetas: ['id'],
  tablero_tarjeta_checklists: ['id'],
  tablero_tarjeta_comentarios: ['id'],
  admin_purge_operations: ['id'],
  admin_purge_items: ['id'],
};

/**
 * Relaciones de clave foránea entre tablas del esquema public para validación
 * topológica y pruebas de restauración en entorno aislado.
 */
export const TABLE_FOREIGN_KEYS = [
  { childTable: 'tipos_servicio', childCol: 'categoria_id', parentTable: 'categorias_servicio', parentCol: 'id' },
  { childTable: 'pedidos', childCol: 'envio_id', parentTable: 'envios_formulario', parentCol: 'id' },
  { childTable: 'pedidos', childCol: 'categoria_id', parentTable: 'categorias_servicio', parentCol: 'id' },
  { childTable: 'pedidos', childCol: 'tipo_servicio_id', parentTable: 'tipos_servicio', parentCol: 'id' },
  { childTable: 'upload_reservations', childCol: 'envio_id', parentTable: 'envios_formulario', parentCol: 'id' },
  { childTable: 'upload_reservations', childCol: 'archivo_id', parentTable: 'archivos', parentCol: 'id' },
  { childTable: 'archivo_pedido', childCol: 'archivo_id', parentTable: 'archivos', parentCol: 'id' },
  { childTable: 'archivo_pedido', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'enlaces_material', childCol: 'envio_id', parentTable: 'envios_formulario', parentCol: 'id' },
  { childTable: 'enlace_pedido', childCol: 'enlace_id', parentTable: 'enlaces_material', parentCol: 'id' },
  { childTable: 'enlace_pedido', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'solicitudes_informacion', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'archivo_solicitud_informacion', childCol: 'solicitud_informacion_id', parentTable: 'solicitudes_informacion', parentCol: 'id' },
  { childTable: 'archivo_solicitud_informacion', childCol: 'archivo_id', parentTable: 'archivos', parentCol: 'id' },
  { childTable: 'enlace_solicitud_informacion', childCol: 'solicitud_informacion_id', parentTable: 'solicitudes_informacion', parentCol: 'id' },
  { childTable: 'enlace_solicitud_informacion', childCol: 'enlace_id', parentTable: 'enlaces_material', parentCol: 'id' },
  { childTable: 'notas_pedido', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'nota_pedido_historial', childCol: 'nota_id', parentTable: 'notas_pedido', parentCol: 'id' },
  { childTable: 'nota_pedido_historial', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'pedido_asignaciones', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'pedido_drive_folders', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'pedido_versiones', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'pedido_etiquetas', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'pedido_checklist_items', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'entregas_pedido', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'entrega_archivos', childCol: 'entrega_id', parentTable: 'entregas_pedido', parentCol: 'id' },
  { childTable: 'entrega_archivos', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'revision_solicitudes', childCol: 'envio_id', parentTable: 'envios_formulario', parentCol: 'id' },
  { childTable: 'revision_pedidos', childCol: 'revision_id', parentTable: 'revision_solicitudes', parentCol: 'id' },
  { childTable: 'revision_pedidos', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'revision_archivos', childCol: 'revision_pedido_id', parentTable: 'revision_pedidos', parentCol: 'id' },
  { childTable: 'comunicaciones_pedido', childCol: 'pedido_id', parentTable: 'pedidos', parentCol: 'id' },
  { childTable: 'tablero_miembros', childCol: 'tablero_id', parentTable: 'tableros_privados', parentCol: 'id' },
  { childTable: 'tablero_columnas', childCol: 'tablero_id', parentTable: 'tableros_privados', parentCol: 'id' },
  { childTable: 'tablero_tarjetas', childCol: 'tablero_id', parentTable: 'tableros_privados', parentCol: 'id' },
  { childTable: 'tablero_tarjetas', childCol: 'columna_id', parentTable: 'tablero_columnas', parentCol: 'id' },
  { childTable: 'tablero_tarjeta_checklists', childCol: 'tablero_id', parentTable: 'tableros_privados', parentCol: 'id' },
  { childTable: 'tablero_tarjeta_checklists', childCol: 'tarjeta_id', parentTable: 'tablero_tarjetas', parentCol: 'id' },
  { childTable: 'tablero_tarjeta_comentarios', childCol: 'tablero_id', parentTable: 'tableros_privados', parentCol: 'id' },
  { childTable: 'tablero_tarjeta_comentarios', childCol: 'tarjeta_id', parentTable: 'tablero_tarjetas', parentCol: 'id' },
  { childTable: 'admin_purge_items', childCol: 'operation_id', parentTable: 'admin_purge_operations', parentCol: 'id' },
];

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
  statements.push(`-- Snapshot version: ${snapshot.metadata?.version || '1.2'}`);
  statements.push(`-- Timestamp: ${snapshot.metadata?.created_at || new Date().toISOString()}`);
  statements.push(`-- Schema SHA-256: ${snapshot.schema?.schema_sha256 || snapshot.metadata?.schema_sha256 || 'N/A'}`);
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
  statements.push("  v_error_details text := '';");
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
  statements.push("    WHERE c.contype = 'f'");
  statements.push("      AND src_ns.nspname = 'public'");
  statements.push("      AND dst_ns.nspname = 'public'");
  statements.push('  LOOP');
  statements.push("    v_join_clause := '';");
  statements.push("    v_not_null_clause := '';");
  statements.push('    FOR i IN 1..r.key_len LOOP');
  statements.push('      SELECT attname INTO v_child_col FROM pg_attribute WHERE attrelid = r.conrelid AND attnum = r.conkey[i];');
  statements.push('      SELECT attname INTO v_parent_col FROM pg_attribute WHERE attrelid = r.confrelid AND attnum = r.confkey[i];');
  statements.push('      IF i > 1 THEN');
  statements.push("        v_join_clause := v_join_clause || ' AND ';");
  statements.push("        v_not_null_clause := v_not_null_clause || ' AND ';");
  statements.push('      END IF;');
  statements.push("      v_join_clause := v_join_clause || format('parent.%I = child.%I', v_parent_col, v_child_col);");
  statements.push("      v_not_null_clause := v_not_null_clause || format('child.%I IS NOT NULL', v_child_col);");
  statements.push('    END LOOP;');
  statements.push('');
  statements.push('    v_sql := format(');
  statements.push("      'SELECT count(*) FROM public.%I child WHERE (%s) AND NOT EXISTS (SELECT 1 FROM public.%I parent WHERE %s)',");
  statements.push('      r.child_table, v_not_null_clause, r.parent_table, v_join_clause');
  statements.push('    );');
  statements.push('    EXECUTE v_sql INTO v_orphan_count;');
  statements.push('');
  statements.push('    IF v_orphan_count > 0 THEN');
  statements.push('      v_total_violations := v_total_violations + v_orphan_count;');
  statements.push('      v_error_details := v_error_details || format(');
  statements.push("        E'\\n- FK [%s] (%s): %s registro(s) huerfano(s) en %s -> %s',");
  statements.push('        r.constraint_name, v_join_clause, v_orphan_count, r.child_table, r.parent_table');
  statements.push('      );');
  statements.push('    END IF;');
  statements.push('  END LOOP;');
  statements.push('');
  statements.push('  IF v_total_violations > 0 THEN');
  statements.push("    RAISE EXCEPTION '[RESTORE_INTEGRITY_FAIL] Se detectaron % violaciones de integridad referencial:%s', v_total_violations, v_error_details;");
  statements.push('  END IF;');
  statements.push('END $$;');

  statements.push("\nSET LOCAL session_replication_role = 'origin';");
  statements.push('COMMIT;');
  return statements.join('\n');
}

/**
 * Archivos de migración de la línea base productiva (<= 20261019050000_fase_4c_tableros_privados.sql)
 * que contienen la última definición aplicada en PROD para las 15 funciones preexistentes
 * modificadas por el lote de 14 migraciones candidatas `202611*`:
 *  1. 20260912000023 -> public.pedido_get_historial
 *  2. 20260913000030 -> public.solicitante_request_access
 *  3. 20260916000036 -> public.info_request_create, public.comunicacion_enqueue_info_requested
 *  4. 20260928000058 -> public.submission_create_core
 *  5. 20261010000075 -> public.info_response_submit_core, public.solicitante_submit_info_response, public.comunicacion_enqueue_info_responded
 *  6. 20261010190009 -> public.solicitante_get_pedidos
 *  7. 20261011001906 -> public.pedido_create_internal
 *  8. 20261011014123 -> public.info_request_create_atomic
 *  9. 20261019030000 -> public.pedido_finalize, public.solicitante_get_pedido_detail, public.comunicacion_enqueue_lifecycle, public.trg_domain_event_auto_enqueue
 */
export const BASELINE_FUNCTION_MIGRATIONS = [
  '20260912000023_f7_f8_recovery_exchange_and_f9_guard.sql',
  '20260913000030_f10_hardened_concurrency_state_machine_and_durable_magic_link.sql',
  '20260916000036_f10_atomic_info_request_with_envelope.sql',
  '20260928000058_fix_submission_create_core_limits.sql',
  '20261010000075_fase_a_operativas_y_estabilizacion.sql',
  '20261010190009_fase_b3_internal_requests.sql',
  '20261011001906_fase_b3_internal_numbering_visual_close.sql',
  '20261011014123_hotfix_comunicaciones_outbox_state_change.sql',
  '20261019030000_fase_4a_reopen_and_versions.sql',
];

/**
 * Genera el script SQL transaccional de Rollback de Esquema no destructivo para revertir
 * triggers, constraints y funciones RPC al estado exacto de la línea base productiva
 * (<= 20261019050000_fase_4c_tableros_privados.sql), conservando intactas todas las columnas y tablas aditivas.
 */
export function generateSchemaRollbackSql(snapshot = {}, options = {}) {
  const migrationsDir = options.migrationsDir || path.resolve(__dirname, '..', 'supabase', 'migrations');
  const baselineCutoff = snapshot?.schema?.baseline_cutoff || PROD_BASELINE_LAST_MIGRATION;

  const lines = [
    '-- =============================================================================',
    '-- SCHEMA ROLLBACK SCRIPT (NO DESTRUCTIVO DE DATOS) - SISTEMA PEDIDOS',
    `-- Baseline Cutoff: ${baselineCutoff}`,
    `-- Schema Manifest SHA-256: ${snapshot?.schema?.schema_sha256 || 'N/A'}`,
    '-- =============================================================================',
    'BEGIN;',
    '',
    '-- 1. Desactivar triggers, constraints y funciones nuevas introducidos en lote 202611*',
    ...(snapshot?.schema?.rollback_ddl || [
      'DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;',
      'DROP TRIGGER IF EXISTS trg_domain_events_sync_reabierto ON public.domain_events;',
      'DROP TRIGGER IF EXISTS trg_pedidos_protect_reabierto ON public.pedidos;',
      'ALTER TABLE public.envios_formulario DROP CONSTRAINT IF EXISTS chk_envios_interno_correo_requerido;',
      'DROP FUNCTION IF EXISTS public.cam09_require_new_pedido_title();',
      'DROP FUNCTION IF EXISTS public.trg_domain_events_sync_is_reabierto();',
      'DROP FUNCTION IF EXISTS public.trg_pedidos_protect_is_reabierto();',
      'DROP FUNCTION IF EXISTS public.nota_pedido_update(uuid, text);',
      'DROP FUNCTION IF EXISTS public.nota_pedido_delete(uuid);',
      'DROP FUNCTION IF EXISTS public.solicitante_get_internal_pedido_detail(uuid);',
      'DROP FUNCTION IF EXISTS public.comunicacion_enqueue_internal_created(uuid, jsonb);',
      'DROP FUNCTION IF EXISTS public.cleanup_orphaned_upload_reservations(integer, integer);',
    ]),
    '',
  ];

  // 2. Restaurar las últimas definiciones baseline de las 15 funciones preexistentes previas a 202611*
  for (const migFile of BASELINE_FUNCTION_MIGRATIONS) {
    const fullPath = path.join(migrationsDir, migFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[SCHEMA_ROLLBACK_ERROR] Archivo de migración baseline ausente en disco: ${fullPath}`);
    }
    lines.push(`-- Baseline restore from: ${migFile}`);
    lines.push(fs.readFileSync(fullPath, 'utf8').trim());
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

/**
 * Ejecuta una prueba integral de restauración de Esquema + Datos en una base de datos
 * SQLite local 100% aislada (`node:sqlite` DatabaseSync), sin tocar jamás PROD ni TEST.
 * Verifica:
 *  1. Integridad criptográfica del archivo `.enc` y `.meta.json` (datos + esquema).
 *  2. Creación de las 43 tablas con sus Claves Primarias (simples y compuestas) y Foreign Keys.
 *  3. Inserción transaccional respetando `RESTORE_ORDER`.
 *  4. Ausencia total de violaciones de integridad referencial (`PRAGMA foreign_key_check`).
 *  5. Convergencia idempotente en modo `upsert` (`ON CONFLICT (...) DO UPDATE SET`).
 */
export function runIsolatedRestoreRehearsal(backupFilePath, options = {}) {
  const verification = verifyBackupFile(backupFilePath, { ...options, requireSchema: options.requireSchema !== false });
  const fileBytes = fs.readFileSync(backupFilePath);
  const key = resolveEncryptionKey({ ...options, autoGenerate: false });
  const snapshot = decryptBackupPackage(fileBytes, key);

  const dbPath = options.sqlitePath || ':memory:';
  const db = new DatabaseSync(dbPath);

  try {
    db.exec('PRAGMA foreign_keys = ON;');

    // 1. Construir esquema relacional aislado para las 43 tablas con sus PKs y FKs
    for (const table of RESTORE_ORDER) {
      const pks = TABLE_PRIMARY_KEYS[table] || ['id'];
      const rows = snapshot.tables[table] || [];
      const fks = TABLE_FOREIGN_KEYS.filter(fk => fk.childTable === table);

      const colSet = new Set(pks);
      for (const fk of fks) colSet.add(fk.childCol);
      for (const row of rows) {
        for (const col of Object.keys(row)) colSet.add(col);
      }

      const colDefs = Array.from(colSet).map(col => `"${col}" TEXT`);
      const pkDef = `PRIMARY KEY (${pks.map(pk => `"${pk}"`).join(', ')})`;
      const fkDefs = fks.map(
        fk => `FOREIGN KEY ("${fk.childCol}") REFERENCES "${fk.parentTable}"("${fk.parentCol}")`
      );

      const createSql = `CREATE TABLE "${table}" (${[...colDefs, pkDef, ...fkDefs].join(', ')});`;
      db.exec(createSql);
    }

    // 2. Ejecutar carga transaccional inicial (estrategia 'error' por defecto)
    db.exec('BEGIN TRANSACTION;');
    let insertedRows = 0;

    for (const table of RESTORE_ORDER) {
      const rows = snapshot.tables[table] || [];
      if (rows.length === 0) continue;

      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const stmt = db.prepare(
          `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
        );
        const values = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return null;
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        });
        stmt.run(...values);
        insertedRows++;
      }
    }
    db.exec('COMMIT;');

    // 3. Verificar integridad referencial universal en la base aislada
    const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkViolations.length > 0) {
      throw new Error(
        `[ISOLATED_RESTORE_FK_FAIL] Violaciones de FK detectadas en restauración aislada: ${JSON.stringify(fkViolations)}`
      );
    }

    // 4. Probar convergencia UPSERT (confirmOverwrite: true) sobre la base ya poblada
    db.exec('BEGIN TRANSACTION;');
    for (const table of RESTORE_ORDER) {
      const rows = snapshot.tables[table] || [];
      if (rows.length === 0) continue;
      const pks = TABLE_PRIMARY_KEYS[table] || ['id'];

      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const pkTarget = pks.map(pk => `"${pk}"`).join(', ');
        const updateCols = cols.filter(c => !pks.includes(c));
        const conflictClause = updateCols.length > 0
          ? `ON CONFLICT (${pkTarget}) DO UPDATE SET ${updateCols.map(c => `"${c}" = excluded."${c}"`).join(', ')}`
          : `ON CONFLICT (${pkTarget}) DO NOTHING`;

        const stmt = db.prepare(
          `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) ${conflictClause}`
        );
        const values = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return null;
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        });
        stmt.run(...values);
      }
    }
    db.exec('COMMIT;');

    // 5. Verificar conteo exacto tabla por tabla tras restauración e idempotencia upsert
    const restoredCounts = {};
    for (const table of RESTORE_ORDER) {
      const row = db.prepare(`SELECT count(*) AS cnt FROM "${table}"`).get();
      const actualCount = Number(row.cnt);
      const expectedCount = snapshot.metadata.counts[table] ?? 0;
      if (actualCount !== expectedCount) {
        throw new Error(
          `[ISOLATED_RESTORE_COUNT_MISMATCH] Tabla ${table}: esperado=${expectedCount}, restaurado=${actualCount}`
        );
      }
      restoredCounts[table] = actualCount;
    }

    return {
      success: true,
      isolatedEngine: 'node:sqlite (DatabaseSync - structural/topological rehearsal only)',
      engineLimitation:
        'Ensayo estructural/topológico en SQLite en memoria; NO reemplaza validación de motor PostgreSQL (PL/pgSQL, triggers, RLS, tipos nativos).',
      tablesCreated: RESTORE_ORDER.length,
      insertedRows,
      fkViolations: 0,
      schemaVerified: verification.schemaVerified,
      schemaSha256: verification.schemaSha256,
      restoredCounts,
    };
  } finally {
    db.close();
  }
}

/**
 * Verifica en CP-4 la preservación exacta de los títulos históricos capturados en CP-1 y
 * valida CAM-09 (3–50 caracteres, sin HTML) exclusivamente para los pedidos insertados
 * después de activarse el trigger (`triggerActivatedAt`), permitiendo sin falsos errores
 * pedidos creados en concurrencia entre CP-1 y la aplicación de las migraciones.
 *
 * Cohorte 1 (IDs presentes en CP-1):
 *   - Deben existir todos en CP-4 (`missingHistoricalIds = []`).
 *   - Deben conservar exactamente su valor `titulo` original de CP-1 (`null === null` o mismo string,
 *     incluidos títulos históricos > 50 caracteres), sin backfill ni alteración.
 * Cohorte 2 (IDs nuevos no presentes en CP-1 con `created_at < triggerActivatedAt`):
 *   - Creados en concurrencia entre CP-1 y la activación del trigger; se admiten con o sin título
 *     sin provocar falsos errores.
 * Cohorte 3 (IDs nuevos no presentes en CP-1 con `created_at >= triggerActivatedAt`):
 *   - Insertados tras activarse `trg_cam09_require_new_pedido_title`; deben tener `titulo` de 3 a 50
 *     caracteres y sin etiquetas HTML (`<[^>]*>`).
 */
export function verifyCp4PedidosTitleIntegrity(cp1Input, postMigrationPedidos = [], options = {}) {
  let cp1Records = [];
  if (Array.isArray(cp1Input)) {
    cp1Records = capturePedidosTitleSnapshot(cp1Input).records;
  } else if (cp1Input?.metadata?.cp1_pedidos_titles?.records) {
    cp1Records = cp1Input.metadata.cp1_pedidos_titles.records;
  } else if (Array.isArray(cp1Input?.tables?.pedidos)) {
    cp1Records = capturePedidosTitleSnapshot(cp1Input.tables.pedidos).records;
  } else if (Array.isArray(cp1Input?.records)) {
    cp1Records = cp1Input.records;
  } else {
    throw new Error('[CP4_VERIFY_ERROR] Entrada CP-1 inválida: no contiene fotografía de pedidos.');
  }

  const triggerActivatedMs = options.triggerActivatedAt
    ? Date.parse(String(options.triggerActivatedAt))
    : null;
  if (options.triggerActivatedAt && Number.isNaN(triggerActivatedMs)) {
    throw new Error(`[CP4_VERIFY_ERROR] Timestamp triggerActivatedAt inválido: ${options.triggerActivatedAt}`);
  }

  const cp1Map = new Map();
  for (const item of cp1Records) {
    cp1Map.set(String(item.id), {
      id: String(item.id),
      titulo: item.titulo === undefined || item.titulo === null ? null : String(item.titulo),
      created_at: item.created_at ? String(item.created_at) : null,
    });
  }

  const postMap = new Map();
  for (const row of Array.isArray(postMigrationPedidos) ? postMigrationPedidos : []) {
    if (!row || row.id === undefined || row.id === null) continue;
    postMap.set(String(row.id), {
      id: String(row.id),
      titulo: row.titulo === undefined || row.titulo === null ? null : String(row.titulo),
      created_at: row.created_at ? String(row.created_at) : null,
    });
  }

  const missingHistoricalIds = [];
  const historicalTitleMismatches = [];
  let preservedHistoricalCount = 0;
  let preservedNullCount = 0;
  let preservedNonNullCount = 0;

  // 1. Verificar que todos los pedidos de CP-1 sigan existiendo y conserven su `titulo` exacto (incluido null)
  for (const [id, cp1Row] of cp1Map.entries()) {
    const postRow = postMap.get(id);
    if (!postRow) {
      missingHistoricalIds.push(id);
      continue;
    }
    if (postRow.titulo !== cp1Row.titulo) {
      historicalTitleMismatches.push({
        id,
        expectedTitulo: cp1Row.titulo,
        actualTitulo: postRow.titulo,
      });
      continue;
    }
    preservedHistoricalCount++;
    if (cp1Row.titulo === null) {
      preservedNullCount++;
    } else {
      preservedNonNullCount++;
    }
  }

  const concurrentPreTriggerIds = [];
  const postTriggerValidIds = [];
  const postTriggerInvalidPedidos = [];

  // 2. Evaluar pedidos nuevos (no presentes en CP-1) distinguiendo entre pre-trigger y post-trigger
  for (const [id, postRow] of postMap.entries()) {
    if (cp1Map.has(id)) continue;

    const createdMs = postRow.created_at ? Date.parse(postRow.created_at) : NaN;
    const isPostTrigger =
      triggerActivatedMs !== null &&
      !Number.isNaN(createdMs) &&
      createdMs >= triggerActivatedMs;

    if (!isPostTrigger) {
      // Creado entre CP-1 y la activación del trigger en CP-4: permitido sin provocar falsos errores
      concurrentPreTriggerIds.push(id);
      continue;
    }

    // Creado después de activarse trg_cam09_require_new_pedido_title: debe cumplir CAM-09 / INC-04 (3..50 chars, sin HTML)
    const rawTitle = postRow.titulo;
    const trimmed = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const hasHtml = /<[^>]*>/.test(trimmed);
    if (rawTitle === null || trimmed.length < 3 || trimmed.length > 50 || hasHtml) {
      postTriggerInvalidPedidos.push({
        id,
        titulo: rawTitle,
        created_at: postRow.created_at,
        reason: rawTitle === null || trimmed.length === 0
          ? 'TITLE_REQUIRED'
          : hasHtml
            ? 'TITLE_HTML_FORBIDDEN'
            : 'TITLE_LENGTH_OUT_OF_RANGE',
      });
    } else {
      postTriggerValidIds.push(id);
    }
  }

  const passed =
    missingHistoricalIds.length === 0 &&
    historicalTitleMismatches.length === 0 &&
    postTriggerInvalidPedidos.length === 0;

  if (!passed && options.throwOnError !== false) {
    throw new Error(
      `[CP4_TITLE_INTEGRITY_FAIL] Falló verificación CP-4 de títulos: ` +
      `missingHistoricalIds=${JSON.stringify(missingHistoricalIds)}, ` +
      `historicalTitleMismatches=${JSON.stringify(historicalTitleMismatches)}, ` +
      `postTriggerInvalidPedidos=${JSON.stringify(postTriggerInvalidPedidos)}`
    );
  }

  return {
    passed,
    cp1Count: cp1Map.size,
    postTotalCount: postMap.size,
    preservedHistoricalCount,
    preservedNullCount,
    preservedNonNullCount,
    concurrentPreTriggerCount: concurrentPreTriggerIds.length,
    concurrentPreTriggerIds,
    postTriggerValidCount: postTriggerValidIds.length,
    postTriggerValidIds,
    missingHistoricalIds,
    historicalTitleMismatches,
    postTriggerInvalidPedidos,
  };
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

  if (options.target === 'isolated_rehearsal') {
    const rehearsal = runIsolatedRestoreRehearsal(backupFilePath, options);
    return { success: true, rehearsal, verification };
  }

  const fileBytes = fs.readFileSync(backupFilePath);
  const key = resolveEncryptionKey({ ...options, autoGenerate: false });
  const snapshot = decryptBackupPackage(fileBytes, key);

  if (options.target === 'schema_rollback_only') {
    const schemaRollbackPath = options.outputPath || backupFilePath.replace(/\.enc$/, '.schema-rollback.sql');
    const rollbackSql = generateSchemaRollbackSql(snapshot, options);
    fs.writeFileSync(schemaRollbackPath, rollbackSql, { mode: 0o600, encoding: 'utf8' });
    console.log(`[RESTORE] Script SQL de rollback de esquema (solo DDL, 0% PII) generado en: ${schemaRollbackPath}`);
    return { success: true, sqlPath: null, schemaRollbackPath, verification };
  }

  if (options.target === 'verify_cp4_titles') {
    let postPedidos = options.postMigrationPedidos;
    if (!Array.isArray(postPedidos)) {
      const projectRef = options.projectRef || snapshot?.metadata?.project_ref || DEFAULT_PROD_REF;
      const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || (`https://${projectRef}.supabase.co`);
      const serviceKey = options.serviceKey || getServiceKey(projectRef);
      const fetchFn = options.fetchFn || (async (table, rangeHeader) => {
        return fetch(`${supabaseUrl}/rest/v1/${table}?select=id,titulo,created_at`, {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Range: rangeHeader,
            Prefer: 'count=exact',
          },
        });
      });
      postPedidos = await fetchTableRowsPaged('pedidos', fetchFn, { pageSize: 1000 });
    }
    const cp4Result = verifyCp4PedidosTitleIntegrity(snapshot, postPedidos, {
      triggerActivatedAt: options.triggerActivatedAt,
      throwOnError: options.throwOnError,
    });
    console.log(
      `[CP-4] Verificación de títulos superada: CP-1=${cp4Result.cp1Count} ` +
      `(NULL=${cp4Result.preservedNullCount}, con título=${cp4Result.preservedNonNullCount}), ` +
      `concurrentes pre-trigger=${cp4Result.concurrentPreTriggerCount}, ` +
      `nuevos post-trigger validados CAM-09=${cp4Result.postTriggerValidCount}.`
    );
    return { success: true, cp4Result, verification };
  }

  if (options.target === 'sql_file') {
    if (options.allowPlaintextPiiExport !== true) {
      throw new Error(
        '[PII_EXPOSURE_BLOCK] Prohibido escribir SQL de restauración de datos en texto plano en disco sin autorización explícita ' +
        '(allowPlaintextPiiExport: true o --allow-plaintext-pii-export), para evitar exposición de datos personales productivos. ' +
        'Para preparar el rollback de esquema sin exponer datos, utilice target: "schema_rollback_only" (--schema-rollback-only).'
      );
    }

    const outPath = options.outputPath || backupFilePath.replace(/\.enc$/, '.restore.sql');
    const sql = generateRestoreSql(snapshot, options);
    fs.writeFileSync(outPath, sql, { mode: 0o600, encoding: 'utf8' });
    console.log(`[RESTORE] Script SQL de restauración generado (modo restringido 0600) en: ${outPath}`);

    let schemaRollbackPath = null;
    if (options.includeSchemaRollback) {
      schemaRollbackPath = outPath.replace(/\.restore\.sql$/, '.schema-rollback.sql');
      const rollbackSql = generateSchemaRollbackSql(snapshot, options);
      fs.writeFileSync(schemaRollbackPath, rollbackSql, { mode: 0o600, encoding: 'utf8' });
      console.log(`[RESTORE] Script SQL de rollback de esquema generado en: ${schemaRollbackPath}`);
    }

    return { success: true, sqlPath: outPath, schemaRollbackPath, verification };
  }

  return { success: true, snapshot, verification };
}

// Ejecución CLI
if (process.argv[1] && process.argv[1].includes('restore-database-backup.mjs')) {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const verifyOnly = args.includes('--verify-only');
  const asSql = args.includes('--as-sql');
  const schemaRollbackOnly = args.includes('--schema-rollback-only');
  const verifyCp4Titles = args.includes('--verify-cp4-titles');
  const triggerAtIdx = args.indexOf('--trigger-activated-at');
  const triggerActivatedAt = triggerAtIdx !== -1 && args[triggerAtIdx + 1] ? args[triggerAtIdx + 1] : undefined;
  const includeSchemaRollback = args.includes('--include-schema-rollback');
  const allowPlaintextPiiExport = args.includes('--allow-plaintext-pii-export');
  const isolatedRehearsal = args.includes('--isolated-rehearsal');
  const overwrite = args.includes('--overwrite') || args.includes('--confirm-overwrite');
  const conflictStrategy = args.includes('--upsert') ? 'upsert' : args.includes('--error') ? 'error' : undefined;

  if (!filePath) {
    console.error(
      'Uso: node restore-database-backup.mjs <ruta-al-backup.enc> [--verify-only] [--isolated-rehearsal] [--schema-rollback-only] [--verify-cp4-titles --trigger-activated-at <ISO>] [--as-sql --allow-plaintext-pii-export] [--include-schema-rollback] [--upsert --confirm-overwrite]'
    );
    process.exit(1);
  }

  runLogicalRestore(filePath, {
    verifyOnly,
    target: isolatedRehearsal
      ? 'isolated_rehearsal'
      : schemaRollbackOnly
        ? 'schema_rollback_only'
        : verifyCp4Titles
          ? 'verify_cp4_titles'
          : asSql
            ? 'sql_file'
            : undefined,
    triggerActivatedAt,
    includeSchemaRollback,
    allowPlaintextPiiExport,
    conflictStrategy,
    confirmOverwrite: overwrite,
  }).catch(err => {
    console.error('[ERROR] Error en restauración:', err.message);
    process.exit(1);
  });
}
