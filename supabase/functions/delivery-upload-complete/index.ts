import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  verifyUserRole,
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
    const { supabaseUrl, publishableKey, serviceRoleKey } = getSupabaseConfig();

    // 1. Extraer y verificar Token JWT de autenticación
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Cabecera Authorization Bearer requerida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '').trim();

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Token JWT inválido o expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Verificar rol RBAC ('administrador' o 'equipo' aprobado)
    const userAccess = await verifyUserRole(adminClient, userData.user.id);
    if (!userAccess.approved || (userAccess.role !== 'administrador' && userAccess.role !== 'equipo')) {
      return new Response(
        JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Usuario no cuenta con aprobación activa o rol habilitado para verificar entregas',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { pedido_id, reservation_id, client_file_ref } = body;

    if (!reservation_id || !pedido_id) {
      return new Response(
        JSON.stringify({
          error: 'BAD_REQUEST',
          message: 'pedido_id y reservation_id son obligatorios',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Obtener reserva
    const { data: reservation, error: resErr } = await adminClient
      .from('upload_reservations')
      .select('*, archivos(*)')
      .eq('id', reservation_id)
      .maybeSingle();

    if (resErr || !reservation) {
      return new Response(
        JSON.stringify({ error: 'RESERVATION_NOT_FOUND', message: 'Reserva de carga no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const drive_file_id = body.drive_file_id || reservation.drive_file_id;

    if (!drive_file_id) {
      return new Response(
        JSON.stringify({ error: 'DRIVE_FILE_MISSING', message: 'No se encontró drive_file_id en la reserva' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verificar archivo en Google Drive API
    const adapter = getDriveAdapter();
    const verification = await adapter.verifyUploadedFile(drive_file_id, {
      name: reservation.expected_name,
      size: Number(reservation.expected_size),
      mimeType: reservation.expected_mime,
      appProperties: {
        pedido_id: pedido_id,
        reservation_id: reservation_id,
      },
    });

    if (!verification.verified || !verification.file) {
      return new Response(
        JSON.stringify({
          error: 'DRIVE_VERIFICATION_FAILED',
          message: verification.error || 'No se pudo verificar el archivo de entrega en Google Drive',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Actualizar metadata de archivo y reserva en base de datos
    const nowIso = new Date().toISOString();

    const { error: updateArchErr } = await adminClient
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

    const { error: updateResErr } = await adminClient
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
        client_file_ref: client_file_ref || reservation.client_file_ref,
        drive_file_id: drive_file_id,
        nombre_original: reservation.expected_name,
        size_bytes: verification.file.size,
        mime_type: reservation.expected_mime,
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

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
