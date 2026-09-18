import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  verifyCapabilityToken,
  getSupabaseConfig,
  computeSha256Hex,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
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

    const body = await req.json();
    const { session_id, capability_token, info_token, session_token, reservation_id } = body;

    if (!reservation_id || (!session_id && !info_token && !session_token)) {
      return new Response(
        JSON.stringify({
          error: 'BAD_REQUEST',
          message: 'reservation_id y credencial de autorización son obligatorios',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let targetSubmissionKey = '';

    if (info_token) {
      // 1A. Validación de token de solicitud de información
      const tokenHash = await computeSha256Hex(String(info_token).trim());
      const { data: sol, error: solErr } = await supabase
        .from('solicitudes_informacion')
        .select('id, pedido_id, estado, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (solErr || !sol) {
        return new Response(
          JSON.stringify({ error: 'SESSION_NOT_FOUND', message: 'Solicitud de información no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetSubmissionKey = `info_${sol.id}`;
    } else if (session_token) {
      // 1B. Validación de sesión de solicitante
      const tokenHash = await computeSha256Hex(String(session_token).trim());
      const { data: solSession, error: sessErr } = await supabase
        .from('solicitante_sessions')
        .select('correo, expires_at')
        .eq('session_token_hash', tokenHash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (sessErr || !solSession) {
        return new Response(
          JSON.stringify({ error: 'SESSION_INVALID', message: 'Sesión de solicitante no válida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // 1C. Validación de sesión pública estándar
      if (!session_id || !capability_token) {
        return new Response(
          JSON.stringify({ error: 'BAD_REQUEST', message: 'session_id y capability_token son obligatorios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: session, error: sessionErr } = await supabase
        .from('submission_sessions')
        .select('*')
        .eq('id', session_id)
        .maybeSingle();

      if (sessionErr || !session) {
        return new Response(
          JSON.stringify({ error: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.estado !== 'abierta' || new Date(session.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La sesión ha expirado o ya no está abierta' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!(await verifyCapabilityToken(capability_token, session.capability_hash))) {
        return new Response(
          JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetSubmissionKey = session.submission_key;
    }

    // 2. Obtener reserva
    const resQuery = supabase
      .from('upload_reservations')
      .select('*, archivos(*)')
      .eq('id', reservation_id);

    if (session_id) {
      resQuery.eq('session_id', session_id);
    }

    const { data: reservation, error: resErr } = await resQuery.maybeSingle();

    if (resErr || !reservation) {
      return new Response(
        JSON.stringify({ error: 'RESERVATION_NOT_FOUND', message: 'Reserva de carga no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!targetSubmissionKey && reservation.solicitud_id) {
      targetSubmissionKey = `info_${reservation.solicitud_id}`;
    }

    const client_file_ref = body.client_file_ref || reservation.client_file_ref;
    const drive_file_id = body.drive_file_id || reservation.drive_file_id;

    if (!drive_file_id) {
      return new Response(
        JSON.stringify({ error: 'DRIVE_FILE_MISSING', message: 'No se encontró drive_file_id en la reserva' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.client_file_ref && reservation.client_file_ref && reservation.client_file_ref !== body.client_file_ref) {
      return new Response(
        JSON.stringify({ error: 'CLIENT_REF_MISMATCH', message: 'client_file_ref no coincide con la reserva' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verificar archivo en Google Drive API
    const adapter = getDriveAdapter();
    const verification = await adapter.verifyUploadedFile(drive_file_id, {
      name: reservation.expected_name,
      size: Number(reservation.expected_size),
      mimeType: reservation.expected_mime,
      appProperties: {
        submission_key: targetSubmissionKey,
        client_file_ref: client_file_ref,
        reservation_id: reservation_id,
      },
    });

    if (!verification.verified || !verification.file) {
      return new Response(
        JSON.stringify({
          error: 'DRIVE_VERIFICATION_FAILED',
          message: verification.error || 'No se pudo verificar el archivo en Google Drive',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Actualizar metadata de archivo y reserva en base de datos
    const nowIso = new Date().toISOString();

    const { error: updateArchErr } = await supabase
      .from('archivos')
      .update({
        drive_file_id: drive_file_id,
        estado: 'verified',
        size_bytes: verification.file.size,
        sha256: verification.file.md5Checksum || null,
      })
      .eq('id', reservation.archivo_id);

    if (updateArchErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al actualizar estado del archivo', details: updateArchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateResErr } = await supabase
      .from('upload_reservations')
      .update({
        state: 'completed',
        drive_file_id: drive_file_id,
        completed_at: nowIso,
      })
      .eq('id', reservation_id);

    if (updateResErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al actualizar reserva', details: updateResErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        archivo_id: reservation.archivo_id,
        client_file_ref: client_file_ref,
        drive_file_id: drive_file_id,
        verified: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
