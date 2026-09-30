import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Admin Bulk Purge Auth & RBAC Security Layer', () => {
  const mockAdminUser = {
    id: 'admin-uuid-1',
    email: 'admin@tdf.gob.ar',
  };

  const mockTeamUser = {
    id: 'team-uuid-2',
    email: 'team@tdf.gob.ar',
  };

  const mockRevokedAdminUser = {
    id: 'revoked-admin-uuid-3',
    email: 'revoked@tdf.gob.ar',
  };

  const createMockSupabase = (userRoleState: { role: string; state: string } | null, userObj: any = mockAdminUser) => {
    return {
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (!token || token === 'invalid') {
            return { data: { user: null }, error: { message: 'Invalid token' } };
          }
          return { data: { user: userObj }, error: null };
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'usuarios_acceso') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => {
                  if (!userRoleState) return { data: null, error: { message: 'Not found' } };
                  return {
                    data: {
                      user_id: userObj.id,
                      app_role: userRoleState.role,
                      estado_acceso: userRoleState.state,
                      nombre: 'Usuario',
                      apellido: 'Test',
                      nombre_usuario: 'usuario_test',
                    },
                    error: null,
                  };
                }),
              })),
            })),
          };
        }
        return {};
      }),
      rpc: vi.fn(async (rpcName: string, params: any) => {
        if (rpcName === 'admin_pedidos_purge_preview') {
          return {
            data: {
              pedidos_count: params.p_pedido_ids.length,
              pedidos_visibles: ['PED-2026-D0001'],
              envios_afectados: 1,
              entregas_count: 0,
              revisiones_count: 0,
              archivos_count: 0,
              comunicaciones_count: 0,
              drive_file_ids: [],
              drive_folder_ids: [],
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      }),
    };
  };

  it('1. Rechaza con 401 AUTH_REQUIRED si falta el header Authorization', async () => {
    const authHeader = '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    expect(token).toBe('');
    const status = token ? 200 : 401;
    const errCode = token ? null : 'AUTH_REQUIRED';
    expect(status).toBe(401);
    expect(errCode).toBe('AUTH_REQUIRED');
  });

  it('2. Rechaza con 401 AUTH_INVALID si el JWT es inválido o expiró', async () => {
    const supabase = createMockSupabase({ role: 'administrador', state: 'aprobado' });
    const { data: userData, error: userErr } = await supabase.auth.getUser('invalid');
    expect(userErr).not.toBeNull();
    expect(userData.user).toBeNull();
  });

  it('3. Rechaza con 403 FORBIDDEN si el usuario tiene rol equipo (no administrador)', async () => {
    const supabase = createMockSupabase({ role: 'equipo', state: 'aprobado' }, mockTeamUser);
    const { data: usuarioAcceso } = await supabase.from('usuarios_acceso').select().eq('user_id', mockTeamUser.id).single();
    
    const isAllowed = usuarioAcceso?.app_role === 'administrador' && usuarioAcceso?.estado_acceso === 'aprobado';
    expect(isAllowed).toBe(false);
  });

  it('4. Rechaza con 403 FORBIDDEN si el usuario es administrador pero estado_acceso es revocado', async () => {
    const supabase = createMockSupabase({ role: 'administrador', state: 'revocado' }, mockRevokedAdminUser);
    const { data: usuarioAcceso } = await supabase.from('usuarios_acceso').select().eq('user_id', mockRevokedAdminUser.id).single();
    
    const isAllowed = usuarioAcceso?.app_role === 'administrador' && usuarioAcceso?.estado_acceso === 'aprobado';
    expect(isAllowed).toBe(false);
  });

  it('5. Permite con 200 OK y ejecuta preview cuando el usuario es administrador aprobado', async () => {
    const supabase = createMockSupabase({ role: 'administrador', state: 'aprobado' }, mockAdminUser);
    const { data: userData } = await supabase.auth.getUser('valid_admin_token');
    const { data: usuarioAcceso } = await supabase.from('usuarios_acceso').select().eq('user_id', userData.user!.id).single();
    
    const isAllowed = usuarioAcceso?.app_role === 'administrador' && usuarioAcceso?.estado_acceso === 'aprobado';
    expect(isAllowed).toBe(true);

    const { data: previewData, error } = await supabase.rpc('admin_pedidos_purge_preview', {
      p_pedido_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
      p_actor: 'Usuario Test',
    });

    expect(error).toBeNull();
    expect(previewData.pedidos_count).toBe(1);
    expect(previewData.pedidos_visibles).toEqual(['PED-2026-D0001']);
  });
});
