import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GestionDashboardPage } from '../../pedidos-medios/frontend/src/pages/GestionDashboardPage';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import { UserProfile } from '../../pedidos-medios/frontend/src/auth/types';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi');

describe('Etapa 2 — Rediseño Linear: Header, Estadísticas y Filtros', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-stage2',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockStats: gestionApi.GestionStats = {
    total: 42,
    nuevos: 5,
    enRevision: 3,
    enProceso: 8,
    esperandoInfo: 2,
    finalizados: 18,
    cancelados: 4,
    sinAsignar: 2,
    archivados: 10,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue([]);
    vi.spyOn(gestionApi, 'fetchGestionStats').mockResolvedValue(mockStats);
    vi.spyOn(gestionApi, 'fetchPedidos').mockResolvedValue([]);
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

  it('1. Renderiza el Header de Gestión con botón Carga interna y clases Linear', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
    });

    const cargaInternaBtn = screen.getByRole('button', { name: /Carga interna/i });
    expect(cargaInternaBtn).toBeInTheDocument();
    expect(cargaInternaBtn.className).toContain('pedidos-btn-carga-interna');

    // View Switcher (Kanban / Tabla)
    const kanbanBtn = screen.getByRole('button', { name: /^Kanban$/i });
    const tablaBtn = screen.getByRole('button', { name: /^Tabla$/i });
    expect(kanbanBtn).toBeInTheDocument();
    expect(tablaBtn).toBeInTheDocument();
    expect(kanbanBtn.className).toContain('is-active');

    // Tableros privados link
    expect(screen.getByRole('link', { name: /Tableros privados/i })).toBeInTheDocument();

    // Realtime badge
    expect(screen.getByText(/En vivo|Desconectado/)).toBeInTheDocument();
  });

  it('2. Renderiza los 9 indicadores estadísticos con la jerarquía Linear requerida', async () => {
    const { container } = render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
    });

    const statsGrid = container.querySelector('.pedidos-linear-stats-grid');
    expect(statsGrid).toBeInTheDocument();

    // Validar presencia de las 9 etiquetas estadísticas dentro del grid
    expect(statsGrid?.textContent).toContain('Activos');
    expect(statsGrid?.textContent).toContain('Nuevos');
    expect(statsGrid?.textContent).toContain('En revisión');
    expect(statsGrid?.textContent).toContain('En proceso');
    expect(statsGrid?.textContent).toContain('Esperando información');
    expect(statsGrid?.textContent).toContain('Sin asignar');
    expect(statsGrid?.textContent).toContain('Finalizados');
    expect(statsGrid?.textContent).toContain('Cancelados');
    expect(statsGrid?.textContent).toContain('Archivados');

    // Métrica focal primaria (Activos = nuevos + revision + proceso + esperando = 5 + 3 + 8 + 2 = 18)
    expect(statsGrid?.textContent).toContain('18');
    expect(statsGrid?.textContent).toContain('5'); // Nuevos
    expect(statsGrid?.textContent).toContain('3'); // En revisión
    expect(statsGrid?.textContent).toContain('8'); // En proceso
    expect(statsGrid?.textContent).toContain('2'); // Esperando info
    expect(statsGrid?.textContent).toContain('4'); // Cancelados
    expect(statsGrid?.textContent).toContain('10'); // Archivados
  });

  it('3. Renderiza la bandeja de filtros (Filter Shelf) con pestañas y controles secundarios', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
    });

    // Pestañas principales
    expect(screen.getByRole('button', { name: /^Todos$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mis pedidos$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sin asignar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Esperando información$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Finalizados$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancelados$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Archivados$/i })).toBeInTheDocument();

    // Selectores
    expect(screen.getByRole('combobox', { name: /Filtrar por origen/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Filtrar por prioridad/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filtrar por etiquetas/i })).toBeInTheDocument();

    // Input de búsqueda
    expect(screen.getByPlaceholderText(/Buscar por código o título/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Buscar$/i })).toBeInTheDocument();
  });

  it('4. Alterna vistas entre Kanban y Tabla mediante el view switcher', async () => {
    render(
      <MemoryRouter>
        <GestionDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestión de pedidos')).toBeInTheDocument();
    });

    const tablaBtn = screen.getByRole('button', { name: /^Tabla$/i });
    fireEvent.click(tablaBtn);

    expect(tablaBtn.className).toContain('is-active');

    const kanbanBtn = screen.getByRole('button', { name: /^Kanban$/i });
    fireEvent.click(kanbanBtn);

    expect(kanbanBtn.className).toContain('is-active');
  });
});
