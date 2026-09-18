import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getPublicConfig } from '../services/config';
import { useAuth } from '../auth/AuthContext';
import logoGobTdf from '../assets/logo-gob-tdf.png';

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

  const isMisSolicitudes =
    location.pathname.includes('/mis-solicitudes') ||
    location.pathname.includes('/seguimiento') ||
    location.pathname.includes('/solicitud-informacion');

  const isPublicFormPage =
    location.pathname === '/' ||
    location.pathname === '';

  const containerClass = isInternalPath
    ? 'pedidos-app pedidos-app-wide'
    : isMisSolicitudes
    ? 'pedidos-app pedidos-app-tracking'
    : 'pedidos-app pedidos-app-public';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className={containerClass}>
      <header className="pedidos-header">
        {isProductionPreview ? (
          /* Cabecera Institucional Limpia (Modo Production Preview) */
          <div className="pedidos-header-institutional">
            <div className="pedidos-header-main-row">
              <NavLink to="/" className="pedidos-header-brand-link" aria-label="Portal Oficial - Gobierno de Tierra del Fuego AIAS">
                <img
                  src={logoGobTdf}
                  alt="Gobierno de Tierra del Fuego AIAS"
                  className="pedidos-header-logo"
                />
              </NavLink>

              <div className="pedidos-header-actions">
                {isInternalPath && user ? (
                  <div className="pedidos-user-badge-group">
                    <span className="pedidos-user-name">
                      👤 {user.nombre} {user.apellido}
                    </span>
                    <span
                      className={`pedidos-role-badge ${
                        isAdmin ? 'pedidos-role-admin' : user.appRole === 'equipo' ? 'pedidos-role-equipo' : 'pedidos-role-obs'
                      }`}
                    >
                      {user.appRole}
                    </span>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="pedidos-btn-logout"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                ) : isPublicFormPage ? null : (
                  <NavLink
                    to="/"
                    className="pedidos-header-link-btn"
                  >
                    &larr; Nueva solicitud
                  </NavLink>
                )}
              </div>
            </div>

            {isInternalPath && (
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
            )}
          </div>
        ) : (
          /* Shell de Desarrollo y QA Completo */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <NavLink to="/" className="pedidos-header-brand-link" aria-label="Portal Oficial - Gobierno de Tierra del Fuego AIAS">
                <img
                  src={logoGobTdf}
                  alt="Gobierno de Tierra del Fuego AIAS"
                  className="pedidos-header-logo"
                />
              </NavLink>

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
