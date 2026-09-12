import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidNombreUsuario,
  isApproved,
  isAdmin,
  isTeamOrAdmin,
  isObserver,
  signUp,
  signIn,
  signOut,
  getMyAccess,
} from '../services/auth';
import { UserProfile } from '../auth/types';
import * as supabaseClientModule from '../services/supabaseClient';

describe('Auth Service - Validación de Nombre de Usuario', () => {
  it('debe aceptar nombres de usuario válidos según contrato v3', () => {
    expect(isValidNombreUsuario('juan.perez')).toBe(true);
    expect(isValidNombreUsuario('admin_01')).toBe(true);
    expect(isValidNombreUsuario('equipo-medios')).toBe(true);
    expect(isValidNombreUsuario('ab')).toBe(true);
    expect(isValidNombreUsuario('usuario.con.puntos.123')).toBe(true);
  });

  it('debe rechazar nombres de usuario inválidos (mayúsculas, caracteres especiales, longitud errónea)', () => {
    expect(isValidNombreUsuario('JuanPerez')).toBe(false); // Mayúsculas
    expect(isValidNombreUsuario('user@name')).toBe(false); // Carácter especial no permitido
    expect(isValidNombreUsuario('user name')).toBe(false); // Espacio
    expect(isValidNombreUsuario('a')).toBe(false); // Menor a 2 caracteres
    expect(isValidNombreUsuario('')).toBe(false); // Vacío
    expect(isValidNombreUsuario('a'.repeat(31))).toBe(false); // Mayor a 30 caracteres
  });
});

describe('Auth Service - Helpers RBAC', () => {
  const adminProfile: UserProfile = {
    userId: '11111111-1111-1111-1111-111111111111',
    nombre: 'Admin',
    apellido: 'Test',
    nombreUsuario: 'admin.test',
    email: 'admin@example.com',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const equipoProfile: UserProfile = {
    userId: '22222222-2222-2222-2222-222222222222',
    nombre: 'Equipo',
    apellido: 'Test',
    nombreUsuario: 'equipo.test',
    email: 'equipo@example.com',
    appRole: 'equipo',
    estadoAcceso: 'aprobado',
  };

  const observadorProfile: UserProfile = {
    userId: '33333333-3333-3333-3333-333333333333',
    nombre: 'Obs',
    apellido: 'Test',
    nombreUsuario: 'obs.test',
    email: 'obs@example.com',
    appRole: 'observador',
    estadoAcceso: 'aprobado',
  };

  const pendienteProfile: UserProfile = {
    userId: '44444444-4444-4444-4444-444444444444',
    nombre: 'Pend',
    apellido: 'Test',
    nombreUsuario: 'pend.test',
    email: 'pend@example.com',
    appRole: 'observador',
    estadoAcceso: 'pendiente',
  };

  const revocadoProfile: UserProfile = {
    userId: '55555555-5555-5555-5555-555555555555',
    nombre: 'Rev',
    apellido: 'Test',
    nombreUsuario: 'rev.test',
    email: 'rev@example.com',
    appRole: 'equipo',
    estadoAcceso: 'revocado',
  };

  it('isApproved debe retornar true solo si estadoAcceso es aprobado', () => {
    expect(isApproved(adminProfile)).toBe(true);
    expect(isApproved(equipoProfile)).toBe(true);
    expect(isApproved(observadorProfile)).toBe(true);
    expect(isApproved(pendienteProfile)).toBe(false);
    expect(isApproved(revocadoProfile)).toBe(false);
    expect(isApproved(null)).toBe(false);
  });

  it('isAdmin debe retornar true únicamente para administrador aprobado', () => {
    expect(isAdmin(adminProfile)).toBe(true);
    expect(isAdmin(equipoProfile)).toBe(false);
    expect(isAdmin(observadorProfile)).toBe(false);
    expect(isAdmin(pendienteProfile)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('isTeamOrAdmin debe retornar true para equipo y admin aprobados', () => {
    expect(isTeamOrAdmin(adminProfile)).toBe(true);
    expect(isTeamOrAdmin(equipoProfile)).toBe(true);
    expect(isTeamOrAdmin(observadorProfile)).toBe(false);
    expect(isTeamOrAdmin(pendienteProfile)).toBe(false);
    expect(isTeamOrAdmin(revocadoProfile)).toBe(false);
    expect(isTeamOrAdmin(null)).toBe(false);
  });

  it('isObserver debe retornar true para observador aprobado', () => {
    expect(isObserver(observadorProfile)).toBe(true);
    expect(isObserver(adminProfile)).toBe(false);
    expect(isObserver(equipoProfile)).toBe(false);
    expect(isObserver(pendienteProfile)).toBe(false);
  });
});

describe('Auth Service - Operaciones con Supabase Client Mock', () => {
  let mockSupabase: {
    auth: {
      signUp: ReturnType<typeof vi.fn>;
      signInWithPassword: ReturnType<typeof vi.fn>;
      signOut: ReturnType<typeof vi.fn>;
      getUser: ReturnType<typeof vi.fn>;
    };
    from: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSupabase = {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        getUser: vi.fn(),
      },
      from: vi.fn(),
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockSupabase as unknown as SupabaseClient);
  });

  it('signUp debe validar campos locales antes de llamar a Supabase', async () => {
    const resVacio = await signUp({
      email: 'test@example.com',
      password: 'secretPassword123',
      nombre: '',
      apellido: 'Perez',
      nombreUsuario: 'jperez',
    });
    expect(resVacio.success).toBe(false);
    expect(resVacio.error).toContain('El nombre es obligatorio');

    const resUserInvalido = await signUp({
      email: 'test@example.com',
      password: 'secretPassword123',
      nombre: 'Juan',
      apellido: 'Perez',
      nombreUsuario: 'USER_CON_MAYUSCULAS_O_ESPACIOS!',
    });
    expect(resUserInvalido.success).toBe(false);
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('signUp exitoso debe invocar supabase.auth.signUp con metadata adecuada', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: '00000000-0000-0000-0000-000000000001' } },
      error: null,
    });

    const res = await signUp({
      email: 'nuevo@example.com',
      password: 'password123',
      nombre: 'Nuevo',
      apellido: 'Usuario',
      nombreUsuario: 'nuevo.usuario',
    });

    expect(res.success).toBe(true);
    expect(res.data?.userId).toBe('00000000-0000-0000-0000-000000000001');
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'nuevo@example.com',
      password: 'password123',
      options: {
        data: {
          nombre: 'Nuevo',
          apellido: 'Usuario',
          nombre_usuario: 'nuevo.usuario',
        },
      },
    });
  });

  it('signIn exitoso retorna userId', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: '00000000-0000-0000-0000-000000000002' } },
      error: null,
    });

    const res = await signIn({ email: 'user@example.com', password: 'password123' });
    expect(res.success).toBe(true);
    expect(res.data?.userId).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('signOut exitoso', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    const res = await signOut();
    expect(res.success).toBe(true);
  });

  it('getMyAccess debe retornar null si no hay sesión activa', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await getMyAccess();
    expect(res.success).toBe(true);
    expect(res.data).toBeNull();
  });

  it('getMyAccess debe consultar usuarios_acceso si hay sesión activa', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: '00000000-0000-0000-0000-000000000101',
          email: 'admin@tierradelfuego.gob.ar',
        },
      },
      error: null,
    });

    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          user_id: '00000000-0000-0000-0000-000000000101',
          nombre: 'Admin',
          apellido: 'Oficial',
          nombre_usuario: 'admin.oficial',
          estado_acceso: 'aprobado',
          app_role: 'administrador',
          solicitado_at: '2026-09-12T00:00:00Z',
          aprobado_at: '2026-09-12T00:00:00Z',
        },
        error: null,
      }),
    };

    mockSupabase.from.mockReturnValue(mockQueryBuilder);

    const res = await getMyAccess();
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      userId: '00000000-0000-0000-0000-000000000101',
      nombre: 'Admin',
      apellido: 'Oficial',
      nombreUsuario: 'admin.oficial',
      email: 'admin@tierradelfuego.gob.ar',
      estadoAcceso: 'aprobado',
      appRole: 'administrador',
      solicitadoAt: '2026-09-12T00:00:00Z',
      aprobadoAt: '2026-09-12T00:00:00Z',
    });
  });
});
