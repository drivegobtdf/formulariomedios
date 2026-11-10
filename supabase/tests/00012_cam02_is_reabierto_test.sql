-- =============================================================================
-- Test Suite: CAM-02 Persistencia Histórica Canónica de Reapertura (PostgreSQL)
-- =============================================================================
BEGIN;

DO $$
DECLARE
    v_has_col boolean;
    v_col_default text;
    v_has_idx boolean;
    v_has_trg1 boolean;
    v_has_trg2 boolean;
    v_test_id uuid := gen_random_uuid();
    v_client_ref uuid := gen_random_uuid();
    v_is_reabierto boolean;
    v_reabierto_03 boolean;
    v_reabierto_20 boolean;
BEGIN
    -- 1. Verificar existencia de la columna is_reabierto y DEFAULT
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'is_reabierto' AND data_type = 'boolean'
    ) INTO v_has_col;
    IF NOT v_has_col THEN
        RAISE EXCEPTION 'TEST 1 FAILED: public.pedidos no tiene columna is_reabierto boolean';
    END IF;
    RAISE NOTICE 'Test 1 PASS: public.pedidos.is_reabierto existe con tipo boolean';

    SELECT column_default INTO v_col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'is_reabierto';
    IF v_col_default NOT LIKE '%false%' THEN
        RAISE EXCEPTION 'TEST 2 FAILED: is_reabierto no tiene DEFAULT false (obtenido: %)', v_col_default;
    END IF;
    RAISE NOTICE 'Test 2 PASS: is_reabierto tiene DEFAULT false';

    -- 2. Verificar existencia de índice
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedidos' AND indexname = 'idx_pedidos_is_reabierto'
    ) INTO v_has_idx;
    IF NOT v_has_idx THEN
        RAISE EXCEPTION 'TEST 3 FAILED: No existe índice idx_pedidos_is_reabierto';
    END IF;
    RAISE NOTICE 'Test 3 PASS: idx_pedidos_is_reabierto verificado';

    -- 3. Verificar triggers instalados
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_domain_events_sync_reabierto'
    ) INTO v_has_trg1;
    IF NOT v_has_trg1 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: No existe trigger trg_domain_events_sync_reabierto en domain_events';
    END IF;
    RAISE NOTICE 'Test 4 PASS: Trigger transaccional trg_domain_events_sync_reabierto verificado';

    SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pedidos_protect_reabierto'
    ) INTO v_has_trg2;
    IF NOT v_has_trg2 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: No existe trigger trg_pedidos_protect_reabierto en pedidos';
    END IF;
    RAISE NOTICE 'Test 5 PASS: Trigger de protección trg_pedidos_protect_reabierto verificado';

    -- 4. Prueba funcional de trigger transaccional
    INSERT INTO public.pedidos (
        id, pedido_visible, anio, numero, codigo_categoria, estado, form_schema_version, client_request_ref, origen, is_reabierto, titulo
    ) VALUES (
        v_test_id, 'PED-2026-X999902', 2026, 999902, 'D', 'Cancelado', 1, v_client_ref, 'interno', false, 'Test CAM-02 Transaccional'
    );

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload
    ) VALUES (
        'pedido.reopened', 'pedido', v_test_id, '{"motivo": "Reapertura de prueba"}'::jsonb
    );

    SELECT is_reabierto INTO v_is_reabierto FROM public.pedidos WHERE id = v_test_id;
    IF v_is_reabierto IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Trigger transaccional no actualizó is_reabierto a true tras pedido.reopened';
    END IF;
    RAISE NOTICE 'Test 6 PASS: Trigger transaccional actualizó is_reabierto = true automáticamente';

    -- 5. Prueba funcional de trigger de protección contra downgrade a false
    UPDATE public.pedidos SET is_reabierto = false WHERE id = v_test_id;
    SELECT is_reabierto INTO v_is_reabierto FROM public.pedidos WHERE id = v_test_id;
    IF v_is_reabierto IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Trigger de protección permitió degradar is_reabierto a false';
    END IF;
    RAISE NOTICE 'Test 7 PASS: Trigger de protección impidió revertir is_reabierto a false';

    -- 6. Transición por múltiples estados preservando is_reabierto = true
    UPDATE public.pedidos SET estado = 'En proceso' WHERE id = v_test_id;
    UPDATE public.pedidos SET estado = 'Cancelado' WHERE id = v_test_id;
    SELECT is_reabierto INTO v_is_reabierto FROM public.pedidos WHERE id = v_test_id;
    IF v_is_reabierto IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 8 FAILED: is_reabierto se perdió tras transicionar a Cancelado';
    END IF;
    RAISE NOTICE 'Test 8 PASS: is_reabierto persiste inmutable tras Cancelado -> Reabierto -> Cancelado';

    -- 7. Backfill de datos existentes
    SELECT is_reabierto INTO v_reabierto_03 FROM public.pedidos WHERE id = '33333333-3333-3333-3333-333333333333';
    IF v_reabierto_03 IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Backfill no marcó PED-2026-R000003 como reabierto';
    END IF;
    RAISE NOTICE 'Test 9 PASS: Backfill histórico de PED-2026-R000003 es TRUE';

    SELECT is_reabierto INTO v_reabierto_20 FROM public.pedidos WHERE id = 'ffffffff-0000-0000-0000-000000000020';
    IF v_reabierto_20 IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Backfill no marcó PED-2026-D000020 como reabierto';
    END IF;
    RAISE NOTICE 'Test 10 PASS: Backfill histórico de PED-2026-D000020 es TRUE';

    RAISE NOTICE '=== 10/10 PRUEBAS POSTGRESQL SUPERADAS EXITOSAMENTE ===';
END $$;

ROLLBACK;
