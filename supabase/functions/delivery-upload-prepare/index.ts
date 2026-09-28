import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { Buffer } from 'node:buffer';
import {
  getCorsHeaders,
  validateFileMetadata,
  verifyUserRole,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SUBMISSION,
  getSupabaseConfig,
  resolvePublicRelayBaseUrl,
} from '../_shared/security.ts';
import { getDriveAdapter, computeUniqueFileName } from '../_shared/drive-adapter.ts';

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
    const { supabaseUrl, publishableKey, serviceRoleKey } = getSupabaseConfig();

    // 1. Extraer y verificar Token JWT de autenticación del usuario interno
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
          message: 'Usuario no cuenta con aprobación activa o rol habilitado para subir entregas',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // MODO RELAY: PUT directo desde el navegador hacia Google Drive en streaming
    // -------------------------------------------------------------------------
    if (req.method === 'PUT') {
      const url = new URL(req.url);
      const reservationId = url.searchParams.get('reservation_id') || req.headers.get('x-reservation-id');

      if (!reservationId) {
        return new Response(
          JSON.stringify({ error: 'BAD_REQUEST', message: 'reservation_id es obligatorio' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: resData, error: resErr } = await adminClient
        .from('upload_reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle();

      if (resErr || !resData) {
        return new Response(
          JSON.stringify({ error: 'RESERVATION_NOT_FOUND', message: 'Reserva de carga no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        const adapter = getDriveAdapter();
        if ('storeFileBuffer' in adapter) {
          const bodyBytes = req.body ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array();
          (adapter as { storeFileBuffer: (...args: unknown[]) => unknown }).storeFileBuffer(
            driveFileId || `mock_drive_file_${reservationId}`,
            resData.expected_name,
            resData.expected_mime || 'application/octet-stream',
            Buffer.from(bodyBytes),
            { reservation_id: reservationId },
            (resData as any).drive_parent_id || null
          );
        }
      } else {
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
            JSON.stringify({
              error: 'DRIVE_UPLOAD_FAILED',
              message: `Fallo en almacenamiento Google Drive (${driveRes.status}): ${errText}`,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const driveData = await driveRes.json().catch(() => ({}));
        if (driveData.id) driveFileId = driveData.id;
      }

      await adminClient.from('upload_reservations').update({ drive_file_id: driveFileId, state: 'uploading' }).eq('id', reservationId);
      if (resData.archivo_id && driveFileId) {
        await adminClient.from('archivos').update({ drive_file_id: driveFileId }).eq('id', resData.archivo_id);
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

    // -------------------------------------------------------------------------
    // MODO POST: Preparar sesión de subida para archivo de entrega
    // -------------------------------------------------------------------------
    const body = await req.json();
    const { pedido_id, expected_name, expected_size, mime_type, client_file_ref } = body;

    if (!pedido_id) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'pedido_id es obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validar estado del pedido (debe estar en 'En proceso')
    const { data: ped, error: pedErr } = await adminClient
      .from('pedidos')
      .select('id, pedido_visible, estado')
      .eq('id', pedido_id)
      .maybeSingle();

    if (pedErr || !ped) {
      return new Response(
        JSON.stringify({ error: 'PEDIDO_NOT_FOUND', message: 'Pedido no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (ped.estado !== 'En proceso') {
      return new Response(
        JSON.stringify({
          error: 'INVALID_STATE',
          message: `No se pueden cargar entregas para un pedido en estado '${ped.estado}'. Debe estar 'En proceso'`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validar metadata del archivo
    const metaCheck = validateFileMetadata(expected_name, mime_type, Number(expected_size));
    if (!metaCheck.valid) {
      return new Response(
        JSON.stringify({ error: 'METADATA_INVALID', message: metaCheck.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Validar límite de archivos de entrega para este pedido
    const { count: currentFilesCount, error: countErr } = await adminClient
      .from('archivos')
      .select('id', { count: 'exact', head: true })
      .eq('contexto', 'entrega')
      .eq('estado', 'verified')
      .in(
        'id',
        (
          await adminClient.from('archivo_pedido').select('archivo_id').eq('pedido_id', pedido_id)
        ).data?.map((r) => r.archivo_id) || []
      );

    if (!countErr && (currentFilesCount || 0) >= MAX_FILES_PER_SUBMISSION) {
      return new Response(
        JSON.stringify({
          error: 'MAX_FILES_EXCEEDED',
          message: `Se ha alcanzado el límite máximo de ${MAX_FILES_PER_SUBMISSION} archivos de entrega por pedido`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Resolver/Crear carpeta ENVIADO-{pedido_visible} en Google Drive
    const driveAdapter = getDriveAdapter();
    const rootFolderId = await driveAdapter.ensureRootFolder();
    const folderName = `ENVIADO-${ped.pedido_visible}`;
    const entregaFolderId = await driveAdapter.ensureFolder(rootFolderId, folderName);

    // Persistir folder mapping en PostgreSQL
    await adminClient.rpc('register_pedido_drive_folder', {
      p_pedido_id: ped.id,
      p_folder_type: 'enviado',
      p_drive_folder_id: entregaFolderId,
      p_folder_name: folderName,
      p_organization_status: 'completed',
      p_last_error: null,
    });

    // 7. Resolver nombre único para evitar colisiones visuales en Drive
    const { data: existingFiles } = await adminClient
      .from('archivos')
      .select('nombre_original')
      .eq('contexto', 'entrega')
      .in(
        'id',
        (
          await adminClient.from('archivo_pedido').select('archivo_id').eq('pedido_id', pedido_id)
        ).data?.map((r) => r.archivo_id) || []
      );

    const existingNames = (existingFiles || []).map((f) => f.nombre_original).filter(Boolean);
    const uniqueDriveName = computeUniqueFileName(existingNames, expected_name);

    const reservationId = crypto.randomUUID();
    const archivoId = crypto.randomUUID();
    const targetFileRef = (client_file_ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_file_ref))
      ? client_file_ref
      : crypto.randomUUID();

    // 8. Crear sesión resumible de Google Drive en la carpeta ENVIADO
    const resumableSession = await driveAdapter.createResumableUploadSession({
      fileName: uniqueDriveName,
      mimeType: mime_type,
      fileSize: Number(expected_size),
      parentFolderId: entregaFolderId,
      appProperties: {
        pedido_id: ped.id,
        pedido_visible: ped.pedido_visible,
        reservation_id: reservationId,
        client_file_ref: targetFileRef,
        contexto: 'entrega',
      },
    });

    const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString();

    // 9. Insertar registros en archivos y upload_reservations
    const { error: archErr } = await adminClient.from('archivos').insert({
      id: archivoId,
      drive_file_id: resumableSession.driveFileId || null,
      nombre_original: expected_name,
      mime_type: mime_type,
      size_bytes: Number(expected_size),
      estado: 'reserved',
      contexto: 'entrega',
    });

    if (archErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al registrar archivo en base de datos', details: archErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: resErr } = await adminClient.from('upload_reservations').insert({
      id: reservationId,
      pedido_id: ped.id,
      client_file_ref: targetFileRef,
      archivo_id: archivoId,
      expected_name: expected_name,
      expected_size: Number(expected_size),
      expected_mime: mime_type,
      drive_session_ref: resumableSession.uploadUrl,
      drive_file_id: resumableSession.driveFileId || null,
      state: 'pending',
      expires_at: expiresAt,
    });

    if (resErr) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al registrar reserva de subida', details: resErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const relayBaseUrl = resolvePublicRelayBaseUrl();
    const relayUploadUrl = `${relayBaseUrl}/functions/v1/delivery-upload-prepare?reservation_id=${encodeURIComponent(reservationId)}`;

    return new Response(
      JSON.stringify({
        success: true,
        reservation_id: reservationId,
        archivo_id: archivoId,
        client_file_ref: targetFileRef,
        drive_session_ref: resumableSession.uploadUrl,
        relay_upload_url: relayUploadUrl,
        expires_at: expiresAt,
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

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
