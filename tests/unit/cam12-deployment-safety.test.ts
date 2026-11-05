import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  TABLES,
  fetchTableRowsPaged,
  encryptBackupData,
  decryptBackupPackage,
  verifyBackupFile,
} from '../../scripts/backup-prod-database.mjs';

import {
  validateEnvironmentSecrets,
} from '../../scripts/check-prod-environment-gate.mjs';

import {
  TEST_CONFIG,
  TEST_SUPABASE_REF,
  validateStandaloneConfig,
} from '../../scripts/postbuild-standalone.mjs';

import {
  RESTORE_ORDER,
  generateRestoreSql,
} from '../../scripts/restore-database-backup.mjs';

describe('CAM-12: Seguridad de Despliegue y Recuperación', () => {

  describe('1. backup-prod-database.mjs — Paginación y Detección de Errores (Fail-Closed)', () => {
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
      // El servidor anunció 200 filas en el Content-Range, pero solo devuelve 50 en la primera página y cierra
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

    it('la lista TABLES debe incluir las 35 tablas críticas identificadas en la auditoría', () => {
      expect(TABLES).toContain('pedidos');
      expect(TABLES).toContain('envios_formulario');
      expect(TABLES).toContain('notas_pedido');
      expect(TABLES).toContain('nota_pedido_historial'); // CAM-08
      expect(TABLES).toContain('comunicaciones_pedido'); // CAM-07D
      expect(TABLES).toContain('solicitudes_informacion'); // CAM-07C
      expect(TABLES).toContain('solicitante_sesiones'); // CAM-07B
      expect(TABLES).toContain('pedido_versiones');
      expect(TABLES).toContain('pedido_etiquetas');
      expect(TABLES).toContain('pedido_checklist_items');
      expect(TABLES.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('2. backup-prod-database.mjs — Cifrado AES-256-GCM e Integridad Criptográfica', () => {
    const testKey = crypto.randomBytes(32);
    const sampleSnapshot = {
      metadata: {
        version: '1.1',
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
      expect(encryptedBuffer.length).toBeGreaterThan(64); // Magic + iv + authTag + ciphertext

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

      // Mutar el último byte
      tamperedBuffer[tamperedBuffer.length - 1] ^= 0x01;

      expect(() => {
        decryptBackupPackage(tamperedBuffer, testKey);
      }).toThrow(/Unsupported state or unable to authenticate data/i);
    });

    it('debe leer y descifrar backups históricos con formato legacy (IV12 + AuthTag16 + Ciphertext)', () => {
      // Simular cifrado con el script previo a CAM-12 (sin encabezado PED1)
      const rawJson = JSON.stringify(sampleSnapshot);
      const rawBytes = Buffer.from(rawJson, 'utf8');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', testKey, iv);
      const encrypted = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const legacyPackage = Buffer.concat([iv, authTag, encrypted]);

      // Verificar que decryptBackupPackage lo descifra transparentemente
      const restored = decryptBackupPackage(legacyPackage, testKey);
      expect(restored.metadata.project_ref).toBe('test_ref');
      expect(restored.tables.pedidos).toHaveLength(2);
      expect(restored.tables.pedidos[0].titulo).toBe('Campaña Sanitaria');
    });

    it('el nuevo formato generado debe incorporar cabecera mágica PED1 al inicio del binario', () => {
      const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
      expect(encryptedBuffer.subarray(0, 4).toString('utf8')).toBe('PED1');
    });

    it('debe validar checksum SHA-256 y metadatos con verifyBackupFile', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam12-unit-'));
      try {
        const backupPath = path.join(tempDir, 'test-backup.enc');
        const metaPath = path.join(tempDir, 'test-backup.meta.json');

        const encryptedBuffer = encryptBackupData(sampleSnapshot, testKey);
        fs.writeFileSync(backupPath, encryptedBuffer);

        const sha256 = crypto.createHash('sha256').update(encryptedBuffer).digest('hex');
        fs.writeFileSync(
          metaPath,
          JSON.stringify({
            file: path.basename(backupPath),
            sha256,
            counts: sampleSnapshot.metadata.counts,
          })
        );

        const verifyResult = verifyBackupFile(backupPath, { encryptionKey: testKey.toString('hex') });
        expect(verifyResult.valid).toBe(true);
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
  });

  describe('3. check-prod-environment-gate.mjs — Separación Estricta TEST/PROD y Manejo de Secretos Ocultos', () => {
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

    // PRUEBAS NEGATIVAS — OBJETIVO 1
    it('PRUEBA NEGATIVA 1.1: Si los secretos vienen sin valor (output real supabase secrets list), NUNCA debe declarar APTO (status INSUFFICIENT_DATA)', () => {
      // Simular exactamente la salida de supabase secrets list (solo name y digest, sin valor plano)
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

    it('PRUEBA NEGATIVA 1.5: Debe rechazar si la clave pública SUPABASE_ANON_KEY contiene el rol service_role', () => {
      const leakedProd = { ...validProd, SUPABASE_ANON_KEY: makeJwt('service_role', 'uwzgyirilafgnbpmrkic') };
      const res = validateEnvironmentSecrets(leakedProd, validTest);
      expect(res.passed).toBe(false);
      expect(res.errors.some(e => e.includes('SUPABASE_ANON_KEY carries service_role'))).toBe(true);
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
        version: '1.1',
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

    it('debe respetar el orden topológico RESTORE_ORDER para respetar dependencias de claves foráneas', () => {
      const enviosIdx = RESTORE_ORDER.indexOf('envios_formulario');
      const pedidosIdx = RESTORE_ORDER.indexOf('pedidos');
      const notasIdx = RESTORE_ORDER.indexOf('notas_pedido');
      const histIdx = RESTORE_ORDER.indexOf('nota_pedido_historial');
      const commsIdx = RESTORE_ORDER.indexOf('comunicaciones_pedido');

      expect(enviosIdx).toBeLessThan(pedidosIdx);
      expect(pedidosIdx).toBeLessThan(notasIdx);
      expect(notasIdx).toBeLessThan(histIdx);
      expect(pedidosIdx).toBeLessThan(commsIdx);
    });

    // PRUEBA NEGATIVA — OBJETIVO 2: Integridad referencial universal
    it('PRUEBA NEGATIVA 2: Debe generar bloque PL/pgSQL dinámico que valida TODAS las Foreign Keys activas de la base de datos', () => {
      const sql = generateRestoreSql(sampleSnapshot);

      expect(sql).toContain("session_replication_role = 'replica';");
      expect(sql).toContain("session_replication_role = 'origin';");
      expect(sql).toContain('COMMIT;');

      // Verificación de integridad universal dinámica sobre pg_constraint
      expect(sql).toContain('pg_constraint');
      expect(sql).toContain("c.contype = 'f'");
      expect(sql).toContain('[RESTORE_INTEGRITY_FAIL]');
    });

    // PRUEBAS NEGATIVAS — OBJETIVO 3: Divergencia de datos, PKs compuestas y prevención de sobrescritura accidental
    it('PRUEBA NEGATIVA 3.1: Por defecto, la estrategia debe ser "error" (sin ON CONFLICT) para impedir sobrescrituras inadvertidas', () => {
      const sql = generateRestoreSql(sampleSnapshot); // default conflictStrategy: 'error'

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

    it('PRUEBA NEGATIVA 3.4: Debe soportar claves primarias compuestas (archivo_pedido) y claves no-id (configuracion_sistema, usuarios_acceso)', () => {
      const compositeSnapshot = {
        metadata: { version: '1.1', project_ref: 'test_ref' },
        tables: {
          configuracion_sistema: [{ key: 'app_title', valor: 'Sistema Pedidos' }],
          archivo_pedido: [{ archivo_id: 'a1', pedido_id: 'p1', tipo_archivo: 'adjunto' }],
          usuarios_acceso: [{ user_id: 'u1', email: 'test@tdf.gob.ar', activo: true }],
        },
      };

      const sql = generateRestoreSql(compositeSnapshot, {
        conflictStrategy: 'upsert',
        confirmOverwrite: true,
      });

      // PK no-id: key
      expect(sql).toContain('ON CONFLICT ("key") DO UPDATE SET');
      // PK compuesta: archivo_id, pedido_id
      expect(sql).toContain('ON CONFLICT ("archivo_id", "pedido_id") DO UPDATE SET');
      // PK no-id: user_id
      expect(sql).toContain('ON CONFLICT ("user_id") DO UPDATE SET');
    });

    it('PRUEBA NEGATIVA 3.5: Solicitar "do_nothing" sin autorización explícita (allowIgnoreDuplicates) debe ser rechazado', () => {
      expect(() => {
        generateRestoreSql(sampleSnapshot, { conflictStrategy: 'do_nothing' });
      }).toThrow(/La estrategia "do_nothing" oculta divergencias de datos en silencio/);
    });

    // PRUEBAS NEGATIVAS — OBJETIVO 4: Modo destructivo bloqueado
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
});
