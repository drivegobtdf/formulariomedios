import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTablero,
  updateTablero,
  deleteTablero,
  fetchTableros,
  fetchTableroDetail,
  inviteTableroMember,
  updateTableroMemberRole,
  revokeTableroMember,
  moveTarjeta,
  toggleChecklistItem,
  searchTarjetas,
  TipoContenidoTarjeta,
} from '../services/tablerosApi';
import * as supabaseClientModule from '../services/supabaseClient';

describe('tablerosApi — Frontend Client Service (Fase 4C)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-team-1' } },
        }),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockSupabase);
  });

  it('1. Valida los 7 tipos de contenido soportados para tarjetas', () => {
    const tiposPermitidos: TipoContenidoTarjeta[] = [
      'nota_rapida',
      'checklist',
      'enlace',
      'contacto',
      'recordatorio',
      'pedido_ref',
      'documentacion',
    ];
    expect(tiposPermitidos).toHaveLength(7);
    expect(tiposPermitidos).toContain('nota_rapida');
    expect(tiposPermitidos).toContain('checklist');
    expect(tiposPermitidos).toContain('enlace');
    expect(tiposPermitidos).toContain('contacto');
    expect(tiposPermitidos).toContain('recordatorio');
    expect(tiposPermitidos).toContain('pedido_ref');
    expect(tiposPermitidos).toContain('documentacion');
  });

  it('2. createTablero invoca la RPC tablero_create con parámetros correctos', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { id: 'tablero-123', titulo: 'Prensa Verano', color: 'azul' },
      error: null,
    });

    const res = await createTablero({
      titulo: 'Prensa Verano',
      descripcion: 'Cobertura eventos',
      color: 'azul',
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_create', {
      p_titulo: 'Prensa Verano',
      p_descripcion: 'Cobertura eventos',
      p_color: 'azul',
    });
    expect(res.id).toBe('tablero-123');
  });

  it('3. updateTablero invoca update sobre public.tableros_privados', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'tablero-123', titulo: 'Prensa Otoño', color: 'verde' },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockSupabase.from.mockReturnValue({ update: mockUpdate });

    const res = await updateTablero('tablero-123', {
      titulo: 'Prensa Otoño',
      descripcion: 'Actualizado',
      color: 'verde',
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('tableros_privados');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Prensa Otoño',
        descripcion: 'Actualizado',
        color: 'verde',
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'tablero-123');
    expect(res.titulo).toBe('Prensa Otoño');
  });

  it('4. deleteTablero invoca la RPC tablero_delete', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const ok = await deleteTablero('tablero-123');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_delete', {
      p_tablero_id: 'tablero-123',
    });
    expect(ok).toBe(true);
  });

  it('5. inviteTableroMember invoca tablero_member_invite con rol seleccionado', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { tablero_id: 't-1', user_id: 'u-2', rol_tablero: 'lectura' },
      error: null,
    });

    const res = await inviteTableroMember('t-1', 'u-2', 'lectura');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_member_invite', {
      p_tablero_id: 't-1',
      p_user_id: 'u-2',
      p_rol_tablero: 'lectura',
    });
    expect(res.rol_tablero).toBe('lectura');
  });

  it('6. updateTableroMemberRole invoca tablero_member_update_role con rol edicion', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { tablero_id: 't-1', user_id: 'u-2', rol_tablero: 'edicion' },
      error: null,
    });

    const res = await updateTableroMemberRole('t-1', 'u-2', 'edicion');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_member_update_role', {
      p_tablero_id: 't-1',
      p_user_id: 'u-2',
      p_rol_tablero: 'edicion',
    });
    expect(res.rol_tablero).toBe('edicion');
  });

  it('7. revokeTableroMember invoca tablero_member_revoke', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const ok = await revokeTableroMember('t-1', 'u-2');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_member_revoke', {
      p_tablero_id: 't-1',
      p_user_id: 'u-2',
    });
    expect(ok).toBe(true);
  });

  it('8. moveTarjeta invoca tablero_tarjeta_move para mover entre columnas', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { id: 'card-1', columna_id: 'col-2', orden: 0 },
      error: null,
    });

    const res = await moveTarjeta('card-1', 'col-2', 0);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_tarjeta_move', {
      p_tarjeta_id: 'card-1',
      p_columna_destino_id: 'col-2',
      p_nuevo_orden: 0,
    });
    expect(res.columna_id).toBe('col-2');
  });

  it('9. toggleChecklistItem invoca la RPC tablero_tarjeta_checklist_toggle', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { id: 'chk-1', completado: true, completado_por: 'user-team-1' },
      error: null,
    });

    const res = await toggleChecklistItem('chk-1', true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_tarjeta_checklist_toggle', {
      p_checklist_id: 'chk-1',
      p_completado: true,
    });
    expect(res.completado).toBe(true);
  });

  it('10. searchTarjetas retorna array vacío si la consulta está vacía', async () => {
    const res = await searchTarjetas('   ');
    expect(res).toEqual([]);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('11. searchTarjetas invoca tablero_tarjetas_search con query limpio', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ id: 'card-1', titulo: 'Conferencia' }],
      error: null,
    });

    const res = await searchTarjetas('  Conferencia  ', 'tab-1');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tablero_tarjetas_search', {
      p_query: 'Conferencia',
      p_tablero_id: 'tab-1',
    });
    expect(res).toHaveLength(1);
    expect(res[0].titulo).toBe('Conferencia');
  });

  it('12. fetchTableros consulta tableros y resuelve roles de membresía', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'usuarios_acceso') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { app_role: 'equipo' } }),
        };
      }
      if (table === 'tableros_privados') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 'b-1', titulo: 'Tablero 1', propietario_id: 'user-team-1' },
              { id: 'b-2', titulo: 'Tablero 2', propietario_id: 'user-other' },
            ],
            error: null,
          }),
        };
      }
      if (table === 'tablero_miembros') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ tablero_id: 'b-2', rol_tablero: 'edicion' }],
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    mockSupabase.from = mockFrom;

    const list = await fetchTableros();
    expect(list).toHaveLength(2);
    expect(list[0].mi_rol).toBe('propietario');
    expect(list[1].mi_rol).toBe('edicion');
  });

  it('13. fetchTableroDetail carga tablero, columnas, tarjetas y miembros', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'tableros_privados') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'b-1', titulo: 'Tablero 1', propietario_id: 'user-team-1' },
            error: null,
          }),
        };
      }
      if (table === 'tablero_miembros') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === 'tablero_columnas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'col-1', tablero_id: 'b-1', nombre: 'Por hacer', orden: 0 }],
          }),
        };
      }
      if (table === 'tablero_tarjetas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'card-1', tablero_id: 'b-1', columna_id: 'col-1', titulo: 'Tarea 1' }],
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    mockSupabase.from = mockFrom;

    const detail = await fetchTableroDetail('b-1');
    expect(detail.board.id).toBe('b-1');
    expect(detail.columnas).toHaveLength(1);
    expect(detail.tarjetas).toHaveLength(1);
    expect(detail.canEdit).toBe(true);
    expect(detail.isOwner).toBe(true);
  });
});

