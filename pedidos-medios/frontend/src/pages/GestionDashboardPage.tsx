import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const GestionDashboardPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Panel de Gestión y Tablero de Pedidos"
      description="Vistas de Tablero (Kanban por 6 estados), Tabla filtrable, 'Mis pedidos', 'Requieren atención' y 'Archivo reversible' para los roles Administrador, Equipo y Observador."
      phase="F8"
      routePath="/formulariomedios/gestion"
    />
  );
};
