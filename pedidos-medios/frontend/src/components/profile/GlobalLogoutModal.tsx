import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';

interface GlobalLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalLogoutModal: React.FC<GlobalLogoutModalProps> = ({ isOpen, onClose }) => {
  const { signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await signOut({ scope: 'global' });
    } finally {
      setIsLoggingOut(false);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--pedidos-surface-card, #ffffff)',
          borderRadius: '0.625rem',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          border: '1px solid var(--pedidos-border-default, #cbd5e1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--pedidos-surface-raised, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🌐</span>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--pedidos-text-primary, #0f172a)' }}>
              Cerrar sesión en todos los equipos
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--pedidos-text-muted, #64748b)',
              cursor: 'pointer',
            }}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1.25rem' }}>
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              color: '#b45309',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              lineHeight: 1.45,
            }}
          >
            ⚠️ <strong>Atención:</strong> Esta acción cerrará la sesión en este navegador y revocará el acceso en todos los demás dispositivos y pestañas donde tu cuenta esté conectada.
          </div>

          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--pedidos-text-secondary, #334155)', lineHeight: 1.5 }}>
            Si utilizas una cuenta de equipo compartida, ten en cuenta que otros integrantes también deberán volver a ingresar sus credenciales.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.5rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isLoggingOut}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                backgroundColor: 'transparent',
                color: 'var(--pedidos-text-secondary, #334155)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isLoggingOut ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoggingOut}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                opacity: isLoggingOut ? 0.7 : 1,
              }}
            >
              {isLoggingOut ? 'Cerrando sesiones...' : 'Cerrar todas las sesiones'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
