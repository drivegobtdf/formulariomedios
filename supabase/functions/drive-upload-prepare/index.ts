import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import crypto from 'node:crypto';
import {
  getCorsHeaders,
  verifyCapabilityToken,
  validateFileMetadata,
  MAX_FILES_PER_SUBMISSION,
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
    const clientFileRef = crypto.randomUUID();
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

    return new Response(
      JSON.stringify({
        reservation_id: reservationId,
        client_file_ref: clientFileRef,
        archivo_id: archivoId,
        upload_url: resumableSession.uploadUrl,
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
