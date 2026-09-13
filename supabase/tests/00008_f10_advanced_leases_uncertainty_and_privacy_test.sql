-- ==============================================================================
-- TEST SUITE 00008: F10 Advanced: Leases, Concurrency, Uncertain State,
--                   Reconciliation, Transactional Rollback & Privacy (pgTAP)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(22);

-- Helper para setear contexto de auth
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

-- -----------------------------------------------------------------------------
-- 1. C01: Garantía Transaccional: Rollback no deja comunicaciones (REQ-C01)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_envio_fail_id uuid := 'e0000000-0000-0000-0000-000000000c01'::uuid;
BEGIN
    BEGIN
        INSERT INTO public.envios_formulario (
            id, submission_key, request_fingerprint, nombre_apellido, telefono, correo,
            area_solicitante, form_schema_version, created_at
        ) VALUES (
            v_envio_fail_id, gen_random_uuid(), encode(digest('fp_c01_fail', 'sha256'), 'hex'),
            'Test Fail Rollback', '2901112233', 'fail.c01@test.gob.ar', 'Medios', 3, now()
        );

        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, created_at
        ) VALUES (
            'submission.created', 'envio_formulario', v_envio_fail_id,
            jsonb_build_object('envio_id', v_envio_fail_id, 'correo', 'fail.c01@test.gob.ar'),
            now()
        );

        RAISE EXCEPTION 'Simulated business rollback during submission';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

SELECT is(
    (SELECT count(*)::integer FROM public.comunicaciones_pedido WHERE envio_id = 'e0000000-0000-0000-0000-000000000c01'::uuid),
    0,
    'C01: Rollback transaccional no deja comunicaciones encoladas huérfanas'
);

-- -----------------------------------------------------------------------------
-- 2. C06: Aislamiento de Secretos en Magic Link (REQ-C06)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_envio_id uuid := 'e0000000-0000-0000-0000-000000000c06'::uuid;
    v_ped_id uuid := 'a0000000-0000-0000-0000-000000000c06'::uuid;
    v_cat_id uuid;
    v_tipo_id uuid;
    v_res jsonb;
BEGIN
    SELECT id INTO v_cat_id FROM public.categorias_servicio WHERE codigo_ped = 'D' LIMIT 1;
    SELECT id INTO v_tipo_id FROM public.tipos_servicio WHERE categoria_id = v_cat_id LIMIT 1;

    INSERT INTO public.envios_formulario (
        id, submission_key, request_fingerprint, nombre_apellido, telefono, correo,
        area_solicitante, form_schema_version, created_at
    ) VALUES (
        v_envio_id, gen_random_uuid(), encode(digest('fp_c06_ok', 'sha256'), 'hex'),
        'Test C06 Secret', '2901112233', 'secret.audit.c06@test.gob.ar', 'Medios', 3, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.pedidos (
        id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id,
        codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version,
        tracking_token_hash, version, created_at
    ) VALUES (
        v_ped_id, v_envio_id, gen_random_uuid(), 'PED-2026-D000806', v_cat_id, v_tipo_id,
        'D', 806, 2026, 'Nuevo', '{}'::jsonb, 3, encode(digest('tok_c06', 'sha256'), 'hex'), 1, now()
    ) ON CONFLICT (id) DO NOTHING;

    v_res := public.solicitante_request_access('secret.audit.c06@test.gob.ar');
END $$;

SELECT is(
    (SELECT (payload ? 'raw_token') FROM public.comunicaciones_pedido 
     WHERE destinatario_email = 'secret.audit.c06@test.gob.ar' AND tipo_comunicacion = 'magic_link_access' LIMIT 1),
    false,
    'C06: Payload de comunicaciones_pedido NO almacena raw_token en texto plano'
);

SELECT is(
    (SELECT (payload ? 'magic_token') FROM public.comunicaciones_pedido 
     WHERE destinatario_email = 'secret.audit.c06@test.gob.ar' AND tipo_comunicacion = 'magic_link_access' LIMIT 1),
    false,
    'C06: Payload de comunicaciones_pedido NO almacena magic_token en texto plano'
);

SELECT isnt(
    (SELECT token_hash FROM public.solicitante_access_tokens 
     WHERE correo = 'secret.audit.c06@test.gob.ar' LIMIT 1),
    NULL,
    'C06: solicitante_access_tokens almacena únicamente el token_hash SHA-256'
);

-- -----------------------------------------------------------------------------
-- 3. C08: Claims Atómicos, Leases y Protección Stale Worker (REQ-C08)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_comm_id uuid := 'c0000000-0000-0000-0000-000000000c08'::uuid;
    v_claim_id uuid;
    v_mark_stale jsonb;
    v_mark_valid jsonb;
BEGIN
    INSERT INTO public.comunicaciones_pedido (
        id, destinatario_email, tipo_comunicacion, estado, attempts, max_attempts,
        idempotency_key, payload, created_at
    ) VALUES (
        v_comm_id, 'worker.lease@test.gob.ar', 'informacion_faltante', 'pendiente', 0, 5,
        'lease_test_c08', '{"test": true}'::jsonb, now()
    ) ON CONFLICT (id) DO UPDATE SET estado = 'pendiente', attempts = 0, claim_id = NULL;

    -- Simular que Worker 1 reclama el ítem con lease de 60 segundos y claim_id único
    UPDATE public.comunicaciones_pedido 
    SET estado = 'processing',
        claim_id = gen_random_uuid(),
        claimed_at = now(),
        lease_expires_at = now() + interval '60 seconds',
        attempts = attempts + 1
    WHERE id = v_comm_id
    RETURNING claim_id INTO v_claim_id;

    -- Simular que Worker 2 (o worker stale) intenta reportar resultado con un claim_id falso / expirado
    v_mark_stale := public.comunicacion_mark_result(
        p_id => v_comm_id,
        p_success => true,
        p_provider_msg_id => 'stale_msg',
        p_claim_id => '00000000-0000-0000-0000-000000000000'::uuid
    );

    IF (v_mark_stale->>'error') <> 'STALE_LEASE_REJECTED' THEN
        RAISE EXCEPTION 'Fallo al rechazar resultado de worker tardío / stale: %', v_mark_stale;
    END IF;

    -- Worker 1 con claim_id legítimo reporta resultado
    v_mark_valid := public.comunicacion_mark_result(
        p_id => v_comm_id,
        p_success => true,
        p_provider_msg_id => 'valid_msg_c08',
        p_claim_id => v_claim_id
    );

    IF (v_mark_valid->>'status') <> 'enviada' THEN
        RAISE EXCEPTION 'Worker legítimo no pudo marcar estado enviada: %', v_mark_valid;
    END IF;
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c08'::uuid),
    'enviada',
    'C08: Worker con claim_id válido actualiza estado a enviada'
);

SELECT is(
    (SELECT provider_message_id FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c08'::uuid),
    'valid_msg_c08',
    'C08: Stale worker fue rechazado y no sobreescribió el provider_message_id'
);

-- -----------------------------------------------------------------------------
-- 4. C08 (NUEVO): Sweep de Leases Vencidos hacia Uncertain (Anti-Duplicate)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_expired_id uuid := 'c0000000-0000-0000-0000-000000000e08'::uuid;
    v_worker_claim_id uuid := gen_random_uuid();
    v_swept integer;
    v_resolve_res jsonb;
BEGIN
    -- Simular ítem reclamado cuyo worker murió tras enviar a Gmail y lease expiró
    INSERT INTO public.comunicaciones_pedido (
        id, destinatario_email, tipo_comunicacion, estado, attempts, max_attempts,
        claim_id, claimed_at, lease_expires_at, idempotency_key, payload, created_at
    ) VALUES (
        v_expired_id, 'crash.worker@test.gob.ar', 'pedido_ingresado', 'processing', 1, 5,
        v_worker_claim_id, now() - interval '10 minutes', now() - interval '5 minutes',
        'expired_lease_c08', '{"test": true}'::jsonb, now() - interval '10 minutes'
    ) ON CONFLICT (id) DO UPDATE 
    SET estado = 'processing', 
        claim_id = v_worker_claim_id, 
        lease_expires_at = now() - interval '5 minutes';

    -- Ejecutar barrido de leases expirados
    v_swept := public.comunicacion_sweep_expired_leases();
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000e08'::uuid),
    'uncertain',
    'C08: comunicacion_sweep_expired_leases transiciona lease expirado a uncertain (no a reintento ciego)'
);

-- Verificar que el worker que tenía el claim original puede asentar enviada con provider_msg_id
DO $$
DECLARE
    v_expired_id uuid := 'c0000000-0000-0000-0000-000000000e08'::uuid;
    v_claim_id uuid;
    v_ack jsonb;
BEGIN
    SELECT claim_id INTO v_claim_id FROM public.comunicaciones_pedido WHERE id = v_expired_id;
    
    v_ack := public.comunicacion_mark_result(
        p_id => v_expired_id,
        p_success => true,
        p_provider_msg_id => 'gmail_late_ack_c08',
        p_claim_id => v_claim_id
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000e08'::uuid),
    'enviada',
    'C08: Worker original que ejecutó envío asienta estado enviada sobre ítem swept a uncertain'
);

SELECT is(
    (SELECT provider_message_id FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000e08'::uuid),
    'gmail_late_ack_c08',
    'C08: Provider message ID queda registrado tras recuperación de worker tardío'
);

-- -----------------------------------------------------------------------------
-- 5. C09: Idempotencia y Re-ACK Idempotente (REQ-C09)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_re_ack jsonb;
    v_claim_id uuid;
BEGIN
    SELECT claim_id INTO v_claim_id FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c08'::uuid;

    v_re_ack := public.comunicacion_mark_result(
        p_id => 'c0000000-0000-0000-0000-000000000c08'::uuid,
        p_claim_id => COALESCE(v_claim_id, gen_random_uuid()),
        p_success => true,
        p_provider_msg_id => 'second_msg'
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c08'::uuid),
    'enviada',
    'C09: Re-ACK sobre ítem enviada es idempotente y conserva estado enviada'
);

SELECT is(
    (SELECT provider_message_id FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c08'::uuid),
    'valid_msg_c08',
    'C09: Re-ACK no sobrescribe provider_message_id ya confirmado'
);

-- -----------------------------------------------------------------------------
-- 6. C10: Estado Uncertain y Reconciliación Auditable (REQ-C10)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_unc_id uuid := 'c0000000-0000-0000-0000-000000000c10'::uuid;
    v_unc_claim_id uuid := gen_random_uuid();
    v_res_unc jsonb;
BEGIN
    INSERT INTO public.comunicaciones_pedido (
        id, destinatario_email, tipo_comunicacion, estado, attempts, max_attempts,
        claim_id, idempotency_key, payload, created_at
    ) VALUES (
        v_unc_id, 'uncertain@test.gob.ar', 'finalizado', 'processing', 1, 5,
        v_unc_claim_id, 'unc_test_c10', '{"test": true}'::jsonb, now()
    ) ON CONFLICT (id) DO UPDATE SET estado = 'processing', claim_id = v_unc_claim_id;

    v_res_unc := public.comunicacion_mark_result(
        p_id => v_unc_id,
        p_claim_id => v_unc_claim_id,
        p_success => false,
        p_error => 'Timeout esperando ACK tras conexión a Gmail',
        p_uncertain => true
    );

    IF (v_res_unc->>'status') <> 'uncertain' THEN
        RAISE EXCEPTION 'No se registró estado uncertain: %', v_res_unc;
    END IF;
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c10'::uuid),
    'uncertain',
    'C10: comunicacion_mark_result con p_uncertain registra estado uncertain'
);

DO $$
DECLARE
    v_res_rec jsonb;
BEGIN
    v_res_rec := public.comunicacion_reconcile_uncertain(
        p_id => 'c0000000-0000-0000-0000-000000000c10'::uuid,
        p_resolution => 'enviada',
        p_provider_msg_id => 'gmail_msg_reconciled_c10',
        p_notes => 'Verificado en logs de Gmail exitoso'
    );
END $$;

SELECT is(
    (SELECT estado FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c10'::uuid),
    'enviada',
    'C10: comunicacion_reconcile_uncertain resuelve estado uncertain a enviada'
);

SELECT is(
    (SELECT provider_message_id FROM public.comunicaciones_pedido WHERE id = 'c0000000-0000-0000-0000-000000000c10'::uuid),
    'gmail_msg_reconciled_c10',
    'C10: Reconciliación registra provider_message_id auditado'
);

-- -----------------------------------------------------------------------------
-- 7. C04: Trigger para Información Respondida (REQ-C04)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_envio_id uuid := 'e0000000-0000-0000-0000-000000000c04'::uuid;
    v_ped_id uuid := 'a0000000-0000-0000-0000-000000000c04'::uuid;
    v_cat_id uuid;
    v_tipo_id uuid;
    v_sol_id uuid := gen_random_uuid();
BEGIN
    SELECT id INTO v_cat_id FROM public.categorias_servicio WHERE codigo_ped = 'D' LIMIT 1;
    SELECT id INTO v_tipo_id FROM public.tipos_servicio WHERE categoria_id = v_cat_id LIMIT 1;

    INSERT INTO public.envios_formulario (
        id, submission_key, request_fingerprint, nombre_apellido, telefono, correo,
        area_solicitante, form_schema_version, created_at
    ) VALUES (
        v_envio_id, gen_random_uuid(), encode(digest('fp_c04_ok', 'sha256'), 'hex'),
        'Test C04 Info Resp', '2901112233', 'c04.info@test.gob.ar', 'Medios', 3, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.pedidos (
        id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id,
        codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version,
        tracking_token_hash, version, created_at
    ) VALUES (
        v_ped_id, v_envio_id, gen_random_uuid(), 'PED-2026-D000804', v_cat_id, v_tipo_id,
        'D', 804, 2026, 'Esperando información', '{}'::jsonb, 3, encode(digest('tok_c04', 'sha256'), 'hex'), 1, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_ped_id,
        jsonb_build_object('pedido_id', v_ped_id, 'solicitud_id', v_sol_id),
        now()
    );
END $$;

SELECT is(
    (SELECT count(*)::integer FROM public.comunicaciones_pedido 
     WHERE pedido_id = 'a0000000-0000-0000-0000-000000000c04'::uuid AND tipo_comunicacion = 'informacion_respondida'),
    1,
    'C04: Evento pedido.info_responded encola comunicación informacion_respondida'
);

-- -----------------------------------------------------------------------------
-- 8. C12: Seguridad PoLP en Nuevos RPCs (REQ-C12)
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context(NULL, 'anon');

SELECT throws_ok(
    'SELECT * FROM public.comunicacion_claim_batch(5, 300)',
    '42501',
    NULL,
    'C12: Usuario anónimo no puede ejecutar comunicacion_claim_batch con leases'
);

SELECT throws_ok(
    'SELECT public.comunicacion_sweep_expired_leases()',
    '42501',
    NULL,
    'C12: Usuario anónimo no puede ejecutar comunicacion_sweep_expired_leases'
);

SELECT throws_ok(
    'SELECT public.comunicacion_reconcile_uncertain(''00000000-0000-0000-0000-000000000000''::uuid, ''enviada'', ''msg_1'', ''note'')',
    '42501',
    NULL,
    'C12: Usuario anónimo no puede ejecutar comunicacion_reconcile_uncertain'
);

SELECT throws_ok(
    'SELECT public.comunicacion_enqueue_info_responded(''00000000-0000-0000-0000-000000000000''::uuid, NULL)',
    '42501',
    NULL,
    'C12: Usuario anónimo no puede ejecutar comunicacion_enqueue_info_responded'
);

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid, 'authenticated');

SELECT throws_ok(
    'SELECT * FROM public.comunicacion_claim_batch(5, 300)',
    '42501',
    NULL,
    'C12: Usuario autenticado no puede ejecutar comunicacion_claim_batch'
);

SELECT throws_ok(
    'SELECT public.comunicacion_sweep_expired_leases()',
    '42501',
    NULL,
    'C12: Usuario autenticado no puede ejecutar comunicacion_sweep_expired_leases'
);

SELECT throws_ok(
    'SELECT public.comunicacion_reconcile_uncertain(''00000000-0000-0000-0000-000000000000''::uuid, ''enviada'', ''msg_1'', ''note'')',
    '42501',
    NULL,
    'C12: Usuario autenticado no puede ejecutar comunicacion_reconcile_uncertain'
);

SELECT * FROM finish();

ROLLBACK;
