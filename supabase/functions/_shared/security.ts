import crypto, { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:4174,http://127.0.0.1:4174,http://localhost:8080,http://127.0.0.1:8080,https://formulariomedios.pages.dev,https://formulariomedios.tierradelfuego.gob.ar';
  const allowedOrigins = rawAllowed
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  const isAllowed = Boolean(
    origin &&
      (allowedOrigins.includes(origin.toLowerCase()) ||
        /^https:\/\/([a-z0-9_-]+\.)?formulariomedios\.pages\.dev$/i.test(origin) ||
        origin.toLowerCase().endsWith('.tierradelfuego.gob.ar'))
  );

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-capability-token, x-solicitante-session, x-pedidos-dispatch-secret, x-info-token, x-session-token, x-reservation-id',
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
 * Calcula el hash SHA-256 en formato hexadecimal mediante Web Crypto API standard
 * (100% compatible con Browser, Deno y Node.js sin depender de node:crypto en runtime)
 */
export async function computeSha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback seguro para entornos Node.js
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Genera un capability token criptográfico y su hash sha256
 */
export async function generateCapabilityToken(submissionKey: string): Promise<{ token: string; hash: string }> {
  const rawBytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(rawBytes);
  } else {
    const nodeCrypto = await import('node:crypto');
    const bytes = nodeCrypto.randomBytes(32);
    rawBytes.set(bytes);
  }
  const randomSecret = Array.from(rawBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const token = `${submissionKey}.${randomSecret}`;
  const hash = await computeSha256Hex(token);
  return { token, hash };
}

/**
 * Valida un capability token contra su hash esperado
 */
export async function verifyCapabilityToken(token: string, expectedHash: string): Promise<boolean> {
  if (!token || !expectedHash) return false;
  const hash = await computeSha256Hex(token);
  return timingSafeEqualString(hash, expectedHash);
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
  let fallbackKey = '';
  try {
    fallbackKey = getSupabaseConfig().serviceRoleKey;
  } catch {
    // ignore
  }
  const rawSecret = customKey || getEnv('MAGIC_LINK_ENCRYPTION_KEY') || fallbackKey || getEnv('SUPABASE_SERVICE_ROLE_KEY') || 'pedidos-default-envelope-secret-key-32-bytes!';
  return createHash('sha256').update(rawSecret + ':pedidos-magic-envelope-key-v1').digest();
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
  const iv = randomBytes(12); // 96-bit IV para GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

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
  const decipher = createDecipheriv('aes-256-gcm', key, iv);

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

