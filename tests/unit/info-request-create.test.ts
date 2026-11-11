import { describe, it, expect, vi } from 'vitest';
import infoRequestCreateHandler from '../../supabase/functions/info-request-create/index.ts';

// Mock getSupabaseConfig
vi.mock('../../supabase/functions/_shared/env.ts', async () => {
  const actual = await vi.importActual<any>('../../supabase/functions/_shared/env.ts');
  return {
    ...actual,
    getSupabaseConfig: () => ({
      supabaseUrl: 'http://127.0.0.1:54351',
      serviceRoleKey: 'test-service-key',
      publishableKey: 'test-anon-key',
      supabaseAnonKey: 'test-anon-key',
    }),
  };
});

describe('info-request-create Edge Function - CORS y Control de Acceso', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';

  it('1. Preflight OPTIONS desde Cloudflare Preview retorna 200 OK con Access-Control-Allow-Origin', async () => {
    const req = new Request('http://localhost/functions/v1/info-request-create', {
      method: 'OPTIONS',
      headers: {
        origin: previewOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,apikey',
      },
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(await res.text()).toBe('ok');
  });

  it('2. Preflight OPTIONS desde subdominio hash de Cloudflare Preview retorna Access-Control-Allow-Origin', async () => {
    const hashOrigin = 'https://598d782a.formulariomedios.pages.dev';
    const req = new Request('http://localhost/functions/v1/info-request-create', {
      method: 'OPTIONS',
      headers: { origin: hashOrigin },
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(hashOrigin);
  });

  it('3. Preflight OPTIONS desde origen no autorizado omite Access-Control-Allow-Origin (fail-closed)', async () => {
    const untrustedOrigin = 'https://malicious-site.com';
    const req = new Request('http://localhost/functions/v1/info-request-create', {
      method: 'OPTIONS',
      headers: { origin: untrustedOrigin },
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('4. Métodos HTTP distintos de POST y OPTIONS retornan 405 Method Not Allowed con CORS', async () => {
    const req = new Request('http://localhost/functions/v1/info-request-create', {
      method: 'GET',
      headers: { origin: previewOrigin },
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('5. Petición POST sin cabecera Authorization Bearer retorna 401 UNAUTHORIZED con CORS', async () => {
    const req = new Request('http://localhost/functions/v1/info-request-create', {
      method: 'POST',
      headers: {
        origin: previewOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedido_id: '7e5a0345-a355-4405-ba42-704b7240429c',
        mensaje: 'Por favor adjuntar archivo.',
      }),
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });
});
