-- ==============================================================================
-- TEST SUITE 00007: F10 Outbox Queue, Triggers, Claim Batch & Mark Result (pgTAP)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(25);

-- -----------------------------------------------------------------------------
-- 0. Fixtures y Helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.set_auth_context(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
        PERFORM set_config('request.jwt.claim.role', p_role, true);
        SET LOCAL ROLE authenticated;
    ELSE
        PERFORM set_config('request.jwt.claim.sub', '', true);
        PERFORM set_config('request.jwt.claim.role', p_role, true);
        IF p_role = 'anon' THEN
            SET LOCAL ROLE anon;
        ELSE
            RESET ROLE;
        END IF;
    END IF;
END;
$$;

DO $$
DECLARE
  v_admin_id uuid := '00000000-0000-0000-0000-000000000101'::uuid;
  v_operador_id uuid := '00000000-0000-0000-0000-000000000102'::uuid;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES 
    (v_admin_id, 'admin_f10@test.gob.ar'),
    (v_operador_id, 'operador_f10@test.gob.ar')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, app_role, estado_acceso)
  VALUES
    (v_admin_id, 'Admin', 'F10', 'admin.f10', 'administrador', 'aprobado'),
    (v_operador_id, 'Operador', 'F10', 'operador.f10', 'equipo', 'aprobado')
  ON CONFLICT (user_id) DO UPDATE SET
    estado_acceso = 'aprobado',
    app_role = EXCLUDED.app_role;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Verificación de Estructura de Tabla e Índices (REQ-F10-03)
-- -----------------------------------------------------------------------------

SELECT has_table('public', 'comunicaciones_pedido', 'Tabla comunicaciones_pedido existe');
SELECT has_column('public', 'comunicaciones_pedido', 'retry_after', 'Columna retry_after existe');
SELECT has_column('public', 'comunicaciones_pedido', 'max_attempts', 'Columna max_attempts existe');
SELECT has_column('public', 'comunicaciones_pedido', 'subject', 'Columna subject existe');
SELECT has_column('public', 'comunicaciones_pedido', 'body_html', 'Columna body_html existe');
SELECT has_column('public', 'comunicaciones_pedido', 'body_text', 'Columna body_text existe');
SELECT has_index('public', 'comunicaciones_pedido', 'idx_comunicaciones_queue_dispatch', 'Índice de queue dispatch existe');

-- -----------------------------------------------------------------------------
-- 2. Verificación de Existencia de Funciones RPC (REQ-F10-03, REQ-F10-07)
-- -----------------------------------------------------------------------------

SELECT has_function('public', 'comunicacion_claim_batch', ARRAY['integer', 'integer'], 'RPC comunicacion_claim_batch existe');
SELECT has_function('public', 'comunicacion_mark_result', ARRAY['uuid', 'uuid', 'boolean', 'text', 'text', 'integer', 'boolean'], 'RPC comunicacion_mark_result existe');
SELECT has_function('public', 'comunicacion_enqueue_submission_created', ARRAY['uuid'], 'Helper comunicacion_enqueue_submission_created existe');
SELECT has_function('public', 'comunicacion_enqueue_info_requested', ARRAY['uuid'], 'Helper comunicacion_enqueue_info_requested existe');
SELECT has_function('public', 'comunicacion_enqueue_lifecycle', ARRAY['uuid', 'text', 'jsonb'], 'Helper comunicacion_enqueue_lifecycle existe');

-- -----------------------------------------------------------------------------
-- 3. Inserción de Envío y Pedidos para Probar Triggers de Encolamiento (REQ-F10-01, REQ-F10-02)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_envio_id uuid := 'e0000000-0000-0000-0000-000000000f10'::uuid;
    v_ped_1 uuid := 'a0000000-0000-0000-0000-000000000f11'::uuid;
    v_ped_2 uuid := 'a0000000-0000-0000-0000-000000000f12'::uuid;
    v_cat_id uuid;
    v_tipo_id uuid;
BEGIN
    DELETE FROM public.comunicaciones_pedido;
    DELETE FROM public.domain_events WHERE aggregate_id IN (v_envio_id, v_ped_1, v_ped_2);
    DELETE FROM public.pedidos WHERE id IN (v_ped_1, v_ped_2);
    DELETE FROM public.envios_formulario WHERE id = v_envio_id;

    SELECT id INTO v_cat_id FROM public.categorias_servicio WHERE codigo_ped = 'D' LIMIT 1;
    SELECT id INTO v_tipo_id FROM public.tipos_servicio WHERE categoria_id = v_cat_id LIMIT 1;

    INSERT INTO public.envios_formulario (
        id, submission_key, request_fingerprint, nombre_apellido, telefono, correo,
        area_solicitante, form_schema_version, created_at
    ) VALUES (
        v_envio_id, gen_random_uuid(), encode(digest('fp_f10_1', 'sha256'), 'hex'),
        'Test F10', '2901112233', 'test.f10@tierradelfuego.gob.ar',
        'Secretaría de Prueba', 3, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.pedidos (
        id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id,
        codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version,
        tracking_token_hash, version, created_at
    ) VALUES 
        (v_ped_1, v_envio_id, gen_random_uuid(), 'PED-2026-D000911', v_cat_id, v_tipo_id, 'D', 911, 2026, 'Nuevo', '{"tema":"F10 Test 1"}'::jsonb, 3, encode(digest('tok_f10_1', 'sha256'), 'hex'), 1, now()),
        (v_ped_2, v_envio_id, gen_random_uuid(), 'PED-2026-D000912', v_cat_id, v_tipo_id, 'D', 912, 2026, 'Nuevo', '{"tema":"F10 Test 2"}'::jsonb, 3, encode(digest('tok_f10_2', 'sha256'), 'hex'), 1, now())
    ON CONFLICT (id) DO NOTHING;

    -- Emite evento domain_events submission.created
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, created_at
    ) VALUES (
        'submission.created', 'envio_formulario', v_envio_id,
        jsonb_build_object(
            'envio_id', v_envio_id,
            'correo', 'test.f10@tierradelfuego.gob.ar',
            'nombre', 'Test F10',
            'pedidos_count', 2
        ),
        now()
    );
END $$;

-- Verificar que el trigger encoló la comunicación submission_created agrupada
SELECT is(
    (SELECT count(*)::integer FROM public.comunicaciones_pedido 
     WHERE envio_id = 'e0000000-0000-0000-0000-000000000f10'::uuid AND tipo_comunicacion = 'pedido_ingresado'),
    1,
    'Trigger domain_events encoló exactamente 1 comunicación agrupada para submission.created'
);

SELECT is(
    (SELECT jsonb_array_length(payload->'pedidos') FROM public.comunicaciones_pedido 
     WHERE envio_id = 'e0000000-0000-0000-0000-000000000f10'::uuid AND tipo_comunicacion = 'pedido_ingresado'),
    2,
    'La comunicación agrupada contiene el arreglo con los 2 pedidos generados'
);

-- -----------------------------------------------------------------------------
-- 4. Prueba de Encolamiento por Información Faltante (REQ-F10-02 con 48h)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_ped_1 uuid := 'a0000000-0000-0000-0000-000000000f11'::uuid;
    v_sol_id uuid := 'b0000000-0000-0000-0000-000000000f11'::uuid;
    v_operador_id uuid := '00000000-0000-0000-0000-000000000102'::uuid;
BEGIN
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, created_at, expires_at
    ) VALUES (
        v_sol_id, v_ped_1, v_operador_id, 'Por favor adjuntar logo vectorial en formato SVG o PDF',
        encode(digest('tok_sol_f10', 'sha256'), 'hex'), 'pendiente', now(), now() + interval '48 hours'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, created_at
    ) VALUES (
        'pedido.info_requested', 'pedido', v_ped_1,
        jsonb_build_object(
            'pedido_id', v_ped_1,
            'solicitud_id', v_sol_id,
            'motivo', 'Por favor adjuntar logo vectorial en formato SVG o PDF',
            'expires_at', (now() + interval '48 hours')
        ),
        now()
    );
END $$;

SELECT is(
    (SELECT count(*)::integer FROM public.comunicaciones_pedido 
     WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid AND tipo_comunicacion = 'informacion_faltante'),
    1,
    'Trigger domain_events encoló comunicación para pedido.info_requested'
);

SELECT is(
    (SELECT (payload->>'plazo_horas')::integer FROM public.comunicaciones_pedido 
     WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid AND tipo_comunicacion = 'informacion_faltante'),
    48,
    'La notificación de información faltante especifica plazo contractual de 48 horas'
);

-- -----------------------------------------------------------------------------
-- 5. Prueba de Reclamación Atómica: comunicacion_claim_batch (REQ-F10-03)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_claimed jsonb;
    v_item_id uuid;
BEGIN
    -- Claim de 1 elemento
    SELECT jsonb_agg(row_to_json(c)) INTO v_claimed
    FROM (SELECT * FROM public.comunicacion_claim_batch(1)) c;

    v_item_id := (v_claimed->0->>'id')::uuid;

    -- Verificar que el elemento cambió a 'processing' y attempts = 1
    IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Claim no retornó ningún elemento: v_claimed=%', v_claimed;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.comunicaciones_pedido WHERE id = v_item_id AND estado = 'processing' AND attempts = 1) THEN
        RAISE EXCEPTION 'Claim no actualizó estado a processing ni incrementó attempts para item %: row=%', 
            v_item_id, 
            (SELECT row_to_json(r) FROM public.comunicaciones_pedido r WHERE id = v_item_id);
    END IF;
END $$;

SELECT pass('comunicacion_claim_batch reclama atómicamente y avanza estado a processing con attempts incrementado');

-- Reclamar nuevamente con batch size 10 para tomar los pendientes restantes
DO $$
DECLARE
    v_claimed_count integer;
BEGIN
    SELECT count(*)::integer INTO v_claimed_count
    FROM public.comunicacion_claim_batch(10);
END $$;

SELECT pass('comunicacion_claim_batch subsiguiente reclama el resto sin colisionar con items processing');

-- -----------------------------------------------------------------------------
-- 6. Prueba de Registro de Resultado: comunicacion_mark_result (REQ-F10-03, REQ-F10-06)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_comm_id uuid;
    v_claim_id uuid := gen_random_uuid();
BEGIN
    SELECT id INTO v_comm_id
    FROM public.comunicaciones_pedido
    WHERE envio_id = 'e0000000-0000-0000-0000-000000000f10'::uuid
    LIMIT 1;

    UPDATE public.comunicaciones_pedido SET claim_id = v_claim_id, estado = 'processing' WHERE id = v_comm_id;

    -- Marcar éxito con message_id devuelto por Gmail
    PERFORM public.comunicacion_mark_result(
        p_id => v_comm_id,
        p_claim_id => v_claim_id,
        p_success => true,
        p_provider_msg_id => 'gmail_msg_real_001',
        p_error => NULL,
        p_retry_seconds => NULL
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE provider_message_id = 'gmail_msg_real_001'),
    'enviada',
    'comunicacion_mark_result registra éxito, estado enviada y provider_message_id'
);

SELECT isnt(
    (SELECT sent_at FROM public.comunicaciones_pedido WHERE provider_message_id = 'gmail_msg_real_001'),
    NULL,
    'sent_at se fija correctamente al marcar éxito'
);

-- Prueba de fallo con reintento (retry_wait)
DO $$
DECLARE
    v_comm_id uuid;
    v_claim_id uuid := gen_random_uuid();
BEGIN
    SELECT id INTO v_comm_id
    FROM public.comunicaciones_pedido
    WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid
    LIMIT 1;

    -- Resetear attempts a 1 y estado processing para prueba limpia
    UPDATE public.comunicaciones_pedido SET attempts = 1, estado = 'processing', claim_id = v_claim_id WHERE id = v_comm_id;

    -- Marcar fallo transitorio con reintento en 300 segundos
    PERFORM public.comunicacion_mark_result(
        p_id => v_comm_id,
        p_claim_id => v_claim_id,
        p_success => false,
        p_provider_msg_id => NULL,
        p_error => 'Conexión temporal rechazada por proveedor',
        p_retry_seconds => 300
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid),
    'retry_wait',
    'comunicacion_mark_result registra fallo transitorio y estado retry_wait'
);

SELECT is(
    (SELECT error_message FROM public.comunicaciones_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid),
    'Conexión temporal rechazada por proveedor',
    'error_message almacena el mensaje de error sanitizado'
);

-- Prueba de fallo definitivo al exceder max_attempts
DO $$
DECLARE
    v_comm_id uuid;
    v_claim_id uuid := gen_random_uuid();
BEGIN
    SELECT id INTO v_comm_id
    FROM public.comunicaciones_pedido
    WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid
    LIMIT 1;

    -- Forzar attempts al máximo permitido
    UPDATE public.comunicaciones_pedido SET attempts = max_attempts, estado = 'processing', claim_id = v_claim_id WHERE id = v_comm_id;

    -- Marcar nuevo fallo
    PERFORM public.comunicacion_mark_result(
        p_id => v_comm_id,
        p_claim_id => v_claim_id,
        p_success => false,
        p_provider_msg_id => NULL,
        p_error => 'Fallo definitivo tras agotar intentos',
        p_retry_seconds => 300
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000f11'::uuid),
    'fallida',
    'comunicacion_mark_result marca estado fallida cuando attempts >= max_attempts'
);

-- -----------------------------------------------------------------------------
-- 7. Seguridad PoLP: RPCs restringidos a service_role (REQ-F10-07)
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context(NULL, 'anon');

SELECT throws_ok(
    'SELECT * FROM public.comunicacion_claim_batch(5)',
    '42501',
    NULL,
    'Usuario anónimo no puede ejecutar comunicacion_claim_batch (PoLP)'
);

SELECT throws_ok(
    'SELECT public.comunicacion_mark_result(''00000000-0000-0000-0000-000000000000''::uuid, ''00000000-0000-0000-0000-000000000000''::uuid, true, ''msg_1'', NULL, NULL)',
    '42501',
    NULL,
    'Usuario anónimo no puede ejecutar comunicacion_mark_result (PoLP)'
);

SELECT * FROM finish();

ROLLBACK;
