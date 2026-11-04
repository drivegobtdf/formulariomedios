import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig, verifyUserRole } from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

/** CAM-11: verificación y asociación de un adjunto de referencia interno. */
export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  const json = (data: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { supabaseUrl, publishableKey, serviceRoleKey } = getSupabaseConfig();
    const authorization = req.headers.get('authorization') || '';
    if (!/^Bearer\s+/i.test(authorization)) return json({ error: 'UNAUTHORIZED' }, 401);
    const jwt = authorization.replace(/^Bearer\s+/i, '').trim();
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'UNAUTHORIZED' }, 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actorId = userData.user.id;
    const access = await verifyUserRole(admin, actorId);
    if (!access.approved || !['administrador', 'equipo'].includes(access.role || '')) {
      return json({ error: 'FORBIDDEN' }, 403);
    }

    const body = await req.json();
    const pedidoId = typeof body.pedido_id === 'string' ? body.pedido_id : '';
    const reservationId = typeof body.reservation_id === 'string' ? body.reservation_id : '';
    if (!pedidoId || !reservationId) return json({ error: 'BAD_REQUEST' }, 400);

    const { data: pedido } = await admin.from('pedidos')
      .select('id, origen, estado, created_by_user_id').eq('id', pedidoId).maybeSingle();
    if (!pedido || pedido.origen !== 'interno' ||
      (access.role !== 'administrador' && pedido.created_by_user_id !== actorId)) {
      return json({ error: 'PEDIDO_NOT_FOUND_OR_FORBIDDEN' }, 404);
    }
    if (!['Nuevo', 'En revisión', 'En proceso'].includes(pedido.estado)) {
      return json({ error: 'INVALID_STATE', message: 'El pedido interno ya no acepta adjuntos de referencia' }, 422);
    }

    const { data: reservation, error: resErr } = await admin.from('upload_reservations')
      .select('*, archivos(*)').eq('id', reservationId).eq('pedido_id', pedidoId).maybeSingle();
    if (resErr || !reservation || reservation.archivos?.contexto !== 'interno' ||
      (access.role !== 'administrador' && reservation.archivos.uploaded_by_user_id !== actorId)) {
      return json({ error: 'RESERVATION_NOT_FOUND' }, 404);
    }
    if (new Date(reservation.expires_at).getTime() < Date.now() && reservation.state !== 'completed') {
      return json({ error: 'RESERVATION_EXPIRED' }, 409);
    }
    if (!['uploading', 'completed'].includes(reservation.state)) {
      return json({ error: 'FILE_NOT_UPLOADED' }, 409);
    }
    const fileId = reservation.drive_file_id;
    if (!fileId || (body.drive_file_id && body.drive_file_id !== fileId)) {
      return json({ error: 'DRIVE_FILE_MISMATCH' }, 422);
    }

    if (reservation.state !== 'completed' || reservation.archivos.estado !== 'verified') {
      const verify = await getDriveAdapter().verifyUploadedFile(fileId, {
        name: reservation.expected_name,
        size: Number(reservation.expected_size),
        mimeType: reservation.expected_mime,
        appProperties: { pedido_id: pedidoId, reservation_id: reservationId, contexto: 'interno' },
      });
      if (!verify.verified || !verify.file) {
        return json({ error: 'DRIVE_VERIFICATION_FAILED', message: verify.error || 'No se verificó el adjunto' }, 422);
      }
      // No confiar solo en que el adaptador devuelva verified: comprobar pertenencia real.
      const driveProps = verify.file.appProperties || {};
      if (driveProps.pedido_id !== pedidoId || driveProps.reservation_id !== reservationId || driveProps.contexto !== 'interno') {
        return json({ error: 'DRIVE_OWNERSHIP_MISMATCH' }, 422);
      }
      const { error: fileErr } = await admin.from('archivos').update({
        drive_file_id: fileId, estado: 'verified', size_bytes: verify.file.size,
      }).eq('id', reservation.archivo_id);
      if (fileErr) return json({ error: 'DB_ERROR', phase: 'file_update' }, 500);
      const { error: resUpdateErr } = await admin.from('upload_reservations').update({
        state: 'completed', completed_at: new Date().toISOString(), drive_file_id: fileId,
      }).eq('id', reservationId);
      if (resUpdateErr) return json({ error: 'DB_ERROR', phase: 'reservation_update' }, 500);
    }

    // La asociación se ejecuta también en reintentos: evita adjuntos huérfanos.
    const { data: existingAssociation, error: lookupErr } = await admin.from('archivo_pedido')
      .select('archivo_id').eq('archivo_id', reservation.archivo_id).eq('pedido_id', pedidoId).maybeSingle();
    if (lookupErr) return json({ error: 'DB_ERROR', phase: 'association_lookup' }, 500);
    if (!existingAssociation) {
      const { error: relationErr } = await admin.from('archivo_pedido').upsert({
        archivo_id: reservation.archivo_id, pedido_id: pedidoId,
      }, { onConflict: 'archivo_id,pedido_id', ignoreDuplicates: true });
      if (relationErr) return json({ error: 'DB_ERROR', phase: 'association_insert' }, 500);
    }
    // Garantizar trazabilidad incluso si la respuesta de una etapa anterior se perdió.
    const { data: priorAudit, error: auditLookupErr } = await admin.from('audit_log')
      .select('id').eq('recurso_tipo', 'pedidos').eq('recurso_id', pedidoId)
      .eq('accion', 'internal_attachment_uploaded')
      .contains('metadata', { reservation_id: reservationId }).limit(1).maybeSingle();
    if (auditLookupErr) return json({ error: 'DB_ERROR', phase: 'audit_lookup' }, 500);
    if (!priorAudit) {
      const { error: auditErr } = await admin.from('audit_log').insert({
        actor_user_id: actorId, recurso_tipo: 'pedidos', recurso_id: pedidoId,
        accion: 'internal_attachment_uploaded',
        metadata: { archivo_id: reservation.archivo_id, reservation_id: reservationId },
      });
      if (auditErr) return json({ error: 'DB_ERROR', phase: 'audit_insert' }, 500);
    }
    return json({ success: true, verified: true, archivo_id: reservation.archivo_id, drive_file_id: fileId }, 200);
  } catch {
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
