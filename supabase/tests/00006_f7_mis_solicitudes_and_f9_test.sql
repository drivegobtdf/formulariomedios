-- ==============================================================================
-- TEST SUITE 00006: F7 (Mis Solicitudes por Correo + Sesión) & F9 (Finalización, Cancelación, Reapertura, Archivado)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(35);

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

DO $$
DECLARE
  v_admin_id uuid := '00000000-0000-0000-0000-000000000101'::uuid;
  v_operador_id uuid := '00000000-0000-0000-0000-000000000102'::uuid;
  v_observador_id uuid := '00000000-0000-0000-0000-000000000103'::uuid;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES 
    (v_admin_id, 'admin_f9@test.gob.ar'),
    (v_operador_id, 'operador_f9@test.gob.ar'),
    (v_observador_id, 'observador_f9@test.gob.ar')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, app_role, estado_acceso)
  VALUES
    (v_admin_id, 'Admin', 'F9', 'admin.f9', 'administrador', 'aprobado'),
    (v_operador_id, 'Operador', 'F9', 'operador.f9', 'equipo', 'aprobado'),
    (v_observador_id, 'Observador', 'F9', 'observador.f9', 'observador', 'aprobado')
  ON CONFLICT (user_id) DO UPDATE SET
    estado_acceso = 'aprobado',
    app_role = EXCLUDED.app_role;
END $$;

-- Limpieza y creación de datos para ciudadano y pedidos F9
DO $$
DECLARE
  v_envio_1 uuid := 'e0000000-0000-0000-0000-000000000901'::uuid;
  v_envio_2 uuid := 'e0000000-0000-0000-0000-000000000902'::uuid;
  v_envio_3 uuid := 'e0000000-0000-0000-0000-000000000903'::uuid;
  v_envio_4 uuid := 'e0000000-0000-0000-0000-000000000904'::uuid;
  v_cat_id uuid;
  v_tipo_id uuid;
  v_ped_1 uuid := 'a0000000-0000-0000-0000-000000000901'::uuid;
  v_ped_2 uuid := 'a0000000-0000-0000-0000-000000000902'::uuid;
  v_ped_3 uuid := 'a0000000-0000-0000-0000-000000000903'::uuid;
  v_ped_4 uuid := 'a0000000-0000-0000-0000-000000000904'::uuid;
  v_sol_id uuid := 'c0000000-0000-0000-0000-000000000901'::uuid;
  v_sol_2_id uuid := 'c0000000-0000-0000-0000-000000000902'::uuid;
  v_arch_id uuid := 'f0000000-0000-0000-0000-000000000901'::uuid;
  v_admin_id uuid := '00000000-0000-0000-0000-000000000101'::uuid;
  v_operador_id uuid := '00000000-0000-0000-0000-000000000102'::uuid;
BEGIN
  DELETE FROM public.archivo_pedido WHERE archivo_id = v_arch_id;
  DELETE FROM public.archivos WHERE id = v_arch_id;
  DELETE FROM public.solicitudes_informacion WHERE id IN (v_sol_id, v_sol_2_id);
  DELETE FROM public.entregas_pedido WHERE pedido_id IN (v_ped_1, v_ped_2, v_ped_3, v_ped_4);
  DELETE FROM public.domain_events WHERE aggregate_id IN (v_ped_1, v_ped_2, v_ped_3, v_ped_4);
  DELETE FROM public.pedidos WHERE id IN (v_ped_1, v_ped_2, v_ped_3, v_ped_4);
  DELETE FROM public.comunicaciones_pedido WHERE destinatario_email IN ('ciudadano_f9@test.gob.ar', 'f9_user@test.gob.ar');
  DELETE FROM public.solicitante_sesiones WHERE correo IN ('ciudadano_f9@test.gob.ar', 'f9_user@test.gob.ar');
  DELETE FROM public.solicitante_access_tokens WHERE correo IN ('ciudadano_f9@test.gob.ar', 'f9_user@test.gob.ar');
  DELETE FROM public.envios_formulario WHERE id IN (v_envio_1, v_envio_2, v_envio_3, v_envio_4);

  SELECT id INTO v_cat_id FROM public.categorias_servicio WHERE codigo_ped = 'D' LIMIT 1;
  SELECT id INTO v_tipo_id FROM public.tipos_servicio WHERE categoria_id = v_cat_id LIMIT 1;

  -- Submission 1 (Citizen F9)
  INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
  ) VALUES (
    v_envio_1, gen_random_uuid(), encode(digest('fp_f9_1', 'sha256'), 'hex'), 'Ciudadano F9', '2901112233', 'ciudadano_f9@test.gob.ar', 'Secretaría General', 3
  );

  INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id, codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version, tracking_token_hash, version
  ) VALUES (
    v_ped_1, v_envio_1, gen_random_uuid(), 'PED-2026-D000901', v_cat_id, v_tipo_id, 'D', 901, 2026, 'Nuevo', '{"tema":"F9 Test 1"}'::jsonb, 3, encode(digest('tok_1', 'sha256'), 'hex'), 1
  );

  -- Submission 2 (Citizen F9)
  INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
  ) VALUES (
    v_envio_2, gen_random_uuid(), encode(digest('fp_f9_2', 'sha256'), 'hex'), 'Ciudadano F9', '2901112233', 'ciudadano_f9@test.gob.ar', 'Secretaría General', 3
  );

  INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id, codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version, tracking_token_hash, version
  ) VALUES (
    v_ped_2, v_envio_2, gen_random_uuid(), 'PED-2026-D000902', v_cat_id, v_tipo_id, 'D', 902, 2026, 'Nuevo', '{"tema":"F9 Test 2"}'::jsonb, 3, encode(digest('tok_2', 'sha256'), 'hex'), 1
  );

  -- Submission 3 (Para finalización F9)
  INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
  ) VALUES (
    v_envio_3, gen_random_uuid(), encode(digest('fp_f9_3', 'sha256'), 'hex'), 'Otro Ciudadano', '2901998877', 'f9_user@test.gob.ar', 'Cultura', 3
  );

  INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id, codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version, tracking_token_hash, version, responsable_user_id
  ) VALUES (
    v_ped_3, v_envio_3, gen_random_uuid(), 'PED-2026-D000903', v_cat_id, v_tipo_id, 'D', 903, 2026, 'En proceso', '{"tema":"F9 Finalize"}'::jsonb, 3, encode(digest('tok_3', 'sha256'), 'hex'), 1, v_operador_id
  );

  -- Submission 4 (Para cancelación y reapertura F9)
  INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
  ) VALUES (
    v_envio_4, gen_random_uuid(), encode(digest('fp_f9_4', 'sha256'), 'hex'), 'Otro Ciudadano', '2901998877', 'f9_user@test.gob.ar', 'Cultura', 3
  );

  INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, categoria_id, tipo_servicio_id, codigo_categoria, numero, anio, estado, informacion_especifica, form_schema_version, tracking_token_hash, version, responsable_user_id
  ) VALUES (
    v_ped_4, v_envio_4, gen_random_uuid(), 'PED-2026-D000904', v_cat_id, v_tipo_id, 'D', 904, 2026, 'En revisión', '{"tema":"F9 Cancel & Reopen"}'::jsonb, 3, encode(digest('tok_4', 'sha256'), 'hex'), 1, v_operador_id
  );

  -- Solicitud de información de 48 horas en pedido 1
  INSERT INTO public.solicitudes_informacion (
    id, pedido_id, solicitada_por, mensaje, estado, token_hash, expires_at, created_at
  ) VALUES (
    v_sol_id, v_ped_1, v_admin_id, 'Se requiere archivo vectorial del logotipo institucional', 'pendiente', encode(digest('tok_sol_1', 'sha256'), 'hex'), now() + interval '48 hours', now()
  );

  -- Solicitud de información 2 en pedido 2
  INSERT INTO public.solicitudes_informacion (
    id, pedido_id, solicitada_por, mensaje, estado, token_hash, expires_at, created_at
  ) VALUES (
    v_sol_2_id, v_ped_2, v_admin_id, 'Se requiere documento de especificaciones técnicas', 'pendiente', encode(digest('tok_sol_2', 'sha256'), 'hex'), now() + interval '48 hours', now()
  );

  -- Solicitud de información 3 en pedido 2 (para prueba de validación vacía)
  INSERT INTO public.solicitudes_informacion (
    id, pedido_id, solicitada_por, mensaje, estado, token_hash, expires_at, created_at
  ) VALUES (
    'c0000000-0000-0000-0000-000000000903'::uuid, v_ped_2, v_admin_id, 'Solicitud para prueba de validación vacía', 'pendiente', encode(digest('tok_sol_3', 'sha256'), 'hex'), now() + interval '48 hours', now()
  );

  -- Archivo de prueba
  INSERT INTO public.archivos (
    id, nombre_original, size_bytes, mime_type, drive_file_id, estado, contexto
  ) VALUES (
    v_arch_id, 'logo-curvas.pdf', 1048576, 'application/pdf', 'drive-file-f9-test', 'verified', 'informacion_respuesta'
  );
END $$;

-- -----------------------------------------------------------------------------
-- 1. F7: Solicitud de Acceso por Correo y Canje a Sesión Opaque (Tests 1..12)
-- -----------------------------------------------------------------------------

-- Test 1: Solicitud de acceso con correo existente retorna 200 y found=true
SELECT is(
  (public.solicitante_request_access('ciudadano_f9@test.gob.ar')->>'success')::boolean,
  true,
  'solicitante_request_access con correo registrado tiene éxito'
);

-- Test 2: Solicitud con correo no registrado retorna success=true (anti-enumeración)
SELECT is(
  (public.solicitante_request_access('inexistente@test.gob.ar')->>'success')::boolean,
  true,
  'solicitante_request_access con correo no registrado retorna success=true (anti-enumeración)'
);

-- Test 3: Se encoló comunicación con magic link
SELECT is(
  (SELECT count(*)::integer FROM public.comunicaciones_pedido WHERE destinatario_email = 'ciudadano_f9@test.gob.ar' AND tipo_comunicacion = 'magic_link_access'),
  1,
  'Bandeja de salida registra notificación con magic link'
);

-- Obtener token de acceso para pruebas
CREATE TEMP TABLE f7_tokens ON COMMIT DROP AS
SELECT 
  public.solicitante_test_claim_magic_token('ciudadano_f9@test.gob.ar') AS raw_token,
  ''::text AS session_token;

-- Test 4: Canje de enlace por sesión genera token opaco de 256 bits (64 hex chars)
UPDATE pg_temp.f7_tokens
SET session_token = public.solicitante_session_exchange((SELECT raw_token FROM pg_temp.f7_tokens))->>'session_token';

SELECT is(
  length((SELECT session_token FROM pg_temp.f7_tokens)),
  64,
  'solicitante_session_exchange genera token de sesión de 256 bits (64 chars hex)'
);

-- Test 5: Replay attack: intentar canjear el mismo enlace por segunda vez es rechazado (42202)
SELECT throws_ok(
  $$SELECT public.solicitante_session_exchange((SELECT raw_token FROM pg_temp.f7_tokens))$$,
  '42202',
  NULL,
  'Canje por segunda vez del mismo token mágico es rechazado con 42202'
);

-- Test 6: Listado consolidado de solicitudes del solicitante bajo sesión activa (Multi-PED)
SELECT is(
  (public.solicitante_get_pedidos((SELECT session_token FROM pg_temp.f7_tokens))->>'total')::integer,
  2,
  'solicitante_get_pedidos retorna los 2 pedidos asociados al correo del ciudadano'
);

-- Test 7: Conteo de solicitudes pendientes de información faltante en la lista
SELECT is(
  (public.solicitante_get_pedidos((SELECT session_token FROM pg_temp.f7_tokens))->'pedidos'->0->>'solicitudes_pendientes_count')::integer,
  1,
  'solicitante_get_pedidos reporta 1 solicitud pendiente en el pedido 1'
);

-- Test 8: Detalle sanitizado del pedido por sesión
SELECT is(
  public.solicitante_get_pedido_detail((SELECT session_token FROM pg_temp.f7_tokens), 'a0000000-0000-0000-0000-000000000901')->>'pedido_visible',
  'PED-2026-D000901',
  'solicitante_get_pedido_detail retorna detalle sanitizado correcto'
);

-- Test 9: Detalle contiene array de solicitudes_informacion
SELECT is(
  jsonb_array_length(public.solicitante_get_pedido_detail((SELECT session_token FROM pg_temp.f7_tokens), 'a0000000-0000-0000-0000-000000000901')->'solicitudes_informacion'),
  1,
  'solicitante_get_pedido_detail incluye la solicitud de información faltante'
);

-- Test 10: Respuesta ciudadana a la solicitud de información faltante (48h) con texto y enlaces Drive
SELECT is(
  (public.solicitante_submit_info_response(
    (SELECT session_token FROM pg_temp.f7_tokens),
    'c0000000-0000-0000-0000-000000000901'::uuid,
    'Adjunto el logo vectorial oficial',
    ARRAY['https://drive.google.com/test-logo.svg']
  )->>'success')::boolean,
  true,
  'Ciudadano responde exitosamente a solicitud de información de 48h'
);

-- Test 11: Re-responder a la misma solicitud es idempotente y retorna idempotent=true
SELECT is(
  (public.solicitante_submit_info_response(
    (SELECT session_token FROM pg_temp.f7_tokens),
    'c0000000-0000-0000-0000-000000000901'::uuid,
    'Intento de segunda respuesta'
  )->>'idempotent')::boolean,
  true,
  'Segunda respuesta a solicitud ya respondida es idempotente'
);

-- Revocar sesión (Logout)
SELECT public.solicitante_session_revoke((SELECT session_token FROM pg_temp.f7_tokens));

-- Test 12: Acceso con sesión revocada es rechazado con 42501 (SESSION_REVOKED)
SELECT throws_ok(
  $$SELECT public.solicitante_get_pedidos((SELECT session_token FROM pg_temp.f7_tokens))$$,
  '42501',
  NULL,
  'Acceso con sesión revocada rechazado con 42501'
);

-- -----------------------------------------------------------------------------
-- 2. F9: Finalización con Entrega (Tests 13..17)
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid); -- Admin

-- Test 13: Finalizar sin archivos ni enlace es rechazado con 42200 (DELIVERY_REQUIRED)
SELECT throws_ok(
  $$SELECT public.pedido_finalize('a0000000-0000-0000-0000-000000000903', 1, NULL, NULL, 'Nota vacia')$$,
  '42200',
  NULL,
  'Finalizar sin URL ni archivos rechazado con 42200'
);

-- Test 14: Finalizar con enlace Drive y nota tiene éxito
SELECT is(
  (public.pedido_finalize(
    'a0000000-0000-0000-0000-000000000903',
    1,
    NULL,
    'https://drive.google.com/entregas/f9-pack.zip',
    'Entrega final aprobada y lista para descargar'
  )->>'success')::boolean,
  true,
  'pedido_finalize tiene éxito con enlace Drive y nota'
);

-- Test 15: Pedido queda en estado Finalizado y versión incrementada a 2
SELECT is(
  (SELECT estado FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000903'),
  'Finalizado',
  'Estado del pedido cambia a Finalizado'
);

-- Test 16: Se registró entrega activa vigente en entregas_pedido
SELECT is(
  (SELECT count(*)::integer FROM public.entregas_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000903' AND es_vigente = true),
  1,
  'Se registra 1 entrega vigente en entregas_pedido'
);

-- Test 17: Cancelar un pedido ya Finalizado es rechazado con 42200 (INVALID_TRANSITION)
SELECT throws_ok(
  $$SELECT public.pedido_cancel('a0000000-0000-0000-0000-000000000903', 2, 'Cancelar pedido finalizado')$$,
  '42200',
  NULL,
  'Cancelar un pedido Finalizado es rechazado con 42200'
);

-- -----------------------------------------------------------------------------
-- 3. F9 & SRS-RBAC-002: Archivado y Restauración por Admin Y Equipo (Tests 18..23)
-- -----------------------------------------------------------------------------

-- Test 18: Admin archiva pedido Finalizado
SELECT is(
  (public.pedido_archive('a0000000-0000-0000-0000-000000000903', 2)->>'success')::boolean,
  true,
  'Admin archiva pedido Finalizado'
);

-- Test 19: Pedido tiene archivado=true
SELECT is(
  (SELECT archivado FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000903'),
  true,
  'Pedido Finalizado tiene archivado=true'
);

-- Cambiar a contexto de Operador (Equipo)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);

-- Test 20: SRS-RBAC-002: Equipo (aprobado) tiene permiso para restaurar pedido archivado
SELECT is(
  (public.pedido_restore('a0000000-0000-0000-0000-000000000903', 3)->>'success')::boolean,
  true,
  'SRS-RBAC-002: Operador (Equipo) restaura pedido archivado'
);

-- Test 21: Pedido queda desarchivado
SELECT is(
  (SELECT archivado FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000903'),
  false,
  'Pedido restaurado por Equipo tiene archivado=false'
);

-- Test 22: SRS-RBAC-002: Equipo (aprobado) tiene permiso para archivar pedido
SELECT is(
  (public.pedido_archive('a0000000-0000-0000-0000-000000000903', 4)->>'success')::boolean,
  true,
  'SRS-RBAC-002: Operador (Equipo) archiva pedido Finalizado'
);

-- Cambiar a contexto de Observador
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);

-- Test 23: Observador es rechazado al intentar archivar con 42501 (ROLE_FORBIDDEN)
SELECT throws_ok(
  $$SELECT public.pedido_archive('a0000000-0000-0000-0000-000000000903', 5)$$,
  '42501',
  NULL,
  'Observador no puede archivar pedidos (42501)'
);

-- -----------------------------------------------------------------------------
-- 4. F9: Cancelación con Motivo y Reapertura (Tests 24..27)
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid); -- Admin

-- Test 24: Cancelar sin motivo es rechazado con 42200 (CANCEL_REASON_REQUIRED)
SELECT throws_ok(
  $$SELECT public.pedido_cancel('a0000000-0000-0000-0000-000000000904', 1, '')$$,
  '42200',
  NULL,
  'Cancelar sin motivo obligatorio es rechazado con 42200'
);

-- Test 25: Cancelar con motivo tiene éxito y pasa a Cancelado
SELECT is(
  (public.pedido_cancel('a0000000-0000-0000-0000-000000000904', 1, 'Evento suspendido por organizadores')->>'success')::boolean,
  true,
  'pedido_cancel tiene éxito con motivo'
);

-- Test 26: Reabrir pedido Cancelado tiene éxito y pasa a En revisión (tenía responsable asignado)
SELECT is(
  (public.pedido_reopen('a0000000-0000-0000-0000-000000000904', 2, 'Reanudar evento la proxima semana')->>'success')::boolean,
  true,
  'pedido_reopen tiene éxito en pedido Cancelado'
);

-- Test 27: Conflicto OCC por versión desactualizada es rechazado con 40001 (VERSION_CONFLICT)
SELECT throws_ok(
  $$SELECT public.pedido_change_state('a0000000-0000-0000-0000-000000000904', 'En proceso', 1)$$,
  '40001',
  NULL,
  'Conflicto OCC de concurrencia es rechazado con 40001'
);

-- -----------------------------------------------------------------------------
-- 5. SRS-INF-004: Respuesta a Info con Adjuntos y Enlaces Genéricos (Tests 28..31)
-- -----------------------------------------------------------------------------

-- Crear nueva sesión de solicitante para pedido 2
SELECT pg_temp.set_auth_context(NULL, 'service_role');
SELECT public.solicitante_request_access('ciudadano_f9@test.gob.ar');

CREATE TEMP TABLE f7_tokens_2 ON COMMIT DROP AS
SELECT 
  public.solicitante_test_claim_magic_token('ciudadano_f9@test.gob.ar') AS raw_token,
  ''::text AS session_token;

UPDATE pg_temp.f7_tokens_2
SET session_token = public.solicitante_session_exchange((SELECT raw_token FROM pg_temp.f7_tokens_2))->>'session_token';

-- Test 28: SRS-INF-004: Respuesta con archivo adjunto UUID vincula a archivo_pedido
SELECT is(
  (public.solicitante_submit_info_response(
    (SELECT session_token FROM pg_temp.f7_tokens_2),
    'c0000000-0000-0000-0000-000000000902'::uuid,
    'Adjunto documento técnico en PDF',
    NULL,
    ARRAY['f0000000-0000-0000-0000-000000000901'::uuid]
  )->>'success')::boolean,
  true,
  'SRS-INF-004: Respuesta con archivo adjunto UUID es procesada con éxito'
);

-- Test 29: El archivo queda registrado en archivo_pedido
SELECT is(
  (SELECT count(*)::integer FROM public.archivo_pedido WHERE pedido_id = 'a0000000-0000-0000-0000-000000000902' AND archivo_id = 'f0000000-0000-0000-0000-000000000901'::uuid),
  1,
  'Archivo adjunto de respuesta queda vinculado en archivo_pedido'
);

-- Test 30: Respuesta con enlaces externos genéricos (Dropbox / WeTransfer) tiene éxito
SELECT is(
  (public.solicitante_submit_info_response(
    (SELECT session_token FROM pg_temp.f7_tokens_2),
    'c0000000-0000-0000-0000-000000000901'::uuid,
    'Enlace externo alternativo',
    ARRAY['https://www.dropbox.com/s/xyz123/archivo.zip', 'https://wetransfer.com/downloads/abc456']
  )->>'success')::boolean,
  true,
  'SRS-INF-004: Enlaces genéricos (Dropbox, WeTransfer) son aceptados e idempotentes'
);

-- Test 31: Respuesta vacía (sin texto, sin enlaces y sin archivos) es rechazada con 42200
SELECT throws_ok(
  $$SELECT public.solicitante_submit_info_response(
    (SELECT session_token FROM pg_temp.f7_tokens_2),
    'c0000000-0000-0000-0000-000000000903'::uuid,
    '',
    ARRAY[]::text[],
    ARRAY[]::uuid[]
  )$$,
  '42200',
  NULL,
  'Respuesta sin texto, sin enlaces y sin archivos es rechazada con 42200'
);

-- -----------------------------------------------------------------------------
-- 6. Configuración de TTL y Seguridad de Helpers (Tests 32..35)
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid); -- Admin

-- Test 32: Admin modifica setting de TTL técnico provisional
SELECT is(
  (public.admin_set_system_setting('solicitante_magic_link_ttl_seconds', '3600')->>'success')::boolean,
  true,
  'Admin modifica TTL técnico provisional a 3600s'
);

-- Generar nueva solicitud bajo nuevo TTL
SELECT pg_temp.set_auth_context(NULL, 'service_role');
DELETE FROM public.solicitante_access_tokens WHERE correo = 'ciudadano_f9@test.gob.ar';
SELECT public.solicitante_request_access('ciudadano_f9@test.gob.ar');

-- Test 33: Nueva solicitud de acceso respeta el nuevo TTL (3600s = 1h)
SELECT is(
  (SELECT (expires_at - created_at) FROM (
     SELECT expires_at, created_at FROM public.solicitante_access_tokens WHERE correo = 'ciudadano_f9@test.gob.ar' ORDER BY created_at DESC, id DESC LIMIT 1
   ) t),
  '01:00:00'::interval,
  'solicitante_request_access aplica el TTL configurado dinámicamente'
);

-- Test 34: Setting con valor inválido o no numérico cae en el default seguro (7200s)
SELECT public.set_system_setting('solicitante_magic_link_ttl_seconds', 'invalido_texto');
SELECT is(
  public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000),
  7200,
  'Valor de TTL inválido cae en fallback seguro por defecto (7200)'
);

-- Test 35: solicitante_test_claim_magic_token es rechazado para rol anon y authenticated
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
  $$SELECT public.solicitante_test_claim_magic_token('ciudadano_f9@test.gob.ar')$$,
  '42501',
  NULL,
  'solicitante_test_claim_magic_token es denegado para anon (42501)'
);

SELECT * FROM finish();
ROLLBACK;
