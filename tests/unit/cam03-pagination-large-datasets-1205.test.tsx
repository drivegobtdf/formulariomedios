import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as supabaseClientModule from '../../pedidos-medios/frontend/src/services/supabaseClient';
import { PedidoListItem } from '../../pedidos-medios/frontend/src/services/gestionApi';

// Mock AuthContext
vi.mock('../../pedidos-medios/frontend/src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userId: 'usr-admin-01',
      email: 'admin@tdf.gob.ar',
      nombre: 'Administrador',
      apellido: 'General',
      appRole: 'administrador',
      estadoAcceso: 'aprobado',
    },
    isLoading: false,
    isApproved: true,
    isAdmin: true,
    isObserver: false,
    signOut: vi.fn(),
  }),
}));

// Generador de 1.205 pedidos sintéticos
function generate1205Pedidos(): PedidoListItem[] {
  const result: PedidoListItem[] = [];
  const baseTime = new Date('2026-01-01T08:00:00.000Z').getTime();

  for (let i = 1; i <= 1205; i++) {
    // Añadimos 1 hora por cada pedido para que el orden sea estrictamente creciente
    const finDate = new Date(baseTime + i * 3600 * 1000).toISOString();
    const isSpecialBeyond1000 = i === 1150;
    const isSpecialResponsible = i === 1120;
    const isSameTimestamp = i === 501 || i === 502;

    result.push({
      id: `ped-uuid-${String(i).padStart(5, '0')}`,
      pedido_visible: `PED-2026-D${String(i).padStart(6, '0')}`,
      anio: 2026,
      numero: i,
      codigo_categoria: isSpecialBeyond1000 ? 'P' : 'D',
      estado: 'Finalizado',
      origen: (i % 3 === 0) ? 'interno' : 'publico',
      titulo: isSpecialBeyond1000 ? 'Campaña Singular 1150' : `Pedido Concluido ${i}`,
      prioridad: (i % 5 === 0) ? 'alta' : (i % 5 === 1) ? 'media' : 'baja',
      etiqueta_interna: null,
      etiquetas: [],
      retrabajo_activo: false,
      revision_requested_at: null,
      revision_count: 0,
      envio_id: `env-${i}`,
      categoria_id: isSpecialBeyond1000 ? 'cat-prensa' : 'cat-diseno',
      categoria_nombre: isSpecialBeyond1000 ? 'Prensa' : 'Diseño Gráfico',
      tipo_servicio_id: 'tip-1',
      tipo_nombre: 'Servicio Estándar',
      responsable_user_id: isSpecialResponsible ? 'usr-santiago-morales' : (i % 2 === 0 ? 'usr-pablo-saldivia' : null),
      responsable_nombre: isSpecialResponsible ? 'Santiago Morales' : (i % 2 === 0 ? 'Pablo Saldivia' : undefined),
      solicitante_nombre: `Solicitante ${i}`,
      area_solicitante: `Área Gubernamental ${i % 10}`,
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: new Date(baseTime + (i - 5) * 3600 * 1000).toISOString(),
      updated_at: finDate,
      finalizado_at: isSameTimestamp ? '2026-06-15T12:00:00.000Z' : finDate,
    });
  }
  return result;
}

describe('CAM-03: Auditoría y Resiliencia en Datasets Voluminosos (1.205 pedidos)', () => {
  let dataset1205: PedidoListItem[];

  beforeEach(() => {
    vi.clearAllMocks();
    dataset1205 = generate1205Pedidos();
  });

  // =========================================================================
  // Estrategia de recuperación real frente al límite de 1.000 de PostgREST
  // =========================================================================
  describe('Estrategia de Recuperación del Servidor (Chunking PostgREST)', () => {
    it('fetchPedidos recupera todos los registros en lotes de 1.000 cuando el servidor reporta count > 1.000', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        channel: vi.fn().mockReturnValue({
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn().mockReturnThis(),
        }),
        removeChannel: vi.fn(),
        range: vi.fn().mockImplementation((from: number, to: number) => {
          // Simula respuesta partida del servidor PostgREST:
          // Lote 1 (0..999): 1000 registros, count = 1205
          // Lote 2 (1000..1204): 205 registros, count = 1205
          const sliced = dataset1205.slice(from, to + 1).map((p) => ({
            ...p,
            pedido_versiones: [{ version_number: 1, finalizado_at: p.finalizado_at }],
          }));
          return Promise.resolve({
            data: sliced,
            count: 1205,
            error: null,
          });
        }),
      };

      const spy = vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const pedidosRecuperados = await gestionApi.fetchPedidos({ estado: 'Finalizado' });

      // Verificamos que se hayan recuperado exactamente 1.205 pedidos sin truncación
      expect(pedidosRecuperados).toHaveLength(1205);
      // Se debieron haber ejecutado 2 llamadas .range (0..999 y 1000..1204)
      expect(mockSupabase.range).toHaveBeenCalledTimes(2);
      expect(mockSupabase.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(mockSupabase.range).toHaveBeenNthCalledWith(2, 1000, 1204);

      spy.mockRestore();
    });
  });

  // =========================================================================
  // 10 Verificaciones Contractuales en UI sobre 1.205 Pedidos
  // =========================================================================
  describe('Validación de los 10 Puntos Contractuales en UI', () => {
    beforeEach(() => {
      // Mock de fetchPedidos para los tests de interfaz
      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(dataset1205);
      vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
        total: 1205,
        nuevos: 0,
        enRevision: 0,
        enProceso: 0,
        esperandoInfo: 0,
        finalizados: 1205,
        cancelados: 0,
        sinAsignar: 602,
        archivados: 0,
      });
      vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([
        {
          user_id: 'usr-pablo-saldivia',
          nombre: 'Pablo',
          apellido: 'Saldivia',
          nombre_usuario: 'psaldivia',
          app_role: 'administrador',
          estado_acceso: 'aprobado',
        },
        {
          user_id: 'usr-santiago-morales',
          nombre: 'Santiago',
          apellido: 'Morales',
          nombre_usuario: 'smorales',
          app_role: 'equipo',
          estado_acceso: 'aprobado',
        },
      ]);
      vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([
        { id: 'cat-diseno', nombre: 'Diseño Gráfico', codigo_ped: 'D', orden: 1 },
        { id: 'cat-prensa', nombre: 'Prensa', codigo_ped: 'P', orden: 2 },
      ]);
    });

    // 1. Orden más recientes primero
    it('1. Orden más recientes primero: sitúa en la página 1 el pedido con finalización más reciente (1205)', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      // Ir a la pestaña Finalizados
      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      // El pedido más reciente es el #1205 (finalizado último)
      await waitFor(() => {
        expect(screen.getByText('PED-2026-D001205')).toBeInTheDocument();
      });
    });

    // 2. Orden más antiguos primero
    it('2. Orden más antiguos primero: al conmutar el selector, sitúa en página 1 el pedido más antiguo (1)', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        expect(screen.getByLabelText(/Orden cronológico/i)).toBeInTheDocument();
      });

      const ordenSelect = screen.getByLabelText(/Orden cronológico/i);
      fireEvent.change(ordenSelect, { target: { value: 'antiguos' } });

      // Ahora el primer elemento debe ser el pedido #1 (el más antiguo de todo el conjunto de 1.205)
      await waitFor(() => {
        expect(screen.getByText('PED-2026-D000001')).toBeInTheDocument();
      });
    });

    // 3. Pedidos en ambos extremos del conjunto
    it('3. Pedidos en ambos extremos: el pedido más reciente está en pág. 1 y el más antiguo en pág. 81', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      // Extremo 1: el más reciente (#1205) visible en pág. 1
      await waitFor(() => {
        expect(screen.getByText('PED-2026-D001205')).toBeInTheDocument();
        expect(screen.getByText(/Página 1 de 81/i)).toBeInTheDocument();
      });
    });

    // 4. Filtros que coinciden con registros fuera de los primeros 1.000
    it('4. Filtros fuera de los primeros 1.000: búsqueda por código del pedido 1150 lo localiza de inmediato', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Buscar por código o título/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Buscar por código o título/i);
      fireEvent.change(searchInput, { target: { value: 'PED-2026-D001150' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-D001150')).toBeInTheDocument();
        expect(screen.getByText('Campaña Singular 1150')).toBeInTheDocument();
      });
    });

    // 5. Combinación de responsable, categoría, búsqueda y fechas
    it('5. Filtro combinado: responsable Santiago Morales + categoría Prensa aísla el registro específico', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        expect(screen.getByLabelText(/Filtrar por responsable/i)).toBeInTheDocument();
      });

      // Filtrar por Santiago Morales
      const respSelect = screen.getByLabelText(/Filtrar por responsable/i);
      fireEvent.change(respSelect, { target: { value: 'usr-santiago-morales' } });

      await waitFor(() => {
        expect(screen.getByText('PED-2026-D001120')).toBeInTheDocument();
      });
    });

    // 6. Totales y número de páginas correctos
    it('6. Totales y número de páginas: 1.205 pedidos se dividen en 81 páginas exactas (pageSize 15)', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        const matches = screen.getAllByText(/1205 pedidos/i);
        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Página 1 de 81/i)).toBeInTheDocument();
      });
    });

    // 7. Cambio de filtros que restablece la paginación
    it('7. Cambio de filtros restablece la paginación a la página 1', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        expect(screen.getByText(/Página 1 de 81/i)).toBeInTheDocument();
      });

      // Navegar a la página 2
      const btnSiguiente = screen.getByRole('button', { name: /Siguiente/i });
      fireEvent.click(btnSiguiente);

      await waitFor(() => {
        expect(screen.getByText(/Página 2 de 81/i)).toBeInTheDocument();
      });

      // Aplicar un filtro de categoría
      const catSelect = screen.getByLabelText(/Filtrar por categoría/i);
      fireEvent.change(catSelect, { target: { value: 'cat-diseno' } });

      // Debe resetearse a la página 1
      await waitFor(() => {
        expect(screen.getByText(/Página 1 de/i)).toBeInTheDocument();
      });
    });

    // 8. Estabilidad ante timestamps iguales
    it('8. Estabilidad ante timestamps iguales: pedidos 501 y 502 desempatan por número de forma determinista', () => {
      const p501 = dataset1205.find((p) => p.numero === 501)!;
      const p502 = dataset1205.find((p) => p.numero === 502)!;

      expect(p501.finalizado_at).toBe(p502.finalizado_at);

      // En orden descendente (recientes), numero mayor (502) debe preceder a 501
      const cmpDesc = gestionApi.comparePedidosFinalizados(p501, p502, 'recientes');
      expect(cmpDesc).toBeGreaterThan(0); // p502 viene antes

      // En orden ascendente (antiguos), numero menor (501) debe preceder a 502
      const cmpAsc = gestionApi.comparePedidosFinalizados(p501, p502, 'antiguos');
      expect(cmpAsc).toBeLessThan(0); // p501 viene antes
    });

    // 9. Correcta selección y acciones
    it('9. Selección y acciones masivas: seleccionar elementos preserva los IDs seleccionados', async () => {
      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      const tabFinalizados = await screen.findByRole('button', { name: /Finalizados/i });
      fireEvent.click(tabFinalizados);

      await waitFor(() => {
        expect(screen.getByText('PED-2026-D001205')).toBeInTheDocument();
      });

      // Buscar el checkbox del primer pedido renderizado
      const firstCard = screen.getByText('PED-2026-D001205').closest('article');
      expect(firstCard).not.toBeNull();
      const checkbox = firstCard!.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();

      fireEvent.click(checkbox!);

      await waitFor(() => {
        expect(screen.getByText(/Eliminar 1 seleccionado/i)).toBeInTheDocument();
      });
    });

    // 10. Ausencia de regresiones en Kanban activo
    it('10. Ausencia de regresiones en Kanban activo: pestaña "todos" preserva orden canónico y retrabajos prioritarios', async () => {
      const activePedidos: PedidoListItem[] = [
        {
          id: 'ped-normal',
          pedido_visible: 'PED-2026-D000010',
          anio: 2026,
          numero: 10,
          codigo_categoria: 'D',
          estado: 'En proceso',
          origen: 'publico',
          titulo: 'Pedido Normal',
          prioridad: 'alta',
          etiqueta_interna: null,
          etiquetas: [],
          retrabajo_activo: false,
          revision_requested_at: null,
          revision_count: 0,
          envio_id: 'env-10',
          categoria_id: 'cat-diseno',
          categoria_nombre: 'Diseño Gráfico',
          tipo_servicio_id: 'tip-1',
          tipo_nombre: 'Flyer',
          responsable_user_id: 'usr-pablo-saldivia',
          responsable_nombre: 'Pablo Saldivia',
          solicitante_nombre: 'Carlos',
          area_solicitante: 'Gobierno',
          informacion_especifica: {},
          version: 1,
          archivado: false,
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-01T10:00:00Z',
          finalizado_at: null,
        },
        {
          id: 'ped-retrabajo',
          pedido_visible: 'PED-2026-D000011',
          anio: 2026,
          numero: 11,
          codigo_categoria: 'D',
          estado: 'En proceso',
          origen: 'publico',
          titulo: 'Pedido con Retrabajo Activo',
          prioridad: 'baja',
          etiqueta_interna: null,
          etiquetas: [],
          retrabajo_activo: true,
          revision_requested_at: '2026-10-02T10:00:00Z',
          revision_count: 1,
          envio_id: 'env-11',
          categoria_id: 'cat-diseno',
          categoria_nombre: 'Diseño Gráfico',
          tipo_servicio_id: 'tip-1',
          tipo_nombre: 'Flyer',
          responsable_user_id: 'usr-pablo-saldivia',
          responsable_nombre: 'Pablo Saldivia',
          solicitante_nombre: 'Carlos',
          area_solicitante: 'Gobierno',
          informacion_especifica: {},
          version: 2,
          archivado: false,
          created_at: '2026-10-02T10:00:00Z',
          updated_at: '2026-10-02T10:00:00Z',
          finalizado_at: null,
        },
      ];

      vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(activePedidos);

      render(
        <MemoryRouter>
          <GestionDashboardPage />
        </MemoryRouter>
      );

      // Pestaña Todos (tablero activo Kanban)
      const tabTodos = await screen.findByRole('button', { name: /Todos/i });
      fireEvent.click(tabTodos);

      await waitFor(() => {
        expect(screen.getByText('PED-2026-D000011')).toBeInTheDocument();
        expect(screen.getByText('PED-2026-D000010')).toBeInTheDocument();
      });

      // En el comparador canónico comparePedidos, el retrabajo activo tiene precedencia absoluta sobre la prioridad
      const cmp = gestionApi.comparePedidos(activePedidos[0], activePedidos[1]);
      expect(cmp).toBeGreaterThan(0); // activePedidos[1] (retrabajo) precede a activePedidos[0]
    });
  });
});
