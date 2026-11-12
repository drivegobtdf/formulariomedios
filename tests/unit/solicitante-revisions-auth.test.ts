import { describe, expect, it, vi, beforeEach } from 'vitest';
import revisionRequestHandler from '../../supabase/functions/solicitante-revision-request/index.ts';
import revisionEnvioHandler from '../../supabase/functions/solicitante-revision-envio/index.ts';

const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

describe('solicitante-revision-request & solicitante-revision-envio: Autenticación, CORS y Validación', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';
  const unauthorizedOrigin = 'https://malicious-site.example.com';

  beforeEach(() => {
    mockRpc.mockReset();
  });

  describe('A. solicitante-revision-request', () => {
    it('responde 200 OK con cabeceras CORS en preflight OPTIONS para Cloudflare Preview', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'OPTIONS',
        headers: {
          'Origin': previewOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'apikey,x-solicitante-session,content-type',
        },
      });
      const res = await revisionRequestHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('omite Access-Control-Allow-Origin ante origen no autorizado', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'OPTIONS',
        headers: {
          'Origin': unauthorizedOrigin,
          'Access-Control-Request-Method': 'POST',
        },
      });
      const res = await revisionRequestHandler(req);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rechaza con HTTP 401 SESSION_REQUIRED si no se provee token de sesión', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
          motivo: 'Necesito corrección en el texto del flyer',
        }),
      });
      const res = await revisionRequestHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('SESSION_REQUIRED');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('rechaza con HTTP 400 VALIDATION_ERROR si el motivo tiene menos de 10 caracteres', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
          'x-solicitante-session': 'token-valido',
        },
        body: JSON.stringify({
          pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
          motivo: 'Corto',
        }),
      });
      const res = await revisionRequestHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('rechaza con HTTP 401 UNAUTHORIZED si la RPC indica que la sesión es inválida', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'SESSION_INVALID: La sesión no es válida o expiró' },
      });

      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
          'x-solicitante-session': 'token-expirado',
        },
        body: JSON.stringify({
          pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
          motivo: 'Solicitud formal de corrección del entregable',
        }),
      });
      const res = await revisionRequestHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('UNAUTHORIZED');
      expect(mockRpc).toHaveBeenCalledWith('pedido_request_revision', expect.any(Object));
    });

    it('acepta la solicitud con HTTP 200 cuando los parámetros y la sesión son válidos', async () => {
      mockRpc.mockResolvedValue({
        data: { success: true, revision_id: 'rev-123', estado: 'En Retrabajo' },
        error: null,
      });

      const req = new Request('https://example.com/functions/v1/solicitante-revision-request', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
          'x-solicitante-session': 'token-legitimo',
        },
        body: JSON.stringify({
          pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
          motivo: 'Solicito corregir el logo de portada según manual de marca',
          archivos_ids: ['arch-1'],
        }),
      });
      const res = await revisionRequestHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.revision_id).toBe('rev-123');
    });
  });

  describe('B. solicitante-revision-envio', () => {
    it('responde 200 OK con cabeceras CORS en preflight OPTIONS para Cloudflare Preview', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-envio', {
        method: 'OPTIONS',
        headers: {
          'Origin': previewOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'apikey,x-solicitante-session,content-type',
        },
      });
      const res = await revisionEnvioHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('rechaza con HTTP 401 SESSION_REQUIRED si no se envía sesión de solicitante', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-envio', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ envio_id: 'env-123' }),
      });
      const res = await revisionEnvioHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('SESSION_REQUIRED');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('rechaza con HTTP 400 VALIDATION_ERROR si falta envio_id', async () => {
      const req = new Request('https://example.com/functions/v1/solicitante-revision-envio', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
          'x-solicitante-session': 'token-valido',
        },
        body: JSON.stringify({}),
      });
      const res = await revisionEnvioHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('retorna HTTP 200 con la lista de pedidos revisables para una sesión válida', async () => {
      mockRpc.mockResolvedValue({
        data: {
          envio_id: 'env-123',
          pedidos: [{ id: '7e5a0345-a355-4405-ba42-704b7240429c', puede_revisar: true }],
        },
        error: null,
      });

      const req = new Request('https://example.com/functions/v1/solicitante-revision-envio', {
        method: 'POST',
        headers: {
          'Origin': previewOrigin,
          'Content-Type': 'application/json',
          'x-solicitante-session': 'token-valido',
        },
        body: JSON.stringify({ envio_id: 'env-123' }),
      });
      const res = await revisionEnvioHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.envio_id).toBe('env-123');
      expect(body.pedidos).toHaveLength(1);
    });
  });
});
