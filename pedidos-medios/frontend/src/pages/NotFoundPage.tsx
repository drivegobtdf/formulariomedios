import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="pedidos-placeholder-card" style={{ textAlign: 'center' }}>
      <h2>404 — Página no encontrada</h2>
      <p>La ruta solicitada dentro de la aplicación PEDIDOS no existe.</p>
      <div style={{ marginTop: '1rem' }}>
        <Link to="/" style={{ color: '#0284c7', textDecoration: 'underline' }}>
          Volver al Formulario Principal
        </Link>
      </div>
    </div>
  );
};
