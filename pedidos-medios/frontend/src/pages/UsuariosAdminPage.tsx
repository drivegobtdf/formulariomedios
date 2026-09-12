import React from 'react';
import { PlaceholderCard } from '../components/Placeholders';

export const UsuariosAdminPage: React.FC = () => {
  return (
    <PlaceholderCard
      title="Administración de Usuarios y Roles de Aplicación"
      description="Gestión de aprobaciones, asignación de roles (Administrador, Equipo, Observador), configuración de nombre_usuario y revocación de accesos internos."
      phase="F8"
      routePath="/formulariomedios/usuarios"
    />
  );
};
