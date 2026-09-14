import { describe, it, expect } from 'vitest';
import { resolveUploadRelayUrl, isOriginAuthorized } from '../services/formApi';

describe('formApi - resolveUploadRelayUrl & isOriginAuthorized', () => {
  const supabaseUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
  const reservationId = 'res-1234-uuid';

  it('1. origen autorizado aceptado: accepts exact matching origin', () => {
    const validUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(validUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(validUrl);
    expect(isOriginAuthorized(resolved, supabaseUrl)).toBe(true);
  });

  it('1. origen autorizado aceptado: accepts explicit authorizedRelayOrigin', () => {
    const customGateway = 'https://custom-gateway.gob.ar/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(customGateway, reservationId, supabaseUrl, 'https://custom-gateway.gob.ar');
    expect(resolved).toBe(customGateway);
    expect(isOriginAuthorized(resolved, supabaseUrl, 'https://custom-gateway.gob.ar')).toBe(true);
  });

  it('2. origen ajeno rechazado antes de transferir: rewrites to canonical Supabase endpoint and rejects unauthorized origin', () => {
    const foreignUrl = 'https://attacker.evil.com/leak-data?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(foreignUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
    expect(isOriginAuthorized(foreignUrl, supabaseUrl)).toBe(false);
  });

  it('3. host interno rechazado: edge-runtime.supabase.com is rejected and rewritten to canonical URL', () => {
    const internalUrl = 'https://edge-runtime.supabase.com/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(internalUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
    expect(isOriginAuthorized(internalUrl, supabaseUrl)).toBe(false);
  });

  it('3. host interno rechazado: kong internal host is rejected and rewritten to canonical URL', () => {
    const kongUrl = 'http://kong:8000/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(kongUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
    expect(isOriginAuthorized(kongUrl, supabaseUrl)).toBe(false);
  });

  it('falls back safely to canonical Supabase URL when relayUrl is undefined', () => {
    const resolved = resolveUploadRelayUrl(undefined, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
    expect(isOriginAuthorized(resolved, supabaseUrl)).toBe(true);
  });

  it('throws CONFIG_ERROR if configuredSupabaseUrl is missing or invalid', () => {
    expect(() => resolveUploadRelayUrl(undefined, reservationId, '')).toThrow('CONFIG_ERROR: URL de Supabase no configurada');
    expect(() => resolveUploadRelayUrl(undefined, reservationId, 'invalid-url')).toThrow('CONFIG_ERROR: URL de Supabase configurada inválida');
  });
});
