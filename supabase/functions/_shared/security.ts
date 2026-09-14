import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getEnv, getSupabaseConfig, resolvePublicAppUrl } from './env.ts';

export { getEnv, getSupabaseConfig, resolvePublicAppUrl };
export type { SupabaseConfig } from './env.ts';

// Constantes contractuales vigentes (Revisión 3.0)
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB = 10,485,760 bytes
export const MAX_FILES_PER_SUBMISSION = 10;
export const SESSION_TTL_SECONDS = 7200; // 2 horas

export const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
]);

export const ALLOWED_EXTENSIONS = new Set<string>([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'docx',
  'zip',
]);

/**
 * Genera cabeceras CORS seguras basadas en el origen de la solicitud
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const rawAllowed =
    getEnv('ALLOWED_ORIGINS') ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:8080,http://127.0.0.1:8080';
  const allowedOrigins = rawAllowed
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  const isAllowed = Boolean(origin && allowedOrigins.includes(origin.toLowerCase()));

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-capability-token, x-solicitante-session, x-pedidos-dispatch-secret',
    'Access-Control-Expose-Headers':
      'Content-Disposition, Content-Type, Content-Length, Cache-Control, X-Content-Type-Options',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * Genera un capability token criptográfico y su hash sha256
 */
export function generateCapabilityToken(submissionKey: string): { token: string; hash: string } {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  const token = `${submissionKey}.${randomSecret}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Valida un capability token contra su hash esperado
 */
export function verifyCapabilityToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  if (hash.length !== expectedHash.length) return false;
  const enc = new TextEncoder();
  return crypto.timingSafeEqual(enc.encode(hash), enc.encode(expectedHash));
}

/**
 * Valida el nombre y extensión de un archivo
 */
export function validateFileMetadata(name: string, mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'El nombre del archivo es obligatorio' };
  }

  if (sizeBytes <= 0) {
    return { valid: false, error: 'El tamaño del archivo debe ser mayor a 0 bytes' };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `El archivo excede el tamaño máximo permitido de 10 MB (${MAX_FILE_SIZE_BYTES} bytes)` };
  }

  const normalizedMime = mimeType.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return { valid: false, error: `Tipo MIME no permitido: ${mimeType}. Formatos válidos: PDF, PNG, JPG, DOCX, ZIP` };
  }

  const parts = name.trim().split('.');
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Extensión de archivo .${ext} no permitida. Formatos válidos: PDF, PNG, JPG, DOCX, ZIP` };
  }

  return { valid: true };
}

/**
 * Sanea el nombre de un archivo para descarga segura
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Verifica autorización interna en usuarios_acceso (Admin, Equipo, Observador aprobado)
 */
export async function verifyUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ approved: boolean; role: 'administrador' | 'equipo' | 'observador' | null }> {
  const { data, error } = await supabase
    .from('usuarios_acceso')
    .select('estado_acceso, app_role')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { approved: false, role: null };
  }

  const isApproved = data.estado_acceso === 'aprobado';
  const role = data.app_role as 'administrador' | 'equipo' | 'observador';

  return { approved: isApproved, role: isApproved ? role : null };
}

/**
 * Obtiene la clave de cifrado AES-256 de 32 bytes para sobres de magic links
 */
export function getEncryptionKey(customKey?: string): Buffer {
  const rawSecret = customKey || getEnv('MAGIC_LINK_ENCRYPTION_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY') || 'pedidos-default-envelope-secret-key-32-bytes!';
  return crypto.createHash('sha256').update(rawSecret + ':pedidos-magic-envelope-key-v1').digest();
}

export interface EncryptedTokenEnvelope {
  version: '1.0';
  algo: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
  purpose: string;
  created_at: string;
}

/**
 * Cifra el material del token para transporte durable en cola mediante AES-256-GCM
 */
export function encryptTokenEnvelope(
  plaintext: string,
  purpose: string,
  communicationId: string,
  customKey?: string
): EncryptedTokenEnvelope {
  const key = getEncryptionKey(customKey);
  const iv = crypto.randomBytes(12); // 96-bit IV para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const aad = Buffer.from(`purpose:${purpose}|comm:${communicationId}`, 'utf8');
  cipher.setAAD(aad);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    version: '1.0',
    algo: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag,
    ciphertext,
    purpose,
    created_at: new Date().toISOString(),
  };
}

/**
 * Descifra el sobre en memoria durante el despacho del correo
 */
export function decryptTokenEnvelope(
  envelope: EncryptedTokenEnvelope | Record<string, any>,
  purpose: string,
  communicationId: string,
  customKey?: string
): string {
  if (!envelope || envelope.algo !== 'aes-256-gcm' || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error('Sobre de cifrado inválido o corrupto');
  }

  const key = getEncryptionKey(customKey);
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

  const aad = Buffer.from(`purpose:${purpose}|comm:${communicationId}`, 'utf8');
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Compara dos cadenas de texto de manera segura en tiempo constante contra ataques de temporización (timing attacks)
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  if (typeof crypto !== 'undefined' && typeof (crypto as any).timingSafeEqual === 'function') {
    try {
      return (crypto as any).timingSafeEqual(aBuf, bBuf);
    } catch {
      // fallback
    }
  }
  let mismatch = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    mismatch |= aBuf[i] ^ bBuf[i];
  }
  return mismatch === 0;
}

