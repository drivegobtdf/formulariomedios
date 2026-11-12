import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler from '../../supabase/functions/solicitante-delivery-download/index.ts';
import { setDriveAdapter } from '../../supabase/functions/_shared/drive-adapter.ts';

interface MockDataConfig {
  session?: any;
  pedido?: any;
  entrega?: any;
  archivo?: any;
}

let mockConfig: MockDataConfig = {};
const mockDownloadFileStream = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (tableName: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (tableName === 'solicitante_sesiones') {
            return { data: mockConfig.session ?? null, error: null };
          }
          if (tableName === 'pedidos') {
            return { data: mockConfig.pedido ?? null, error: null };
          }
          if (tableName === 'entregas_pedido') {
            return { data: mockConfig.entrega ?? null, error: null };
          }
          if (tableName === 'archivos') {
            return { data: mockConfig.archivo ?? null, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    },
  })),
}));

describe('solicitante-delivery-download: Matriz de Autenticación, Autorización y CORS', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';
  const unauthorizedOrigin = 'https://malicious-site.example.com';

  const validSession = {
    correo: 'solicitante.qa@tierradelfuego.gob.ar',
    expires_at: '2099-01-01T00:00:00.000Z',
    revoked_at: null,
  };

  const pedidoD102 = {
    id: '7e5a0345-a355-4405-ba42-704b7240429c',
    pedido_visible: 'PED-2026-D000102',
    origen: 'publico',
    informacion_especifica: {},
    envios_formulario: { correo: 'solicitante.qa@tierradelfuego.gob.ar' },
  };

  const entregaVigente = {
    id: 'a1d748c6-f81f-4a52-b18a-a8e693e26838',
    pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
    version: 1,
    es_vigente: true,
    archivo_id: 'e5e0b188-6467-40c4-b45c-203a9a2b9ef3',
    entrega_archivos: [{ archivo_id: 'e5e0b188-6467-40c4-b45c-203a9a2b9ef3' }],
  };

  const archivoPdfLegitimo = {
    id: 'e5e0b188-6467-40c4-b45c-203a9a2b9ef3',
    contexto: 'entrega',
    estado: 'verified',
    drive_file_id: '1pg8BtHTLkeWAVF0tAAGzIsrlBBZkpvuo',
    nombre_original: 'Webmaster-misiones-y-funciones (2) (1).pdf',
    mime_type: 'application/pdf',
    size_bytes: 70588,
  };

  beforeEach(() => {
    mockConfig = {};
    mockDownloadFileStream.mockReset();
    mockDownloadFileStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([37, 80, 68, 70])); // %PDF
          controller.close();
        },
      }),
      mimeType: 'application/pdf',
      size: 70588,
      name: 'Webmaster-misiones-y-funciones (2) (1).pdf',
    });
    setDriveAdapter({
      downloadFileStream: mockDownloadFileStream,
    } as any);
  });

  describe('1. Preflight CORS', () => {
    it('responde 200 OK con cabeceras CORS para Cloudflare Pages Preview', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-delivery-download', {
        method: 'OPTIONS',
        headers: {
          'Origin': previewOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'apikey,x-solicitante-session',
        },
      });
      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-solicitante-session');
    });

    it('omite Access-Control-Allow-Origin ante un origen no autorizado', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-delivery-download', {
        method: 'OPTIONS',
        headers: {
          'Origin': unauthorizedOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'apikey,x-solicitante-session',
        },
      });
      const res = await handler(req);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('2. Control de Sesión (Autenticación Interna)', () => {
    it('rechaza con HTTP 401 SESSION_REQUIRED si la cabecera x-solicitante-session está ausente', async () => {
      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoD102.id}&archivo_id=${archivoPdfLegitimo.id}`,
        { method: 'GET', headers: { 'Origin': previewOrigin } }
      );
      const res = await handler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('SESSION_REQUIRED');
      expect(mockDownloadFileStream).not.toHaveBeenCalled();
    });

    it('rechaza con HTTP 401 SESSION_INVALID si la sesión es inexistente, expiró o fue revocada', async () => {
      mockConfig = { session: null };
      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoD102.id}&archivo_id=${archivoPdfLegitimo.id}`,
        {
          method: 'GET',
          headers: {
            'Origin': previewOrigin,
            'x-solicitante-session': 'token-expirado-o-ficticio',
          },
        }
      );
      const res = await handler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('SESSION_INVALID');
      expect(mockDownloadFileStream).not.toHaveBeenCalled();
    });
  });

  describe('3. Titularidad del Pedido (Autorización RBAC)', () => {
    it('rechaza con HTTP 403 FORBIDDEN si la sesión válida pertenece a otro solicitante', async () => {
      mockConfig = {
        session: {
          correo: 'otro.solicitante@gmail.com', // No coincide con solicitante.qa@tierradelfuego.gob.ar
          expires_at: '2099-01-01T00:00:00.000Z',
          revoked_at: null,
        },
        pedido: pedidoD102,
        entrega: entregaVigente,
        archivo: archivoPdfLegitimo,
      };

      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoD102.id}&archivo_id=${archivoPdfLegitimo.id}`,
        {
          method: 'GET',
          headers: {
            'Origin': previewOrigin,
            'x-solicitante-session': 'token-otro-solicitante',
          },
        }
      );
      const res = await handler(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FORBIDDEN');
      expect(body.message).toBe('Acceso denegado a este pedido');
      expect(mockDownloadFileStream).not.toHaveBeenCalled();
    });
  });

  describe('4. Integridad de la Entrega y Archivo Autorizado', () => {
    it('rechaza con HTTP 403 FILE_FORBIDDEN si el archivo no forma parte de la entrega vigente', async () => {
      mockConfig = {
        session: validSession,
        pedido: pedidoD102,
        entrega: entregaVigente, // Contiene archivo e5e0b188-...
        archivo: {
          id: 'archivo-ajeno-no-entregable',
          contexto: 'entrega',
          estado: 'verified',
        },
      };

      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoD102.id}&archivo_id=archivo-ajeno-no-entregable`,
        {
          method: 'GET',
          headers: {
            'Origin': previewOrigin,
            'x-solicitante-session': 'token-valido',
          },
        }
      );
      const res = await handler(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FILE_FORBIDDEN');
      expect(body.message).toBe('El archivo solicitado no forma parte de la entrega vigente de este pedido');
      expect(mockDownloadFileStream).not.toHaveBeenCalled();
    });

    it('rechaza con HTTP 403 FILE_FORBIDDEN si el archivo tiene contexto interno (leak guard CAM-11)', async () => {
      mockConfig = {
        session: validSession,
        pedido: pedidoD102,
        entrega: {
          ...entregaVigente,
          archivo_id: 'arch-leak',
          entrega_archivos: [{ archivo_id: 'arch-leak' }],
        },
        archivo: {
          id: 'arch-leak',
          contexto: 'interno',
          estado: 'verified',
          drive_file_id: 'drive-leak-id',
        },
      };

      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoD102.id}&archivo_id=arch-leak`,
        {
          method: 'GET',
          headers: {
            'Origin': previewOrigin,
            'x-solicitante-session': 'token-valido',
          },
        }
      );
      const res = await handler(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FILE_FORBIDDEN');
      expect(body.message).toBe('Este archivo no es un entregable autorizado');
      expect(mockDownloadFileStream).not.toHaveBeenCalled();
    });
  });

  describe('5. Descarga Exitosa (Happy Path)', () => {
    it('permite descarga con HTTP 200 y stream binario con sesión válida y entregable legítimo', async () => {
      mockConfig = {
        session: validSession,
        pedido: pedidoD102,
        entrega: entregaVigente,
        archivo: archivoPdfLegitimo,
      };

      const req = new Request(
        `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=PED-2026-D000102&archivo_id=${archivoPdfLegitimo.id}`,
        {
          method: 'GET',
          headers: {
            'Origin': previewOrigin,
            'x-solicitante-session': 'token-valido-qa',
          },
        }
      );
      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('Webmaster-misiones-y-funciones');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
      expect(mockDownloadFileStream).toHaveBeenCalledWith(archivoPdfLegitimo.drive_file_id);
    });
  });
});
