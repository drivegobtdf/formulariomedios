import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const LoginPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Acceso de Personal Interno"
      description="Inicio de sesión para personal interno y administradores mediante Supabase Auth con email/contraseña o Magic Link."
      phase="F3"
      routePath="/formulariomedios/login"
    />
  );
};
