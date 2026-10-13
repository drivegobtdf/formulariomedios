import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { UserNotification } from '../../services/notificationsApi';
import { formatRelativeTime, formatNotificationSummary } from '../../utils/formatUtils';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'todas' | 'no_leidas'>('todas');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh,
    isEligible,
  } = useNotifications({ limit: 10, unreadOnly: activeTab === 'no_leidas' });

  // Cerrar al navegar a otra ruta
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Cerrar al hacer clic fuera o presionar ESC (retornando foco al disparador)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isEligible) {
    return null;
  }

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      refresh(false);
    }
  };

  const handleItemClick = async (notif: UserNotification) => {
    setIsOpen(false);
    if (!notif.readAt) {
      await markRead(notif.id);
    }
    const section = notif.metadata?.section || 'header';
    navigate(`/gestion/pedidos/${notif.pedidoId}?section=${section}`);
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/gestion/notificaciones');
  };

  const badgeText = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

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
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      {/* Botón de Campana */}
      <button
        ref={bellButtonRef}
        type="button"
        onClick={handleToggle}
        aria-label={
          unreadCount > 0
            ? `Notificaciones: ${unreadCount} no leídas`
            : 'Notificaciones: sin nuevas notificaciones'
        }
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          position: 'relative',
          background: 'transparent',
          border: '1px solid var(--pedidos-border-default, #cbd5e1)',
          borderRadius: '0.375rem',
          padding: '0.4rem 0.55rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--pedidos-text-primary, #0f172a)',
          fontSize: '1.1rem',
          lineHeight: 1,
          transition: 'background-color 0.15s ease, border-color 0.15s ease',
        }}
        title="Centro de notificaciones"
      >
        <span role="img" aria-hidden="true">
          🔔
        </span>

        {/* Badge numérico */}
        {badgeText && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '0.675rem',
              fontWeight: 800,
              padding: '0.1rem 0.35rem',
              borderRadius: '9999px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              border: '2px solid var(--pedidos-popover-bg, #ffffff)',
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {/* Panel Dropdown */}
      {isOpen && (
        <div
          className="pedidos-notification-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxWidth: 'calc(100vw - 1.5rem)',
            backgroundColor: 'var(--pedidos-popover-bg, #ffffff)',
            border: '1px solid var(--pedidos-popover-border, #cbd5e1)',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header del Dropdown */}
          <div
            style={{
              padding: '0.75rem 0.9rem',
              borderBottom: '1px solid var(--pedidos-popover-border, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--pedidos-popover-header-bg, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--pedidos-text-primary, #0f172a)' }}>
                Notificaciones
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '9999px',
                    fontWeight: 700,
                  }}
                >
                  {unreadCount} nuevas
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '0.25rem',
                }}
                title="Marcar todas como leídas"
              >
                Marcar leídas
              </button>
            )}
          </div>

          {/* Selector de Tabs [Todas] / [No leídas] */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--pedidos-popover-border, #e2e8f0)',
              backgroundColor: 'var(--pedidos-popover-header-bg, #f8fafc)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('todas')}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'todas' ? '2px solid var(--pedidos-brand-accent, #0284c7)' : '2px solid transparent',
                color: activeTab === 'todas' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-text-muted, #64748b)',
                fontWeight: activeTab === 'todas' ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('no_leidas')}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'no_leidas' ? '2px solid var(--pedidos-brand-accent, #0284c7)' : '2px solid transparent',
                color: activeTab === 'no_leidas' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-text-muted, #64748b)',
                fontWeight: activeTab === 'no_leidas' ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              No leídas {unreadCount > 0 ? `(${unreadCount})` : ''}
            </button>
          </div>

          {/* Lista de Notificaciones */}
          <div
            style={{
              maxHeight: '340px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isLoading && notifications.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #64748b)', fontSize: '0.825rem' }}>
                Cargando notificaciones...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #64748b)', fontSize: '0.825rem' }}>
                {activeTab === 'no_leidas' ? '✨ No tienes notificaciones sin leer' : 'Sin notificaciones'}
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.readAt;
                const resumen = formatNotificationSummary(notif);
                const timeText = formatRelativeTime(notif.createdAt);

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
                      padding: '0.65rem 0.9rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--pedidos-popover-border, #f1f5f9)',
                      backgroundColor: isUnread
                        ? 'var(--pedidos-popover-item-unread, #f0f9ff)'
                        : 'var(--pedidos-popover-bg, #ffffff)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--pedidos-popover-item-hover, #f1f5f9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isUnread
                        ? 'var(--pedidos-popover-item-unread, #f0f9ff)'
                        : 'var(--pedidos-popover-bg, #ffffff)';
                    }}
                  >
                    {/* Icono de tipo */}
                    <span style={{ fontSize: '1.1rem', marginTop: '0.1rem' }}>
                      {getNotificationIcon(notif.tipo)}
                    </span>

                    {/* Contenido */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <div
                        style={{
                          fontSize: '0.825rem',
                          fontWeight: isUnread ? 700 : 500,
                          color: 'var(--pedidos-text-primary, #0f172a)',
                          lineHeight: 1.3,
                        }}
                      >
                        {resumen}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '0.15rem',
                        }}
                      >
                        <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
                          {timeText}
                        </span>
                        {isUnread && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                            }}
                            title="No leída"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer del Dropdown */}
          <div
            style={{
              padding: '0.6rem 0.9rem',
              borderTop: '1px solid var(--pedidos-popover-border, #e2e8f0)',
              backgroundColor: 'var(--pedidos-popover-footer-bg, #f8fafc)',
              textAlign: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleViewAll}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--pedidos-brand-accent, #0284c7)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.2rem 0.5rem',
              }}
            >
              Ver todas las notificaciones &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
