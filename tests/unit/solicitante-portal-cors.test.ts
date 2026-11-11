import { describe, it, expect } from 'vitest';
import sessionExchangeHandler from '../../supabase/functions/solicitante-session-exchange/index.ts';
import pedidosListHandler from '../../supabase/functions/solicitante-pedidos-list/index.ts';
import sessionRevokeHandler from '../../supabase/functions/solicitante-session-revoke/index.ts';
import infoRespondHandler from '../../supabase/functions/solicitante-info-respond/index.ts';

describe('Portal Solicitante - Preflight CORS en Funciones de Gestión y Sesión', () => {
  const previewOrigin = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';

  const handlers = [
    { name: 'solicitante-session-exchange', fn: sessionExchangeHandler },
    { name: 'solicitante-pedidos-list', fn: pedidosListHandler },
    { name: 'solicitante-session-revoke', fn: sessionRevokeHandler },
    { name: 'solicitante-info-respond', fn: infoRespondHandler },
  ];

  for (const { name, fn } of handlers) {
    it(`Preflight OPTIONS en ${name} retorna 200 OK y Access-Control-Allow-Origin para Cloudflare Preview`, async () => {
      const req = new Request(`http://localhost/functions/v1/${name}`, {
        method: 'OPTIONS',
        headers: {
          origin: previewOrigin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,apikey,content-type,x-solicitante-session',
        },
      });

      const res = await fn(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(await res.text()).toBe('ok');
    });

    it(`Preflight OPTIONS en ${name} omite Access-Control-Allow-Origin para origen no autorizado`, async () => {
      const req = new Request(`http://localhost/functions/v1/${name}`, {
        method: 'OPTIONS',
        headers: { origin: 'https://malicious-site.example.com' },
      });

      const res = await fn(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  }
});
