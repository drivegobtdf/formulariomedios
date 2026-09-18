import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmarEmailPage, readAuthReturn } from '../pages/ConfirmarEmailPage';
import * as authModule from '../services/auth';
import * as supabaseClientModule from '../services/supabaseClient';

describe('ConfirmarEmailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/formulariomedios/confirmar-email');
  });

  it('interpreta el error Auth de un enlace antiguo sin exponer sus parámetros', () => {
    window.history.replaceState(
      {},
      '',
      '/formulariomedios/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'
    );

    render(
      <MemoryRouter>
        <ConfirmarEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Enlace inválido o vencido/i })).toBeInTheDocument();
    expect(screen.getByText(/Si ya confirmaste el correo con otro enlace/i)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('muestra confirmación real y conserva el acceso administrativo pendiente', async () => {
    window.history.replaceState(
      {},
      '',
      '/formulariomedios/confirmar-email#access_token=test-access&refresh_token=test-refresh&type=signup'
    );

    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'pablosaldiviainfo@gmail.com' } } }, error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email_confirmed_at: '2026-09-15T04:19:51Z' } },
          error: null,
        }),
      },
    } as never);
    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: {
        userId: 'user-1',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombreUsuario: 'pablo.saldivia',
        email: 'pablosaldiviainfo@gmail.com',
        estadoAcceso: 'pendiente',
        appRole: 'observador',
      },
    });

    render(
      <MemoryRouter>
        <ConfirmarEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Procesando confirmación/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Correo confirmado/i })).toBeInTheDocument();
    });
    expect(
      screen.getByText(/continúa pendiente de aprobación administrativa/i)
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('presenta pantalla intermedia de confirmación ante token_hash para proteger contra bot scanners', async () => {
    window.history.replaceState(
      {},
      '',
      '/formulariomedios/confirmar-email?token_hash=token123&type=recovery'
    );

    const verifyOtpMock = vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'admin-1', email: 'admin@tdf.gob.ar' } } },
      error: null,
    });

    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        verifyOtp: verifyOtpMock,
      },
    } as never);

    vi.spyOn(authModule, 'getMyAccess').mockResolvedValue({
      success: true,
      data: {
        userId: 'admin-1',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombreUsuario: 'pablosaldivia',
        email: 'admin@tdf.gob.ar',
        estadoAcceso: 'aprobado',
        appRole: 'administrador',
      },
    });

    render(
      <MemoryRouter>
        <ConfirmarEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Confirmación de Acceso Institucional/i })).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Continuar y Establecer Contraseña/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        token_hash: 'token123',
        type: 'recovery',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Correo confirmado/i })).toBeInTheDocument();
    });
  });

  it('no confunde un token público de seguimiento con un retorno de Supabase Auth', () => {
    expect(
      readAuthReturn('http://localhost:4173/formulariomedios/mis-solicitudes?token=publico')
    ).toEqual({
      hasAuthReturn: false,
      hasImplicitSession: false,
      code: null,
      tokenHash: null,
      type: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    });
  });
});
