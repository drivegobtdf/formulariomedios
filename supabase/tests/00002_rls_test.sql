-- ==============================================================================
-- DATABASE TESTS (pgTAP): Supabase Auth, RBAC, RLS & Hardened Security Suite
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(80);

-- -----------------------------------------------------------------------------
-- 0. Preparación de Fixtures Sintéticos de Autenticación
-- -----------------------------------------------------------------------------

-- IDs sintéticos fijos (UUIDv4 válidos)
-- Admin 1:     00000000-0000-0000-0000-000000000101
-- Equipo:      00000000-0000-0000-0000-000000000102
-- Observador:  00000000-0000-0000-0000-000000000103
-- Pendiente:   00000000-0000-0000-0000-000000000104
-- Rechazado:   00000000-0000-0000-0000-000000000105
-- Revocado:    00000000-0000-0000-0000-000000000106
-- Sin Perfil:  00000000-0000-0000-0000-000000000107
-- Admin 2:     00000000-0000-0000-0000-000000000108

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000101', 'admin.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000102', 'equipo.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000103', 'observador.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000104', 'pendiente.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000105', 'rechazado.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000106', 'revocado.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000107', 'sinperfil.test@example.invalid'),
    ('00000000-0000-0000-0000-000000000108', 'admin2.test@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role) VALUES
    ('00000000-0000-0000-0000-000000000101', 'Admin', 'Test', 'admin.test', 'aprobado', 'administrador'),
    ('00000000-0000-0000-0000-000000000102', 'Equipo', 'Test', 'equipo.test', 'aprobado', 'equipo'),
    ('00000000-0000-0000-0000-000000000103', 'Observador', 'Test', 'observador.test', 'aprobado', 'observador'),
    ('00000000-0000-0000-0000-000000000104', 'Pendiente', 'Test', 'pendiente.test', 'pendiente', 'observador'),
    ('00000000-0000-0000-0000-000000000105', 'Rechazado', 'Test', 'rechazado.test', 'rechazado', 'observador'),
    ('00000000-0000-0000-0000-000000000106', 'Revocado', 'Test', 'revocado.test', 'revocado', 'equipo'),
    ('00000000-0000-0000-0000-000000000108', 'Admin2', 'Test', 'admin2.test', 'aprobado', 'administrador')
ON CONFLICT (user_id) DO UPDATE SET
    estado_acceso = EXCLUDED.estado_acceso,
    app_role = EXCLUDED.app_role;

-- Asegurar aislamiento del test eliminando usuarios externos dentro de la transacción
DELETE FROM public.usuarios_acceso WHERE user_id NOT IN (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000105',
    '00000000-0000-0000-0000-000000000106',
    '00000000-0000-0000-0000-000000000108'
);

-- Insertar datos de prueba en pedidos
INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante
) VALUES (
    'e0000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000100',
    'b000000000000000000000000000000000000000000000000000000000000100',
    'Solicitante Test',
    '+542901999999',
    'solicitante@tierradelfuego.gob.ar',
    'Secretaría de Medios'
) ON CONFLICT DO NOTHING;

INSERT INTO public.pedidos (
    id, envio_id, client_request_ref, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
    estado, tracking_token_hash
) VALUES (
    'a0000000-0000-0000-0000-000000000100',
    'e0000000-0000-0000-0000-000000000100',
    'c0000000-0000-0000-0000-000000000100',
    'PED-2026-D000100',
    2026,
    100,
    'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    'D',
    'Nuevo',
    'token_h_rls_100'
) ON CONFLICT DO NOTHING;

-- Insertar notas de prueba: una para solicitante y una interna
INSERT INTO public.notas_pedido (id, pedido_id, autor_user_id, visibilidad, texto) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000102', 'solicitante', 'Nota publica para el solicitante'),
    ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000102', 'interna', 'Nota estrictamente interna de equipo')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helper PL/pgSQL para simular contexto de sesión Supabase Auth
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_auth_context(p_user_id uuid, p_role text DEFAULT 'authenticated')
-- Note: set search_path to public so pgtap functions remain accessible
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_user_id IS NULL THEN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        PERFORM set_config('request.jwt.claim.role', 'anon', true);
        EXECUTE 'SET LOCAL ROLE anon';
    ELSE
        PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
        PERFORM set_config('request.jwt.claim.role', p_role, true);
        EXECUTE format('SET LOCAL ROLE %I', p_role);
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tests de Catálogos (anon vs authenticated) [Tests 1..3]
-- -----------------------------------------------------------------------------

-- Test 1: anon puede leer categorías activas
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT results_eq(
    'SELECT count(*)::integer FROM public.categorias_servicio WHERE activo = true',
    ARRAY[8],
    'anon debe poder leer las 8 categorías activas'
);

-- Test 2: anon puede leer tipos de servicio activos
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT results_eq(
    'SELECT count(*)::integer FROM public.tipos_servicio WHERE activo = true',
    ARRAY[11],
    'anon debe poder leer los 11 tipos de servicio activos'
);

-- Test 3: anon no puede mutar categorías
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    $$INSERT INTO public.categorias_servicio (slug, codigo_ped, nombre) VALUES ('test', 'X', 'Test')$$,
    '42501',
    NULL,
    'anon debe tener denegado INSERT sobre categorias_servicio'
);

-- -----------------------------------------------------------------------------
-- 2. Tests de Dominio Pedidos: Matriz RLS por Actor [Tests 4..11]
-- -----------------------------------------------------------------------------

-- Test 4: anon -> SELECT pedidos DENY (error 42501 por falta de GRANT)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    'SELECT count(*)::integer FROM public.pedidos',
    '42501',
    NULL,
    'anon debe tener denegado el acceso a pedidos (42501)'
);

-- Test 5: authenticated sin perfil -> SELECT pedidos DENY (0 filas)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000107'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.pedidos',
    ARRAY[0],
    'authenticated sin perfil debe tener denegada la lectura de pedidos'
);

-- Test 6: pendiente -> SELECT pedidos DENY (0 filas)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000104'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.pedidos',
    ARRAY[0],
    'usuario pendiente debe tener denegada la lectura de pedidos'
);

-- Test 7: rechazado -> SELECT pedidos DENY (0 filas)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000105'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.pedidos',
    ARRAY[0],
    'usuario rechazado debe tener denegada la lectura de pedidos'
);

-- Test 8: revocado -> SELECT pedidos DENY (0 filas)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000106'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.pedidos',
    ARRAY[0],
    'usuario revocado debe tener denegada la lectura de pedidos'
);

-- Test 9: observador aprobado -> SELECT pedidos ALLOW (>= 1 fila)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT isnt_empty(
    'SELECT * FROM public.pedidos',
    'observador aprobado debe poder leer pedidos'
);

-- Test 10: equipo aprobado -> SELECT pedidos ALLOW (>= 1 fila)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT isnt_empty(
    'SELECT * FROM public.pedidos',
    'equipo aprobado debe poder leer pedidos'
);

-- Test 11: administrador aprobado -> SELECT pedidos ALLOW (>= 1 fila)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT isnt_empty(
    'SELECT * FROM public.pedidos',
    'administrador aprobado debe poder leer pedidos'
);

-- -----------------------------------------------------------------------------
-- 3. Tests de Mutaciones Directas sobre Pedidos (Denegadas a Todos los Browser Roles) [Tests 12..14]
-- -----------------------------------------------------------------------------

-- Test 12: observador INSERT pedidos DENY
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok(
    $$INSERT INTO public.pedidos (envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria, estado, tracking_token_hash)
      VALUES ('e0000000-0000-0000-0000-000000000100', 'PED-2026-D000199', 2026, 199, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D', 'Nuevo', 'h_199')$$,
    '42501',
    NULL,
    'observador no debe tener permiso de INSERT directo en pedidos'
);

-- Test 13: equipo UPDATE pedidos DENY
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok(
    $$UPDATE public.pedidos SET estado = 'En proceso' WHERE id = 'a0000000-0000-0000-0000-000000000100'$$,
    '42501',
    NULL,
    'equipo no debe tener permiso de UPDATE genérico directo en pedidos'
);

-- Test 14: admin DELETE pedidos DENY
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok(
    $$DELETE FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000100'$$,
    '42501',
    NULL,
    'administrador no debe tener permiso de DELETE directo en pedidos'
);

-- -----------------------------------------------------------------------------
-- 4. Tests de Perfiles y usuarios_acceso (Self vs Admin vs Otros) [Tests 15..19]
-- -----------------------------------------------------------------------------

-- Test 15: pendiente puede leer ÚNICAMENTE su propio perfil (count = 1)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000104'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.usuarios_acceso',
    ARRAY[1],
    'usuario pendiente debe poder ver únicamente su propio perfil'
);

-- Test 16: observador puede leer ÚNICAMENTE su propio perfil (count = 1)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.usuarios_acceso',
    ARRAY[1],
    'usuario observador debe poder ver únicamente su propio perfil'
);

-- Test 17: equipo puede leer ÚNICAMENTE su propio perfil (count = 1)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.usuarios_acceso',
    ARRAY[1],
    'usuario equipo debe poder ver únicamente su propio perfil'
);

-- Test 18: administrador puede leer TODOS los perfiles (count >= 6)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT isnt_empty(
    'SELECT * FROM public.usuarios_acceso WHERE user_id <> ''00000000-0000-0000-0000-000000000101''',
    'administrador debe poder consultar los perfiles de todos los usuarios'
);

-- Test 19: usuario no puede cambiar su propio rol mediante UPDATE
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000104'::uuid);
SELECT throws_ok(
    $$UPDATE public.usuarios_acceso SET app_role = 'administrador', estado_acceso = 'aprobado' WHERE user_id = '00000000-0000-0000-0000-000000000104'$$,
    '42501',
    NULL,
    'usuario no puede modificar directamente su rol ni estado de acceso'
);

-- -----------------------------------------------------------------------------
-- 5. Test de Revocación Inmediata (SRS-AUTH-010) [Tests 20..21]
-- -----------------------------------------------------------------------------

RESET ROLE;

-- Crear usuario temporal para prueba de revocación en tiempo real
DO $$
BEGIN
    INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000999', 'temp.revocacion@example.invalid') ON CONFLICT DO NOTHING;
    INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role)
    VALUES ('00000000-0000-0000-0000-000000000999', 'Temp', 'Revocable', 'temp.rev', 'aprobado', 'equipo')
    ON CONFLICT (user_id) DO UPDATE SET estado_acceso = 'aprobado';
END;
$$;

-- Test 20: Antes de revocar -> SELECT pedidos ALLOW
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000999'::uuid);
SELECT isnt_empty(
    'SELECT * FROM public.pedidos',
    'usuario temporal aprobado debe poder leer pedidos'
);

-- Revocar acceso como superuser/admin
RESET ROLE;
UPDATE public.usuarios_acceso 
SET estado_acceso = 'revocado', revocado_at = now(), motivo_revocacion = 'Test revocacion inmediata'
WHERE user_id = '00000000-0000-0000-0000-000000000999';

-- Test 21: Mismo JWT/contexto inmediatamente después de revocar -> SELECT pedidos DENY
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000999'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.pedidos',
    ARRAY[0],
    'usuario revocado debe perder acceso inmediatamente con el mismo JWT'
);

-- -----------------------------------------------------------------------------
-- 6. Tests de Visibilidad de Notas de Pedido (Observador vs Equipo vs Admin) [Tests 22..26]
-- -----------------------------------------------------------------------------

-- Test 22: Observador lee notas con visibilidad solicitante -> ALLOW (1 fila)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.notas_pedido WHERE visibilidad = ''solicitante''',
    ARRAY[1],
    'observador debe poder ver notas con visibilidad solicitante'
);

-- Test 23: Observador lee notas con visibilidad interna -> DENY / invisible (0 filas)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.notas_pedido WHERE visibilidad = ''interna''',
    ARRAY[0],
    'observador NO debe poder ver notas internas'
);

-- Test 24: Equipo lee notas internas -> ALLOW (1 fila interna)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.notas_pedido WHERE visibilidad = ''interna''',
    ARRAY[1],
    'equipo aprobado debe poder ver notas internas'
);

-- Test 25: Administrador lee notas internas -> ALLOW (1 fila interna)
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT results_eq(
    'SELECT count(*)::integer FROM public.notas_pedido WHERE visibilidad = ''interna''',
    ARRAY[1],
    'administrador aprobado debe poder ver notas internas'
);

-- Test 26: anon no tiene grant para leer notas_pedido -> throws 42501
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    'SELECT count(*)::integer FROM public.notas_pedido',
    '42501',
    NULL,
    'anon debe tener denegado el acceso a notas_pedido (42501)'
);

-- -----------------------------------------------------------------------------
-- 7. Tests de Observador Write Deny en Tablas Operativas [Tests 27..31]
-- -----------------------------------------------------------------------------

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);

-- Test 27: Observador no puede escribir notas
SELECT throws_ok(
    $$INSERT INTO public.notas_pedido (pedido_id, autor_user_id, visibilidad, texto) VALUES ('a0000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000103', 'interna', 'Nota obs')$$,
    '42501',
    NULL,
    'observador debe tener denegado INSERT sobre notas_pedido'
);

-- Test 28: Observador no puede escribir asignaciones
SELECT throws_ok(
    $$INSERT INTO public.pedido_asignaciones (pedido_id, responsable_nuevo, asignado_por) VALUES ('a0000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103')$$,
    '42501',
    NULL,
    'observador debe tener denegado INSERT sobre pedido_asignaciones'
);

-- Test 29: Observador no puede escribir archivos
SELECT throws_ok(
    $$INSERT INTO public.archivos (nombre_original, mime_type, size_bytes, contexto, estado) VALUES ('doc.pdf', 'application/pdf', 100, 'solicitud', 'uploaded')$$,
    '42501',
    NULL,
    'observador debe tener denegado INSERT sobre archivos'
);

-- Test 30: Observador no puede escribir entregas
SELECT throws_ok(
    $$INSERT INTO public.entregas_pedido (pedido_id, enlace_externo, entregado_por) VALUES ('a0000000-0000-0000-0000-000000000100', 'https://drive.google.com/test', '00000000-0000-0000-0000-000000000103')$$,
    '42501',
    NULL,
    'observador debe tener denegado INSERT sobre entregas_pedido'
);

-- Test 31: Observador no puede escribir solicitudes de información
SELECT throws_ok(
    $$INSERT INTO public.solicitudes_informacion (pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at) VALUES ('a0000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000103', 'Falta logo', 'tok_obs', 'pendiente', now() + interval '3 days')$$,
    '42501',
    NULL,
    'observador debe tener denegado INSERT sobre solicitudes_informacion'
);

-- -----------------------------------------------------------------------------
-- 8. Tests de Tablas Técnicas e Infraestructura: Mínimo Privilegio [Tests 32..62]
-- -----------------------------------------------------------------------------

-- A. submission_sessions (DENY a todos los roles de browser)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.submission_sessions', '42501', NULL, 'anon no debe tener acceso directo a submission_sessions');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.submission_sessions', '42501', NULL, 'observador no debe tener acceso directo a submission_sessions');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.submission_sessions', '42501', NULL, 'equipo no debe tener acceso directo a submission_sessions');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.submission_sessions', '42501', NULL, 'admin no debe tener SELECT directo sobre submission_sessions');

-- B. upload_reservations (DENY a todos los roles de browser)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.upload_reservations', '42501', NULL, 'anon no debe tener acceso directo a upload_reservations');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.upload_reservations', '42501', NULL, 'observador no debe tener acceso directo a upload_reservations');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.upload_reservations', '42501', NULL, 'equipo no debe tener acceso directo a upload_reservations');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.upload_reservations', '42501', NULL, 'admin no debe tener SELECT directo sobre upload_reservations');

-- C. domain_events (DENY a todos los roles de browser)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.domain_events', '42501', NULL, 'anon no debe tener acceso directo a domain_events');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.domain_events', '42501', NULL, 'observador no debe tener acceso directo a domain_events');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.domain_events', '42501', NULL, 'equipo no debe tener acceso directo a domain_events');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.domain_events', '42501', NULL, 'admin no debe tener SELECT directo sobre domain_events');

-- D. comunicaciones_pedido (DENY a todos los roles de browser)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.comunicaciones_pedido', '42501', NULL, 'anon no debe tener acceso directo a comunicaciones_pedido');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.comunicaciones_pedido', '42501', NULL, 'observador no debe tener acceso directo a comunicaciones_pedido');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.comunicaciones_pedido', '42501', NULL, 'equipo no debe tener acceso directo a comunicaciones_pedido');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.comunicaciones_pedido', '42501', NULL, 'admin no debe tener SELECT directo sobre comunicaciones_pedido');

-- E. pedido_sequences (DENY a todos los roles de browser)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.pedido_sequences', '42501', NULL, 'anon no debe tener acceso directo a pedido_sequences');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.pedido_sequences', '42501', NULL, 'observador no debe tener acceso directo a pedido_sequences');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.pedido_sequences', '42501', NULL, 'equipo no debe tener acceso directo a pedido_sequences');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok('SELECT count(*)::integer FROM public.pedido_sequences', '42501', NULL, 'admin no debe tener SELECT directo sobre pedido_sequences');

-- F. audit_log (SELECT autorizado únicamente a Administrador Aprobado)
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok('SELECT count(*)::integer FROM public.audit_log', '42501', NULL, 'anon no debe tener acceso directo a audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000104'::uuid);
SELECT results_eq('SELECT count(*)::integer FROM public.audit_log', ARRAY[0], 'usuario pendiente debe tener 0 filas devueltas en audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000105'::uuid);
SELECT results_eq('SELECT count(*)::integer FROM public.audit_log', ARRAY[0], 'usuario rechazado debe tener 0 filas devueltas en audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000106'::uuid);
SELECT results_eq('SELECT count(*)::integer FROM public.audit_log', ARRAY[0], 'usuario revocado debe tener 0 filas devueltas en audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000103'::uuid);
SELECT results_eq('SELECT count(*)::integer FROM public.audit_log', ARRAY[0], 'observador debe tener 0 filas devueltas en audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT results_eq('SELECT count(*)::integer FROM public.audit_log', ARRAY[0], 'equipo debe tener 0 filas devueltas en audit_log');

SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok('SELECT count(*)::integer FROM public.audit_log', 'admin debe poder consultar audit_log');

SELECT throws_ok(
    $$INSERT INTO public.audit_log (recurso_tipo, recurso_id, accion) VALUES ('test', '1', 'test')$$,
    '42501',
    NULL,
    'admin no debe tener permiso de INSERT directo en audit_log'
);

-- G. submission_create_core (EXECUTE denegado a authenticated)
SELECT throws_ok(
    $$SELECT public.submission_create_core('{}'::jsonb)$$,
    '42501',
    NULL,
    'authenticated no debe tener permiso de EXECUTE directo sobre submission_create_core'
);

-- H. service_role PoLP: Inserción permitida pero DELETE denegado en tablas append-only
RESET ROLE;
SET ROLE service_role;
SELECT lives_ok(
    $$INSERT INTO public.audit_log (recurso_tipo, recurso_id, accion) VALUES ('security_test', '1', 'polp_test')$$,
    'service_role debe tener permiso de INSERT sobre audit_log'
);

SELECT throws_ok(
    $$DELETE FROM public.audit_log WHERE recurso_tipo = 'security_test'$$,
    '42501',
    NULL,
    'service_role debe tener denegado DELETE sobre audit_log (append-only)'
);

RESET ROLE;

-- -----------------------------------------------------------------------------
-- 9. Tests de Funciones RPC Administrativas (Admin vs No-Admin) [Tests 53..60]
-- -----------------------------------------------------------------------------

-- Test 53: No-Admin (Equipo) no puede aprobar usuarios
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000102'::uuid);
SELECT throws_ok(
    $$SELECT public.admin_approve_user('00000000-0000-0000-0000-000000000104', 'equipo')$$,
    '42501',
    NULL,
    'usuario no-admin no puede ejecutar admin_approve_user'
);

-- Test 54: Administrador puede aprobar usuario y asignar rol
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_approve_user('00000000-0000-0000-0000-000000000104', 'equipo')$$,
    'administrador debe poder aprobar usuario y asignar rol'
);

-- Test 55: Verificar que el usuario quedó aprobado con el rol asignado
RESET ROLE;
SELECT results_eq(
    'SELECT estado_acceso, app_role FROM public.usuarios_acceso WHERE user_id = ''00000000-0000-0000-0000-000000000104''',
    $$VALUES ('aprobado', 'equipo')$$,
    'usuario debe registrar estado aprobado y rol equipo tras admin_approve_user'
);

-- Test 56: Administrador puede cambiar rol de usuario
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_change_user_role('00000000-0000-0000-0000-000000000104', 'observador')$$,
    'administrador debe poder cambiar rol de usuario'
);

-- Test 57: Administrador puede cambiar nombre de usuario
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_change_username('00000000-0000-0000-0000-000000000104', 'pendiente.renombrado')$$,
    'administrador debe poder cambiar nombre_usuario'
);

-- Test 58: Administrador puede rechazar usuario
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_reject_user('00000000-0000-0000-0000-000000000105', 'No cumple requisitos')$$,
    'administrador debe poder rechazar usuario'
);

-- Test 59: Administrador puede revocar usuario con motivo
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_revoke_user('00000000-0000-0000-0000-000000000104', 'Fin de funciones en el área')$$,
    'administrador debe poder revocar usuario con motivo'
);

-- Test 60: Verificar que las operaciones administrativas registraron auditoría
RESET ROLE;
SELECT isnt_empty(
    'SELECT * FROM public.audit_log WHERE accion = ''user.approved''',
    'admin_approve_user debe registrar entrada en audit_log'
);

-- -----------------------------------------------------------------------------
-- 10. Tests de Protección del Último Administrador (LAST_ADMIN_PROTECTED / OPEN-015) [Tests 61..64]
-- -----------------------------------------------------------------------------

-- Test 61: Con 2 administradores aprobados (Admin 1 y Admin 2), Admin 1 puede cambiar rol de Admin 2
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT lives_ok(
    $$SELECT public.admin_change_user_role('00000000-0000-0000-0000-000000000108', 'equipo')$$,
    'con 2 administradores, se permite cambiar el rol de uno si persiste al menos 1 administrador aprobado'
);

-- Test 62: Ahora queda un único Administrador aprobado (Admin 1). Intentar auto-degradarse debe ser RECHAZADO
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok(
    $$SELECT public.admin_change_user_role('00000000-0000-0000-0000-000000000101', 'equipo')$$,
    '42501',
    NULL,
    'LAST_ADMIN_PROTECTED: no se debe permitir degradar al único administrador aprobado del sistema'
);

-- Test 63: Intentar auto-revocarse como único Administrador debe ser RECHAZADO
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok(
    $$SELECT public.admin_revoke_user('00000000-0000-0000-0000-000000000101', 'Auto-revocacion')$$,
    '42501',
    NULL,
    'LAST_ADMIN_PROTECTED: un administrador no puede auto-revocarse directamente'
);

-- Test 64: Intentar rechazar al único Administrador debe ser RECHAZADO
SELECT pg_temp.set_auth_context('00000000-0000-0000-0000-000000000101'::uuid);
SELECT throws_ok(
    $$SELECT public.admin_reject_user('00000000-0000-0000-0000-000000000101', 'Rechazo lockout')$$,
    '42501',
    NULL,
    'LAST_ADMIN_PROTECTED: no se debe permitir rechazar/desactivar al único administrador aprobado'
);

-- -----------------------------------------------------------------------------
-- 11. Tests de Seguridad sobre Definición de Funciones y Grants EXECUTE [Tests 65..67]
-- -----------------------------------------------------------------------------

-- Test 65: handle_new_user_signup NO debe ser ejecutable por anon ni authenticated
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    $$SELECT public.handle_new_user_signup()$$,
    '42501',
    NULL,
    'handle_new_user_signup no debe ser ejecutable directamente por anon'
);

-- Test 66: admin_approve_user no debe ser ejecutable por anon
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    $$SELECT public.admin_approve_user('00000000-0000-0000-0000-000000000104', 'equipo')$$,
    '42501',
    NULL,
    'admin_approve_user no debe ser ejecutable por anon'
);

-- Test 67: private.is_admin no debe ser ejecutable por anon
SELECT pg_temp.set_auth_context(NULL, 'anon');
SELECT throws_ok(
    $$SELECT private.is_admin()$$,
    '42501',
    NULL,
    'funciones de esquema private no deben ser accesibles directamente por anon'
);

-- -----------------------------------------------------------------------------
-- 12. Tests de Trigger de Signup en auth.users [Tests 68..70]
-- -----------------------------------------------------------------------------

RESET ROLE;

-- Test 68: Signup válido crea perfil pendiente en usuarios_acceso
DO $$
DECLARE
    v_new_id uuid := '00000000-0000-0000-0000-000000000201';
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (
        v_new_id,
        'nuevo.usuario@example.invalid',
        '{"nombre": "Laura", "apellido": "Fernandez", "nombre_usuario": "laura.fernandez"}'::jsonb
    );
END;
$$;

SELECT results_eq(
    'SELECT estado_acceso, app_role, nombre_usuario FROM public.usuarios_acceso WHERE user_id = ''00000000-0000-0000-0000-000000000201''',
    $$VALUES ('pendiente', 'observador', 'laura.fernandez')$$,
    'Signup debe crear automáticamente un perfil en estado pendiente con rol observador base'
);

-- Test 69: Signup con username inválido debe abortar la transacción
SELECT throws_ok(
    $$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), 'bad@example.invalid', '{"nombre": "A", "apellido": "B", "nombre_usuario": "USER_CON_MAYUSCULAS"}'::jsonb)$$,
    '23514',
    NULL,
    'Signup con nombre_usuario con formato inválido debe ser rechazado'
);

-- Test 70: Signup con username duplicado debe abortar la transacción
SELECT throws_ok(
    $$INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), 'dup@example.invalid', '{"nombre": "Otro", "apellido": "Usuario", "nombre_usuario": "laura.fernandez"}'::jsonb)$$,
    '23505',
    NULL,
    'Signup con nombre_usuario duplicado debe ser rechazado'
);

SELECT * FROM finish();

ROLLBACK;
