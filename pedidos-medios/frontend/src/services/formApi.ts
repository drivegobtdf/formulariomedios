/**
 * Servicio API para el Formulario Público de Pedidos (Revisión 3.0)
 * Comunicación directa con Edge Functions y Supabase.
 */

import { getPublicConfig } from './config';
import { SubmissionPayload, SubmissionResponsePayload } from '../types/form';

export interface SessionPrepareResponse {
  session_id: string;
  capability_token: string;
  expires_at: string;
}

export interface UploadPrepareResponse {
  reservation_id: string;
  upload_url: string;
  drive_file_id: string;
  expires_at: string;
}

export interface UploadCompleteResponse {
  status: 'verified';
  archivo_id: string;
  drive_file_id: string;
}

/**
 * Prepara o recupera una sesión de envío segura con capability token
 */
export async function prepareSubmissionSession(submissionKey: string): Promise<SessionPrepareResponse> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/submission-session-prepare`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      submission_key: submissionKey,
      form_schema_version: 3,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Error al inicializar sesión (${res.status})`);
  }

  return res.json();
}

/**
 * Ejecuta el flujo completo de subida directa a Google Drive:
 * 1. drive-upload-prepare -> obtiene upload_url y reservation_id
 * 2. PUT directo a Google Drive (resumable session) con progreso
 * 3. drive-upload-complete -> verifica en backend y crea registro verificado
 */
export interface UploadResult {
  archivo_id: string;
  drive_file_id: string;
  reservation_id: string;
  client_file_ref: string;
}

/**
 * Valida un destino de upload comparando su origin exacto mediante la API URL.
 * Solo autoriza el endpoint público configurado o un relay expresamente autorizado.
 * No utiliza listas de substrings prohibidos.
 *
 * Si relayUrl pertenece al origin autorizado, lo retorna.
 * Si relayUrl es inválido, no coincide con el origin autorizado o es un host interno,
 * retorna la URL canónica bajo el origin de Supabase configurado.
 */
export function resolveUploadRelayUrl(
  relayUrl: string | undefined,
  reservationId: string,
  configuredSupabaseUrl: string,
  authorizedRelayOrigin?: string
): string {
  if (!configuredSupabaseUrl) {
    throw new Error('CONFIG_ERROR: URL de Supabase no configurada');
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredSupabaseUrl).origin;
  } catch {
    throw new Error('CONFIG_ERROR: URL de Supabase configurada inválida');
  }

  const allowedOrigins = new Set<string>([expectedOrigin]);
  if (authorizedRelayOrigin) {
    try {
      allowedOrigins.add(new URL(authorizedRelayOrigin).origin);
    } catch {
      // Ignorar origen adicional inválido
    }
  }

  if (relayUrl) {
    try {
      const parsedRelay = new URL(relayUrl);
      if (allowedOrigins.has(parsedRelay.origin)) {
        return parsedRelay.toString();
      }
    } catch {
      // relayUrl no parseable como URL válida
    }
  }

  return `${expectedOrigin}/functions/v1/drive-upload-prepare?reservation_id=${encodeURIComponent(reservationId)}`;
}

/**
 * Verifica si un target URL pertenece exactamente al origin de Supabase configurado
 * o al relay expresamente autorizado.
 */
export function isOriginAuthorized(
  targetUrl: string,
  configuredSupabaseUrl: string,
  authorizedRelayOrigin?: string
): boolean {
  try {
    const targetOrigin = new URL(targetUrl).origin;
    const expectedOrigin = new URL(configuredSupabaseUrl).origin;
    if (targetOrigin === expectedOrigin) return true;
    if (authorizedRelayOrigin && targetOrigin === new URL(authorizedRelayOrigin).origin) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function uploadFileToDrive(
  sessionId: string,
  capabilityToken: string,
  clientFileRef: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const config = getPublicConfig();
  if (onProgress) onProgress(5);

  // Paso 1: Solicitar reserva de carga e inicialización de sesión
  const prepareUrl = `${config.supabaseUrl}/functions/v1/drive-upload-prepare`;
  const prepRes = await fetch(prepareUrl, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'x-capability-token': capabilityToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      capability_token: capabilityToken,
      client_file_ref: clientFileRef,
      expected_name: file.name,
      expected_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      targets: 'all',
    }),
  });

  if (!prepRes.ok) {
    const prepErr = await prepRes.json().catch(() => ({}));
    throw new Error(prepErr.error || `Error preparando subida (${prepRes.status})`);
  }

  const prepData = await prepRes.json();
  if (onProgress) onProgress(20);

  // Paso 2: Subida de bytes hacia almacenamiento (vía relay en streaming con CORS seguro o URL directa)
  let driveFileId = prepData.drive_file_id || '';
  const targetUploadUrl = resolveUploadRelayUrl(
    prepData.relay_url,
    prepData.reservation_id,
    config.supabaseUrl
  );

  const isAuthorized = isOriginAuthorized(targetUploadUrl, config.supabaseUrl);
  if (!isAuthorized) {
    throw new Error('SECURITY_ERROR: Destino de almacenamiento no autorizado. Transferencia cancelada.');
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', targetUploadUrl);
    
    // Enviar tokens y apikey ÚNICAMENTE porque el origen fue verificado como autorizado
    xhr.setRequestHeader('apikey', config.supabaseAnonKey);
    xhr.setRequestHeader('Authorization', `Bearer ${config.supabaseAnonKey}`);
    xhr.setRequestHeader('x-capability-token', capabilityToken);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.round(20 + (event.loaded / event.total) * 60); // 20% a 80%
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      // Google resumable upload devuelve 200 o 201 al completar
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (parsed.id) driveFileId = parsed.id;
        } catch {
          void 0;
        }
        resolve();
      } else {
        reject(new Error(`Fallo en transferencia a almacenamiento (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Error de red durante la transferencia del archivo'));
    };

    xhr.send(file);
  });

  if (onProgress) onProgress(85);

  // Paso 3: Completar y verificar en backend
  const completeUrl = `${config.supabaseUrl}/functions/v1/drive-upload-complete`;
  const compRes = await fetch(completeUrl, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'x-capability-token': capabilityToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      capability_token: capabilityToken,
      reservation_id: prepData.reservation_id,
      client_file_ref: prepData.client_file_ref || clientFileRef,
      drive_file_id: driveFileId,
    }),
  });

  if (!compRes.ok) {
    const compErr = await compRes.json().catch(() => ({}));
    throw new Error(compErr.error || `Error verificando archivo en backend (${compRes.status})`);
  }

  const compData: UploadCompleteResponse = await compRes.json();
  if (onProgress) onProgress(100);

  return {
    archivo_id: compData.archivo_id,
    drive_file_id: compData.drive_file_id || driveFileId,
    reservation_id: prepData.reservation_id,
    client_file_ref: prepData.client_file_ref || clientFileRef,
  };
}

/**
 * Mapea y valida la respuesta del backend RPC submission_create_core
 * hacia el modelo canónico del frontend.
 *
 * Contrato backend:
 * - id: uuid
 * - pedido_visible: string (ej: "PED-2026-D001613")
 *
 * Contrato frontend:
 * - pedido_id: uuid
 * - codigo_ped: string (ej: "PED-2026-D001613")
 */
export function mapSubmissionResponse(raw: unknown): SubmissionResponsePayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Respuesta de envío inválida: el servidor no retornó un objeto.');
  }

  const data = raw as Record<string, unknown>;

  if (!data.envio_id || typeof data.envio_id !== 'string') {
    throw new Error('Respuesta de envío inválida: falta envio_id en la respuesta del servidor.');
  }

  if (!Array.isArray(data.pedidos) || data.pedidos.length === 0) {
    throw new Error('Respuesta de envío inválida: no se registraron pedidos en el resultado.');
  }

  const pedidos = data.pedidos.map((p: unknown, idx: number) => {
    if (!p || typeof p !== 'object') {
      throw new Error(`Respuesta de envío inválida: elemento pedido [${idx}] corrupto.`);
    }
    const ped = p as Record<string, unknown>;

    const pedido_id = String(ped.id || ped.pedido_id || '').trim();
    if (!pedido_id) {
      throw new Error(`Respuesta de envío incompleta: el servidor no retornó el identificador del pedido [${idx}].`);
    }

    const codigo_ped = String(ped.pedido_visible || ped.codigo_ped || '').trim();
    if (!codigo_ped) {
      throw new Error(
        `Respuesta de envío incompleta: el servidor no retornó el código identificador visible (pedido_visible) para el pedido [${idx}].`
      );
    }

    const client_request_ref = String(ped.client_request_ref || '').trim();
    const categoria_slug = String(ped.categoria_slug || '').trim();
    const tipo_slug = String(ped.tipo_slug || '').trim();

    return {
      pedido_id,
      codigo_ped,
      client_request_ref,
      categoria_slug,
      tipo_slug,
    };
  });

  const archivos = Array.isArray(data.archivos)
    ? data.archivos.map((a: unknown) => {
        const arch = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        return {
          archivo_id: String(arch.archivo_id || arch.id || '').trim(),
          client_file_ref: String(arch.client_file_ref || '').trim(),
          nombre: String(arch.nombre || arch.nombre_original || '').trim(),
        };
      })
    : undefined;

  return {
    envio_id: data.envio_id,
    submission_key: typeof data.submission_key === 'string' ? data.submission_key : undefined,
    idempotent_replay: Boolean(data.idempotent_replay),
    pedidos,
    archivos,
    archivos_count: typeof data.archivos_count === 'number' ? data.archivos_count : archivos?.length,
  };
}

/**
 * Enviar el formulario y crear atómicamente 1 Envío + N PEDs
 */
export async function submitMultiPedFormulario(
  payload: SubmissionPayload,
  capabilityToken?: string
): Promise<SubmissionResponsePayload> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/submission-create`;

  const headers: Record<string, string> = {
    'apikey': config.supabaseAnonKey,
    'Authorization': `Bearer ${config.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };

  if (capabilityToken) {
    headers['x-capability-token'] = capabilityToken;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Error al procesar la solicitud (${res.status})`);
  }

  const rawJson = await res.json();
  return mapSubmissionResponse(rawJson);
}
