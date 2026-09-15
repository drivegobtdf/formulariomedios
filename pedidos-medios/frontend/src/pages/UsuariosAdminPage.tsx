import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  fetchAdminUsers,
  adminApproveUser,
  adminRejectUser,
  adminRevokeUser,
  adminChangeUserRole,
  adminChangeUsername,
  AdminUserListItem,
} from '../services/gestionApi';
import { isValidNombreUsuario } from '../services/auth';

export const UsuariosAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendiente' | 'aprobado' | 'rechazado' | 'revocado'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [activeModal, setActiveModal] = useState<'approve' | 'reject' | 'revoke' | 'changeRole' | 'changeUsername' | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [modalRole, setModalRole] = useState<'equipo' | 'observador' | 'administrador'>('equipo');
  const [modalMotivo, setModalMotivo] = useState('');
  const [modalUsername, setModalUsername] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el listado de usuarios.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [loadUsers, isAdmin]);

  // Auth Loading
  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
        <h3>Verificando permisos de administración...</h3>
      </div>
    );
  }

  // Unauthenticated Gate
  if (!user) {
    return (
      <div style={{ maxWidth: '480px', margin: '3rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
          <h2>Acceso Restringido</h2>
          <p style={{ color: '#64748b' }}>Debe iniciar sesión como Administrador para acceder a esta sección.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{ padding: '0.65rem 1.5rem', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  // Denied Access for Non-Admins (Equipo / Observador)
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: '540px', margin: '3rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚫</div>
          <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem 0' }}>Acceso Denegado</h2>
          <p style={{ color: '#64748b', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
            Esta sección es de uso exclusivo para <strong>Administradores</strong> del sistema. Su cuenta actual tiene rol de <strong>{user.appRole}</strong>.
          </p>
          <Link
            to="/gestion"
            style={{ display: 'inline-block', padding: '0.65rem 1.5rem', backgroundColor: '#0284c7', color: '#ffffff', textDecoration: 'none', borderRadius: '0.375rem', fontWeight: 600 }}
          >
            ← Volver a Gestión de Pedidos
          </Link>
        </div>
      </div>
    );
  }

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    if (statusFilter !== 'todos' && u.estado_acceso !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const matchName = `${u.nombre} ${u.apellido}`.toLowerCase().includes(q);
      const matchUsername = u.nombre_usuario.toLowerCase().includes(q);
      return matchName || matchUsername;
    }
    return true;
  });

  // Stats
  const stats = {
    total: users.length,
    pendientes: users.filter((u) => u.estado_acceso === 'pendiente').length,
    aprobados: users.filter((u) => u.estado_acceso === 'aprobado').length,
    rechazados: users.filter((u) => u.estado_acceso === 'rechazado').length,
    revocados: users.filter((u) => u.estado_acceso === 'revocado').length,
  };

  // Modal Handlers
  const handleOpenApprove = (u: AdminUserListItem) => {
    setSelectedUser(u);
    setModalRole('equipo');
    setModalError(null);
    setActiveModal('approve');
  };

  const handleOpenReject = (u: AdminUserListItem) => {
    setSelectedUser(u);
    setModalMotivo('');
    setModalError(null);
    setActiveModal('reject');
  };

  const handleOpenRevoke = (u: AdminUserListItem) => {
    setSelectedUser(u);
    setModalMotivo('');
    setModalError(null);
    setActiveModal('revoke');
  };

  const handleOpenChangeRole = (u: AdminUserListItem) => {
    setSelectedUser(u);
    setModalRole(u.app_role);
    setModalError(null);
    setActiveModal('changeRole');
  };

  const handleOpenChangeUsername = (u: AdminUserListItem) => {
    setSelectedUser(u);
    setModalUsername(u.nombre_usuario);
    setModalError(null);
    setActiveModal('changeUsername');
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedUser(null);
    setModalMotivo('');
    setModalUsername('');
    setModalError(null);
  };

  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setModalLoading(true);
    setModalError(null);
    try {
      await adminApproveUser(selectedUser.user_id, modalRole);
      setActionSuccess(`Usuario @${selectedUser.nombre_usuario} aprobado exitosamente como ${modalRole}.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      setModalError(err?.message || 'Error al aprobar usuario.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setModalLoading(true);
    setModalError(null);
    try {
      await adminRejectUser(selectedUser.user_id, modalMotivo.trim() || undefined);
      setActionSuccess(`Solicitud de @${selectedUser.nombre_usuario} rechazada.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      if (err?.message?.includes('LAST_ADMIN_PROTECTED')) {
        setModalError('No es posible rechazar al único Administrador aprobado del sistema.');
      } else {
        setModalError(err?.message || 'Error al rechazar usuario.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!modalMotivo.trim()) {
      setModalError('El motivo de revocación es obligatorio.');
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      await adminRevokeUser(selectedUser.user_id, modalMotivo.trim());
      setActionSuccess(`Acceso de @${selectedUser.nombre_usuario} revocado exitosamente.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      if (err?.message?.includes('LAST_ADMIN_PROTECTED')) {
        setModalError('No es posible revocar al único Administrador aprobado del sistema.');
      } else {
        setModalError(err?.message || 'Error al revocar acceso.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleChangeRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setModalLoading(true);
    setModalError(null);
    try {
      await adminChangeUserRole(selectedUser.user_id, modalRole);
      setActionSuccess(`Rol de @${selectedUser.nombre_usuario} actualizado a ${modalRole}.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      if (err?.message?.includes('LAST_ADMIN_PROTECTED')) {
        setModalError('No es posible degradar el rol del único Administrador aprobado del sistema.');
      } else {
        setModalError(err?.message || 'Error al modificar rol.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleChangeUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const clean = modalUsername.trim().toLowerCase();
    if (!isValidNombreUsuario(clean)) {
      setModalError('El nombre de usuario debe contener entre 2 y 30 caracteres alfanuméricos en minúsculas.');
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      await adminChangeUsername(selectedUser.user_id, clean);
      setActionSuccess(`Nombre de usuario actualizado a @${clean}.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      setModalError(err?.message || 'Error al modificar nombre de usuario.');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Administración de Usuarios y Roles
            </h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '9999px', backgroundColor: '#fef3c7', color: '#b45309', textTransform: 'uppercase' }}>
              ADMINISTRADOR
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
            Gestión de solicitudes de acceso, asignación de roles operativos y revocación de permisos.
          </p>
        </div>

        <Link
          to="/gestion"
          style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#334155', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}
        >
          ← Volver a Gestión
        </Link>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: '0.375rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Metric Cards Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Cuentas</span>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.15rem 0 0 0' }}>{stats.total}</p>
        </div>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>Pendientes</span>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309', margin: '0.15rem 0 0 0' }}>{stats.pendientes}</p>
        </div>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase' }}>Aprobados</span>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d', margin: '0.15rem 0 0 0' }}>{stats.aprobados}</p>
        </div>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase' }}>Rechazados</span>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b91c1c', margin: '0.15rem 0 0 0' }}>{stats.rechazados}</p>
        </div>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Revocados</span>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#64748b', margin: '0.15rem 0 0 0' }}>{stats.revocados}</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: '#ffffff', padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'pendiente', label: 'Pendientes' },
            { id: 'aprobado', label: 'Aprobados' },
            { id: 'rechazado', label: 'Rechazados' },
            { id: 'revocado', label: 'Revocados' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id as any)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: statusFilter === t.id ? '#0f172a' : 'transparent',
                color: statusFilter === t.id ? '#ffffff' : '#64748b',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Buscar por nombre o usuario..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '0.35rem 0.65rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            fontSize: '0.825rem',
            minWidth: '240px',
          }}
        />
      </div>

      {/* User Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Cargando usuarios...</div>
      ) : (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Usuario</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Rol Asignado</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Fecha Solicitud</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isPend = u.estado_acceso === 'pendiente';
                  const isAprob = u.estado_acceso === 'aprobado';
                  const isRech = u.estado_acceso === 'rechazado';
                  const isRev = u.estado_acceso === 'revocado';

                  return (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {u.nombre} {u.apellido}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          @{u.nombre_usuario}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor:
                              u.app_role === 'administrador'
                                ? '#fef3c7'
                                : u.app_role === 'equipo'
                                ? '#e0e7ff'
                                : '#f1f5f9',
                            color:
                              u.app_role === 'administrador'
                                ? '#b45309'
                                : u.app_role === 'equipo'
                                ? '#4338ca'
                                : '#475569',
                            textTransform: 'uppercase',
                          }}
                        >
                          {u.app_role}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: isPend
                              ? '#fef3c7'
                              : isAprob
                              ? '#dcfce7'
                              : '#fee2e2',
                            color: isPend
                              ? '#b45309'
                              : isAprob
                              ? '#15803d'
                              : '#b91c1c',
                            textTransform: 'uppercase',
                          }}
                        >
                          {u.estado_acceso}
                        </span>
                        {isRev && u.motivo_revocacion && (
                          <div style={{ fontSize: '0.725rem', color: '#991b1b', marginTop: '0.2rem' }}>
                            Motivo: {u.motivo_revocacion}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {new Date(u.solicitado_at).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isPend && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenApprove(u)}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                ✓ Aprobar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReject(u)}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                ✕ Rechazar
                              </button>
                            </>
                          )}

                          {isAprob && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenChangeRole(u)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Cambiar Rol
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenChangeUsername(u)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                @Usuario
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenRevoke(u)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Revocar
                              </button>
                            </>
                          )}

                          {(isRech || isRev) && (
                            <button
                              type="button"
                              onClick={() => handleOpenApprove(u)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '0.25rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Reactivar / Aprobar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                      No se encontraron usuarios con los criterios de búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Aprobar / Reactivar */}
      {activeModal === 'approve' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Aprobar Acceso Operativo</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Aprobar la cuenta de <strong>{selectedUser.nombre} {selectedUser.apellido}</strong> (@{selectedUser.nombre_usuario}).
            </p>

            {modalError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.25rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleApproveSubmit}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Rol de Aplicación a Asignar:
              </label>
              <select
                value={modalRole}
                onChange={(e) => setModalRole(e.target.value as any)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '1.25rem', fontSize: '0.875rem' }}
              >
                <option value="equipo">Equipo (Operación de pedidos)</option>
                <option value="observador">Observador (Solo lectura)</option>
                <option value="administrador">Administrador (Control total)</option>
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#16a34a', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {modalLoading ? 'Aprobando...' : 'Confirmar Aprobación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rechazar */}
      {activeModal === 'reject' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#991b1b' }}>Rechazar Solicitud</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              ¿Rechazar la solicitud de <strong>{selectedUser.nombre} {selectedUser.apellido}</strong> (@{selectedUser.nombre_usuario})?
            </p>

            {modalError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.25rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleRejectSubmit}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Motivo del rechazo (opcional):
              </label>
              <textarea
                value={modalMotivo}
                onChange={(e) => setModalMotivo(e.target.value)}
                placeholder="Indique el motivo o justificación..."
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '1.25rem', fontSize: '0.875rem' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {modalLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revocar */}
      {activeModal === 'revoke' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#991b1b' }}>Revocar Acceso de Usuario</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Se inhabilitará el acceso de <strong>{selectedUser.nombre} {selectedUser.apellido}</strong> (@{selectedUser.nombre_usuario}).
            </p>

            {modalError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.25rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleRevokeSubmit}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Motivo de Revocación (obligatorio):
              </label>
              <textarea
                required
                value={modalMotivo}
                onChange={(e) => setModalMotivo(e.target.value)}
                placeholder="Indique el motivo contractual o administrativo..."
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '1.25rem', fontSize: '0.875rem' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {modalLoading ? 'Revocando...' : 'Confirmar Revocación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cambiar Rol */}
      {activeModal === 'changeRole' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Modificar Rol de Usuario</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Cambiar rol para <strong>{selectedUser.nombre} {selectedUser.apellido}</strong> (@{selectedUser.nombre_usuario}).
            </p>

            {modalError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.25rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleChangeRoleSubmit}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Nuevo Rol:
              </label>
              <select
                value={modalRole}
                onChange={(e) => setModalRole(e.target.value as any)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '1.25rem', fontSize: '0.875rem' }}
              >
                <option value="equipo">Equipo (Operación de pedidos)</option>
                <option value="observador">Observador (Solo lectura)</option>
                <option value="administrador">Administrador (Control total)</option>
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#0284c7', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {modalLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cambiar Nombre de Usuario */}
      {activeModal === 'changeUsername' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Modificar Nombre de Usuario</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Usuario: <strong>{selectedUser.nombre} {selectedUser.apellido}</strong>
            </p>

            {modalError && (
              <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.25rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleChangeUsernameSubmit}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Nuevo @nombre_usuario:
              </label>
              <input
                type="text"
                required
                value={modalUsername}
                onChange={(e) => setModalUsername(e.target.value.toLowerCase())}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '0.35rem', fontSize: '0.875rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1.25rem' }}>
                2-30 caracteres alfanuméricos en minúsculas, puntos, guiones o guiones bajos.
              </span>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#0284c7', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {modalLoading ? 'Guardando...' : 'Actualizar Nombre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
