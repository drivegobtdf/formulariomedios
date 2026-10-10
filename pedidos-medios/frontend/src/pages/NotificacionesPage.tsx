import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { UserNotification } from '../services/notificationsApi';
import { formatRelativeTime, formatHistoryDate, formatNotificationSummary } from '../utils/formatUtils';

export const NotificacionesPage: React.FC = () => {
  const navigate = useNavigate();
  const { isObserver } = useAuth();
  const [activeTab, setActiveTab] = useState<'todas' | 'no_leidas'>('todas');

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  } = useNotifications({ limit: 50, unreadOnly: activeTab === 'no_leidas' });

  // Exclusión estricta de Observadores
  if (isObserver) {
    return (
      <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '0 1rem' }}>
        <div
          style={{
            backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
            border: '1px solid var(--pedidos-border-default, #cbd5e1)',
            borderRadius: '0.5rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #0f172a)', margin: '0 0 0.5rem 0' }}>
            Acceso no disponible
          </h1>
          <p style={{ color: 'var(--pedidos-text-secondary, #475569)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            El rol de Observador no cuenta con acceso al Centro de Notificaciones operativas.
          </p>
          <Link
            to="/gestion"
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
              color: '#ffffff',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            &larr; Volver a Gestión
          </Link>
        </div>
      </div>
    );
  }

  const handleItemClick = async (notif: UserNotification) => {
    if (!notif.readAt) {
      await markRead(notif.id);
    }
    const section = notif.metadata?.section || 'header';
    navigate(`/gestion/pedidos/${notif.pedidoId}?section=${section}`);
  };

  const getNotificationIcon = (tipo: string) => {
    switch (tipo) {
      case 'pedido_asignado':
        return '👤';
      case 'info_respondida':
        return '📩';
      case 'retrabajo_solicitado':
        return '🔄';
      case 'nota_creada':
        return '📝';
      default:
        return '🔔';
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
      {/* Barra superior de navegación */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link
          to="/gestion"
          style={{
            color: 'var(--pedidos-brand-accent, #0284c7)',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          &larr; Volver a Gestión
        </Link>
      </div>

      {/* Tarjeta Principal */}
      <div
        style={{
          backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
          border: '1px solid var(--pedidos-border-default, #cbd5e1)',
          borderRadius: '0.625rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera de Página */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            backgroundColor: 'var(--pedidos-surface-raised, #f8fafc)',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.35rem',
                fontWeight: 700,
                color: 'var(--pedidos-text-primary, #0f172a)',
                margin: '0 0 0.25rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>🔔</span> Centro de Notificaciones
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--pedidos-text-secondary, #475569)' }}>
              Historial de asignaciones, notas internas, respuestas 48h y revisiones
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              style={{
                padding: '0.5rem 0.85rem',
                backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                borderRadius: '0.375rem',
                color: 'var(--pedidos-brand-accent, #0284c7)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              ✓ Marcar todas como leídas ({unreadCount})
            </button>
          )}
        </div>

        {/* Tabs de Filtro */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('todas')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'todas' ? '2px solid var(--pedidos-brand-accent, #0284c7)' : '2px solid transparent',
              color: activeTab === 'todas' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-text-muted, #64748b)',
              fontWeight: activeTab === 'todas' ? 700 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('no_leidas')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'no_leidas' ? '2px solid var(--pedidos-brand-accent, #0284c7)' : '2px solid transparent',
              color: activeTab === 'no_leidas' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-text-muted, #64748b)',
              fontWeight: activeTab === 'no_leidas' ? 700 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            No leídas {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        </div>

        {/* Error o Feedback */}
        {error && (
          <div
            style={{
              margin: '1rem 1.5rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '0.85rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Listado */}
        <div>
          {isLoading && notifications.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #64748b)' }}>
              Cargando notificaciones...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #64748b)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {activeTab === 'no_leidas' ? '✨' : '📭'}
              </div>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--pedidos-text-primary, #0f172a)', marginBottom: '0.25rem' }}>
                {activeTab === 'no_leidas' ? 'No tienes notificaciones pendientes' : 'Sin notificaciones registradas'}
              </div>
              <div style={{ fontSize: '0.825rem' }}>
                {activeTab === 'no_leidas'
                  ? 'Todas las notificaciones operativas han sido marcadas como leídas.'
                  : 'Aquí verás las actualizaciones de tus pedidos asignados, notas y revisiones.'}
              </div>
            </div>
          ) : (
            notifications.map((notif) => {
              const isUnread = !notif.readAt;
              const resumen = formatNotificationSummary(notif);
              const pedidoCode = notif.metadata?.pedido_visible;
              const relativeTime = formatRelativeTime(notif.createdAt);
              const exactTime = formatHistoryDate(notif.createdAt);

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleItemClick(notif);
                  }}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--pedidos-border-subtle, #f1f5f9)',
                    backgroundColor: isUnread
                      ? 'var(--pedidos-surface-sunken, #f8fafc)'
                      : 'var(--pedidos-surface-card, #ffffff)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--pedidos-surface-raised, #f1f5f9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isUnread
                      ? 'var(--pedidos-surface-sunken, #f8fafc)'
                      : 'var(--pedidos-surface-card, #ffffff)';
                  }}
                >
                  <span style={{ fontSize: '1.4rem', marginTop: '0.1rem' }}>
                    {getNotificationIcon(notif.tipo)}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      {pedidoCode && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '0.25rem',
                            backgroundColor: 'var(--pedidos-surface-sunken, #f1f5f9)',
                            color: 'var(--pedidos-text-primary, #0f172a)',
                            border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                          }}
                        >
                          {pedidoCode}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: isUnread ? 700 : 500,
                          color: 'var(--pedidos-text-primary, #0f172a)',
                        }}
                      >
                        {resumen}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.775rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
                      <span>{relativeTime}</span>
                      <span>&bull;</span>
                      <span title={exactTime}>{exactTime}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', alignSelf: 'center' }}>
                    {isUnread && (
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '9999px',
                          backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                        }}
                        title="No leída"
                      />
                    )}
                    <span style={{ color: 'var(--pedidos-brand-accent, #0284c7)', fontSize: '0.85rem', fontWeight: 600 }}>
                      Ver detalle &rarr;
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
