import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getPublicConfig } from '../services/config';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell } from './notifications/NotificationBell';
import { UserProfileMenu } from './profile/UserProfileMenu';
import logoGobTdf from '../assets/logo-gob-tdf.png';
import logoGobTdfBlanco from '../../../../GOB-TDF-BLANCO-scaled-e1777050842342.png';

export const Layout: React.FC = () => {
  const config = getPublicConfig();
  const location = useLocation();
  const { user, isAdmin, isObserver } = useAuth();
  const isProductionPreview = config.uiMode === 'production-preview' || config.environment === 'production';

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pedidos:theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('pedidos:theme', next);
      return next;
    });
  };

  const isInternalManagementPath =
    location.pathname.startsWith('/gestion') ||
    location.pathname.startsWith('/notificaciones') ||
    location.pathname.startsWith('/usuarios') ||
    location.pathname.startsWith('/pedido/');

  const isAuthPath =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/solicitar-acceso') ||
    location.pathname.startsWith('/confirmar-email');

  const isInternalPath = isInternalManagementPath || isAuthPath;

  const isMisSolicitudes =
    location.pathname.startsWith('/mis-solicitudes') ||
    location.pathname.startsWith('/seguimiento') ||
    location.pathname.startsWith('/solicitud-informacion');

  const isPublicFormPage =
    location.pathname === '/' ||
    location.pathname === '' ||
    location.pathname.startsWith('/nueva-solicitud') ||
    location.pathname.startsWith('/solicitud-recibida') ||
    location.pathname.startsWith('/privacidad');

  const containerClass = isInternalPath
    ? 'pedidos-app pedidos-app-wide'
    : isMisSolicitudes
    ? 'pedidos-app pedidos-app-tracking'
    : 'pedidos-app pedidos-app-public';

  const isDark = isInternalManagementPath && theme === 'dark';
  const currentLogo = isDark ? logoGobTdfBlanco : logoGobTdf;

  return (
    <div className={containerClass} data-theme={isInternalManagementPath ? theme : undefined}>
      <header className="pedidos-header">
        {isProductionPreview ? (
          /* Cabecera Institucional Limpia (Modo Production Preview) */
          <div className="pedidos-header-institutional">
            <div className="pedidos-header-main-row">
              <NavLink to="/" className="pedidos-header-brand-link" aria-label="Portal Oficial - Gobierno de Tierra del Fuego AIAS">
                <img
                  src={currentLogo}
                  alt="Gobierno de Tierra del Fuego AIAS"
                  className="pedidos-header-logo"
                />
              </NavLink>

              <div className="pedidos-header-actions">
                {isInternalManagementPath && (
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="pedidos-btn-theme-toggle"
                    aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  >
                    {theme === 'dark' ? '☀ Modo Claro' : '🌙 Modo Oscuro'}
                  </button>
                )}
                {isInternalPath && user ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {!isObserver && <NotificationBell />}
                    <UserProfileMenu />
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
                  src={currentLogo}
                  alt="Gobierno de Tierra del Fuego AIAS"
                  className="pedidos-header-logo"
                />
              </NavLink>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {isInternalManagementPath && (
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="pedidos-btn-theme-toggle"
                    aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  >
                    {theme === 'dark' ? '☀ Modo Claro' : '🌙 Modo Oscuro'}
                  </button>
                )}
                {user && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {!isObserver && <NotificationBell />}
                    <UserProfileMenu />
                  </div>
                )}
              </div>
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

      <footer className="pedidos-footer">
        <div className="pedidos-footer-content">
          <div className="pedidos-footer-brand">
            <span>Sistema PEDIDOS — Secretaría de Medios</span>
            <span className="pedidos-footer-sep">•</span>
            <span>Gobierno de Tierra del Fuego AIAS</span>
          </div>
          <div className="pedidos-footer-links">
            <NavLink to="/privacidad" className="pedidos-footer-link">
              Política de Privacidad
            </NavLink>
          </div>
        </div>
      </footer>
    </div>
  );
};
