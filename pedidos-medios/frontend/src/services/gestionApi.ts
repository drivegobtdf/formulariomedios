import { getSupabaseClient } from './supabaseClient';

export interface InternalUser {
  user_id: string;
  nombre: string;
  apellido: string;
  nombre_usuario: string;
  app_role: 'administrador' | 'equipo' | 'observador';
  estado_acceso: 'aprobado' | 'pendiente' | 'rechazado' | 'revocado';
}

export interface AdminUserListItem {
  user_id: string;
  nombre: string;
  apellido: string;
  nombre_usuario: string;
  app_role: 'administrador' | 'equipo' | 'observador';
  estado_acceso: 'aprobado' | 'pendiente' | 'rechazado' | 'revocado';
  solicitado_at: string;
  aprobado_at?: string | null;
  aprobado_por?: string | null;
  rechazado_at?: string | null;
  revocado_at?: string | null;
  motivo_revocacion?: string | null;
  updated_at: string;
  email?: string;
}

export interface PedidoListItem {
  id: string;
  pedido_visible: string;
  anio: number;
  numero: number;
  codigo_categoria: string;
  estado: string;
  retrabajo_activo?: boolean;
  revision_requested_at?: string | null;
  revision_count?: number;
  envio_id?: string;
  categoria_id: string;
  tipo_servicio_id: string;
  categoria_nombre?: string;
  tipo_nombre?: string;
  responsable_user_id?: string;
  responsable_nombre?: string;
  informacion_especifica: Record<string, any>;
  version: number;
  archivado: boolean;
  created_at: string;
  updated_at: string;
  solicitudes_pendientes_count?: number;
}

export interface EnrichedArchivoItem {
  id: string;
  nombre_original: string;
  mime_type: string;
  size_bytes: number;
  contexto: 'solicitud' | 'revision' | 'informacion_respuesta' | 'entrega' | 'interno' | string;
  origen: 'original' | 'revision' | 'informacion_respuesta' | 'entrega' | 'historico';
  revision_number?: number;
  revision_motivo?: string;
  estado: string;
  drive_file_id?: string;
  created_at: string;
}

export interface PedidoDetailItem extends PedidoListItem {
  envio: {
    id: string;
    nombre_apellido: string;
    telefono: string;
    correo: string;
    area_solicitante: string;
  };
  asignaciones: Array<{
    id: string;
    responsable_anterior?: string;
    responsable_nuevo: string;
    asignado_por: string;
    motivo?: string;
    created_at: string;
  }>;
  notas: Array<{
    id: string;
    autor_user_id: string;
    autor_nombre?: string;
    visibilidad: 'interna' | 'solicitante';
    texto: string;
    created_at: string;
  }>;
  solicitudes: Array<{
    id: string;
    solicitada_por: string;
    solicitada_por_nombre?: string;
    mensaje: string;
    estado: string;
    expires_at: string;
    is_expired: boolean;
    respuesta_texto?: string;
    responded_at?: string;
    created_at: string;
    archivos_respuesta?: Array<{
      id: string;
      nombre_original: string;
      size_bytes: number;
      mime_type: string;
      estado: string;
      contexto?: string;
      created_at?: string;
    }>;
    enlaces_respuesta?: Array<{
      id: string;
      url: string;
      descripcion?: string;
      created_at?: string;
    }>;
  }>;
  archivos: EnrichedArchivoItem[];
  enlaces: Array<{
    id: string;
    url: string;
    descripcion?: string;
    created_at: string;
  }>;
  entregas: Array<{
    id: string;
    version: number;
    es_vigente: boolean;
    archivo_id?: string;
    enlace_externo?: string;
    nota?: string;
    entregado_por: string;
    entregado_por_nombre?: string;
    created_at: string;
  }>;
  revisiones?: Array<{
    id: string;
    solicitud_id: string;
    pedido_id: string;
    revision_number: number;
    estado: string;
    motivo: string;
    requested_at: string;
    resolved_at?: string | null;
    resolucion_notas?: string | null;
    archivos?: Array<{
      id: string;
      nombre_original: string;
      size_bytes?: number;
      mime_type?: string;
      drive_file_id?: string;
      created_at?: string;
    }>;
  }>;
}

export async function fetchInternalUsers(): Promise<InternalUser[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('usuarios_acceso')
    .select('user_id, nombre, apellido, nombre_usuario, app_role, estado_acceso')
    .eq('estado_acceso', 'aprobado')
    .order('apellido', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchAdminUsers(): Promise<AdminUserListItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('usuarios_acceso')
    .select('user_id, nombre, apellido, nombre_usuario, app_role, estado_acceso, solicitado_at, aprobado_at, aprobado_por, rechazado_at, revocado_at, motivo_revocacion, updated_at')
    .order('solicitado_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminApproveUser(
  userId: string,
  role: 'administrador' | 'equipo' | 'observador'
): Promise<{ success: boolean; user_id: string; estado_acceso: string; app_role: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_approve_user', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminRejectUser(
  userId: string,
  motivo?: string
): Promise<{ success: boolean; user_id: string; estado_acceso: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_reject_user', {
    p_user_id: userId,
    p_motivo: motivo || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminRevokeUser(
  userId: string,
  motivo: string
): Promise<{ success: boolean; user_id: string; estado_acceso: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_revoke_user', {
    p_user_id: userId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminChangeUserRole(
  userId: string,
  newRole: 'administrador' | 'equipo' | 'observador'
): Promise<{ success: boolean; user_id: string; app_role: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_change_user_role', {
    p_user_id: userId,
    p_new_role: newRole,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminChangeUsername(
  userId: string,
  newUsername: string
): Promise<{ success: boolean; user_id: string; nombre_usuario: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_change_username', {
    p_user_id: userId,
    p_new_username: newUsername,
  });
  if (error) throw new Error(error.message);
  return data;
}

export interface GestionStats {
  total: number;
  nuevos: number;
  enRevision: number;
  enProceso: number;
  esperandoInfo: number;
  finalizados: number;
  cancelados: number;
  sinAsignar: number;
  archivados: number;
}

export async function fetchGestionStats(): Promise<GestionStats> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pedidos')
    .select('estado, responsable_user_id, archivado');

  if (error) throw new Error(error.message);

  const items = data || [];
  return {
    total: items.filter((p) => !p.archivado).length,
    nuevos: items.filter((p) => !p.archivado && p.estado === 'Nuevo').length,
    enRevision: items.filter((p) => !p.archivado && p.estado === 'En revisión').length,
    enProceso: items.filter((p) => !p.archivado && p.estado === 'En proceso').length,
    esperandoInfo: items.filter((p) => !p.archivado && p.estado === 'Esperando información').length,
    finalizados: items.filter((p) => !p.archivado && p.estado === 'Finalizado').length,
    cancelados: items.filter((p) => !p.archivado && p.estado === 'Cancelado').length,
    sinAsignar: items.filter((p) => !p.archivado && !p.responsable_user_id).length,
    archivados: items.filter((p) => p.archivado).length,
  };
}

export async function fetchPedidos(filters?: {
  estado?: string;
  responsable_user_id?: string;
  unassigned?: boolean;
  requiere_atencion?: boolean;
  archivado?: boolean;
  search?: string;
}): Promise<PedidoListItem[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('pedidos')
    .select(`
      id,
      pedido_visible,
      anio,
      numero,
      codigo_categoria,
      estado,
      retrabajo_activo,
      revision_requested_at,
      revision_count,
      envio_id,
      categoria_id,
      tipo_servicio_id,
      responsable_user_id,
      informacion_especifica,
      version,
      archivado,
      created_at,
      updated_at,
      categorias_servicio!pedidos_categoria_id_fkey ( nombre ),
      tipos_servicio!pedidos_tipo_servicio_id_fkey ( nombre )
    `);

  if (filters?.archivado !== undefined) {
    query = query.eq('archivado', filters.archivado);
  } else {
    query = query.eq('archivado', false);
  }

  if (filters?.estado && filters.estado !== 'todos') {
    query = query.eq('estado', filters.estado);
  }

  if (filters?.responsable_user_id) {
    query = query.eq('responsable_user_id', filters.responsable_user_id);
  }

  if (filters?.unassigned) {
    query = query.is('responsable_user_id', null);
  }

  if (filters?.search && filters.search.trim().length > 0) {
    const s = filters.search.trim();
    query = query.or(`pedido_visible.ilike.%${s}%`);
  }

  query = query
    .order('retrabajo_activo', { ascending: false, nullsFirst: false })
    .order('revision_requested_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const [pedidosRes, users] = await Promise.all([
    query,
    fetchInternalUsers().catch(() => []),
  ]);

  if (pedidosRes.error) throw new Error(pedidosRes.error.message);

  const userMap = new Map((users || []).map((u) => [u.user_id, `${u.nombre} ${u.apellido}`.trim()]));

  return (pedidosRes.data || []).map((p: any) => ({
    id: p.id,
    pedido_visible: p.pedido_visible,
    anio: p.anio,
    numero: p.numero,
    codigo_categoria: p.codigo_categoria,
    estado: p.estado,
    retrabajo_activo: Boolean(p.retrabajo_activo),
    revision_requested_at: p.revision_requested_at,
    revision_count: p.revision_count || 0,
    envio_id: p.envio_id,
    categoria_id: p.categoria_id,
    tipo_servicio_id: p.tipo_servicio_id,
    categoria_nombre: p.categorias_servicio?.nombre,
    tipo_nombre: p.tipos_servicio?.nombre,
    responsable_user_id: p.responsable_user_id,
    responsable_nombre: p.responsable_user_id ? (userMap.get(p.responsable_user_id) || 'Usuario Asignado') : undefined,
    informacion_especifica: p.informacion_especifica || {},
    version: p.version,
    archivado: p.archivado,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

export async function fetchPedidoById(idOrVisible: string): Promise<PedidoDetailItem> {
  const supabase = getSupabaseClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrVisible);

  let query = supabase
    .from('pedidos')
    .select(`
      id,
      pedido_visible,
      anio,
      numero,
      codigo_categoria,
      estado,
      retrabajo_activo,
      revision_requested_at,
      revision_count,
      envio_id,
      categoria_id,
      tipo_servicio_id,
      responsable_user_id,
      informacion_especifica,
      version,
      archivado,
      created_at,
      updated_at,
      categorias_servicio!pedidos_categoria_id_fkey ( nombre ),
      tipos_servicio!pedidos_tipo_servicio_id_fkey ( nombre ),
      envios_formulario ( id, nombre_apellido, telefono, correo, area_solicitante )
    `);

  if (isUuid) {
    query = query.eq('id', idOrVisible);
  } else {
    query = query.eq('pedido_visible', idOrVisible.toUpperCase());
  }

  const [pedidoRes, users] = await Promise.all([
    query.single(),
    fetchInternalUsers().catch(() => []),
  ]);

  if (pedidoRes.error || !pedidoRes.data) {
    throw new Error(pedidoRes.error?.message || 'Pedido no encontrado');
  }

  const p = pedidoRes.data;
  const pedidoId = p.id;
  const userMap = new Map((users || []).map((u) => [u.user_id, `${u.nombre} ${u.apellido}`.trim()]));

  // Asignaciones
  const { data: asignaciones } = await supabase
    .from('pedido_asignaciones')
    .select('id, responsable_anterior, responsable_nuevo, asignado_por, motivo, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  // Notas
  const { data: notas } = await supabase
    .from('notas_pedido')
    .select('id, autor_user_id, visibilidad, texto, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  // Solicitudes de información con archivos y enlaces contextuales
  const { data: solicitudes } = await supabase
    .from('solicitudes_informacion')
    .select(`
      id,
      solicitada_por,
      mensaje,
      estado,
      expires_at,
      respuesta_texto,
      responded_at,
      created_at,
      archivo_solicitud_informacion (
        archivos ( id, nombre_original, size_bytes, mime_type, estado, contexto, created_at )
      ),
      enlace_solicitud_informacion (
        enlaces_material ( id, url, descripcion, created_at )
      )
    `)
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  // Archivos
  const { data: archivosData } = await supabase
    .from('archivo_pedido')
    .select('archivos ( id, nombre_original, mime_type, size_bytes, contexto, estado, drive_file_id, created_at )')
    .eq('pedido_id', pedidoId);

  // Enlaces
  const { data: enlacesData } = await supabase
    .from('enlace_pedido')
    .select('enlaces_material ( id, url, descripcion, created_at )')
    .eq('pedido_id', pedidoId);

  // Entregas
  const { data: entregas } = await supabase
    .from('entregas_pedido')
    .select('id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at')
    .eq('pedido_id', pedidoId)
    .order('version', { ascending: false });

  // Revisiones
  const { data: revisionesData } = await supabase
    .from('revision_pedidos')
    .select(`
      id,
      solicitud_id,
      pedido_id,
      revision_number,
      estado,
      motivo,
      requested_at,
      resolved_at,
      resolucion_notas,
      revision_archivos (
        archivos ( id, nombre_original, size_bytes, mime_type, drive_file_id, created_at )
      )
    `)
    .eq('pedido_id', pedidoId)
    .order('revision_number', { ascending: false });

  return {
    id: p.id,
    pedido_visible: p.pedido_visible,
    anio: p.anio,
    numero: p.numero,
    codigo_categoria: p.codigo_categoria,
    estado: p.estado,
    retrabajo_activo: Boolean(p.retrabajo_activo),
    revision_requested_at: p.revision_requested_at,
    revision_count: p.revision_count || 0,
    envio_id: p.envio_id,
    categoria_id: p.categoria_id,
    tipo_servicio_id: p.tipo_servicio_id,
    categoria_nombre: (p.categorias_servicio as any)?.nombre,
    tipo_nombre: (p.tipos_servicio as any)?.nombre,
    responsable_user_id: p.responsable_user_id,
    responsable_nombre: p.responsable_user_id ? (userMap.get(p.responsable_user_id) || 'Usuario Asignado') : undefined,
    informacion_especifica: p.informacion_especifica || {},
    version: p.version,
    archivado: p.archivado,
    created_at: p.created_at,
    updated_at: p.updated_at,
    envio: p.envios_formulario as any,
    asignaciones: (asignaciones || []).map((a: any) => ({
      id: a.id,
      responsable_anterior: a.responsable_anterior,
      responsable_nuevo: a.responsable_nuevo,
      asignado_por: a.asignado_por,
      motivo: a.motivo,
      created_at: a.created_at,
    })),
    notas: (notas || []).map((n: any) => ({
      id: n.id,
      autor_user_id: n.autor_user_id,
      autor_nombre: userMap.get(n.autor_user_id) || undefined,
      visibilidad: n.visibilidad,
      texto: n.texto,
      created_at: n.created_at,
    })),
    solicitudes: (solicitudes || []).map((s: any) => ({
      id: s.id,
      solicitada_por: s.solicitada_por,
      solicitada_por_nombre: userMap.get(s.solicitada_por) || undefined,
      mensaje: s.mensaje,
      estado: s.estado,
      expires_at: s.expires_at,
      is_expired: Date.now() >= new Date(s.expires_at).getTime(),
      respuesta_texto: s.respuesta_texto,
      responded_at: s.responded_at,
      created_at: s.created_at,
      archivos_respuesta: (s.archivo_solicitud_informacion || [])
        .map((asi: any) => asi.archivos)
        .filter(Boolean),
      enlaces_respuesta: (s.enlace_solicitud_informacion || [])
        .map((esi: any) => esi.enlaces_material)
        .filter(Boolean),
    })),
    archivos: (() => {
      const archivoMap = new Map<string, EnrichedArchivoItem>();

      // 1. Archivos directos del pedido
      (archivosData || [])
        .map((ap: any) => ap.archivos)
        .filter(Boolean)
        .forEach((a: any) => {
          let origen: EnrichedArchivoItem['origen'] = 'original';
          if (a.contexto === 'revision') origen = 'revision';
          else if (a.contexto === 'informacion_respuesta') origen = 'informacion_respuesta';
          else if (a.contexto === 'entrega') origen = 'entrega';
          else if (a.contexto !== 'solicitud') origen = 'historico';

          archivoMap.set(a.id, {
            id: a.id,
            nombre_original: a.nombre_original,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes || 0,
            contexto: a.contexto || 'solicitud',
            origen,
            estado: a.estado,
            drive_file_id: a.drive_file_id,
            created_at: a.created_at || p.created_at,
          });
        });

      // 2. Archivos de revisiones
      (revisionesData || []).forEach((rp: any) => {
        (rp.revision_archivos || []).forEach((ra: any) => {
          if (ra.archivos) {
            archivoMap.set(ra.archivos.id, {
              id: ra.archivos.id,
              nombre_original: ra.archivos.nombre_original,
              mime_type: ra.archivos.mime_type,
              size_bytes: ra.archivos.size_bytes || 0,
              contexto: 'revision',
              origen: 'revision',
              revision_number: rp.revision_number,
              revision_motivo: rp.motivo,
              estado: 'verified',
              drive_file_id: ra.archivos.drive_file_id,
              created_at: ra.archivos.created_at || rp.requested_at,
            });
          }
        });
      });

      // 3. Archivos de solicitudes de información
      (solicitudes || []).forEach((s: any) => {
        (s.archivo_solicitud_informacion || []).forEach((asi: any) => {
          if (asi.archivos && !archivoMap.has(asi.archivos.id)) {
            archivoMap.set(asi.archivos.id, {
              id: asi.archivos.id,
              nombre_original: asi.archivos.nombre_original,
              mime_type: asi.archivos.mime_type,
              size_bytes: asi.archivos.size_bytes || 0,
              contexto: 'informacion_respuesta',
              origen: 'informacion_respuesta',
              estado: asi.archivos.estado || 'verified',
              drive_file_id: asi.archivos.drive_file_id,
              created_at: asi.archivos.created_at || s.responded_at || s.created_at,
            });
          }
        });
      });

      return Array.from(archivoMap.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    })(),
    enlaces: (enlacesData || []).map((ep: any) => ep.enlaces_material).filter(Boolean),
    entregas: (entregas || []).map((e: any) => ({
      id: e.id,
      version: e.version,
      es_vigente: e.es_vigente,
      archivo_id: e.archivo_id,
      enlace_externo: e.enlace_externo,
      nota: e.nota,
      entregado_por: e.entregado_por,
      entregado_por_nombre: userMap.get(e.entregado_por) || undefined,
      created_at: e.created_at,
    })),
    revisiones: (revisionesData || []).map((r: any) => ({
      id: r.id,
      solicitud_id: r.solicitud_id,
      pedido_id: r.pedido_id,
      revision_number: r.revision_number,
      estado: r.estado,
      motivo: r.motivo,
      requested_at: r.requested_at,
      resolved_at: r.resolved_at,
      resolucion_notas: r.resolucion_notas,
      archivos: (r.revision_archivos || [])
        .map((ra: any) => ra.archivos)
        .filter(Boolean),
    })),
  };
}

export async function assignPedido(pedidoId: string, responsableUserId: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_assign', {
    p_pedido_id: pedidoId,
    p_responsable_user_id: responsableUserId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function changePedidoState(pedidoId: string, targetState: string, expectedVersion: number, motivo?: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_change_state', {
    p_pedido_id: pedidoId,
    p_target_state: targetState,
    p_expected_version: expectedVersion,
    p_motivo: motivo || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function finalizePedido(pedidoId: string, expectedVersion: number, entrega?: {
  archivo_id?: string;
  archivo_ids?: string[];
  enlace_externo?: string;
  nota?: string;
}) {
  const supabase = getSupabaseClient();
  let filesArray: string[] | null = null;
  if (entrega?.archivo_ids && entrega.archivo_ids.length > 0) {
    filesArray = entrega.archivo_ids;
  } else if (entrega?.archivo_id) {
    filesArray = [entrega.archivo_id];
  }

  const { data, error } = await supabase.rpc('pedido_finalize', {
    p_pedido_id: pedidoId,
    p_expected_version: expectedVersion,
    p_archivos_entrega: filesArray,
    p_url_entrega: entrega?.enlace_externo || null,
    p_nota_entrega: entrega?.nota || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadDeliveryFile(
  pedidoId: string,
  file: File,
  onProgress?: (percentage: number) => void
): Promise<{ archivo_id: string; nombre_original: string; size_bytes: number }> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  if (onProgress) onProgress(15);

  const token = sessionData.session.access_token;
  const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = (supabase as any).supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

  // 1. Preparar subida de entrega
  const prepareRes = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-prepare`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: pedidoId,
      expected_name: file.name,
      expected_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    }),
  });

  if (!prepareRes.ok) {
    let msg = `Error al preparar subida (${prepareRes.status})`;
    try {
      const j = await prepareRes.json();
      if (j.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }

  const prepData = await prepareRes.json();
  const reservationId = prepData.reservation_id;
  const targetUploadUrl = prepData.relay_upload_url || prepData.drive_session_ref;

  if (onProgress) onProgress(40);

  // 2. Subir contenido binario
  const uploadRes = await fetch(targetUploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    let msg = `Error al subir archivo a Google Drive (${uploadRes.status})`;
    try {
      const j = await uploadRes.json();
      if (j.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }

  const uploadResult = await uploadRes.json().catch(() => ({}));
  const driveFileId = uploadResult.drive_file_id || prepData.drive_file_id;

  if (onProgress) onProgress(85);

  // 3. Completar y verificar subida
  const completeRes = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-complete`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: pedidoId,
      reservation_id: reservationId,
      drive_file_id: driveFileId,
    }),
  });

  if (!completeRes.ok) {
    let msg = `Error al verificar subida (${completeRes.status})`;
    try {
      const j = await completeRes.json();
      if (j.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }

  const completeData = await completeRes.json();
  if (onProgress) onProgress(100);

  return {
    archivo_id: completeData.archivo_id,
    nombre_original: file.name,
    size_bytes: file.size,
  };
}

export async function cancelPedido(pedidoId: string, motivo: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_cancel', {
    p_pedido_id: pedidoId,
    p_motivo: motivo,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reopenPedido(pedidoId: string, motivo: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_reopen', {
    p_pedido_id: pedidoId,
    p_motivo: motivo,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function archivePedido(pedidoId: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_archive', {
    p_pedido_id: pedidoId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function restorePedido(pedidoId: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_restore', {
    p_pedido_id: pedidoId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function createNotaPedido(pedidoId: string, texto: string, visibilidad: 'interna' | 'solicitante') {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('nota_pedido_create', {
    p_pedido_id: pedidoId,
    p_contenido: texto,
    p_visibilidad: visibilidad,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function createInfoRequest(pedidoId: string, mensaje: string, expectedVersion: number) {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  const { data, error } = await supabase.functions.invoke('info-request-create', {
    body: {
      pedido_id: pedidoId,
      mensaje,
      expected_version: expectedVersion,
    },
  });

  if (error) {
    let errorMsg = error.message || 'Error al emitir solicitud de información';
    try {
      if ((error as any).context?.json) {
        const errJson = await (error as any).context.json();
        if (errJson.message) errorMsg = errJson.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  if (!data?.success) {
    throw new Error(data?.message || 'No se pudo crear la solicitud de información');
  }

  return data;
}

export interface HistorialOperativoItem {
  tipo: 'evento' | 'asignacion';
  evento: string;
  created_at: string;
  actor_nombre: string;
  payload: Record<string, any>;
}

export async function fetchPedidoHistorialOperativo(pedidoId: string): Promise<HistorialOperativoItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_get_historial', {
    p_pedido_id: pedidoId,
  });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function downloadArchivo(archivoId: string, nombreOriginal?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  const token = sessionData.session.access_token;
  const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = (supabase as any).supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/drive-download?archivo_id=${encodeURIComponent(archivoId)}`, {
    method: 'GET',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorMsg = `Error en descarga (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.message) errorMsg = errJson.message;
      else if (errJson.error) errorMsg = errJson.error;
    } catch {
      // Non-JSON response
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = nombreOriginal || 'archivo_descargado';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function adminDeleteUser(userId: string): Promise<{ success: boolean; message?: string; user_id?: string }> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  const { data, error } = await supabase.functions.invoke('admin-user-delete', {
    body: { user_id: userId },
  });

  if (error) {
    let errorMsg = error.message || 'Error al eliminar usuario';
    try {
      if ((error as any).context?.json) {
        const errJson = await (error as any).context.json();
        if (errJson.message) errorMsg = errJson.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  if (!data?.success) {
    throw new Error(data?.message || 'No se pudo eliminar el usuario');
  }

  return data;
}

export interface PurgePreviewResult {
  pedidos_count: number;
  pedidos_visibles: string[];
  envios_afectados: number;
  entregas_count: number;
  revisiones_count: number;
  archivos_count: number;
  comunicaciones_count: number;
  drive_file_ids: string[];
  drive_folder_ids: string[];
}

export interface PurgeExecutionResult {
  success: boolean;
  operation_id?: string;
  status?: string;
  deleted_count: number;
  pedidos_visibles: string[];
  message?: string;
}

export async function adminPreviewPurgePedidos(pedidoIds: string[]): Promise<PurgePreviewResult> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  const { data, error } = await supabase.functions.invoke('admin-pedidos-purge', {
    body: { action: 'preview', pedido_ids: pedidoIds },
  });

  if (error) {
    let errorMsg = error.message || 'Error al obtener preview de eliminación';
    try {
      if ((error as any).context?.json) {
        const errJson = await (error as any).context.json();
        if (errJson.message) errorMsg = errJson.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return data;
}

export async function adminExecutePurgePedidos(
  pedidoIds: string[],
  idempotencyKey?: string
): Promise<PurgeExecutionResult> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Sesión no válida o expirada. Por favor inicie sesión nuevamente.');
  }

  const { data, error } = await supabase.functions.invoke('admin-pedidos-purge', {
    body: {
      action: 'purge',
      pedido_ids: pedidoIds,
      idempotency_key: idempotencyKey,
    },
  });

  if (error) {
    let errorMsg = error.message || 'Error al ejecutar eliminación de pedidos';
    try {
      if ((error as any).context?.json) {
        const errJson = await (error as any).context.json();
        if (errJson.message) errorMsg = errJson.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return data;
}
