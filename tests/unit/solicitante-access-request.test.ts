import { describe, it, expect, vi } from 'vitest';
import solicitanteAccessRequestHandler from '../../supabase/functions/solicitante-access-request/index.ts';

// Mock security getSupabaseConfig and encryptTokenEnvelope
vi.mock('../../supabase/functions/_shared/security.ts', async () => {
  const actual = await vi.importActual<any>('../../supabase/functions/_shared/security.ts');
  return {
    ...actual,
    getSupabaseConfig: () => ({
      supabaseUrl: 'http://127.0.0.1:54351',
      serviceRoleKey: 'test-service-key',
      publishableKey: 'test-anon-key',
      supabaseAnonKey: 'test-anon-key',
    }),
    encryptTokenEnvelope: () => ({ ciphertext: 'mocked', iv: 'mocked', authTag: 'mocked' }),
  };
});

describe('solicitante-access-request Edge Function - CORS y Validación', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';

  it('1. Preflight OPTIONS desde Cloudflare Preview retorna 200 OK con Access-Control-Allow-Origin', async () => {
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'OPTIONS',
      headers: {
        origin: previewOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,apikey,content-type',
      },
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(await res.text()).toBe('ok');
  });

  it('2. Preflight OPTIONS desde subdominio hash de Cloudflare Preview retorna Access-Control-Allow-Origin', async () => {
    const hashOrigin = 'https://598d782a.formulariomedios.pages.dev';
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'OPTIONS',
      headers: { origin: hashOrigin },
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(hashOrigin);
  });

  it('3. Preflight OPTIONS desde origen no autorizado no incluye Access-Control-Allow-Origin', async () => {
    const untrustedOrigin = 'https://malicious-site.example.com';
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'OPTIONS',
      headers: { origin: untrustedOrigin },
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('4. Preflight OPTIONS desde origen canónico de producción retorna Access-Control-Allow-Origin', async () => {
    const prodOrigin = 'https://formulariomedios.pages.dev';
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'OPTIONS',
      headers: { origin: prodOrigin },
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(prodOrigin);
  });

  it('5. Método GET no permitido retorna 405 Method Not Allowed con cabeceras CORS', async () => {
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'GET',
      headers: { origin: previewOrigin },
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('6. Solicitud POST con cuerpo vacío o sin correo retorna 400 VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'POST',
      headers: {
        origin: previewOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('7. Solicitud POST con correo sin formato válido (@) retorna 400 VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'POST',
      headers: {
        origin: previewOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'correo-invalido' }),
    });

    const res = await solicitanteAccessRequestHandler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });
});
