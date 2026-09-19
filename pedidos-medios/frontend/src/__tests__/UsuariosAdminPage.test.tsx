import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsuariosAdminPage } from '../pages/UsuariosAdminPage';
import * as AuthContextModule from '../auth/AuthContext';
import { UserProfile } from '../auth/types';
import * as gestionApi from '../services/gestionApi';

vi.mock('../services/gestionApi');

describe('UsuariosAdminPage Unit Tests', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-1',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockUsersList: gestionApi.AdminUserListItem[] = [
    {
      user_id: 'usr-admin-1',
      nombre: 'Pablo',
      apellido: 'Saldivia',
      nombre_usuario: 'psaldivia',
      app_role: 'administrador',
      estado_acceso: 'aprobado',
      solicitado_at: new Date().toISOString(),
      aprobado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      user_id: 'usr-pending-2',
      nombre: 'Ana',
      apellido: 'Pérez',
      nombre_usuario: 'aperez',
      app_role: 'equipo',
      estado_acceso: 'pendiente',
      solicitado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Usuario no admin: Muestra pantalla de Acceso Denegado', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { ...mockAdminProfile, appRole: 'equipo' },
      isLoading: false,
      isApproved: true,
      isAdmin: false,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Acceso denegado')).toBeInTheDocument();
    expect(screen.getByText(/Esta sección es exclusiva para administradores/i)).toBeInTheDocument();
  });

  it('2. Administrador: Renderiza lista de usuarios y filtros por estado', async () => {
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

    vi.spyOn(gestionApi, 'fetchAdminUsers').mockResolvedValue(mockUsersList);

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Usuarios y roles')).toBeInTheDocument();
    });

    expect(screen.getByText('@psaldivia')).toBeInTheDocument();
    expect(screen.getByText('@aperez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Aprobar$/i })).toBeInTheDocument();
  });

  it('3. Modal de Aprobación: Permite seleccionar rol y ejecutar adminApproveUser', async () => {
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

    vi.spyOn(gestionApi, 'fetchAdminUsers').mockResolvedValue(mockUsersList);
    const approveSpy = vi.spyOn(gestionApi, 'adminApproveUser').mockResolvedValue({
      success: true,
      user_id: 'usr-pending-2',
      estado_acceso: 'aprobado',
      app_role: 'equipo',
    });

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('@aperez')).toBeInTheDocument();
    });

    const approveButton = screen.getByRole('button', { name: /^Aprobar$/i });
    fireEvent.click(approveButton);

    expect(screen.getByText('Aprobar acceso')).toBeInTheDocument();

    const submitButtons = screen.getAllByRole('button', { name: /^Aprobar$/i });
    // The modal submit button will be the last one or within the modal
    const confirmButton = submitButtons[submitButtons.length - 1];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('usr-pending-2', 'equipo');
    });
  });

  it('4. Botón Eliminar: Se muestra para estados pendiente/rechazado/revocado pero no para usuario actual', async () => {
    const listWithRevoked: gestionApi.AdminUserListItem[] = [
      ...mockUsersList,
      {
        user_id: 'usr-revoked-3',
        nombre: 'Carlos',
        apellido: 'Gómez',
        nombre_usuario: 'cgomez',
        app_role: 'equipo',
        estado_acceso: 'revocado',
        solicitado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

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

    vi.spyOn(gestionApi, 'fetchAdminUsers').mockResolvedValue(listWithRevoked);

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('@cgomez')).toBeInTheDocument();
    });

    // Should have Eliminar buttons for pending and revoked, but NOT for self (usr-admin-1)
    const deleteButtons = screen.getAllByRole('button', { name: /^Eliminar$/i });
    expect(deleteButtons.length).toBe(2);
  });

  it('5. Modal de Eliminación: Abre confirmación y ejecuta adminDeleteUser al confirmar', async () => {
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

    vi.spyOn(gestionApi, 'fetchAdminUsers').mockResolvedValue(mockUsersList);
    const deleteSpy = vi.spyOn(gestionApi, 'adminDeleteUser').mockResolvedValue({
      success: true,
      message: 'Usuario eliminado permanentemente.',
    });

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('@aperez')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: /^Eliminar$/i });
    fireEvent.click(deleteButton);

    expect(screen.getByText(/¿Eliminar definitivamente a Ana Pérez\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Esta acción eliminará su cuenta de acceso y no se puede deshacer/i)).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole('button', { name: /^Eliminar definitivamente$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('usr-pending-2');
    });

    await waitFor(() => {
      expect(screen.getByText(/Usuario eliminado correctamente\./i)).toBeInTheDocument();
    });
  });

  it('6. Error en Eliminación: Muestra mensaje de error en modal y no elimina al usuario', async () => {
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

    vi.spyOn(gestionApi, 'fetchAdminUsers').mockResolvedValue(mockUsersList);
    vi.spyOn(gestionApi, 'adminDeleteUser').mockRejectedValue(new Error('No es posible eliminar al único administrador'));

    render(
      <MemoryRouter>
        <UsuariosAdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('@aperez')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: /^Eliminar$/i });
    fireEvent.click(deleteButton);

    const confirmDeleteBtn = screen.getByRole('button', { name: /^Eliminar definitivamente$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.getByText('No es posible eliminar al único administrador')).toBeInTheDocument();
    });

    // Cancelar modal
    const cancelBtn = screen.getByRole('button', { name: /^Cancelar$/i });
    fireEvent.click(cancelBtn);

    // Usuario sigue presente
    expect(screen.getByText('@aperez')).toBeInTheDocument();
  });
});
