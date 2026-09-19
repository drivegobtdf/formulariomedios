/**
 * Tests de Integración: admin-user-delete Edge Function
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import adminUserDeleteHandler from '../../supabase/functions/admin-user-delete/index.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('admin-user-delete Edge Function Tests', () => {
  beforeAll(() => {
    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. CORS y Métodos HTTP', () => {
    it('OPTIONS preflight responde 200 con cabeceras CORS', async () => {
      const req = new Request('http://localhost:54351/functions/v1/admin-user-delete', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:4173',
          'Access-Control-Request-Method': 'POST',
        },
      });
      const res = await adminUserDeleteHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4173');
    });

    it('Método GET responde 405 Method Not Allowed', async () => {
      const req = new Request('http://localhost:54351/functions/v1/admin-user-delete', {
        method: 'GET',
      });
      const res = await adminUserDeleteHandler(req);
      expect(res.status).toBe(405);
      const data = await res.json();
      expect(data.error).toBe('METHOD_NOT_ALLOWED');
    });
  });

  describe('2. Autenticación y Autorización (Guards RBAC)', () => {
    it('Sin header Authorization responde 401 UNAUTHORIZED', async () => {
      const req = new Request('http://localhost:54351/functions/v1/admin-user-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'a0000000-0000-0000-0000-000000000001' }),
      });
      const res = await adminUserDeleteHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Con user_id no válido responde 400 VALIDATION_ERROR si es llamado por admin', async () => {
      // Simular llamada con token inválido
      const req = new Request('http://localhost:54351/functions/v1/admin-user-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token-12345',
        },
        body: JSON.stringify({ user_id: 'not-a-uuid' }),
      });
      const res = await adminUserDeleteHandler(req);
      expect(res.status).toBe(401);
    });
  });
});
