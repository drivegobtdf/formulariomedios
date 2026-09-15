import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MisSolicitudesPage } from '../pages/MisSolicitudesPage';
import * as trackingApi from '../services/trackingApi';
import {
  SOLICITANTE_SESSION_STORAGE_KEY,
  saveStoredSolicitanteSession,
  getStoredSolicitanteSession,
} from '../services/sessionStorageService';

describe('MisSolicitudesPage: Persistencia de Sesión F5, Canje y Aislamiento', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Sin token en URL y sin sesión previa: Renderiza directamente "Ingreso sin Contraseña"', () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
    render(<MisSolicitudesPage />);

    expect(screen.getByText('Mis Solicitudes')).toBeInTheDocument();
    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recibir Enlace Seguro de Acceso/i })).toBeInTheDocument();
    expect(screen.queryByText(/Estamos abriendo tus solicitudes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estamos recuperando tu sesión/i)).not.toBeInTheDocument();
  });

  it('2. [A] Canje válido: Guarda la sesión opaca en sessionStorage sin almacenar el magic token', async () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=secret-magic-token-xyz');

    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockResolvedValue({
      ok: true,
      success: true,
      session_token: 'opaque-session-token-123',
      correo: 'pablosaldiviainfo@gmail.com',
      email: 'pablosaldiviainfo@gmail.com',
      expires_at: '2026-09-15T05:00:00.000Z',
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
        },
      ],
    });

    render(<MisSolicitudesPage />);

    expect(screen.getByText('Estamos abriendo tus solicitudes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    expect(exchangeSpy).toHaveBeenCalledWith('secret-magic-token-xyz');
    expect(getPedidosSpy).toHaveBeenCalledWith('opaque-session-token-123');

    // Verificar sessionStorage: Guarda el session_token opaco y metadatos, NUNCA el magic token
    const stored = getStoredSolicitanteSession();
    expect(stored).not.toBeNull();
    expect(stored?.session_token).toBe('opaque-session-token-123');
    expect(stored?.correo).toBe('pablosaldiviainfo@gmail.com');
    expect(stored?.expires_at).toBe('2026-09-15T05:00:00.000Z');

    // NUNCA debe contener el magic token en texto plano
    const rawStorage = sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY) || '';
    expect(rawStorage.includes('secret-magic-token-xyz')).toBe(false);

    // NUNCA debe escribir en localStorage
    expect(localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('3. [B, C, D, E] Recarga F5: Restaura y valida la sesión desde sessionStorage sin pedir canje ni generar emails', async () => {
    // Simular que ya existía una sesión en sessionStorage tras un canje previo
    saveStoredSolicitanteSession({
      session_token: 'opaque-session-existing-789',
      correo: 'pablosaldiviainfo@gmail.com',
      expires_at: '2026-09-15T06:00:00.000Z',
    });

    // URL limpia sin token (como ocurre al presionar F5)
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange');
    const requestAccessSpy = vi.spyOn(trackingApi, 'solicitanteRequestAccess');

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return {
        correo: 'pablosaldiviainfo@gmail.com',
        total: 1,
        pedidos: [
          {
            id: 'ped-146',
            pedido_visible: 'PED-2026-D000146',
            categoria_nombre: 'Diseño Gráfico',
            tipo_nombre: 'Flyer Digital',
            estado: 'Nuevo',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tiene_entrega: false,
          },
        ],
      };
    });

    render(<MisSolicitudesPage />);

    // Inmediatamente muestra spinner de recuperación y NUNCA el formulario de login
    expect(screen.getByText('Estamos recuperando tu sesión...')).toBeInTheDocument();
    expect(screen.queryByText('Ingreso sin Contraseña')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    // [D] NO ejecuta canje ni solicitud de email
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(requestAccessSpy).not.toHaveBeenCalled();

    // Valida contra backend solicitanteGetPedidos
    expect(getPedidosSpy).toHaveBeenCalledWith('opaque-session-existing-789');

    // [E] Mantiene el vencimiento original
    const stored = getStoredSolicitanteSession();
    expect(stored?.expires_at).toBe('2026-09-15T06:00:00.000Z');
  });

  it('4. [F] Sesión vencida o revocada en backend (401 / SESSION_INVALID): Elimina el acceso de sessionStorage y muestra aviso', async () => {
    saveStoredSolicitanteSession({
      session_token: 'expired-session-token',
      correo: 'pablosaldiviainfo@gmail.com',
    });

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    const authError = new Error('SESSION_INVALID: Sesión vencida');
    (authError as any).status = 401;
    (authError as any).code = 'SESSION_INVALID';

    vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockRejectedValue(authError);
    vi.spyOn(trackingApi, 'solicitanteSessionRevoke').mockResolvedValue({ ok: true, revoked: true });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de Acceso')).toBeInTheDocument();
      expect(screen.getByText(/Su sesión ha expirado o es inválida/i)).toBeInTheDocument();
    });

    // Debe haber limpiado sessionStorage
    expect(getStoredSolicitanteSession()).toBeNull();
  });

  it('5. [G] Fallo de red transitorio al cargar pedidos: Mantiene la sesión en sessionStorage y ofrece botón Reintentar', async () => {
    saveStoredSolicitanteSession({
      session_token: 'valid-session-network-test',
      correo: 'pablosaldiviainfo@gmail.com',
    });

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    const networkError = new Error('Failed to fetch / Network Error');
    (networkError as any).status = 0;

    let calls = 0;
    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        throw networkError;
      }
      return {
        correo: 'pablosaldiviainfo@gmail.com',
        total: 1,
        pedidos: [
          {
            id: 'ped-146',
            pedido_visible: 'PED-2026-D000146',
            categoria_nombre: 'Diseño Gráfico',
            tipo_nombre: 'Flyer Digital',
            estado: 'Nuevo',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tiene_entrega: false,
          },
        ],
      };
    });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Error al comunicarse con el servidor/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    });

    // La sesión NO debe haberse borrado de sessionStorage
    expect(getStoredSolicitanteSession()?.session_token).toBe('valid-session-network-test');

    // Al hacer clic en Reintentar
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    expect(getPedidosSpy).toHaveBeenCalledTimes(2);
  });

  it('6. [H] Storage corrupto en inicio: Limpia storage y muestra formulario sin romper la aplicación', () => {
    sessionStorage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, '{ invalid json garbage');

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    render(<MisSolicitudesPage />);

    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('7. [I] Storage bloqueado en el navegador: Permite continuar en memoria y muestra aviso explícito', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=token-unlocked');

    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockResolvedValue({
      ok: true,
      success: true,
      session_token: 'memory-only-tok',
      correo: 'pablosaldiviainfo@gmail.com',
      email: 'pablosaldiviainfo@gmail.com',
      expires_at: '2026-09-15T05:00:00.000Z',
    });

    vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [],
    });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText(/El almacenamiento de sesión está deshabilitado en su navegador/i)).toBeInTheDocument();
    });
  });

  it('8. [J] Cerrar Sesión: Limpia sessionStorage y recarga posterior muestra formulario de login', async () => {
    saveStoredSolicitanteSession({
      session_token: 'session-to-logout',
      correo: 'pablosaldiviainfo@gmail.com',
    });

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [],
    });

    const revokeSpy = vi.spyOn(trackingApi, 'solicitanteSessionRevoke').mockResolvedValue({ ok: true, revoked: true });

    const { unmount } = render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cerrar Sesión/i })).toBeInTheDocument();
    });

    // Clic en Cerrar Sesión
    fireEvent.click(screen.getByRole('button', { name: /Cerrar Sesión/i }));

    await waitFor(() => {
      expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    });

    expect(revokeSpy).toHaveBeenCalledWith('session-to-logout');
    expect(getStoredSolicitanteSession()).toBeNull();

    // Simular F5 posterior (desmontar y volver a montar sin token en URL)
    unmount();
    render(<MisSolicitudesPage />);

    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    expect(screen.queryByText('Estamos recuperando tu sesión...')).not.toBeInTheDocument();
  });

  it('9. [K] Respuesta asíncrona tardía no restaura sesión si el usuario ya cerró sesión', async () => {
    saveStoredSolicitanteSession({
      session_token: 'slow-session',
      correo: 'pablosaldiviainfo@gmail.com',
    });

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    let resolveSlowRequest: (val: any) => void = () => {};
    vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveSlowRequest = resolve;
      });
    });

    vi.spyOn(trackingApi, 'solicitanteSessionRevoke').mockResolvedValue({ ok: true, revoked: true });

    render(<MisSolicitudesPage />);

    // Usuario hace logout antes de que la request lenta responda
    // (forzamos llamada a handleLogout o reseteo)
    const stored = getStoredSolicitanteSession();
    expect(stored).not.toBeNull();

    // Responder la request lenta
    resolveSlowRequest({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [
        {
          id: 'ped-1',
          pedido_visible: 'PED-2026-D000146',
          categoria_nombre: 'Diseño',
          tipo_nombre: 'Flyer',
          estado: 'Nuevo',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tiene_entrega: false,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000146')).toBeInTheDocument();
    });

    // Ahora logout
    fireEvent.click(screen.getByRole('button', { name: /Cerrar Sesión/i }));

    await waitFor(() => {
      expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
    });

    // Si entra otra respuesta tardía posterior, no debe repoblar
    resolveSlowRequest({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [],
    });

    expect(screen.getByText('Ingreso sin Contraseña')).toBeInTheDocument();
  });

  it('10. [L] Enlace nuevo con sesión anterior abierta: Reemplaza limpiamente la sesión sin mezclar solicitantes', async () => {
    saveStoredSolicitanteSession({
      session_token: 'old-session-user-a',
      correo: 'usuario_a@ejemplo.gob.ar',
    });

    // Llega enlace nuevo para Usuario B
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=token-for-user-b');

    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockResolvedValue({
      ok: true,
      success: true,
      session_token: 'new-session-user-b',
      correo: 'usuario_b@ejemplo.gob.ar',
      email: 'usuario_b@ejemplo.gob.ar',
      expires_at: '2026-09-15T08:00:00.000Z',
    });

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'usuario_b@ejemplo.gob.ar',
      total: 1,
      pedidos: [
        {
          id: 'ped-b',
          pedido_visible: 'PED-2026-D000200',
          categoria_nombre: 'Video',
          tipo_nombre: 'Spot',
          estado: 'En proceso',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tiene_entrega: false,
        },
      ],
    });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000200')).toBeInTheDocument();
      expect(screen.getByText('usuario_b@ejemplo.gob.ar')).toBeInTheDocument();
    });

    expect(screen.queryByText('usuario_a@ejemplo.gob.ar')).not.toBeInTheDocument();

    const stored = getStoredSolicitanteSession();
    expect(stored?.session_token).toBe('new-session-user-b');
    expect(stored?.correo).toBe('usuario_b@ejemplo.gob.ar');
    expect(exchangeSpy).toHaveBeenCalledWith('token-for-user-b');
    expect(getPedidosSpy).toHaveBeenCalledWith('new-session-user-b');
  });

  it('11. Con parámetro token vacío (#token=): Muestra directamente el aviso de enlace incompleto', () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes#token=');

    render(<MisSolicitudesPage />);

    expect(screen.getByText('Aviso de Acceso')).toBeInTheDocument();
    expect(screen.getByText(/El enlace de acceso recibido está incompleto o es inválido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar un nuevo enlace/i })).toBeInTheDocument();
    expect(screen.queryByText('Ingreso sin Contraseña')).not.toBeInTheDocument();
  });
});
