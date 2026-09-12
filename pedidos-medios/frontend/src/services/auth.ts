/**
 * Servicio de Autenticación y Autorización Frontend
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 *
 * Conecta con Supabase Auth y consulta usuarios_acceso como autoridad de perfil.
 */

import { getSupabaseClient } from './supabaseClient';
import { AppRole, EstadoAcceso, UserProfile } from '../auth/types';

export interface SignUpParams {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  nombreUsuario: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface AuthResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Valida el formato del nombre de usuario según el contrato v3:
 * Minúsculas, trim, 2-30 caracteres alfanuméricos, puntos, guiones o guiones bajos.
 */
export function isValidNombreUsuario(username: string): boolean {
  if (!username) return false;
  return /^[a-z0-9._-]{2,30}$/.test(username.trim());
}

/**
 * Registra un nuevo usuario en Supabase Auth enviando la metadata de perfil requerida.
 * El trigger de base de datos 'handle_new_user_signup' creará automáticamente
 * la fila en 'usuarios_acceso' con estado 'pendiente' y rol base 'observador'.
 */
export async function signUp(params: SignUpParams): Promise<AuthResult<{ userId: string }>> {
  const { email, password, nombre, apellido, nombreUsuario } = params;

  const cleanNombre = nombre.trim();
  const cleanApellido = apellido.trim();
  const cleanUsername = nombreUsuario.trim().toLowerCase();

  if (!cleanNombre) {
    return { success: false, error: 'El nombre es obligatorio.' };
  }
  if (!cleanApellido) {
    return { success: false, error: 'El apellido es obligatorio.' };
  }
  if (!isValidNombreUsuario(cleanUsername)) {
    return {
      success: false,
      error: 'El nombre de usuario debe tener entre 2 y 30 caracteres alfanuméricos, puntos o guiones en minúsculas.',
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre: cleanNombre,
        apellido: cleanApellido,
        nombre_usuario: cleanUsername,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'No se pudo crear la cuenta de usuario.' };
  }

  return { success: true, data: { userId: data.user.id } };
}

/**
 * Inicia sesión en Supabase Auth con credenciales de email y contraseña.
 */
export async function signIn(params: SignInParams): Promise<AuthResult<{ userId: string }>> {
  const { email, password } = params;
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: 'Error al obtener sesión de usuario.' };
  }

  return { success: true, data: { userId: data.user.id } };
}

/**
 * Cierra la sesión activa en Supabase Auth.
 */
export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Consulta la tabla 'usuarios_acceso' para obtener el perfil del usuario autenticado actual.
 * Aplica la política RLS 'usuarios_acceso_select_self' para garantizar que cada
 * usuario solo obtenga su propio estado y rol.
 */
export async function getMyAccess(): Promise<AuthResult<UserProfile | null>> {
  const supabase = getSupabaseClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { success: true, data: null };
  }

  const user = userData.user;

  const { data, error } = await supabase
    .from('usuarios_acceso')
    .select('user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role, solicitado_at, aprobado_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: true, data: null };
  }

  const profile: UserProfile = {
    userId: data.user_id,
    nombre: data.nombre,
    apellido: data.apellido,
    nombreUsuario: data.nombre_usuario,
    email: user.email,
    estadoAcceso: data.estado_acceso as EstadoAcceso,
    appRole: data.app_role as AppRole,
    solicitadoAt: data.solicitado_at,
    aprobadoAt: data.aprobado_at,
  };

  return { success: true, data: profile };
}

/**
 * Determina si el perfil cuenta con acceso operativo aprobado.
 */
export function isApproved(profile: UserProfile | null): boolean {
  return profile !== null && profile.estadoAcceso === 'aprobado';
}

/**
 * Determina si el perfil cuenta con privilegios de administrador aprobado.
 */
export function isAdmin(profile: UserProfile | null): boolean {
  return isApproved(profile) && profile?.appRole === 'administrador';
}

/**
 * Determina si el perfil cuenta con privilegios de equipo operativo o administrador aprobado.
 */
export function isTeamOrAdmin(profile: UserProfile | null): boolean {
  return isApproved(profile) && (profile?.appRole === 'equipo' || profile?.appRole === 'administrador');
}

/**
 * Determina si el perfil es observador aprobado.
 */
export function isObserver(profile: UserProfile | null): boolean {
  return isApproved(profile) && profile?.appRole === 'observador';
}
