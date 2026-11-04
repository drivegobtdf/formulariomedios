import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CargaInternaModal } from '../../pedidos-medios/frontend/src/components/CargaInternaModal';
import { buildDeliveryUploadHeaders } from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';
import internalUploadPrepareHandler from '../../supabase/functions/internal-upload-prepare/index.ts';
import internalUploadCompleteHandler from '../../supabase/functions/internal-upload-complete/index.ts';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi', async () => {
  const actual = await vi.importActual<typeof import('../../pedidos-medios/frontend/src/services/gestionApi')>(
    '../../pedidos-medios/frontend/src/services/gestionApi'
  );
  return {
    ...actual,
    fetchCatalogoServicios: vi.fn().mockResolvedValue([]),
    createInternalPedido: vi.fn(),
    uploadInternalPedidoFile: vi.fn(),
  };
});

const testPedido = {
  success: true, id: 'pedido-prueba', pedido_visible: 'PED-2026-X00001',
  estado: 'Nuevo', origen: 'interno', version: 1, idempotent: false,
};

const selectTestFile = () => {
  const input = screen.getByLabelText('Archivos adjuntos internos') as HTMLInputElement;
  const file = new File(['contenido ficticio'], 'referencia.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

beforeEach(() => {
  vi.mocked(gestionApi.createInternalPedido).mockReset().mockResolvedValue(testPedido);
  vi.mocked(gestionApi.uploadInternalPedidoFile).mockReset().mockResolvedValue({
    archivo_id: 'file-id', drive_file_id: 'drive-id',
  });
  vi.mocked(gestionApi.fetchCatalogoServicios).mockReset().mockResolvedValue([]);
});

describe('CAM-11 — adjuntos durante carga interna', () => {
  it('crea el pedido una sola vez y adjunta el archivo seleccionado', async () => {
    const onSuccess = vi.fn();
    render(<CargaInternaModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas/i), {
      target: { value: 'Pedido interno para probar adjuntos' },
    });
    const file = selectTestFile();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Pedido Interno' }));
    await waitFor(() => {
      expect(gestionApi.createInternalPedido).toHaveBeenCalledTimes(1);
      expect(gestionApi.uploadInternalPedidoFile).toHaveBeenCalledWith('pedido-prueba', file, expect.any(String));
      expect(onSuccess).toHaveBeenCalledWith('pedido-prueba', 'PED-2026-X00001');
    });
  });

  it('si falla la subida permite reintentar sin duplicar el pedido', async () => {
    const onSuccess = vi.fn();
    vi.mocked(gestionApi.uploadInternalPedidoFile)
      .mockRejectedValueOnce(new Error('Subida interrumpida'))
      .mockResolvedValueOnce({ archivo_id: 'file-id', drive_file_id: 'drive-id' });
    render(<CargaInternaModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas/i), {
      target: { value: 'Pedido interno con reintento' },
    });
    selectTestFile();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Pedido Interno' }));
    expect(await screen.findByText(/Subida interrumpida/)).toBeInTheDocument();
    expect(screen.getByText(/ya fue creado/)).toBeInTheDocument();
    expect(gestionApi.createInternalPedido).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar adjuntos' }));
    await waitFor(() => {
      expect(gestionApi.uploadInternalPedidoFile).toHaveBeenCalledTimes(2);
      expect(gestionApi.createInternalPedido).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const firstRef = vi.mocked(gestionApi.uploadInternalPedidoFile).mock.calls[0][2];
    const secondRef = vi.mocked(gestionApi.uploadInternalPedidoFile).mock.calls[1][2];
    expect(secondRef).toEqual(firstRef);
  });

  it('no permite seleccionar más de diez adjuntos', async () => {
    render(<CargaInternaModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const files = Array.from({ length: 11 }, (_, i) => new File(['x'], `adjunto-${i}.pdf`, { type: 'application/pdf' }));
    fireEvent.change(screen.getByLabelText('Archivos adjuntos internos'), { target: { files } });
    expect(await screen.findByText('Se permiten como máximo 10 archivos adjuntos por pedido interno.')).toBeInTheDocument();
    expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();
  });

  it('conserva el aislamiento de apikey/JWT para el nuevo relay', () => {
    const origin = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
    const url = `${origin}/functions/v1/internal-upload-prepare?reservation_id=abc`;
    expect(buildDeliveryUploadHeaders(url, origin, 'anon', 'jwt', 'application/pdf', 'internal-upload-prepare'))
      .toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt' });
    expect(() => buildDeliveryUploadHeaders(
      'https://evil.example/functions/v1/internal-upload-prepare',
      origin, 'anon', 'jwt', 'application/pdf', 'internal-upload-prepare'
    )).toThrow(/SECURITY_ERROR/);
  });
});

describe('CAM-11 — endurecimiento de estados en Edge Functions (sin red)', () => {
  const originalEnv = { ...process.env };
  const ACTOR_ID = 'user-creator-uuid-1';
  const PEDIDO_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const RESERVATION_ID = 'res-9999-1111-2222-3333';

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

    mockGetUser.mockReset().mockResolvedValue({
      data: { user: { id: ACTOR_ID } },
      error: null,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const setupSupabaseMock = (pedidoEstado: string) => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'usuarios_acceso') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { estado_acceso: 'aprobado', app_role: 'equipo' },
              error: null,
            }),
          }),
        };
      }
      if (table === 'pedidos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: PEDIDO_ID,
                origen: 'interno',
                estado: pedidoEstado,
                pedido_visible: 'PED-2026-X0001',
                created_by_user_id: ACTOR_ID,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'upload_reservations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: RESERVATION_ID,
                pedido_id: PEDIDO_ID,
                expected_size: 100,
                expected_name: 'ref.pdf',
                expected_mime: 'application/pdf',
                state: 'pending',
                expires_at: new Date(Date.now() + 3600000).toISOString(),
                drive_session_ref: 'https://mock.drive.local/session',
                archivos: {
                  contexto: 'interno',
                  uploaded_by_user_id: ACTOR_ID,
                  estado: 'pending',
                },
              },
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  };

  const ESTADOS_PERMITIDOS = ['Nuevo', 'En revisión', 'En proceso'] as const;
  const ESTADOS_CERRADOS = ['Finalizado', 'Entregado', 'Cancelado'] as const;

  describe('internal-upload-prepare (PUT)', () => {
    it.each(ESTADOS_CERRADOS)('rechaza con 422 INVALID_STATE si el pedido está en estado cerrado "%s"', async (estado) => {
      setupSupabaseMock(estado);

      const req = new Request(`https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/internal-upload-prepare?reservation_id=${RESERVATION_ID}`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid_jwt',
          'Content-Length': '100',
        },
        body: new Uint8Array(100),
      });

      const res = await internalUploadPrepareHandler(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe('INVALID_STATE');
      expect(data.message).toBe('El pedido interno ya no acepta adjuntos de referencia');
    });

    it.each(ESTADOS_PERMITIDOS)('no es bloqueado por INVALID_STATE cuando el pedido está en estado permitido "%s"', async (estado) => {
      setupSupabaseMock(estado);

      const req = new Request(`https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/internal-upload-prepare?reservation_id=${RESERVATION_ID}`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid_jwt',
          'Content-Length': '100',
        },
        body: new Uint8Array(100),
      });

      const res = await internalUploadPrepareHandler(req);
      expect(res.status).not.toBe(422);
      const data = await res.json();
      expect(data.error).not.toBe('INVALID_STATE');
    });
  });

  describe('internal-upload-complete (POST)', () => {
    it.each(ESTADOS_CERRADOS)('rechaza con 422 INVALID_STATE si el pedido está en estado cerrado "%s"', async (estado) => {
      setupSupabaseMock(estado);

      const req = new Request('https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/internal-upload-complete', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pedido_id: PEDIDO_ID,
          reservation_id: RESERVATION_ID,
        }),
      });

      const res = await internalUploadCompleteHandler(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe('INVALID_STATE');
      expect(data.message).toBe('El pedido interno ya no acepta adjuntos de referencia');
    });

    it.each(ESTADOS_PERMITIDOS)('no es bloqueado por INVALID_STATE cuando el pedido está en estado permitido "%s"', async (estado) => {
      setupSupabaseMock(estado);

      const req = new Request('https://yqfkzgqvezarzhlwiilo.supabase.co/functions/v1/internal-upload-complete', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pedido_id: PEDIDO_ID,
          reservation_id: RESERVATION_ID,
        }),
      });

      const res = await internalUploadCompleteHandler(req);
      expect(res.status).not.toBe(422);
      const data = await res.json();
      expect(data.error).not.toBe('INVALID_STATE');
    });
  });
});
