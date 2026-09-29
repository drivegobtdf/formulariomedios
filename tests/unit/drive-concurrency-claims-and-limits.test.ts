import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_FILES_SOLICITANTE,
  MAX_FILE_SIZE_SOLICITANTE_BYTES,
  MAX_FILES_ENTREGA,
  MAX_FILE_SIZE_ENTREGA_BYTES,
  validateFileMetadata,
} from '../../supabase/functions/_shared/security.ts';
import { computeUniqueFileName } from '../../supabase/functions/_shared/drive-adapter.ts';

interface MockFolderRow {
  id: string;
  pedido_id: string;
  folder_type: 'solicitud' | 'enviado';
  drive_folder_id: string | null;
  folder_name: string;
  organization_status: 'pending' | 'processing' | 'completed' | 'failed';
  claim_token: string | null;
  claimed_at: Date | null;
  lease_expires_at: Date | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
}

class MockDriveFolderManager {
  private rows: Map<string, MockFolderRow> = new Map();

  private key(pedidoId: string, folderType: string): string {
    return `${pedidoId}:${folderType}`;
  }

  async claim(
    pedidoId: string,
    folderType: 'solicitud' | 'enviado',
    folderName: string,
    leaseSeconds: number = 60,
    now: Date = new Date()
  ): Promise<{
    status: 'completed' | 'claimed' | 'locked';
    claim_token?: string;
    drive_folder_id?: string;
    folder_name?: string;
    retry_count?: number;
    lease_expires_at?: Date;
    message?: string;
  }> {
    const k = this.key(pedidoId, folderType);
    const existing = this.rows.get(k);

    if (existing) {
      if (existing.organization_status === 'completed' && existing.drive_folder_id) {
        return {
          status: 'completed',
          drive_folder_id: existing.drive_folder_id,
          folder_name: existing.folder_name,
        };
      }

      if (
        existing.organization_status === 'processing' &&
        existing.lease_expires_at &&
        existing.lease_expires_at.getTime() > now.getTime()
      ) {
        return {
          status: 'locked',
          lease_expires_at: existing.lease_expires_at,
          message: 'Carpeta en proceso de resolución por otro worker',
        };
      }

      // Reclamar fila existente fallida o expirada
      const claimToken = `tok-${Math.random().toString(36).substring(2, 10)}`;
      const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
      existing.organization_status = 'processing';
      existing.claim_token = claimToken;
      existing.claimed_at = now;
      existing.lease_expires_at = leaseExpiresAt;
      existing.retry_count += 1;
      existing.last_error = null;

      return {
        status: 'claimed',
        claim_token: claimToken,
        folder_name: existing.folder_name,
        retry_count: existing.retry_count,
        lease_expires_at: leaseExpiresAt,
      };
    }

    // Insertar nueva fila reclamada
    const claimToken = `tok-${Math.random().toString(36).substring(2, 10)}`;
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    const newRow: MockFolderRow = {
      id: `row-${Math.random().toString(36).substring(2, 8)}`,
      pedido_id: pedidoId,
      folder_type: folderType,
      drive_folder_id: null,
      folder_name: folderName,
      organization_status: 'processing',
      claim_token: claimToken,
      claimed_at: now,
      lease_expires_at: leaseExpiresAt,
      retry_count: 1,
      max_retries: 5,
      last_error: null,
    };
    this.rows.set(k, newRow);

    return {
      status: 'claimed',
      claim_token: claimToken,
      folder_name: folderName,
      retry_count: 1,
      lease_expires_at: leaseExpiresAt,
    };
  }

  async complete(
    pedidoId: string,
    folderType: 'solicitud' | 'enviado',
    claimToken: string,
    driveFolderId: string,
    folderName?: string
  ): Promise<{ success: boolean; status?: string; drive_folder_id?: string; error?: string; idempotent?: boolean }> {
    const k = this.key(pedidoId, folderType);
    const existing = this.rows.get(k);

    if (!existing) {
      return { success: false, error: 'FOLDER_RECORD_NOT_FOUND' };
    }

    if (existing.organization_status === 'completed' && existing.drive_folder_id === driveFolderId) {
      return { success: true, status: 'completed', drive_folder_id: existing.drive_folder_id, idempotent: true };
    }

    if (!existing.claim_token || existing.claim_token !== claimToken) {
      return { success: false, error: 'CLAIM_MISMATCH_OR_EXPIRED' };
    }

    existing.organization_status = 'completed';
    existing.drive_folder_id = driveFolderId;
    if (folderName) existing.folder_name = folderName;
    existing.claim_token = null;
    existing.claimed_at = null;
    existing.lease_expires_at = null;
    existing.last_error = null;

    return { success: true, status: 'completed', drive_folder_id: driveFolderId };
  }

  async fail(
    pedidoId: string,
    folderType: 'solicitud' | 'enviado',
    claimToken: string | null,
    lastError: string
  ): Promise<{ success: boolean; status?: string; retry_count?: number; error?: string }> {
    const k = this.key(pedidoId, folderType);
    const existing = this.rows.get(k);

    if (!existing) {
      return { success: false, error: 'FOLDER_RECORD_NOT_FOUND' };
    }

    if (existing.organization_status === 'completed') {
      return { success: false, error: 'ALREADY_COMPLETED' };
    }

    if (existing.claim_token && claimToken && existing.claim_token !== claimToken) {
      return { success: false, error: 'CLAIM_MISMATCH' };
    }

    existing.organization_status = 'failed';
    existing.drive_folder_id = null;
    existing.claim_token = null;
    existing.claimed_at = null;
    existing.lease_expires_at = null;
    existing.last_error = lastError;

    return { success: true, status: 'failed', retry_count: existing.retry_count };
  }

  get(pedidoId: string, folderType: string): MockFolderRow | undefined {
    return this.rows.get(this.key(pedidoId, folderType));
  }
}

describe('Mecanismo de Concurrencia, Claims y Leases de Carpetas Google Drive', () => {
  let manager: MockDriveFolderManager;
  const pedidoId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    manager = new MockDriveFolderManager();
  });

  it('1. Concurrencia: Dos workers simultáneos para SOLICITUD -> Solo uno obtiene claim, el otro locked', async () => {
    const now = new Date('2026-09-28T12:00:00Z');

    // Worker A solicita claim
    const claimA = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    expect(claimA.status).toBe('claimed');
    expect(claimA.claim_token).toBeDefined();

    // Worker B solicita claim simultáneo antes de que Worker A complete
    const claimB = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    expect(claimB.status).toBe('locked');
    expect(claimB.message).toContain('en proceso de resolución');

    // Worker A completa la creación en Google Drive
    const compA = await manager.complete(pedidoId, 'solicitud', claimA.claim_token!, 'drive-folder-123');
    expect(compA.success).toBe(true);
    expect(compA.status).toBe('completed');

    // Worker B intenta nuevamente tras finalizar A -> Obtiene status completed sin volver a crear carpeta
    const claimBRetry = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    expect(claimBRetry.status).toBe('completed');
    expect(claimBRetry.drive_folder_id).toBe('drive-folder-123');
  });

  it('2. Concurrencia ENVIADO: Múltiples uploads paralelos resuelven exactamente la misma carpeta', async () => {
    const now = new Date('2026-09-28T12:00:00Z');

    // Primer upload adquiere claim
    const upload1 = await manager.claim(pedidoId, 'enviado', 'ENVIADO-PED-2026-0001', 60, now);
    expect(upload1.status).toBe('claimed');

    // Upload 1 completa la carpeta ENVIADO
    await manager.complete(pedidoId, 'enviado', upload1.claim_token!, 'drive-enviado-456');

    // Uploads 2, 3, 4 paralelos consultan y obtienen la misma carpeta ya completada
    const upload2 = await manager.claim(pedidoId, 'enviado', 'ENVIADO-PED-2026-0001', 60, now);
    const upload3 = await manager.claim(pedidoId, 'enviado', 'ENVIADO-PED-2026-0001', 60, now);

    expect(upload2.status).toBe('completed');
    expect(upload2.drive_folder_id).toBe('drive-enviado-456');
    expect(upload3.status).toBe('completed');
    expect(upload3.drive_folder_id).toBe('drive-enviado-456');
  });

  it('3. Fallo en Drive antes de obtener folder_id -> drive_folder_id es NULL y status es failed', async () => {
    const now = new Date('2026-09-28T12:00:00Z');

    const claim = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    expect(claim.status).toBe('claimed');

    // Simular error 500 de Google Drive
    const failRes = await manager.fail(pedidoId, 'solicitud', claim.claim_token!, 'Google Drive Quota Exceeded (500)');
    expect(failRes.success).toBe(true);
    expect(failRes.status).toBe('failed');

    const row = manager.get(pedidoId, 'solicitud');
    expect(row?.organization_status).toBe('failed');
    expect(row?.drive_folder_id).toBeNull(); // NUNCA 'pending_creation'
    expect(row?.last_error).toBe('Google Drive Quota Exceeded (500)');
    expect(row?.retry_count).toBe(1);
  });

  it('4. Reintento tras fallo -> Incrementa retry_count y permite completar exitosamente', async () => {
    const now = new Date('2026-09-28T12:00:00Z');

    // Intento 1 fallido
    const claim1 = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    await manager.fail(pedidoId, 'solicitud', claim1.claim_token!, 'Error transitorio');

    // Intento 2 de recuperación
    const claim2 = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    expect(claim2.status).toBe('claimed');
    expect(claim2.retry_count).toBe(2);

    const comp2 = await manager.complete(pedidoId, 'solicitud', claim2.claim_token!, 'drive-recovered-789');
    expect(comp2.success).toBe(true);

    const row = manager.get(pedidoId, 'solicitud');
    expect(row?.organization_status).toBe('completed');
    expect(row?.drive_folder_id).toBe('drive-recovered-789');
    expect(row?.last_error).toBeNull();
  });

  it('5. Lease vencido -> Permite que un nuevo worker recupere la tarea', async () => {
    const t0 = new Date('2026-09-28T12:00:00Z');
    const claim1 = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, t0);
    expect(claim1.status).toBe('claimed');

    // Pasan 90 segundos (lease expiró)
    const t1 = new Date('2026-09-28T12:01:30Z');

    // Worker 2 solicita claim y lo obtiene porque el lease de Worker 1 expiró
    const claim2 = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, t1);
    expect(claim2.status).toBe('claimed');
    expect(claim2.claim_token).not.toBe(claim1.claim_token);

    // Si Worker 1 zombie intenta completar con su token viejo, es rechazado
    const compZombie = await manager.complete(pedidoId, 'solicitud', claim1.claim_token!, 'drive-stale-id');
    expect(compZombie.success).toBe(false);
    expect(compZombie.error).toBe('CLAIM_MISMATCH_OR_EXPIRED');

    // Worker 2 legítimo completa la tarea
    const compLegit = await manager.complete(pedidoId, 'solicitud', claim2.claim_token!, 'drive-valid-id');
    expect(compLegit.success).toBe(true);
    expect(compLegit.status).toBe('completed');
  });

  it('6. Reconciliador: Sin filas failed -> no-op seguro (processed = 0)', async () => {
    // Escenario: No existen filas failed en base de datos
    const itemsToReconcile = Array.from(manager['rows'].values()).filter(
      r => r.organization_status === 'failed' && r.retry_count < r.max_retries
    );
    expect(itemsToReconcile.length).toBe(0);
  });

  it('7. Reconciliador: max_retries alcanzado -> Excluido de nuevos reintentos (Fallo terminal)', async () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const claim = await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);
    await manager.fail(pedidoId, 'solicitud', claim.claim_token!, 'Fallo persistente');

    // Simular que alcanzó max_retries
    const row = manager.get(pedidoId, 'solicitud')!;
    row.retry_count = 5;
    row.max_retries = 5;

    // Consulta de reconcile_fetch_failed_drive_folders: WHERE retry_count < max_retries
    const itemsToReconcile = Array.from(manager['rows'].values()).filter(
      r => (r.organization_status === 'failed' && r.retry_count < r.max_retries) ||
           (r.organization_status === 'processing' && r.lease_expires_at && r.lease_expires_at < now)
    );
    expect(itemsToReconcile.length).toBe(0);
  });

  it('8. Reconciliador: Lease vigente -> Protegido contra robo de tareas concurrentes', async () => {
    const now = new Date('2026-09-28T12:00:00Z');
    await manager.claim(pedidoId, 'solicitud', 'SOLICITUD PED-2026-0001', 60, now);

    // Consulta de reconcile a los 10s (lease sigue vigente)
    const tCheck = new Date('2026-09-28T12:00:10Z');
    const itemsToReconcile = Array.from(manager['rows'].values()).filter(
      r => (r.organization_status === 'failed' && r.retry_count < r.max_retries) ||
           (r.organization_status === 'processing' && r.lease_expires_at && r.lease_expires_at < tCheck)
    );
    expect(itemsToReconcile.length).toBe(0);
  });
});

describe('Límites de Archivos Contractuales (SRS-FUN-009 / SRS-FUN-011)', () => {
  it('1. Solicitante Formulario Público: Límite estricto 5 archivos y 25 MB por archivo', () => {
    expect(MAX_FILES_SOLICITANTE).toBe(5);
    expect(MAX_FILE_SIZE_SOLICITANTE_BYTES).toBe(26214400);

    // 25 MB exactos -> Permitido
    const res25Mb = validateFileMetadata('doc.pdf', 'application/pdf', 25 * 1024 * 1024, MAX_FILE_SIZE_SOLICITANTE_BYTES);
    expect(res25Mb.valid).toBe(true);

    // 25 MB + 1 byte -> Rechazado
    const resOver25Mb = validateFileMetadata('doc.pdf', 'application/pdf', 25 * 1024 * 1024 + 1, MAX_FILE_SIZE_SOLICITANTE_BYTES);
    expect(resOver25Mb.valid).toBe(false);
    expect(resOver25Mb.error).toContain('25 MB');
  });

  it('2. Equipo Interno Entregables: Límite 10 archivos y 10 MB por archivo', () => {
    expect(MAX_FILES_ENTREGA).toBe(10);
    expect(MAX_FILE_SIZE_ENTREGA_BYTES).toBe(10485760);

    // 10 MB exactos -> Permitido
    const res10Mb = validateFileMetadata('entrega.zip', 'application/zip', 10 * 1024 * 1024, MAX_FILE_SIZE_ENTREGA_BYTES);
    expect(res10Mb.valid).toBe(true);

    // 10 MB + 1 byte -> Rechazado
    const resOver10Mb = validateFileMetadata('entrega.zip', 'application/zip', 10 * 1024 * 1024 + 1, MAX_FILE_SIZE_ENTREGA_BYTES);
    expect(resOver10Mb.valid).toBe(false);
    expect(resOver10Mb.error).toContain('10 MB');
  });
});
