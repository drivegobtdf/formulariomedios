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
      expect(encryptedBuffer.length).toBeGreaterThan(64); // Magic + salt + iv + authTag + ciphertext

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

  describe('3. check-prod-environment-gate.mjs — Separación Estricta TEST/PROD', () => {
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

    function assertGatePasses(prod: any, test: any) {
      const res = validateEnvironmentSecrets(prod, test);
      if (!res.passed) throw new Error(res.errors.join('; '));
      return res;
    }

    it('debe aceptar una configuración PROD y TEST completamente aislada y válida', () => {
      const res = assertGatePasses(validProd, validTest);
      expect(res.passed).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('debe rechazar PROD si ENVIRONMENT no está configurado como "production"', () => {
      const invalidProd = { ...validProd, ENVIRONMENT: 'staging' };
      expect(() => {
        assertGatePasses(invalidProd, validTest);
      }).toThrow(/ENVIRONMENT must be set to 'production'/);

      const noEnvProd = { ...validProd, ENVIRONMENT: '' };
      expect(() => {
        assertGatePasses(noEnvProd, validTest);
      }).toThrow(/ENVIRONMENT must be set to 'production'/);
    });

    it('debe rechazar TEST si ENVIRONMENT está configurado como "production" (prevención de colisión)', () => {
      const dangerousTest = { ...validTest, ENVIRONMENT: 'production' };
      expect(() => {
        assertGatePasses(validProd, dangerousTest);
      }).toThrow(/TEST environment must NOT have ENVIRONMENT='production'/);
    });

    it('debe rechazar PROD si PUBLIC_APP_URL no utiliza HTTPS o apunta a localhost', () => {
      const httpProd = { ...validProd, PUBLIC_APP_URL: 'http://pedidos.gobiernotdf.gob.ar' };
      expect(() => {
        assertGatePasses(httpProd, validTest);
      }).toThrow(/PUBLIC_APP_URL must use https:\/\//);

      const localProd = { ...validProd, PUBLIC_APP_URL: 'https://localhost:3000' };
      expect(() => {
        assertGatePasses(localProd, validTest);
      }).toThrow(/PUBLIC_APP_URL must not point to localhost/);
    });

    it('debe rechazar si la clave pública SUPABASE_ANON_KEY contiene el rol service_role', () => {
      const leakedProd = { ...validProd, SUPABASE_ANON_KEY: makeJwt('service_role', 'uwzgyirilafgnbpmrkic') };
      expect(() => {
        assertGatePasses(leakedProd, validTest);
      }).toThrow(/SUPABASE_ANON_KEY carries service_role/);
    });

    it('debe rechazar si PROD y TEST comparten el mismo SUPABASE_URL o GOOGLE_DRIVE_FOLDER_ID', () => {
      const sharedUrlProd = { ...validProd, SUPABASE_URL: validTest.SUPABASE_URL };
      expect(() => {
        assertGatePasses(sharedUrlProd, validTest);
      }).toThrow(/SUPABASE_URL cannot be identical/);

      const sharedDriveProd = { ...validProd, GOOGLE_DRIVE_FOLDER_ID: validTest.GOOGLE_DRIVE_FOLDER_ID };
      expect(() => {
        assertGatePasses(sharedDriveProd, validTest);
      }).toThrow(/GOOGLE_DRIVE_FOLDER_ID cannot be identical/);
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

  describe('5. restore-database-backup.mjs — Generación Determinista de Rollback SQL', () => {
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

    it('debe generar SQL con session_replication_role = replica y escapar correctamente caracteres especiales', () => {
      const sql = generateRestoreSql(sampleSnapshot);

      expect(sql).toContain("session_replication_role = 'replica';");
      expect(sql).toContain("session_replication_role = 'origin';");
      expect(sql).toContain('COMMIT;');

      // Verificar bloque de validación referencial posterior
      expect(sql).toContain('RESTORE_INTEGRITY_FAIL');
      expect(sql).toContain('public.notas_pedido');

      // Verificar escape de comillas en texto de pedidos
      expect(sql).toContain("Anuncio Gubernamental con comillas simples '' y saltos de línea");

      // Verificar formateo de JSONB
      expect(sql).toContain('"formato":"digital"');
    });
  });
});
