import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MisSolicitudesPage } from '../pages/MisSolicitudesPage';
import * as trackingApi from '../services/trackingApi';

describe('MisSolicitudesPage: Flujo de Acceso, Canje en Memoria y Anti-Bucle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('1. Sin token en URL: Renderiza directamente el formulario "Ingreso sin Contraseña"', () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
    render(<MisSolicitudesPage />);

    expect(screen.getByText('Mis Solicitudes')).toBeInTheDocument();
    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recibir Enlace Seguro de Acceso/i })).toBeInTheDocument();
    expect(screen.queryByText(/Estamos abriendo tus solicitudes/i)).not.toBeInTheDocument();
  });

  it('2. Con token en URL Hash: Inicia sincrónicamente en estado EXCHANGING sin mostrar el formulario de login', async () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=valid-test-token-123');

    // Mock exchange and load
    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockImplementation(async () => {
      // Small artificial delay to verify loading state
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        success: true,
        session_token: 'opaque-session-token-xyz',
        correo: 'pablosaldiviainfo@gmail.com',
        email: 'pablosaldiviainfo@gmail.com',
        expires_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      };
    });

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [
        {
          id: 'ped-uuid-146',
          pedido_visible: 'PED-2026-D000146',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'En proceso',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tiene_entrega: false,
          solicitudes_pendientes: 0,
          solicitudes_pendientes_count: 0,
        },
      ],
    });

    render(<MisSolicitudesPage />);

    // Inmediatamente debe mostrar spinner de canje y NUNCA el formulario
    expect(screen.getByText('Estamos abriendo tus solicitudes...')).toBeInTheDocument();
    expect(screen.queryByText('Ingreso sin Contraseña')).not.toBeInTheDocument();

    // Esperar a que concluya el canje y la carga de pedidos
    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    expect(exchangeSpy).toHaveBeenCalledWith('valid-test-token-123');
    expect(getPedidosSpy).toHaveBeenCalledWith('opaque-session-token-xyz');
    expect(screen.getByText('pablosaldiviainfo@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Sesión Verificada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar Sesión/i })).toBeInTheDocument();

    // Garantizar que NO se guardaron tokens en sessionStorage ni en localStorage
    expect(sessionStorage.getItem('solicitante_session_token')).toBeNull();
    expect(localStorage.getItem('solicitante_session_token')).toBeNull();
  });

  it('3. Token expirado o ya utilizado: Muestra mensaje de error amigable y botón para solicitar nuevo enlace', async () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=expired-token-456');

    const err = new Error('Este enlace de acceso ha expirado. Por favor solicite un nuevo enlace para acceder.');
    (err as any).code = 'TOKEN_EXPIRED';
    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockRejectedValue(err);

    render(<MisSolicitudesPage />);

    // Inicialmente spinner
    expect(screen.getByText('Estamos abriendo tus solicitudes...')).toBeInTheDocument();

    // Luego transición a error
    await waitFor(() => {
      expect(screen.getByText(/Este enlace de acceso ha expirado/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Solicitar un nuevo enlace/i })).toBeInTheDocument();

    // Al hacer clic en "Solicitar un nuevo enlace", pasa al formulario de correo
    fireEvent.click(screen.getByRole('button', { name: /Solicitar un nuevo enlace/i }));

    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
  });

  it('4. Cerrar Sesión revoca la sesión y resetea el estado en memoria', async () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=valid-tok');

    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockResolvedValue({
      ok: true,
      success: true,
      session_token: 'session-to-revoke-123',
      correo: 'pablosaldiviainfo@gmail.com',
      email: 'pablosaldiviainfo@gmail.com',
      expires_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    });

    vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [
        {
          id: 'ped-1',
          pedido_visible: 'PED-2026-D000146',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer',
          estado: 'Finalizado',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tiene_entrega: true,
          solicitudes_pendientes: 0,
        },
      ],
    });

    const revokeSpy = vi.spyOn(trackingApi, 'solicitanteSessionRevoke').mockResolvedValue({
      ok: true,
      revoked: true,
    });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    // Clic en Cerrar Sesión
    const logoutBtn = screen.getByRole('button', { name: /Cerrar Sesión/i });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    });

    expect(revokeSpy).toHaveBeenCalledWith('session-to-revoke-123');
    expect(screen.queryByText('PED-2026-D000146')).not.toBeInTheDocument();
    expect(screen.queryByText('Sesión Verificada')).not.toBeInTheDocument();
  });
});
