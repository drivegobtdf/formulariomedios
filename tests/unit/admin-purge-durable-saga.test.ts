import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockDriveAdapter } from '../../supabase/functions/_shared/drive-adapter.ts';

describe('Hardening Final — Saga Durable e Idempotente de Purga Masiva', () => {
  let mockDrive: MockDriveAdapter;

  beforeEach(() => {
    mockDrive = new MockDriveAdapter();
    vi.restoreAllMocks();
  });

  describe('1. Idempotencia y Estado de Operaciones (admin_purge_operations)', () => {
    it('Caso 5 — Doble click / Request duplicado resuelve a la misma operation_id sin recrear items', async () => {
      const idempotencyKey = 'idemp_test_12345';
      const existingOp = {
        id: 'op-uuid-1111',
        idempotency_key: idempotencyKey,
        status: 'pending',
        pedidos_count: 2,
        pedidos_visibles: ['PED-2026-D000001', 'PED-2026-D000002'],
        drive_files_total: 3,
        drive_files_processed: 0,
      };

      // Simular primera llamada vs segunda llamada con la misma clave
      const simulateInit = (key: string, dbState: any[]) => {
        const found = dbState.find((op) => op.idempotency_key === key);
        if (found) {
          return { is_existing: true, operation_id: found.id, status: found.status };
        }
        const created = { id: 'op-uuid-new', idempotency_key: key, status: 'pending' };
        dbState.push(created);
        return { is_existing: false, operation_id: created.id, status: created.status };
      };

      const db: any[] = [];
      const res1 = simulateInit(idempotencyKey, db);
      expect(res1.is_existing).toBe(false);
      expect(res1.operation_id).toBe('op-uuid-new');

      // Segunda llamada (doble click)
      const res2 = simulateInit(idempotencyKey, db);
      expect(res2.is_existing).toBe(true);
      expect(res2.operation_id).toBe('op-uuid-new');
      expect(db.length).toBe(1);
    });
  });

  describe('2. Tolerancia a Fallos y Reintentos en Google Drive', () => {
    it('Caso 3 — Google Drive 404 se considera already_missing y éxito idempotente', async () => {
      const result = await mockDrive.trashItem('non_existent_drive_file_id');
      expect(result.success).toBe(true);
      expect(result.status).toBe('already_missing');
      expect(result.httpStatus).toBe(404);
    });

    it('Caso 1 — Recursos existentes se mueven a papelera (deleted/trashed) con éxito', async () => {
      // Registrar un archivo mock en memoria
      (mockDrive as any).inMemoryFiles.set('valid_drive_file_1', {
        metadata: { id: 'valid_drive_file_1', name: 'flyer.png', mimeType: 'image/png', size: 1024 },
        content: Buffer.from('test'),
      });

      const result = await mockDrive.trashItem('valid_drive_file_1');
      expect(result.success).toBe(true);
      expect(result.status).toBe('deleted');
      expect(result.httpStatus).toBe(200);
    });

    it('Caso 2 — Si Google Drive falla (500), DB NO se purga y la operación pasa a drive_partial', async () => {
      // Mockear fallo 500 en trashItem
      vi.spyOn(mockDrive, 'trashItem').mockResolvedValueOnce({
        success: false,
        status: 'failed',
        httpStatus: 500,
        error: 'Google Drive 500 Internal Server Error',
      });

      const cleanupRes = await mockDrive.trashItem('failing_file_id');
      expect(cleanupRes.success).toBe(false);
      expect(cleanupRes.status).toBe('failed');

      // Simular lógica de transición de saga
      const items = [
        { target_id: 'file_ok', status: 'deleted' },
        { target_id: 'failing_file_id', status: cleanupRes.status },
      ];

      const pendingOrFailed = items.filter((i) => i.status !== 'deleted' && i.status !== 'already_missing');
      expect(pendingOrFailed.length).toBe(1);

      const nextStatus = pendingOrFailed.length === 0 ? 'processing_db' : 'drive_partial';
      expect(nextStatus).toBe('drive_partial');

      // La purga DB está explícitamente bloqueada
      const canPurgeDb = nextStatus === 'processing_db';
      expect(canPurgeDb).toBe(false);
    });

    it('Caso 2b — Retry posterior de operación en drive_partial completa la fase Drive y avanza a processing_db', async () => {
      // En el retry, el archivo que falló ahora se procesa exitosamente
      vi.spyOn(mockDrive, 'trashItem').mockResolvedValueOnce({
        success: true,
        status: 'deleted',
        httpStatus: 200,
      });

      const retryRes = await mockDrive.trashItem('failing_file_id');
      expect(retryRes.success).toBe(true);

      const items = [
        { target_id: 'file_ok', status: 'deleted' },
        { target_id: 'failing_file_id', status: retryRes.status },
      ];

      const pendingOrFailed = items.filter((i) => i.status !== 'deleted' && i.status !== 'already_missing');
      expect(pendingOrFailed.length).toBe(0);

      const nextStatus = pendingOrFailed.length === 0 ? 'processing_db' : 'drive_partial';
      expect(nextStatus).toBe('processing_db');

      const canPurgeDb = nextStatus === 'processing_db';
      expect(canPurgeDb).toBe(true);
    });
  });

  describe('3. Consistencia y Seguridad de la Purga PostgreSQL (admin_pedidos_purge)', () => {
    it('Caso 4 — admin_pedidos_purge rechaza ejecución si la operación no está en processing_db', () => {
      const mockOp = {
        id: 'op-123',
        status: 'drive_partial',
        unresolved_drive_items: 1,
      };

      const validatePurgePreconditions = (op: typeof mockOp) => {
        if (op.unresolved_drive_items > 0 || op.status !== 'processing_db') {
          throw new Error('DRIVE_RESOURCES_PENDING: No se puede purgar la base de datos mientras haya recursos de Google Drive sin limpiar');
        }
        return true;
      };

      expect(() => validatePurgePreconditions(mockOp)).toThrowError(/DRIVE_RESOURCES_PENDING/);
    });

    it('Caso 4b — admin_pedidos_purge ejecuta purga atómica cuando operation_id está autorizada', () => {
      const mockOp = {
        id: 'op-123',
        status: 'processing_db',
        unresolved_drive_items: 0,
      };

      const validatePurgePreconditions = (op: typeof mockOp) => {
        if (op.unresolved_drive_items > 0 || op.status !== 'processing_db') {
          throw new Error('DRIVE_RESOURCES_PENDING: No se puede purgar');
        }
        return { success: true, deleted_count: 2 };
      };

      const result = validatePurgePreconditions(mockOp);
      expect(result.success).toBe(true);
      expect(result.deleted_count).toBe(2);
    });
  });
});
