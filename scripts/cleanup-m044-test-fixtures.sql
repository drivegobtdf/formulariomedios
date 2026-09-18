-- ==============================================================================
-- SCRIPT DE MANTENIMIENTO: Limpieza Controlada de Fixtures de QA (Migration 044)
-- Archivo: scripts/cleanup-m044-test-fixtures.sql
-- NOTA: Script de mantenimiento exclusivo para limpieza de QA. NO ES UNA MIGRACIÓN.
-- ==============================================================================

DO $$
DECLARE
    v_target_peds uuid[] := ARRAY[
        'f8d5d946-8043-4b28-a3ac-4daa11f748e3'::uuid,
        'b96c30b4-279a-492d-ba76-368fcf5d5d17'::uuid,
        '4db371e1-5f16-4255-b026-c7f8b3bd4c98'::uuid,
        '21ed9b35-c08f-4f6c-a1f8-015d2a22da77'::uuid,
        '151436ad-8b36-4007-af9a-4a76daa18895'::uuid
    ];
    v_target_envios uuid[] := ARRAY[
        'e9f217df-e47f-49a8-8037-bec6d13a1ff4'::uuid,
        '7b555d99-25ca-46c3-994d-60c87af48e27'::uuid,
        'a9e28071-136e-4d2d-964a-29f7b7d0b3ae'::uuid,
        'cacbfd86-bfbd-4199-8e1a-b33d9c61a463'::uuid,
        'c2f748b0-f0e0-47d9-ac16-6feaddaa8258'::uuid,
        '9e5bc8fd-4ddc-4ebf-b8a1-0bb8b77ef36a'::uuid,
        '273ec434-6a6d-4953-82b6-00deddb695fa'::uuid,
        '64f913f5-33a5-43c3-946a-d34fbffa6677'::uuid
    ];
    v_deleted_comms integer;
    v_deleted_events integer;
    v_deleted_audit integer;
    v_deleted_solicitudes integer;
    v_deleted_peds integer;
    v_deleted_envios integer;
    
    v_count_ped_155 integer;
    v_estado_ped_155 text;
    v_version_ped_155 integer;
    
    v_check_peds integer;
    v_check_envios integer;
    v_check_comms integer;
    v_check_events integer;
BEGIN
    RAISE NOTICE 'Iniciando limpieza controlada de fixtures de prueba M044...';

    -- 1. Eliminar comunicaciones_pedido asociadas a los pedidos o envíos allowlisted
    WITH del_comms AS (
        DELETE FROM public.comunicaciones_pedido
        WHERE pedido_id = ANY(v_target_peds) OR envio_id = ANY(v_target_envios)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_comms FROM del_comms;
    RAISE NOTICE '1. comunicaciones_pedido eliminadas: %', v_deleted_comms;

    -- 2. Eliminar domain_events asociados
    WITH del_events AS (
        DELETE FROM public.domain_events
        WHERE aggregate_id = ANY(v_target_peds)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_events FROM del_events;
    RAISE NOTICE '2. domain_events eliminados: %', v_deleted_events;

    -- 3. Eliminar audit_log asociados
    WITH del_audit AS (
        DELETE FROM public.audit_log
        WHERE recurso_id = ANY(ARRAY[
            'f8d5d946-8043-4b28-a3ac-4daa11f748e3',
            'b96c30b4-279a-492d-ba76-368fcf5d5d17',
            '4db371e1-5f16-4255-b026-c7f8b3bd4c98',
            '21ed9b35-c08f-4f6c-a1f8-015d2a22da77',
            '151436ad-8b36-4007-af9a-4a76daa18895'
        ])
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_audit FROM del_audit;
    RAISE NOTICE '3. audit_log eliminados: %', v_deleted_audit;

    -- 4. Eliminar solicitudes_informacion asociadas
    WITH del_sol AS (
        DELETE FROM public.solicitudes_informacion
        WHERE pedido_id = ANY(v_target_peds)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_solicitudes FROM del_sol;
    RAISE NOTICE '4. solicitudes_informacion eliminadas: %', v_deleted_solicitudes;

    -- 5. Eliminar pedidos allowlisted
    WITH del_peds AS (
        DELETE FROM public.pedidos
        WHERE id = ANY(v_target_peds)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_peds FROM del_peds;
    RAISE NOTICE '5. pedidos eliminados: %', v_deleted_peds;

    -- 6. Eliminar envios_formulario allowlisted
    WITH del_envios AS (
        DELETE FROM public.envios_formulario
        WHERE id = ANY(v_target_envios)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_envios FROM del_envios;
    RAISE NOTICE '6. envios_formulario eliminados: %', v_deleted_envios;

    -- =========================================================================
    -- VALIDACIONES ESTRICTAS DE SEGURIDAD PRE-COMMIT
    -- =========================================================================

    -- A. Verificar 0 pedidos de la allowlist restantes
    SELECT count(*) INTO v_check_peds FROM public.pedidos WHERE id = ANY(v_target_peds);
    IF v_check_peds <> 0 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Aún quedan % pedidos allowlisted en base de datos', v_check_peds;
    END IF;

    -- B. Verificar 0 envíos de la allowlist restantes
    SELECT count(*) INTO v_check_envios FROM public.envios_formulario WHERE id = ANY(v_target_envios);
    IF v_check_envios <> 0 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Aún quedan % envíos allowlisted en base de datos', v_check_envios;
    END IF;

    -- C. Verificar 0 comunicaciones restantes
    SELECT count(*) INTO v_check_comms FROM public.comunicaciones_pedido 
    WHERE pedido_id = ANY(v_target_peds) OR envio_id = ANY(v_target_envios);
    IF v_check_comms <> 0 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Aún quedan % comunicaciones asociadas', v_check_comms;
    END IF;

    -- D. Verificar 0 domain events restantes
    SELECT count(*) INTO v_check_events FROM public.domain_events WHERE aggregate_id = ANY(v_target_peds);
    IF v_check_events <> 0 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Aún quedan % domain_events asociados', v_check_events;
    END IF;

    -- E. VALIDACIÓN DE ORO: PED-2026-D000155 intacto
    SELECT count(*), max(estado), max(version)
    INTO v_count_ped_155, v_estado_ped_155, v_version_ped_155
    FROM public.pedidos
    WHERE pedido_visible = 'PED-2026-D000155';

    IF v_count_ped_155 <> 1 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: PED-2026-D000155 no fue encontrado (conteo: %)', v_count_ped_155;
    END IF;

    IF v_estado_ped_155 <> 'Finalizado' THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: PED-2026-D000155 estado esperado Finalizado, actual: %', v_estado_ped_155;
    END IF;

    IF v_version_ped_155 <> 7 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: PED-2026-D000155 versión esperada 7, actual: %', v_version_ped_155;
    END IF;

    RAISE NOTICE '✓ Todas las validaciones de seguridad pasaron exitosamente. Limpieza comiteada.';
END $$;
