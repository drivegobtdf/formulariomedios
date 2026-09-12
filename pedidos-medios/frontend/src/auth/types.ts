/**
 * Tipos de roles y estado de autenticación según la revisión 3.0 (ADR-041).
 */

export type AppRole = 'administrador' | 'equipo' | 'observador';

export type EstadoAcceso = 'pendiente' | 'activo' | 'revocado';

export interface UserProfile {
  id: string;
  userId: string;
  nombre: string;
  apellido: string;
  nombreUsuario: string;
  email: string;
  appRole: AppRole;
  estadoAcceso: EstadoAcceso;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
}
