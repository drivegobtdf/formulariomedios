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
export async function uploadFileToDrive(
  sessionId: string,
  capabilityToken: string,
  clientFileRef: string,
  file: File,
  onProgress?: (progressPct: number) => void
): Promise<{ archivo_id: string; drive_file_id: string; reservation_id: string }> {
  const config = getPublicConfig();

  // Paso 1: Preparar reserva de subida
  const prepareUrl = `${config.supabaseUrl}/functions/v1/drive-upload-prepare`;
  const prepRes = await fetch(prepareUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'x-capability-token': capabilityToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      client_file_ref: clientFileRef,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    }),
  });

  if (!prepRes.ok) {
    const prepErr = await prepRes.json().catch(() => ({}));
    throw new Error(prepErr.error || `Error preparando subida (${prepRes.status})`);
  }

  const prepData: UploadPrepareResponse = await prepRes.json();
  if (onProgress) onProgress(20);

  // Paso 2: Subida de bytes
  // Usamos XMLHttpRequest para rastrear progreso de subida real en navegadores
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', prepData.upload_url);
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
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'x-capability-token': capabilityToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      reservation_id: prepData.reservation_id,
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
    drive_file_id: compData.drive_file_id,
    reservation_id: prepData.reservation_id,
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

  return res.json();
}
