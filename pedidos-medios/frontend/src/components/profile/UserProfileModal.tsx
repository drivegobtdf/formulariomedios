import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { updateMyProfile } from '../../services/auth';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && isOpen) {
      setNombre(user.nombre || '');
      setApellido(user.apellido || '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();

    if (!cleanNombre) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }
    if (!cleanApellido) {
      setErrorMsg('El apellido es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateMyProfile(cleanNombre, cleanApellido);
      if (res.success) {
        setSuccessMsg('Perfil actualizado correctamente.');
        await refreshUser();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'No se pudo actualizar el perfil.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error de conexión.');
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'administrador':
        return { label: 'Administrador', className: 'pedidos-role-admin' };
      case 'equipo':
        return { label: 'Equipo Operativo', className: 'pedidos-role-equipo' };
      case 'observador':
        return { label: 'Observador', className: 'pedidos-role-obs' };
      default:
        return { label: role, className: 'pedidos-role-obs' };
    }
  };

  const roleInfo = getRoleBadge(user.appRole);

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
          maxWidth: '480px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          border: '1px solid var(--pedidos-border-default, #cbd5e1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
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
            <span style={{ fontSize: '1.25rem' }}>👤</span>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--pedidos-text-primary, #0f172a)' }}>
              Mi Perfil
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
              padding: '0.2rem 0.4rem',
            }}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem' }}>
          {errorMsg && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '0.375rem',
                backgroundColor: 'var(--pedidos-status-cancelado-bg, #fef2f2)',
                border: '1px solid var(--pedidos-status-cancelado-border, #fecaca)',
                color: 'var(--pedidos-status-cancelado-text, #b91c1c)',
                fontSize: '0.85rem',
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '0.375rem',
                backgroundColor: 'var(--pedidos-status-finalizado-bg, #f0fdf4)',
                border: '1px solid var(--pedidos-status-finalizado-border, #bbf7d0)',
                color: 'var(--pedidos-status-finalizado-text, #15803d)',
                fontSize: '0.85rem',
              }}
            >
              ✅ {successMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Nombre y Apellido Editables */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    color: 'var(--pedidos-text-secondary, #334155)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Nombre *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={100}
                  required
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                    backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                    color: 'var(--pedidos-text-primary, #0f172a)',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    color: 'var(--pedidos-text-secondary, #334155)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Apellido *
                </label>
                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  maxLength={100}
                  required
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                    backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                    color: 'var(--pedidos-text-primary, #0f172a)',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Email (Solo Lectura) */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  color: 'var(--pedidos-text-secondary, #334155)',
                  marginBottom: '0.35rem',
                }}
              >
                <span>Email</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)' }}>🔒 (Solo lectura)</span>
              </label>
              <input
                type="text"
                value={user.email || 'Sin email'}
                disabled
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
                  backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                  color: 'var(--pedidos-text-muted, #64748b)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  cursor: 'not-allowed',
                }}
              />
            </div>

            {/* Nombre de Usuario (Solo Lectura) */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  color: 'var(--pedidos-text-secondary, #334155)',
                  marginBottom: '0.35rem',
                }}
              >
                <span>Nombre de usuario</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)' }}>🔒 (Identificador)</span>
              </label>
              <input
                type="text"
                value={`@${user.nombreUsuario}`}
                disabled
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
                  backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                  color: 'var(--pedidos-text-muted, #64748b)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  cursor: 'not-allowed',
                }}
              />
            </div>

            {/* Rol y Estado de Acceso (Solo Lectura) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
              <div
                style={{
                  padding: '0.65rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
                  backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 600 }}>
                  Rol Asignado
                </span>
                <span
                  className={roleInfo.className}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '0.25rem',
                    width: 'fit-content',
                  }}
                >
                  {roleInfo.label}
                </span>
              </div>

              <div
                style={{
                  padding: '0.65rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
                  backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 600 }}>
                  Estado de Cuenta
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '0.25rem',
                    backgroundColor: 'var(--pedidos-status-finalizado-bg, #dcfce7)',
                    color: 'var(--pedidos-status-finalizado-text, #15803d)',
                    border: '1px solid var(--pedidos-status-finalizado-border, #bbf7d0)',
                    width: 'fit-content',
                  }}
                >
                  {user.estadoAcceso === 'aprobado' ? '✅ Aprobado' : user.estadoAcceso}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
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
              disabled={isSaving}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                backgroundColor: 'transparent',
                color: 'var(--pedidos-text-secondary, #334155)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                color: 'var(--pedidos-text-inverse, #ffffff)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
