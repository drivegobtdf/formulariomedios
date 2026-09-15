import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getPublicConfig } from '../services/config';
import { useAuth } from '../auth/AuthContext';

export const Layout: React.FC = () => {
  const config = getPublicConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const isProductionPreview = config.uiMode === 'production-preview' || config.environment === 'production';

  const isInternalPath =
    location.pathname.includes('/gestion') ||
    location.pathname.includes('/usuarios') ||
    location.pathname.includes('/login') ||
    location.pathname.includes('/solicitar-acceso') ||
    location.pathname.includes('/pedido/');

  const isPublicFormPage =
    location.pathname === '/' ||
    location.pathname === '/formulariomedios' ||
    location.pathname === '/formulariomedios/' ||
    location.pathname === '';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className={`pedidos-app ${isInternalPath ? 'pedidos-app-wide' : ''}`}>
      <header className="pedidos-header">
        {isProductionPreview ? (
          /* Cabecera Institucional Limpia (Modo Production Preview) */
          <div className="pedidos-header-institutional">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div className="pedidos-header-brand">
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>PEDIDOS</h1>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                  Secretaría de Medios
                </p>
                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                  Gobierno de Tierra del Fuego AIAS
                </p>
              </div>

              {isInternalPath && user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <span style={{ color: '#334155', fontWeight: 500 }}>
                    👤 {user.nombre} {user.apellido}
                  </span>
                  <span
                    style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: isAdmin ? '#fef3c7' : user.appRole === 'equipo' ? '#e0e7ff' : '#f1f5f9',
                      color: isAdmin ? '#b45309' : user.appRole === 'equipo' ? '#4338ca' : '#475569',
                      textTransform: 'uppercase',
                    }}
                  >
                    {user.appRole}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.8rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>

            {isInternalPath ? (
              <nav className="pedidos-nav" aria-label="Navegación interna">
                <NavLink to="/gestion" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Gestión de Pedidos
                </NavLink>
                {isAdmin && (
                  <NavLink to="/usuarios" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Usuarios y Roles
                  </NavLink>
                )}
                {!user && (
                  <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Acceso Interno
                  </NavLink>
                )}
                <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Portal Público
                </NavLink>
              </nav>
            ) : (
              <div
                className="pedidos-header-public-bar"
                style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
              >
                {isPublicFormPage ? (
                  <NavLink
                    to="/mis-solicitudes"
                    style={{ fontSize: '0.875rem', color: '#0284c7', textDecoration: 'none', fontWeight: 500 }}
                  >
                    ¿Ya realizaste una solicitud? <strong>Ver mis solicitudes</strong> &rarr;
                  </NavLink>
                ) : (
                  <NavLink
                    to="/"
                    style={{ fontSize: '0.875rem', color: '#0284c7', textDecoration: 'none', fontWeight: 500 }}
                  >
                    &larr; <strong>Nueva Solicitud</strong>
                  </NavLink>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Shell de Desarrollo y QA Completo */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1>PEDIDOS — Secretaría de Medios</h1>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                  Gobierno de Tierra del Fuego AIAS · Revisión {config.contractVersion} · v{config.pluginVersion} ({config.environment})
                </p>
              </div>

              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <span style={{ color: '#334155', fontWeight: 500 }}>
                    👤 {user.nombre} {user.apellido}
                  </span>
                  <span
                    style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: isAdmin ? '#fef3c7' : user.appRole === 'equipo' ? '#e0e7ff' : '#f1f5f9',
                      color: isAdmin ? '#b45309' : user.appRole === 'equipo' ? '#4338ca' : '#475569',
                      textTransform: 'uppercase',
                    }}
                  >
                    {user.appRole}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.8rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>

            <nav className="pedidos-nav" aria-label="Navegación principal de desarrollo y QA">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
                Formulario
              </NavLink>
              <NavLink to="/mis-solicitudes" className={({ isActive }) => (isActive ? 'active' : '')}>
                Mis Solicitudes
              </NavLink>
              <NavLink to="/gestion" className={({ isActive }) => (isActive ? 'active' : '')}>
                Gestión
              </NavLink>
              <NavLink to="/usuarios" className={({ isActive }) => (isActive ? 'active' : '')}>
                Usuarios
              </NavLink>
              <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>
                Acceso Interno
              </NavLink>
            </nav>
          </>
        )}
      </header>

      <main className="pedidos-content">
        <Outlet />
      </main>
    </div>
  );
};
