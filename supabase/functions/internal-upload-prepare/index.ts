import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { Buffer } from 'node:buffer';
import {
  getCorsHeaders,
  getSupabaseConfig,
  verifyUserRole,
  validateFileMetadata,
  MAX_FILE_SIZE_ENTREGA_BYTES,
  MAX_FILES_ENTREGA,
  resolvePublicRelayBaseUrl,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

/** CAM-11: adjuntos de referencia de pedidos internos; no son entregables. */
export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  const json = (data: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'PUT') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { supabaseUrl, publishableKey, serviceRoleKey } = getSupabaseConfig();
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt || !/^Bearer\s+/i.test(req.headers.get('authorization') || '')) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }

    const sessionClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await sessionClient.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'UNAUTHORIZED' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actorId = userData.user.id;
    const access = await verifyUserRole(admin, actorId);
    if (!access.approved || !['administrador', 'equipo'].includes(access.role || '')) {
      return json({ error: 'FORBIDDEN' }, 403);
    }

    // El creador puede adjuntar referencias a su pedido interno; un administrador también.
    const loadAuthorizedPedido = async (pedidoId: string) => {
      const { data: ped, error } = await admin.from('pedidos')
        .select('id, origen, estado, pedido_visible, created_by_user_id')
        .eq('id', pedidoId).maybeSingle();
      if (error || !ped || ped.origen !== 'interno') return null;
      if (access.role !== 'administrador' && ped.created_by_user_id !== actorId) return null;
      return ped;
    };

    if (req.method === 'PUT') {
      const reservationId = new URL(req.url).searchParams.get('reservation_id');
      if (!reservationId) return json({ error: 'BAD_REQUEST' }, 400);
      const { data: reservation, error } = await admin.from('upload_reservations')
        .select('*, archivos(contexto,uploaded_by_user_id,estado)')
        .eq('id', reservationId).maybeSingle();
      if (error || !reservation || reservation.archivos?.contexto !== 'interno') {
        return json({ error: 'RESERVATION_NOT_FOUND' }, 404);
      }
      const ped = await loadAuthorizedPedido(reservation.pedido_id);
      if (!ped || reservation.archivos.uploaded_by_user_id !== actorId && access.role !== 'administrador') {
        return json({ error: 'FORBIDDEN' }, 403);
      }
      if (!['Nuevo', 'En revisión', 'En proceso'].includes(ped.estado)) {
        return json({ error: 'INVALID_STATE', message: 'El pedido interno ya no acepta adjuntos de referencia' }, 422);
      }
      if (!['pending', 'uploading'].includes(reservation.state) || new Date(reservation.expires_at).getTime() < Date.now()) {
        return json({ error: 'RESERVATION_EXPIRED_OR_COMPLETED' }, 409);
      }
      if (!reservation.drive_session_ref || !req.body) return json({ error: 'DRIVE_SESSION_MISSING' }, 400);
      const claimedLength = Number(req.headers.get('content-length'));
      if (Number.isFinite(claimedLength) && claimedLength > 0 && claimedLength !== Number(reservation.expected_size)) {
        return json({ error: 'FILE_SIZE_MISMATCH' }, 422);
      }

      let fileId = reservation.drive_file_id || '';
      if (reservation.drive_session_ref.includes('mock')) {
        const adapter = getDriveAdapter();
        if (!('storeFileBuffer' in adapter)) return json({ error: 'MOCK_ADAPTER_UNAVAILABLE' }, 500);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (bytes.byteLength !== Number(reservation.expected_size)) return json({ error: 'FILE_SIZE_MISMATCH' }, 422);
        fileId ||= `mock_drive_file_${reservationId}`;
        await (adapter as { storeFileBuffer: (...args: unknown[]) => unknown }).storeFileBuffer(
          fileId, reservation.expected_name, reservation.expected_mime,
          Buffer.from(bytes), { pedido_id: ped.id, reservation_id: reservationId, contexto: 'interno' }
        );
      } else {
        const uploadRes = await fetch(reservation.drive_session_ref, {
          method: 'PUT',
          headers: {
            'Content-Type': reservation.expected_mime || 'application/octet-stream',
            'Content-Length': String(reservation.expected_size),
          },
          body: req.body,
        });
        if (!uploadRes.ok) return json({ error: 'DRIVE_UPLOAD_FAILED', status: uploadRes.status }, 502);
        const payload = await uploadRes.json().catch(() => ({}));
        fileId = payload.id || fileId;
      }
      if (!fileId) return json({ error: 'DRIVE_FILE_MISSING' }, 502);
      const { error: resUpdate } = await admin.from('upload_reservations')
        .update({ drive_file_id: fileId, state: 'uploading' }).eq('id', reservationId);
      if (resUpdate) return json({ error: 'DB_ERROR', phase: 'reservation_update' }, 500);
      const { error: archUpdate } = await admin.from('archivos')
        .update({ drive_file_id: fileId }).eq('id', reservation.archivo_id);
      if (archUpdate) return json({ error: 'DB_ERROR', phase: 'file_update' }, 500);
      return json({ success: true, reservation_id: reservationId, archivo_id: reservation.archivo_id, drive_file_id: fileId }, 200);
    }

    const body = await req.json();
    const pedidoId = typeof body.pedido_id === 'string' ? body.pedido_id : '';
    const ped = pedidoId ? await loadAuthorizedPedido(pedidoId) : null;
    if (!ped) return json({ error: 'PEDIDO_NOT_FOUND_OR_FORBIDDEN' }, 404);
    if (!['Nuevo', 'En revisión', 'En proceso'].includes(ped.estado)) {
      return json({ error: 'INVALID_STATE', message: 'El pedido interno ya no acepta adjuntos de referencia' }, 422);
    }
    const name = typeof body.expected_name === 'string' ? body.expected_name : '';
    const mime = typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream';
    const size = Number(body.expected_size);
    const check = validateFileMetadata(name, mime, size, MAX_FILE_SIZE_ENTREGA_BYTES);
    if (!check.valid || !Number.isFinite(size)) return json({ error: 'METADATA_INVALID', message: check.error }, 400);
    const clientFileRef = typeof body.client_file_ref === 'string' ? body.client_file_ref : '';
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(clientFileRef)) {
      return json({ error: 'CLIENT_FILE_REF_REQUIRED' }, 400);
    }

    const { data: reservations, error: listErr } = await admin.from('upload_reservations')
      .select('id, archivo_id, client_file_ref, state, expires_at, expected_name, expected_size, expected_mime, drive_file_id, archivos(contexto,estado)')
      .eq('pedido_id', pedidoId);
    if (listErr) return json({ error: 'DB_ERROR', phase: 'reservation_list' }, 500);
    const internals = (reservations || []).filter((row) => row.archivos?.contexto === 'interno');
    const existing = internals.find((row) => row.client_file_ref === clientFileRef);
    if (existing) {
      if (existing.expected_name !== name || Number(existing.expected_size) !== size || existing.expected_mime !== mime) {
        return json({ error: 'IDEMPOTENCY_CONFLICT' }, 409);
      }
      // Incluso una reserva completada revalida la asociación y auditoría al confirmar.
      if ((existing.state === 'completed' && existing.archivos?.estado === 'verified') ||
          (['pending', 'uploading'].includes(existing.state) && new Date(existing.expires_at).getTime() > Date.now())) {
        return json({
          success: true,
          reservation_id: existing.id,
          archivo_id: existing.archivo_id,
          relay_upload_url: `${resolvePublicRelayBaseUrl()}/functions/v1/internal-upload-prepare?reservation_id=${encodeURIComponent(existing.id)}`,
          already_uploaded: ['uploading', 'completed'].includes(existing.state) && Boolean(existing.drive_file_id),
          drive_file_id: existing.drive_file_id,
        }, 200);
      }
      return json({ error: 'UPLOAD_EXPIRED', message: 'La reserva venció; seleccioná nuevamente el archivo' }, 409);
    }
    if (internals.filter((row) => ['pending', 'uploading', 'completed'].includes(row.state)).length >= MAX_FILES_ENTREGA) {
      return json({ error: 'MAX_FILES_EXCEEDED', message: `Máximo ${MAX_FILES_ENTREGA} adjuntos por pedido interno` }, 422);
    }

    const adapter = getDriveAdapter();
    const folderName = `SOLICITUD-${ped.pedido_visible}`;
    let folderId: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: claim, error: claimErr } = await admin.rpc('claim_pedido_drive_folder', {
        p_pedido_id: ped.id, p_folder_type: 'solicitud', p_folder_name: folderName, p_lease_seconds: 60,
      });
      if (claimErr) return json({ error: 'FOLDER_CLAIM_FAILED' }, 500);
      if (claim?.status === 'completed') { folderId = claim.drive_folder_id; break; }
      if (claim?.status === 'claimed') {
        try {
          folderId = await adapter.ensureFolder(await adapter.ensureRootFolder(), folderName);
          const { error: finishErr } = await admin.rpc('complete_pedido_drive_folder', {
            p_pedido_id: ped.id, p_folder_type: 'solicitud', p_claim_token: claim.claim_token,
            p_drive_folder_id: folderId, p_folder_name: folderName,
          });
          if (finishErr) throw finishErr;
        } catch {
          await admin.rpc('fail_pedido_drive_folder', {
            p_pedido_id: ped.id, p_folder_type: 'solicitud', p_claim_token: claim.claim_token,
            p_last_error: 'No se pudo preparar la carpeta de referencia',
          });
          return json({ error: 'DRIVE_FOLDER_ERROR' }, 502);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!folderId) return json({ error: 'DRIVE_FOLDER_UNAVAILABLE' }, 503);

    // Conservamos el nombre original: la verificación de Drive debe coincidir con él.
    const reservationId = crypto.randomUUID();
    const archivoId = crypto.randomUUID();
    const session = await adapter.createResumableUploadSession({
      fileName: name, mimeType: mime, fileSize: size, parentFolderId: folderId,
      appProperties: {
        pedido_id: pedidoId, pedido_visible: ped.pedido_visible, reservation_id: reservationId,
        client_file_ref: clientFileRef, contexto: 'interno',
      },
    });
    const { error: fileErr } = await admin.from('archivos').insert({
      id: archivoId, drive_file_id: session.driveFileId || null,
      nombre_original: name, mime_type: mime, size_bytes: size,
      contexto: 'interno', estado: 'reserved', uploaded_by_user_id: actorId,
    });
    if (fileErr) return json({ error: 'DB_ERROR', phase: 'file_insert' }, 500);
    const { error: reservationErr } = await admin.from('upload_reservations').insert({
      id: reservationId, pedido_id: pedidoId, archivo_id: archivoId,
      client_file_ref: clientFileRef, expected_name: name, expected_size: size, expected_mime: mime,
      drive_session_ref: session.uploadUrl, drive_file_id: session.driveFileId || null,
      state: 'pending', expires_at: new Date(Date.now() + 7200_000).toISOString(),
    });
    if (reservationErr) return json({ error: 'DB_ERROR', phase: 'reservation_insert' }, 500);
    const relayBase = resolvePublicRelayBaseUrl();
    return json({
      success: true, reservation_id: reservationId, archivo_id: archivoId,
      relay_upload_url: `${relayBase}/functions/v1/internal-upload-prepare?reservation_id=${encodeURIComponent(reservationId)}`,
      drive_file_id: session.driveFileId || null,
    }, 201);
  } catch {
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
