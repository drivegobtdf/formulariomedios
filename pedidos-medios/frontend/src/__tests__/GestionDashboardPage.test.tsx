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
});


