import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import { UserProfile } from '../../pedidos-medios/frontend/src/auth/types';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi');

describe('Etapa 4 — Rediseño Linear: Vista Tabla y Paginación', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-stage4',
    email: 'admin.linear@tierradelfuego.gob.ar',
    nombre: 'Admin',
    apellido: 'Linear',
    nombreUsuario: 'admin.linear',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const generateMockPedidos = (count: number): gestionApi.PedidoGestionItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `ped-stage4-${i + 1}`,
      pedido_visible: `PED-2026-${String(i + 1).padStart(6, '0')}`,
      estado: i % 2 === 0 ? 'Nuevo' : 'En proceso',
      origen: i === 1 ? 'interno' : 'externo',
      retrabajo_activo: i === 1,
      revision_count: i === 1 ? 2 : 0,
      titulo: `Pedido de prueba #${i + 1}`,
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Identidad Visual',
      solicitante_nombre: `Solicitante ${i + 1}`,
      area_solicitante: `Área ${i + 1}`,
      prioridad: i === 0 ? 'alta' : 'media',
      etiquetas: [],
      etiqueta_interna: null,
      responsable_user_id: i === 0 ? 'usr-admin-stage4' : null,
      responsable_nombre: i === 0 ? 'Admin Linear' : null,
      responsable_email: i === 0 ? 'admin.linear@tierradelfuego.gob.ar' : null,
      archivado: false,
      created_at: new Date(2026, 4, 10 + i).toISOString(),
      version: 1,
    }));
  };

  const mockPedidos = generateMockPedidos(20); // 20 pedidos to test 15-per-page pagination

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([]);
    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue({
      total: 20,
      nuevos: 10,
      enRevision: 0,
      enProceso: 10,
      esperandoInfo: 0,
      finalizados: 0,
      cancelados: 0,
      sinAsignar: 10,
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

  it('1. Alterna entre vista Kanban y Tabla, renderizando clases semánticas Linear', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    // Vista por defecto: Kanban
    expect(container.querySelector('.pedidos-kanban-board')).toBeInTheDocument();
    expect(container.querySelector('.pedidos-gestion-table-card')).not.toBeInTheDocument();

    // Cambiar a vista Tabla
    const tablaBtn = screen.getByRole('button', { name: 'Tabla' });
    fireEvent.click(tablaBtn);

    // Ahora se renderiza la tarjeta de tabla Linear
    const tableCard = container.querySelector('.pedidos-gestion-table-card');
    expect(tableCard).toBeInTheDocument();

    const tableScroll = container.querySelector('.pedidos-gestion-table-scroll');
    expect(tableScroll).toBeInTheDocument();

    const table = container.querySelector('.pedidos-gestion-table');
    expect(table).toBeInTheDocument();

    // Encabezados con th semánticos
    const thElements = container.querySelectorAll('.pedidos-table-th');
    expect(thElements.length).toBe(9); // 9 columnas (incluye checkbox Admin)

    expect(screen.getByText('Código PED')).toBeInTheDocument();
    expect(screen.getByText('Categoría / Tipo')).toBeInTheDocument();
    expect(screen.getByText('Prioridad')).toBeInTheDocument();
    expect(screen.getByText('Etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Fecha Ingreso')).toBeInTheDocument();
    expect(screen.getByText('Acción')).toBeInTheDocument();
  });

  it('2. Renderiza código PED monoespaciado, títulos, servicios y enlaces ghost', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));

    // Códigos PED en pastilla monoespaciada
    const pedCodes = container.querySelectorAll('.pedidos-table-ped-code');
    expect(pedCodes.length).toBe(15); // Page size de 15
    expect(pedCodes[0].textContent).toBe('PED-2026-000001');

    // Título de pedido en tabla
    const titles = container.querySelectorAll('.pedidos-table-title');
    expect(titles.length).toBe(15);
    expect(titles[0].textContent).toBe('Pedido de prueba #1');

    // Enlaces a detalle con clase ghost Linear
    const detailLinks = container.querySelectorAll('.pedidos-table-detail-link');
    expect(detailLinks.length).toBe(15);
    expect(detailLinks[0]).toHaveAttribute('href', '/gestion/pedidos/ped-stage4-1');
  });

  it('3. Muestra badge de retrabajo activo e INTERNO en la tabla', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));

    // El segundo pedido tiene origen interno y retrabajo activo
    const internoBadge = screen.getByText('INTERNO');
    expect(internoBadge).toBeInTheDocument();

    const reworkBadge = screen.getByText('🔄 DEVUELTO (#2)');
    expect(reworkBadge).toBeInTheDocument();
    expect(reworkBadge.className).toContain('pedidos-table-rework-badge');

    // Fila con clase is-retrabajo
    const reworkRow = container.querySelector('.pedidos-gestion-table-row.is-retrabajo');
    expect(reworkRow).toBeInTheDocument();
  });

  it('4. Permite selección individual y masiva con checkboxes y clases is-selected', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));

    const masterCheckbox = screen.getByTitle('Seleccionar página visible');
    expect(masterCheckbox).not.toBeChecked();

    // Seleccionar toda la página visible (15 pedidos)
    fireEvent.click(masterCheckbox);
    expect(masterCheckbox).toBeChecked();

    const selectedRows = container.querySelectorAll('.pedidos-gestion-table-row.is-selected');
    expect(selectedRows.length).toBe(15);

    // Deseleccionar master
    fireEvent.click(masterCheckbox);
    expect(masterCheckbox).not.toBeChecked();

    const selectedRowsAfter = container.querySelectorAll('.pedidos-gestion-table-row.is-selected');
    expect(selectedRowsAfter.length).toBe(0);

    // Selección individual
    const firstRowCheckbox = screen.getByLabelText('Seleccionar pedido PED-2026-000001');
    fireEvent.click(firstRowCheckbox);
    expect(firstRowCheckbox).toBeChecked();

    const singleSelectedRow = container.querySelectorAll('.pedidos-gestion-table-row.is-selected');
    expect(singleSelectedRow.length).toBe(1);
  });

  it('5. Moderniza controles de paginación manteniendo tamaño de página (15) y funcionalidad', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-000001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));

    // Contenedor de paginación Linear
    const pagination = container.querySelector('.pedidos-table-pagination');
    expect(pagination).toBeInTheDocument();

    // 20 pedidos totales con pageSize=15 -> 2 páginas
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /← Anterior/i });
    const nextBtn = screen.getByRole('button', { name: /Siguiente →/i });

    // En página 1, Anterior está deshabilitado
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Ir a página 2
    fireEvent.click(nextBtn);

    // Verifica cambio de página
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(screen.getByText('PED-2026-000016')).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });
});
