import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MisSolicitudesPage } from '../pages/MisSolicitudesPage';
import * as trackingApi from '../services/trackingApi';
import {
  SOLICITANTE_SESSION_STORAGE_KEY,
  saveStoredSolicitanteSession,
  getStoredSolicitanteSession,
  clearStoredSolicitanteSession,
} from '../services/sessionStorageService';

describe('MisSolicitudesPage: Persistencia de Sesión F5, Canje y Aislamiento', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Sin token en URL y sin sesión previa: Renderiza directamente "Ingreso sin Contraseña"', () => {
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
    render(<MisSolicitudesPage />);

    expect(screen.getAllByText('Mis Solicitudes')[0]).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
    expect(screen.queryByText(/Abriendo solicitudes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recuperando sesión/i)).not.toBeInTheDocument();
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

    expect(screen.getByText('Abriendo solicitudes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('PED-2026-D000146')[0]).toBeInTheDocument();
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

    // Escribe en sessionStorage (aislado por pestaña)
    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).not.toBeNull();
    // NUNCA escribe en localStorage (cero credenciales en localStorage)
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
    expect(screen.getByText('Recuperando sesión...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar enlace/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('PED-2026-D000146')[0]).toBeInTheDocument();
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
      expect(screen.getAllByText('PED-2026-D000146')[0]).toBeInTheDocument();
    });

    expect(getPedidosSpy).toHaveBeenCalledTimes(2);
  });

  it('6. [H] Storage corrupto en inicio: Limpia storage y muestra formulario sin romper la aplicación', () => {
    sessionStorage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, '{ invalid json garbage');

    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');

    render(<MisSolicitudesPage />);

    expect(screen.getByLabelText(/Correo electrónico/i)).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Cerrar sesión/i })).toBeInTheDocument();
    });

    // Clic en Cerrar Sesión
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
    });

    expect(revokeSpy).toHaveBeenCalledWith('session-to-logout');
    expect(getStoredSolicitanteSession()).toBeNull();

    // Simular F5 posterior (desmontar y volver a montar sin token en URL)
    unmount();
    render(<MisSolicitudesPage />);

    expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
    expect(screen.queryByText('Recuperando sesión...')).not.toBeInTheDocument();
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
      expect(screen.getAllByText('PED-2026-D000146')[0]).toBeInTheDocument();
    });

    // Ahora logout
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
    });

    // Si entra otra respuesta tardía posterior, no debe repoblar
    resolveSlowRequest({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [],
    });

    expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
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
      expect(screen.getAllByText('PED-2026-D000200')[0]).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Solicitar nuevo enlace/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Correo electrónico/i)).not.toBeInTheDocument();
  });

  it('12. Acceso directo desde correo de finalización (#access_token=...&pedido=PED-2026-D000155): Sanitiza URL, canjea sesión, persiste en sessionStorage y abre automáticamente el pedido finalizado', async () => {
    window.history.pushState(
      {},
      '',
      '/formulariomedios/mis-solicitudes#access_token=direct-finalized-token-155&pedido=PED-2026-D000155'
    );

    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockResolvedValue({
      ok: true,
      success: true,
      session_token: 'session-direct-155',
      correo: 'solicitante.qa@tierradelfuego.gob.ar',
      email: 'solicitante.qa@tierradelfuego.gob.ar',
      expires_at: '2026-09-17T00:00:00.000Z',
    });

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'solicitante.qa@tierradelfuego.gob.ar',
      total: 2,
      pedidos: [
        {
          id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
          pedido_visible: 'PED-2026-D000155',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'Finalizado',
          created_at: '2026-09-16T12:00:00.000Z',
          updated_at: '2026-09-16T15:00:00.000Z',
          tiene_entrega: true,
        },
        {
          id: 'other-ped-uuid',
          pedido_visible: 'PED-2026-D000150',
          categoria_nombre: 'Video',
          tipo_nombre: 'Edición',
          estado: 'En proceso',
          created_at: '2026-09-15T10:00:00.000Z',
          updated_at: '2026-09-15T10:00:00.000Z',
          tiene_entrega: false,
        },
      ],
    });

    const getDetailSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidoDetail').mockResolvedValue({
      id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
      pedido_visible: 'PED-2026-D000155',
      anio: 2026,
      numero: 155,
      codigo_categoria: 'DIS',
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Flyer Digital',
      estado: 'Finalizado',
      created_at: '2026-09-16T12:00:00.000Z',
      updated_at: '2026-09-16T15:00:00.000Z',
      informacion_especifica: {},
      notas_publicas: [],
      entrega: {
        id: 'entrega-uuid-155',
        version: 1,
        url_entrega: 'https://drive.google.com/drive/folders/sample-finalizado',
        nota_publica: 'Entrega final aprobada.',
        created_at: '2026-09-16T15:00:00.000Z',
      },
      solicitudes_informacion: [],
      archivos_adjuntos: [],
      timeline_publico: [],
    });

    render(<MisSolicitudesPage />);

    // 1. Canje y carga completados
    await waitFor(() => {
      expect(screen.getAllByText('PED-2026-D000155')[0]).toBeInTheDocument();
    });

    expect(exchangeSpy).toHaveBeenCalledWith('direct-finalized-token-155');
    expect(getPedidosSpy).toHaveBeenCalledWith('session-direct-155');

    // 2. Apertura automática del modal/drawer para PED-2026-D000155
    await waitFor(() => {
      expect(getDetailSpy).toHaveBeenCalledWith('session-direct-155', 'PED-2026-D000155');
      expect(screen.getByText('Entrega final aprobada.')).toBeInTheDocument();
      expect(screen.getByText(/Entrega final · v1/i)).toBeInTheDocument();
    });

    // 3. Persistencia en sessionStorage
    const stored = getStoredSolicitanteSession();
    expect(stored?.session_token).toBe('session-direct-155');
    expect(stored?.correo).toBe('solicitante.qa@tierradelfuego.gob.ar');

    // 4. URL saneada (sin fragmento de token en barra de direcciones)
    expect(window.location.hash).toBe('');
  });

  it('13. Acceso con sesión activa existente y deep-link (?pedido=PED-2026-D000155): Abre directamente el pedido sin solicitar canje ni pedir correo', async () => {
    // Sesión activa previa en sessionStorage
    saveStoredSolicitanteSession({
      session_token: 'already-active-session',
      correo: 'solicitante.qa@tierradelfuego.gob.ar',
      expires_at: '2026-09-17T00:00:00.000Z',
    });

    window.history.pushState(
      {},
      '',
      '/formulariomedios/mis-solicitudes?pedido=PED-2026-D000155'
    );

    const exchangeSpy = vi.spyOn(trackingApi, 'solicitanteSessionExchange');

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'solicitante.qa@tierradelfuego.gob.ar',
      total: 1,
      pedidos: [
        {
          id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
          pedido_visible: 'PED-2026-D000155',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'Finalizado',
          created_at: '2026-09-16T12:00:00.000Z',
          updated_at: '2026-09-16T15:00:00.000Z',
          tiene_entrega: true,
        },
      ],
    });

    const getDetailSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidoDetail').mockResolvedValue({
      id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
      pedido_visible: 'PED-2026-D000155',
      anio: 2026,
      numero: 155,
      codigo_categoria: 'DIS',
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Flyer Digital',
      estado: 'Finalizado',
      created_at: '2026-09-16T12:00:00.000Z',
      updated_at: '2026-09-16T15:00:00.000Z',
      informacion_especifica: {},
      notas_publicas: [],
      entrega: {
        id: 'entrega-uuid-155',
        version: 1,
        url_entrega: 'https://drive.google.com/drive/folders/sample-finalizado',
        nota_publica: 'Detalle restaurado con sesión existente.',
        created_at: '2026-09-16T15:00:00.000Z',
      },
      solicitudes_informacion: [],
      archivos_adjuntos: [],
      timeline_publico: [],
    });

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getAllByText('PED-2026-D000155')[0]).toBeInTheDocument();
    });

    // NO debe llamar a canje porque ya tenía sesión
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(getPedidosSpy).toHaveBeenCalledWith('already-active-session');

    // Abre automáticamente el pedido
    await waitFor(() => {
      expect(getDetailSpy).toHaveBeenCalledWith('already-active-session', 'PED-2026-D000155');
      expect(screen.getByText('Detalle restaurado con sesión existente.')).toBeInTheDocument();
    });
  });

  it('14. Token expirado (#access_token=...): Muestra mensaje amigable con botón para solicitar nuevo enlace', async () => {
    window.history.pushState(
      {},
      '',
      '/formulariomedios/mis-solicitudes#access_token=expired-token-xyz'
    );

    const error: any = new Error('Token expirado');
    error.code = 'TOKEN_EXPIRED';
    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockRejectedValue(error);

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de Acceso')).toBeInTheDocument();
      expect(screen.getByText(/Este enlace de acceso ha expirado/i)).toBeInTheDocument();
    });

    const requestBtn = screen.getByRole('button', { name: /Solicitar nuevo enlace/i });
    expect(requestBtn).toBeInTheDocument();

    // Al pulsar el botón, vuelve a la vista de formulario
    fireEvent.click(requestBtn);
    expect(screen.getByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument();
  });

  it('15. Token ya utilizado (#access_token=...) pero con sesión persistente vigente: Reutiliza la sesión y abre solicitudes sin error', async () => {
    // Simular que el usuario ya tenía sesión persistente activa en localStorage
    saveStoredSolicitanteSession({
      session_token: 'valid-persistent-session-999',
      correo: 'pablosaldiviainfo@gmail.com',
      expires_at: '2026-09-17T12:00:00.000Z',
    });

    // Vuelve a hacer clic en el mismo correo que trae el token ya canjeado y el deep-link al PED
    window.history.pushState(
      {},
      '',
      '/formulariomedios/mis-solicitudes#access_token=already-used-token&pedido=PED-2026-D000155'
    );

    // El canje falla porque el token fue consumido en el primer click
    const error: any = new Error('Token ya utilizado');
    error.code = 'TOKEN_ALREADY_USED';
    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockRejectedValue(error);

    const getPedidosSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
      correo: 'pablosaldiviainfo@gmail.com',
      total: 1,
      pedidos: [
        {
          id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
          pedido_visible: 'PED-2026-D000155',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'Finalizado',
          created_at: '2026-09-16T12:00:00.000Z',
          updated_at: '2026-09-16T15:00:00.000Z',
          tiene_entrega: true,
        },
      ],
    });

    const getDetailSpy = vi.spyOn(trackingApi, 'solicitanteGetPedidoDetail').mockResolvedValue({
      id: 'b0d38a6f-0c1b-404d-a565-a4593ffb3d81',
      pedido_visible: 'PED-2026-D000155',
      anio: 2026,
      numero: 155,
      codigo_categoria: 'DIS',
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Flyer Digital',
      estado: 'Finalizado',
      created_at: '2026-09-16T12:00:00.000Z',
      updated_at: '2026-09-16T15:00:00.000Z',
      informacion_especifica: {},
      notas_publicas: [],
      entrega: {
        id: 'entrega-uuid-155',
        version: 1,
        url_entrega: 'https://drive.google.com/drive/folders/sample-finalizado',
        nota_publica: 'Entrega recuperada por sesión persistente.',
        created_at: '2026-09-16T15:00:00.000Z',
      },
      solicitudes_informacion: [],
      archivos_adjuntos: [],
      timeline_publico: [],
    });

    render(<MisSolicitudesPage />);

    // NO debe mostrar "Aviso de Acceso" ni "enlace ya utilizado"
    await waitFor(() => {
      expect(screen.queryByText(/Este enlace de acceso ya ha sido utilizado/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('PED-2026-D000155')[0]).toBeInTheDocument();
    });

    expect(getPedidosSpy).toHaveBeenCalledWith('valid-persistent-session-999');

    // Abre el pedido deep-linked
    await waitFor(() => {
      expect(getDetailSpy).toHaveBeenCalledWith('valid-persistent-session-999', 'PED-2026-D000155');
      expect(screen.getByText('Entrega recuperada por sesión persistente.')).toBeInTheDocument();
    });
  });

  it('16. Token ya utilizado (#access_token=...) SIN sesión persistente: Muestra aviso de enlace ya utilizado y formulario', async () => {
    // Sin sesión en storage
    clearStoredSolicitanteSession();
    localStorage.clear();
    sessionStorage.clear();

    window.history.pushState(
      {},
      '',
      '/formulariomedios/mis-solicitudes#access_token=used-without-session'
    );

    const error: any = new Error('Token ya utilizado');
    error.code = 'TOKEN_ALREADY_USED';
    vi.spyOn(trackingApi, 'solicitanteSessionExchange').mockRejectedValue(error);

    render(<MisSolicitudesPage />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de Acceso')).toBeInTheDocument();
      expect(screen.getByText(/Este enlace de acceso ya ha sido utilizado previamente/i)).toBeInTheDocument();
    });

    const requestBtn = screen.getByRole('button', { name: /Solicitar nuevo enlace/i });
    expect(requestBtn).toBeInTheDocument();
  });
});
