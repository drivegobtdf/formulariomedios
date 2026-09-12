-- ==============================================================================
-- DATABASE TESTS (pgTAP): Supabase Schema v3 Contractual Suite
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(47);

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

-- Test 3: Verificar los 8 nombres visibles contractuales exactos de las categorías
SELECT set_eq(
    'SELECT slug, codigo_ped, nombre FROM public.categorias_servicio',
    $$VALUES 
        ('diseno_grafico', 'D'::bpchar, 'Diseño gráfico'),
        ('cobertura_eventos', 'C'::bpchar, 'Cobertura de eventos'),
        ('gacetilla', 'G'::bpchar, 'Gacetilla de prensa'),
        ('redes_sociales', 'R'::bpchar, 'Publicaciones en redes sociales'),
        ('produccion_audiovisual', 'P'::bpchar, 'Producción audiovisual'),
        ('motion_graphics', 'M'::bpchar, 'Animación y motion graphics'),
        ('streaming', 'S'::bpchar, 'Transmisión en vivo / streaming'),
        ('sitios_web', 'W'::bpchar, 'Sitios y contenidos web')
    $$,
    'Las 8 categorías deben tener exactamente sus slugs, códigos y nombres visibles contractuales'
);

-- Test 4: Verificar que existen 11 tipos de servicio en total
SELECT results_eq(
    'SELECT count(*)::integer FROM public.tipos_servicio WHERE activo = true',
    ARRAY[11],
    'Deben existir exactamente 11 tipos de servicio activos'
);

-- Test 5: Verificar que Diseño Gráfico tiene exactamente 4 tipos de servicio
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

-- Test 6: Rechazar submission_key duplicado en envios_formulario
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

-- Test 7: Rechazar correo con formato inválido
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
-- 3. Tests de pedidos: Unicidad, Estados Contractuales y FK Compuesta
-- -----------------------------------------------------------------------------

-- Insertar un pedido base válido de prueba
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

-- Test 8: Rechazar pedido_visible duplicado
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

-- Test 9: Rechazar par (anio, numero) duplicado
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

-- Tests 10-15: Aceptar los 6 Estados Contractuales de PED
-- Test 10: Estado 'Nuevo'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000010',
        2026, 10, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Nuevo', 'token_h_10'
    );
    $$,
    'PED debe aceptar estado contractual: Nuevo'
);

-- Test 11: Estado 'En revisión'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000011',
        2026, 11, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'En revisión', 'token_h_11'
    );
    $$,
    'PED debe aceptar estado contractual: En revisión'
);

-- Test 12: Estado 'En proceso'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000012',
        2026, 12, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'En proceso', 'token_h_12'
    );
    $$,
    'PED debe aceptar estado contractual: En proceso'
);

-- Test 13: Estado 'Esperando información'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000013',
        2026, 13, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Esperando información', 'token_h_13'
    );
    $$,
    'PED debe aceptar estado contractual: Esperando información'
);

-- Test 14: Estado 'Finalizado'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000014',
        2026, 14, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Finalizado', 'token_h_14'
    );
    $$,
    'PED debe aceptar estado contractual: Finalizado'
);

-- Test 15: Estado 'Cancelado'
SELECT lives_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000015',
        2026, 15, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Cancelado', 'token_h_15'
    );
    $$,
    'PED debe aceptar estado contractual: Cancelado'
);

-- Tests 16-21: Rechazar Estados Inválidos/Antiguos de PED
-- Test 16: Rechazar 'En Gestión'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000016',
        2026, 16, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'En Gestión', 'token_h_16'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: En Gestión'
);

-- Test 17: Rechazar 'Esperando Respuesta'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000017',
        2026, 17, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Esperando Respuesta', 'token_h_17'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: Esperando Respuesta'
);

-- Test 18: Rechazar 'Listo para Retirar'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000018', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000018',
        2026, 18, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Listo para Retirar', 'token_h_18'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: Listo para Retirar'
);

-- Test 19: Rechazar 'Asignado'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000019', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000019',
        2026, 19, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Asignado', 'token_h_19'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: Asignado'
);

-- Test 20: Rechazar 'Correcciones'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000020', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000020',
        2026, 20, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'Correcciones', 'token_h_20'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: Correcciones'
);

-- Test 21: Rechazar 'cualquier_otro'
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000001', 'PED-2026-D000021',
        2026, 21, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'D',
        'cualquier_otro', 'token_h_21'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual genérico'
);

-- Test 22: Rechazar tipo de servicio que no pertenece a la categoría (FK compuesta)
SELECT throws_ok(
    $$
    INSERT INTO public.pedidos (
        id, envio_id, pedido_visible, anio, numero, categoria_id, tipo_servicio_id, codigo_categoria,
        estado, tracking_token_hash
    ) VALUES (
        'a0000000-0000-0000-0000-000000000022',
        'e0000000-0000-0000-0000-000000000001',
        'PED-2026-C000022',
        2026,
        22,
        'a0000001-0000-0000-0000-000000000002', -- Cobertura de eventos
        'b0000001-0000-0000-0000-000000000001', -- Tipo perteneciente a Diseño gráfico!
        'C',
        'Nuevo',
        'token_h_22'
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

-- Test 23: Aceptar username válido en formato lowercase
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

-- Test 24: Rechazar username con mayúsculas
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

-- Test 25: Rechazar username con espacios
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

-- Test 26: Rechazar username con longitud menor a 2 caracteres
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

-- Test 27: Rechazar username con longitud mayor a 30 caracteres
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

-- Test 28: Rechazar app_role inválido
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

-- Test 29: Rechazar estado_acceso inválido
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
-- 5. Tests de pedido_asignaciones (Estructura Contractual y Registro)
-- -----------------------------------------------------------------------------

-- Test 30: Verificar columnas exactas de pedido_asignaciones
SELECT columns_are(
    'public',
    'pedido_asignaciones',
    ARRAY['id', 'pedido_id', 'responsable_anterior', 'responsable_nuevo', 'asignado_por', 'motivo', 'created_at'],
    'pedido_asignaciones debe contener exactamente las columnas contractuales v3'
);

-- Test 31: Permitir insertar asignación válida
SELECT lives_ok(
    $$
    INSERT INTO public.pedido_asignaciones (
        pedido_id, responsable_anterior, responsable_nuevo, asignado_por, motivo
    ) VALUES (
        'a0000000-0000-0000-0000-000000000001',
        NULL,
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000011',
        'Asignación inicial de diseño'
    );
    $$,
    'Debe permitir registrar una asignación contractual'
);

-- -----------------------------------------------------------------------------
-- 6. Tests de Solicitudes de Información (3 Estados Permitidos, 'cancelada' Rechazada)
-- -----------------------------------------------------------------------------

-- Test 32: Aceptar estado 'pendiente'
SELECT lives_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000031',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Adjuntar archivo vector',
        'token_info_h_31',
        'pendiente',
        now() + interval '3 days'
    );
    $$,
    'solicitudes_informacion debe aceptar estado: pendiente'
);

-- Test 33: Aceptar estado 'respondida'
SELECT lives_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000032',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Adjuntar texto final',
        'token_info_h_32',
        'respondida',
        now() + interval '3 days'
    );
    $$,
    'solicitudes_informacion debe aceptar estado: respondida'
);

-- Test 34: Aceptar estado 'vencida'
SELECT lives_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000033',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Aclarar sede del evento',
        'token_info_h_33',
        'vencida',
        now() + interval '3 days'
    );
    $$,
    'solicitudes_informacion debe aceptar estado: vencida'
);

-- Test 35: Rechazar estado 'cancelada'
SELECT throws_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000034',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Mensaje prueba',
        'token_info_h_34',
        'cancelada',
        now() + interval '3 days'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: cancelada en solicitudes_informacion'
);

-- Test 36: Rechazar estado 'rechazada'
SELECT throws_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000035',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Mensaje prueba',
        'token_info_h_35',
        'rechazada',
        now() + interval '3 days'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no contractual: rechazada en solicitudes_informacion'
);

-- Test 37: Rechazar estado no permitido genérico
SELECT throws_ok(
    $$
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000036',
        'a0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Mensaje prueba',
        'token_info_h_36',
        'cualquier_otro',
        now() + interval '3 days'
    );
    $$,
    '23514',
    NULL,
    'Debe rechazar estado no permitido genérico en solicitudes_informacion'
);

-- -----------------------------------------------------------------------------
-- 7. Tests de Archivos Google Drive y Relaciones N:M
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

-- Test 38: Rechazar provider distinto de google_drive
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

-- Test 39: Rechazar contexto inválido
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

-- Test 40: Rechazar estado de archivo inválido
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

-- Test 41: Rechazar size_bytes negativo
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

-- Test 42: Asociación N:M válida entre archivo y pedido
SELECT lives_ok(
    $$
    INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
    VALUES ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    $$,
    'Debe permitir asociar archivo y pedido en relación N:M'
);

-- Test 43: Rechazar asociación duplicada entre el mismo archivo y el mismo pedido
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
-- 8. Tests de Enlaces de Material, Notas y Entregas
-- -----------------------------------------------------------------------------

-- Test 44: Rechazar enlaces no HTTPS
SELECT throws_ok(
    $$
    INSERT INTO public.enlaces_material (id, envio_id, url)
    VALUES ('00000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000001', 'http://inseguro.com/material');
    $$,
    '23514',
    NULL,
    'Debe rechazar URLs de material que no usen HTTPS'
);

-- Test 45: Rechazar visibilidad inválida en notas
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

-- Test 46: Rechazar entrega que no contiene ni archivo ni enlace
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

-- Test 47: Comprobar que trigger updated_at actualiza el timestamp al modificar un pedido
UPDATE public.pedidos SET version = version + 1 WHERE id = 'a0000000-0000-0000-0000-000000000001';

SELECT ok(
    (SELECT updated_at FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000001') >= (SELECT created_at FROM public.pedidos WHERE id = 'a0000000-0000-0000-0000-000000000001'),
    'Trigger updated_at mantiene actualizado el timestamp al modificar un registro'
);

SELECT * FROM finish();

ROLLBACK;
