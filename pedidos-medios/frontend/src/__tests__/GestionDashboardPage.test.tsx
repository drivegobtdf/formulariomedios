import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../pages/GestionDashboardPage';
import * as AuthContextModule from '../auth/AuthContext';
import { UserProfile } from '../auth/types';
import * as gestionApi from '../services/gestionApi';

vi.mock('../services/gestionApi');

describe('GestionDashboardPage Unit Tests', () => {
  const mockApprovedProfile: UserProfile = {
    userId: 'usr-admin-1',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockPedidos: gestionApi.PedidoListItem[] = [
    {
      id: 'ped-1',
      pedido_visible: 'PED-2026-000001',
      anio: 2026,
      numero: 1,
      codigo_categoria: 'D',
      categoria_id: 'cat-1',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-1',
      tipo_nombre: 'Flyer Digital',
      estado: 'Nuevo',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      responsable_user_id: undefined,
      responsable_nombre: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'ped-2',
      pedido_visible: 'PED-2026-000002',
      anio: 2026,
      numero: 2,
      codigo_categoria: 'P',
      categoria_id: 'cat-2',
      categoria_nombre: 'Prensa',
      tipo_servicio_id: 'tipo-2',
      tipo_nombre: 'Gacetilla',
      estado: 'En proceso',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      responsable_user_id: 'usr-admin-1',
      responsable_nombre: 'Pablo Saldivia',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
      total: 2,
      nuevos: 1,
      enRevision: 0,
      enProceso: 1,
      esperandoInfo: 0,
      finalizados: 0,
      cancelados: 0,
      sinAsignar: 1,
      archivados: 0,
    });
  });

  it('1. Usuario no autenticado: Renderiza el gate de acceso con botón de inicio de sesión', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isApproved: false,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar sesión/i })).toBeInTheDocument();
  });

  it('2. Usuario en estado pendiente: Muestra pantalla de solicitud en revisión', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { ...mockApprovedProfile, estadoAcceso: 'pendiente' },
      isLoading: false,
      isApproved: false,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Acceso pendiente')).toBeInTheDocument();
  });

  it('3. Usuario aprobado: Renderiza el tablero Kanban con 4 columnas horizontales y tarjetas de pedidos', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockApprovedProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(mockPedidos);

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
    });

    // 4 Columnas activas del Kanban
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En revisión').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En proceso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Esperando información').length).toBeGreaterThan(0);

    // Verificación de tarjetas de pedidos
    expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('PED-2026-000002')).toBeInTheDocument();
    expect(screen.getByText('⚠️ Sin Asignar')).toBeInTheDocument();
    expect(screen.getByText('👤 Pablo Saldivia')).toBeInTheDocument();
  });

  it('4. Filtros: Filtrar por "Sin Asignar" muestra solo pedidos sin responsable', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockApprovedProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidos').mockImplementation(async (params: any) => {
      if (params?.unassigned) {
        return [mockPedidos[0]];
      }
      return mockPedidos;
    });

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    const sinAsignarTab = screen.getByRole('button', { name: /^Sin asignar$/i });
    fireEvent.click(sinAsignarTab);

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      expect(screen.queryByText('PED-2026-000002')).not.toBeInTheDocument();
    });
  });

  it('5. Manejo de error de API: Muestra banner de error y botón de reintento', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockApprovedProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidos').mockRejectedValue(new Error('Network PostgREST Error'));

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Error al consultar el tablero')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });

  it('6. Estados terminales: Al seleccionar pestaña "Finalizados", muestra panel dedicado con pedidos finalizados', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockApprovedProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const mockFinalizado: gestionApi.PedidoListItem = {
      id: 'ped-final-1',
      pedido_visible: 'PED-2026-000099',
      anio: 2026,
      numero: 99,
      codigo_categoria: 'D',
      categoria_id: 'cat-1',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-1',
      tipo_nombre: 'Flyer Digital',
      estado: 'Finalizado',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      responsable_user_id: 'usr-admin-1',
      responsable_nombre: 'Pablo Saldivia',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(gestionApi, 'fetchPedidos').mockImplementation(async (params: any) => {
      if (params?.estado === 'Finalizado') {
        return [mockFinalizado];
      }
      return mockPedidos;
    });

    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    const finalizadosTab = screen.getByRole('button', { name: /^Finalizados$/i });
    fireEvent.click(finalizadosTab);

    await waitFor(() => {
      expect(screen.getAllByText('Finalizados').length).toBeGreaterThan(0);
      expect(screen.getByText('PED-2026-000099')).toBeInTheDocument();
      expect(screen.getByText('← Volver')).toBeInTheDocument();
    });
  });

  describe('Sección H: Badges Históricos en Gestión (Finalizados)', () => {
    it('7. Card Finalizados con revision_count=1 muestra RETRABAJADO · 1 vez', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      const mockFinalizados: gestionApi.PedidoListItem[] = [
        {
          id: 'ped-final-rev1',
          pedido_visible: 'PED-2026-F000101',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'Finalizado',
          revision_count: 1,
          retrabajo_activo: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 2,
          archivado: false,
        } as any,
        {
          id: 'ped-final-rev2',
          pedido_visible: 'PED-2026-F000102',
          categoria_nombre: 'Prensa',
          tipo_nombre: 'Gacetilla',
          estado: 'Finalizado',
          revision_count: 2,
          retrabajo_activo: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 3,
          archivado: false,
        } as any,
        {
          id: 'ped-final-norev',
          pedido_visible: 'PED-2026-F000103',
          categoria_nombre: 'Audiovisual',
          tipo_nombre: 'Video Resumen',
          estado: 'Finalizado',
          revision_count: 0,
          retrabajo_activo: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          archivado: false,
        } as any,
      ];

      vi.spyOn(gestionApi, 'fetchPedidos').mockImplementation(async (params: any) => {
        if (params?.estado === 'Finalizado') {
          return mockFinalizados;
        }
        return mockPedidos;
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const finalizadosTab = screen.getByRole('button', { name: /^Finalizados$/i });
      fireEvent.click(finalizadosTab);

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000101')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000102')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000103')).toBeInTheDocument();
      });

      // revision_count=1 -> RETRABAJADO · 1 vez
      expect(screen.getByText('RETRABAJADO · 1 vez')).toBeInTheDocument();
      // revision_count=2 -> RETRABAJADO · 2 veces
      expect(screen.getByText('RETRABAJADO · 2 veces')).toBeInTheDocument();
      // No debe mostrar badge activo
      expect(screen.queryByText(/DEVUELTO - RETRABAJAR/i)).not.toBeInTheDocument();
    });
  });

  describe('Sección J: Selección Masiva y Conteo Exclusivo de Elementos Visibles', () => {
    it('8. Caso 1: Tablero operativo vacío con pedidos Finalizados en backend -> count visibles = 0 y no selecciona finalizados ocultos', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      // Solo hay pedidos Finalizados en la consulta general de "todos"
      const mockOnlyFinalizados: gestionApi.PedidoListItem[] = [
        {
          id: 'ped-final-hidden-1',
          pedido_visible: 'PED-2026-F000201',
          estado: 'Finalizado',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          archivado: false,
        } as any,
        {
          id: 'ped-final-hidden-2',
          pedido_visible: 'PED-2026-F000202',
          estado: 'Finalizado',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          archivado: false,
        } as any,
      ];

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(mockOnlyFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
      });

      // En la vista activa de Kanban (4 columnas operativas: Nuevo, En revisión, En proceso, Esperando información),
      // no hay cards visibles porque todos son 'Finalizado'.
      // Por lo tanto, el botón "Seleccionar todos los visibles" NO debe aparecer con (2).
      expect(screen.queryByText(/Seleccionar todos los visibles \(2\)/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Seleccionar todos los visibles/i)).not.toBeInTheDocument();
    });

    it('9. Caso 2: Tab Finalizados con 2 cards -> "Seleccionar todos los visibles (2)" selecciona exactamente los 2 visibles', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      const mock2Finalizados: gestionApi.PedidoListItem[] = [
        {
          id: 'ped-final-vis-1',
          pedido_visible: 'PED-2026-F000301',
          estado: 'Finalizado',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          archivado: false,
        } as any,
        {
          id: 'ped-final-vis-2',
          pedido_visible: 'PED-2026-F000302',
          estado: 'Finalizado',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          archivado: false,
        } as any,
      ];

      vi.spyOn(gestionApi, 'fetchPedidos').mockImplementation(async (params: any) => {
        if (params?.estado === 'Finalizado') {
          return mock2Finalizados;
        }
        return [];
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const finalizadosTab = screen.getByRole('button', { name: /^Finalizados$/i });
      fireEvent.click(finalizadosTab);

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000301')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000302')).toBeInTheDocument();
      });

      const selectAllBtn = screen.getByRole('button', { name: /Seleccionar todos los visibles \(2\)/i });
      expect(selectAllBtn).toBeInTheDocument();

      fireEvent.click(selectAllBtn);

      await waitFor(() => {
        expect(screen.getByText('2 seleccionados')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Eliminar 2 seleccionados/i })).toBeInTheDocument();
      });
    });

    it('10. Caso 4: Al cambiar de filtro o pestaña, la selección se reconcilia y no retiene pedidos ocultos', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      vi.spyOn(gestionApi, 'fetchPedidos').mockImplementation(async (params: any) => {
        if (params?.estado === 'Finalizado') {
          return [];
        }
        return mockPedidos;
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      // Seleccionar todos los visibles en Kanban (2 visibles)
      const selectAllBtn = screen.getByRole('button', { name: /Seleccionar todos los visibles \(2\)/i });
      fireEvent.click(selectAllBtn);

      await waitFor(() => {
        expect(screen.getByText('2 seleccionados')).toBeInTheDocument();
      });

      // Cambiar a pestaña "Finalizados" (donde no hay ninguno)
      const finalizadosTab = screen.getByRole('button', { name: /^Finalizados$/i });
      fireEvent.click(finalizadosTab);

      // La selección debe reconciliarse automáticamente a 0
      await waitFor(() => {
        expect(screen.queryByText('2 seleccionados')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Eliminar/i })).not.toBeInTheDocument();
      });
    });
  });
});


