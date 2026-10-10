import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderEmail } from '../../supabase/functions/_shared/emailTemplates';
import { renderEmail as renderEmailDispatch } from '../../scripts/comunicaciones-dispatch.mjs';

describe('FASE A — Mejoras Operativas y Estabilización (Sistema PEDIDOS)', () => {
  const sampleAppUrl = 'https://formulariomedios.pages.dev';

  // ===========================================================================
  // 1. Notificación de Información Respondida (al Operador Asignado)
  // ===========================================================================
  describe('1. Notificación de Información Respondida (48 h) al Operador Asignado', () => {
    const payload = {
      pedido_id: '99999999-9999-9999-9999-999999999999',
      pedido_visible: 'PED-2026-D000199',
      categoria: 'Diseño Gráfico',
      tipo: 'Flyer Digital',
      solicitante_nombre: 'María Gómez',
      area_solicitante: 'Secretaría de Cultura',
      nombre_apellido: 'Carlos Diseñador',
      responsable_id: '11111111-1111-1111-1111-111111111111',
    };

    it('1.1. emailTemplates.ts renderiza el correo dirigido al operador con link a /gestion/pedidos/:id', () => {
      const email = renderEmail('informacion_respondida', payload, sampleAppUrl);

      expect(email.n8nTipo).toBe('informacion_respondida');
      expect(email.subject).toBe('[PEDIDOS] Información respondida: PED-2026-D000199');
      expect(email.html).toContain('Respuesta a Solicitud de Información (48 h)');
      expect(email.html).toContain('Hola <strong>Carlos Diseñador</strong>');
      expect(email.html).toContain('PED-2026-D000199');
      expect(email.html).toContain('Diseño Gráfico — Flyer Digital');
      expect(email.html).toContain('María Gómez (Secretaría de Cultura)');
      expect(email.html).toContain('https://formulariomedios.pages.dev/gestion/pedidos/99999999-9999-9999-9999-999999999999');
      expect(email.html).toContain('Ver Pedido en Gestión');
    });

    it('1.2. comunicaciones-dispatch.mjs renderiza la misma plantilla de manera consistente', () => {
      const email = renderEmailDispatch('informacion_respondida', payload, sampleAppUrl);

      expect(email.n8nTipo).toBe('informacion_respondida');
      expect(email.subject).toBe('[PEDIDOS] Información respondida: PED-2026-D000199');
      expect(email.html).toContain('Hola <strong>Carlos Diseñador</strong>');
      expect(email.html).toContain('PED-2026-D000199');
      expect(email.html).toContain('https://formulariomedios.pages.dev/gestion/pedidos/99999999-9999-9999-9999-999999999999');
    });
  });

  // ===========================================================================
  // 2. Validación de Migración SQL 075
  // ===========================================================================
  describe('2. Migración 075: Estructura, Idempotencia y Funciones Nucleares', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20261010000075_fase_a_operativas_y_estabilizacion.sql'
    );

    it('2.1. El archivo de migración 075 existe y contiene las cláusulas requeridas', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Columna estado_previo con check constraint
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS estado_previo');
      expect(sql).toContain('chk_solicitud_estado_previo');
      expect(sql).toContain("('Nuevo', 'En revisión', 'En proceso')");

      // Índice único para evitar múltiples solicitudes activas concurrentes
      expect(sql).toContain('uq_solicitud_info_pendiente_por_pedido');

      // Atomic info request creation guardando estado_previo
      expect(sql).toContain('info_request_create_atomic');
      expect(sql).toContain('v_ped.estado');

      // Atomic info response submission con soporte de respuestas tardías (>48h)
      expect(sql).toContain('info_response_submit_core');
      expect(sql).toContain('is_tardia');
      expect(sql).toContain('v_solicitud.estado_previo');

      // Resolución de operador en comunicacion_enqueue_info_responded
      expect(sql).toContain('comunicacion_enqueue_info_responded');
      expect(sql).toContain('pedido.info_responded_unassigned');

      // Idempotencia en pedido_assign
      expect(sql).toContain('pedido_assign');
      expect(sql).toContain("'unchanged', true");

      // Transición directa Nuevo -> En proceso permitida si tiene responsable
      expect(sql).toContain('pedido_change_state');
    });
  });

  // ===========================================================================
  // 3. Tolerancia de Vencimiento de Tokens (Edge Function info-token-validate)
  // ===========================================================================
  describe('3. info-token-validate: Tolerancia a Respuestas Tardías (>48 h)', () => {
    const edgeFunctionPath = path.join(
      process.cwd(),
      'supabase/functions/info-token-validate/index.ts'
    );

    it('3.1. Edge function acepta tokens vencidos (>48h) marcando is_tardia: true sin rechazar con 410', () => {
      expect(fs.existsSync(edgeFunctionPath)).toBe(true);
      const code = fs.readFileSync(edgeFunctionPath, 'utf8');

      expect(code).toContain('is_tardia: isExpired');
      expect(code).toContain('valid: true');
      // No debe retornar 410 por expiración
      expect(code).not.toContain("status: 410");
    });
  });

  // ===========================================================================
  // 4. Edge Function info-request-create: Retorno de Estado y Versión
  // ===========================================================================
  describe('4. info-request-create: Retorno Atómico de Estado y Versión', () => {
    const createFunctionPath = path.join(
      process.cwd(),
      'supabase/functions/info-request-create/index.ts'
    );

    it('4.1. Edge function retorna estado, estado_previo y version actualizados', () => {
      expect(fs.existsSync(createFunctionPath)).toBe(true);
      const code = fs.readFileSync(createFunctionPath, 'utf8');

      expect(code).toContain('estado: rpcData?.estado');
      expect(code).toContain('estado_previo: rpcData?.estado_previo');
      expect(code).toContain('version: rpcData?.version');
    });
  });

  // ===========================================================================
  // 5. Frontend: Cards de Gestión y Scope de Auth
  // ===========================================================================
  describe('5. Frontend: Solicitante en Kanban y Scope Local en Auth', () => {
    it('5.1. gestionApi.ts mapea nombre_apellido y area_solicitante en fetchPedidos', () => {
      const gestionApiPath = path.join(
        process.cwd(),
        'pedidos-medios/frontend/src/services/gestionApi.ts'
      );
      const code = fs.readFileSync(gestionApiPath, 'utf8');

      expect(code).toContain('solicitante_nombre?: string');
      expect(code).toContain('area_solicitante?: string');
      expect(code).toContain('envios_formulario');
      expect(code).toContain('nombre_apellido');
      expect(code).toContain('area_solicitante');
    });

    it('5.2. auth.ts tiene scope: "local" por defecto para proteger sesiones concurrentes', () => {
      const authPath = path.join(
        process.cwd(),
        'pedidos-medios/frontend/src/services/auth.ts'
      );
      const code = fs.readFileSync(authPath, 'utf8');

      expect(code).toContain("const scope = options?.scope ?? 'local';");
      expect(code).toContain('export async function logoutCurrentDevice()');
      expect(code).toContain('export async function logoutAllDevices()');
    });
  });
});
