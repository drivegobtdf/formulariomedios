import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnv, getSupabaseConfig } from '../../supabase/functions/_shared/env.ts';
import { getCorsHeaders } from '../../supabase/functions/_shared/security.ts';

describe('Supabase Cloud Environment & Config Resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_SECRET_KEYS;
    delete process.env.SUPABASE_PUBLISHABLE_KEYS;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('debe resolver claves modernas de Supabase Cloud desde JSON dictionaries (default key)', () => {
    process.env.SUPABASE_URL = 'https://pedidos-medios-test.supabase.co';
    process.env.SUPABASE_SECRET_KEYS = JSON.stringify({
      default: 'sb_secret_default_key_123',
      secondary: 'sb_secret_secondary_456',
    });
    process.env.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
      default: 'sb_pub_default_key_789',
      secondary: 'sb_pub_secondary_012',
    });

    const config = getSupabaseConfig();

    expect(config.supabaseUrl).toBe('https://pedidos-medios-test.supabase.co');
    expect(config.serviceRoleKey).toBe('sb_secret_default_key_123');
    expect(config.publishableKey).toBe('sb_pub_default_key_789');
    expect(config.supabaseAnonKey).toBe('sb_pub_default_key_789');
  });

  it('debe tener fallback seguro a variables legacy cuando no existen JSON dictionaries', () => {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54351';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy_service_role_key_abc';
    process.env.SUPABASE_ANON_KEY = 'legacy_anon_key_def';

    const config = getSupabaseConfig();

    expect(config.supabaseUrl).toBe('http://127.0.0.1:54351');
    expect(config.serviceRoleKey).toBe('legacy_service_role_key_abc');
    expect(config.publishableKey).toBe('legacy_anon_key_def');
    expect(config.supabaseAnonKey).toBe('legacy_anon_key_def');
  });

  it('debe soportar SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY en formato individual', () => {
    process.env.SUPABASE_URL = 'https://pedidos-medios-test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'single_secret_key_123';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'single_pub_key_456';

    const config = getSupabaseConfig();

    expect(config.serviceRoleKey).toBe('single_secret_key_123');
    expect(config.publishableKey).toBe('single_pub_key_456');
    expect(config.supabaseAnonKey).toBe('single_pub_key_456');
  });

  it('debe priorizar variables modernas JSON por sobre variables legacy si ambas existen', () => {
    process.env.SUPABASE_SECRET_KEYS = JSON.stringify({ default: 'modern_secret_key' });
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy_secret_key';

    process.env.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({ default: 'modern_pub_key' });
    process.env.SUPABASE_ANON_KEY = 'legacy_pub_key';

    const config = getSupabaseConfig();

    expect(config.serviceRoleKey).toBe('modern_secret_key');
    expect(config.publishableKey).toBe('modern_pub_key');
    expect(config.supabaseAnonKey).toBe('modern_pub_key');
  });

  it('getEnv debe leer correctamente variables de entorno', () => {
    process.env.TEST_SAMPLE_VAR = 'test_value_123';
    expect(getEnv('TEST_SAMPLE_VAR')).toBe('test_value_123');
    expect(getEnv('NON_EXISTENT_VAR')).toBeUndefined();
  });

  it('getCorsHeaders debe mantener localhost/127.0.0.1 y nunca permitir wildcard * indiscriminado', () => {
    const reqLocalhost5173 = new Request('http://localhost/functions/v1/test', {
      headers: { origin: 'http://localhost:5173' },
    });
    const headers1 = getCorsHeaders(reqLocalhost5173);
    expect(headers1['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers1['Access-Control-Allow-Headers']).toContain('x-info-token');
    expect(headers1['Access-Control-Allow-Headers']).toContain('x-session-token');
    expect(headers1['Access-Control-Allow-Headers']).toContain('x-reservation-id');

    const reqLocalhost4173 = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      headers: { origin: 'http://localhost:4173' },
    });
    const headers4173 = getCorsHeaders(reqLocalhost4173);
    expect(headers4173['Access-Control-Allow-Origin']).toBe('http://localhost:4173');
    expect(headers4173['Access-Control-Allow-Headers']).toContain('x-info-token');

    const reqLocalhost4174 = new Request('http://localhost/functions/v1/submission-session-prepare', {
      headers: { origin: 'http://localhost:4174' },
    });
    const headers4174 = getCorsHeaders(reqLocalhost4174);
    expect(headers4174['Access-Control-Allow-Origin']).toBe('http://localhost:4174');
    expect(headers4174['Access-Control-Allow-Headers']).toContain('x-capability-token');

    const reqUntrusted = new Request('http://localhost/functions/v1/test', {
      headers: { origin: 'https://malicious-site.com' },
    });
    const headers2 = getCorsHeaders(reqUntrusted);
    expect(headers2['Access-Control-Allow-Origin']).not.toBe('https://malicious-site.com');
    expect(headers2['Access-Control-Allow-Origin']).not.toBe('*');
  });
});
