import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  TABLES,
  OPTIONAL_PRE_MIGRATION_TABLES,
  PROD_BASELINE_LAST_MIGRATION,
  BACKUP_COVERAGE_SPEC,
  capturePedidosTitleSnapshot,
  buildSchemaSnapshot,
  fetchTableRowsPaged,
  encryptBackupData,
  decryptBackupPackage,
  verifyBackupFile,
  runLogicalBackup,
} from '../../scripts/backup-prod-database.mjs';

import {
  PROD_REF,
  TEST_REF,
  sha256Hex,
  validateEnvironmentSecrets,
  extractEdgeFunctionsCatalog,
} from '../../scripts/check-prod-environment-gate.mjs';

import {
  TEST_CONFIG,
  TEST_SUPABASE_REF,
  validateStandaloneConfig,
} from '../../scripts/postbuild-standalone.mjs';

import {
  RESTORE_ORDER,
  TABLE_PRIMARY_KEYS,
  BASELINE_FUNCTION_MIGRATIONS,
  generateRestoreSql,
  generateSchemaRollbackSql,
  runIsolatedRestoreRehearsal,
  verifyCp4PedidosTitleIntegrity,
  runLogicalRestore,
} from '../../scripts/restore-database-backup.mjs';

import {
  isMissingColumnError,
} from '../../pedidos-medios/frontend/src/services/gestionApi.ts';

describe('CAM-12 & Preflight PROD Blockers: Seguridad de Despliegue, Respaldo y Recuperación', () => {

  describe('1. backup-prod-database.mjs — Paginación, Tablas Pre-Migración y Detección de Errores (Fail-Closed)', () => {
    it('debe paginar correctamente tablas con más filas que el tamaño de página', async () => {
      let callCount = 0;
      const mockFetchFn = vi.fn().mockImplementation(async (_table: string, rangeHeader: string) => {
        callCount++;
        if (rangeHeader === '0-99') {
          const rows = Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}` }));
          return {
            ok: true,
            status: 206,
            headers: new Headers({ 'content-range': '0-99/250' }),
            json: async () => rows,
          };
        } else if (rangeHeader === '100-199') {
          const rows = Array.from({ length: 100 }, (_, i) => ({ id: `row-${100 + i}` }));
          return {
            ok: true,
            status: 206,
            headers: new Headers({ 'content-range': '100-199/250' }),
            json: async () => rows,
          };
        } else if (rangeHeader === '200-299') {
          const rows = Array.from({ length: 50 }, (_, i) => ({ id: `row-${200 + i}` }));
          return {
            ok: true,
            status: 206,
            headers: new Headers({ 'content-range': '200-249/250' }),
            json: async () => rows,
          };
        }
        return {
          ok: false,
          status: 416,
          statusText: 'Range Not Satisfiable',
          text: async () => 'Out of range',
        };
      });

      const rows = await fetchTableRowsPaged('pedidos', mockFetchFn, { pageSize: 100 });

      expect(callCount).toBe(3);
      expect(rows.length).toBe(250);
      expect(rows[0].id).toBe('row-0');
      expect(rows[249].id).toBe('row-249');
    });

    it('debe fallar cerrando el proceso (fail-closed) si la API devuelve error HTTP 401/500/503', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Database connection timeout',
      });

      await expect(
        fetchTableRowsPaged('pedidos', mockFetchFn, { pageSize: 1000 })
      ).rejects.toThrow(/status 500/);
    });

    it('debe admitir tablas aún inexistentes pre-migración (nota_pedido_historial con 404/PGRST205) pero fallar fail-closed en tablas nucleares', async () => {
      const missingRecorded: string[] = [];
      const mockFetchNotFound = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '{"code":"PGRST205","message":"Could not find the table \'public.nota_pedido_historial\' in the schema cache"}',
      });

      const optionalRows = await fetchTableRowsPaged('nota_pedido_historial', mockFetchNotFound, {
        allowMissingTable: true,
        onMissingTable: (t: string) => missingRecorded.push(t),
      });
      expect(optionalRows).toEqual([]);
      expect(missingRecorded).toEqual(['nota_pedido_historial']);

      // Una tabla nuclear como 'pedidos' o 'tableros_privados' jamás debe tolerar 404
      await expect(
        fetchTableRowsPaged('pedidos', mockFetchNotFound, { allowMissingTable: false })
      ).rejects.toThrow(/status 404/);

      // Incluso para una tabla opcional, un error 500 debe abortar fail-closed
      const mockFetch500 = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Connection reset',
      });
      await expect(
        fetchTableRowsPaged('nota_pedido_historial', mockFetch500, { allowMissingTable: true })
      ).rejects.toThrow(/status 500/);
    });

    it('debe fallar cerrando el proceso (fail-closed) si la API devuelve datos corruptos o no array', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}),
        json: async () => ({ error: 'Invalid response format' }),
      });

      await expect(
        fetchTableRowsPaged('pedidos', mockFetchFn, { pageSize: 1000 })
      ).rejects.toThrow(/se esperaba array de registros/);
    });

    it('debe detectar truncamiento prematuro de conexión y abortar fail-closed', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 206,
        headers: new Headers({ 'content-range': '0-49/200' }),
        json: async () => Array.from({ length: 50 }, (_, i) => ({ id: `row-${i}` })),
      });

      await expect(
        fetchTableRowsPaged('pedidos', mockFetchFn, { pageSize: 100 })
      ).rejects.toThrow(/Truncamiento detectado/);
    });

    it('la lista TABLES y RESTORE_ORDER deben incluir las 43 tablas del esquema public (incluidos tableros y auditoría de purga)', () => {
      expect(TABLES).toHaveLength(43);
      expect(RESTORE_ORDER).toHaveLength(43);
      expect(new Set(TABLES)).toEqual(new Set(RESTORE_ORDER));
      expect(OPTIONAL_PRE_MIGRATION_TABLES).toContain('nota_pedido_historial');

      // Tablas nucleares y de ciclo de vida
      expect(TABLES).toContain('pedidos');
      expect(TABLES).toContain('envios_formulario');
      expect(TABLES).toContain('notas_pedido');
      expect(TABLES).toContain('nota_pedido_historial');
      expect(TABLES).toContain('comunicaciones_pedido');
      expect(TABLES).toContain('solicitudes_informacion');
      expect(TABLES).toContain('solicitante_sesiones');

      // Tableros privados colaborativos (6 tablas)
      expect(TABLES).toContain('tableros_privados');
      expect(TABLES).toContain('tablero_miembros');
      expect(TABLES).toContain('tablero_columnas');
      expect(TABLES).toContain('tablero_tarjetas');
      expect(TABLES).toContain('tablero_tarjeta_checklists');
      expect(TABLES).toContain('tablero_tarjeta_comentarios');

      // Auditoría de purga administrativa (2 tablas)
      expect(TABLES).toContain('admin_purge_operations');
      expect(TABLES).toContain('admin_purge_items');

      // Claves primarias compuestas de las 4 tablas puente N:M
      expect(TABLE_PRIMARY_KEYS.archivo_pedido).toEqual(['archivo_id', 'pedido_id']);
      expect(TABLE_PRIMARY_KEYS.enlace_pedido).toEqual(['enlace_id', 'pedido_id']);
      expect(TABLE_PRIMARY_KEYS.archivo_solicitud_informacion).toEqual(['solicitud_informacion_id', 'archivo_id']);
      expect(TABLE_PRIMARY_KEYS.enlace_solicitud_informacion).toEqual(['solicitud_informacion_id', 'enlace_id']);
    });
  });

  describe('2. backup-prod-database.mjs — Cifrado AES-256-GCM, Esquema Verificable y Restauración Aislada', () => {
    const testKey = crypto.randomBytes(32);
    const sampleSnapshot = {
      metadata: {
        version: '1.2',
        project_ref: 'test_ref',
        created_at: new Date().toISOString(),
        counts: { pedidos: 2, notas_pedido: 1 },
      },
      tables: {
        pedidos: [
          { id: 'p1', pedido_visible: 'PED-2026-T120001', titulo: 'Campaña Sanitaria' },
          { id: 'p2', pedido_visible: 'PED-2026-T120002', titulo: 'Gacetilla Vial' },
        ],
        notas_pedido: [
          { id: 'n1', texto: 'Nota de coordinación', visibilidad: 'interna' },
        ],
      },
    };

    it('debe cifrar y descifrar conservando 100% de fidelidad de datos y metadatos', () => {
      const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
      expect(encryptedBuffer.length).toBeGreaterThan(64);

      const decryptedSnapshot = decryptBackupPackage(encryptedBuffer, testKey);
      expect(decryptedSnapshot.metadata.project_ref).toBe('test_ref');
      expect(decryptedSnapshot.tables.pedidos).toHaveLength(2);
      expect(decryptedSnapshot.tables.pedidos[0].titulo).toBe('Campaña Sanitaria');
      expect(decryptedSnapshot.tables.notas_pedido[0].texto).toBe('Nota de coordinación');
    });

    it('debe rechazar la desencriptación si se usa una clave distinta', () => {
      const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
      const wrongKey = crypto.randomBytes(32);

      expect(() => {
        decryptBackupPackage(encryptedBuffer, wrongKey);
      }).toThrow();
    });

    it('debe detectar alteración de un solo bit en el paquete cifrado (autenticación GCM)', () => {
      const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
      const tamperedBuffer = Buffer.from(encryptedBuffer);
      tamperedBuffer[tamperedBuffer.length - 1] ^= 0x01;

      expect(() => {
        decryptBackupPackage(tamperedBuffer, testKey);
      }).toThrow(/Unsupported state or unable to authenticate data/i);
    });

    it('debe leer y descifrar backups históricos con formato legacy (IV12 + AuthTag16 + Ciphertext)', () => {
      const rawJson = JSON.stringify(sampleSnapshot);
      const rawBytes = Buffer.from(rawJson, 'utf8');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', testKey, iv);
      const encrypted = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const legacyPackage = Buffer.concat([iv, authTag, encrypted]);

      const restored = decryptBackupPackage(legacyPackage, testKey);
      expect(restored.metadata.project_ref).toBe('test_ref');
      expect(restored.tables.pedidos).toHaveLength(2);
    });

    it('el nuevo formato generado debe incorporar cabecera mágica PED1 al inicio del binario', () => {
      const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
      expect(encryptedBuffer.subarray(0, 4).toString('utf8')).toBe('PED1');
    });

    it('debe validar checksum SHA-256 de datos y esquema con verifyBackupFile', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam12-unit-'));
      try {
        const backupPath = path.join(tempDir, 'test-backup.enc');
        const metaPath = path.join(tempDir, 'test-backup.meta.json');

        const schemaSnap = buildSchemaSnapshot();
        expect(PROD_BASELINE_LAST_MIGRATION).toBe('20261019050000_fase_4c_tableros_privados.sql');
        expect(schemaSnap.baseline_cutoff).toBe('20261019050000_fase_4c_tableros_privados.sql');
        expect(schemaSnap.total_migrations).toBe(104);
        expect(schemaSnap.baseline_migrations_count).toBe(90);
        expect(schemaSnap.candidate_migrations_count).toBe(14);
        expect(BACKUP_COVERAGE_SPEC.not_backed_up_by_script.length).toBeGreaterThanOrEqual(4);
        expect(BACKUP_COVERAGE_SPEC.rehearsal_scope_disclaimer).toContain('NO equivale ni reemplaza una prueba sobre motor PostgreSQL real');

        const fullSnap = {
          ...sampleSnapshot,
          schema: schemaSnap,
        };

        const encryptedBuffer = encryptBackupData(fullSnap, testKey);
        fs.writeFileSync(backupPath, encryptedBuffer);

        const sha256 = crypto.createHash('sha256').update(encryptedBuffer).digest('hex');
        fs.writeFileSync(
          metaPath,
          JSON.stringify({
            file: path.basename(backupPath),
            sha256,
            schema_sha256: schemaSnap.schema_sha256,
            counts: sampleSnapshot.metadata.counts,
          })
        );

        const verifyResult = verifyBackupFile(backupPath, {
          encryptionKey: testKey.toString('hex'),
          requireSchema: true,
        });
        expect(verifyResult.valid).toBe(true);
        expect(verifyResult.schemaVerified).toBe(true);
        expect(verifyResult.schemaSha256).toBe(schemaSnap.schema_sha256);
        expect(verifyResult.metadata.counts.pedidos).toBe(2);

        // Corromper el archivo .meta.json con un hash falso
        fs.writeFileSync(
          metaPath,
          JSON.stringify({
            file: path.basename(backupPath),
            sha256: 'deadbeef00000000000000000000000000000000000000000000000000000000',
            counts: sampleSnapshot.metadata.counts,
          })
        );

        expect(() => {
          verifyBackupFile(backupPath, { encryptionKey: testKey.toString('hex') });
        }).toThrow(/SHA-256 no coincide/);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('debe ejecutar backup pre-migración + restauración completa de esquema y datos en entorno SQLite aislado (runIsolatedRestoreRehearsal)', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam12-rehearsal-'));
      try {
        const mockDataset: Record<string, any[]> = {
          categorias_servicio: [{ id: 'cat-1', codigo: 'DG', nombre: 'Diseño Gráfico', activo: true }],
          tipos_servicio: [{ id: 'tipo-1', categoria_id: 'cat-1', slug: 'flyer_rrss', nombre: 'Flyer RRSS', activo: true }],
          configuracion_sistema: [{ key: 'archive_ttl_days', valor: '30' }],
          pedido_sequences: [{ anio: 2026, last_value: 15 }],
          usuarios_acceso: [{ user_id: 'u-admin', nombre: 'Admin', apellido: 'TDF', app_role: 'administrador', estado_acceso: 'aprobado' }],
          envios_formulario: [{ id: 'env-1', nombre_apellido: 'Ciudadano Ejemplo', correo: 'ciudadano@tdf.gob.ar', area_solicitante: 'Salud' }],
          pedidos: [{ id: 'ped-1', pedido_visible: 'PED-2026-0001', envio_id: 'env-1', categoria_id: 'cat-1', tipo_servicio_id: 'tipo-1', estado: 'Nuevo', titulo: 'Campaña Vacunación' }],
          archivos: [{ id: 'arch-1', nombre_original: 'bases.pdf', mime_type: 'application/pdf', size_bytes: 1024, contexto: 'solicitud', estado: 'verified' }],
          upload_reservations: [{ id: 'res-1', envio_id: 'env-1', archivo_id: 'arch-1', expected_name: 'bases.pdf', expected_size: 1024, expected_mime: 'application/pdf', state: 'completed' }],
          archivo_pedido: [{ archivo_id: 'arch-1', pedido_id: 'ped-1' }],
          enlaces_material: [{ id: 'enl-1', envio_id: 'env-1', url: 'https://gobiernotdf.gob.ar/material', descripcion: 'Carpeta' }],
          enlace_pedido: [{ enlace_id: 'enl-1', pedido_id: 'ped-1' }],
          solicitudes_informacion: [{ id: 'sol-1', pedido_id: 'ped-1', solicitada_por: 'u-admin', mensaje: 'Ampliar medidas', token_hash: 'h1', estado: 'respondida' }],
          archivo_solicitud_informacion: [{ solicitud_informacion_id: 'sol-1', archivo_id: 'arch-1' }],
          enlace_solicitud_informacion: [{ solicitud_informacion_id: 'sol-1', enlace_id: 'enl-1' }],
          notas_pedido: [{ id: 'nota-1', pedido_id: 'ped-1', autor_user_id: 'u-admin', visibilidad: 'interna', texto: 'Nota inicial' }],
          tableros_privados: [{ id: 'tab-1', titulo: 'Tablero Coordinación', color: 'azul', propietario_id: 'u-admin' }],
          tablero_columnas: [{ id: 'col-1', tablero_id: 'tab-1', nombre: 'Pendientes', orden: 0 }],
          tablero_tarjetas: [{ id: 'card-1', tablero_id: 'tab-1', columna_id: 'col-1', titulo: 'Revisar piezas', tipo_contenido: 'nota_rapida' }],
          tablero_tarjeta_checklists: [{ id: 'chk-1', tablero_id: 'tab-1', tarjeta_id: 'card-1', texto: 'Validar logo', completado: true }],
          tablero_tarjeta_comentarios: [{ id: 'com-1', tablero_id: 'tab-1', tarjeta_id: 'card-1', autor_id: 'u-admin', contenido: 'Listo' }],
          admin_purge_operations: [{ id: 'purge-op-1', idempotency_key: 'idem-1', status: 'completed', pedidos_count: 1 }],
          admin_purge_items: [{ id: 'purge-item-1', operation_id: 'purge-op-1', item_type: 'pedido', target_id: 'ped-old', status: 'deleted' }],
        };

        // Simular estado pre-migración real en PROD donde nota_pedido_historial aún no existe (404 PGRST205)
        const mockFetchPreMigration = vi.fn().mockImplementation(async (table: string) => {
          if (table === 'nota_pedido_historial') {
            return {
              ok: false,
              status: 404,
              statusText: 'Not Found',
              text: async () => '{"code":"PGRST205","message":"Could not find the table \'public.nota_pedido_historial\'"}',
            };
          }
          const rows = mockDataset[table] || [];
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0' }),
            json: async () => rows,
          };
        });

        const backupRes = await runLogicalBackup({
          projectRef: 'isolated_local_test',
          serviceKey: 'dummy-local-key',
          backupDir: tempDir,
          encryptionKey: testKey.toString('hex'),
          fetchFn: mockFetchPreMigration,
          skipRetention: true,
        });

        expect(backupRes.missingTables).toEqual(['nota_pedido_historial']);
        expect(backupRes.counts.pedidos).toBe(1);
        expect(backupRes.counts.tableros_privados).toBe(1);
        expect(backupRes.counts.admin_purge_operations).toBe(1);
        expect(backupRes.counts.nota_pedido_historial).toBe(0);

        // Ejecutar ensayo de restauración completa en motor SQLite aislado
        const rehearsal = runIsolatedRestoreRehearsal(backupRes.backupFilePath, {
          encryptionKey: testKey.toString('hex'),
          requireSchema: true,
        });

        expect(rehearsal.success).toBe(true);
        expect(rehearsal.tablesCreated).toBe(43);
        expect(rehearsal.fkViolations).toBe(0);
        expect(rehearsal.schemaVerified).toBe(true);
        expect(rehearsal.restoredCounts.pedidos).toBe(1);
        expect(rehearsal.restoredCounts.enlace_pedido).toBe(1);
        expect(rehearsal.restoredCounts.archivo_solicitud_informacion).toBe(1);
        expect(rehearsal.restoredCounts.enlace_solicitud_informacion).toBe(1);
        expect(rehearsal.restoredCounts.tablero_tarjetas).toBe(1);
        expect(rehearsal.restoredCounts.admin_purge_items).toBe(1);

        // Verificar generación del script de rollback de esquema no destructivo con los 9 archivos baseline reales
        expect(BASELINE_FUNCTION_MIGRATIONS).toHaveLength(9);
        const rollbackSql = generateSchemaRollbackSql(backupRes.snapshot);
        expect(rollbackSql).toContain('DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;');
        expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS public.cam09_require_new_pedido_title();');
        expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS public.nota_pedido_update(uuid, text);');
        expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS public.cleanup_orphaned_upload_reservations(integer, integer);');
        expect(rollbackSql).toContain('CREATE OR REPLACE FUNCTION public.submission_create_core(p_payload jsonb)');
        expect(rollbackSql).toContain('CREATE OR REPLACE FUNCTION public.pedido_create_internal(');
        expect(rollbackSql).toContain('CREATE OR REPLACE FUNCTION public.pedido_get_historial(');
        for (const migFile of BASELINE_FUNCTION_MIGRATIONS) {
          expect(rollbackSql).toContain(`-- Baseline restore from: ${migFile}`);
        }

        // Verificar protección contra exposición de PII en texto plano al restaurar
        await expect(
          runLogicalRestore(backupRes.backupFilePath, {
            encryptionKey: testKey.toString('hex'),
            target: 'sql_file',
          })
        ).rejects.toThrow(/\[PII_EXPOSURE_BLOCK\]/);
        expect(fs.existsSync(backupRes.backupFilePath.replace(/\.enc$/, '.restore.sql'))).toBe(false);

        // Verificar que target: 'schema_rollback_only' escribe únicamente DDL sin exponer datos personales
        const schemaOnlyRes = await runLogicalRestore(backupRes.backupFilePath, {
          encryptionKey: testKey.toString('hex'),
          target: 'schema_rollback_only',
        });
        expect(schemaOnlyRes.success).toBe(true);
        expect(schemaOnlyRes.sqlPath).toBeNull();
        expect(schemaOnlyRes.schemaRollbackPath).toBeTruthy();
        const ddlOnDisk = fs.readFileSync(schemaOnlyRes.schemaRollbackPath!, 'utf8');
        expect(ddlOnDisk).not.toContain('ciudadano@tdf.gob.ar');
        expect(ddlOnDisk).not.toContain('Ciudadano Ejemplo');
        expect(ddlOnDisk).toContain('DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('3. check-prod-environment-gate.mjs — Separación Estricta TEST/PROD y Digests SHA-256 de Supabase CLI', () => {
    function makeJwt(role: string, ref: string = 'uwzgyirilafgnbpmrkic'): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ role, ref, exp: 9999999999 })).toString('base64url');
      return `${header}.${payload}.signature`;
    }

    const validProd = {
      ENVIRONMENT: 'production',
      PUBLIC_APP_URL: 'https://pedidos.gobiernotdf.gob.ar',
      SUPABASE_URL: 'https://uwzgyirilafgnbpmrkic.supabase.co',
      SUPABASE_ANON_KEY: makeJwt('anon', 'uwzgyirilafgnbpmrkic'),
      SUPABASE_SERVICE_ROLE_KEY: makeJwt('service_role', 'uwzgyirilafgnbpmrkic'),
      GOOGLE_DRIVE_FOLDER_ID: 'folder-prod-123456789012345',
      DRIVE_SERVICE_ACCOUNT_JSON: '{"client_email":"prod@tdf.iam.gserviceaccount.com"}',
    };

    const validTest = {
      ENVIRONMENT: 'test',
      PUBLIC_APP_URL: 'https://test-pedidos.gobiernotdf.gob.ar',
      SUPABASE_URL: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
      SUPABASE_ANON_KEY: makeJwt('anon', 'yqfkzgqvezarzhlwiilo'),
      SUPABASE_SERVICE_ROLE_KEY: makeJwt('service_role', 'yqfkzgqvezarzhlwiilo'),
      GOOGLE_DRIVE_FOLDER_ID: 'folder-test-999999999999999',
      DRIVE_SERVICE_ACCOUNT_JSON: '{"client_email":"test@tdf.iam.gserviceaccount.com"}',
    };

    it('debe aceptar una configuración PROD y TEST completamente verificada y aislada', () => {
      const res = validateEnvironmentSecrets(validProd, validTest);
      expect(res.passed).toBe(true);
      expect(res.status).toBe('PASSED');
      expect(res.errors).toHaveLength(0);
      expect(res.unverifiable).toHaveLength(0);
    });

    it('debe interpretar correctamente los hashes SHA-256 de 64 caracteres devueltos por Supabase CLI en secret.value sin exponer secretos', () => {
      const prodCliOutput = [
        { name: 'ENVIRONMENT', value: sha256Hex('production') },
        { name: 'PUBLIC_APP_URL', value: sha256Hex('https://formulariomedios.pages.dev') },
        { name: 'SUPABASE_URL', value: sha256Hex(`https://${PROD_REF}.supabase.co`) },
        { name: 'SUPABASE_ANON_KEY', value: sha256Hex('prod-anon-jwt-token') },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', value: sha256Hex('prod-service-role-jwt-token') },
        { name: 'GOOGLE_DRIVE_ROOT_FOLDER_ID', value: sha256Hex('prod-drive-root-folder-1') },
      ];
      const testCliOutput = [
        { name: 'ENVIRONMENT', value: sha256Hex('test') },
        { name: 'PUBLIC_APP_URL', value: sha256Hex('https://test.formulariomedios.pages.dev') },
        { name: 'SUPABASE_URL', value: sha256Hex(`https://${TEST_REF}.supabase.co`) },
        { name: 'SUPABASE_ANON_KEY', value: sha256Hex('test-anon-jwt-token') },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', value: sha256Hex('test-service-role-jwt-token') },
        { name: 'GOOGLE_DRIVE_ROOT_FOLDER_ID', value: sha256Hex('test-drive-root-folder-2') },
      ];

      const res = validateEnvironmentSecrets(prodCliOutput, testCliOutput);
      expect(res.passed).toBe(true);
      expect(res.status).toBe('PASSED');
      expect(res.errors).toHaveLength(0);
      expect(res.unverifiable).toHaveLength(0);

      // Verificar que ningún mensaje exponga los hashes ni valores
      for (const check of res.checks) {
        expect(check.message).not.toContain(sha256Hex('prod-service-role-jwt-token'));
        expect(check.message).not.toContain('prod-service-role-jwt-token');
      }
    });

    it('debe rechazar hashes SHA-256 de Supabase CLI cuando ENVIRONMENT en PROD no es sha256("production") o cuando TEST tiene sha256("production")', () => {
      const badProdCli = [
        { name: 'ENVIRONMENT', value: sha256Hex('staging') },
        { name: 'PUBLIC_APP_URL', value: sha256Hex('https://formulariomedios.pages.dev') },
      ];
      const dangerousTestCli = [
        { name: 'ENVIRONMENT', value: sha256Hex('production') },
      ];

      const res = validateEnvironmentSecrets(badProdCli, dangerousTestCli);
      expect(res.passed).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.errors.some(e => e.includes("ENVIRONMENT must be set to 'production'"))).toBe(true);
      expect(res.errors.some(e => e.includes("TEST environment must NOT have ENVIRONMENT='production'"))).toBe(true);
    });

    // PRUEBAS NEGATIVAS — OBJETIVO 1
    it('PRUEBA NEGATIVA 1.1: Si los secretos vienen sin valor ni hash SHA-256 válido, NUNCA debe declarar APTO (status INSUFFICIENT_DATA)', () => {
      const cliProdSecrets = [
        { name: 'ENVIRONMENT', digest: 'sha256-prod-env' },
        { name: 'PUBLIC_APP_URL', digest: 'sha256-prod-url' },
        { name: 'SUPABASE_URL', digest: 'sha256-prod-sb' },
        { name: 'GOOGLE_DRIVE_FOLDER_ID', digest: 'sha256-prod-drive' },
      ];
      const cliTestSecrets = [
        { name: 'ENVIRONMENT', digest: 'sha256-test-env' },
        { name: 'SUPABASE_URL', digest: 'sha256-test-sb' },
        { name: 'GOOGLE_DRIVE_FOLDER_ID', digest: 'sha256-test-drive' },
      ];

      const res = validateEnvironmentSecrets(cliProdSecrets, cliTestSecrets);
      expect(res.passed).toBe(false);
      expect(res.status).toBe('INSUFFICIENT_DATA');
      expect(res.unverifiable.length).toBeGreaterThan(0);
      expect(res.unverifiable.some(u => u.includes('ENVIRONMENT'))).toBe(true);
      expect(res.unverifiable.some(u => u.includes('PUBLIC_APP_URL'))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.2: Debe rechazar PROD si ENVIRONMENT no está configurado como "production"', () => {
      const invalidProd = { ...validProd, ENVIRONMENT: 'staging' };
      const res = validateEnvironmentSecrets(invalidProd, validTest);
      expect(res.passed).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.errors.some(e => e.includes("ENVIRONMENT must be set to 'production'"))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.3: Debe rechazar TEST si ENVIRONMENT está configurado como "production" (prevención de colisión)', () => {
      const dangerousTest = { ...validTest, ENVIRONMENT: 'production' };
      const res = validateEnvironmentSecrets(validProd, dangerousTest);
      expect(res.passed).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.errors.some(e => e.includes("TEST environment must NOT have ENVIRONMENT='production'"))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.4: Debe rechazar PROD si PUBLIC_APP_URL no utiliza HTTPS o apunta a localhost/Supabase', () => {
      const httpProd = { ...validProd, PUBLIC_APP_URL: 'http://pedidos.gobiernotdf.gob.ar' };
      const resHttp = validateEnvironmentSecrets(httpProd, validTest);
      expect(resHttp.passed).toBe(false);
      expect(resHttp.errors.some(e => e.includes('must use https://'))).toBe(true);

      const localProd = { ...validProd, PUBLIC_APP_URL: 'https://localhost:3000' };
      const resLocal = validateEnvironmentSecrets(localProd, validTest);
      expect(resLocal.passed).toBe(false);
      expect(resLocal.errors.some(e => e.includes('must not point to localhost'))).toBe(true);

      const sbProd = { ...validProd, PUBLIC_APP_URL: 'https://uwzgyirilafgnbpmrkic.supabase.co' };
      const resSb = validateEnvironmentSecrets(sbProd, validTest);
      expect(resSb.passed).toBe(false);
      expect(resSb.errors.some(e => e.includes('no puede apuntar a Supabase'))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.5: Debe rechazar si la clave pública SUPABASE_ANON_KEY contiene el rol service_role o el mismo hash que SUPABASE_SERVICE_ROLE_KEY', () => {
      const leakedProd = { ...validProd, SUPABASE_ANON_KEY: makeJwt('service_role', 'uwzgyirilafgnbpmrkic') };
      const res = validateEnvironmentSecrets(leakedProd, validTest);
      expect(res.passed).toBe(false);
      expect(res.errors.some(e => e.includes('SUPABASE_ANON_KEY carries service_role'))).toBe(true);

      const collidedHashProd = [
        { name: 'ENVIRONMENT', value: sha256Hex('production') },
        { name: 'PUBLIC_APP_URL', value: sha256Hex('https://formulariomedios.pages.dev') },
        { name: 'SUPABASE_ANON_KEY', value: sha256Hex('same-secret-key') },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', value: sha256Hex('same-secret-key') },
      ];
      const resHash = validateEnvironmentSecrets(collidedHashProd, []);
      expect(resHash.passed).toBe(false);
      expect(resHash.errors.some(e => e.includes('SUPABASE_ANON_KEY carries service_role'))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.6: Debe rechazar por colisión de digest entre PROD y TEST incluso con valores ocultos', () => {
      const sameDigestProd = [
        { name: 'ENVIRONMENT', value: 'production' },
        { name: 'PUBLIC_APP_URL', value: 'https://pedidos.gobiernotdf.gob.ar' },
        { name: 'GOOGLE_DRIVE_FOLDER_ID', digest: 'sha256-shared-folder-collided' },
      ];
      const sameDigestTest = [
        { name: 'ENVIRONMENT', value: 'test' },
        { name: 'GOOGLE_DRIVE_FOLDER_ID', digest: 'sha256-shared-folder-collided' },
      ];

      const res = validateEnvironmentSecrets(sameDigestProd, sameDigestTest);
      expect(res.passed).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.errors.some(e => e.includes('colisión de almacenamiento'))).toBe(true);
    });

    it('PRUEBA NEGATIVA 1.7: allowUnverifiedPresence permite pruebas locales sin bloquearse cuando los valores no son legibles', () => {
      const cliProdSecrets = [
        { name: 'ENVIRONMENT' },
        { name: 'PUBLIC_APP_URL' },
      ];
      const cliTestSecrets = [
        { name: 'ENVIRONMENT' },
      ];

      const res = validateEnvironmentSecrets(cliProdSecrets, cliTestSecrets, { allowUnverifiedPresence: true });
      expect(res.passed).toBe(true);
      expect(res.status).toBe('PRESENCE_ONLY_UNVERIFIED');
    });
  });

  describe('4. postbuild-standalone.mjs — Control de Privilegios de Token en Build', () => {
    function makeJwt(role: string, ref: string = TEST_SUPABASE_REF): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ role, ref, exp: 9999999999 })).toString('base64url');
      return `${header}.${payload}.signature`;
    }

    it('debe permitir tokens con role "anon"', () => {
      const anonConfig = {
        ...TEST_CONFIG,
        publicAppUrl: 'https://preview-pedidos.gobiernotdf.gob.ar',
        supabaseAnonKey: makeJwt('anon', TEST_SUPABASE_REF),
      };
      expect(() => {
        validateStandaloneConfig(anonConfig, 'test');
      }).not.toThrow();
    });

    it('debe rechazar tokens con role "service_role" en standalone config para evitar fugas al bundle', () => {
      const adminConfig = {
        ...TEST_CONFIG,
        publicAppUrl: 'https://preview-pedidos.gobiernotdf.gob.ar',
        supabaseAnonKey: makeJwt('service_role', TEST_SUPABASE_REF),
      };
      expect(() => {
        validateStandaloneConfig(adminConfig, 'test');
      }).toThrow(/Prohibido usar credenciales privilegiadas/);
    });
  });

  describe('5. restore-database-backup.mjs — Generación Determinista, Integridad Referencial Universal y Manejo de Conflictos', () => {
    const sampleSnapshot = {
      metadata: {
        version: '1.2',
        project_ref: 'test_ref',
        created_at: '2026-11-05T12:00:00Z',
        counts: { categorias_servicio: 1, pedidos: 1 },
      },
      tables: {
        categorias_servicio: [
          { id: 'cat-1', codigo: 'PRENSA', nombre: 'Prensa Oficial', activo: true, created_at: '2026-01-01T00:00:00Z' },
        ],
        pedidos: [
          {
            id: 'p-1',
            pedido_visible: 'PED-2026-0001',
            titulo: 'Anuncio Gubernamental con comillas simples \' y saltos de línea',
            informacion_especifica: { formato: 'digital', prioridad: 1 },
            anio: 2026,
            numero: 1,
            categoria_id: 'cat-1',
            estado: 'Nuevo',
            origen: 'publico',
            created_at: '2026-11-05T12:00:00Z',
          },
        ],
      },
    };

    it('debe respetar el orden topológico RESTORE_ORDER para respetar dependencias de claves foráneas (incluyendo enlaces_material antes de enlace_pedido)', () => {
      const enviosIdx = RESTORE_ORDER.indexOf('envios_formulario');
      const pedidosIdx = RESTORE_ORDER.indexOf('pedidos');
      const enlacesMatIdx = RESTORE_ORDER.indexOf('enlaces_material');
      const enlacePedIdx = RESTORE_ORDER.indexOf('enlace_pedido');
      const notasIdx = RESTORE_ORDER.indexOf('notas_pedido');
      const histIdx = RESTORE_ORDER.indexOf('nota_pedido_historial');
      const commsIdx = RESTORE_ORDER.indexOf('comunicaciones_pedido');
      const tablerosIdx = RESTORE_ORDER.indexOf('tableros_privados');
      const tarjetasIdx = RESTORE_ORDER.indexOf('tablero_tarjetas');
      const purgeOpIdx = RESTORE_ORDER.indexOf('admin_purge_operations');
      const purgeItemsIdx = RESTORE_ORDER.indexOf('admin_purge_items');

      expect(enviosIdx).toBeLessThan(pedidosIdx);
      expect(enlacesMatIdx).toBeLessThan(enlacePedIdx);
      expect(pedidosIdx).toBeLessThan(notasIdx);
      expect(notasIdx).toBeLessThan(histIdx);
      expect(pedidosIdx).toBeLessThan(commsIdx);
      expect(tablerosIdx).toBeLessThan(tarjetasIdx);
      expect(purgeOpIdx).toBeLessThan(purgeItemsIdx);
    });

    it('PRUEBA NEGATIVA 2: Debe generar bloque PL/pgSQL dinámico que valida TODAS las Foreign Keys activas de la base de datos', () => {
      const sql = generateRestoreSql(sampleSnapshot);

      expect(sql).toContain("session_replication_role = 'replica';");
      expect(sql).toContain("session_replication_role = 'origin';");
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain('pg_constraint');
      expect(sql).toContain("c.contype = 'f'");
      expect(sql).toContain('[RESTORE_INTEGRITY_FAIL]');
    });

    it('PRUEBA NEGATIVA 3.1: Por defecto, la estrategia debe ser "error" (sin ON CONFLICT) para impedir sobrescrituras inadvertidas', () => {
      const sql = generateRestoreSql(sampleSnapshot);
      expect(sql).not.toContain('ON CONFLICT');
      expect(sql).toContain('INSERT INTO public.pedidos');
    });

    it('PRUEBA NEGATIVA 3.2: La estrategia "upsert" requiere decisión operativa explícita (confirmOverwrite: true)', () => {
      expect(() => {
        generateRestoreSql(sampleSnapshot, { conflictStrategy: 'upsert' });
      }).toThrow(/Requiere decisión operativa explícita/);
    });

    it('PRUEBA NEGATIVA 3.3: Con upsert y confirmOverwrite autorizados, genera ON CONFLICT ("id") DO UPDATE SET para converger al backup', () => {
      const sql = generateRestoreSql(sampleSnapshot, {
        conflictStrategy: 'upsert',
        confirmOverwrite: true,
      });

      expect(sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
      expect(sql).toContain('"titulo" = EXCLUDED."titulo"');
      expect(sql).not.toContain('ON CONFLICT DO NOTHING');
    });

    it('PRUEBA NEGATIVA 3.4: Debe soportar claves primarias compuestas (archivo_pedido, archivo_solicitud_informacion, enlace_solicitud_informacion) y claves no-id', () => {
      const compositeSnapshot = {
        metadata: { version: '1.2', project_ref: 'test_ref' },
        tables: {
          configuracion_sistema: [{ key: 'app_title', valor: 'Sistema Pedidos' }],
          archivo_pedido: [{ archivo_id: 'a1', pedido_id: 'p1', created_at: '2026-11-01T00:00:00Z' }],
          archivo_solicitud_informacion: [{ solicitud_informacion_id: 's1', archivo_id: 'a1', created_at: '2026-11-01T00:00:00Z' }],
          enlace_solicitud_informacion: [{ solicitud_informacion_id: 's1', enlace_id: 'e1', created_at: '2026-11-01T00:00:00Z' }],
          usuarios_acceso: [{ user_id: 'u1', email: 'test@tdf.gob.ar', activo: true }],
        },
      };

      const sql = generateRestoreSql(compositeSnapshot, {
        conflictStrategy: 'upsert',
        confirmOverwrite: true,
      });

      expect(sql).toContain('ON CONFLICT ("key") DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT ("archivo_id", "pedido_id") DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT ("solicitud_informacion_id", "archivo_id") DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT ("solicitud_informacion_id", "enlace_id") DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT ("user_id") DO UPDATE SET');
    });

    it('PRUEBA NEGATIVA 3.5: Solicitar "do_nothing" sin autorización explícita (allowIgnoreDuplicates) debe ser rechazado', () => {
      expect(() => {
        generateRestoreSql(sampleSnapshot, { conflictStrategy: 'do_nothing' });
      }).toThrow(/La estrategia "do_nothing" oculta divergencias de datos en silencio/);
    });

    it('PRUEBA NEGATIVA 4.1: Intentar truncar tablas sin confirmación explícita debe ser bloqueado de raíz', () => {
      expect(() => {
        generateRestoreSql(sampleSnapshot, { destructiveTruncate: true });
      }).toThrow(/Modo destructivo no autorizado/);
    });

    it('PRUEBA NEGATIVA 4.2: Intentar truncar tablas en entorno productivo debe ser bloqueado incondicionalmente (SECURITY_FATAL)', () => {
      const prodSnapshot = {
        ...sampleSnapshot,
        metadata: { ...sampleSnapshot.metadata, project_ref: 'uwzgyirilafgnbpmrkic' },
      };

      expect(() => {
        generateRestoreSql(prodSnapshot, {
          destructiveTruncate: true,
          confirmDestructiveAction: 'CONFIRM_DESTRUCTIVE_TRUNCATE_RESET',
        });
      }).toThrow(/Prohibido terminantemente ejecutar truncados destructivos en entorno productivo/);
    });
  });

  describe('6. Compatibilidad CAM-09 / Frontend-First y Catálogo Automático de 28 Edge Functions', () => {
    it('detecta errores de columnas aún no migradas (isMissingColumnError) para permitir despliegue Frontend-First', () => {
      expect(
        isMissingColumnError({ code: '42703', message: 'column pedidos.is_reabierto does not exist' }, 'is_reabierto')
      ).toBe(true);
      expect(
        isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'deleted_at' column of 'notas_pedido'" })
      ).toBe(true);
      expect(
        isMissingColumnError({ code: '42501', message: 'permission denied for table pedidos' })
      ).toBe(false);
    });

    it('verifica que submission-create mapea ERRCODE 42200 (TITLE_REQUIRED / TITLE_INVALID) a HTTP 400 sin inventar títulos ni mutar p_payload antes del fingerprint', () => {
      const submissionCreateSrc = fs.readFileSync(
        path.join(process.cwd(), 'supabase', 'functions', 'submission-create', 'index.ts'),
        'utf8'
      );
      expect(submissionCreateSrc).toContain("code === '42200'");
      expect(submissionCreateSrc).toContain("error.message.includes('TITLE_REQUIRED')");
      expect(submissionCreateSrc).toContain("error.message.includes('TITLE_INVALID')");
      expect(submissionCreateSrc).not.toContain('synthesizeLegacyInFlightTitle');
      expect(submissionCreateSrc).not.toContain('normalizeLegacyInFlightSubmissionTitles');
    });

    it('extrae automáticamente el catálogo exacto de 28 Edge Functions y valida paridad 1:1 entre supabase/config.toml y supabase/functions/*', () => {
      const catalog = extractEdgeFunctionsCatalog();
      expect(catalog.totalCount).toBe(28);
      expect(catalog.entries).toHaveLength(28);
      expect(catalog.verifyJwtTrue).toEqual(['drive-download']);
      expect(catalog.verifyJwtFalse).toHaveLength(27);

      const slugs = catalog.entries.map((e: { slug: string }) => e.slug);
      expect(slugs).toEqual([
        'submission-session-prepare',
        'drive-upload-prepare',
        'drive-upload-complete',
        'submission-create',
        'drive-download',
        'tracking-get',
        'tracking-recover',
        'info-token-validate',
        'info-response-submit',
        'tracking-exchange',
        'solicitante-access-request',
        'solicitante-session-exchange',
        'solicitante-pedidos-list',
        'solicitante-pedido-detail',
        'solicitante-info-respond',
        'solicitante-session-revoke',
        'solicitante-delivery-download',
        'solicitante-revision-request',
        'solicitante-revision-envio',
        'comunicaciones-dispatch',
        'info-request-create',
        'admin-user-delete',
        'admin-pedidos-purge',
        'delivery-upload-prepare',
        'delivery-upload-complete',
        'internal-upload-prepare',
        'internal-upload-complete',
        'drive-organization-reconcile',
      ]);
    });

    it('verifica nombres exactos, versiones y hashes SHA-256 (LF canónico) de las 14 migraciones pendientes entre la candidata y TEST 5d1be9b', () => {
      const schemaSnap = buildSchemaSnapshot();
      const pending = schemaSnap.migrations.filter(
        (m: { phase: string }) => m.phase === 'candidate_pending'
      );
      expect(pending).toHaveLength(14);
      expect(pending.map((m: { file: string; version: string; sha256: string }) => ({
        file: m.file,
        version: m.version,
        sha256: m.sha256,
      }))).toEqual([
        {
          file: '20261103193000_cam01_info_request_72h_deadline.sql',
          version: '20261103193000',
          sha256: '0117f86fa4cc5219775e95b1ecb5889fab3cea33afcafb9d994a22277adbbbf5',
        },
        {
          file: '20261104164500_cam07a_internal_solicitante_correo_required.sql',
          version: '20261104164500',
          sha256: 'f449db7f821fa6aab4f616d8b10672b9fde90c0729782817633f62ddcc59087d',
        },
        {
          file: '20261104211500_cam07b_internal_solicitante_portal.sql',
          version: '20261104211500',
          sha256: '2527a176d1c9556387cd662a014be8a7e4ca5dabf7ddd2a7752ef860759972f0',
        },
        {
          file: '20261104233000_cam07c_internal_info_72h.sql',
          version: '20261104233000',
          sha256: '279a1dc1c8384736096f3ea30e3cd01e4be99d31aa99b09b750bf3b8d1493e95',
        },
        {
          file: '20261105001000_cam07d_internal_notifications.sql',
          version: '20261105001000',
          sha256: 'de60c626ad5c7d15a84fbb0a459b705606b972c61312294d3d5916339f5076e6',
        },
        {
          file: '20261105002000_cam08_internal_notes_history.sql',
          version: '20261105002000',
          sha256: '755daaf34626026c5c6a4df07269e36e4262542bc258bdea5bd4573230f2c837',
        },
        {
          file: '20261105100000_cam09_required_pedido_title.sql',
          version: '20261105100000',
          sha256: 'ddeea67d1c5139e25a18057e71281b319ea1b1d47f01806183187b9ed10e1496',
        },
        {
          file: '20261106004000_cam01_cam07c_mandatory_responsable_for_info_request.sql',
          version: '20261106004000',
          sha256: 'ed219759838981b537ce8f548bcdde0124be4dff19a94c1fcd89bd274f61de6a',
        },
        {
          file: '20261106030000_cam02_pedidos_is_reabierto.sql',
          version: '20261106030000',
          sha256: 'b3c23f2f7601fc91a99ec24d79fd9743a4808902830b7694f2fc3f5c256bb559',
        },
        {
          file: '20261110000000_inc07_cleanup_orphaned_reservations.sql',
          version: '20261110000000',
          sha256: 'b24d84d62ee4f6621d3402b0981c4d6f22f34b7d3c057d225db3628c8f9c20f6',
        },
        {
          file: '20261110000001_inc05_mock_drive_storage_table.sql',
          version: '20261110000001',
          sha256: '5ed746bf94239432848e45d3682bee392f3994748d10e6cc2a01e190f4df8ab9',
        },
        {
          file: '20261110000002_inc02_info_responded_canonical_event.sql',
          version: '20261110000002',
          sha256: '924ad8096a116134c46b5f67853b5a9d744a32e75dc54297a81e01aaa96db60e',
        },
        {
          file: '20261110000003_inc04_inc08_title_limits_and_mp4_support.sql',
          version: '20261110000003',
          sha256: '5073e7a8a016b19a7f74e18c14c56212a380c50e2a85741e8d62c68be921e7b1',
        },
        {
          file: '20261112000004_fix_pedido_get_historial_assignment_duplicates.sql',
          version: '20261112000004',
          sha256: '01e54f3ea75a4e79a92bb07b8c4c890e0df4624931c076dfb3cb8d500be05ae2',
        },
      ]);
    });

    it('CP-1 -> CP-4: preserva títulos históricos (incluidos NULL y >50 chars), admite pedidos concurrentes entre CP-1 y la migración sin falsos errores, y exige CAM-09 (3-50 chars, sin HTML) tras activarse el trigger', () => {
      const cp1Pedidos = [
        { id: 'ped-hist-pub-1', titulo: null, created_at: '2026-10-10T12:00:00Z' },
        { id: 'ped-hist-pub-2', titulo: null, created_at: '2026-11-11T19:11:41Z' },
        { id: 'ped-hist-int-1', titulo: 'Cobertura Institucional', created_at: '2026-10-15T10:00:00Z' },
        {
          id: 'ped-hist-int-long',
          titulo: 'Título histórico interno legítimo de más de cincuenta caracteres que no debe alterarse',
          created_at: '2026-10-20T15:00:00Z',
        },
      ];

      const cp1Snapshot = capturePedidosTitleSnapshot(cp1Pedidos);
      expect(cp1Snapshot.total_count).toBe(4);
      expect(cp1Snapshot.null_title_count).toBe(2);
      expect(cp1Snapshot.non_null_title_count).toBe(2);

      const triggerActivatedAt = '2026-11-12T20:10:00Z';

      // En CP-4 existen:
      // 1) Los 4 pedidos de CP-1 intactos (incluidos NULL y >50 chars)
      // 2) 2 pedidos creados en concurrencia ENTRE CP-1 y triggerActivatedAt (uno sin título y uno con título)
      // 3) 2 pedidos nuevos creados DESPUÉS de triggerActivatedAt cumpliendo CAM-09 (3-50 chars, sin HTML)
      const postMigrationPedidos = [
        ...cp1Pedidos,
        { id: 'ped-concurrent-pre-trigger-null', titulo: null, created_at: '2026-11-12T20:05:00Z' },
        { id: 'ped-concurrent-pre-trigger-titled', titulo: 'Pedido en transición', created_at: '2026-11-12T20:09:59Z' },
        { id: 'ped-post-trigger-1', titulo: 'Campaña Vacunación 2026', created_at: '2026-11-12T20:10:01Z' },
        { id: 'ped-post-trigger-2', titulo: 'Gacetilla Oficial Vial', created_at: '2026-11-12T20:15:00Z' },
      ];

      const result = verifyCp4PedidosTitleIntegrity(cp1Snapshot, postMigrationPedidos, {
        triggerActivatedAt,
      });

      expect(result.passed).toBe(true);
      expect(result.cp1Count).toBe(4);
      expect(result.preservedHistoricalCount).toBe(4);
      expect(result.preservedNullCount).toBe(2);
      expect(result.preservedNonNullCount).toBe(2);
      expect(result.concurrentPreTriggerCount).toBe(2);
      expect(result.postTriggerValidCount).toBe(2);
      expect(result.missingHistoricalIds).toEqual([]);
      expect(result.historicalTitleMismatches).toEqual([]);
      expect(result.postTriggerInvalidPedidos).toEqual([]);

      // Falla si un pedido histórico NULL fue alterado por backfill o modificado
      expect(() => {
        verifyCp4PedidosTitleIntegrity(
          cp1Snapshot,
          [
            { id: 'ped-hist-pub-1', titulo: 'Backfill no autorizado', created_at: '2026-10-10T12:00:00Z' },
            ...cp1Pedidos.slice(1),
          ],
          { triggerActivatedAt }
        );
      }).toThrow(/\[CP4_TITLE_INTEGRITY_FAIL\]/);

      // Falla si un pedido insertado DESPUÉS de triggerActivatedAt viola CAM-09 (NULL, <3, >50 o con HTML)
      expect(() => {
        verifyCp4PedidosTitleIntegrity(
          cp1Snapshot,
          [
            ...cp1Pedidos,
            { id: 'ped-post-invalid-html', titulo: '<b>Título con HTML</b>', created_at: '2026-11-12T20:12:00Z' },
          ],
          { triggerActivatedAt }
        );
      }).toThrow(/TITLE_HTML_FORBIDDEN/);
    });
  });
});
