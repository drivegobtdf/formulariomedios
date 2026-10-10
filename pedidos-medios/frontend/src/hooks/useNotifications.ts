import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSupabaseClient } from '../services/supabaseClient';
import {
  UserNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationsApi';

export interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { limit = 10, unreadOnly = false } = options;
  const { user, isObserver, isTeamOrAdmin } = useAuth();

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isEligible = Boolean(user && !isObserver && isTeamOrAdmin);
  const isEligibleRef = useRef(isEligible);
  isEligibleRef.current = isEligible;

  // Carga lista de notificaciones
  const loadNotifications = useCallback(
    async (showLoading = false) => {
      if (!isEligibleRef.current) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      if (showLoading) setIsLoading(true);
      setError(null);

      try {
        const [listRes, count] = await Promise.all([
          fetchNotifications({ limit, unreadOnly }),
          fetchUnreadNotificationCount(),
        ]);

        if (listRes.success && listRes.data) {
          setNotifications(listRes.data);
        } else if (listRes.error) {
          setError(listRes.error);
        }
        setUnreadCount(count);
      } catch (err: any) {
        setError(err?.message || 'Error al cargar notificaciones');
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [limit, unreadOnly]
  );

  // Inicialización y suscripción a Supabase Realtime
  useEffect(() => {
    if (!isEligible || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    loadNotifications(true);

    let channel: any = null;
    try {
      const supabase = getSupabaseClient();
      channel = supabase
        .channel(`user-notifications:${user.userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notificaciones_usuario',
            filter: `user_id=eq.${user.userId}`,
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new;
              const newItem: UserNotification = {
                id: row.id,
                userId: row.user_id,
                pedidoId: row.pedido_id,
                tipo: row.tipo,
                actorUserId: row.actor_user_id || null,
                readAt: row.read_at || null,
                metadata: row.metadata || {},
                createdAt: row.created_at,
              };

              setNotifications((prev) => {
                if (prev.some((n) => n.id === newItem.id)) return prev;
                // Si el filtro es unreadOnly y el item viene leído, no agregar
                if (unreadOnly && newItem.readAt) return prev;
                return [newItem, ...prev].slice(0, limit);
              });
              setUnreadCount((c) => c + 1);
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new;
              setNotifications((prev) =>
                prev
                  .map((n) =>
                    n.id === row.id
                      ? {
                          ...n,
                          readAt: row.read_at,
                          metadata: row.metadata || n.metadata,
                        }
                      : n
                  )
                  .filter((n) => (!unreadOnly ? true : !n.readAt))
              );
              // Sincronizar badge numérico con la base de datos
              fetchUnreadNotificationCount().then((cnt) => setUnreadCount(cnt));
            } else if (payload.eventType === 'DELETE') {
              const delId = payload.old?.id;
              if (delId) {
                setNotifications((prev) => prev.filter((n) => n.id !== delId));
                fetchUnreadNotificationCount().then((cnt) => setUnreadCount(cnt));
              }
            }
          }
        )
        .subscribe();
    } catch {
      // Ignorar fallo de cliente en entornos de pruebas sin realtime
    }

    return () => {
      if (channel) {
        try {
          const supabase = getSupabaseClient();
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [isEligible, user?.userId, limit, unreadOnly, loadNotifications]);

  // Marcar una notificación individual como leída
  const markRead = useCallback(async (notificationId: string) => {
    if (!notificationId) return;

    // Actualización optimista
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await markNotificationRead(notificationId);
  }, []);

  // Marcar todas como leídas
  const markAllRead = useCallback(async () => {
    // Actualización optimista
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso }))
    );
    setUnreadCount(0);

    await markAllNotificationsRead();
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh: loadNotifications,
    markRead,
    markAllRead,
    isEligible,
  };
}
