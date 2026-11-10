import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import {
  MockDriveAdapter,
  GoogleDriveAdapter,
  getDriveAdapter,
  resetDriveAdapter,
  readMockFileFromDisk,
  getMockStorageDir,
  getSafeMockStoragePaths,
} from '../../supabase/functions/_shared/drive-adapter.ts';

describe('INC-05 & INC-06 — Resiliencia de Almacenamiento Local y Reintentos Idempotentes', () => {
  const testStorageDir = path.resolve(getMockStorageDir());

  beforeEach(() => {
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Limpieza de archivos de prueba
    if (fs.existsSync(testStorageDir)) {
      const files = fs.readdirSync(testStorageDir);
      for (const file of files) {
        if (file.startsWith('test_unit_')) {
          try {
            fs.unlinkSync(path.join(testStorageDir, file));
          } catch {}
        }
      }
    }
  });

  describe('INC-05: MockDriveAdapter con Persistencia Física en Disco', () => {
    it('1. Escritura atómica y persistencia física de bytes reales en disco', async () => {
      const adapter = new MockDriveAdapter();
      const fileId = 'test_unit_file_real_1';
      const sampleContent = Buffer.from('CONTENIDO_PDF_REAL_BINARIO_' + crypto.randomBytes(32).toString('hex'));
      const sampleSha256 = crypto.createHash('sha256').update(sampleContent).digest('hex');

      const stored = await adapter.storeFileBuffer(
        fileId,
        'documento-prueba.pdf',
        'application/pdf',
        sampleContent,
        { reservation_id: 'res-123' },
        'folder-staging'
      );

      expect(stored.id).toBe(fileId);
      expect(stored.size).toBe(sampleContent.length);

      // Verificar existencia física en disco
      const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);
      expect(fs.existsSync(dataPath)).toBe(true);
      expect(fs.existsSync(metaPath)).toBe(true);

      // Comprobar que los bytes en disco coinciden byte a byte (SHA-256 exacto)
      const diskBytes = fs.readFileSync(dataPath);
      const diskSha256 = crypto.createHash('sha256').update(diskBytes).digest('hex');
      expect(diskSha256).toBe(sampleSha256);

      // Comprobar metadatos en disco
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.name).toBe('documento-prueba.pdf');
      expect(meta.mimeType).toBe('application/pdf');
      expect(meta.size).toBe(sampleContent.length);
    });

    it('2. Prevención estricta de Path Traversal en rutas de almacenamiento', () => {
      expect(() => {
        getSafeMockStoragePaths('../../etc/passwd');
      }).not.toThrow(); // path.basename sanitizes, but verify normalized check prevents escaping

      const { dataPath, metaPath } = getSafeMockStoragePaths('normal_id');
      expect(dataPath.startsWith(testStorageDir)).toBe(true);
      expect(metaPath.startsWith(testStorageDir)).toBe(true);

      // Identificador vacío o inválido
      expect(() => {
        getSafeMockStoragePaths('   ');
      }).toThrow('INVALID_FILE_ID');
    });

    it('3. Persistencia entre diferentes isolates / instancias sin memoria compartida', async () => {
      const adapterInstance1 = new MockDriveAdapter();
      const fileId = 'test_unit_cross_isolate_file';
      const originalBytes = Buffer.from('DOCUMENTO_ORIGINAL_COMPARTIDO_ENTRE_ISOLATES');
      const expectedSha256 = crypto.createHash('sha256').update(originalBytes).digest('hex');

      // Instancia 1 guarda el archivo
      await adapterInstance1.storeFileBuffer(fileId, 'archivo-compartido.pdf', 'application/pdf', originalBytes);

      // Instancia 2 simula otro isolate (memoria RAM vacía)
      const adapterInstance2 = new MockDriveAdapter();
      expect((adapterInstance2 as any).inMemoryFiles.has(fileId)).toBe(false);

      // Instancia 2 debe poder verificar el archivo leyendo del disco
      const verifyRes = await adapterInstance2.verifyUploadedFile(fileId, {
        name: 'archivo-compartido.pdf',
        size: originalBytes.length,
        mimeType: 'application/pdf',
      });
      expect(verifyRes.verified).toBe(true);
      expect(verifyRes.file?.size).toBe(originalBytes.length);

      // Instancia 2 debe poder descargar el stream con bytes exactos
      const downloadRes = await adapterInstance2.downloadFileStream(fileId);
      expect(downloadRes.size).toBe(originalBytes.length);
      expect(downloadRes.mimeType).toBe('application/pdf');

      // Consumir el stream
      const chunks: Uint8Array[] = [];
      const stream = downloadRes.stream;
      if (typeof (stream as any).getReader === 'function') {
        const reader = (stream as any).getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } else {
        for await (const chunk of stream as any) {
          chunks.push(chunk);
        }
      }
      const downloadedBuffer = Buffer.concat(chunks);
      const downloadedSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
      expect(downloadedSha256).toBe(expectedSha256);
    });

    it('4. Prohibición estricta de archivos sintéticos: falla explícita si el archivo no existe en disco', async () => {
      const adapter = new MockDriveAdapter();
      const nonExistentId = 'test_unit_file_non_existent_' + crypto.randomUUID();

      // verifyUploadedFile debe devolver verified: false con error explícito
      const verifyRes = await adapter.verifyUploadedFile(nonExistentId, {
        name: 'inexistente.pdf',
        size: 2048,
        mimeType: 'application/pdf',
      });

      expect(verifyRes.verified).toBe(false);
      expect(verifyRes.error).toContain('DRIVE_VERIFY_ERROR');
      expect(verifyRes.error).toContain('no existe en almacenamiento físico local');

      // downloadFileStream debe lanzar excepción explícita
      await expect(adapter.downloadFileStream(nonExistentId)).rejects.toThrow(
        /DRIVE_DOWNLOAD_ERROR.*no existe en almacenamiento físico local/
      );
    });

    it('5. Eliminación física coordinada en disco mediante trashItem / deleteItem', async () => {
      const adapter = new MockDriveAdapter();
      const fileId = 'test_unit_file_to_delete';
      const content = Buffer.from('BYTES_A_ELIMINAR');

      await adapter.storeFileBuffer(fileId, 'a-eliminar.txt', 'text/plain', content);
      const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);
      expect(fs.existsSync(dataPath)).toBe(true);
      expect(fs.existsSync(metaPath)).toBe(true);

      const trashRes = await adapter.trashItem(fileId);
      expect(trashRes.success).toBe(true);
      expect(trashRes.status).toBe('deleted');

      // Los archivos físicos deben haber sido removidos del disco
      expect(fs.existsSync(dataPath)).toBe(false);
      expect(fs.existsSync(metaPath)).toBe(false);

      // Reintento idempotente devuelve already_missing 404
      const retryTrash = await adapter.trashItem(fileId);
      expect(retryTrash.success).toBe(true);
      expect(retryTrash.status).toBe('already_missing');
    });
  });

  describe('INC-05 (Seguridad): Fail-Closed de getDriveAdapter()', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      resetDriveAdapter();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      resetDriveAdapter();
    });

    it('1. Lanza CONFIG_ERROR si faltan credenciales y NO hay autorización explícita de mock', () => {
      // Simular entorno productivo sin credenciales y sin variables de mock/dev/test
      delete process.env.USE_DRIVE_MOCK;
      delete process.env.LOCAL_DEV;
      delete process.env.VITEST;
      delete process.env.NODE_ENV;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_REFRESH_TOKEN;

      expect(() => getDriveAdapter()).toThrowError(
        /CONFIG_ERROR: Credenciales incompletas de Google Drive.*MockDriveAdapter está estrictamente prohibido/
      );
    });

    it('2. Retorna GoogleDriveAdapter cuando existen credenciales completas de Google', () => {
      delete process.env.USE_DRIVE_MOCK;
      delete process.env.LOCAL_DEV;
      delete process.env.VITEST;
      delete process.env.NODE_ENV;
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';

      const adapter = getDriveAdapter();
      expect(adapter).toBeInstanceOf(GoogleDriveAdapter);
    });

    it('3. Retorna MockDriveAdapter cuando USE_DRIVE_MOCK es true, incluso con credenciales Google', () => {
      process.env.USE_DRIVE_MOCK = 'true';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';

      const adapter = getDriveAdapter();
      expect(adapter).toBeInstanceOf(MockDriveAdapter);
    });

    it('4. Retorna MockDriveAdapter en entorno de pruebas VITEST o LOCAL_DEV', () => {
      delete process.env.USE_DRIVE_MOCK;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_REFRESH_TOKEN;

      process.env.LOCAL_DEV = 'true';
      const adapterLocal = getDriveAdapter();
      expect(adapterLocal).toBeInstanceOf(MockDriveAdapter);

      resetDriveAdapter();
      delete process.env.LOCAL_DEV;
      process.env.VITEST = 'true';
      const adapterVitest = getDriveAdapter();
      expect(adapterVitest).toBeInstanceOf(MockDriveAdapter);
    });

    it('5. ENVIRONMENT=production o test BLOQUEA SIEMPRE MockDriveAdapter, incluso con USE_DRIVE_MOCK=true o LOCAL_DEV=true', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_REFRESH_TOKEN;
      process.env.USE_DRIVE_MOCK = 'true';
      process.env.LOCAL_DEV = 'true';
      process.env.VITEST = 'true';
      process.env.NODE_ENV = 'test';

      // Simular entorno PRODUCTION
      process.env.ENVIRONMENT = 'production';
      expect(() => getDriveAdapter()).toThrowError(
        /CONFIG_ERROR: Credenciales incompletas de Google Drive.*MockDriveAdapter está estrictamente prohibido en entorno PRODUCTION/
      );

      // Simular entorno TEST
      resetDriveAdapter();
      process.env.ENVIRONMENT = 'test';
      expect(() => getDriveAdapter()).toThrowError(
        /CONFIG_ERROR: Credenciales incompletas de Google Drive.*MockDriveAdapter está estrictamente prohibido en entorno TEST/
      );

      // Simular APP_ENV=production
      resetDriveAdapter();
      delete process.env.ENVIRONMENT;
      process.env.APP_ENV = 'production';
      expect(() => getDriveAdapter()).toThrowError(
        /CONFIG_ERROR: Credenciales incompletas de Google Drive.*MockDriveAdapter está estrictamente prohibido en entorno PRODUCTION/
      );
    });

    it('6. En entorno production con credenciales completas de Google Drive, retorna GoogleDriveAdapter', () => {
      process.env.ENVIRONMENT = 'production';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';

      const adapter = getDriveAdapter();
      expect(adapter).toBeInstanceOf(GoogleDriveAdapter);
    });
  });

  describe('INC-05 (Integridad y Resiliencia): Detección de Escrituras Parciales e Inconsistencias', () => {
    it('1. readMockFileFromDisk rechaza archivos donde el contenido en disco es menor al metadato (escritura truncada)', () => {
      const fileId = 'test_unit_truncated_disk_file';
      const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);

      // Metadato dice 1024 bytes, pero el archivo en disco solo tiene 50 bytes (interrupción a mitad de escritura)
      const metadata = {
        id: fileId,
        name: 'documento-incompleto.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      };

      fs.writeFileSync(metaPath, JSON.stringify(metadata), 'utf-8');
      fs.writeFileSync(dataPath, Buffer.alloc(50));

      const readResult = readMockFileFromDisk(fileId);
      expect(readResult).toBeNull();
    });

    it('2. readMockFileFromDisk rechaza archivos con discrepancia en el hash MD5', () => {
      const fileId = 'test_unit_corrupted_md5_file';
      const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);

      const metadata = {
        id: fileId,
        name: 'documento-corrupto.pdf',
        mimeType: 'application/pdf',
        size: 100,
        md5Checksum: 'md5_falso_que_no_coincide',
      };

      fs.writeFileSync(metaPath, JSON.stringify(metadata), 'utf-8');
      fs.writeFileSync(dataPath, Buffer.alloc(100));

      const readResult = readMockFileFromDisk(fileId);
      expect(readResult).toBeNull();
    });

    it('3. verifyUploadedFile rechaza archivos cuando el buffer físico es menor al esperado (subida parcial)', async () => {
      const adapter = new MockDriveAdapter();
      const fileId = 'test_unit_partial_upload_file';
      const partialBuffer = Buffer.from('BYTES_PARCIALES_SOLO_25');

      // Forzar almacenamiento de buffer de 24 bytes pero con metadato que indicaba 1000
      (adapter as any).inMemoryFiles.set(fileId, {
        metadata: { id: fileId, name: 'archivo.pdf', mimeType: 'application/pdf', size: 1000 },
        content: partialBuffer,
      });

      const verifyRes = await adapter.verifyUploadedFile(fileId, {
        name: 'archivo.pdf',
        size: 1000,
        mimeType: 'application/pdf',
      });

      expect(verifyRes.verified).toBe(false);
      expect(verifyRes.error).toContain('Tamaño mock no coincide');
    });

    it('4. verifyUploadedFile rechaza archivos cuando hay discrepancia entre metadato y buffer real', async () => {
      const adapter = new MockDriveAdapter();
      const fileId = 'test_unit_inconsistent_meta_buffer';
      const realBuffer = Buffer.from('BYTES_EXACTOS_500_BYTES_TOTALES_EN_BUFFER_REAL_12345');

      // Buffer real mide 51 bytes, pero metadato y expected dicen 51; alteramos el metadato para simular inconsistencia
      (adapter as any).inMemoryFiles.set(fileId, {
        metadata: { id: fileId, name: 'archivo.pdf', mimeType: 'application/pdf', size: 999 },
        content: realBuffer,
      });

      const verifyRes = await adapter.verifyUploadedFile(fileId, {
        name: 'archivo.pdf',
        size: 999,
        mimeType: 'application/pdf',
      });

      expect(verifyRes.verified).toBe(false);
      expect(verifyRes.error).toContain('Tamaño mock no coincide');
    });
  });
});
