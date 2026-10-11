import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MisSolicitudesPage } from '../pages/MisSolicitudesPage';
import * as trackingApi from '../services/trackingApi';
import {
  formatFriendlyPublicEvent,
  normalizeSolicitantePedidoDetail,
} from '../services/trackingApi';
import {
  saveStoredSolicitanteSession,
  clearStoredSolicitanteSession,
} from '../services/sessionStorageService';

describe('Portal Público del Solicitante: Detalle, Nota de Entrega y Sanitización UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
  });

  afterEach(() => {
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
    vi.restoreAllMocks();
  });

  describe('Unidad: normalizeSolicitantePedidoDetail y formatFriendlyPublicEvent', () => {
    it('traduce todos los eventos canónicos a lenguaje natural en español', () => {
      expect(formatFriendlyPublicEvent('pedido.created').titulo).toBe('Solicitud creada');
      expect(formatFriendlyPublicEvent('pedido.info_requested').titulo).toBe('Se solicitó información adicional');
      expect(formatFriendlyPublicEvent('pedido.info_responded').titulo).toBe('Respondiste la información solicitada');
      expect(formatFriendlyPublicEvent('pedido.finalized').titulo).toBe('Pedido finalizado');
      expect(formatFriendlyPublicEvent('pedido.cancelled').titulo).toBe('Pedido cancelado');
      expect(formatFriendlyPublicEvent('pedido.revision_requested').titulo).toBe('Pedido devuelto para corrección');
    });

    it('aplana la estructura anidada del RPC y rescata la nota de entrega cuando entrega es null', () => {
      const rawRpcResponse = {
        success: true,
        pedido: {
          id: 'ped-abc-123',
          pedido_visible: 'PED-2026-P000999',
          anio: 2026,
          numero: 999,
          codigo_categoria: 'PREN',
          categoria_nombre: 'Prensa',
          tipo_nombre: 'Gacetilla',
          estado: 'Finalizado',
          retrabajo_activo: false,
          revision_count: 0,
          informacion_especifica: { titulo: 'Lanzamiento Oficial' },
        },
        solicitudes: [],
        notas: [
          { id: 'nota-1', texto: 'todo ok', created_at: '2026-10-11T03:00:00Z', visibilidad: 'solicitante' },
          { id: 'nota-2-interna', texto: 'Nota de uso confidencial equipo', created_at: '2026-10-11T02:00:00Z', visibilidad: 'interna' },
        ],
        entrega: null,
        historial: [
          {
            evento: 'pedido.created',
            created_at: '2026-10-10T10:00:00Z',
            detalles: { actor_id: 'user-sec-01', origen: 'publico', version: 1 },
          },
          {
            evento: 'pedido.finalized',
            created_at: '2026-10-11T03:00:00Z',
            detalles: {
              actor_id: 'user-sec-02',
              pedido_id: 'ped-abc-123',
              entrega_id: null,
              version: 2,
              origen: 'publico',
              has_enlace: false,
              nota: 'todo ok',
            },
          },
        ],
      };

      const normalized = normalizeSolicitantePedidoDetail(rawRpcResponse);

      // 1. Aplana campos principales a la raíz
      expect(normalized.id).toBe('ped-abc-123');
      expect(normalized.pedido_visible).toBe('PED-2026-P000999');
      expect(normalized.categoria_nombre).toBe('Prensa');
      expect(normalized.tipo_nombre).toBe('Gacetilla');
      expect(normalized.estado).toBe('Finalizado');

      // 2. Rescata la nota final explícita sin inventar entrega sintética si no hay material
      expect(normalized.entrega).toBeNull();
      expect(normalized.nota_final?.texto).toBe('todo ok');

      // 3. Excluye notas internas de notas_publicas
      expect(normalized.notas_publicas).toHaveLength(1);
      expect(normalized.notas_publicas[0].texto).toBe('todo ok');
      expect(normalized.notas_publicas.some((n) => n.texto.includes('confidencial'))).toBe(false);

      // 4. Sanitiza historial: títulos limpios y desprovistos de campos técnicos
      expect(normalized.historial).toHaveLength(2);
      expect(normalized.historial?.[0].evento).toBe('Solicitud creada');
      expect(normalized.historial?.[1].evento).toBe('Pedido finalizado');

      // Verifica que no existan propiedades de base de datos en los items del historial
      for (const item of normalized.historial || []) {
        expect((item as any).detalles).toBeUndefined();
        expect((item as any).actor_id).toBeUndefined();
        expect((item as any).pedido_id).toBeUndefined();
        expect((item as any).entrega_id).toBeUndefined();
        expect((item as any).version).toBeUndefined();
        expect((item as any).origen).toBeUndefined();
        expect((item as any).has_enlace).toBeUndefined();
      }
    });

    it('es 100% compatible con el nuevo contrato de RPC (nota_final explícita y DTO limpio tipo/titulo/descripcion)', () => {
      const hardenedRpcResponse = {
        success: true,
        pedido: {
          id: 'ped-hardened-123',
          envio_id: 'envio-uuid-123',
          pedido_visible: 'PED-2026-P000999',
          anio: 2026,
          numero: 999,
          codigo_categoria: 'PREN',
          categoria_nombre: 'Prensa',
          tipo_nombre: 'Gacetilla',
          estado: 'Finalizado',
          retrabajo_activo: false,
          revision_count: 0,
          informacion_especifica: { titulo: 'Lanzamiento Hardened' },
        },
        solicitudes: [],
        notas: [
          { id: 'nota-1', texto: 'Nota pública inicial', created_at: '2026-10-11T02:00:00Z' },
          { id: 'nota-2', texto: 'todo ok', created_at: '2026-10-11T03:00:00Z' },
        ],
        entrega: null,
        nota_final: {
          texto: 'todo ok',
          created_at: '2026-10-11T03:00:00Z',
        },
        historial: [
          {
            tipo: 'created',
            titulo: 'Solicitud recibida',
            descripcion: 'Tu solicitud fue registrada en el sistema.',
            created_at: '2026-10-10T10:00:00Z',
          },
          {
            tipo: 'finalized',
            titulo: 'Pedido finalizado',
            descripcion: 'El pedido fue completado y cerrado por el equipo.',
            created_at: '2026-10-11T03:00:00Z',
          },
        ],
      };

      const normalized = normalizeSolicitantePedidoDetail(hardenedRpcResponse);

      // 1. Conserva nota_final explícita y entrega null
      expect(normalized.entrega).toBeNull();
      expect(normalized.nota_final?.texto).toBe('todo ok');
      expect(normalized.nota_final?.created_at).toBe('2026-10-11T03:00:00Z');

      // 2. Historial preserva títulos y descripciones del DTO limpio
      expect(normalized.historial).toHaveLength(2);
      expect(normalized.historial?.[0].titulo).toBe('Solicitud recibida');
      expect(normalized.historial?.[0].descripcion).toBe('Tu solicitud fue registrada en el sistema.');
      expect(normalized.historial?.[1].titulo).toBe('Pedido finalizado');
      expect(normalized.historial?.[1].descripcion).toBe('El pedido fue completado y cerrado por el equipo.');
    });
  });

  describe('Integración UI: Vista pública del solicitante en MisSolicitudesPage', () => {
    it('muestra claramente la nota de entrega "todo ok" al finalizar pedido solo con nota y sin información técnica', async () => {
      saveStoredSolicitanteSession({
        session_token: 'session-publica-valida',
        correo: 'solicitante@tierradelfuego.gob.ar',
        expires_at: '2026-10-15T00:00:00Z',
      });

      vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
        correo: 'solicitante@tierradelfuego.gob.ar',
        total: 1,
        pedidos: [
          {
            id: 'ped-uuid-public-1',
            pedido_visible: 'PED-2026-P000999',
            categoria_nombre: 'Prensa',
            tipo_nombre: 'Gacetilla de Prensa',
            estado: 'Finalizado',
            created_at: '2026-10-10T10:00:00Z',
            updated_at: '2026-10-11T03:00:00Z',
            tiene_entrega: false,
          },
        ],
      });

      // Simula el retorno real del RPC con entrega: null y nota de finalización
      vi.spyOn(trackingApi, 'solicitanteGetPedidoDetail').mockImplementation(async () => {
        return normalizeSolicitantePedidoDetail({
          success: true,
          pedido: {
            id: 'ped-uuid-public-1',
            pedido_visible: 'PED-2026-P000999',
            anio: 2026,
            numero: 999,
            codigo_categoria: 'PREN',
            categoria_nombre: 'Prensa',
            tipo_nombre: 'Gacetilla de Prensa',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            informacion_especifica: {},
            created_at: '2026-10-10T10:00:00Z',
            updated_at: '2026-10-11T03:00:00Z',
          },
          solicitudes: [],
          notas: [
            { id: 'nota-cierre-1', texto: 'todo ok', created_at: '2026-10-11T03:00:00Z', visibilidad: 'solicitante' },
          ],
          entrega: null,
          historial: [
            {
              evento: 'pedido.created',
              created_at: '2026-10-10T10:00:00Z',
              detalles: { actor_id: 'usr-1', origen: 'publico', version: 1 },
            },
            {
              evento: 'pedido.info_requested',
              created_at: '2026-10-10T14:00:00Z',
              detalles: { actor_id: 'usr-2', pedido_id: 'ped-uuid-public-1' },
            },
            {
              evento: 'pedido.info_responded',
              created_at: '2026-10-10T16:00:00Z',
              detalles: { actor_id: 'sol-1' },
            },
            {
              evento: 'pedido.finalized',
              created_at: '2026-10-11T03:00:00Z',
              detalles: {
                actor_id: 'usr-3',
                pedido_id: 'ped-uuid-public-1',
                entrega_id: null,
                version: 2,
                origen: 'publico',
                has_enlace: false,
                nota: 'todo ok',
              },
            },
          ],
        });
      });

      render(<MisSolicitudesPage />);

      // Esperar a que la lista cargue
      await waitFor(() => {
        expect(screen.getAllByText('PED-2026-P000999')[0]).toBeInTheDocument();
      });

      // Hacer click en "Ver detalle"
      const btnVerDetalle = screen.getAllByRole('button', { name: /Ver detalle/i })[0];
      fireEvent.click(btnVerDetalle);

      // 1. Comprobar que el modal abre y el encabezado muestra el servicio resuelto correctamente
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'PED-2026-P000999' })).toBeInTheDocument();
        expect(screen.getByText('Prensa — Gacetilla de Prensa')).toBeInTheDocument();
        // Verificar que no muestre el literal " — "
        expect(screen.queryByText(/^—$/)).not.toBeInTheDocument();
      });

      // 2. Comprobar que la nota final es claramente visible
      expect(screen.getByText(/Entrega final/i)).toBeInTheDocument();
      expect(screen.getByText('todo ok')).toBeInTheDocument();

      // No debe haber botones de descarga ni URLs externas
      expect(screen.queryByRole('button', { name: /Descargar/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Abrir entrega externa/i)).not.toBeInTheDocument();

      // 3. Comprobar el historial en lenguaje natural
      expect(screen.getByText('Solicitud creada')).toBeInTheDocument();
      expect(screen.getByText('Se solicitó información adicional')).toBeInTheDocument();
      expect(screen.getByText('Respondiste la información solicitada')).toBeInTheDocument();
      expect(screen.getByText('Pedido finalizado')).toBeInTheDocument();

      // 4. COMPROBAR RIGUROSAMENTE QUE NO EXISTE INFORMACIÓN TÉCNICA
      // Ningún nombre técnico de evento
      expect(screen.queryByText('pedido.created')).not.toBeInTheDocument();
      expect(screen.queryByText('pedido.info_requested')).not.toBeInTheDocument();
      expect(screen.queryByText('pedido.info_responded')).not.toBeInTheDocument();
      expect(screen.queryByText('pedido.finalized')).not.toBeInTheDocument();

      // Ningún bloque técnico JSON o details
      expect(screen.queryByText(/detalles técnicos/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/JSON/i)).not.toBeInTheDocument();

      // Ningún campo de base de datos o actor interno
      expect(screen.queryByText(/actor_id/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/entrega_id/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/has_enlace/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/usr-1/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/usr-2/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/usr-3/i)).not.toBeInTheDocument();
    });

    it('resuelve fallback en Servicio Solicitado si no existen categoria y tipo', async () => {
      saveStoredSolicitanteSession({
        session_token: 'session-publica-valida-2',
        correo: 'solicitante@tierradelfuego.gob.ar',
        expires_at: '2026-10-15T00:00:00Z',
      });

      vi.spyOn(trackingApi, 'solicitanteGetPedidos').mockResolvedValue({
        correo: 'solicitante@tierradelfuego.gob.ar',
        total: 1,
        pedidos: [
          {
            id: 'ped-uuid-public-2',
            pedido_visible: 'PED-2026-P000555',
            categoria_nombre: '',
            tipo_nombre: '',
            estado: 'En proceso',
            created_at: '2026-10-10T10:00:00Z',
            updated_at: '2026-10-11T03:00:00Z',
            tiene_entrega: false,
          },
        ],
      });

      vi.spyOn(trackingApi, 'solicitanteGetPedidoDetail').mockImplementation(async () => {
        return normalizeSolicitantePedidoDetail({
          success: true,
          pedido: {
            id: 'ped-uuid-public-2',
            pedido_visible: 'PED-2026-P000555',
            categoria_nombre: '',
            tipo_nombre: '',
            estado: 'En proceso',
            informacion_especifica: {
              titulo: 'Campaña Antártica de Verano',
            },
            created_at: '2026-10-10T10:00:00Z',
            updated_at: '2026-10-11T03:00:00Z',
          },
          solicitudes: [],
          notas: [],
          entrega: null,
          historial: [],
        });
      });

      render(<MisSolicitudesPage />);

      await waitFor(() => {
        expect(screen.getAllByText('PED-2026-P000555')[0]).toBeInTheDocument();
      });

      const btnVerDetalle = screen.getAllByRole('button', { name: /Ver detalle/i })[0];
      fireEvent.click(btnVerDetalle);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'PED-2026-P000555' })).toBeInTheDocument();
        // Muestra el título de informacion_especifica en lugar de " — "
        expect(screen.getByText('Campaña Antártica de Verano')).toBeInTheDocument();
        expect(screen.queryByText(' — ')).not.toBeInTheDocument();
      });
    });
  });
});
