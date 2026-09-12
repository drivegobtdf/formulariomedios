import { getSupabaseClient } from './supabaseClient';

export interface InternalUser {
  user_id: string;
  nombre: string;
  apellido: string;
  nombre_usuario: string;
  app_role: 'administrador' | 'equipo' | 'observador';
  estado_acceso: 'aprobado' | 'pendiente' | 'rechazado' | 'revocado';
}

export interface PedidoListItem {
  id: string;
  pedido_visible: string;
  anio: number;
  numero: number;
  codigo_categoria: string;
  estado: string;
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
  }>;
  archivos: Array<{
    id: string;
    nombre_original: string;
    mime_type: string;
    size_bytes: number;
    contexto: string;
    estado: string;
    drive_file_id?: string;
    created_at: string;
  }>;
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
      categoria_id,
      tipo_servicio_id,
      responsable_user_id,
      informacion_especifica,
      version,
      archivado,
      created_at,
      updated_at,
      categorias_servicio ( nombre ),
      tipos_servicio ( nombre ),
      usuarios_acceso:responsable_user_id ( nombre, apellido )
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

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((p: any) => ({
    id: p.id,
    pedido_visible: p.pedido_visible,
    anio: p.anio,
    numero: p.numero,
    codigo_categoria: p.codigo_categoria,
    estado: p.estado,
    categoria_id: p.categoria_id,
    tipo_servicio_id: p.tipo_servicio_id,
    categoria_nombre: p.categorias_servicio?.nombre,
    tipo_nombre: p.tipos_servicio?.nombre,
    responsable_user_id: p.responsable_user_id,
    responsable_nombre: p.usuarios_acceso ? `${p.usuarios_acceso.nombre} ${p.usuarios_acceso.apellido}` : undefined,
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
      categoria_id,
      tipo_servicio_id,
      responsable_user_id,
      informacion_especifica,
      version,
      archivado,
      created_at,
      updated_at,
      categorias_servicio ( nombre ),
      tipos_servicio ( nombre ),
      envios_formulario ( id, nombre_apellido, telefono, correo, area_solicitante ),
      usuarios_acceso:responsable_user_id ( nombre, apellido )
    `);

  if (isUuid) {
    query = query.eq('id', idOrVisible);
  } else {
    query = query.eq('pedido_visible', idOrVisible.toUpperCase());
  }

  const { data: p, error } = await query.single();
  if (error || !p) throw new Error(error?.message || 'Pedido no encontrado');

  const pedidoId = p.id;

  // Asignaciones
  const { data: asignaciones } = await supabase
    .from('pedido_asignaciones')
    .select('id, responsable_anterior, responsable_nuevo, asignado_por, motivo, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  // Notas
  const { data: notas } = await supabase
    .from('notas_pedido')
    .select('id, autor_user_id, visibilidad, texto, created_at, usuarios_acceso:autor_user_id ( nombre, apellido )')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  // Solicitudes de información
  const { data: solicitudes } = await supabase
    .from('solicitudes_informacion')
    .select('id, solicitada_por, mensaje, estado, expires_at, respuesta_texto, responded_at, created_at, usuarios_acceso:solicitada_por ( nombre, apellido )')
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
    .select('id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at, usuarios_acceso:entregado_por ( nombre, apellido )')
    .eq('pedido_id', pedidoId)
    .order('version', { ascending: false });

  return {
    id: p.id,
    pedido_visible: p.pedido_visible,
    anio: p.anio,
    numero: p.numero,
    codigo_categoria: p.codigo_categoria,
    estado: p.estado,
    categoria_id: p.categoria_id,
    tipo_servicio_id: p.tipo_servicio_id,
    categoria_nombre: (p.categorias_servicio as any)?.nombre,
    tipo_nombre: (p.tipos_servicio as any)?.nombre,
    responsable_user_id: p.responsable_user_id,
    responsable_nombre: (p.usuarios_acceso as any) ? `${(p.usuarios_acceso as any).nombre} ${(p.usuarios_acceso as any).apellido}` : undefined,
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
      autor_nombre: n.usuarios_acceso ? `${n.usuarios_acceso.nombre} ${n.usuarios_acceso.apellido}` : undefined,
      visibilidad: n.visibilidad,
      texto: n.texto,
      created_at: n.created_at,
    })),
    solicitudes: (solicitudes || []).map((s: any) => ({
      id: s.id,
      solicitada_por: s.solicitada_por,
      solicitada_por_nombre: s.usuarios_acceso ? `${s.usuarios_acceso.nombre} ${s.usuarios_acceso.apellido}` : undefined,
      mensaje: s.mensaje,
      estado: s.estado,
      expires_at: s.expires_at,
      is_expired: Date.now() >= new Date(s.expires_at).getTime(),
      respuesta_texto: s.respuesta_texto,
      responded_at: s.responded_at,
      created_at: s.created_at,
    })),
    archivos: (archivosData || []).map((ap: any) => ap.archivos).filter(Boolean),
    enlaces: (enlacesData || []).map((ep: any) => ep.enlaces_material).filter(Boolean),
    entregas: (entregas || []).map((e: any) => ({
      id: e.id,
      version: e.version,
      es_vigente: e.es_vigente,
      archivo_id: e.archivo_id,
      enlace_externo: e.enlace_externo,
      nota: e.nota,
      entregado_por: e.entregado_por,
      entregado_por_nombre: e.usuarios_acceso ? `${e.usuarios_acceso.nombre} ${e.usuarios_acceso.apellido}` : undefined,
      created_at: e.created_at,
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
  enlace_externo?: string;
  nota?: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('pedido_finalize', {
    p_pedido_id: pedidoId,
    p_expected_version: expectedVersion,
    p_archivos_entrega: entrega?.archivo_id ? [entrega.archivo_id] : null,
    p_url_entrega: entrega?.enlace_externo || null,
    p_nota_entrega: entrega?.nota || null,
  });
  if (error) throw new Error(error.message);
  return data;
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
  const { data, error } = await supabase.rpc('info_request_create', {
    p_pedido_id: pedidoId,
    p_mensaje: mensaje,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return data;
}
