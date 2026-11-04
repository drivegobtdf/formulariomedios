import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import { UserProfile } from '../../pedidos-medios/frontend/src/auth/types';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof gestionApi>();
  return {
    ...actual,
    fetchPedidos: vi.fn(),
    fetchGestionStats: vi.fn(),
    fetchInternalUsers: vi.fn(),
    fetchCatalogoServicios: vi.fn(),
    updatePedidoMetadata: vi.fn(),
  };
});

describe('CAM-03: Vista Finalizados — Orden Cronológico y Filtros Avanzados', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-cam03',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const syntheticFinalizados: gestionApi.PedidoListItem[] = [
    {
      id: 'ped-f-01',
      pedido_visible: 'PED-2026-F000001',
      anio: 2026,
      numero: 1,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Campaña Invierno Ushuaia',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-flyer',
      tipo_nombre: 'Flyer Digital',
      responsable_user_id: 'usr-admin-cam03',
      responsable_nombre: 'Pablo Saldivia',
      solicitante_nombre: 'Juan Pérez',
      area_solicitante: 'Turismo',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-01T10:00:00.000Z',
      finalizado_at: '2026-10-05T14:30:00.000Z', // 5 oct
      updated_at: '2026-10-05T14:30:00.000Z',
      prioridad: 'alta',
    },
    {
      id: 'ped-f-02',
      pedido_visible: 'PED-2026-F000002',
      anio: 2026,
      numero: 2,
      codigo_categoria: 'P',
      estado: 'Finalizado',
      origen: 'interno',
      titulo: 'Gacetilla Obras Públicas',
      categoria_id: 'cat-prensa',
      categoria_nombre: 'Prensa',
      tipo_servicio_id: 'tipo-gacetilla',
      tipo_nombre: 'Gacetilla',
      responsable_user_id: 'usr-equipo-2',
      responsable_nombre: 'María López',
      solicitante_nombre: 'Ana Gómez',
      area_solicitante: 'Obras',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-10T12:00:00.000Z',
      finalizado_at: '2026-10-15T18:00:00.000Z', // 15 oct
      updated_at: '2026-10-15T18:00:00.000Z',
      prioridad: 'baja',
    },
    {
      id: 'ped-f-03',
      pedido_visible: 'PED-2026-F000003',
      anio: 2026,
      numero: 3,
      codigo_categoria: 'A',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Spot Radial Salud',
      categoria_id: 'cat-audiovisual',
      categoria_nombre: 'Audiovisual',
      tipo_servicio_id: 'tipo-spot',
      tipo_nombre: 'Spot Radial',
      responsable_user_id: undefined,
      responsable_nombre: undefined,
      solicitante_nombre: 'Carlos Ruiz',
      area_solicitante: 'Salud',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-12T09:00:00.000Z',
      finalizado_at: null, // Fallback a created_at (12 oct)
      updated_at: '2026-10-12T09:00:00.000Z',
      prioridad: null,
    },
    {
      id: 'ped-f-04',
      pedido_visible: 'PED-2026-F000004',
      anio: 2026,
      numero: 4,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Banner Web Malvinas',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-banner',
      tipo_nombre: 'Banner Web',
      responsable_user_id: 'usr-admin-cam03',
      responsable_nombre: 'Pablo Saldivia',
      solicitante_nombre: 'Laura Benítez',
      area_solicitante: 'Educación',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-20T08:00:00.000Z',
      finalizado_at: '2026-10-25T11:00:00.000Z', // 25 oct (más reciente)
      updated_at: '2026-10-25T11:00:00.000Z',
      prioridad: 'media',
    },
    {
      id: 'ped-f-05',
      pedido_visible: 'PED-2026-F000005',
      anio: 2026,
      numero: 5,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Infografía Presupuesto',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-infografia',
      tipo_nombre: 'Infografía',
      responsable_user_id: 'usr-admin-cam03',
      responsable_nombre: 'Pablo Saldivia',
      solicitante_nombre: 'Esteban Quito',
      area_solicitante: 'Economía',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-02T11:00:00.000Z',
      finalizado_at: '2026-10-05T14:30:00.000Z', // Mismo timestamp que ped-f-01 (5 oct 14:30)
      updated_at: '2026-10-05T14:30:00.000Z',
      prioridad: 'alta',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([
      { id: 'cat-diseno', nombre: 'Diseño Gráfico', codigo_ped: 'D', tipos: [] },
      { id: 'cat-prensa', nombre: 'Prensa', codigo_ped: 'P', tipos: [] },
      { id: 'cat-audiovisual', nombre: 'Audiovisual', codigo_ped: 'A', tipos: [] },
    ]);

    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([
      {
        user_id: 'usr-admin-cam03',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombre_usuario: 'psaldivia',
        app_role: 'administrador',
        estado_acceso: 'aprobado',
      },
      {
        user_id: 'usr-equipo-2',
        nombre: 'María',
        apellido: 'López',
        nombre_usuario: 'mlopez',
        app_role: 'equipo',
        estado_acceso: 'aprobado',
      },
    ]);

    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
      total: 5,
      nuevos: 0,
      enRevision: 0,
      enProceso: 0,
      esperandoInfo: 0,
      finalizados: 5,
      cancelados: 0,
      sinAsignar: 1,
      archivados: 0,
    });
  });

  describe('1. Función de Comparación de Finalizados (comparePedidosFinalizados)', () => {
    it('1.1. Orden descendente (recientes): sitúa primero el timestamp de finalización más reciente', () => {
      const pRecent = syntheticFinalizados.find((p) => p.id === 'ped-f-04')!; // 25 oct
      const pOld = syntheticFinalizados.find((p) => p.id === 'ped-f-01')!; // 5 oct

      const res = gestionApi.comparePedidosFinalizados(pRecent, pOld, 'recientes');
      expect(res).toBeLessThan(0); // pRecent precede a pOld
    });

    it('1.2. Orden ascendente (antiguos): sitúa primero el timestamp de finalización más antiguo', () => {
      const pRecent = syntheticFinalizados.find((p) => p.id === 'ped-f-04')!; // 25 oct
      const pOld = syntheticFinalizados.find((p) => p.id === 'ped-f-01')!; // 5 oct

      const res = gestionApi.comparePedidosFinalizados(pRecent, pOld, 'antiguos');
      expect(res).toBeGreaterThan(0); // pOld precede a pRecent
    });

    it('1.3. Fallback a created_at cuando finalizado_at es nulo o indefinido', () => {
      const pNoFinal = syntheticFinalizados.find((p) => p.id === 'ped-f-03')!; // finalizado_at: null, created_at: 12 oct
      const pOldFinal = syntheticFinalizados.find((p) => p.id === 'ped-f-01')!; // finalizado_at: 5 oct

      // En recientes: 12 oct > 5 oct, pNoFinal precede a pOldFinal
      expect(gestionApi.comparePedidosFinalizados(pNoFinal, pOldFinal, 'recientes')).toBeLessThan(0);
      // En antiguos: 5 oct < 12 oct, pOldFinal precede a pNoFinal
      expect(gestionApi.comparePedidosFinalizados(pNoFinal, pOldFinal, 'antiguos')).toBeGreaterThan(0);
    });

    it('1.4. Desempate estable con timestamps idénticos mediante número y ID', () => {
      const p1 = syntheticFinalizados.find((p) => p.id === 'ped-f-01')!; // numero: 1, 5 oct 14:30
      const p5 = syntheticFinalizados.find((p) => p.id === 'ped-f-05')!; // numero: 5, 5 oct 14:30

      // En 'recientes': mayor número precede (p5 precede a p1)
      expect(gestionApi.comparePedidosFinalizados(p1, p5, 'recientes')).toBeGreaterThan(0);
      expect(gestionApi.comparePedidosFinalizados(p5, p1, 'recientes')).toBeLessThan(0);

      // En 'antiguos': menor número precede (p1 precede a p5)
      expect(gestionApi.comparePedidosFinalizados(p1, p5, 'antiguos')).toBeLessThan(0);
      expect(gestionApi.comparePedidosFinalizados(p5, p1, 'antiguos')).toBeGreaterThan(0);
    });

    it('1.5. Manejo robusto de datos nulos o strings de fecha corruptos (NaN-safe)', () => {
      const pCorruptA: any = { id: 'corrupt-1', numero: 1, finalizado_at: 'invalid-date', created_at: null };
      const pCorruptB: any = { id: 'corrupt-2', numero: 2, finalizado_at: null, created_at: undefined };

      expect(() => gestionApi.comparePedidosFinalizados(pCorruptA, pCorruptB, 'recientes')).not.toThrow();
      expect(() => gestionApi.comparePedidosFinalizados(pCorruptA, pCorruptB, 'antiguos')).not.toThrow();
    });
  });

  describe('2. UI de Gestión: Vista Finalizados con Controles de CAM-03', () => {
    it('2.1. Renderiza selector de orden cronológico, selector de responsable, selector de categoría y rango de fechas en pestaña Finalizados', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      // Ir a pestaña Finalizados
      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000004')).toBeInTheDocument();
      });

      // 1. Selector de orden cronológico
      expect(screen.getByLabelText(/orden cronológico/i)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /más recientes primero/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /más antiguos primero/i })).toBeInTheDocument();

      // 2. Selector de responsable
      expect(screen.getByLabelText(/filtrar por responsable/i)).toBeInTheDocument();

      // 3. Selector de categoría
      expect(screen.getByLabelText(/filtrar por categoría/i)).toBeInTheDocument();

      // 4. Inputs de rango de fechas
      expect(screen.getByLabelText(/fecha desde/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/fecha hasta/i)).toBeInTheDocument();
    });

    it('2.2. Alternar orden cronológico a "Más antiguos primero" reordena los elementos en la vista', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000004')).toBeInTheDocument();
      });

      const orderSelect = screen.getByLabelText(/orden cronológico/i);
      expect(orderSelect).toHaveValue('recientes');

      // Cambiar a más antiguos primero
      fireEvent.change(orderSelect, { target: { value: 'antiguos' } });
      expect(orderSelect).toHaveValue('antiguos');

      // Botón de restablecer filtros debe activarse
      expect(screen.getByRole('button', { name: /restablecer filtros/i })).toBeInTheDocument();
    });

    it('2.3. Filtrar por Responsable muestra solo los pedidos asignados a ese usuario', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
      });

      const respSelect = screen.getByLabelText(/filtrar por responsable/i);
      // Seleccionar María López (usr-equipo-2)
      fireEvent.change(respSelect, { target: { value: 'usr-equipo-2' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000001')).not.toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000004')).not.toBeInTheDocument();
      });
    });

    it('2.4. Filtrar por Categoría de servicio aísla los pedidos correspondientes', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      const catSelect = screen.getByLabelText(/filtrar por categoría/i);
      // Filtrar por Prensa
      fireEvent.change(catSelect, { target: { value: 'cat-prensa' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000001')).not.toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000003')).not.toBeInTheDocument();
      });
    });

    it('2.5. Filtrar por Rango de Fechas (Desde / Hasta) restringe a pedidos finalizados en el período', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      const fechaDesdeInput = screen.getByLabelText(/fecha desde/i);
      const fechaHastaInput = screen.getByLabelText(/fecha hasta/i);

      // Período 2026-10-14 a 2026-10-16 -> solo ped-f-02 (finalizado 15 oct)
      fireEvent.change(fechaDesdeInput, { target: { value: '2026-10-14' } });
      fireEvent.change(fechaHastaInput, { target: { value: '2026-10-16' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000001')).not.toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000004')).not.toBeInTheDocument();
      });
    });

    it('2.6. Combinación de filtros simultáneos y botón Restablecer Filtros', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      // 1. Aplicar filtro origen: Interno
      const origenSelect = screen.getByLabelText(/filtrar por origen/i);
      fireEvent.change(origenSelect, { target: { value: 'interno' } });

      // 2. Aplicar filtro categoría: Prensa
      const catSelect = screen.getByLabelText(/filtrar por categoría/i);
      fireEvent.change(catSelect, { target: { value: 'cat-prensa' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
        expect(screen.queryByText('PED-2026-F000001')).not.toBeInTheDocument();
      });

      // 3. Botón "Limpiar filtros" visible y funcional
      const resetBtn = screen.getByRole('button', { name: /restablecer filtros/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);

      // Todos los filtros vuelven a valores por defecto y reaparecen todos los pedidos
      await waitFor(() => {
        expect(origenSelect).toHaveValue('todos');
        expect(catSelect).toHaveValue('todas');
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000002')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-F000004')).toBeInTheDocument();
      });
    });

    it('2.7. Búsqueda sin resultados muestra mensaje claro y permite restablecer', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/buscar por código o título/i);
      fireEvent.change(searchInput, { target: { value: 'INEXISTENTE_XYZ_999' } });

      await waitFor(() => {
        expect(screen.getByText(/no se encontraron pedidos con los filtros seleccionados/i)).toBeInTheDocument();
      });

      // Restablecer filtros
      const resetBtn = screen.getByRole('button', { name: /restablecer filtros/i });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });
    });

    it('2.8. Tarjeta de pedido finalizado muestra fecha de finalización real cuando existe y fecha de ingreso identificada', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue([
        syntheticFinalizados[0], // Tiene finalizado_at
        syntheticFinalizados[2], // No tiene finalizado_at
      ]);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      // Pedido con finalizado_at muestra etiqueta de Finalizado
      expect(screen.getByText(/🏁 Finalizado:/i)).toBeInTheDocument();
      // Ambos pedidos conservan la indicación de fecha de ingreso
      expect(screen.getAllByText(/01\/10\/2026|12\/10\/2026/i).length).toBeGreaterThan(0);
    });

    it('2.9. Paginación en Finalizados: con más de 15 pedidos permite navegar entre páginas', async () => {
      // Generar 20 pedidos finalizados
      const twentyPedidos: gestionApi.PedidoListItem[] = Array.from({ length: 20 }, (_, idx) => ({
        id: `ped-pag-${idx + 1}`,
        pedido_visible: `PED-2026-PAG${String(idx + 1).padStart(3, '0')}`,
        anio: 2026,
        numero: idx + 1,
        codigo_categoria: 'D',
        estado: 'Finalizado',
        origen: 'publico',
        titulo: `Pedido de Paginación #${idx + 1}`,
        categoria_id: 'cat-diseno',
        categoria_nombre: 'Diseño Gráfico',
        tipo_servicio_id: 'tipo-flyer',
        tipo_nombre: 'Flyer Digital',
        informacion_especifica: {},
        version: 1,
        archivado: false,
        created_at: new Date(Date.now() - idx * 86400000).toISOString(),
        finalizado_at: new Date(Date.now() - idx * 43200000).toISOString(),
        updated_at: new Date().toISOString(),
      }));

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(twentyPedidos);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-PAG001')).toBeInTheDocument();
      });

      // En página 1 están los primeros 15 pedidos
      expect(screen.getByText('PED-2026-PAG015')).toBeInTheDocument();
      expect(screen.queryByText('PED-2026-PAG016')).not.toBeInTheDocument();

      // Botón Siguiente →
      const nextBtn = screen.getByRole('button', { name: /siguiente →/i });
      expect(nextBtn).toBeInTheDocument();
      expect(nextBtn).not.toBeDisabled();

      fireEvent.click(nextBtn);

      // En página 2 están los pedidos 16 a 20
      await waitFor(() => {
        expect(screen.getByText('PED-2026-PAG016')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-PAG020')).toBeInTheDocument();
        expect(screen.queryByText('PED-2026-PAG001')).not.toBeInTheDocument();
      });
    });

    it('2.10. Vista Tabla en Finalizados muestra encabezado y datos formateados con fecha de finalización', async () => {
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(syntheticFinalizados);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Finalizados$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Tabla$/i }));

      await waitFor(() => {
        expect(screen.getByText('PED-2026-F000001')).toBeInTheDocument();
      });

      // La tabla en Finalizados renderiza indicador de finalización
      expect(screen.getAllByText(/🏁/i).length).toBeGreaterThan(0);
    });
  });
});
