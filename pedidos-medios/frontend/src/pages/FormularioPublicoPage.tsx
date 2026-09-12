import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const FormularioPublicoPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Formulario Público de Solicitud de Servicios"
      description="Wizard de 3 pasos para solicitud de servicios en las 8 categorías de comunicación institucional (Diseño, Cobertura, Gacetilla, Redes, Producción audiovisual, Motion graphics, Streaming y Web)."
      phase="F6"
      routePath="/formulariomedios/"
    />
  );
};
