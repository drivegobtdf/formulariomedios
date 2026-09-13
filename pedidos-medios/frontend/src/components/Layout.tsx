import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getPublicConfig } from '../services/config';

export const Layout: React.FC = () => {
  const config = getPublicConfig();

  return (
    <div className="pedidos-app">
      <header className="pedidos-header">
        <h1>PEDIDOS — Secretaría de Medios</h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
          Gobierno de Tierra del Fuego AIAS · Revisión {config.contractVersion} · v{config.pluginVersion} ({config.environment})
        </p>

        <nav className="pedidos-nav" aria-label="Navegación principal">
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
      </header>

      <main className="pedidos-content">
        <Outlet />
      </main>
    </div>
  );
};
