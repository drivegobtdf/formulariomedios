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
      origen: 'publico',
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
      origen: 'publico',
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
    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([]);
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
      origen: 'publico',
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

    it('Filtro de prioridad llama a fetchPedidos con el parámetro correcto', async () => {
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

      const fetchSpy = vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(mockPedidos);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      const prioridadSelect = screen.getByLabelText(/Filtrar por prioridad/i);
      fireEvent.change(prioridadSelect, { target: { value: 'alta' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            prioridad: 'alta',
          })
        );
      });
    });

    it('Cambiar prioridad en tarjeta invoca updatePedidoMetadata', async () => {
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

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue([
        {
          ...mockPedidos[0],
          prioridad: 'media',
        },
      ]);

      const updateSpy = vi.spyOn(gestionApi, 'updatePedidoMetadata').mockResolvedValue({
        success: true,
        pedido_id: 'ped-1',
        prioridad: 'alta',
        etiqueta_interna: null,
        version: 2,
        updated: true,
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      const cardPrioSelect = screen.getByLabelText(/Cambiar prioridad/i);
      fireEvent.change(cardPrioSelect, { target: { value: 'alta' } });

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith('ped-1', 1, {
          prioridad: 'alta',
          update_prioridad: true,
        });
      });
    });

    it('Renderiza solicitante y área en tarjetas Kanban con tooltip y elipsis', async () => {
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

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue([
        {
          ...mockPedidos[0],
          solicitante_nombre: 'María Gómez',
          area_solicitante: 'Secretaría de Deportes',
        },
      ]);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      // Debe mostrar solicitante y área
      expect(screen.getByText('María Gómez')).toBeInTheDocument();
      expect(screen.getByText('Secretaría de Deportes')).toBeInTheDocument();
      expect(screen.getByTitle('Solicitante: María Gómez')).toBeInTheDocument();
      expect(screen.getByTitle('Área: Secretaría de Deportes')).toBeInTheDocument();
    });

    it('14. Interacción en Cards Kanban: controles interactivos aíslan eventos y no navegan accidentalmente', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      const updateMetaSpy = vi.spyOn(gestionApi, 'updatePedidoMetadata').mockResolvedValue({
        success: true,
        pedido_id: 'ped-1',
        prioridad: 'alta',
        etiqueta_interna: null,
        version: 2,
        updated: true,
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      // Localizar select de prioridad dentro de la card
      const prioridadSelect = screen.getByLabelText('Cambiar prioridad');
      expect(prioridadSelect).toBeInTheDocument();

      // Cambiar prioridad a 'alta'
      fireEvent.change(prioridadSelect, { target: { value: 'alta' } });

      await waitFor(() => {
        expect(updateMetaSpy).toHaveBeenCalledWith('ped-1', 1, {
          prioridad: 'alta',
          update_prioridad: true,
        });
      });

      // Localizar botón + Etiqueta y hacer clic
      const btnEtiqueta = screen.getByTitle('Agregar etiqueta interna');
      expect(btnEtiqueta).toBeInTheDocument();
      fireEvent.click(btnEtiqueta);

      // Debe abrir el modal de etiqueta sin error de navegación
      await waitFor(() => {
        expect(screen.getByText('Etiqueta interna')).toBeInTheDocument();
      });
    });

    it('Enlace "Ver detalle →" utiliza la ruta canónica plural /gestion/pedidos/:id', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      const detailLinks = screen.getAllByRole('link', { name: /Ver detalle/i });
      expect(detailLinks.length).toBeGreaterThan(0);
      expect(detailLinks[0]).toHaveAttribute('href', '/gestion/pedidos/ped-1');
    });

    it('Manejo de VERSION_CONFLICT con SQLSTATE 22000: muestra alerta explicativa, reconcilia datos y no navega', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const conflictErr: any = new Error('VERSION_CONFLICT: La versión esperada 1 no coincide con la versión actual 2');
      conflictErr.code = '22000';

      vi.spyOn(gestionApi, 'updatePedidoMetadata').mockRejectedValue(conflictErr);
      const fetchSpy = vi.spyOn(gestionApi, 'fetchPedidos');

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
      });

      const prioridadSelect = screen.getByLabelText('Cambiar prioridad');
      fireEvent.change(prioridadSelect, { target: { value: 'alta' } });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining('Conflicto de versión')
        );
      });

      // Debe reconciliar datos invocando fetchPedidos
      expect(fetchSpy).toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('debe renderizar el botón de Carga interna y abrir el modal al hacer clic', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Carga interna/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Carga interna/i }));

      expect(await screen.findByText('Carga Interna de Pedido')).toBeInTheDocument();
    });

    it('debe renderizar la tarjeta con badge INTERNO y título destacado para pedidos internos', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockApprovedProfile,
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      const mockPedidosConInterno: gestionApi.PedidoListItem[] = [
        {
          id: 'ped-int-1',
          pedido_visible: 'PED-2026-I000001',
          anio: 2026,
          numero: 1,
          codigo_categoria: 'I',
          origen: 'interno',
          titulo: 'Campaña Invierno 2026',
          categoria_id: null,
          tipo_servicio_id: null,
          estado: 'Nuevo',
          informacion_especifica: {},
          version: 1,
          archivado: false,
          responsable_user_id: undefined,
          responsable_nombre: undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(mockPedidosConInterno);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-I000001')).toBeInTheDocument();
      });

      expect(screen.getByText('INTERNO')).toBeInTheDocument();
      expect(screen.getByText('Campaña Invierno 2026')).toBeInTheDocument();
      expect(screen.getByText('Sin categorizar')).toBeInTheDocument();
    });
  });
});


