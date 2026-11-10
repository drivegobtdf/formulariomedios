/**
 * Pruebas Unitarias y de Regresión — CAM-02: Identificar visualmente pedidos reabiertos
 * Base: 66e71efd4e24744d1b457a27610b1fac2044cb6c (CAM-08 + CAM-01/CAM-07C)
 *
 * Verificaciones obligatorias:
 * 1. Lógica determinista de computeIsReabierto (Cancelado vs Finalizado vs Retrabajo vs version > 1).
 * 2. Tarjetas del Kanban (renderizado de distintivo REABIERTO).
 * 3. Vista de tabla de Gestión (renderizado de distintivo REABIERTO en columna de estado).
 * 4. Cabecera del detalle de pedido (renderizado de distintivo REABIERTO vía pedido e historial de domain_events).
 * 5. Coexistencia y no colisión con DEVUELTO - RETRABAJAR.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { computeIsReabierto, PedidoListItem, PedidoDetailItem } from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import { UserProfile } from '../../pedidos-medios/frontend/src/auth/types';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import { PedidoDetallePage } from '../../pedidos-medios/frontend/src/pages/PedidoDetallePage';

describe('CAM-02: Lógica de detección histórica canónica (computeIsReabierto)', () => {
  it('Retorna false para pedidos normales que nunca fueron reabiertos', () => {
    expect(computeIsReabierto({ estado: 'Nuevo', is_reabierto: false })).toBe(false);
    expect(computeIsReabierto({ estado: 'En revisión', is_reabierto: false })).toBe(false);
    expect(computeIsReabierto({ estado: 'En proceso', is_reabierto: false, pedido_versiones: [] })).toBe(false);
    expect(computeIsReabierto(null)).toBe(false);
    expect(computeIsReabierto(undefined)).toBe(false);
  });

  it('Prueba Negativa Obligatoria: Múltiples versiones sin evento de reapertura debe ser FALSE', () => {
    // Un pedido con evoluciones o entregas sucesivas sin evento 'pedido.reopened'
    const pedidoMultiplesVersionesSinReapertura = {
      estado: 'En proceso',
      version: 5,
      is_reabierto: false,
      pedido_versiones: [
        { id: 'v1', version_number: 1, finalizado_at: null },
        { id: 'v2', version_number: 2, finalizado_at: null },
        { id: 'v3', version_number: 3, finalizado_at: null },
      ],
      historial: [
        { evento: 'pedido.created' },
        { evento: 'pedido.assigned' },
      ],
    };
    expect(computeIsReabierto(pedidoMultiplesVersionesSinReapertura)).toBe(false);
  });

  it('Caso 1: Cancelado → Reabierto → Cancelado nuevamente conserva el distintivo histórico (TRUE)', () => {
    const pedidoCanceladoReabiertoYReCancelado = {
      estado: 'Cancelado',
      is_reabierto: true, // Persistido históricamente por el trigger de domain_events
      cancelado_at: '2026-11-06T12:00:00Z',
    };
    expect(computeIsReabierto(pedidoCanceladoReabiertoYReCancelado)).toBe(true);
  });

  it('Caso 2: Finalizado → Reabierto → Finalizado nuevamente conserva el distintivo histórico (TRUE)', () => {
    const pedidoFinalizadoReabiertoYReFinalizado = {
      estado: 'Finalizado',
      is_reabierto: true, // Persistido históricamente por el trigger de domain_events
      finalizado_at: '2026-11-06T15:00:00Z',
      pedido_versiones: [
        { id: 'v1', version_number: 1, finalizado_at: '2026-11-05T14:00:00Z' },
        { id: 'v2', version_number: 2, finalizado_at: '2026-11-06T15:00:00Z' },
      ],
    };
    expect(computeIsReabierto(pedidoFinalizadoReabiertoYReFinalizado)).toBe(true);
  });

  it('Caso 4: Pedido reabierto seguido de múltiples cambios de estado conserva el distintivo en todo momento (TRUE)', () => {
    // Tras la reapertura, avanza sucesivamente por diferentes estados
    const baseReabierto = { is_reabierto: true };

    expect(computeIsReabierto({ ...baseReabierto, estado: 'Nuevo' })).toBe(true);
    expect(computeIsReabierto({ ...baseReabierto, estado: 'En revisión' })).toBe(true);
    expect(computeIsReabierto({ ...baseReabierto, estado: 'En proceso' })).toBe(true);
    expect(computeIsReabierto({ ...baseReabierto, estado: 'Esperando información' })).toBe(true);
    expect(computeIsReabierto({ ...baseReabierto, estado: 'Finalizado' })).toBe(true);
    expect(computeIsReabierto({ ...baseReabierto, estado: 'Cancelado' })).toBe(true);
  });

  it('Evalúa correctamente el evento canónico desde el historial en Detalle (domain_events)', () => {
    const pedidoDetalleConHistorial = {
      estado: 'Nuevo',
      is_reabierto: false,
      historial: [
        { evento: 'pedido.created', created_at: '2026-11-01' },
        { evento: 'pedido.cancelled', created_at: '2026-11-02' },
        { evento: 'pedido.reopened', created_at: '2026-11-03' },
      ],
    };
    expect(computeIsReabierto(pedidoDetalleConHistorial)).toBe(true);
  });

  it('Diferencia nítidamente REABIERTO de DEVUELTO - RETRABAJAR', () => {
    // Pedido en retrabajo que jamás fue reabierto
    const pedidoSoloRetrabajo = {
      estado: 'En proceso',
      retrabajo_activo: true,
      is_reabierto: false,
      revision_count: 1,
      pedido_versiones: [],
      historial: [{ evento: 'pedido.revision_requested' }],
    };
    expect(computeIsReabierto(pedidoSoloRetrabajo)).toBe(false);
  });
});

describe('CAM-02: Interfaz de Gestión (Kanban y Tabla)', () => {
  const mockApprovedProfile: UserProfile = {
    userId: 'admin-user-id',
    email: 'admin@pedidos.local',
    nombre: 'Administrador',
    apellido: 'Sistema',
    nombreUsuario: 'admin_local',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockPedidos: PedidoListItem[] = [
    {
      id: 'ped-reabierto-cancelado',
      pedido_visible: 'PED-2026-R000003',
      anio: 2026,
      numero: 3,
      codigo_categoria: 'D',
      estado: 'Nuevo',
      origen: 'publico',
      titulo: 'Campaña Reabierta desde Cancelado',
      informacion_especifica: {},
      version: 3,
      archivado: false,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-05T20:00:00Z',
      cancelado_at: '2026-11-02T10:00:00Z',
      is_reabierto: true,
    },
    {
      id: 'ped-reabierto-finalizado',
      pedido_visible: 'PED-2026-P000004',
      anio: 2026,
      numero: 4,
      codigo_categoria: 'P',
      estado: 'En proceso',
      origen: 'publico',
      titulo: 'Pedido Reabierto desde Finalizado',
      informacion_especifica: {},
      version: 2,
      archivado: false,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-05T21:00:00Z',
      finalizado_at: '2026-11-03T10:00:00Z',
      is_reabierto: true,
    },
    {
      id: 'ped-normal-nuevo',
      pedido_visible: 'PED-2026-N000005',
      anio: 2026,
      numero: 5,
      codigo_categoria: 'G',
      estado: 'Nuevo',
      origen: 'interno',
      titulo: 'Pedido Normal Nunca Reabierto',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-11-05T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
      is_reabierto: false,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
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
    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
      total: 3,
      nuevos: 2,
      enRevision: 0,
      enProceso: 1,
      esperandoInfo: 0,
      finalizados: 0,
      cancelados: 0,
      sinAsignar: 1,
      archivados: 0,
    } as any);
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([]);
    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([]);
  });

  it('1. Renderiza el distintivo REABIERTO en las tarjetas de Kanban correspondientes', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-R000003')).toBeInTheDocument();
    });

    // Deben encontrarse distintivos REABIERTO para los pedidos reabiertos
    const badges = screen.getAllByTestId('badge-reabierto');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(badges[0]).toHaveTextContent('REABIERTO');

    // El pedido normal no debe contener distintivo REABIERTO en su tarjeta
    const normalCardTitle = screen.getByText('Pedido Normal Nunca Reabierto');
    const normalCard = normalCardTitle.closest('.kanban-card');
    expect(normalCard).not.toBeNull();
    expect(normalCard?.querySelector('[data-testid="badge-reabierto"]')).toBeNull();
  });

  it('2. Renderiza el distintivo REABIERTO en la vista de tabla de Gestión', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-R000003')).toBeInTheDocument();
    });

    // Cambiar a vista de tabla
    const tablaBtn = screen.getByRole('button', { name: /Tabla/i });
    tablaBtn.click();

    await waitFor(() => {
      const tableBadges = screen.getAllByTestId('badge-reabierto');
      expect(tableBadges.length).toBeGreaterThanOrEqual(2);
      expect(tableBadges[0].className).toContain('pedidos-table-reabierto-badge');
    });
  });
});

describe('CAM-02: Cabecera e Historial en PedidoDetallePage', () => {
  const mockApprovedProfile: UserProfile = {
    userId: 'admin-user-id',
    email: 'admin@pedidos.local',
    nombre: 'Administrador',
    apellido: 'Sistema',
    nombreUsuario: 'admin_local',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const basePedido: PedidoDetailItem = {
    id: '33333333-3333-3333-3333-333333333333',
    pedido_visible: 'PED-2026-R000003',
    anio: 2026,
    numero: 3,
    codigo_categoria: 'D',
    estado: 'Nuevo',
    origen: 'publico',
    titulo: 'Cobertura Especial Reabierta',
    informacion_especifica: {},
    version: 3,
    archivado: false,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-05T20:00:00Z',
    cancelado_at: '2026-11-02T10:00:00Z',
    is_reabierto: true,
    asignaciones: [],
    notas: [],
    solicitudes: [],
    archivos: [],
    enlaces: [],
    entregas: [],
    versiones: [],
    revisiones: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
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
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([]);
  });

  it('1. Renderiza distintivo REABIERTO en la cabecera cuando el pedido tiene is_reabierto = true', async () => {
    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(basePedido);
    vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([
      {
        tipo: 'evento',
        evento: 'pedido.reopened',
        created_at: '2026-11-05T19:01:26Z',
        actor_nombre: 'Administrador Sistema',
        payload: { motivo: 'Reactivación por nueva fecha' },
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/33333333-3333-3333-3333-333333333333']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'PED-2026-R000003' })).toBeInTheDocument();
    });

    const badge = screen.getByTestId('badge-reabierto');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('REABIERTO');
    expect(badge.className).toContain('pedidos-detail-reabierto-badge');
  });

  it('2. Detecta la reapertura mediante el evento canonical pedido.reopened en historial de domain_events', async () => {
    // Caso de redundancia: is_reabierto viene false/undefined, pero el historial tiene el domain_event real
    const pedidoSinFlag: PedidoDetailItem = {
      ...basePedido,
      is_reabierto: false,
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoSinFlag);
    vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([
      {
        tipo: 'evento',
        evento: 'pedido.reopened',
        created_at: '2026-11-05T19:01:26Z',
        actor_nombre: 'Operador Equipo',
        payload: { motivo: 'Reapertura técnica autorizada' },
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/33333333-3333-3333-3333-333333333333']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'PED-2026-R000003' })).toBeInTheDocument();
    });

    // El badge debe renderizarse detectado directamente por el evento pedido.reopened
    const badge = screen.getByTestId('badge-reabierto');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('REABIERTO');

    // El historial debe mostrar el motivo, autor y fecha preservados
    expect(screen.getByText('Pedido Reabierto')).toBeInTheDocument();
    expect(screen.getAllByText(/Reapertura técnica autorizada/i).length).toBeGreaterThanOrEqual(1);
  });

  it('3. NO renderiza distintivo REABIERTO cuando el pedido nunca fue reabierto', async () => {
    const pedidoNuncaReabierto: PedidoDetailItem = {
      ...basePedido,
      cancelado_at: null,
      is_reabierto: false,
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoNuncaReabierto);
    vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([
      {
        tipo: 'evento',
        evento: 'pedido.state_changed',
        created_at: '2026-11-01T10:05:00Z',
        actor_nombre: 'Administrador Sistema',
        payload: { estado_nuevo: 'Nuevo' },
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/33333333-3333-3333-3333-333333333333']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'PED-2026-R000003' })).toBeInTheDocument();
    });

    expect(screen.queryByTestId('badge-reabierto')).not.toBeInTheDocument();
  });
});
