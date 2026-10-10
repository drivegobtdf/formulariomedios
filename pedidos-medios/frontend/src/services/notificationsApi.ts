/**
/**
 * Servicio de Notificaciones Frontend
 * Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 *
 * Conecta con tabla 'notificaciones_usuario' y RPCs de lectura y conteo.
 */

import { getSupabaseClient } from './supabaseClient';
import { AuthResult } from './auth';

export type NotificationTipo =
  | 'pedido_asignado'
  | 'info_respondida'
  | 'retrabajo_solicitado'
  | 'nota_creada';

export interface NotificationMetadata {
  pedido_visible?: string;
  section?: 'header' | 'info_solicitada' | 'revision' | 'notas' | string;
  mensaje_resumen?: string;
  actor_nombre?: string;
  asignado_por?: string;
  solicitud_id?: string;
  is_tardia?: boolean;
  is_unassigned?: boolean;
  revision_number?: number;
  nota_id?: string;
  [key: string]: any;
}

export interface UserNotification {
  id: string;
  userId: string;
  pedidoId: string;
  tipo: NotificationTipo;
  actorUserId: string | null;
  readAt: string | null;
  metadata: NotificationMetadata;
  createdAt: string;
}

export interface FetchNotificationsParams {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

function mapRowToNotification(row: any): UserNotification {
  return {
    id: row.id,
    userId: row.user_id,
    pedidoId: row.pedido_id,
    tipo: row.tipo,
    actorUserId: row.actor_user_id || null,
    readAt: row.read_at || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

/**
 * Consulta las notificaciones del usuario actual respetando filtros y paginación.
 */
export async function fetchNotifications(
  params: FetchNotificationsParams = {}
): Promise<AuthResult<UserNotification[]>> {
  const { limit = 20, offset = 0, unreadOnly = false } = params;
  const supabase = getSupabaseClient();

  try {
    let query = supabase
      .from('notificaciones_usuario')
      .select('id, user_id, pedido_id, tipo, actor_user_id, read_at, metadata, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const items = (data || []).map(mapRowToNotification);
    return { success: true, data: items };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al obtener notificaciones' };
  }
}

/**
 * Consulta el conteo exacto de notificaciones no leídas.
 */
export async function fetchUnreadNotificationCount(): Promise<number> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.rpc('notification_unread_count');
    if (error) {
      // Fallback a consulta directa sobre la tabla
      const { count } = await supabase
        .from('notificaciones_usuario')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      return count || 0;
    }
    return typeof data === 'number' ? data : 0;
  } catch {
    return 0;
  }
}

/**
 * Marca una notificación individual como leída.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<AuthResult<{ read: boolean }>> {
  if (!notificationId) {
    return { success: false, error: 'Identificador de notificación requerido' };
  }
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.rpc('notification_mark_read', {
      p_notification_id: notificationId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { read: !!data?.read } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al marcar notificación como leída' };
  }
}

/**
 * Marca todas las notificaciones pendientes del usuario como leídas.
 */
export async function markAllNotificationsRead(): Promise<AuthResult<{ markedCount: number }>> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.rpc('notification_mark_all_read');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { markedCount: data?.marked_count || 0 } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al marcar todas las notificaciones' };
  }
}
