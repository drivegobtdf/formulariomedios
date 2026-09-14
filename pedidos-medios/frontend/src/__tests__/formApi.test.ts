import { describe, it, expect } from 'vitest';
import { resolveUploadRelayUrl } from '../services/formApi';

describe('formApi - resolveUploadRelayUrl', () => {
  const supabaseUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
  const reservationId = 'res-1234-uuid';

  it('rewrites edge-runtime.supabase.com internal host to canonical Supabase URL', () => {
    const internalUrl = 'https://edge-runtime.supabase.com/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(internalUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
  });

  it('rewrites kong internal host to canonical Supabase URL', () => {
    const kongUrl = 'http://kong:8000/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(kongUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
  });

  it('rewrites 127.0.0.1 without port to canonical Supabase URL', () => {
    const localHostOnly = 'http://127.0.0.1/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(localHostOnly, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
  });

  it('preserves valid custom external relay URL', () => {
    const validUrl = 'https://custom-gateway.gob.ar/functions/v1/drive-upload-prepare?reservation_id=res-1234-uuid';
    const resolved = resolveUploadRelayUrl(validUrl, reservationId, supabaseUrl);
    expect(resolved).toBe(validUrl);
  });

  it('falls back to canonical Supabase URL when relayUrl is undefined', () => {
    const resolved = resolveUploadRelayUrl(undefined, reservationId, supabaseUrl);
    expect(resolved).toBe(`${supabaseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`);
  });
});
