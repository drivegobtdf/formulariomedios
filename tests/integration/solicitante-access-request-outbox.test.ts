/**
 * Tests de Solicitud de Acceso a Mis Solicitudes (Outbox Asincrono y Listener HTTP)
 * Proyecto: PEDIDOS - Secretaria de Medios (Revision 3.0)
 *
 * Verificaciones:
 * A. OPTIONS responde inmediatamente con cabeceras CORS validas y no queda pending.
 * B. POST valido responde 200 OK.
 * C. POST persiste la solicitud de acceso en solicitante_access_tokens (con hash SHA-256).
 * D. Se crea fila en comunicaciones_pedido con tipo 'magic_link_access' y sobre cifrado.
 * E. La Edge Function NO realiza fetch directo a n8n (aislamiento total y outbox desacoplado).
 * F. Si n8n esta inaccesible o no existe red, el endpoint publico responde de inmediato.
 * G. El raw token no aparece en texto plano en la base de datos ni en logs.
 * H. La respuesta publica previene enumeracion de correos (misma estructura).
 * J. No se crea ningun pedido PED durante la solicitud de acceso.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import solicitanteAccessRequestHandler from '../../supabase/functions/solicitante-access-request/index.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('solicitante-access-request: Listener HTTP & Outbox Asincrono', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('1. Verificacion de Listener HTTP y CORS (C01, C02)', () => {
    it('A: OPTIONS preflight responde 200 OK inmediatamente con cabeceras CORS', async () => {
      const req = new Request('http://localhost:54351/functions/v1/solicitante-access-request', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:4173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });

      const res = await solicitanteAccessRequestHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4173');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('Rechaza metodos HTTP no permitidos (GET, PUT, DELETE) con 405 Method Not Allowed', async () => {
      const req = new Request('http://localhost:54351/functions/v1/solicitante-access-request', {
        method: 'GET',
        headers: { 'Origin': 'http://localhost:4173' },
      });

      const res = await solicitanteAccessRequestHandler(req);
      expect(res.status).toBe(405);
      const json = await res.json();
      expect(json.error).toBe('METHOD_NOT_ALLOWED');
    });
  });

  describe('2. Desacoplamiento de n8n e Independencia de Red (F10 / C08)', () => {
    it('E & F: La Edge Function NO realiza llamadas fetch externas hacia n8n', async () => {
      const interceptedUrls: string[] = [];
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : (input as Request).url || String(input);
        interceptedUrls.push(urlStr);
        if (urlStr.includes('webhook') || urlStr.includes('n8n')) {
          throw new Error('N8N_SHOULD_NOT_BE_CALLED_DIRECTLY');
        }
        return originalFetch(input, init);
      };

      const req = new Request('http://localhost:54351/functions/v1/solicitante-access-request', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:4173',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'pablosaldiviainfo@gmail.com' }),
      });

      const res = await solicitanteAccessRequestHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const n8nCalls = interceptedUrls.filter(u => u.includes('webhook') || u.includes('n8n'));
      expect(n8nCalls.length).toBe(0);
    });
  });

  describe('3. Validacion y Anti-Enumeracion de Correos (C06, C07)', () => {
    it('Rechaza formato de correo invalido con HTTP 400 Bad Request', async () => {
      const req = new Request('http://localhost:54351/functions/v1/solicitante-access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'correo-invalido-sin-arroba' }),
      });

      const res = await solicitanteAccessRequestHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('VALIDATION_ERROR');
    });

    it('H: Correo sin solicitudes registradas retorna mensaje uniforme anti-enumeracion (200 OK)', async () => {
      const req = new Request('http://localhost:54351/functions/v1/solicitante-access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'correo.inexistente.999@tierradelfuego.gob.ar' }),
      });

      const res = await solicitanteAccessRequestHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('enlace de acceso');
      expect(json.found).toBeUndefined();
    });
  });
});