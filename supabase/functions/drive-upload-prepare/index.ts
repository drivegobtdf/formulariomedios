import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  getCorsHeaders,
  verifyCapabilityToken,
  validateFileMetadata,
  MAX_FILES_PER_SUBMISSION,
  getSupabaseConfig,
  computeSha256Hex,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';
import { getEnv } from '../_shared/env.ts';

/**
 * Resuelve la URL base pública del relay de almacenamiento.
 * Valida mediante la API URL y compara exact origin.
 * Solo permite localhost en entorno local explícito.
 * En Cloud, si falta una URL pública válida, arroja un error controlado (sin fallback a 127.0.0.1).
 */
export function resolvePublicRelayBaseUrl(
  publicSupabaseUrl = getEnv('PUBLIC_SUPABASE_URL'),
  supabaseUrlEnv = getEnv('SUPABASE_URL'),
  isExplicitLocal = Boolean(
    getEnv('ENVIRONMENT') === 'local' ||
    getEnv('APP_ENV') === 'local' ||
    getEnv('LOCAL_DEV') === 'true' ||
    (getEnv('SUPABASE_URL') || '').includes('127.0.0.1') ||
    (getEnv('SUPABASE_URL') || '').includes('localhost')
  )
): string {
  if (publicSupabaseUrl) {
    try {
      const parsed = new URL(publicSupabaseUrl);
      if (parsed.protocol === 'https:') {
        return parsed.origin;
      }
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && isExplicitLocal) {
        return parsed.origin;
      }
    } catch {
      // Ignorar URL no parseable
    }
  }

  if (supabaseUrlEnv) {
    try {
      const parsed = new URL(supabaseUrlEnv);
      if (parsed.protocol === 'https:') {
        return parsed.origin;
      }
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && isExplicitLocal) {
        return parsed.origin;
      }
    } catch {
      // Ignorar URL no parseable
    }
  }

  throw new Error('CONFIG_ERROR: No se encontró una URL pública o local válida configurada para el relay de almacenamiento');
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // -------------------------------------------------------------------------
    // MODO RELAY: PUT directo desde el navegador hacia Google Drive en streaming
    // -------------------------------------------------------------------------
    if (req.method === 'PUT') {
      const url = new URL(req.url);
      const reservationId = url.searchParams.get('reservation_id') || req.headers.get('x-reservation-id');
      const capabilityToken = req.headers.get('x-capability-token') || req.headers.get('x-info-token') || req.headers.get('x-session-token');

      if (!reservationId || !capabilityToken) {
        return new Response(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'reservation_id y token de autorización son obligatorios' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: resData, error: resErr } = await supabase
        .from('upload_reservations')
        .select('*, submission_sessions(*)')
        .eq('id', reservationId)
        .maybeSingle();

      if (resErr || !resData) {
        return new Response(
          JSON.stringify({ error: 'RESERVATION_NOT_FOUND', message: 'Reserva de carga no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (resData.solicitud_id) {
        // Validación para reservas originadas en requerimientos de información
        const { data: solData } = await supabase
          .from('solicitudes_informacion')
          .select('*')
          .eq('id', resData.solicitud_id)
          .maybeSingle();

        if (!solData || solData.estado !== 'pendiente' || new Date(solData.expires_at).getTime() <= Date.now()) {
          return new Response(
            JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La solicitud de información ha expirado o ya no está abierta' }),
            { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const infoTokenHash = await computeSha256Hex(capabilityToken.trim());
        if (solData.token_hash !== infoTokenHash) {
          const { data: solSession } = await supabase
            .from('solicitante_sessions')
            .select('correo, expires_at')
            .eq('session_token_hash', infoTokenHash)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

          if (!solSession) {
            return new Response(
              JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'Token de autorización inválido' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } else {
        // Validación estándar para reservas de formulario público
        const session = resData.submission_sessions;
        if (!session || session.estado !== 'abierta' || new Date(session.expires_at).getTime() <= Date.now()) {
          return new Response(
            JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La sesión ha expirado o no está abierta' }),
            { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!(await verifyCapabilityToken(capabilityToken, session.capability_hash))) {
          return new Response(
            JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (!resData.drive_session_ref) {
        return new Response(
          JSON.stringify({ error: 'DRIVE_SESSION_MISSING', message: 'URI de sesión de almacenamiento no disponible' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let driveFileId = resData.drive_file_id || '';

      if (resData.drive_session_ref.includes('mock')) {
        // En entorno mock local, no se requiere forward HTTP externo
        const adapter = getDriveAdapter();
        if ('storeFileBuffer' in adapter) {
          const bodyBytes = req.body ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array();
          (adapter as { storeFileBuffer: (...args: unknown[]) => unknown }).storeFileBuffer(
            driveFileId || `mock_drive_file_${reservationId}`,
            resData.expected_name,
            resData.expected_mime || 'application/octet-stream',
            Buffer.from(bodyBytes),
            { reservation_id: reservationId },
            resData.drive_parent_id
          );
        }
      } else {
        // Relay en streaming directo hacia Google Drive
        const driveHeaders: Record<string, string> = {
          'Content-Type': resData.expected_mime || req.headers.get('content-type') || 'application/octet-stream',
        };
        if (resData.expected_size) {
          driveHeaders['Content-Length'] = resData.expected_size.toString();
        }

        const driveRes = await fetch(resData.drive_session_ref, {
          method: 'PUT',
          headers: driveHeaders,
          body: req.body,
        });

        if (!driveRes.ok) {
          const errText = await driveRes.text();
          return new Response(
            JSON.stringify({ error: 'DRIVE_UPLOAD_FAILED', message: `Fallo en almacenamiento Google Drive (${driveRes.status}): ${errText}` }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const driveData = await driveRes.json().catch(() => ({}));
        if (driveData.id) driveFileId = driveData.id;
      }

      await supabase.from('upload_reservations').update({ drive_file_id: driveFileId, state: 'uploading' }).eq('id', reservationId);
      if (resData.archivo_id && driveFileId) {
        await supabase.from('archivos').update({ drive_file_id: driveFileId }).eq('id', resData.archivo_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          reservation_id: reservationId,
          client_file_ref: resData.client_file_ref,
          archivo_id: resData.archivo_id,
          drive_file_id: driveFileId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { session_id, capability_token, info_token, session_token, solicitud_id, expected_name, expected_size, mime_type, targets } = body;

    let targetSubmissionKey = '';
    let targetExpiresAt = '';
    let targetContexto = 'solicitud';
    let targetSolicitudId: string | null = null;
    let targetPedidoId: string | null = null;
    let targetSessionId: string | null = null;

    if (info_token) {
      // 1A. Validación de token de requerimiento de información
      const tokenHash = await computeSha256Hex(String(info_token).trim());
      const { data: sol, error: solErr } = await supabase
        .from('solicitudes_informacion')
        .select('id, pedido_id, estado, expires_at, pedidos:pedido_id(pedido_visible)')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (solErr || !sol) {
        return new Response(
          JSON.stringify({ error: 'TOKEN_NOT_FOUND', message: 'Solicitud de información no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (sol.estado !== 'pendiente' || new Date(sol.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'TOKEN_EXPIRED', message: 'La solicitud de información ha expirado tras las 48 horas corridas' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetSolicitudId = sol.id;
      targetPedidoId = sol.pedido_id;
      targetExpiresAt = sol.expires_at;
      targetContexto = 'informacion_respuesta';
      targetSubmissionKey = `info_${sol.id}`;
    } else if (session_token && solicitud_id) {
      // 1B. Validación de sesión autenticada de solicitante
      const tokenHash = await computeSha256Hex(String(session_token).trim());
      const { data: solSession, error: sessErr } = await supabase
        .from('solicitante_sessions')
        .select('correo, expires_at')
        .eq('session_token_hash', tokenHash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (sessErr || !solSession) {
        return new Response(
          JSON.stringify({ error: 'SESSION_INVALID', message: 'Sesión de solicitante inválida o expirada' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: sol, error: solErr } = await supabase
        .from('solicitudes_informacion')
        .select('id, pedido_id, estado, expires_at')
        .eq('id', solicitud_id)
        .maybeSingle();

      if (solErr || !sol) {
        return new Response(
          JSON.stringify({ error: 'SOLICITUD_NOT_FOUND', message: 'Solicitud de información no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (sol.estado !== 'pendiente' || new Date(sol.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'SOLICITUD_EXPIRED', message: 'La solicitud de información ha expirado tras 48 horas corridas' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetSolicitudId = sol.id;
      targetPedidoId = sol.pedido_id;
      targetExpiresAt = sol.expires_at;
      targetContexto = 'informacion_respuesta';
      targetSubmissionKey = `info_${sol.id}`;
    } else {
      // 1C. Validación de sesión pública estándar
      if (!session_id || !capability_token) {
        return new Response(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'session_id y capability_token o info_token son obligatorios' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: session, error: sessionErr } = await supabase
        .from('submission_sessions')
        .select('*')
        .eq('id', session_id)
        .maybeSingle();

      if (sessionErr || !session) {
        return new Response(
          JSON.stringify({ error: 'SESSION_NOT_FOUND', message: 'Sesión de envío no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.estado !== 'abierta' || new Date(session.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La sesión de envío ha expirado o ya no está abierta' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!(await verifyCapabilityToken(capability_token, session.capability_hash))) {
        return new Response(
          JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetSessionId = session.id;
      targetSubmissionKey = session.submission_key;
      targetExpiresAt = session.expires_at;
    }

    // 2. Comprobar límite de 10 archivos por sesión / requerimiento
    let currentReservationsCount = 0;
    if (targetSessionId) {
      const { count, error: countErr } = await supabase
        .from('upload_reservations')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', targetSessionId)
        .in('state', ['pending', 'uploading', 'completed', 'verified']);
      if (countErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: 'Error al verificar reservas existentes', details: countErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      currentReservationsCount = count || 0;
    } else if (targetSolicitudId) {
      const { count, error: countErr } = await supabase
        .from('upload_reservations')
        .select('*', { count: 'exact', head: true })
        .eq('solicitud_id', targetSolicitudId)
        .in('state', ['pending', 'uploading', 'completed', 'verified']);
      if (countErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: 'Error al verificar reservas existentes', details: countErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      currentReservationsCount = count || 0;
    }

    if (currentReservationsCount >= MAX_FILES_PER_SUBMISSION) {
      return new Response(
        JSON.stringify({
          error: 'MAX_FILES_EXCEEDED',
          message: `Se ha alcanzado el límite máximo de ${MAX_FILES_PER_SUBMISSION} archivos por presentación`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validar metadata de archivo
    const metaCheck = validateFileMetadata(expected_name, mime_type, Number(expected_size));
    if (!metaCheck.valid) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: metaCheck.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Preparar sesión de subida en Google Drive
    const adapter = getDriveAdapter();
    const rootFolderId = await adapter.ensureRootFolder();
    const stagingFolderId = await adapter.ensureStagingFolder(rootFolderId);

    const reservationId = crypto.randomUUID();
    const clientFileRef = (body.client_file_ref && typeof body.client_file_ref === 'string') ? body.client_file_ref : crypto.randomUUID();
    const archivoId = crypto.randomUUID();

    const resumableSession = await adapter.createResumableUploadSession({
      fileName: expected_name,
      mimeType: mime_type,
      fileSize: Number(expected_size),
      parentFolderId: stagingFolderId,
      appProperties: {
        submission_key: targetSubmissionKey,
        client_file_ref: clientFileRef,
        reservation_id: reservationId,
      },
    });

    // 5. Registrar metadata de archivo y reserva en base de datos
    const { error: archErr } = await supabase.from('archivos').insert({
      id: archivoId,
      provider: 'google_drive',
      drive_file_id: resumableSession.driveFileId || null,
      drive_parent_id: stagingFolderId,
      nombre_original: expected_name,
      mime_type: mime_type,
      size_bytes: Number(expected_size),
      contexto: targetContexto,
      estado: 'reserved',
    });

    if (archErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al registrar archivo', details: archErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: resErr } = await supabase.from('upload_reservations').insert({
      id: reservationId,
      session_id: targetSessionId,
      solicitud_id: targetSolicitudId,
      pedido_id: targetPedidoId,
      client_file_ref: clientFileRef,
      archivo_id: archivoId,
      drive_file_id: resumableSession.driveFileId || null,
      drive_session_ref: resumableSession.uploadUrl,
      expected_name: expected_name,
      expected_size: Number(expected_size),
      expected_mime: mime_type,
      targets: targets || 'all',
      state: 'pending',
      expires_at: targetExpiresAt,
    });

    if (resErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al registrar reserva de carga', details: resErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let baseUrl: string;
    try {
      baseUrl = resolvePublicRelayBaseUrl();
    } catch (configErr) {
      return new Response(
        JSON.stringify({
          error: 'CONFIG_ERROR',
          message: (configErr as Error)?.message || 'Error de configuración de almacenamiento',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const relayUrl = `${baseUrl}/functions/v1/drive-upload-prepare?reservation_id=${reservationId}`;

    return new Response(
      JSON.stringify({
        reservation_id: reservationId,
        client_file_ref: clientFileRef,
        archivo_id: archivoId,
        upload_url: resumableSession.uploadUrl,
        relay_url: relayUrl,
        expires_at: targetExpiresAt,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
