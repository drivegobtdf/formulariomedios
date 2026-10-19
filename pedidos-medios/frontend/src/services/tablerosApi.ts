import { getSupabaseClient } from './supabaseClient';

export interface TableroPrivado {
  id: string;
  titulo: string;
  descripcion: string | null;
  color: string;
  propietario_id: string;
  created_at: string;
  updated_at: string;
  propietario?: {
    nombre: string;
    apellido: string;
    nombre_usuario: string;
  };
  mi_rol?: 'propietario' | 'edicion' | 'lectura' | 'admin_global';
}

export interface TableroMiembro {
  id: string;
  tablero_id: string;
  user_id: string;
  rol_tablero: 'lectura' | 'edicion';
  invitado_por: string | null;
  created_at: string;
  usuario?: {
    nombre: string;
    apellido: string;
    nombre_usuario: string;
    app_role: string;
  };
}

export interface TableroColumna {
  id: string;
  tablero_id: string;
  nombre: string;
  orden: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoContenidoTarjeta =
  | 'nota_rapida'
  | 'checklist'
  | 'enlace'
  | 'contacto'
  | 'recordatorio'
  | 'pedido_ref'
  | 'documentacion';

export interface TableroTarjeta {
  id: string;
  tablero_id: string;
  columna_id: string;
  titulo: string;
  descripcion: string | null;
  tipo_contenido: TipoContenidoTarjeta;
  metadata: Record<string, any>;
  color: string;
  orden: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  checklists?: TableroTarjetaChecklist[];
  comentarios?: TableroTarjetaComentario[];
}

export interface TableroTarjetaChecklist {
  id: string;
  tablero_id: string;
  tarjeta_id: string;
  texto: string;
  completado: boolean;
  orden: number;
  completado_por: string | null;
  completado_at: string | null;
  created_at: string;
}

export interface TableroTarjetaComentario {
  id: string;
  tablero_id: string;
  tarjeta_id: string;
  autor_id: string;
  contenido: string;
  created_at: string;
  autor?: {
    nombre: string;
    apellido: string;
    nombre_usuario: string;
  };
}

export interface TableroCollaborator {
  user_id: string;
  nombre: string;
  apellido: string;
  nombre_usuario: string;
  app_role: string;
}

export interface PedidoReference {
  id: string;
  numero_identificador: string;
  titulo: string;
  estado: string;
  created_at: string;
}

/**
 * Obtener todos los tableros accesibles para el usuario actual.
 */
export async function fetchTableros(): Promise<TableroPrivado[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Obtener rol del usuario
  const { data: acceso } = await supabase
    .from('usuarios_acceso')
    .select('app_role')
    .eq('user_id', user.id)
    .single();

  const isAdmin = acceso?.app_role === 'administrador';

  // Obtener tableros
  const { data: boards, error } = await supabase
    .from('tableros_privados')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error al cargar tableros privados:', error);
    throw error;
  }
  if (!boards || boards.length === 0) return [];

  // Obtener membresías del usuario para determinar su rol
  const { data: miembros } = await supabase
    .from('tablero_miembros')
    .select('tablero_id, rol_tablero')
    .eq('user_id', user.id);

  const miembroMap = new Map<string, 'lectura' | 'edicion'>();
  miembros?.forEach((m) => miembroMap.set(m.tablero_id, m.rol_tablero));

  // Obtener perfiles de los propietarios en una consulta autorizada
  const ownerIds = Array.from(new Set(boards.map((b) => b.propietario_id).filter(Boolean)));
  const ownerMap = new Map<string, { nombre: string; apellido: string; nombre_usuario: string }>();

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('usuarios_acceso')
      .select('user_id, nombre, apellido, nombre_usuario')
      .in('user_id', ownerIds);

    owners?.forEach((o) => {
      ownerMap.set(o.user_id, {
        nombre: o.nombre,
        apellido: o.apellido,
        nombre_usuario: o.nombre_usuario,
      });
    });
  }

  return boards.map((b: any) => {
    let miRol: TableroPrivado['mi_rol'] = 'lectura';
    if (b.propietario_id === user.id) {
      miRol = 'propietario';
    } else if (miembroMap.has(b.id)) {
      miRol = miembroMap.get(b.id);
    } else if (isAdmin) {
      miRol = 'admin_global';
    }

    return {
      ...b,
      propietario: ownerMap.get(b.propietario_id) || undefined,
      mi_rol: miRol,
    };
  });
}

/**
 * Crear un nuevo tablero privado con columnas predeterminadas
 */
export async function createTablero(params: {
  titulo: string;
  descripcion?: string;
  color?: string;
}): Promise<TableroPrivado> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_create', {
    p_titulo: params.titulo,
    p_descripcion: params.descripcion || null,
    p_color: params.color || 'azul',
  });

  if (error) throw error;
  return data;
}

/**
 * Actualizar detalles de un tablero
 */
export async function updateTablero(
  tableroId: string,
  params: { titulo: string; descripcion?: string; color?: string }
): Promise<TableroPrivado> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tableros_privados')
    .update({
      titulo: params.titulo.trim(),
      descripcion: params.descripcion?.trim() || null,
      color: params.color || 'azul',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tableroId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Eliminar un tablero (solo propietario)
 */
export async function deleteTablero(tableroId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_delete', {
    p_tablero_id: tableroId,
  });

  if (error) throw error;
  return data === true;
}

/**
 * Cargar datos completos de un tablero
 */
export async function fetchTableroDetail(tableroId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [boardRes, miembrosRes, colsRes, cardsRes] = await Promise.all([
    supabase
      .from('tableros_privados')
      .select('*')
      .eq('id', tableroId)
      .single(),
    supabase
      .from('tablero_miembros')
      .select('*')
      .eq('tablero_id', tableroId),
    supabase
      .from('tablero_columnas')
      .select('*')
      .eq('tablero_id', tableroId)
      .order('orden', { ascending: true }),
    supabase
      .from('tablero_tarjetas')
      .select(`
        *,
        checklists:tablero_tarjeta_checklists(*),
        comentarios:tablero_tarjeta_comentarios(*)
      `)
      .eq('tablero_id', tableroId)
      .order('orden', { ascending: true }),
  ]);

  if (boardRes.error) throw boardRes.error;
  if (miembrosRes.error) throw miembrosRes.error;
  if (colsRes.error) throw colsRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const board = boardRes.data;
  const rawMiembros = miembrosRes.data || [];
  const columnas = colsRes.data || [];
  const rawCards = cardsRes.data || [];

  // Recolectar todos los user_ids necesarios para poblar usuarios (propietario, miembros, autores de comentarios)
  const userIds = new Set<string>();
  if (board.propietario_id) userIds.add(board.propietario_id);
  rawMiembros.forEach((m: any) => {
    if (m.user_id) userIds.add(m.user_id);
  });
  rawCards.forEach((c: any) => {
    (c.comentarios || []).forEach((com: any) => {
      if (com.autor_id) userIds.add(com.autor_id);
    });
  });

  const userIdsArray = Array.from(userIds);
  const userProfileMap = new Map<string, { nombre: string; apellido: string; nombre_usuario: string; app_role?: string }>();

  if (userIdsArray.length > 0) {
    const { data: profiles } = await supabase
      .from('usuarios_acceso')
      .select('user_id, nombre, apellido, nombre_usuario, app_role')
      .in('user_id', userIdsArray);

    profiles?.forEach((p) => userProfileMap.set(p.user_id, p));
  }

  // Poblar propietario
  const propietarioData = userProfileMap.get(board.propietario_id);
  if (propietarioData) {
    board.propietario = {
      nombre: propietarioData.nombre,
      apellido: propietarioData.apellido,
      nombre_usuario: propietarioData.nombre_usuario,
    };
  }

  // Poblar miembros con información de usuario
  const miembros: TableroMiembro[] = rawMiembros.map((m: any) => {
    const u = userProfileMap.get(m.user_id);
    return {
      ...m,
      usuario: u
        ? {
            nombre: u.nombre,
            apellido: u.apellido,
            nombre_usuario: u.nombre_usuario,
            app_role: u.app_role || '',
          }
        : undefined,
    };
  });

  // Poblar tarjetas con comentarios y autor
  const tarjetas: TableroTarjeta[] = rawCards.map((card: any) => ({
    ...card,
    checklists: (card.checklists || []).sort((a: any, b: any) => a.orden - b.orden),
    comentarios: (card.comentarios || [])
      .map((com: any) => {
        const autorData = userProfileMap.get(com.autor_id);
        return {
          ...com,
          autor: autorData
            ? {
                nombre: autorData.nombre,
                apellido: autorData.apellido,
                nombre_usuario: autorData.nombre_usuario,
              }
            : undefined,
        };
      })
      .sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
  }));

  // Determinar permisos del usuario actual
  let canEdit = false;
  let isOwner = false;
  if (user) {
    if (board.propietario_id === user.id) {
      canEdit = true;
      isOwner = true;
    } else {
      const miembro = miembros.find((m: any) => m.user_id === user.id);
      if (miembro && miembro.rol_tablero === 'edicion') {
        canEdit = true;
      }
    }
  }

  return {
    board,
    miembros,
    columnas,
    tarjetas,
    canEdit,
    isOwner,
  };
}

/**
 * Invitar o modificar miembro
 */
export async function inviteTableroMember(
  tableroId: string,
  userId: string,
  rolTablero: 'lectura' | 'edicion'
): Promise<TableroMiembro> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_member_invite', {
    p_tablero_id: tableroId,
    p_user_id: userId,
    p_rol_tablero: rolTablero,
  });

  if (error) throw error;
  return data;
}

/**
 * Modificar rol de miembro existente
 */
export async function updateTableroMemberRole(
  tableroId: string,
  userId: string,
  rolTablero: 'lectura' | 'edicion'
): Promise<TableroMiembro> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_member_update_role', {
    p_tablero_id: tableroId,
    p_user_id: userId,
    p_rol_tablero: rolTablero,
  });

  if (error) throw error;
  return data;
}

/**
 * Revocar acceso de miembro
 */
export async function revokeTableroMember(tableroId: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_member_revoke', {
    p_tablero_id: tableroId,
    p_user_id: userId,
  });

  if (error) throw error;
  return data === true;
}

/**
 * Crear columna
 */
export async function createColumna(
  tableroId: string,
  nombre: string,
  orden: number,
  color?: string
): Promise<TableroColumna> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tablero_columnas')
    .insert({
      tablero_id: tableroId,
      nombre: nombre.trim(),
      orden,
      color: color || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Actualizar columna
 */
export async function updateColumna(
  columnaId: string,
  nombre: string,
  color?: string
): Promise<TableroColumna> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tablero_columnas')
    .update({
      nombre: nombre.trim(),
      color: color || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', columnaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Eliminar columna
 */
export async function deleteColumna(columnaId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('tablero_columnas').delete().eq('id', columnaId);
  if (error) throw error;
}

/**
 * Reordenar columnas
 */
export async function reorderColumnas(tableroId: string, columnaIds: string[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_columnas_reorder', {
    p_tablero_id: tableroId,
    p_columna_ids: columnaIds,
  });

  if (error) throw error;
  return data === true;
}

/**
 * Crear tarjeta
 */
export async function createTarjeta(params: {
  tableroId: string;
  columnaId: string;
  titulo: string;
  descripcion?: string;
  tipoContenido?: TipoContenidoTarjeta;
  metadata?: Record<string, any>;
  color?: string;
  orden?: number;
}): Promise<TableroTarjeta> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('tablero_tarjetas')
    .insert({
      tablero_id: params.tableroId,
      columna_id: params.columnaId,
      titulo: params.titulo.trim(),
      descripcion: params.descripcion?.trim() || null,
      tipo_contenido: params.tipoContenido || 'nota_rapida',
      metadata: params.metadata || {},
      color: params.color || 'blanco',
      orden: params.orden ?? 0,
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Actualizar tarjeta
 */
export async function updateTarjeta(
  tarjetaId: string,
  params: {
    titulo?: string;
    descripcion?: string;
    tipoContenido?: TipoContenidoTarjeta;
    metadata?: Record<string, any>;
    color?: string;
  }
): Promise<TableroTarjeta> {
  const supabase = getSupabaseClient();
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (params.titulo !== undefined) updates.titulo = params.titulo.trim();
  if (params.descripcion !== undefined) updates.descripcion = params.descripcion?.trim() || null;
  if (params.tipoContenido !== undefined) updates.tipo_contenido = params.tipoContenido;
  if (params.metadata !== undefined) updates.metadata = params.metadata;
  if (params.color !== undefined) updates.color = params.color;

  const { data, error } = await supabase
    .from('tablero_tarjetas')
    .update(updates)
    .eq('id', tarjetaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mover tarjeta a otra columna y posición
 */
export async function moveTarjeta(
  tarjetaId: string,
  columnaDestinoId: string,
  nuevoOrden: number
): Promise<TableroTarjeta> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_tarjeta_move', {
    p_tarjeta_id: tarjetaId,
    p_columna_destino_id: columnaDestinoId,
    p_nuevo_orden: nuevoOrden,
  });

  if (error) throw error;
  return data;
}

/**
 * Reordenar tarjetas dentro de una columna
 */
export async function reorderTarjetas(
  tableroId: string,
  columnaId: string,
  tarjetaIds: string[]
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_tarjetas_reorder', {
    p_tablero_id: tableroId,
    p_columna_id: columnaId,
    p_tarjeta_ids: tarjetaIds,
  });

  if (error) throw error;
  return data === true;
}

/**
 * Eliminar tarjeta
 */
export async function deleteTarjeta(tarjetaId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('tablero_tarjetas').delete().eq('id', tarjetaId);
  if (error) throw error;
}

/**
 * Toggle checklist item
 */
export async function toggleChecklistItem(
  checklistId: string,
  completado: boolean
): Promise<TableroTarjetaChecklist> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_tarjeta_checklist_toggle', {
    p_checklist_id: checklistId,
    p_completado: completado,
  });

  if (error) throw error;
  return data;
}

/**
 * Agregar ítem de checklist a tarjeta
 */
export async function addChecklistItem(
  tableroId: string,
  tarjetaId: string,
  texto: string,
  orden: number
): Promise<TableroTarjetaChecklist> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('tablero_tarjeta_checklists')
    .insert({
      tablero_id: tableroId,
      tarjeta_id: tarjetaId,
      texto: texto.trim(),
      orden,
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Eliminar ítem de checklist
 */
export async function deleteChecklistItem(checklistId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('tablero_tarjeta_checklists').delete().eq('id', checklistId);
  if (error) throw error;
}

/**
 * Agregar comentario a tarjeta
 */
export async function addTarjetaComentario(
  tableroId: string,
  tarjetaId: string,
  contenido: string
): Promise<TableroTarjetaComentario> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('tablero_tarjeta_comentarios')
    .insert({
      tablero_id: tableroId,
      tarjeta_id: tarjetaId,
      autor_id: user?.id,
      contenido: contenido.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;

  let autorInfo: any = undefined;
  if (data?.autor_id) {
    const { data: u } = await supabase
      .from('usuarios_acceso')
      .select('nombre, apellido, nombre_usuario')
      .eq('user_id', data.autor_id)
      .maybeSingle();
    if (u) {
      autorInfo = {
        nombre: u.nombre,
        apellido: u.apellido,
        nombre_usuario: u.nombre_usuario,
      };
    }
  }

  return {
    ...data,
    autor: autorInfo,
  };
}

/**
 * Buscar tarjetas en tableros autorizados
 */
export async function searchTarjetas(query: string, tableroId?: string): Promise<any[]> {
  if (!query.trim()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_tarjetas_search', {
    p_query: query.trim(),
    p_tablero_id: tableroId || null,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Listar colaboradores aprobados para invitar
 */
export async function fetchCollaborators(): Promise<TableroCollaborator[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_get_collaborators');
  if (error) throw error;
  return data || [];
}

/**
 * Obtener lista de pedidos existentes para asociar a tarjetas
 */
export async function fetchPedidosReferences(search?: string): Promise<PedidoReference[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('tablero_get_pedidos_reference_list', {
    p_search: search?.trim() || null,
  });
  if (error) throw error;
  return data || [];
}
