import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import { UserProfile } from '../../pedidos-medios/frontend/src/auth/types';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi');

describe('Etapa 3 — Rediseño Linear: Columnas y Tarjetas Kanban', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-stage3',
    email: 'admin.linear@tierradelfuego.gob.ar',
    nombre: 'Admin',
    apellido: 'Linear',
    nombreUsuario: 'admin.linear',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockPedidos: gestionApi.PedidoGestionItem[] = [
    {
      id: 'ped-stage3-1',
      pedido_visible: 'PED-2026-000101',
      estado: 'Nuevo',
      origen: 'externo',
      retrabajo_activo: false,
      revision_count: 0,
      titulo: 'Campaña Invierno 2026',
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Folletería',
      solicitante_nombre: 'Martina Rodríguez',
      area_solicitante: 'Secretaría de Turismo',
      prioridad: 'alta',
      etiquetas: [{ id: 'tag-1', pedido_id: 'ped-stage3-1', texto: 'Urgente', color: 'rojo', created_at: '2026-01-01' }],
      etiqueta_interna: null,
      responsable_user_id: 'usr-admin-stage3',
      responsable_nombre: 'Admin Linear',
      responsable_email: 'admin.linear@tierradelfuego.gob.ar',
      archivado: false,
      created_at: '2026-05-10T10:00:00Z',
      version: 1,
    },
    {
      id: 'ped-stage3-2',
      pedido_visible: 'PED-2026-000102',
      estado: 'En revisión',
      origen: 'interno',
      retrabajo_activo: true,
      revision_count: 2,
      titulo: 'Video Institucional Aniversario',
      categoria_nombre: 'Audiovisual',
      tipo_nombre: 'Spot TV',
      solicitante_nombre: null,
      area_solicitante: null,
      prioridad: null,
      etiquetas: [],
      etiqueta_interna: null,
      responsable_user_id: null,
      responsable_nombre: null,
      responsable_email: null,
      archivado: false,
      created_at: '2026-05-11T12:00:00Z',
      version: 1,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([]);
    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
      total: 2,
      nuevos: 1,
      enRevision: 1,
      enProceso: 0,
      esperandoInfo: 0,
      finalizados: 0,
      cancelados: 0,
      sinAsignar: 1,
      archivados: 0,
    });
    vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue(mockPedidos);
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
  });

  it('1. Renderiza el tablero Kanban con las 4 columnas y clases Linear', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000101')).toBeInTheDocument();
    });

    const board = container.querySelector('.pedidos-kanban-board');
    expect(board).toBeInTheDocument();

    const columns = container.querySelectorAll('.pedidos-kanban-col');
    expect(columns.length).toBe(4);

    const headers = container.querySelectorAll('.pedidos-kanban-col-header');
    expect(headers.length).toBe(4);

    // Indicadores y títulos de columnas
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En revisión').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En proceso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Esperando información').length).toBeGreaterThan(0);
  });

  it('2. Renderiza tarjetas con código PED monoespaciado, 12px radius y jerarquía visual', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000101')).toBeInTheDocument();
    });

    const cards = container.querySelectorAll('.kanban-card');
    expect(cards.length).toBe(2);

    // Código PED con clase monoespaciada
    const idEl1 = container.querySelector('.pedidos-kanban-card-id');
    expect(idEl1).toBeInTheDocument();
    expect(idEl1?.textContent).toBe('PED-2026-000101');

    // Título de hasta 2 líneas
    const titleEl = container.querySelector('.kanban-card-title');
    expect(titleEl).toBeInTheDocument();
    expect(titleEl?.textContent).toBe('Campaña Invierno 2026');

    // Servicio
    expect(screen.getByText(/Diseño Gráfico · Folletería/)).toBeInTheDocument();

    // Solicitante y área
    expect(screen.getByText('Martina Rodríguez')).toBeInTheDocument();
    expect(screen.getByText('Secretaría de Turismo')).toBeInTheDocument();
  });

  it('3. Muestra badge y acento de RETRABAJAR y badge INTERNO', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000102')).toBeInTheDocument();
    });

    // Badge INTERNO
    const badgeInterno = screen.getByText('INTERNO');
    expect(badgeInterno).toBeInTheDocument();
    expect(badgeInterno.className).toContain('pedidos-badge-interno');

    // Badge Retrabajo
    const badgeRework = screen.getByText(/DEVUELTO - RETRABAJAR · Rev #2/i);
    expect(badgeRework).toBeInTheDocument();
    expect(badgeRework.className).toContain('pedidos-badge-retrabajo');

    // Falta de asignación
    expect(screen.getByText('⚠️ Sin Asignar')).toBeInTheDocument();
  });

  it('4. Enlaces secundarios "Ver detalle →" usan estilo neutro y ruta canónica', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000101')).toBeInTheDocument();
    });

    const detailLinks = screen.getAllByRole('link', { name: /Ver detalle/i });
    expect(detailLinks.length).toBe(2);
    expect(detailLinks[0].className).toContain('pedidos-kanban-detail-link');
    expect(detailLinks[0]).toHaveAttribute('href', '/gestion/pedidos/ped-stage3-1');
  });

  it('5. Checkbox de selección múltiple y cambio de prioridad aíslan eventos', async () => {
    const updateMetaSpy = vi.spyOn(gestionApi, 'updatePedidoMetadata').mockResolvedValue({
      success: true,
      pedido_id: 'ped-stage3-1',
      prioridad: 'baja',
      etiqueta_interna: null,
      version: 2,
      updated: true,
    });

    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000101')).toBeInTheDocument();
    });

    // Checkbox de selección masiva
    const checkboxes = container.querySelectorAll('.pedidos-kanban-card-checkbox');
    expect(checkboxes.length).toBe(2);

    fireEvent.click(checkboxes[0]);
    // La tarjeta debe recibir clase is-selected tras toggle
    expect(checkboxes[0]).toBeChecked();

    // Selector de prioridad (primer pedido)
    const prioSelect = screen.getAllByLabelText('Cambiar prioridad')[0];
    fireEvent.change(prioSelect, { target: { value: 'baja' } });

    await waitFor(() => {
      expect(updateMetaSpy).toHaveBeenCalledWith('ped-stage3-1', 1, {
        prioridad: 'baja',
        update_prioridad: true,
      });
    });
  });
});
