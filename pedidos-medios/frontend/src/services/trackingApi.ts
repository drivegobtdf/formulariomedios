import { getPublicConfig } from './config';

export interface TrackingPublicDTO {
  id: string;
  pedido_visible: string;
  anio: number;
  numero: number;
  codigo_categoria: string;
  categoria_nombre: string;
  categoria_slug?: string;
  tipo_nombre: string;
  tipo_slug?: string;
  estado: string;
  informacion_especifica?: Record<string, any>;
  created_at: string;
  updated_at: string;
  comunicaciones?: Array<{
    id: string;
    tipo: string;
    destinatario: string;
    created_at: string;
  }>;
  solicitudes_informacion?: Array<{
    id: string;
    mensaje: string;
    estado: string;
    expires_at: string;
    respuesta_texto?: string;
    responded_at?: string;
    created_at: string;
  }>;
  archivos_adjuntos?: Array<{
    id: string;
    nombre: string;
    mime_type: string;
    size_bytes: number;
    contexto: string;
  }>;
  entrega?: {
    id: string;
    version: number;
    nota_publica?: string;
    url_entrega?: string;
    archivo_id?: string;
    created_at: string;
  } | null;
}

export interface InfoTokenValidationResponse {
  valid: boolean;
  responded?: boolean;
  error?: string;
  message?: string;
  expires_at?: string;
  solicitud?: {
    id: string;
    pedido_id: string;
    pedido_visible?: string;
    categoria_nombre?: string;
    tipo_nombre?: string;
    mensaje: string;
    estado: string;
    expires_at: string;
    respuesta_texto?: string;
    responded_at?: string;
    created_at: string;
  };
}

export async function getPublicTracking(pedidoVisible: string, token: string): Promise<TrackingPublicDTO> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/tracking-get`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_visible: pedidoVisible.trim(),
      token: token.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error consultando estado del pedido (${res.status})`);
  }

  return res.json();
}

export async function requestTrackingRecovery(email: string): Promise<{ success: boolean; message: string }> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/tracking-recover`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error al solicitar recuperación (${res.status})`);
  }

  return res.json();
}

export async function validateInfoToken(token: string): Promise<InfoTokenValidationResponse> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/info-token-validate`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token.trim(),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 410) {
    throw new Error(data.message || data.error || `Error validando token (${res.status})`);
  }

  return data;
}

export async function submitInfoResponse(payload: {
  token: string;
  respuesta_texto?: string;
  archivo_ids?: string[];
  enlaces?: string[];
}): Promise<{ success: boolean; solicitud_id: string; pedido_id: string; idempotent?: boolean }> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/info-response-submit`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error al enviar respuesta (${res.status})`);
  }

  return res.json();
}
