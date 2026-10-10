import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { UserProfileModal } from './UserProfileModal';
import { GlobalLogoutModal } from './GlobalLogoutModal';

export const UserProfileMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGlobalLogoutModal, setShowGlobalLogoutModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // Cerrar al navegar a otra ruta
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        profileButtonRef.current?.focus();
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

  if (!user) return null;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'administrador':
        return { label: 'Admin', bg: '#fef3c7', color: '#b45309' };
      case 'equipo':
        return { label: 'Equipo', bg: '#e0f2fe', color: '#0369a1' };
      case 'observador':
        return { label: 'Observador', bg: '#f1f5f9', color: '#475569' };
      default:
        return { label: role, bg: '#f1f5f9', color: '#475569' };
    }
  };

  const roleInfo = getRoleBadge(user.appRole);

  const handleOpenProfile = () => {
    setIsOpen(false);
    setShowProfileModal(true);
  };

  const handleLocalSignOut = async () => {
    setIsOpen(false);
    await signOut({ scope: 'local' });
  };

  const handleOpenGlobalLogout = () => {
    setIsOpen(false);
    setShowGlobalLogoutModal(true);
  };

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }} ref={menuRef}>
        {/* Trigger Button */}
        <button
          ref={profileButtonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={`Perfil de usuario: ${user.nombre} ${user.apellido}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'var(--pedidos-surface-sunken, #f1f5f9)',
            border: '1px solid var(--pedidos-border-default, #cbd5e1)',
            borderRadius: '0.375rem',
            padding: '0.35rem 0.65rem',
            cursor: 'pointer',
            color: 'var(--pedidos-text-primary, #0f172a)',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'background-color 0.15s ease, border-color 0.15s ease',
          }}
          title="Opciones de perfil y sesión"
        >
          <span style={{ fontSize: '1rem' }}>👤</span>
          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.nombre} {user.apellido}
          </span>
          <span
            style={{
              fontSize: '0.675rem',
              fontWeight: 700,
              padding: '0.1rem 0.35rem',
              borderRadius: '0.25rem',
              backgroundColor: roleInfo.bg,
              color: roleInfo.color,
            }}
          >
            {roleInfo.label}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--pedidos-text-muted, #64748b)', marginLeft: '0.15rem' }}>
            ▼
          </span>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '260px',
              maxWidth: 'calc(100vw - 1.5rem)',
              backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header info */}
            <div
              style={{
                padding: '0.75rem 0.9rem',
                borderBottom: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
                backgroundColor: 'var(--pedidos-surface-raised, #f8fafc)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--pedidos-text-primary, #0f172a)' }}>
                {user.nombre} {user.apellido}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
                @{user.nombreUsuario} {user.email ? `· ${user.email}` : ''}
              </div>
            </div>

            {/* Menu Options */}
            <div style={{ padding: '0.35rem 0' }}>
              <button
                type="button"
                onClick={handleOpenProfile}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--pedidos-text-primary, #0f172a)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--pedidos-surface-raised, #f1f5f9)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>👤</span>
                <span>Mi perfil</span>
              </button>

              <div style={{ height: '1px', backgroundColor: 'var(--pedidos-border-subtle, #e2e8f0)', margin: '0.35rem 0' }} />

              <button
                type="button"
                onClick={handleLocalSignOut}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--pedidos-text-primary, #0f172a)',
                  fontSize: '0.825rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--pedidos-surface-raised, #f1f5f9)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Cerrar sesión únicamente en este navegador"
              >
                <span>🚪</span>
                <span>Cerrar sesión en este equipo</span>
              </button>

              <button
                type="button"
                onClick={handleOpenGlobalLogout}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '0.825rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Cerrar sesión en todos los navegadores y dispositivos"
              >
                <span>🌐</span>
                <span>Cerrar sesión en todos los equipos</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <GlobalLogoutModal
        isOpen={showGlobalLogoutModal}
        onClose={() => setShowGlobalLogoutModal(false)}
      />
    </>
  );
};
