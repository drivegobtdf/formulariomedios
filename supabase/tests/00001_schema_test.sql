-- ==============================================================================
-- DATABASE TESTS (pgTAP): Supabase Schema v3
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- Instalar pgTAP si no está presente en la base de tests
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(28);

-- -----------------------------------------------------------------------------
-- 1. Tests de Catálogos (Categorías y Tipos de Servicio)
-- -----------------------------------------------------------------------------

-- Test 1: Verificar que existen exactamente 8 categorías en seed
SELECT results_eq(
    'SELECT count(*)::integer FROM public.categorias_servicio WHERE activo = true',
    ARRAY[8],
    'Deben existir exactamente 8 categorías de servicio activas'
);

-- Test 2: Verificar los 8 códigos de categoría contractuales
SELECT set_eq(
    'SELECT codigo_ped FROM public.categorias_servicio',
    ARRAY['D', 'C', 'G', 'R', 'P', 'M', 'S', 'W']::char(1)[],
    'Los códigos de categoría deben ser exactamente D, C, G, R, P, M, S, W'
);

-- Test 3: Verificar que existen 11 tipos de servicio en total
SELECT results_eq(
    'SELECT count(*)::integer FROM public.tipos_servicio WHERE activo = true',
    ARRAY[11],
    'Deben existir exactamente 11 tipos de servicio activos'
);

-- Test 4: Verificar que Diseño Gráfico tiene exactamente 4 tipos de servicio
SELECT results_eq(
    'SELECT count(*)::integer FROM public.tipos_servicio t JOIN public.categorias_servicio c ON t.categoria_id = c.id WHERE c.codigo_ped = ''D''',
    ARRAY[4],
    'La categoría Diseño Gráfico (D) debe tener exactamente 4 tipos de servicio'
);

-- -----------------------------------------------------------------------------
-- 2. Tests de envios_formulario
-- -----------------------------------------------------------------------------

-- Preparar datos de prueba para envíos
INSERT INTO public.envios_formulario (
    id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
) VALUES (
    'e0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'fp_test_1',
    'Juan Pérez',
    '+542901123456',
    'juan.perez@tierradelfuego.gob.ar',
    'Secretaría General',
    1
);

-- Test 5: Rechazar submission_key duplicado en envios_formulario
SELECT throws_ok(
    $$
    INSERT INTO public.envios_formulario (
        id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
    ) VALUES (
        'e0000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'fp_test_2',
        'María Gomez',
        '+542901654321',
        'maria@tierradelfuego.gob.ar',
        'Prensa',
        1
    );
    $$,
    '23505',
    NULL,
    'Debe rechazar submission_key duplicado en envios_formulario'
);

-- Test 6: Rechazar correo con formato inválido
SELECT throws_ok(
    $$
    INSERT INTO public.envios_formulario (
        id, submission_key, request_fingerprint, nombre_apellido, telefono, correo, area_solicitante, form_schema_version
    ) VALUES (
        'e0000000-0000-0000-0000-000000000003',
        gen_random_uuid(),
        'fp_test_3',
        'Pedro Lopez',
        '+542901111111',
        'correo_invalido_sin_arroba',
        'Prensa',
        1
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar correo con formato inválido en envios_formulario'
);

-- -----------------------------------------------------------------------------
-- 3. Tests de pedidos
-- -----------------------------------------------------------------------------

-- Insertar un pedido válido de prueba
INSERT INTO public.pedidos (
    id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
    estado, informacion_especifica, form_schema_version, version, tracking_token_version,
    tracking_token_hash, tracking_token_created_at
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'PED-2026-D000001',
    2026,
    1,
    'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    'D',
    'Nuevo',
    '{"titulo": "Flyer Institucional"}'::jsonb,
    1,
    1,
    1,
    'hash_token_test_1',
    now()
);

-- Test 7: Rechazar pedido_visible duplicado
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, informacion_especifica, form_schema_version, version, tracking_token_version,
        tracking_token_hash, tracking_token_created_at
    ) VALUES (
        'a0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000001',
        'PED-2026-D000001',
        2026,
        2,
        'a0000001-0000-0000-0000-000000000001',
        'b0000001-0000-0000-0000-000000000001',
        'D',
        'Nuevo',
        '{}'::jsonb,
        1,
        1,
        1,
        'hash_token_test_2',
        now()
    );
    $$,
    '23505',
    NULL,
    'Debe rechazar pedido_visible duplicado'
);

-- Test 8: Rechazar par (anio, numero) duplicado
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, informacion_especifica, form_schema_version, version, tracking_token_version,
        tracking_token_hash, tracking_token_created_at
    ) VALUES (
        'a0000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000000001',
        'PED-2026-D000002',
        2026,
        1,
        'a0000001-0000-0000-0000-000000000001',
        'b0000001-0000-0000-0000-000000000001',
        'D',
        'Nuevo',
        '{}'::jsonb,
        1,
        1,
        1,
        'hash_token_test_3',
        now()
    );
    $$,
    '23505',
    NULL,
    'Debe rechazar par (anio, numero) duplicado'
);

-- Test 9: Rechazar estado inválido en pedidos
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, informacion_especifica, form_schema_version, version, tracking_token_version,
        tracking_token_hash, tracking_token_created_at
    ) VALUES (
        'a0000000-0000-0000-0000-000000000004',
        'e0000000-0000-0000-0000-000000000001',
        'PED-2026-D000004',
        2026,
        4,
        'a0000001-0000-0000-0000-000000000001',
        'b0000001-0000-0000-0000-000000000001',
        'D',
        'EstadoInvalido',
        '{}'::jsonb,
        1,
        1,
        1,
        'hash_token_test_4',
        now()
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no permitido en pedidos'
);

-- Test 10: Rechazar tipo de servicio que no pertenece a la categoría (FK compuesta)
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, informacion_especifica, form_schema_version, version, tracking_token_version,
        tracking_token_hash, tracking_token_created_at
    ) VALUES (
        'a0000000-0000-0000-0000-000000000005',
        'e0000000-0000-0000-0000-000000000001',
        'PED-2026-C000005',
        2026,
        5,
        'a0000001-0000-0000-0000-000000000002', -- Cobertura de Eventos
        'b0000001-0000-0000-0000-000000000001', -- Tipo perteneciente a Diseño Gráfico!
        'C',
        'Nuevo',
        '{}'::jsonb,
        1,
        1,
        1,
        'hash_token_test_5',
        now()
    );
    $$,
    '23503',
    NULL,
    'Debe rechazar tipo_servicio_id que no pertenezca a categoria_id mediante FK compuesta'
);

-- -----------------------------------------------------------------------------
-- 4. Tests de usuarios_acceso
-- -----------------------------------------------------------------------------

-- Crear usuario ficticio en auth.users para FK
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000011', 'agente1@tierradelfuego.gob.ar')
ON CONFLICT (id) DO NOTHING;

-- Test 11: Aceptar username válido en formato lowercase
SELECT lives_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000011',
        'Carlos',
        'Pérez',
        'carlos.perez',
        'pendiente',
        'equipo'
    );
    $$,
    'Debe permitir insertar usuario_acceso con username válido'
);

-- Crear otro usuario en auth.users
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000012', 'agente2@tierradelfuego.gob.ar')
ON CONFLICT (id) DO NOTHING;

-- Test 12: Rechazar username con mayúsculas
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'AnaGomez',
        'pendiente',
        'equipo'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar nombre_usuario con mayúsculas'
);

-- Test 13: Rechazar username con espacios
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'ana gomez',
        'pendiente',
        'equipo'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar nombre_usuario con espacios'
);

-- Test 14: Rechazar username con longitud menor a 2 caracteres
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'a',
        'pendiente',
        'equipo'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar nombre_usuario menor a 2 caracteres'
);

-- Test 15: Rechazar username con longitud mayor a 30 caracteres
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'este.nombre.de.usuario.es.demasiado.largo.para.el.sistema',
        'pendiente',
        'equipo'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar nombre_usuario mayor a 30 caracteres'
);

-- Test 16: Rechazar app_role inválido
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'ana.gomez',
        'pendiente',
        'superadmin_invalido'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar rol de aplicación no documentado'
);

-- Test 17: Rechazar estado_acceso inválido
SELECT throws_ok(
    $$
    INSERT INTO public.usuarios_acceso (
        user_id, nombre, apellido, nombre_usuario, estado_acceso, app_role
    ) VALUES (
        '00000000-0000-0000-0000-000000000012',
        'Ana',
        'Gomez',
        'ana.gomez',
        'estado_no_valido',
        'equipo'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado_acceso no documentado'
);

-- -----------------------------------------------------------------------------
-- 5. Tests de Archivos Google Drive y Relaciones N:M
-- -----------------------------------------------------------------------------

-- Insertar archivo válido
INSERT INTO public.archivos (
    id, provider, drive_file_id, nombre_original, mime_type, size_bytes, contexto, estado
) VALUES (
    'f0000000-0000-0000-0000-000000000001',
    'google_drive',
    'drive_file_id_test_1',
    'manual_marca.pdf',
    'application/pdf',
    1048576,
    'solicitud',
    'uploaded'
);

-- Test 18: Rechazar provider distinto de google_drive
SELECT throws_ok(
    $$
    INSERT INTO public.archivos (
        id, provider, drive_file_id, nombre_original, mime_type, size_bytes, contexto, estado
    ) VALUES (
        'f0000000-0000-0000-0000-000000000002',
        'supabase_storage_no_permitido',
        'drive_file_id_test_2',
        'foto.png',
        'image/png',
        2048,
        'solicitud',
        'uploaded'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar provider distinto de google_drive'
);

-- Test 19: Rechazar contexto inválido
SELECT throws_ok(
    $$
    INSERT INTO public.archivos (
        id, provider, drive_file_id, nombre_original, mime_type, size_bytes, contexto, estado
    ) VALUES (
        'f0000000-0000-0000-0000-000000000003',
        'google_drive',
        'drive_file_id_test_3',
        'foto.png',
        'image/png',
        2048,
        'contexto_invalido',
        'uploaded'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar contexto de archivo inválido'
);

-- Test 20: Rechazar estado de archivo inválido
SELECT throws_ok(
    $$
    INSERT INTO public.archivos (
        id, provider, drive_file_id, nombre_original, mime_type, size_bytes, contexto, estado
    ) VALUES (
        'f0000000-0000-0000-0000-000000000004',
        'google_drive',
        'drive_file_id_test_4',
        'foto.png',
        'image/png',
        2048,
        'solicitud',
        'estado_invalido'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado de archivo inválido'
);

-- Test 21: Rechazar size_bytes negativo
SELECT throws_ok(
    $$
    INSERT INTO public.archivos (
        id, provider, drive_file_id, nombre_original, mime_type, size_bytes, contexto, estado
    ) VALUES (
        'f0000000-0000-0000-0000-000000000005',
        'google_drive',
        'drive_file_id_test_5',
        'foto.png',
        'image/png',
        -100,
        'solicitud',
        'uploaded'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar size_bytes negativo en archivos'
);

-- Test 22: Asociación N:M válida entre archivo y pedido
SELECT lives_ok(
    $$
    INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
    VALUES ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    $$,
    'Debe permitir asociar archivo y pedido en relación N:M'
);

-- Test 23: Rechazar asociación duplicada entre el mismo archivo y el mismo pedido
SELECT throws_ok(
    $$
    INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
    VALUES ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    $$,
    '23505',
    NULL,
    'Debe rechazar asociación duplicada en archivo_pedido (PK compuesta)'
);

-- -----------------------------------------------------------------------------
-- 6. Tests de Enlaces de Material
-- -----------------------------------------------------------------------------

-- Test 24: Rechazar enlaces no HTTPS
SELECT throws_ok(
    $$
    INSERT INTO public.enlaces_material (id, envio_id, url)
    VALUES ('00000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000001', 'http://inseguro.com/material');
    $$,
    '23514',
    NULL,
    'Debe rechazar URLs de material que no usen HTTPS'
);

-- -----------------------------------------------------------------------------
-- 7. Tests de Solicitudes de Información y Notas
-- -----------------------------------------------------------------------------

-- Test 25: Rechazar estado inválido en solicitudes de información
SELECT throws_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000031',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Por favor adjuntar logo en alta resolución',
        'token_info_hash_1',
        'estado_invalido',
        now() + interval '3 days'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado inválido en solicitudes_informacion'
);

-- Test 26: Rechazar visibilidad inválida en notas
SELECT throws_ok(
    $$
    INSERT INTO public.notas_pedido (
        id, pedido_id, autor_user_id, visibilidad, texto
    ) VALUES (
        '00000000-0000-0000-0000-000000000041',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'visibilidad_invalida',
        'Nota de prueba'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar visibilidad no permitida en notas_pedido'
);

-- -----------------------------------------------------------------------------
-- 8. Tests de Entregas Versionadas
-- -----------------------------------------------------------------------------

-- Test 27: Rechazar entrega que no contiene ni archivo ni enlace
SELECT throws_ok(
    $$
    INSERT INTO public.entregas_pedido (
        id, pedido_id, version, entregado_por
    ) VALUES (
        '00000000-0000-0000-0000-000000000051',
        'a0000000-0000-0000-0000-000000000001',
        1,
        '00000000-0000-0000-0000-000000000011'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar entrega sin archivo_id ni enlace_externo'
);

-- -----------------------------------------------------------------------------
-- 9. Tests de Trigger updated_at
-- -----------------------------------------------------------------------------

-- Test 28: Comprobar que trigger updated_at actualiza el timestamp al modificar un pedido
UPDATE public.pedidos SET version = version + 1 WHERE id = 'a0000000-0000-0000-0000-000000000001';

SELECT ok(
    (SELECT updated_at FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000001') >= (SELECT created_at FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000001'),
    'Trigger updated_at mantiene actualizado el timestamp al modificar un registro'
);

SELECT * FROM finish();

ROLLBACK;
