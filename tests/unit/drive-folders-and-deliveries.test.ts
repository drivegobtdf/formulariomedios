import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockDriveAdapter,
  computeUniqueFileName,
} from '../../supabase/functions/_shared/drive-adapter.ts';
import { validateFileMetadata, MAX_FILE_SIZE_BYTES } from '../../supabase/functions/_shared/security.ts';

describe('1. Google Drive Adapter & Helpers Unit Tests', () => {
  let mockAdapter: MockDriveAdapter;

  beforeEach(() => {
    mockAdapter = new MockDriveAdapter();
  });

  it('ensureFolder genera un identificador determinístico para la carpeta', async () => {
    const parentId = 'root_pedidos_123';
    const folderName = 'SOLICITUD PED-2026-0000089';
    const folderId1 = await mockAdapter.ensureFolder(parentId, folderName);
    const folderId2 = await mockAdapter.ensureFolder(parentId, folderName);

    expect(folderId1).toBe('mock_folder_root_pedidos_123_SOLICITUD_PED-2026-0000089');
    expect(folderId1).toBe(folderId2);
  });

  it('moveFile actualiza los parents del archivo en memoria', async () => {
    const fileId = 'mock_file_001';
    const initialParent = 'mock_staging_folder';
    const targetParent = 'mock_folder_solicitud_89';

    const file = mockAdapter.storeFileBuffer(
      fileId,
      'comprobante.pdf',
      'application/pdf',
      Buffer.from('dummy content'),
      {},
      initialParent
    );

    expect(file.parents).toContain(initialParent);

    await mockAdapter.moveFile(fileId, targetParent, initialParent);

    const verification = await mockAdapter.verifyUploadedFile(fileId, {
      name: 'comprobante.pdf',
      size: 13,
      mimeType: 'application/pdf',
    });

    expect(verification.verified).toBe(true);
    expect(verification.file?.parents).toContain(targetParent);
  });

  it('computeUniqueFileName resuelve colisiones numéricas determinísticas', () => {
    const existing = ['pieza-final.pdf', 'foto.jpg', 'pieza-final (2).pdf'];

    expect(computeUniqueFileName(existing, 'otro-archivo.pdf')).toBe('otro-archivo.pdf');
    expect(computeUniqueFileName(existing, 'foto.jpg')).toBe('foto (2).jpg');
    expect(computeUniqueFileName(existing, 'pieza-final.pdf')).toBe('pieza-final (3).pdf');
  });
});

describe('2. Validación de Archivos y Metadatos Contractuales', () => {
  it('Acepta formatos permitidos (PDF, PNG, JPG, DOCX, ZIP) menores a 10 MB', () => {
    expect(validateFileMetadata('diseño.pdf', 'application/pdf', 1024).valid).toBe(true);
    expect(validateFileMetadata('render.png', 'image/png', 2 * 1024 * 1024).valid).toBe(true);
    expect(validateFileMetadata('foto.jpg', 'image/jpeg', 500 * 1024).valid).toBe(true);
    expect(validateFileMetadata('documento.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100 * 1024).valid).toBe(true);
    expect(validateFileMetadata('assets.zip', 'application/zip', 9 * 1024 * 1024).valid).toBe(true);
  });

  it('Rechaza archivos mayores a 10 MB', () => {
    const res = validateFileMetadata('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES + 1);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('10 MB');
  });

  it('Rechaza extensiones o MIME types ejecutables/no autorizados', () => {
    expect(validateFileMetadata('script.exe', 'application/x-msdownload', 100).valid).toBe(false);
    expect(validateFileMetadata('script.sh', 'application/x-sh', 100).valid).toBe(false);
    expect(validateFileMetadata('archivo.php', 'text/php', 100).valid).toBe(false);
  });
});

describe('3. Reglas de Validación de Finalización de Pedidos', () => {
  function validateFinalizeRequirements(params: {
    archivos?: string[];
    urlEntrega?: string;
  }): { valid: boolean; error?: string } {
    const cleanUrl = params.urlEntrega ? params.urlEntrega.trim() : '';
    const hasFiles = params.archivos && params.archivos.length > 0;
    const hasUrl = Boolean(cleanUrl);

    if (!hasFiles && !hasUrl) {
      return { valid: false, error: 'Adjuntá al menos un archivo o ingresá un enlace de entrega.' };
    }

    if (hasUrl && !cleanUrl.match(/^https?:\/\/.+/i)) {
      return { valid: false, error: 'La URL de entrega debe ser un enlace válido HTTP o HTTPS.' };
    }

    return { valid: true };
  }

  it('Válido con SOLO archivos y sin URL', () => {
    const res = validateFinalizeRequirements({
      archivos: ['f1e582bb-81d3-485a-ba3d-4c312781b29a'],
      urlEntrega: undefined,
    });
    expect(res.valid).toBe(true);
  });

  it('Válido con MÚLTIPLES archivos y sin URL', () => {
    const res = validateFinalizeRequirements({
      archivos: ['arch-1', 'arch-2', 'arch-3'],
      urlEntrega: '',
    });
    expect(res.valid).toBe(true);
  });

  it('Válido con SOLO URL HTTPS válida y sin archivos', () => {
    const res = validateFinalizeRequirements({
      archivos: [],
      urlEntrega: 'https://drive.google.com/drive/folders/sample-folder',
    });
    expect(res.valid).toBe(true);
  });

  it('Válido con ARCHIVOS + URL HTTPS simultáneamente', () => {
    const res = validateFinalizeRequirements({
      archivos: ['arch-1'],
      urlEntrega: 'https://midominio.gob.ar/entrega',
    });
    expect(res.valid).toBe(true);
  });

  it('Rechazado si NO hay archivos NI URL', () => {
    const res = validateFinalizeRequirements({
      archivos: [],
      urlEntrega: '',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toBe('Adjuntá al menos un archivo o ingresá un enlace de entrega.');
  });

  it('Rechazado si URL no comienza con HTTP o HTTPS', () => {
    const res = validateFinalizeRequirements({
      archivos: ['arch-1'],
      urlEntrega: 'ftp://servidor/entrega.zip',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toBe('La URL de entrega debe ser un enlace válido HTTP o HTTPS.');
  });
});
