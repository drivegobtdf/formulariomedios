import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const SolicitudRecibidaPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Solicitud Recibida (Confirmación Multi-PED)"
      description="Pantalla de confirmación tras el envío exitoso del formulario, mostrando los códigos PED asignados a cada pieza/servicio y el enlace seguro de seguimiento."
      phase="F6"
      routePath="/formulariomedios/solicitud-recibida"
    />
  );
};
