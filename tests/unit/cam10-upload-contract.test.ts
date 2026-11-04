import { describe, expect, it } from 'vitest';
import { extractRelayDriveFileId } from '../../pedidos-medios/frontend/src/services/formApi';
import { buildDeliveryUploadHeaders } from '../../pedidos-medios/frontend/src/services/gestionApi';

const SUPABASE_TEST = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
const RELAY_URL = `${SUPABASE_TEST}/functions/v1/delivery-upload-prepare?reservation_id=test-123`;

describe('CAM-10: contrato de carga de archivos (sin red)', () => {
  it('extrae drive_file_id del relay, sin depender de id', () => {
    expect(extractRelayDriveFileId({ drive_file_id: 'mock-relay-123' })).toBe('mock-relay-123');
  });

  it('prioriza drive_file_id y conserva compatibilidad con id antiguo', () => {
    expect(extractRelayDriveFileId({ drive_file_id: 'nuevo', id: 'viejo' })).toBe('nuevo');
    expect(extractRelayDriveFileId({ id: 'legacy-google-id' })).toBe('legacy-google-id');
    expect(extractRelayDriveFileId({ drive_file_id: '', id: 'legacy-google-id' })).toBe('legacy-google-id');
    expect(extractRelayDriveFileId(null)).toBe('');
    expect(extractRelayDriveFileId({ drive_file_id: 123 })).toBe('');
  });

  it('envía apikey y JWT exclusivamente al relay autorizado de TEST', () => {
    const headers = buildDeliveryUploadHeaders(RELAY_URL, SUPABASE_TEST, 'anon-test', 'jwt-test', 'application/pdf');
    expect(headers).toEqual({
      apikey: 'anon-test',
      Authorization: 'Bearer jwt-test',
      'Content-Type': 'application/pdf',
    });
  });

  it('nunca envía apikey ni JWT a una sesión resumible directa de Google', () => {
    const headers = buildDeliveryUploadHeaders(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=sample',
      SUPABASE_TEST,
      'anon-test',
      'jwt-test',
      'application/pdf'
    );
    expect(headers).toEqual({ 'Content-Type': 'application/pdf' });
  });

  it.each([
    'https://evil.example/functions/v1/delivery-upload-prepare',
    'https://yqfkzgqvezarzhlwiilo.supabase.co.evil.example/functions/v1/delivery-upload-prepare',
    'http://www.googleapis.com/upload/drive/v3/files',
    'https://www.googleapis.com/drive/v3/files',
    `${SUPABASE_TEST}/functions/v1/otra-funcion`,
    'not-a-url',
  ])('rechaza destino no autorizado sin enviar credenciales: %s', (url) => {
    expect(() => buildDeliveryUploadHeaders(url, SUPABASE_TEST, 'anon-test', 'jwt-test', 'application/pdf'))
      .toThrow(/SECURITY_ERROR/);
  });
});
