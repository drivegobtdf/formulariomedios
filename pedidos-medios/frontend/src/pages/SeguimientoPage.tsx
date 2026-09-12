import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const SeguimientoPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Seguimiento Público de Pedidos"
      description="Consulta del estado de una solicitud mediante token seguro por PED o solicitud de reenvío por correo electrónico con respuesta neutra anti-enumeración."
      phase="F7"
      routePath="/formulariomedios/seguimiento"
    />
  );
};
