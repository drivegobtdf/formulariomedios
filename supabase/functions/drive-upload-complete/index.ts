import { createClient } from '@supabase/supabase-js';
import {
  getCorsHeaders,
  verifyCapabilityToken,
  getSupabaseConfig,
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
    const { session_id, capability_token, reservation_id, client_file_ref, drive_file_id } = body;

    if (!session_id || !capability_token || !reservation_id || !client_file_ref || !drive_file_id) {
      return new Response(
        JSON.stringify({
          error: 'BAD_REQUEST',
          message: 'session_id, capability_token, reservation_id, client_file_ref y drive_file_id son obligatorios',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    if (!verifyCapabilityToken(capability_token, session.capability_hash)) {
      return new Response(
        JSON.stringify({ error: 'INVALID_CAPABILITY', message: 'capability_token inválido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener reserva
    const { data: reservation, error: resErr } = await supabase
      .from('upload_reservations')
      .select('*, archivos(*)')
      .eq('id', reservation_id)
      .eq('session_id', session_id)
      .maybeSingle();

    if (resErr || !reservation) {
      return new Response(
        JSON.stringify({ error: 'RESERVATION_NOT_FOUND', message: 'Reserva de carga no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (reservation.client_file_ref !== client_file_ref) {
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
        submission_key: session.submission_key,
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
