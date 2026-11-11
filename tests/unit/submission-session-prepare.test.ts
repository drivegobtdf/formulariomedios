import { describe, it, expect, vi, beforeEach } from 'vitest';
import sessionPrepareHandler from '../../supabase/functions/submission-session-prepare/index.ts';

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

describe('submission-session-prepare Edge Function', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';

  it('1. Preflight OPTIONS desde Cloudflare Preview retorna 200 OK con Access-Control-Allow-Origin', async () => {
    const req = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'OPTIONS',
      headers: {
        origin: previewOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,apikey',
      },
    });

    const res = await sessionPrepareHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(await res.text()).toBe('ok');
  });

  it('2. Preflight OPTIONS desde hash de Cloudflare Preview (598d782a) retorna Access-Control-Allow-Origin', async () => {
    const hashOrigin = 'https://598d782a.formulariomedios.pages.dev';
    const req = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'OPTIONS',
      headers: { origin: hashOrigin },
    });

    const res = await sessionPrepareHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(hashOrigin);
  });

  it('3. Preflight OPTIONS desde origen no autorizado no incluye Access-Control-Allow-Origin', async () => {
    const untrustedOrigin = 'https://malicious-site.com';
    const req = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'OPTIONS',
      headers: { origin: untrustedOrigin },
    });

    const res = await sessionPrepareHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('4. Métodos HTTP distintos de POST y OPTIONS retornan 405 Method Not Allowed con CORS', async () => {
    const req = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'GET',
      headers: { origin: previewOrigin },
    });

    const res = await sessionPrepareHandler(req);
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('5. Rechaza submission_key con formato UUID inválido con 400 Bad Request y CORS', async () => {
    const req = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'POST',
      headers: {
        origin: previewOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ submission_key: 'not-a-uuid' }),
    });

    const res = await sessionPrepareHandler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('UUID válido');
  });
});
