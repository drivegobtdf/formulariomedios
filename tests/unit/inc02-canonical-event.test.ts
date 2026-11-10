import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationInc02Path = join(root, 'supabase/migrations/20261110000002_inc02_info_responded_canonical_event.sql');
const migrationInc02 = readFileSync(migrationInc02Path, 'utf8');

describe('INC-02: Evento canónico pedido.info_responded, compatibilidad y encolado idempotente', () => {
  it('1. solicitante_submit_info_response emite el evento canónico pedido.info_responded', () => {
    expect(migrationInc02).toContain('CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response(');
    expect(migrationInc02).toContain("'pedido.info_responded'");
    // No debe emitir el evento legado directamente en la RPC corregida
    const rpcSection = migrationInc02.slice(
      migrationInc02.indexOf('CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response('),
      migrationInc02.indexOf('-- 2. Actualización de trg_domain_event_auto_enqueue')
    );
    expect(rpcSection).not.toContain("'info_request.responded'");
    expect(rpcSection).toContain("INSERT INTO public.domain_events");
    expect(rpcSection).toContain("'pedido.info_responded'");
  });

  it('2. trg_domain_event_auto_enqueue atiende dualmente pedido.info_responded e info_request.responded', () => {
    expect(migrationInc02).toContain('CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()');
    expect(migrationInc02).toContain(
      "ELSIF NEW.event_name = 'pedido.info_responded' OR NEW.event_name = 'info_request.responded' THEN"
    );
    expect(migrationInc02).toContain(
      "PERFORM public.comunicacion_enqueue_info_responded(\n            NEW.aggregate_id,\n            (NEW.payload->>'solicitud_id')::uuid\n        );"
    );
  });

  it('3. comunicacion_enqueue_info_responded soporta pedidos internos y solicitante específico', () => {
    expect(migrationInc02).toContain('CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_responded(');
    expect(migrationInc02).toContain("v_pedido.origen = 'interno'");
    expect(migrationInc02).toContain("v_pedido.informacion_especifica->'solicitante'->>'nombre_apellido'");
    expect(migrationInc02).toContain("v_pedido.informacion_especifica->'solicitante'->>'area'");
  });

  it('4. comunicacion_enqueue_info_responded calcula el plazo real de horas y enriquece el payload', () => {
    expect(migrationInc02).toContain("v_plazo_horas := ROUND(EXTRACT(EPOCH FROM (v_expires_at - v_created_at)) / 3600);");
    expect(migrationInc02).toContain("'plazo_horas', v_plazo_horas");
    expect(migrationInc02).toContain("'expires_at', v_expires_at");
    expect(migrationInc02).toContain("'created_at', v_created_at");
  });

  it('5. comunicacion_enqueue_info_responded garantiza idempotencia estricta en el outbox', () => {
    expect(migrationInc02).toContain(
      "v_idempotency_key := 'info_resp:' || p_pedido_id::text || ':' || COALESCE(p_solicitud_id::text, 'sol') || ':' || v_resp.user_id::text;"
    );
    expect(migrationInc02).toContain("ON CONFLICT (idempotency_key) DO NOTHING;");
  });

  it('6. PoLP y permisos: revocados de anon y authenticated, otorgados solo a service_role', () => {
    expect(migrationInc02).toContain("REVOKE ALL ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;");
    expect(migrationInc02).toContain("GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;");
    expect(migrationInc02).toContain("REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) FROM PUBLIC, anon, authenticated;");
    expect(migrationInc02).toContain("GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) TO service_role;");
  });
});
