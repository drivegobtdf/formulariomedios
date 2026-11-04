import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { renderEmail } from '../../supabase/functions/_shared/emailTemplates';
import { getHistorialEventInfo, PedidoDetallePage } from '../../pedidos-medios/frontend/src/pages/PedidoDetallePage';
import { SeguimientoPage } from '../../pedidos-medios/frontend/src/pages/SeguimientoPage';
import { SolicitudInformacionPage } from '../../pedidos-medios/frontend/src/pages/SolicitudInformacionPage';
import { NotificacionesPage } from '../../pedidos-medios/frontend/src/pages/NotificacionesPage';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as trackingApi from '../../pedidos-medios/frontend/src/services/trackingApi';
import * as notificationsHook from '../../pedidos-medios/frontend/src/hooks/useNotifications';

describe('CAM-01: Extensión de Plazo de Solicitudes de Información (48 → 72 Horas Corridas) y Compatibilidad Histórica', () => {
  const sampleAppUrl = 'https://formulariomedios.pages.dev';
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20261103193000_cam01_info_request_72h_deadline.sql'
  );
  const uploadPreparePath = path.join(
    process.cwd(),
    'supabase/functions/drive-upload-prepare/index.ts'
  );

  describe('1. Migración SQL Versionada y Firmas Reales Verificadas', () => {
    it('1.1. La migración nueva existe y conserva exactamente las firmas, tipos de retorno, SECURITY DEFINER, search_path y permisos de las 4 funciones', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. info_request_create_atomic: firma real de 7 argumentos y search_path = ''
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.info_request_create_atomic(');
      expect(sql).toContain('p_solicitud_id uuid,');
      expect(sql).toContain('p_pedido_id uuid,');
      expect(sql).toContain('p_actor_user_id uuid,');
      expect(sql).toContain('p_mensaje text,');
      expect(sql).toContain('p_token_hash text,');
      expect(sql).toContain('p_encrypted_envelope jsonb,');
      expect(sql).toContain('p_expected_version bigint DEFAULT NULL');
      expect(sql).toContain("v_expires_at := now() + interval '72 hours';");
      expect(sql).toContain("'plazo_horas', 72,");
      expect(sql).toContain(
        'REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;'
      );
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;'
      );

      // 2. info_request_create: firma real de 3 argumentos y search_path = public, private, extensions, auth, pg_temp
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.info_request_create(');
      expect(sql).toContain('p_expected_version integer DEFAULT NULL');
      expect(sql).toContain('SET search_path = public, private, extensions, auth, pg_temp');
      expect(sql).toContain(
        'REVOKE ALL ON FUNCTION public.info_request_create(uuid, text, integer) FROM PUBLIC, anon, authenticated;'
      );
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.info_request_create(uuid, text, integer) TO service_role;'
      );

      // 3. comunicacion_enqueue_info_requested: firma real y preservación del plazo real (48h histórica o 72h nueva)
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_requested(');
      expect(sql).toContain('p_encrypted_envelope jsonb DEFAULT NULL');
      expect(sql).toContain('EXTRACT(EPOCH FROM (v_sol.expires_at - v_sol.created_at)) / 3600.0');
      expect(sql).toContain("'plazo_horas', v_plazo_horas,");
      expect(sql).toContain('v_plazo_horas := NULL;');
      expect(sql).not.toMatch(/ELSE\s+v_plazo_horas\s*:=\s*72/i);
      expect(sql).toContain(
        'REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) FROM PUBLIC, anon, authenticated;'
      );
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) TO service_role;'
      );

      // 4. pedido_finalize: firma real de 5 argumentos, search_path = '', y mensaje de bloqueo sin (48h) fijo
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pedido_finalize(');
      expect(sql).toContain('p_expected_version bigint,');
      expect(sql).toContain('p_archivos_entrega uuid[] DEFAULT NULL,');
      expect(sql).toContain('p_url_entrega text DEFAULT NULL,');
      expect(sql).toContain('p_nota_entrega text DEFAULT NULL');
      expect(sql).toContain(
        "RAISE EXCEPTION 'PENDING_INFO_REQUEST: No se puede finalizar el pedido porque posee solicitudes de información pendientes y vigentes' USING ERRCODE = '42200';"
      );
      expect(sql).not.toContain('pendientes y vigentes (48h)');
      expect(sql).toContain(
        'REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;'
      );
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;'
      );

      // Garantizar que NO modifica registros históricos ni otros TTL
      expect(sql).not.toMatch(/UPDATE\s+public\.solicitudes_informacion\s+SET\s+expires_at/i);
      expect(sql).not.toContain('solicitante_magic_link_ttl_seconds');
      expect(sql).not.toContain('solicitante_session_ttl_seconds');
      expect(sql).not.toContain('tracking_recovery_ttl_seconds');
    });
  });

  describe('2. Correos y Edge Functions: Compatibilidad 48h Histórica y 72h Nueva', () => {
    it('2.1. Renderiza correo de nueva solicitud con plazo_horas = 72 indicando 72h y fecha en America/Argentina/Ushuaia', () => {
      const createdIso = '2026-11-03T15:00:00.000Z'; // 12:00:00 en Ushuaia (UTC-3)
      const expiresIso = '2026-11-06T15:00:00.000Z'; // +72h exactas (259200 s)
      const email = renderEmail(
        'informacion_faltante',
        {
          pedido_visible: 'PED-2026-D000501',
          nombre_apellido: 'Ana Solicitante',
          categoria: 'Diseño',
          tipo: 'Flyer',
          mensaje: 'Adjuntar manual de marca actualizado.',
          expires_at: expiresIso,
          created_at: createdIso,
          plazo_horas: 72,
          raw_token: 'tok_new_72h_hex',
        },
        sampleAppUrl
      );

      expect(email.subject).toBe('[PEDIDOS] Requerimiento de Información (72h): PED-2026-D000501');
      expect(email.html).toContain('Dispone de 72 HORAS CORRIDAS para responder este requerimiento');
      expect(email.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (72 HORAS CORRIDAS)');
      expect(email.text).toContain('Dispone de 72 horas corridas');
      expect(email.html).not.toContain('48 HORAS CORRIDAS');
    });

    it('2.2. Renderiza correo de comunicación histórica reenviada con plazo_horas = 48 conservando 48h y su expires_at real', () => {
      const createdIso = '2026-10-20T15:00:00.000Z';
      const expiresIso = '2026-10-22T15:00:00.000Z'; // +48h exactas
      const email = renderEmail(
        'informacion_faltante',
        {
          pedido_visible: 'PED-2026-D000300',
          nombre_apellido: 'Juan Histórico',
          categoria: 'Cobertura',
          tipo: 'Fotografía',
          mensaje: 'Confirmar horario de inicio.',
          expires_at: expiresIso,
          created_at: createdIso,
          plazo_horas: 48,
          raw_token: 'tok_hist_48h_hex',
        },
        sampleAppUrl
      );

      expect(email.subject).toBe('[PEDIDOS] Requerimiento de Información (48h): PED-2026-D000300');
      expect(email.html).toContain('Dispone de 48 HORAS CORRIDAS para responder este requerimiento');
      expect(email.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (48 HORAS CORRIDAS)');
      expect(email.text).toContain('Dispone de 48 horas corridas');
      expect(email.html).not.toContain('72 HORAS CORRIDAS');
    });

    it('2.3. Evita fallbacks falsos de 72h cuando una comunicación antigua carece de plazo_horas y created_at', () => {
      const expiresIso = '2026-09-16T18:00:00.000Z';
      const email = renderEmail(
        'informacion_faltante',
        {
          pedido_visible: 'PED-2026-D000101',
          nombre_apellido: 'Usuario Legado',
          mensaje: 'Falta archivo adjunto.',
          expires_at: expiresIso,
        },
        sampleAppUrl
      );

      expect(email.subject).toBe('[PEDIDOS] Requerimiento de Información: PED-2026-D000101');
      expect(email.html).not.toContain('72 HORAS CORRIDAS');
      expect(email.html).not.toContain('48 HORAS CORRIDAS');
      expect(email.html).toContain('Debe responder este requerimiento antes de su vencimiento');
    });

    it('2.4. drive-upload-prepare mantiene bloqueo HTTP 410 tras expires_at e informa el plazo real sin mentir sobre solicitudes históricas', () => {
      const code = fs.readFileSync(uploadPreparePath, 'utf8');
      expect(code).toContain('new Date(sol.expires_at).getTime() <= Date.now()');
      expect(code).toContain('status: 410');
      expect(code).toContain('diffHours === 48 || diffHours === 72');
      expect(code).toContain('La solicitud de información ha expirado tras las ${diffHours} horas corridas');
      expect(code).toContain('El plazo de vigencia de la solicitud de información ha expirado');
    });
  });

  describe('3. Vistas Frontend: Botón 72h para Nuevas y Compatibilidad con Solicitudes Históricas', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('3.1. getHistorialEventInfo muestra el plazo solo si es determinable (48h o 72h) y texto neutro en caso contrario', () => {
      const evNeutral = getHistorialEventInfo('pedido.info_requested', {
        mensaje: 'Aportar logo',
        expires_at: '2026-10-15T12:00:00Z',
      });
      expect(evNeutral.title).toBe('Solicitud de Información Emitida');

      const ev48 = getHistorialEventInfo('pedido.info_requested', {
        mensaje: 'Aportar logo 48h',
        created_at: '2026-10-13T12:00:00Z',
        expires_at: '2026-10-15T12:00:00Z',
      });
      expect(ev48.title).toBe('Solicitud de Información Emitida (48h)');

      const ev72 = getHistorialEventInfo('pedido.info_requested', {
        mensaje: 'Aportar logo 72h',
        created_at: '2026-11-03T12:00:00Z',
        expires_at: '2026-11-06T12:00:00Z',
      });
      expect(ev72.title).toBe('Solicitud de Información Emitida (72h)');
    });

    it('3.2. PedidoDetallePage muestra botón "Pedir información · 72 h" para crear nuevas solicitudes y preserva el plazo real (48h vs 72h) en solicitudes existentes', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'admin-1',
          email: 'admin@tdf.gob.ar',
          nombre: 'Admin',
          apellido: 'TDF',
          nombre_usuario: 'admin_tdf',
          app_role: 'administrador',
          estado_acceso: 'aprobado',
        },
        isLoading: false,
        isApproved: true,
        isAdmin: true,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      const mockPedido: gestionApi.PedidoDetailItem = {
        id: 'ped-cam01-1',
        pedido_visible: 'PED-2026-D000801',
        anio: 2026,
        numero: 801,
        codigo_categoria: 'D',
        origen: 'publico',
        categoria_id: 'cat-1',
        categoria_nombre: 'Diseño',
        tipo_servicio_id: 'tip-1',
        tipo_nombre: 'Afiche',
        estado: 'En proceso',
        responsable_user_id: 'admin-1',
        responsable_nombre: 'Admin TDF',
        informacion_especifica: {},
        version: 2,
        archivado: false,
        created_at: '2026-10-20T12:00:00.000Z',
        updated_at: '2026-11-03T12:00:00.000Z',
        envio: {
          id: 'env-1',
          nombre_apellido: 'Ciudadano Prueba',
          correo: 'ciudadano@tdf.gob.ar',
          telefono: '2901445566',
          area_solicitante: 'Cultura',
        },
        asignaciones: [],
        notas: [],
        solicitudes: [
          {
            id: 'sol-hist-48',
            mensaje: 'Solicitud histórica de 48 horas',
            estado: 'respondida',
            created_at: '2026-10-20T15:00:00.000Z',
            expires_at: '2026-10-22T15:00:00.000Z',
            respuesta_texto: 'Respondido en 48h',
          },
          {
            id: 'sol-new-72',
            mensaje: 'Solicitud nueva de 72 horas',
            estado: 'respondida',
            created_at: '2026-11-03T15:00:00.000Z',
            expires_at: '2026-11-06T15:00:00.000Z',
            respuesta_texto: 'Respondido en 72h',
          },
        ],
        archivos: [],
        enlaces: [],
        entregas: [],
      };

      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedido);
      vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([]);
      vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/gestion/pedidos/ped-cam01-1']}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-D000801')).toBeInTheDocument();
      });

      // Botón para emitir NUEVA solicitud indica 72 h
      expect(screen.getByRole('button', { name: /Pedir información · 72 h/i })).toBeInTheDocument();

      // Título de sección neutro y cada solicitud conserva su plazo original (48 h y 72 h)
      expect(screen.getByRole('heading', { name: 'Información solicitada' })).toBeInTheDocument();
      expect(screen.getByText(/\(48 h\)/)).toBeInTheDocument();
      expect(screen.getByText(/\(72 h\)/)).toBeInTheDocument();
    });

    it('3.3. SolicitudInformacionPage distingue solicitud histórica de 48h vs nueva de 72h según created_at y expires_at', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          search: '?token=valid_token_48h',
          hash: '',
          pathname: '/formulariomedios/solicitud-informacion',
        },
        writable: true,
      });

      vi.spyOn(trackingApi, 'validateInfoToken').mockResolvedValueOnce({
        valid: true,
        responded: false,
        solicitud: {
          id: 'sol-48',
          pedido_id: 'ped-1',
          pedido_visible: 'PED-2026-D000300',
          categoria_nombre: 'Diseño',
          tipo_nombre: 'Flyer',
          mensaje: 'Requerimiento histórico emitido con 48h',
          estado: 'pendiente',
          created_at: '2026-10-20T15:00:00.000Z',
          expires_at: '2026-10-22T15:00:00.000Z',
        },
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={['/solicitud-informacion?token=valid_token_48h']}>
          <SolicitudInformacionPage />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText('Información solicitada · 48 h')).toBeInTheDocument();
      });
      expect(screen.getByText(/\(48 h\)/)).toBeInTheDocument();
      expect(screen.queryByText(/72 h/)).not.toBeInTheDocument();
      unmount();

      // Ahora con una solicitud nueva de 72h
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          search: '?token=valid_token_72h',
          hash: '',
          pathname: '/formulariomedios/solicitud-informacion',
        },
        writable: true,
      });

      vi.spyOn(trackingApi, 'validateInfoToken').mockResolvedValueOnce({
        valid: true,
        responded: false,
        solicitud: {
          id: 'sol-72',
          pedido_id: 'ped-2',
          pedido_visible: 'PED-2026-D000501',
          categoria_nombre: 'Diseño',
          tipo_nombre: 'Flyer',
          mensaje: 'Requerimiento nuevo emitido con 72h',
          estado: 'pendiente',
          created_at: '2026-11-03T15:00:00.000Z',
          expires_at: '2026-11-06T15:00:00.000Z',
        },
      });

      render(
        <MemoryRouter initialEntries={['/solicitud-informacion?token=valid_token_72h']}>
          <SolicitudInformacionPage />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText('Información solicitada · 72 h')).toBeInTheDocument();
      });
      expect(screen.getByText(/\(72 h\)/)).toBeInTheDocument();
    });

    it('3.4. NotificacionesPage muestra descripción neutra compatible con respuestas históricas y nuevas', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'equipo-1',
          email: 'equipo@tdf.gob.ar',
          nombre: 'Operador',
          apellido: 'TDF',
          nombre_usuario: 'op_tdf',
          app_role: 'equipo',
          estado_acceso: 'aprobado',
        },
        isLoading: false,
        isApproved: true,
        isAdmin: false,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      vi.spyOn(notificationsHook, 'useNotifications').mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
      });

      render(
        <MemoryRouter>
          <NotificacionesPage />
        </MemoryRouter>
      );

      expect(
        screen.getByText('Historial de asignaciones, notas internas, respuestas de información y revisiones')
      ).toBeInTheDocument();
    });
  });
});
