import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/Placeholders';

export const PedidoDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <PlaceholderCard
      title={`Detalle Operativo del Pedido: ${id || 'PED-YYYY-CNNNNNN'}`}
      description="Visualización completa de la solicitud, historial auditado de asignaciones, cambios de estado, notas internas, archivos Drive asociados y gestión de entregas versionadas."
      phase="F8"
      routePath={`/formulariomedios/pedido/${id || ':id'}`}
    />
  );
};
