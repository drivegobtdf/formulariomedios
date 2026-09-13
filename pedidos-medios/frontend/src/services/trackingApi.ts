import { getPublicConfig } from './config';

// Types for Solicitante "Mis Solicitudes" Flow
export interface SolicitantePedidoListItem {
  id: string;
  pedido_visible: string;
  categoria_nombre: string;
  tipo_nombre: string;
  estado: string;
  created_at: string;
  updated_at: string;
  tiene_entrega: boolean;
  solicitudes_pendientes: number;
}

export interface SolicitantePedidosResponse {
  correo: string;
  total: number;
  pedidos: SolicitantePedidoListItem[];
}

export interface SolicitantePedidoDetailDTO {
  id: string;
  pedido_visible: string;
  anio: number;
  numero: number;
  codigo_categoria: string;
  categoria_nombre: string;
  tipo_nombre: string;
  estado: string;
  created_at: string;
  updated_at: string;
  informacion_especifica: Record<string, any>;
  notas_publicas: Array<{
    id: string;
    texto: string;
    created_at: string;
  }>;
  solicitudes_informacion: Array<{
    id: string;
    mensaje: string;
    estado: string;
    expires_at: string;
    respuesta_texto?: string;
    responded_at?: string;
    created_at: string;
  }>;
  entrega?: {
    id: string;
    version: number;
    nota_publica?: string;
    url_entrega?: string;
    created_at: string;
  } | null;
  archivos_adjuntos: Array<{
    id: string;
    nombre: string;
    mime_type: string;
    size_bytes: number;
    contexto: string;
  }>;
  timeline_publico: Array<{
    evento: string;
    fecha: string;
    detalle?: string;
  }>;
}

// 1. Request access link by email
export async function solicitanteRequestAccess(email: string): Promise<{ ok: boolean; message: string }> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-access-request`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.trim() }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Error al solicitar acceso (${res.status})`);
  }
  return data;
}

// 2. Exchange magic access token for opaque session token
export async function solicitanteSessionExchange(token: string): Promise<{
  ok: boolean;
  session_token: string;
  email: string;
  expires_at: string;
}> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-session-exchange`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: token.trim() }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.message || data.error || `Error al canjear acceso (${res.status})`;
    const err = new Error(errorMsg);
    (err as any).code = data.code || data.error;
    (err as any).status = res.status;
    throw err;
  }
  return data;
}

// 3. List all pedidos for authenticated solicitante session
export async function solicitanteGetPedidos(
  sessionToken: string,
  limit = 50,
  offset = 0
): Promise<SolicitantePedidosResponse> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-pedidos-list`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'x-solicitante-session': sessionToken.trim(),
    },
    body: JSON.stringify({ session_token: sessionToken.trim(), limit, offset }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Error obteniendo pedidos (${res.status})`);
    (err as any).code = data.code || data.error;
    (err as any).status = res.status;
    throw err;
  }
  return data;
}

// 4. Get full sanitized detail of a specific pedido for authenticated solicitante session
export async function solicitanteGetPedidoDetail(
  sessionToken: string,
  pedidoRef: string
): Promise<SolicitantePedidoDetailDTO> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-pedido-detail`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'x-solicitante-session': sessionToken.trim(),
    },
    body: JSON.stringify({ session_token: sessionToken.trim(), pedido_ref: pedidoRef.trim() }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Error obteniendo detalle (${res.status})`);
    (err as any).code = data.code || data.error;
    (err as any).status = res.status;
    throw err;
  }
  return data;
}

// 5. Submit response to 48h info request under authenticated solicitante session
export async function solicitanteSubmitInfoResponse(
  sessionToken: string,
  solicitudId: string,
  respuestaTexto: string,
  enlaces: string[] = [],
  archivos: string[] = []
): Promise<{ ok: boolean; solicitud_id: string; pedido_id: string; estado_pedido: string }> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-info-respond`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'x-solicitante-session': sessionToken.trim(),
    },
    body: JSON.stringify({
      session_token: sessionToken.trim(),
      solicitud_id: solicitudId.trim(),
      respuesta_texto: respuestaTexto.trim(),
      enlaces,
      archivos,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Error al enviar respuesta (${res.status})`);
    (err as any).code = data.code || data.error;
    (err as any).status = res.status;
    throw err;
  }
  return data;
}

// 6. Revoke solicitante session on logout
export async function solicitanteSessionRevoke(sessionToken: string): Promise<{ ok: boolean; revoked: boolean }> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/solicitante-session-revoke`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'x-solicitante-session': sessionToken.trim(),
    },
    body: JSON.stringify({ session_token: sessionToken.trim() }),
  });

  return res.json().catch(() => ({ ok: true, revoked: true }));
}

// Legacy helpers maintained for backward compatibility
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

export async function exchangeTrackingToken(exchangeToken: string): Promise<{
  success: boolean;
  pedido_id: string;
  pedido_visible: string;
  tracking_token: string;
  token_version: number;
}> {
  const config = getPublicConfig();
  const endpoint = `${config.supabaseUrl}/functions/v1/tracking-exchange`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      exchange_token: exchangeToken.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error canjeando token de recuperación (${res.status})`);
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
