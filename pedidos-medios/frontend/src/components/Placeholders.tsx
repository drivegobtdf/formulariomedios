import React from 'react';

interface PlaceholderCardProps {
  title: string;
  description: string;
  phase: string;
  routePath: string;
}

export const PlaceholderCard: React.FC<PlaceholderCardProps> = ({
  title,
  description,
  phase,
  routePath,
}) => {
  return (
    <div className="pedidos-placeholder-card">
      <div className="pedidos-badge">Fase {phase} — Implementación pendiente</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="pedidos-meta-info">
        <span>Ruta activa: <code>{routePath}</code></span>
      </div>
    </div>
  );
};
