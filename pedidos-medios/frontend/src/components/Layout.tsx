import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getPublicConfig } from '../services/config';

export const Layout: React.FC = () => {
  const config = getPublicConfig();
  const location = useLocation();
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

  return (
    <div className="pedidos-app">
      <header className="pedidos-header">
        {isProductionPreview ? (
          /* Cabecera Institucional Limpia (Modo Production Preview) */
          <div className="pedidos-header-institutional">
            <div className="pedidos-header-brand">
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>PEDIDOS</h1>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                Secretaría de Medios
              </p>
              <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                Gobierno de Tierra del Fuego AIAS
              </p>
            </div>

            {isInternalPath ? (
              <nav className="pedidos-nav" aria-label="Navegación interna">
                <NavLink to="/gestion" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Gestión de Pedidos
                </NavLink>
                <NavLink to="/usuarios" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Usuarios y Roles
                </NavLink>
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
            <h1>PEDIDOS — Secretaría de Medios</h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
              Gobierno de Tierra del Fuego AIAS · Revisión {config.contractVersion} · v{config.pluginVersion} ({config.environment})
            </p>

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
