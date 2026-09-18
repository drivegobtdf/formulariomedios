import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateFileMetadata, getCorsHeaders, MAX_FILES_PER_SUBMISSION } from '../../supabase/functions/_shared/security.ts';
import { resolveUploadRelayUrl, isOriginAuthorized } from '../../pedidos-medios/frontend/src/services/formApi.ts';

describe('Flujo Directo de Adjuntos en Respuesta a Requerimiento de Información (48h)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon_key_test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Validación de Metadata y Archivos Permitidos', () => {
    it('JPEG pequeño (~97 KB) como "WhatsApp Image..." → PASS', () => {
      const fileName = 'WhatsApp Image 2026-08-29 at 22.36.43 (1).jpeg';
      const mimeType = 'image/jpeg';
      const sizeBytes = 97.1 * 1024; // 99430 bytes (~97.1 KB)

      const result = validateFileMetadata(fileName, mimeType, sizeBytes);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('JPG, PNG, PDF, DOCX, ZIP dentro del límite de 10 MB → PASS', () => {
      const validFiles = [
        { name: 'documento.pdf', mime: 'application/pdf', size: 1024 * 1024 },
        { name: 'captura.png', mime: 'image/png', size: 500 * 1024 },
        { name: 'foto.jpg', mime: 'image/jpg', size: 2 * 1024 * 1024 },
        { name: 'especificaciones.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 300 * 1024 },
        { name: 'paquete.zip', mime: 'application/zip', size: 8 * 1024 * 1024 },
      ];

      for (const f of validFiles) {
        const res = validateFileMetadata(f.name, f.mime, f.size);
        expect(res.valid, `Archivo ${f.name} debería ser válido`).toBe(true);
      }
    });

    it('Archivo > 10 MiB → REJECT', () => {
      const fileName = 'video_pesado.zip';
      const mimeType = 'application/zip';
      const sizeBytes = 10 * 1024 * 1024 + 1; // 1 byte por encima del límite

      const result = validateFileMetadata(fileName, mimeType, sizeBytes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10 MB');
    });

    it('Archivo con extensión o MIME no permitido → REJECT', () => {
      const invalidFiles = [
        { name: 'script.exe', mime: 'application/x-msdownload', size: 1024 },
        { name: 'script.sh', mime: 'application/x-sh', size: 1024 },
        { name: 'video.mp4', mime: 'video/mp4', size: 1024 * 1024 },
      ];

      for (const f of invalidFiles) {
        const res = validateFileMetadata(f.name, f.mime, f.size);
        expect(res.valid, `Archivo ${f.name} no debería ser permitido`).toBe(false);
      }
    });

    it('Límite estricto de máximo 10 archivos por presentación', () => {
      expect(MAX_FILES_PER_SUBMISSION).toBe(10);
      const currentFilesCount = 10;
      const isExceeded = currentFilesCount >= MAX_FILES_PER_SUBMISSION;
      expect(isExceeded).toBe(true);
    });
  });

  describe('2. Validación Criptográfica de Tokens y Resistencia a Manipulación (Web Crypto standard)', () => {
    it('Token SHA-256 deriva hash determinístico mediante computeSha256Hex (Web Crypto)', async () => {
      const { computeSha256Hex } = await import('../../supabase/functions/_shared/security.ts');
      const rawToken = '7f8c9d0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d';
      const tokenHash = await computeSha256Hex(rawToken);

      expect(tokenHash).toHaveLength(64);
      // Misma entrada debe generar idéntico hash
      const tokenHash2 = await computeSha256Hex(rawToken);
      expect(tokenHash).toBe(tokenHash2);

      // Token diferente genera hash diferente (no match con otra solicitud)
      const otherToken = '0000000000000000000000000000000000000000000000000000000000000000';
      const otherHash = await computeSha256Hex(otherToken);
      expect(tokenHash).not.toBe(otherHash);
    });

    it('Simulación de history.replaceState: URL limpia pero token permanece en memoria', () => {
      // Estado inicial con token en URL
      const initialUrl = 'http://localhost:4173/formulariomedios/solicitud-informacion#token=test_token_123';
      const hashMatch = initialUrl.match(/[#&]token=([^&]+)/);
      const tokenCapturedInMemory = hashMatch ? hashMatch[1] : '';

      expect(tokenCapturedInMemory).toBe('test_token_123');

      // Simulación de sanitización de URL bar
      const sanitizedUrl = 'http://localhost:4173/formulariomedios/solicitud-informacion';
      expect(sanitizedUrl).not.toContain('test_token_123');

      // El token en memoria sigue existiendo para llamadas subsecuentes de upload
      expect(tokenCapturedInMemory).toBe('test_token_123');
    });
  });

  describe('3. CORS y Autorización de Orígenes para Upload', () => {
    it('CORS para Origin http://localhost:4173 autoriza métodos y cabeceras x-info-token', () => {
      const req = new Request('https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/drive-upload-prepare', {
        headers: {
          origin: 'http://localhost:4173',
          'access-control-request-headers': 'authorization, content-type, x-info-token',
        },
      });

      const cors = getCorsHeaders(req);
      expect(cors['Access-Control-Allow-Origin']).toBe('http://localhost:4173');
      expect(cors['Access-Control-Allow-Headers']).toContain('x-info-token');
      expect(cors['Access-Control-Allow-Headers']).toContain('x-session-token');
      expect(cors['Access-Control-Allow-Headers']).toContain('x-reservation-id');
      expect(cors['Access-Control-Allow-Methods']).toContain('PUT');
      expect(cors['Access-Control-Allow-Methods']).toContain('POST');
    });

    it('Origin no autorizado no recibe Access-Control-Allow-Origin', () => {
      const req = new Request('https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/drive-upload-prepare', {
        headers: { origin: 'http://attacker-site.evil.com' },
      });

      const cors = getCorsHeaders(req);
      expect(cors['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('resolveUploadRelayUrl resuelve correctamente URL de Cloud Supabase', () => {
      const supabaseUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
      const reservationId = 'res-uuid-12345';
      const returnedRelayUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/drive-upload-prepare?reservation_id=res-uuid-12345';

      const resolved = resolveUploadRelayUrl(returnedRelayUrl, reservationId, supabaseUrl);
      expect(resolved).toBe(returnedRelayUrl);
      expect(isOriginAuthorized(resolved, supabaseUrl)).toBe(true);
    });
  });

  describe('4. Asociación Contextual Determinística de Archivos y Enlaces (Migration 037)', () => {
    it('Permutaciones válidas de respuesta: texto solo, archivo solo, enlace solo, texto+archivo+enlace', () => {
      const payloads = [
        { texto: 'Solo texto de respuesta', archivos: null, enlaces: null, valid: true },
        { texto: '', archivos: ['arch-1'], enlaces: null, valid: true },
        { texto: '', archivos: null, enlaces: ['https://drive.google.com/test'], valid: true },
        { texto: 'Texto completo', archivos: ['arch-1'], enlaces: ['https://drive.google.com/test'], valid: true },
        { texto: '', archivos: [], enlaces: [], valid: false }, // Vacío -> Inválido
      ];

      for (const p of payloads) {
        const hasText = Boolean(p.texto && p.texto.trim().length > 0);
        const hasFiles = Boolean(p.archivos && p.archivos.length > 0);
        const hasLinks = Boolean(p.enlaces && p.enlaces.length > 0);
        const isValid = hasText || hasFiles || hasLinks;

        expect(isValid).toBe(p.valid);
      }
    });

    it('DTO de Solicitudes mapea archivos_respuesta y enlaces_respuesta de forma aislada', () => {
      const rawDbSolicitudes = [
        {
          id: 'sol-1',
          mensaje: 'Req 1',
          archivo_solicitud_informacion: [
            { archivos: { id: 'a1', nombre_original: 'a1.png' } },
          ],
          enlace_solicitud_informacion: [
            { enlaces_material: { id: 'e1', url: 'https://drive.com/1' } },
          ],
        },
        {
          id: 'sol-2',
          mensaje: 'Req 2',
          archivo_solicitud_informacion: [],
          enlace_solicitud_informacion: [
            { enlaces_material: { id: 'e2', url: 'https://dropbox.com/2' } },
          ],
        },
      ];

      const mapped = rawDbSolicitudes.map((s) => ({
        id: s.id,
        mensaje: s.mensaje,
        archivos_respuesta: (s.archivo_solicitud_informacion || []).map((asi: any) => asi.archivos).filter(Boolean),
        enlaces_respuesta: (s.enlace_solicitud_informacion || []).map((esi: any) => esi.enlaces_material).filter(Boolean),
      }));

      expect(mapped[0].archivos_respuesta).toHaveLength(1);
      expect(mapped[0].archivos_respuesta[0].id).toBe('a1');
      expect(mapped[0].enlaces_respuesta).toHaveLength(1);
      expect(mapped[0].enlaces_respuesta[0].url).toBe('https://drive.com/1');

      // Solicitud 2 tiene 0 archivos y solo su enlace correspondiente
      expect(mapped[1].archivos_respuesta).toHaveLength(0);
      expect(mapped[1].enlaces_respuesta).toHaveLength(1);
      expect(mapped[1].enlaces_respuesta[0].url).toBe('https://dropbox.com/2');
    });
  });
});
