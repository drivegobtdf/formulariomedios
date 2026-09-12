-- ==============================================================================
-- TEST 004: F5 Submission Sessions, Upload Reservations & File Integration Tests
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(38);

-- =============================================================================
-- 1. Verificación de Tablas, Columnas y Constraints (Schema DDL)
-- =============================================================================

-- Test 1: Existencia de la tabla submission_sessions
SELECT has_table('public'::name, 'submission_sessions'::name, 'Tabla submission_sessions debe existir');

-- Test 2: Columnas de submission_sessions
SELECT columns_are('public'::name, 'submission_sessions'::name, ARRAY[
    'id',
    'submission_key',
    'capability_hash',
    'form_schema_version',
    'estado',
    'envio_id',
    'expires_at',
    'created_at'
], 'Tabla submission_sessions debe tener todas las columnas requeridas');

-- Test 3: Columnas nuevas/alineadas en upload_reservations
SELECT has_column('public'::name, 'upload_reservations'::name, 'session_id'::name, 'upload_reservations debe tener columna session_id');
SELECT has_column('public'::name, 'upload_reservations'::name, 'client_file_ref'::name, 'upload_reservations debe tener columna client_file_ref');
SELECT has_column('public'::name, 'upload_reservations'::name, 'drive_file_id'::name, 'upload_reservations debe tener columna drive_file_id');
SELECT has_column('public'::name, 'upload_reservations'::name, 'targets'::name, 'upload_reservations debe tener columna targets');

-- Test 7: Unique constraint en upload_reservations (session_id, client_file_ref)
SELECT col_is_unique(
    'public'::name,
    'upload_reservations'::name,
    ARRAY['session_id'::name, 'client_file_ref'::name],
    'upload_reservations debe tener UNIQUE(session_id, client_file_ref)'
);

-- Test 8: RLS activo en submission_sessions
SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'submission_sessions'),
    'RLS debe estar activo en submission_sessions'
);

-- =============================================================================
-- 2. Verificación de Aislamiento y Políticas RLS
-- =============================================================================

-- Crear usuarios de prueba para verificar RLS
INSERT INTO auth.users (id, email)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin.f5@example.invalid'),
    ('a0000000-0000-0000-0000-000000000002', 'equipo.f5@example.invalid'),
    ('a0000000-0000-0000-0000-000000000003', 'observador.f5@example.invalid'),
    ('a0000000-0000-0000-0000-000000000004', 'pendiente.f5@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios_acceso (user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role, aprobado_at)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Admin', 'F5', 'admin.f5', 'aprobado', 'administrador', now()),
    ('a0000000-0000-0000-0000-000000000002', 'Equipo', 'F5', 'equipo.f5', 'aprobado', 'equipo', now()),
    ('a0000000-0000-0000-0000-000000000003', 'Obs', 'F5', 'obs.f5', 'aprobado', 'observador', now()),
    ('a0000000-0000-0000-0000-000000000004', 'Pen', 'F5', 'pen.f5', 'pendiente', 'observador', NULL)
ON CONFLICT (user_id) DO UPDATE SET
    estado_acceso = EXCLUDED.estado_acceso,
    app_role = EXCLUDED.app_role,
    aprobado_at = EXCLUDED.aprobado_at;

-- Crear datos de prueba (sesión, archivo, reserva) como service_role/superuser
INSERT INTO public.submission_sessions (
    id, submission_key, capability_hash, form_schema_version, estado, expires_at
) VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'hash_capability_test_123',
    3,
    'abierta',
    now() + interval '2 hours'
);

INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'google_drive',
    'drive_file_id_test_001',
    'drive_parent_staging_001',
    'documento_aprobado.pdf',
    'application/pdf',
    2048576,
    'sha256_mock_hash_001',
    'solicitud',
    'verified'
);

INSERT INTO public.upload_reservations (
    id, session_id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'drive_file_id_test_001',
    'documento_aprobado.pdf',
    2048576,
    'application/pdf',
    'completed',
    now() + interval '2 hours'
);

-- Test 9: Anon no puede leer submission_sessions (throws 42501)
SET ROLE anon;
SET request.jwt.claim.role = 'anon';
SELECT throws_ok(
    'SELECT * FROM public.submission_sessions',
    '42501',
    NULL,
    'Anon no puede leer submission_sessions'
);

-- Test 10: Usuario pendiente no puede leer submission_sessions (throws 42501)
SET ROLE authenticated;
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT throws_ok(
    'SELECT * FROM public.submission_sessions',
    '42501',
    NULL,
    'Usuario pendiente no puede leer submission_sessions'
);

-- Test 11: Usuario equipo no puede leer submission_sessions (tabla técnica backend-only, throws 42501)
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
    'SELECT * FROM public.submission_sessions WHERE id = ''b0000000-0000-0000-0000-000000000001''',
    '42501',
    NULL,
    'Usuario equipo no puede leer directamente submission_sessions técnicas'
);

-- Test 12: Usuario admin no puede leer submission_sessions directamente (tabla técnica backend-only, throws 42501)
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
    'SELECT * FROM public.submission_sessions WHERE id = ''b0000000-0000-0000-0000-000000000001''',
    '42501',
    NULL,
    'Usuario admin no puede leer directamente submission_sessions técnicas'
);

-- Test 13: Usuario observador NO puede leer submission_sessions (tabla técnica backend-only, throws 42501)
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT throws_ok(
    'SELECT * FROM public.submission_sessions WHERE id = ''b0000000-0000-0000-0000-000000000001''',
    '42501',
    NULL,
    'Usuario observador no puede leer submission_sessions técnicas'
);

-- Test 14: Usuario observador SÍ puede leer archivos verificados asociados a solicitudes
SELECT results_eq(
    'SELECT count(*)::integer FROM public.archivos WHERE id = ''d0000000-0000-0000-0000-000000000001''',
    ARRAY[1],
    'Usuario observador puede leer metadata de archivos de pedidos'
);

-- Test 15: Anon no puede insertar en submission_sessions
SET ROLE anon;
SET request.jwt.claim.role = 'anon';
SELECT throws_ok(
    $$INSERT INTO public.submission_sessions (submission_key, capability_hash, expires_at) VALUES (gen_random_uuid(), 'hash', now())$$,
    '42501',
    NULL,
    'Anon no puede insertar en submission_sessions'
);

-- Test 16: Authenticated no puede insertar en submission_sessions
SET ROLE authenticated;
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
    $$INSERT INTO public.submission_sessions (submission_key, capability_hash, expires_at) VALUES (gen_random_uuid(), 'hash', now())$$,
    '42501',
    NULL,
    'Authenticated no puede insertar directamente en submission_sessions'
);

-- =============================================================================
-- 3. Verificación de Creación Multi-PED Atómica con Archivos Verificados (F5 Core)
-- =============================================================================

RESET ROLE;

-- Test 17: Creación exitosa de 1 Envío + 1 PED + 1 Archivo Verificado
SELECT lives_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "María Gómez",
            "telefono": "+542901445566",
            "correo": "maria.gomez@tierradelfuego.gob.ar",
            "area_solicitante": "Dirección Provincial de Medios"
        },
        "pedidos": [
            {
                "client_request_ref": "11111111-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss",
                "informacion_especifica": {"titulo": "Flyer Institucional F5"}
            }
        ],
        "file_bindings": [
            {
                "client_file_ref": "f0000000-0000-0000-0000-000000000001",
                "expected_name": "documento_aprobado.pdf",
                "expected_size": 2048576,
                "mime_type": "application/pdf",
                "targets": "all"
            }
        ]
    }'::jsonb);
    $$,
    'Creación de 1 envío con 1 PED y 1 archivo verificado debe ejecutarse con éxito'
);

-- Test 18: Sesión confirmada y vinculada a envio_id
SELECT results_eq(
    $$SELECT estado, envio_id IS NOT NULL FROM public.submission_sessions WHERE id = 'b0000000-0000-0000-0000-000000000001'$$,
    $$VALUES ('confirmada'::text, true)$$,
    'submission_sessions debe transicionar a confirmada y tener envio_id'
);

-- Test 19: upload_reservations completada y vinculada a envio_id
SELECT results_eq(
    $$SELECT state, envio_id IS NOT NULL FROM public.upload_reservations WHERE id = 'e0000000-0000-0000-0000-000000000001'$$,
    $$VALUES ('completed'::text, true)$$,
    'upload_reservations debe transicionar a completed y tener envio_id'
);

-- Test 20: archivo_pedido tiene 1 asociación creada
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.archivo_pedido WHERE archivo_id = 'd0000000-0000-0000-0000-000000000001'$$,
    ARRAY[1],
    'archivo_pedido debe contener exactamente 1 fila asociada al pedido'
);

-- Test 21: Idempotent Replay con archivos devuelve el mismo envio_id y lista de archivos
SELECT results_eq(
    $$
    SELECT (res->>'idempotent_replay')::boolean, jsonb_array_length(res->'archivos')
    FROM public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "María Gómez",
            "telefono": "+542901445566",
            "correo": "maria.gomez@tierradelfuego.gob.ar",
            "area_solicitante": "Dirección Provincial de Medios"
        },
        "pedidos": [
            {
                "client_request_ref": "11111111-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss",
                "informacion_especifica": {"titulo": "Flyer Institucional F5"}
            }
        ],
        "file_bindings": [
            {
                "client_file_ref": "f0000000-0000-0000-0000-000000000001",
                "expected_name": "documento_aprobado.pdf",
                "expected_size": 2048576,
                "mime_type": "application/pdf",
                "targets": "all"
            }
        ]
    }'::jsonb) AS res;
    $$,
    $$VALUES (true, 1)$$,
    'Replay idempotente con archivo debe retornar idempotent_replay = true y 1 archivo'
);

-- =============================================================================
-- 4. Multi-PED con Archivo General vs Específico (N:M Targeting)
-- =============================================================================

-- Setup para Multi-PED (3 PEDs, 1 archivo general 'all', 1 archivo específico para PED 2)
INSERT INTO public.submission_sessions (
    id, submission_key, capability_hash, form_schema_version, estado, expires_at
) VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002',
    'hash_multi_test_456',
    3,
    'abierta',
    now() + interval '2 hours'
);

INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES
    ('d0000000-0000-0000-0000-000000000002', 'google_drive', 'drive_file_id_002', 'parent_002', 'logo_general.png', 'image/png', 512000, 'sha2', 'solicitud', 'verified'),
    ('d0000000-0000-0000-0000-000000000003', 'google_drive', 'drive_file_id_003', 'parent_003', 'guion_especifico.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 102400, 'sha3', 'solicitud', 'verified');

INSERT INTO public.upload_reservations (
    id, session_id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'drive_file_id_002', 'logo_general.png', 512000, 'image/png', 'completed', now() + interval '2 hours'),
    ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'drive_file_id_003', 'guion_especifico.docx', 102400, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'completed', now() + interval '2 hours');

-- Test 22: Crear Envío con 3 PEDs y 2 Archivos (1 general, 1 específico)
SELECT lives_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000002",
        "contacto": {
            "nombre_apellido": "Pedro Juárez",
            "telefono": "+542901998877",
            "correo": "pedro.juarez@tierradelfuego.gob.ar",
            "area_solicitante": "Secretaría General"
        },
        "pedidos": [
            {
                "client_request_ref": "22222222-0000-0000-0000-000000000001",
                "categoria_slug": "diseno_grafico",
                "tipo_slug": "flyer_rrss",
                "informacion_especifica": {"titulo": "Pieza 1"}
            },
            {
                "client_request_ref": "22222222-0000-0000-0000-000000000002",
                "categoria_slug": "produccion_audiovisual",
                "tipo_slug": "produccion_audiovisual",
                "informacion_especifica": {"titulo": "Pieza 2"}
            },
            {
                "client_request_ref": "22222222-0000-0000-0000-000000000003",
                "categoria_slug": "gacetilla",
                "tipo_slug": "gacetilla",
                "informacion_especifica": {"titulo": "Pieza 3"}
            }
        ],
        "file_bindings": [
            {
                "client_file_ref": "f0000000-0000-0000-0000-000000000002",
                "expected_name": "logo_general.png",
                "expected_size": 512000,
                "mime_type": "image/png",
                "targets": "all"
            },
            {
                "client_file_ref": "f0000000-0000-0000-0000-000000000003",
                "expected_name": "guion_especifico.docx",
                "expected_size": 102400,
                "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "targets": ["22222222-0000-0000-0000-000000000002"]
            }
        ]
    }'::jsonb);
    $$,
    'Creación multi-PED con archivo general y específico debe tener éxito'
);

-- Test 23: Archivo general asociado a los 3 PEDs
SELECT results_eq(
    $$SELECT count(*)::integer FROM public.archivo_pedido WHERE archivo_id = 'd0000000-0000-0000-0000-000000000002'$$,
    ARRAY[3],
    'Archivo general (targets: all) debe asociarse a los 3 pedidos'
);

-- Test 24: Archivo específico asociado únicamente al PED 2
SELECT results_eq(
    $$
    SELECT p.client_request_ref
    FROM public.archivo_pedido ap
    JOIN public.pedidos p ON p.id = ap.pedido_id
    WHERE ap.archivo_id = 'd0000000-0000-0000-0000-000000000003'
    $$,
    $$VALUES ('22222222-0000-0000-0000-000000000002'::uuid)$$,
    'Archivo específico debe asociarse únicamente al pedido indicado'
);

-- =============================================================================
-- 5. Casos de Error, Rechazo y Rollback Atómico (Invariantes de Almacenamiento)
-- =============================================================================

-- Test 25: Rechazar más de 10 archivos (>10 file_bindings)
SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000099",
        "contacto": {
            "nombre_apellido": "Test Exceso",
            "telefono": "12345",
            "correo": "exceso@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "33333333-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [
            {"client_file_ref": "f0000000-0000-0000-0000-000000000001", "expected_name": "f1.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000002", "expected_name": "f2.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000003", "expected_name": "f3.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000004", "expected_name": "f4.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000005", "expected_name": "f5.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000006", "expected_name": "f6.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000007", "expected_name": "f7.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000008", "expected_name": "f8.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000009", "expected_name": "f9.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000010", "expected_name": "f10.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000011", "expected_name": "f11.pdf", "expected_size": 100, "mime_type": "application/pdf"}
        ]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar más de 10 archivos en un envío con MAX_FILES_EXCEEDED'
);

-- Test 26: Rechazar archivo con tamaño > 10 MB (10485761 bytes)
INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000010', 'google_drive', 'drive_big_file', 'p', 'archivo_grande.zip', 'application/zip', 10485761, 'sha', 'solicitud', 'verified'
);
INSERT INTO public.upload_reservations (
    id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 'drive_big_file', 'archivo_grande.zip', 10485761, 'application/zip', 'completed', now() + interval '2 hours'
);

SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000010",
        "contacto": {
            "nombre_apellido": "Test Grande",
            "telefono": "12345",
            "correo": "grande@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "44444444-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "f0000000-0000-0000-0000-000000000010", "expected_name": "archivo_grande.zip", "expected_size": 10485761, "mime_type": "application/zip"}]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar archivo mayor a 10 MB con FILE_SIZE_EXCEEDED'
);

-- Test 27: Rechazar archivo con MIME no soportado (ej. video/mp4 que queda en OPEN-014)
INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000020', 'google_drive', 'drive_video_file', 'p', 'video.mp4', 'video/mp4', 5000000, 'sha', 'solicitud', 'verified'
);
INSERT INTO public.upload_reservations (
    id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000020', 'f0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000020', 'drive_video_file', 'video.mp4', 5000000, 'video/mp4', 'completed', now() + interval '2 hours'
);

SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000020",
        "contacto": {
            "nombre_apellido": "Test Video",
            "telefono": "12345",
            "correo": "video@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "55555555-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "f0000000-0000-0000-0000-000000000020", "expected_name": "video.mp4", "expected_size": 5000000, "mime_type": "video/mp4"}]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar tipo MIME no soportado en baseline (ej. video/mp4) con FILE_MIME_UNSUPPORTED'
);

-- Test 28: Rechazar archivo no verificado en storage (estado reserved en archivos)
INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000030', 'google_drive', NULL, 'p', 'sin_verificar.pdf', 'application/pdf', 1000, 'sha', 'solicitud', 'reserved'
);
INSERT INTO public.upload_reservations (
    id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000030', 'f0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000030', NULL, 'sin_verificar.pdf', 1000, 'application/pdf', 'pending', now() + interval '2 hours'
);

SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000030",
        "contacto": {
            "nombre_apellido": "Test Sin Verificar",
            "telefono": "12345",
            "correo": "sinverificar@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "66666666-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "f0000000-0000-0000-0000-000000000030", "expected_name": "sin_verificar.pdf", "expected_size": 1000, "mime_type": "application/pdf"}]
    }'::jsonb);
    $$,
    '55000',
    NULL,
    'Debe rechazar archivo no verificado con FILE_NOT_VERIFIED (55000)'
);

-- Test 29: Verificar que el fallo anterior ejecutó ROLLBACK total (no existe envío)
SELECT is_empty(
    $$SELECT * FROM public.envios_formulario WHERE submission_key = 'c0000000-0000-0000-0000-000000000030'$$,
    'Rollback total: no debe haberse insertado ningún registro en envios_formulario'
);

-- Test 30: Rechazar sesión expirada
INSERT INTO public.submission_sessions (
    id, submission_key, capability_hash, form_schema_version, estado, expires_at
) VALUES (
    'b0000000-0000-0000-0000-000000000040',
    'c0000000-0000-0000-0000-000000000040',
    'hash_expired',
    3,
    'abierta',
    now() - interval '1 hour'
);

SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000040",
        "contacto": {
            "nombre_apellido": "Test Expirada",
            "telefono": "12345",
            "correo": "expirada@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "77777777-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar envío con sesión expirada (SESSION_EXPIRED)'
);

-- Test 31: Rechazar target de archivo que no coincide con ningún client_request_ref
SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000050",
        "contacto": {
            "nombre_apellido": "Test Target Invalido",
            "telefono": "12345",
            "correo": "targetinvalido@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "88888888-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [
            {
                "client_file_ref": "f0000000-0000-0000-0000-000000000001",
                "expected_name": "documento_aprobado.pdf",
                "expected_size": 2048576,
                "mime_type": "application/pdf",
                "targets": ["99999999-9999-9999-9999-999999999999"]
            }
        ]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar target de archivo que no coincide con ningún client_request_ref'
);

-- Test 32: Rechazar client_file_ref duplicado dentro del mismo envío
SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000060",
        "contacto": {
            "nombre_apellido": "Test Duplicado",
            "telefono": "12345",
            "correo": "duplicado@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "99999999-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [
            {"client_file_ref": "f0000000-0000-0000-0000-000000000001", "expected_name": "doc1.pdf", "expected_size": 100, "mime_type": "application/pdf"},
            {"client_file_ref": "f0000000-0000-0000-0000-000000000001", "expected_name": "doc2.pdf", "expected_size": 100, "mime_type": "application/pdf"}
        ]
    }'::jsonb);
    $$,
    '23505',
    NULL,
    'Debe rechazar client_file_ref duplicado en el mismo envío'
);

-- Test 33: Rechazar archivo con client_file_ref no UUID
SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000070",
        "contacto": {
            "nombre_apellido": "Test No UUID",
            "telefono": "12345",
            "correo": "nouuid@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "aaaaaaaa-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "no-un-uuid", "expected_name": "doc.pdf", "expected_size": 100, "mime_type": "application/pdf"}]
    }'::jsonb);
    $$,
    '22023',
    NULL,
    'Debe rechazar client_file_ref con formato inválido'
);

-- Test 34: Rechazar conflicto de idempotencia (mismo submission_key con payload distinto)
SELECT throws_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000001",
        "contacto": {
            "nombre_apellido": "Nombre Distinto Para Conflicto",
            "telefono": "+542901445566",
            "correo": "distinto@tierradelfuego.gob.ar",
            "area_solicitante": "Otra Área"
        },
        "pedidos": [{"client_request_ref": "11111111-0000-0000-0000-000000000001", "categoria_slug": "diseno_grafico", "tipo_slug": "flyer_rrss"}]
    }'::jsonb);
    $$,
    '40001',
    NULL,
    'Debe arrojar IDEMPOTENCY_CONFLICT (40001) cuando submission_key se reutiliza con distinto payload'
);

-- Test 35: Evento submission.created registra conteo de archivos
SELECT results_eq(
    $$
    SELECT (payload->>'archivos_count')::integer
    FROM public.domain_events
    WHERE aggregate_id = (SELECT id FROM public.envios_formulario WHERE submission_key = 'c0000000-0000-0000-0000-000000000001')
    $$,
    ARRAY[1],
    'El evento domain_events submission.created debe registrar archivos_count = 1'
);

-- Test 36: Audit log registra metadata de archivos
SELECT results_eq(
    $$
    SELECT (metadata->>'archivos_count')::integer
    FROM public.audit_log
    WHERE recurso_id = (SELECT id::text FROM public.envios_formulario WHERE submission_key = 'c0000000-0000-0000-0000-000000000001')
    $$,
    ARRAY[1],
    'El audit_log debe registrar archivos_count en metadata'
);

-- Test 37: Subida de ZIP permitida en baseline contractual
INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000080', 'google_drive', 'drive_zip_file', 'p', 'recursos.zip', 'application/zip', 1048576, 'sha_zip', 'solicitud', 'verified'
);
INSERT INTO public.upload_reservations (
    id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000080', 'f0000000-0000-0000-0000-000000000080', 'd0000000-0000-0000-0000-000000000080', 'drive_zip_file', 'recursos.zip', 1048576, 'application/zip', 'completed', now() + interval '2 hours'
);

SELECT lives_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000080",
        "contacto": {
            "nombre_apellido": "Test ZIP",
            "telefono": "12345",
            "correo": "zip@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "bbbbbbbb-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "f0000000-0000-0000-0000-000000000080", "expected_name": "recursos.zip", "expected_size": 1048576, "mime_type": "application/zip"}]
    }'::jsonb);
    $$,
    'Archivo ZIP válido dentro de 10 MB debe ser aceptado'
);

-- Test 38: Subida de JPG/JPEG permitida en baseline contractual
INSERT INTO public.archivos (
    id, provider, drive_file_id, drive_parent_id, nombre_original, mime_type, size_bytes, sha256, contexto, estado
) VALUES (
    'd0000000-0000-0000-0000-000000000081', 'google_drive', 'drive_jpg_file', 'p', 'foto.jpeg', 'image/jpeg', 2048576, 'sha_jpg', 'solicitud', 'verified'
);
INSERT INTO public.upload_reservations (
    id, client_file_ref, archivo_id, drive_file_id, expected_name, expected_size, expected_mime, state, expires_at
) VALUES (
    'e0000000-0000-0000-0000-000000000081', 'f0000000-0000-0000-0000-000000000081', 'd0000000-0000-0000-0000-000000000081', 'drive_jpg_file', 'foto.jpeg', 2048576, 'image/jpeg', 'completed', now() + interval '2 hours'
);

SELECT lives_ok(
    $$
    SELECT public.submission_create_core('{
        "schema_version": 3,
        "submission_key": "c0000000-0000-0000-0000-000000000081",
        "contacto": {
            "nombre_apellido": "Test JPG",
            "telefono": "12345",
            "correo": "jpg@tierradelfuego.gob.ar",
            "area_solicitante": "Área"
        },
        "pedidos": [{"client_request_ref": "cccccccc-0000-0000-0000-000000000001", "categoria_slug": "gacetilla", "tipo_slug": "gacetilla"}],
        "file_bindings": [{"client_file_ref": "f0000000-0000-0000-0000-000000000081", "expected_name": "foto.jpeg", "expected_size": 2048576, "mime_type": "image/jpeg"}]
    }'::jsonb);
    $$,
    'Archivo JPEG válido dentro de 10 MB debe ser aceptado'
);

SELECT * FROM finish();

ROLLBACK;
