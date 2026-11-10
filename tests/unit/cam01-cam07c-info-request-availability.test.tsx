/**
 * Pruebas de regresión: CAM-01 / CAM-07C
 * Disponibilidad y validación de "Pedir información · 72 h" con Responsable Obligatorio
 *
 * Regla funcional obligatoria:
 * Solo se puede emitir una solicitud de información de 72 horas cuando:
 * pedidos.responsable_user_id IS NOT NULL.
 * Aplica a pedidos públicos e internos en estados Nuevo, En revisión y En proceso.
 *
 * En frontend (PedidoDetallePage.tsx):
 * - El botón debe mantenerse visible en esos tres estados para ambos orígenes.
 * - Debe bloquearse (disabled con mensaje explicativo) si responsable_user_id es null/undefined.
 * - Debe habilitarse cuando responsable_user_id no es nulo.
 *
 * En backend (RPC info_request_create_atomic):
 * - Valida fail-closed: IF v_ped.responsable_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSABLE_REQUIRED...'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PedidoDetallePage } from '../../pedidos-medios/frontend/src/pages/PedidoDetallePage';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';
import * as AuthContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';

const mockAdminUser = {
  id: 'admin-user-uuid',
  email: 'admin@tdf.gob.ar',
  nombre: 'Admin',
  apellido: 'General',
  nombre_usuario: 'admin_tdf',
  app_role: 'administrador' as const,
  estado_acceso: 'aprobado' as const,
};

const mockObserverUser = {
  id: 'observer-user-uuid',
  email: 'observador@tdf.gob.ar',
  nombre: 'Observador',
  apellido: 'General',
  nombre_usuario: 'obs_tdf',
  app_role: 'observador' as const,
  estado_acceso: 'aprobado' as const,
};

function createMockPedido(overrides: Partial<gestionApi.PedidoDetailItem> = {}): gestionApi.PedidoDetailItem {
  return {
    id: 'test-ped-uuid-1',
    pedido_visible: 'PED-2026-X000100',
    anio: 2026,
    numero: 100,
    codigo_categoria: 'X',
    origen: 'interno',
    titulo: 'Pedido de Prueba Disponibilidad',
    categoria_id: 'cat-1',
    categoria_nombre: 'Prensa',
    tipo_servicio_id: 'tip-1',
    tipo_nombre: 'Gacetilla',
    estado: 'Nuevo',
    responsable_user_id: undefined,
    responsable_nombre: undefined,
    informacion_especifica: {},
    version: 1,
    archivado: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    envio: null,
    asignaciones: [],
    notas: [],
    solicitudes: [],
    archivos: [],
    enlaces: [],
    entregas: [],
    ...overrides,
  };
}

describe('CAM-01 / CAM-07C: Disponibilidad de «Pedir información · 72 h» con Responsable Obligatorio', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([]);
    vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([]);
  });

  const setupAuth = (isAdmin = true, isObserver = false) => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: isObserver ? mockObserverUser : mockAdminUser,
      isLoading: false,
      isApproved: true,
      isAdmin,
      isTeamOrAdmin: !isObserver,
      isObserver,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });
  };

  describe('1. Pruebas Positivas: botón HABILITADO cuando existe responsable', () => {
    const validStates = ['Nuevo', 'En revisión', 'En proceso'] as const;
    const origins = ['publico', 'interno'] as const;

    for (const origin of origins) {
      for (const estado of validStates) {
        it(`Debe mostrar el botón HABILITADO para origen "${origin}" en estado "${estado}" con responsable asignado`, async () => {
          setupAuth();
          const mock = createMockPedido({
            origen: origin,
            estado,
            responsable_user_id: 'admin-user-uuid',
            responsable_nombre: 'Admin General',
            envio: origin === 'publico' ? {
              id: 'env-1',
              nombre_apellido: 'Juan Perez',
              correo: 'juan@tdf.gob.ar',
              telefono: '2901000000',
              area_solicitante: 'Cultura',
            } : null,
            informacion_especifica: origin === 'interno' ? {
              solicitante: {
                nombre: 'Ana Lopez',
                correo: 'ana@tdf.gob.ar',
              },
            } : {},
          });

          vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

          render(
            <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
              <Routes>
                <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
              </Routes>
            </MemoryRouter>
          );

          await waitFor(() => {
            expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
          });

          const btn = screen.getByRole('button', { name: /Pedir información · 72 h/i });
          expect(btn).toBeInTheDocument();
          expect(btn).toBeEnabled();
        });
      }
    }
  });

  describe('2. Pruebas Negativas: botón BLOQUEADO (disabled) cuando NO existe responsable', () => {
    const validStates = ['Nuevo', 'En revisión', 'En proceso'] as const;
    const origins = ['publico', 'interno'] as const;

    for (const origin of origins) {
      for (const estado of validStates) {
        it(`Debe mostrar el botón DESHABILITADO con tooltip explicativo para origen "${origin}" en estado "${estado}" sin responsable`, async () => {
          setupAuth();
          const mock = createMockPedido({
            origen: origin,
            estado,
            responsable_user_id: undefined,
            responsable_nombre: undefined,
            envio: origin === 'publico' ? {
              id: 'env-1',
              nombre_apellido: 'Juan Perez',
              correo: 'juan@tdf.gob.ar',
              telefono: '2901000000',
              area_solicitante: 'Cultura',
            } : null,
            informacion_especifica: origin === 'interno' ? {
              solicitante: {
                nombre: 'Ana Lopez',
                correo: 'ana@tdf.gob.ar',
              },
            } : {},
          });

          vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

          render(
            <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
              <Routes>
                <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
              </Routes>
            </MemoryRouter>
          );

          await waitFor(() => {
            expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
          });

          const btn = screen.getByRole('button', { name: /Pedir información · 72 h/i });
          expect(btn).toBeInTheDocument();
          expect(btn).toBeDisabled();
          expect(btn).toHaveAttribute('title', 'Debe asignar un responsable antes de solicitar información');
        });
      }
    }
  });

  describe('3. Modal y validaciones de guarda ante ausencia de correo o responsable', () => {
    it('Permite abrir modal cuando tiene responsable y advierte si falta correo del solicitante', async () => {
      setupAuth();
      const mock = createMockPedido({
        origen: 'interno',
        estado: 'Nuevo',
        responsable_user_id: 'admin-user-uuid',
        responsable_nombre: 'Admin General',
        informacion_especifica: {
          descripcion: 'Pedido interno con responsable pero sin email',
        },
      });

      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

      render(
        <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
      });

      const btn = screen.getByRole('button', { name: /Pedir información · 72 h/i });
      expect(btn).toBeEnabled();

      fireEvent.click(btn);
      expect(screen.getByRole('heading', { level: 3, name: /Pedir información · 72 h/i })).toBeInTheDocument();
      expect(screen.getByText(/Sin destinatario válido/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Enviar solicitud/i })).toBeDisabled();
    });

    it('Permite emitir solicitud cuando tiene responsable y correo válido', async () => {
      setupAuth();
      const mock = createMockPedido({
        origen: 'interno',
        estado: 'En proceso',
        responsable_user_id: 'admin-user-uuid',
        responsable_nombre: 'Admin General',
        informacion_especifica: {
          solicitante: {
            nombre: 'Marta Solicitante',
            correo: 'marta@tdf.gob.ar',
          },
        },
      });

      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);
      const createInfoReqSpy = vi.spyOn(gestionApi, 'createInfoRequest').mockResolvedValue({ success: true } as any);

      render(
        <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
      });

      const btn = screen.getByRole('button', { name: /Pedir información · 72 h/i });
      fireEvent.click(btn);

      expect(screen.getAllByText('marta@tdf.gob.ar').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/72 horas corridas/i)).toBeInTheDocument();

      const textarea = screen.getByPlaceholderText(/Detallá los datos/i);
      fireEvent.change(textarea, { target: { value: 'Por favor adjuntar la constancia requerida' } });

      const submitBtn = screen.getByRole('button', { name: /Enviar solicitud/i });
      expect(submitBtn).toBeEnabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createInfoReqSpy).toHaveBeenCalledWith(
          mock.id,
          'Por favor adjuntar la constancia requerida',
          mock.version
        );
      });
    });
  });

  describe('4. Estados no permitidos y solicitud pendiente', () => {
    it('NO muestra el botón si el estado es Finalizado', async () => {
      setupAuth();
      const mock = createMockPedido({ estado: 'Finalizado', responsable_user_id: 'admin-user-uuid' });
      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

      render(
        <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Pedir información · 72 h/i })).not.toBeInTheDocument();
    });

    it('NO muestra el botón si el estado es Cancelado', async () => {
      setupAuth();
      const mock = createMockPedido({ estado: 'Cancelado', responsable_user_id: 'admin-user-uuid' });
      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

      render(
        <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Pedir información · 72 h/i })).not.toBeInTheDocument();
    });

    it('NO muestra el botón si ya existe una solicitud de información pendiente (hasPendingInfo = true)', async () => {
      setupAuth();
      const mock = createMockPedido({
        estado: 'Esperando información',
        responsable_user_id: 'admin-user-uuid',
        solicitudes: [
          {
            id: 'sol-activa-1',
            solicitada_por: 'admin-user-uuid',
            mensaje: 'Falta documentación adicional',
            estado: 'pendiente',
            expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            is_expired: false,
          },
        ],
      });
      vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mock);

      render(
        <MemoryRouter initialEntries={[`/gestion/pedidos/${mock.id}`]}>
          <Routes>
            <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PED-2026-X000100')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Pedir información · 72 h/i })).not.toBeInTheDocument();
    });
  });

  describe('5. Paridad con la RPC PostgreSQL (info_request_create_atomic)', () => {
    it('La nueva migración exige responsable obligatorio y valida fail-closed', () => {
      const root = process.cwd();
      const sql = readFileSync(join(root, 'supabase/migrations/20261106004000_cam01_cam07c_mandatory_responsable_for_info_request.sql'), 'utf8');

      // Responsable obligatorio
      expect(sql).toContain('v_ped.responsable_user_id IS NULL');
      expect(sql).toContain("RESPONSABLE_REQUIRED: Debe asignar un responsable antes de solicitar información");

      // Estados permitidos
      expect(sql).toContain("v_ped.estado NOT IN ('Nuevo', 'En revisión', 'En proceso')");

      // Orígenes permitidos
      expect(sql).toContain("v_ped.origen NOT IN ('publico', 'interno')");

      // Validación de destinatario
      expect(sql).toContain("RECIPIENT_NOT_FOUND: El pedido no tiene un correo válido para solicitar información");

      // Plazo de 72 horas corridas
      expect(sql).toContain("interval '72 hours'");

      // Comprobación de solicitud pendiente existente
      expect(sql).toContain("PENDING_REQUEST_EXISTS");

      // Control de concurrencia optimista
      expect(sql).toContain("VERSION_CONFLICT");

      // PoLP exclusivo a service_role
      expect(sql).toContain("REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;");
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;");
    });
  });
});
