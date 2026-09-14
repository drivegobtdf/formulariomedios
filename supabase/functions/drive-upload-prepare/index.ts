import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  getCorsHeaders,
  verifyCapabilityToken,
  validateFileMetadata,
  MAX_FILES_PER_SUBMISSION,
  getSupabaseConfig,
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
      const capabilityToken = req.headers.get('x-capability-token');

      if (!reservationId || !capabilityToken) {
        return new Response(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'reservation_id y capability_token son obligatorios' }),
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

      const session = resData.submission_sessions;
      if (!session || session.estado !== 'abierta' || new Date(session.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La sesión ha expirado o no está abierta' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!verifyCapabilityToken(capabilityToken, session.capability_hash)) {
        return new Response(
          JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
    const { session_id, capability_token, expected_name, expected_size, mime_type, targets } = body;

    if (!session_id || !capability_token) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'session_id y capability_token son obligatorios' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Obtener y validar sesión
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

    // Validar capability token
    if (!verifyCapabilityToken(capability_token, session.capability_hash)) {
      return new Response(
        JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Comprobar límite de 10 archivos por sesión
    const { count: currentReservationsCount, error: countErr } = await supabase
      .from('upload_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)
      .in('state', ['pending', 'uploading', 'completed', 'verified']);

    if (countErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al verificar reservas existentes', details: countErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((currentReservationsCount || 0) >= MAX_FILES_PER_SUBMISSION) {
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
        submission_key: session.submission_key,
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
      contexto: 'solicitud',
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
      session_id: session_id,
      client_file_ref: clientFileRef,
      archivo_id: archivoId,
      drive_file_id: resumableSession.driveFileId || null,
      drive_session_ref: resumableSession.uploadUrl,
      expected_name: expected_name,
      expected_size: Number(expected_size),
      expected_mime: mime_type,
      targets: targets || 'all',
      state: 'pending',
      expires_at: session.expires_at,
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
        expires_at: session.expires_at,
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
