-- ==============================================================================
-- TEST SUITE 00005: F7 (Public Tracking & 48h Info Requests) & F8 (Management RPCs)
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(57);

-- -----------------------------------------------------------------------------
-- 0. Fixtures de Autenticación y Contexto
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

-- IDs de usuarios sintéticos creados en seed / fixtures
-- Admin:      00000000-0000-0000-0000-000000000101
-- Equipo:     00000000-0000-0000-0000-000000000102
-- Observador: 00000000-0000-0000-0000-000000000103
-- Pendiente:  00000000-0000-0000-0000-000000000104

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000101', 'admin.f7f8@example.invalid'),
    ('00000000-0000-0000-0000-000000000102', 'equipo.f7f8@example.invalid'),
    ('00000000-0000-0000-0000-000000000103', 'observador.f7f8@example.invalid'),
    ('00000000-0000-0000-0000-000000000104', 'pendiente.f7f8@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role) VALUES
    ('00000000-0000-0000-0000-000000000101', 'Admin', 'F7F8', 'admin.f7f8', 'aprobado', 'administrador'),
    ('00000000-0000-0000-0000-000000000102', 'Equipo', 'F7F8', 'equipo.f7f8', 'aprobado', 'equipo'),
    ('00000000-0000-0000-0000-000000000103', 'Observador', 'F7F8', 'observador.f7f8', 'aprobado', 'observador'),
    ('00000000-0000-0000-0000-000000000104', 'Pendiente', 'F7F8', 'pendiente.f7f8', 'pendiente', 'observador')
ON CONFLICT (user_id) DO UPDATE SET
    estado_acceso = EXCLUDED.estado_acceso,
    app_role = EXCLUDED.app_role;

-- Preparar fixtures de Pedido de prueba
INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
) VALUES (
    'e0000000-0000-0000-0000-000000000777',
    'b0000000-0000-0000-0000-000000000777',
    encode(digest('fingerprint_test_f7_f8_123', 'sha256'), 'hex'),
    'Juan Solicitante F7',
    '+54 2901 445566',
    'solicitante.f7@tdf.gob.ar',
    'Secretaría General',
    3
) ON CONFLICT (id) DO NOTHING;

DELETE FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000777' OR (anio = 2026 AND numero = 777);

-- Crear Pedido base de prueba
INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
    estado, informacion_especifica, form_schema_version, version, tracking_token_version,
    tracking_token_hash, tracking_token_created_at
) VALUES (
    'a0000000-0000-0000-0000-000000000777',
    'e0000000-0000-0000-0000-000000000777',
    'c0000000-0000-0000-0000-000000000777',
    'PED-2026-D000777',
    2026,
    777,
    'a0000001-0000-0000-0000-000000000001', -- Diseño Gráfico
    'b0000001-0000-0000-0000-000000000001', -- Flyer RRSS
    'D',
    'Nuevo',
    '{"titulo": "Flyer de Campaña de Vacunación", "publico_objetivo": "Comunidad"}'::jsonb,
    3,
    1,
    1,
    encode(digest('raw_super_secret_tracking_token_777', 'sha256'), 'hex'),
    now()
) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. F8: Asignación de Responsable (pedido_assign) [Tests 1..6]
-- -----------------------------------------------------------------------------

-- Test 1: Observador intenta asignar -> REJECTED (42501)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok(
    $$SELECT public.pedido_assign('a0000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000102', 1)$$,
    '42501',
    NULL,
    'Observador no debe tener permiso para asignar pedidos'
);

-- Test 2: Asignación a usuario no elegible (Observador) -> REJECTED (42200)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid); -- Admin
SELECT throws_ok(
    $$SELECT public.pedido_assign('a0000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000103', 1)$$,
    '42200',
    NULL,
    'No se debe permitir asignar un pedido a un usuario con rol observador'
);

-- Test 3: Asignación con versión incorrecta (concurrencia / conflicto) -> REJECTED (40001)
SELECT throws_ok(
    $$SELECT public.pedido_assign('a0000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000102', 99)$$,
    '40001',
    NULL,
    'Versión esperada incorrecta debe generar conflicto de concurrencia (VERSION_CONFLICT)'
);

-- Test 4: Administrador asigna a miembro de Equipo válido -> SUCCESS (versión pasa a 2)
SELECT results_eq(
    $$SELECT (public.pedido_assign('a0000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000102', 1)->>'version')::integer$$,
    ARRAY[2],
    'Admin asigna pedido exitosamente e incrementa version a 2'
);

-- Test 5: Comprobar que pedido_asignaciones tiene registro
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.pedido_asignaciones WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[1],
    'Debe existir 1 registro de asignación en pedido_asignaciones'
);

-- Test 6: Comprobar que domain_events tiene evento pedido.assigned
RESET ROLE;
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.domain_events WHERE event_name = 'pedido.assigned' AND aggregate_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[1],
    'Debe registrarse evento durable pedido.assigned'
);

-- -----------------------------------------------------------------------------
-- 2. F8: Transiciones de Estados (pedido_change_state) [Tests 7..14]
-- -----------------------------------------------------------------------------

-- Test 7: Transición inválida directa (nuevo -> en_proceso sin pasar por en_revision) -> REJECTED
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok(
    $$SELECT public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'En proceso', 2)$$,
    '42200',
    NULL,
    'Transición inválida directo a en_proceso debe ser rechazada'
);

-- Test 8: Transición válida: nuevo -> en_revision (tiene responsable y version 2) -> SUCCESS
SELECT results_eq(
    $$SELECT (public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'En revisión', 2)->>'estado')::text$$,
    ARRAY['En revisión'],
    'Transición a En revisión exitosa'
);

-- Test 9: Transición válida: en_revision -> en_proceso (version 3) -> SUCCESS
SELECT results_eq(
    $$SELECT (public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'En proceso', 3)->>'estado')::text$$,
    ARRAY['En proceso'],
    'Transición a En proceso exitosa'
);

-- Test 10: Transición válida: en_proceso -> esperando_informacion (version 4) -> SUCCESS
SELECT results_eq(
    $$SELECT (public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'Esperando información', 4)->>'estado')::text$$,
    ARRAY['Esperando información'],
    'Transición a Esperando información exitosa'
);

-- Test 11: Transición válida: esperando_informacion -> en_proceso (version 5) -> SUCCESS
SELECT results_eq(
    $$SELECT (public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'En proceso', 5)->>'estado')::text$$,
    ARRAY['En proceso'],
    'Transición de retorno a En proceso exitosa'
);

-- Test 12: Intentar finalizar mediante pedido_change_state genérico -> REJECTED (USE_PEDIDO_FINALIZE)
SELECT throws_ok(
    $$SELECT public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'Finalizado', 6)$$,
    '42200',
    NULL,
    'No se debe permitir finalizar mediante change_state genérico; debe usarse pedido_finalize'
);

-- Test 13: Cancelar con motivo obligatorio -> SUCCESS (estado = cancelado, version 7)
SELECT results_eq(
    $$SELECT (public.pedido_cancel('a0000000-0000-0000-0000-000000000777', 6, 'Solicitud duplicada por error')::jsonb->>'estado')::text$$,
    ARRAY['Cancelado'],
    'Cancelación con motivo obligatorio exitosa'
);

-- Test 14: Reabrir pedido cancelado -> SUCCESS (estado pasa a en_revision con responsable)
SELECT results_eq(
    $$SELECT (public.pedido_reopen('a0000000-0000-0000-0000-000000000777', 7, 'Reapertura autorizada por jefatura', '00000000-0000-0000-0000-000000000102')::jsonb->>'estado')::text$$,
    ARRAY['En revisión'],
    'Reapertura de pedido cancelado exitosa'
);

-- -----------------------------------------------------------------------------
-- 3. F8: Finalización con Entrega y Archivado Reversible [Tests 15..20]
-- -----------------------------------------------------------------------------

-- Pasar a En proceso (version 8 -> 9)
SELECT public.pedido_change_state('a0000000-0000-0000-0000-000000000777', 'En proceso', 8);

-- Test 15: Finalizar sin entrega (sin archivo y sin URL) -> REJECTED (DELIVERY_REQUIRED)
SELECT throws_ok(
    $$SELECT public.pedido_finalize('a0000000-0000-0000-0000-000000000777', 9, NULL, '', 'Nota sin entrega')$$,
    '42200',
    NULL,
    'Finalización sin archivos ni URL de entrega debe ser rechazada'
);

-- Test 16: Finalizar con URL de entrega válida -> SUCCESS (estado = finalizado, version 10)
SELECT results_eq(
    $$SELECT (public.pedido_finalize('a0000000-0000-0000-0000-000000000777', 9, NULL, 'https://drive.google.com/drive/folders/test_entrega_777', 'Pieza final disponible en Drive')->>'estado')::text$$,
    ARRAY['Finalizado'],
    'Finalización con entrega URL exitosa'
);

-- Test 17: Comprobar registro en entregas_pedido
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.entregas_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777' AND es_vigente = true$$,
    ARRAY[1],
    'Debe existir 1 entrega activa en entregas_pedido'
);

-- Test 18: Un pedido finalizado no puede cancelarse -> REJECTED
SELECT throws_ok(
    $$SELECT public.pedido_cancel('a0000000-0000-0000-0000-000000000777', 10, 'Intento de cancelar finalizado')$$,
    '42200',
    NULL,
    'Un pedido finalizado es terminal y no puede cancelarse'
);

-- Test 19: Archivar pedido finalizado -> SUCCESS (archivado = true)
SELECT results_eq(
    $$SELECT (public.pedido_archive('a0000000-0000-0000-0000-000000000777', 10)->>'archivado')::boolean$$,
    ARRAY[true],
    'Archivado de pedido finalizado exitoso'
);

-- Test 20: Restaurar pedido archivado -> SUCCESS (archivado = false)
SELECT results_eq(
    $$SELECT (public.pedido_restore('a0000000-0000-0000-0000-000000000777', 11)->>'archivado')::boolean$$,
    ARRAY[false],
    'Restauración de pedido archivado exitosa'
);

-- -----------------------------------------------------------------------------
-- 4. F8: Notas Internas y de Solicitante [Tests 21..24]
-- -----------------------------------------------------------------------------

-- Test 21: Observador intenta agregar nota -> REJECTED (42501)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok(
    $$SELECT public.nota_pedido_create('a0000000-0000-0000-0000-000000000777', 'Nota de observador', 'interna')$$,
    '42501',
    NULL,
    'Observador no debe poder crear notas'
);

-- Test 22: Equipo agrega nota interna -> SUCCESS
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT results_eq(
    $$SELECT (public.nota_pedido_create('a0000000-0000-0000-0000-000000000777', 'Nota interna: revisando paleta de colores', 'interna')->>'success')::boolean$$,
    ARRAY[true],
    'Equipo puede crear notas internas'
);

-- Test 23: Equipo agrega nota para el solicitante -> SUCCESS
SELECT results_eq(
    $$SELECT (public.nota_pedido_create('a0000000-0000-0000-0000-000000000777', 'Aviso al solicitante: flyer en etapa final', 'solicitante')->>'success')::boolean$$,
    ARRAY[true],
    'Equipo puede crear notas para el solicitante'
);

-- Test 24: Observador solo ve nota de solicitante (1 fila), NO la interna
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.notas_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[1],
    'Observador solo ve notas con visibilidad solicitante (filtro RLS efectivo)'
);

-- -----------------------------------------------------------------------------
-- 5. F7: Solicitudes de Información (Vigencia 48 Horas Corridas) [Tests 25..35]
-- -----------------------------------------------------------------------------

-- Test 25: Crear solicitud de información con 48 horas de vigencia -> SUCCESS
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
CREATE TEMP TABLE t_info_req AS
SELECT public.info_request_create(
    'a0000000-0000-0000-0000-000000000777',
    'Por favor enviar el logo vectorial en SVG o AI con fondo transparente.'
) AS res;
GRANT ALL ON t_info_req TO service_role, authenticated, anon, PUBLIC;

SELECT results_eq(
    $$SELECT (res->>'success')::boolean FROM t_info_req$$,
    ARRAY[true],
    'info_request_create debe retornar success = true'
);

-- Test 26: La vigencia exacta es 48 horas corridas (now + 48h +/- 5 segundos)
SELECT results_eq(
    $$SELECT ((res->>'expires_at')::timestamptz > now() + interval '47 hours 59 minutes' AND (res->>'expires_at')::timestamptz <= now() + interval '48 hours 1 minute') FROM t_info_req$$,
    ARRAY[true],
    'La vigencia de la solicitud debe ser exactamente 48 horas corridas (Regla aprobada)'
);

-- Test 27: La creación de solicitud NO muta el estado del pedido
SELECT results_eq(
    $$SELECT estado FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY['Finalizado'],
    'Crear solicitud de información no debe alterar el estado del pedido'
);

-- Test 28: Solicitud almacena token_hash de 64 caracteres en base de datos
SELECT results_eq(
    $$SELECT length(token_hash) FROM public.solicitudes_informacion WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[64],
    'solicitudes_informacion debe almacenar el hash SHA-256 de 64 hex'
);

-- Test 29: Responder solicitud válida dentro de las 48h -> SUCCESS
RESET ROLE;
SET ROLE service_role;

CREATE TEMP TABLE t_info_resp AS
SELECT public.info_response_submit_core(
    encode(digest((SELECT res->>'raw_token' FROM t_info_req), 'sha256'), 'hex'),
    'Adjunto el enlace con los logos vectoriales requeridos.',
    NULL,
    ARRAY['https://drive.google.com/drive/folders/logos_vectoriales_777']
) AS res;
GRANT ALL ON t_info_resp TO service_role, authenticated, anon, PUBLIC;

SELECT results_eq(
    $$SELECT (res->>'success')::boolean FROM t_info_resp$$,
    ARRAY[true],
    'info_response_submit_core debe responder con éxito dentro de las 48h'
);

-- Test 30: Solicitud queda en estado 'respondida' con fecha y texto
SELECT results_eq(
    $$SELECT estado FROM public.solicitudes_informacion WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY['respondida'],
    'solicitud de información debe quedar en estado respondida'
);

-- Test 31: Enlace aportado queda registrado en enlaces_material y enlace_pedido
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.enlace_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[1],
    'El enlace aportado en la respuesta debe asociarse al pedido en enlace_pedido'
);

-- Test 32: Reintento idempotente de respuesta ya aceptada -> SUCCESS idempotente
SELECT results_eq(
    $$SELECT (public.info_response_submit_core(
        encode(digest((SELECT res->>'raw_token' FROM t_info_req), 'sha256'), 'hex'),
        'Reintento de respuesta'
    )->>'idempotent')::boolean$$,
    ARRAY[true],
    'Reenvío de respuesta aceptada debe retornar resultado idempotente'
);

-- Test 33: Crear segunda solicitud para simular vencimiento de 48h
RESET ROLE;
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
CREATE TEMP TABLE t_info_expired AS
SELECT public.info_request_create(
    'a0000000-0000-0000-0000-000000000777',
    'Por favor enviar especificaciones de medidas para impresión.'
) AS res;
GRANT ALL ON t_info_expired TO service_role, authenticated, anon, PUBLIC;

-- Simular el paso del tiempo de 48 horas (expires_at = now() - 1 segundo)
RESET ROLE;
UPDATE public.solicitudes_informacion
SET expires_at = now() - interval '1 second'
WHERE id = (SELECT (res->>'solicitud_id')::uuid FROM t_info_expired);

-- Test 34: Intento de respuesta a solicitud con 48h vencidas -> REJECTED (42201 / TOKEN_EXPIRED)
SET ROLE service_role;
SELECT throws_ok(
    $$SELECT public.info_response_submit_core(
        encode(digest((SELECT res->>'raw_token' FROM t_info_expired), 'sha256'), 'hex'),
        'Respuesta tardía fuera de las 48h'
    )$$,
    '42201',
    NULL,
    'Respuesta a solicitud vencida (>48h) debe ser rechazada con TOKEN_EXPIRED'
);

-- Test 35: Comprobar que la solicitud registra fecha de expiración superada
SELECT results_eq(
    $$SELECT (now() >= expires_at) FROM public.solicitudes_informacion WHERE id = (SELECT (res->>'solicitud_id')::uuid FROM t_info_expired)$$,
    ARRAY[true],
    'La solicitud vencida debe registrar fecha de expiración superada (now >= expires_at)'
);

-- -----------------------------------------------------------------------------
-- 6. F7: Seguimiento Público Seguro (tracking_get_core & recovery) [Tests 36..45]
-- -----------------------------------------------------------------------------

-- Test 36: Consulta con token válido -> Retorna DTO público completo
CREATE TEMP TABLE t_tracking_dto AS
SELECT public.tracking_get_core(
    'PED-2026-D000777',
    encode(digest('raw_super_secret_tracking_token_777', 'sha256'), 'hex')
) AS dto;

SELECT isnt_empty(
    $$SELECT dto FROM t_tracking_dto WHERE dto IS NOT NULL$$,
    'tracking_get_core debe retornar DTO para credencial válida'
);

-- Test 37: DTO público contiene código visible, categoría y tipo
SELECT results_eq(
    $$SELECT (dto->>'pedido_visible')::text FROM t_tracking_dto$$,
    ARRAY['PED-2026-D000777'],
    'DTO público debe incluir pedido_visible exacto'
);

-- Test 38: DTO público contiene información de entregas
SELECT results_eq(
    $$SELECT (dto->'entrega'->>'url_entrega')::text FROM t_tracking_dto$$,
    ARRAY['https://drive.google.com/drive/folders/test_entrega_777'],
    'DTO público debe incluir la entrega pública'
);

-- Test 39: DTO público contiene solicitudes de información (2 solicitudes registradas)
SELECT results_eq(
    $$SELECT jsonb_array_length(dto->'solicitudes_informacion') FROM t_tracking_dto$$,
    ARRAY[2],
    'DTO público debe listar las solicitudes de información del pedido'
);

-- Test 40: DTO público contiene nota para el solicitante, pero NO la nota interna
SELECT results_eq(
    $$SELECT jsonb_array_length(dto->'comunicaciones') FROM t_tracking_dto$$,
    ARRAY[1],
    'DTO público solo debe incluir notas marcadas para el solicitante'
);

SELECT results_eq(
    $$SELECT (dto->'comunicaciones'->0->>'mensaje')::text FROM t_tracking_dto$$,
    ARRAY['Aviso al solicitante: flyer en etapa final'],
    'Mensaje en comunicaciones públicas debe ser el de cara al solicitante'
);

-- Test 41: DTO público NO contiene campos internos sensibles (responsable_id, emails internos)
SELECT results_eq(
    $$SELECT (dto ? 'responsable_id' OR dto ? 'solicitada_por' OR dto ? 'notas_internas') FROM t_tracking_dto$$,
    ARRAY[false],
    'DTO público no debe filtrar campos de seguridad interna ni IDs de operadores'
);

-- Test 42: Consulta con token incorrecto -> Retorna NULL
SELECT is(
    public.tracking_get_core(
        'PED-2026-D000777',
        encode(digest('token_invalido_hacker_123', 'sha256'), 'hex')
    ),
    NULL,
    'tracking_get_core con token inválido debe retornar NULL'
);

-- Test 43: Consulta con token de otro PED -> Retorna NULL
SELECT is(
    public.tracking_get_core(
        'PED-2026-C000103',
        encode(digest('raw_super_secret_tracking_token_777', 'sha256'), 'hex')
    ),
    NULL,
    'tracking_get_core con token de otro PED debe retornar NULL'
);

-- Test 44: Recuperación de acceso anti-enumeración con correo existente
RESET ROLE;
CREATE TEMP TABLE t_recov_found AS
SELECT public.tracking_recover_core('solicitante.f7@tdf.gob.ar') AS res;

SELECT results_eq(
    $$SELECT (res->>'success')::boolean FROM t_recov_found$$,
    ARRAY[true],
    'tracking_recover_core debe retornar success = true'
);

-- Test 45: Recuperación de acceso emite evento durable tracking.recovery_requested
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.domain_events WHERE event_name = 'tracking.recovery_requested' AND aggregate_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[1],
    'tracking_recover_core debe emitir evento tracking.recovery_requested para el pedido'
);

-- -----------------------------------------------------------------------------
-- 7. F7: Canje de Token Temporal de Recuperación (tracking_exchange_core) [Tests 46..53]
-- -----------------------------------------------------------------------------

-- Test 46: Comprobar que tracking_recovery_tokens tiene 1 token activo para el pedido
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.tracking_recovery_tokens WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777' AND used_at IS NULL$$,
    ARRAY[1],
    'tracking_recover_core debe registrar 1 token de canje en tracking_recovery_tokens'
);

-- Obtener el token de canje crudo generado desde la cola outbox
CREATE TEMP TABLE t_recov_token_info AS
SELECT id, (payload->>'exchange_token')::text AS raw_exchange_token
FROM public.comunicaciones_pedido
WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777' AND tipo_comunicacion = 'tracking_recovery'
ORDER BY created_at DESC
LIMIT 1;
GRANT ALL ON t_recov_token_info TO service_role, authenticated, anon, PUBLIC;

-- Test 47: Canje con token inexistente -> REJECTED (P0002 / TOKEN_NOT_FOUND)
SET ROLE service_role;
SELECT throws_ok(
    $$SELECT public.tracking_exchange_core('raw_token_inexistente_123456')$$,
    'P0002',
    NULL,
    'Canje con token inexistente debe fallar con TOKEN_NOT_FOUND'
);

-- Test 48: Canje exitoso con token válido -> SUCCESS, rota hash e incrementa tracking_token_version
CREATE TEMP TABLE t_exchange_res AS
SELECT public.tracking_exchange_core((SELECT raw_exchange_token FROM t_recov_token_info)) AS res;
GRANT ALL ON t_exchange_res TO service_role, authenticated, anon, PUBLIC;

SELECT results_eq(
    $$SELECT (res->>'pedido_visible')::text FROM t_exchange_res$$,
    ARRAY['PED-2026-D000777'],
    'Canje exitoso retorna pedido_visible correcto'
);

SELECT results_eq(
    $$SELECT length(res->>'tracking_token')::integer FROM t_exchange_res$$,
    ARRAY[64],
    'Canje exitoso entrega nuevo tracking_token de 64 hex'
);

-- Test 49: El token de canje queda marcado como used_at IS NOT NULL
SELECT results_eq(
    $$SELECT (used_at IS NOT NULL) FROM public.tracking_recovery_tokens WHERE pedido_id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[true],
    'Token de canje debe quedar marcado como usado (used_at no nulo)'
);

-- Test 50: Replay attack: intentar reutilizar el mismo token de canje -> REJECTED (42202 / TOKEN_ALREADY_USED)
SELECT throws_ok(
    $$SELECT public.tracking_exchange_core((SELECT raw_exchange_token FROM t_recov_token_info))$$,
    '42202',
    NULL,
    'Reintento de canje con token ya usado debe fallar con TOKEN_ALREADY_USED (42202)'
);

-- Test 51: El token anterior ya NO funciona para tracking_get_core
SELECT is(
    public.tracking_get_core(
        'PED-2026-D000777',
        encode(digest('raw_super_secret_tracking_token_777', 'sha256'), 'hex')
    ),
    NULL,
    'Token previo a la rotación debe quedar invalidado'
);

-- Test 52: El nuevo tracking token funciona correctamente en tracking_get_core
SELECT results_eq(
    $$SELECT (public.tracking_get_core(
        'PED-2026-D000777',
        encode(digest((SELECT res->>'tracking_token' FROM t_exchange_res), 'sha256'), 'hex')
    )->>'pedido_visible')::text$$,
    ARRAY['PED-2026-D000777'],
    'Nuevo tracking token emitido en el canje permite consultar el seguimiento'
);

-- Test 53: tracking_token_version se incrementó a 2
SELECT results_eq(
    $$SELECT tracking_token_version::integer FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000777'$$,
    ARRAY[2],
    'tracking_token_version debe incrementarse a 2 tras la rotación atómica'
);

-- -----------------------------------------------------------------------------
-- 8. F8: Historial Operativo Unificado (pedido_get_historial) [Tests 54..56]
-- -----------------------------------------------------------------------------

-- Test 54: Anon no puede consultar pedido_get_historial -> REJECTED (42501)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    $$SELECT public.pedido_get_historial('a0000000-0000-0000-0000-000000000777')$$,
    '42501',
    NULL,
    'Anon no debe poder consultar el historial operativo'
);

-- Test 55: Administrador consulta pedido_get_historial -> SUCCESS (retorna lista de eventos estructurados)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT isnt_empty(
    $$SELECT public.pedido_get_historial('a0000000-0000-0000-0000-000000000777')$$,
    'pedido_get_historial debe retornar registros estructurados para rol administrador'
);

-- Test 56: Observador puede consultar pedido_get_historial (auditoría/observabilidad)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT isnt_empty(
    $$SELECT public.pedido_get_historial('a0000000-0000-0000-0000-000000000777')$$,
    'pedido_get_historial debe retornar registros para rol observador'
);

SELECT * FROM finish();

ROLLBACK;
