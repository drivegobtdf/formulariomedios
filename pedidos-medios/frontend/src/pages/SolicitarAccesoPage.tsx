import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const SolicitarAccesoPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Solicitud de Acceso Operativo"
      description="Formulario de registro inicial para nuevos usuarios internos del equipo de Medios, sujeto a aprobación por un Administrador."
      phase="F3"
      routePath="/formulariomedios/solicitar-acceso"
    />
  );
};
