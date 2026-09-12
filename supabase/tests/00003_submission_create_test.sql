-- ==============================================================================
-- DATABASE TESTS (pgTAP): F4 Submission Creation, Sequences & Idempotency Suite
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(40);

-- -----------------------------------------------------------------------------
-- 1. Tests de private.ped_calendar_year (Zona Horaria America/Argentina/Ushuaia) [Tests 1..4]
-- -----------------------------------------------------------------------------

-- Test 1: Último segundo del año 2026 en Ushuaia (UTC-3) -> 2026
SELECT is(
    private.ped_calendar_year('2026-12-31 23:59:59-03'::timestamptz),
    2026,
    '2026-12-31 23:59:59-03 debe corresponder al año 2026 en Ushuaia'
);

-- Test 2: Primer segundo del año 2027 en Ushuaia (UTC-3) -> 2027
SELECT is(
    private.ped_calendar_year('2027-01-01 00:00:00-03'::timestamptz),
    2027,
    '2027-01-01 00:00:00-03 debe corresponder al año 2027 en Ushuaia'
);

-- Test 3: 2027-01-01 02:59:59 UTC es 2026-12-31 23:59:59 en Ushuaia -> 2026
SELECT is(
    private.ped_calendar_year('2027-01-01 02:59:59+00'::timestamptz),
    2026,
    '2027-01-01 02:59:59 UTC aún debe corresponder al año 2026 en Ushuaia'
);

-- Test 4: 2027-01-01 03:00:00 UTC es 2027-01-01 00:00:00 en Ushuaia -> 2027
SELECT is(
    private.ped_calendar_year('2027-01-01 03:00:00+00'::timestamptz),
    2027,
    '2027-01-01 03:00:00 UTC debe corresponder al año 2027 en Ushuaia'
);

-- -----------------------------------------------------------------------------
-- 2. Tests de private.reserve_ped_numbers y agotamiento de secuencia [Tests 5..7]
-- -----------------------------------------------------------------------------

-- Test 5: Reservar números para un nuevo año inicia en 1
DO $$
DECLARE
    v_res record;
BEGIN
    SELECT * INTO v_res FROM private.reserve_ped_numbers(3, '2099-05-10 12:00:00-03'::timestamptz);
    IF v_res.year <> 2099 OR v_res.first_number <> 1 OR v_res.last_number <> 3 THEN
        RAISE EXCEPTION 'Reserva inicial incorrecta: %', v_res;
    END IF;
END;
$$;
SELECT pass('private.reserve_ped_numbers inicia en 1 para un año nuevo y reserva el rango solicitado');

-- Test 6: Siguiente reserva en el mismo año continúa consecutivamente
DO $$
DECLARE
    v_res record;
BEGIN
    SELECT * INTO v_res FROM private.reserve_ped_numbers(2, '2099-05-10 12:00:00-03'::timestamptz);
    IF v_res.year <> 2099 OR v_res.first_number <> 4 OR v_res.last_number <> 5 THEN
        RAISE EXCEPTION 'Reserva consecutiva incorrecta: %', v_res;
    END IF;
END;
$$;
SELECT pass('private.reserve_ped_numbers continúa la secuencia consecutiva sin saltos');

-- Test 7: Agotamiento de secuencia (> 999999) arroja excepción SEQUENCE_EXHAUSTED
DO $$
BEGIN
    UPDATE public.pedido_sequences SET current_value = 999999 WHERE anio = 2099;
END;
$$;
SELECT throws_ok(
    $$SELECT * FROM private.reserve_ped_numbers(1, '2099-05-10 12:00:00-03'::timestamptz)$$,
    '54000',
    NULL,
    'Superar el límite de 999999 pedidos anuales debe arrojar SEQUENCE_EXHAUSTED'
);

-- -----------------------------------------------------------------------------
-- 3. Tests de Fingerprint Canónico Determinista [Tests 8..9]
-- -----------------------------------------------------------------------------

-- Test 8: Fingerprint genera string hexadecimal de 64 caracteres
SELECT matches(
    private.compute_submission_fingerprint(
        '{"schema_version": 3, "contacto": {"nombre_apellido": "Juan", "telefono": "123", "correo": "j@t.gob.ar", "area_solicitante": "A"}, "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}]}'::jsonb
    ),
    '^[a-f0-9]{64}$',
    'compute_submission_fingerprint debe retornar un hash SHA-256 de 64 caracteres hex'
);

-- Test 9: Fingerprint es idéntico a pesar de orden de pedidos o campos
SELECT is(
    private.compute_submission_fingerprint(
        '{"schema_version": 3, "contacto": {"correo": "JUAN@TIERRADELFUEGO.GOB.AR ", "telefono": "123", "nombre_apellido": "Juan ", "area_solicitante": "A"}, "pedidos": [{"client_request_ref": "b0000000-0000-0000-0000-000000000002", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}, {"client_request_ref": "a0000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}]}'::jsonb
    ),
    private.compute_submission_fingerprint(
        '{"schema_version": 3, "contacto": {"nombre_apellido": "Juan", "telefono": "123", "correo": "juan@tierradelfuego.gob.ar", "area_solicitante": "A"}, "pedidos": [{"client_request_ref": "a0000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}, {"client_request_ref": "b0000000-0000-0000-0000-000000000002", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}]}'::jsonb
    ),
    'compute_submission_fingerprint debe ser canónico y determinista'
);

-- -----------------------------------------------------------------------------
-- 4. Tests de Validación de Payload en submission_create_core [Tests 10..18]
-- -----------------------------------------------------------------------------

-- Test 10: Rechazar payload no JSON object
SELECT throws_ok(
    $$SELECT public.submission_create_core('"no-un-objeto"'::jsonb)$$,
    '22023',
    NULL,
    'Debe rechazar payload que no sea un objeto JSON'
);

-- Test 11: Rechazar schema_version != 3
SELECT throws_ok(
    $$SELECT public.submission_create_core('{"schema_version": 2, "submission_key": "00000000-0000-0000-0000-000000000001"}'::jsonb)$$,
    '22023',
    NULL,
    'Debe rechazar schema_version distinto de 3'
);

-- Test 12: Rechazar contacto incompleto (correo inválido)
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "correo-invalido",
            "area_solicitante": "Prensa"
        },
        "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}]
    }'::jsonb)$$,
    '23514',
    NULL,
    'Debe rechazar contacto con correo inválido'
);

-- Test 13: Rechazar array de pedidos vacío
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": []
    }'::jsonb)$$,
    '22023',
    NULL,
    'Debe rechazar envío sin pedidos'
);

-- Test 14: Rechazar categoría inexistente
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "categoria_inexistente", "tipo_slug": "flyer_rrss"}]
    }'::jsonb)$$,
    'P0002',
    NULL,
    'Debe rechazar pedido con categoria_slug inexistente'
);

-- Test 15: Rechazar tipo de servicio que no pertenece a la categoría
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "cobertura_eventos", "tipo_slug": "flyer_rrss"}]
    }'::jsonb)$$,
    'P0002',
    NULL,
    'Debe rechazar tipo de servicio que no pertenece a la categoría indicada'
);

-- Test 16: Rechazar file_bindings no vacíos en F4
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}],
        "file_bindings": [{"file_id": "00000000-0000-0000-0000-000000000001"}]
    }'::jsonb)$$,
    '55000',
    NULL,
    'Debe arrojar FILE_NOT_VERIFIED si file_bindings contiene elementos en F4'
);

-- Test 17: Rechazar client_request_ref duplicado dentro del mismo envío
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": [
            {"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"},
            {"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}
        ]
    }'::jsonb)$$,
    '23505',
    NULL,
    'Debe rechazar client_request_ref duplicado en el mismo envío'
);

-- Test 18: Rechazar material_link con URL no HTTPS
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "00000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Carlos",
            "telefono": "123456",
            "correo": "carlos@tierradelfuego.gob.ar",
            "area_solicitante": "Prensa"
        },
        "pedidos": [{"client_request_ref": "00000000-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}],
        "material_links": [{"url": "http://inseguro.example.com"}]
    }'::jsonb)$$,
    '23514',
    NULL,
    'Debe rechazar enlaces de material que no sean HTTPS'
);

-- -----------------------------------------------------------------------------
-- 5. Tests de Creación Multi-PED Exitosa y Secuencia Global Única [Tests 19..28]
-- -----------------------------------------------------------------------------

-- Crear un envío multi-PED con 3 pedidos (Flyer 'D', Cobertura 'C', Gacetilla 'G') y enlaces
DO $$
DECLARE
    v_res jsonb;
    v_envio_id uuid;
    v_peds jsonb;
BEGIN
    v_res := public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "a1000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Laura Fernández",
            "telefono": "+542901444444",
            "correo": "laura.fernandez@tierradelfuego.gob.ar",
            "area_solicitante": "Secretaría de Cultura"
        },
        "pedidos": [
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss",
                "informacion_especifica": {"titulo": "Flyer Festival", "fecha_limite": "2026-10-15"}
            },
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000002",
                "categoria_slug": "cobertura_eventos",
                "tipo_slug": "cobertura_eventos",
                "informacion_especifica": {"lugar": "Centro Cultural"}
            },
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000003",
                "categoria_slug": "gacetilla",
                "tipo_slug": "gacetilla",
                "informacion_especifica": {"tema": "Lanzamiento oficial"}
            }
        ],
        "material_links": [
            {
                "url": "https://drive.google.com/drive/folders/test-multi-ped",
                "descripcion": "Fotos de prensa y logos",
                "targets": "all"
            }
        ]
    }'::jsonb);

    -- Guardar en tabla temporal para assertions siguientes
    CREATE TEMP TABLE t_submission_result AS SELECT v_res AS res;
END;
$$;

-- Test 19: Retorno contiene idempotent_replay = false
SELECT is(
    (SELECT res->>'idempotent_replay' FROM t_submission_result),
    'false',
    'Creación inicial debe retornar idempotent_replay = false'
);

-- Test 20: Retorno contiene exactamente 3 pedidos
SELECT is(
    (SELECT jsonb_array_length(res->'pedidos') FROM t_submission_result),
    3,
    'Creación multi-PED debe retornar exactamente 3 pedidos'
);

-- Test 21: Cada pedido en la respuesta contiene tracking_token de 64 hex y tracking_recovery_required = false
SELECT is(
    (SELECT count(*)::integer FROM (
        SELECT jsonb_array_elements(res->'pedidos') AS p FROM t_submission_result
    ) sub WHERE length(p->>'tracking_token') = 64 AND (p->>'tracking_recovery_required')::boolean = false),
    3,
    'Todos los pedidos en creación inicial deben incluir tracking_token de 64 caracteres hex y tracking_recovery_required = false'
);

-- Test 22: Envíos_formulario contiene 1 fila para este submission_key con fingerprint de 64 hex
SELECT is(
    (SELECT count(*)::integer FROM public.envios_formulario WHERE submission_key = 'a1000000-0000-0000-0000-000000000001' AND length(request_fingerprint) = 64),
    1,
    'public.envios_formulario debe contener exactamente 1 fila con fingerprint SHA-256 válido'
);

-- Test 23: Pedidos en base de datos tienen códigos contractuales correspondientes (D, C, G)
SELECT set_eq(
    $$SELECT codigo_categoria FROM public.pedidos WHERE envio_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result)$$,
    ARRAY['D', 'C', 'G']::char(1)[],
    'Los 3 pedidos deben tener los códigos de categoría D, C y G'
);

-- Test 24: La numeración de los 3 pedidos es estrictamente consecutiva (Secuencia Global Única)
SELECT is(
    (SELECT (max(numero) - min(numero) + 1)::integer FROM public.pedidos WHERE envio_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result)),
    3,
    'Los números asignados a través de distintas categorías deben ser estrictamente continuos dentro de la secuencia global'
);

-- Test 25: Los 3 pedidos se inicializan en estado 'Nuevo' y version = 1
SELECT is(
    (SELECT count(*)::integer FROM public.pedidos WHERE envio_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result) AND estado = 'Nuevo' AND version = 1),
    3,
    'Todos los pedidos creados deben tener estado "Nuevo" y versión 1'
);

-- Test 26: La fecha límite del pedido 1 se proyectó correctamente en la columna fecha_limite
SELECT is(
    (SELECT fecha_limite FROM public.pedidos WHERE client_request_ref = 'f1000000-0000-0000-0000-000000000001'),
    '2026-10-15'::date,
    'fecha_limite debe proyectarse desde informacion_especifica a la columna dedicada'
);

-- Test 27: Enlace de material con targets "all" está asociado a los 3 pedidos
SELECT is(
    (SELECT count(*)::integer FROM public.enlace_pedido ep JOIN public.enlaces_material em ON em.id = ep.enlace_id WHERE em.envio_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result)),
    3,
    'El enlace de material con target "all" debe asociarse a los 3 pedidos'
);

-- Test 28: Reusar client_request_ref en un envío DISTINTO está permitido
SELECT lives_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "a1000000-0000-0000-0000-000000000002",
        "contacto": {
            "nombre_apellido": "Pedro Gómez",
            "telefono": "+542901555555",
            "correo": "pedro@tierradelfuego.gob.ar",
            "area_solicitante": "Protocolo"
        },
        "pedidos": [
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss"
            }
        ]
    }'::jsonb)$$,
    'client_request_ref puede repetirse en envíos distintos (unicidad es por par envio_id, client_request_ref)'
);

-- -----------------------------------------------------------------------------
-- 6. Tests de Idempotencia: Replay y Conflicto [Tests 29..32]
-- -----------------------------------------------------------------------------

-- Test 29: Idempotent Replay con exactamente el mismo submission_key y mismo contenido
DO $$
DECLARE
    v_replay jsonb;
BEGIN
    v_replay := public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "a1000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Laura Fernández",
            "telefono": "+542901444444",
            "correo": "laura.fernandez@tierradelfuego.gob.ar",
            "area_solicitante": "Secretaría de Cultura"
        },
        "pedidos": [
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss",
                "informacion_especifica": {"titulo": "Flyer Festival", "fecha_limite": "2026-10-15"}
            },
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000002",
                "categoria_slug": "cobertura_eventos",
                "tipo_slug": "cobertura_eventos",
                "informacion_especifica": {"lugar": "Centro Cultural"}
            },
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000003",
                "categoria_slug": "gacetilla",
                "tipo_slug": "gacetilla",
                "informacion_especifica": {"tema": "Lanzamiento oficial"}
            }
        ],
        "material_links": [
            {
                "url": "https://drive.google.com/drive/folders/test-multi-ped",
                "descripcion": "Fotos de prensa y logos",
                "targets": "all"
            }
        ]
    }'::jsonb);

    CREATE TEMP TABLE t_replay_result AS SELECT v_replay AS res;
END;
$$;

SELECT is(
    (SELECT res->>'idempotent_replay' FROM t_replay_result),
    'true',
    'Replay idempotente debe retornar idempotent_replay = true'
);

-- Test 30: En Replay, tracking_token es NULL y tracking_recovery_required es true para todos los pedidos
SELECT is(
    (SELECT count(*)::integer FROM (
        SELECT jsonb_array_elements(res->'pedidos') AS p FROM t_replay_result
    ) sub WHERE p->>'tracking_token' IS NULL AND (p->>'tracking_recovery_required')::boolean = true),
    3,
    'En replay idempotente, tracking_token debe ser NULL y tracking_recovery_required = true'
);

-- Test 31: En Replay, la lista de pedido_visible es idéntica a la original
SELECT is(
    (SELECT jsonb_agg(p->>'pedido_visible' ORDER BY p->>'pedido_visible') FROM (SELECT jsonb_array_elements(res->'pedidos') AS p FROM t_replay_result) s1),
    (SELECT jsonb_agg(p->>'pedido_visible' ORDER BY p->>'pedido_visible') FROM (SELECT jsonb_array_elements(res->'pedidos') AS p FROM t_submission_result) s2),
    'En replay idempotente, la lista de pedido_visible debe coincidir exactamente con la original'
);

-- Test 32: Mismo submission_key con payload modificado -> arroja IDEMPOTENCY_CONFLICT
SELECT throws_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "a1000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Laura Fernández MODIFICADA",
            "telefono": "+542901444444",
            "correo": "laura.fernandez@tierradelfuego.gob.ar",
            "area_solicitante": "Secretaría de Cultura"
        },
        "pedidos": [
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss"
            }
        ]
    }'::jsonb)$$,
    '40001',
    NULL,
    'Reutilizar submission_key con contenido diferente debe arrojar IDEMPOTENCY_CONFLICT'
);

-- -----------------------------------------------------------------------------
-- 7. Tests de Seguridad de Tokens y Almacenamiento Criptográfico [Tests 33..35]
-- -----------------------------------------------------------------------------

-- Test 33: La base de datos almacena el hash SHA-256 de 64 caracteres en tracking_token_hash
SELECT is(
    (SELECT count(*)::integer FROM public.pedidos WHERE envio_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result) AND length(tracking_token_hash) = 64 AND tracking_token_hash ~ '^[a-f0-9]{64}$'),
    3,
    'public.pedidos.tracking_token_hash debe contener el hash SHA-256 hex de 64 caracteres'
);

-- Test 34: El token crudo no existe en domain_events ni audit_log
SELECT is(
    (SELECT count(*)::integer FROM public.domain_events WHERE aggregate_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result) AND payload::text LIKE '%tracking_token%'),
    0,
    'domain_events no debe contener tracking tokens crudos'
);

-- Test 35: audit_log no contiene tracking tokens crudos
SELECT is(
    (SELECT count(*)::integer FROM public.audit_log WHERE recurso_id = (SELECT res->>'envio_id' FROM t_submission_result) AND metadata::text LIKE '%tracking_token%'),
    0,
    'audit_log no debe contener tracking tokens crudos'
);

-- -----------------------------------------------------------------------------
-- 8. Tests de Eventos de Dominio y Audit Log [Tests 36..37]
-- -----------------------------------------------------------------------------

-- Test 36: Se registra exactamente 1 evento submission.created por envío
SELECT is(
    (SELECT count(*)::integer FROM public.domain_events WHERE aggregate_id = (SELECT (res->>'envio_id')::uuid FROM t_submission_result) AND event_name = 'submission.created'),
    1,
    'Debe registrarse exactamente 1 evento submission.created para el envío completo'
);

-- Test 37: Se registra exactamente 1 registro en audit_log
SELECT is(
    (SELECT count(*)::integer FROM public.audit_log WHERE recurso_id = (SELECT res->>'envio_id' FROM t_submission_result) AND accion = 'submission.created'),
    1,
    'Debe registrarse exactamente 1 fila en audit_log para el envío'
);

-- -----------------------------------------------------------------------------
-- 9. Tests de Permisos y Roles de Ejecución (Security Matrix) [Tests 38..40]
-- -----------------------------------------------------------------------------

-- Helper para setear auth context
CREATE OR REPLACE FUNCTION pg_temp.set_auth_context(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', p_role, true);
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
END;
$$;

-- Test 38: anon no tiene permiso EXECUTE en submission_create_core (DENY)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000000'::uuid, 'anon');
SELECT throws_ok(
    $$SELECT public.submission_create_core('{"schema_version": 3}'::jsonb)$$,
    '42501',
    NULL,
    'Rol anon no debe tener permiso de ejecución sobre submission_create_core'
);

-- Test 39: authenticated no tiene permiso EXECUTE en submission_create_core (DENY)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid, 'authenticated');
SELECT throws_ok(
    $$SELECT public.submission_create_core('{"schema_version": 3}'::jsonb)$$,
    '42501',
    NULL,
    'Rol authenticated no debe tener permiso de ejecución sobre submission_create_core'
);

-- Test 40: service_role sí tiene permiso EXECUTE (ALLOW)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000000'::uuid, 'service_role');
SELECT lives_ok(
    $$SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "a1000000-0000-0000-0000-000000000099",
        "contacto": {
            "nombre_apellido": "Service Role Solicitud",
            "telefono": "123456",
            "correo": "service@tierradelfuego.gob.ar",
            "area_solicitante": "Sistemas"
        },
        "pedidos": [
            {
                "client_request_ref": "f1000000-0000-0000-0000-000000000099",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss"
            }
        ]
    }'::jsonb)$$,
    'Rol service_role debe tener permiso de ejecución sobre submission_create_core'
);

SELECT * FROM finish();

ROLLBACK;
