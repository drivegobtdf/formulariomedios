import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const SolicitudInformacionPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Respuesta a Solicitud de Información Faltante"
      description="Interfaz accesible mediante token seguro para que el solicitante aclare dudas o aporte archivos requeridos por el equipo sin requerir cuenta interna."
      phase="F7"
      routePath="/formulariomedios/solicitud-informacion"
    />
  );
};
