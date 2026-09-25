import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import * as authModule from '../services/auth';
import * as AuthContextModule from '../auth/AuthContext';
import { UserProfile } from '../auth/types';

// Helper to mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LoginPage Unit Tests', () => {
  const mockApprovedProfile: UserProfile = {
    userId: 'usr-admin-1',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockPendingProfile: UserProfile = {
    userId: 'usr-pending-1',
    email: 'pendiente@medios.tdf.gob.ar',
    nombre: 'Juan',
    apellido: 'Pérez',
    nombreUsuario: 'jperez',
    appRole: 'observador',
    estadoAcceso: 'pendiente',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('1. Renderiza los campos de email y contraseña', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
  });

  it('2. Muestra error cuando la autenticación en Supabase falla', async () => {
    vi.spyOn(authModule, 'signIn').mockResolvedValue({
      success: false,
      error: 'Credenciales inválidas. Verifique su correo y contraseña.',
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passInput = screen.getByLabelText(/^Contraseña$/i);
    const submitButton = screen.getByRole('button', { name: /Iniciar Sesión/i });

    fireEvent.change(emailInput, { target: { value: 'wrong@test.com' } });
    fireEvent.change(passInput, { target: { value: 'badpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Credenciales inválidas. Verifique su correo y contraseña.')
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('3. Login exitoso + usuario aprobado + returnTo válido: navega al pedido solicitado', async () => {
    vi.spyOn(authModule, 'signIn').mockResolvedValue({
      success: true,
      data: { userId: 'usr-admin-1' },
    });
    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: mockApprovedProfile,
    });

    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fgestion%2Fpedidos%2Fped-123']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passInput = screen.getByLabelText(/^Contraseña$/i);
    const submitButton = screen.getByRole('button', { name: /Iniciar Sesión/i });

    fireEvent.change(emailInput, { target: { value: 'admin@medios.tdf.gob.ar' } });
    fireEvent.change(passInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion/pedidos/ped-123');
    });
  });

  it('4. Login exitoso + usuario aprobado sin returnTo: navega a /gestion', async () => {
    vi.spyOn(authModule, 'signIn').mockResolvedValue({
      success: true,
      data: { userId: 'usr-admin-1' },
    });
    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: mockApprovedProfile,
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passInput = screen.getByLabelText(/^Contraseña$/i);
    const submitButton = screen.getByRole('button', { name: /Iniciar Sesión/i });

    fireEvent.change(emailInput, { target: { value: 'admin@medios.tdf.gob.ar' } });
    fireEvent.change(passInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion');
    });
  });

  it('5. Login exitoso + returnTo externo/malicioso: descarta y navega a fallback /gestion', async () => {
    vi.spyOn(authModule, 'signIn').mockResolvedValue({
      success: true,
      data: { userId: 'usr-admin-1' },
    });
    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: mockApprovedProfile,
    });

    render(
      <MemoryRouter initialEntries={['/login?returnTo=https%3A%2F%2Fevil.example%2Fhack']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passInput = screen.getByLabelText(/^Contraseña$/i);
    const submitButton = screen.getByRole('button', { name: /Iniciar Sesión/i });

    fireEvent.change(emailInput, { target: { value: 'admin@medios.tdf.gob.ar' } });
    fireEvent.change(passInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion');
    });
  });

  it('6. Sesión ya existente aprobada + returnTo válido: redirige inmediatamente a returnTo con replace', async () => {
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
      <MemoryRouter initialEntries={['/login?returnTo=%2Fgestion%2Fpedidos%2Fped-999']}>
        <LoginPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion/pedidos/ped-999', { replace: true });
    });
  });

  it('7. Sesión ya existente aprobada sin returnTo: redirige a /gestion con replace', async () => {
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
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion', { replace: true });
    });
  });

  it('8. Usuario pendiente o revocado tras login exitoso: navega a /gestion y no a ruta profunda', async () => {
    vi.spyOn(authModule, 'signIn').mockResolvedValue({
      success: true,
      data: { userId: 'usr-pending-1' },
    });
    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: mockPendingProfile,
    });

    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fgestion%2Fpedidos%2Fped-secret']}>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passInput = screen.getByLabelText(/^Contraseña$/i);
    const submitButton = screen.getByRole('button', { name: /Iniciar Sesión/i });

    fireEvent.change(emailInput, { target: { value: 'pendiente@medios.tdf.gob.ar' } });
    fireEvent.change(passInput, { target: { value: 'Secret123!' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gestion');
    });
  });
});
