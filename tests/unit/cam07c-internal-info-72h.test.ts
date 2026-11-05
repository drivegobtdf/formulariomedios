/** CAM-07C static contract guards; real PostgreSQL and handler E2E required. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sql = readFileSync(join(root, 'supabase/migrations/20261104233000_cam07c_internal_info_72h.sql'), 'utf8');
const ui = readFileSync(join(root, 'pedidos-medios/frontend/src/pages/PedidoDetallePage.tsx'), 'utf8');
const edge = readFileSync(join(root, 'supabase/functions/drive-upload-prepare/index.ts'), 'utf8');

describe('CAM-07C: información solicitante interno 72h', () => {
  it('conserva RPC atómica, 72h y sobre cifrado', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.info_request_create_atomic(');
    expect(sql).toContain("interval '72 hours'");
    expect(sql).toContain("'encrypted_envelope'");
    expect(sql).toContain("'informacion_faltante'");
    expect(sql).toContain('PENDING_REQUEST_EXISTS');
  });
  it('resuelve identidad según origen y rechaza correo inválido', () => {
    expect(sql).toContain("v_ped.origen = 'interno'");
    expect(sql).toContain("p.informacion_especifica->'solicitante'->>'correo'");
    expect(sql).toContain('RECIPIENT_NOT_FOUND');
    expect(sql).not.toContain('INFO_REQUEST_NOT_ALLOWED_FOR_INTERNAL');
  });
  it('admite pedido interno con envio_id NULL en respuesta por token', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.info_response_submit_core(');
    expect(sql).toContain('IF v_current_pedido_estado IS NULL THEN');
    expect(sql).not.toContain('IF v_envio_id IS NULL THEN');
    expect(sql).toContain('TOKEN_EXPIRED');
  });
  it('portal permite respuesta solamente al propietario por sesión', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response(');
    expect(sql).toContain("p.origen = 'publico' AND lower(trim(e.correo)) = v_correo");
    expect(sql).toContain("p.origen = 'interno' AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_correo");
    expect(sql).toContain('FOR UPDATE OF si');
  });
  it('el detalle interno sólo proyecta solicitudes propias y respuestas permitidas', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.solicitante_get_internal_pedido_detail(');
    expect(sql).toContain('FROM public.solicitudes_informacion si WHERE si.pedido_id = v_ped.id;');
    expect(sql).toContain("'solicitudes', v_solicitudes");
    expect(sql).toContain("'notas', '[]'::jsonb");
    expect(sql).toContain("'nota_final', NULL");
    expect(sql).toContain("a.contexto = 'informacion_respuesta'");
  });
  it('mantiene PoLP sólo en service_role', () => {
    for (const name of ['info_request_create_atomic', 'info_response_submit_core', 'solicitante_submit_info_response', 'solicitante_get_internal_pedido_detail']) {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(`);
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.solicitante_get_internal_pedido_detail\(text, text\) TO (anon|authenticated)/);
  });
  it('gestión ofrece acción de 72h con datos internos de correo', () => {
    expect(ui).toContain('CAM-07C: Solicitud de información 72h');
    expect(ui).toContain("pedido.informacion_especifica as any)?.solicitante?.correo?.trim()");
    expect(ui).toContain('hasPendingInfo');
  });
  it('las reservas de subida comprueban propiedad para sesiones de solicitante', () => {
    expect(edge).toContain('CAM-07C: session owner must match the parent PED');
    expect(edge).toContain("pedOwner?.origen === 'interno'");
    expect(edge).toContain("error: 'FORBIDDEN', message: 'La solicitud no pertenece a esta sesión'");
  });
  it('relay comprueba propiedad antes de transmitir a Drive', () => {
    expect(edge).toContain('CAM-07C: verify parent ownership before streaming any bytes to Drive');
    expect(edge).toContain("ownerPed?.origen === 'interno'");
    expect(edge).toContain("error: 'FORBIDDEN', message: 'Reserva ajena al solicitante'");
    expect(edge.indexOf('CAM-07C: verify parent ownership')).toBeLessThan(edge.indexOf('const driveRes = await fetch(resData.drive_session_ref'));
  });
});
