import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSupabaseConfig } from '../../supabase/functions/_shared/env.ts';
import infoRequestCreateHandler from '../../supabase/functions/info-request-create/index.ts';

describe('info-request-create Hardening & Key Separation Unit Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_SECRET_KEYS;
    delete process.env.SUPABASE_PUBLISHABLE_KEYS;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1. publishable presente + secret presente → PASS en getSupabaseConfig', () => {
    process.env.SUPABASE_URL = 'https://pedidos.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_pub_test_123';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_456';

    const config = getSupabaseConfig();
    const effectivePublicKey = config.publishableKey || config.supabaseAnonKey;

    expect(config.supabaseUrl).toBe('https://pedidos.supabase.co');
    expect(effectivePublicKey).toBe('sb_pub_test_123');
    expect(config.serviceRoleKey).toBe('sb_secret_test_456');
    expect(effectivePublicKey).not.toBe(config.serviceRoleKey);
  });

  it('2. anon legacy + service_role legacy → PASS en getSupabaseConfig', () => {
    process.env.SUPABASE_URL = 'https://pedidos.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_legacy_anon_789';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_legacy_service_role_012';

    const config = getSupabaseConfig();
    const effectivePublicKey = config.publishableKey || config.supabaseAnonKey;

    expect(effectivePublicKey).toBe('sb_legacy_anon_789');
    expect(config.serviceRoleKey).toBe('sb_legacy_service_role_012');
  });

  it('3. publishable ausente → configuración inválida; NO usar serviceRole como fallback', async () => {
    // Solo configuramos serviceRoleKey
    process.env.SUPABASE_URL = 'https://pedidos.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_only';

    const config = getSupabaseConfig();
    const effectivePublicKey = config.publishableKey || config.supabaseAnonKey;

    expect(effectivePublicKey).toBe('');
    expect(config.serviceRoleKey).toBe('sb_secret_only');

    // La Edge Function debe rechazar la llamada con SERVER_CONFIGURATION_ERROR
    const req = new Request('https://pedidos.supabase.co/functions/v1/info-request-create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer fake_user_jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pedido_id: 'test-ped', mensaje: 'Mensaje de prueba' }),
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
  });

  it('4. secret/admin ausente → configuración inválida (SERVER_CONFIGURATION_ERROR)', async () => {
    // Solo configuramos anonKey
    process.env.SUPABASE_URL = 'https://pedidos.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_anon_only';

    const config = getSupabaseConfig();
    expect(config.serviceRoleKey).toBe('');

    const req = new Request('https://pedidos.supabase.co/functions/v1/info-request-create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer fake_user_jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pedido_id: 'test-ped', mensaje: 'Mensaje de prueba' }),
    });

    const res = await infoRequestCreateHandler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
  });

  it('5. userClient nunca recibe secret/serviceRole y adminClient nunca se expone al cliente', async () => {
    process.env.SUPABASE_URL = 'https://pedidos.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'pub_anon_key_unique_val';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret_service_role_key_unique_val';

    const config = getSupabaseConfig();
    const effectivePublicKey = config.publishableKey || config.supabaseAnonKey;

    // effectivePublicKey debe ser estríctamente la clave pública, nunca la secreta
    expect(effectivePublicKey).toBe('pub_anon_key_unique_val');
    expect(effectivePublicKey).not.toBe(config.serviceRoleKey);
    expect(config.serviceRoleKey).toBe('secret_service_role_key_unique_val');

    // Intentar request con Authorization faltante
    const reqNoAuth = new Request('https://pedidos.supabase.co/functions/v1/info-request-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido_id: 'test-ped', mensaje: 'Mensaje de prueba' }),
    });

    const resNoAuth = await infoRequestCreateHandler(reqNoAuth);
    expect(resNoAuth.status).toBe(401);
    const bodyNoAuth = await resNoAuth.json();
    expect(bodyNoAuth.error).toBe('UNAUTHORIZED');

    // Comprobar que en ninguna respuesta o error se fuga la clave secreta
    const bodyString = JSON.stringify(bodyNoAuth);
    expect(bodyString).not.toContain('secret_service_role_key_unique_val');
  });
});
