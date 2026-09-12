-- ==============================================================================
-- SEED DATA: Catálogos Oficiales de PEDIDOS (Revisión 3.0)
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. Inserción de las 8 Categorías Oficiales
INSERT INTO public.categorias_servicio (id, slug, codigo_ped, nombre, activo, orden) VALUES
    ('a0000001-0000-0000-0000-000000000001', 'diseno_grafico',         'D', 'Diseño Gráfico',                    true, 10),
    ('a0000001-0000-0000-0000-000000000002', 'cobertura_eventos',      'C', 'Cobertura de Eventos',               true, 20),
    ('a0000001-0000-0000-0000-000000000003', 'gacetilla',              'G', 'Gacetilla de Prensa',               true, 30),
    ('a0000001-0000-0000-0000-000000000004', 'redes_sociales',         'R', 'Publicaciones en Redes Sociales',   true, 40),
    ('a0000001-0000-0000-0000-000000000005', 'produccion_audiovisual', 'P', 'Producción Audiovisual',          true, 50),
    ('a0000001-0000-0000-0000-000000000006', 'motion_graphics',        'M', 'Motion Graphics',                   true, 60),
    ('a0000001-0000-0000-0000-000000000007', 'streaming',              'S', 'Transmisión en Streaming',          true, 70),
    ('a0000001-0000-0000-0000-000000000008', 'sitios_web',             'W', 'Desarrollo de Sitios Web',          true, 80)
ON CONFLICT (slug) DO UPDATE SET
    codigo_ped = EXCLUDED.codigo_ped,
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- 2. Inserción de los Tipos de Servicio por Categoría
-- Categoría: Diseño Gráfico (4 piezas/tipos)
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'flyer_rrss',          'Flyer para Redes Sociales',       true, 10),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'invitacion_digital',  'Invitación Digital',              true, 20),
    ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'certificado',         'Certificados y Diplomas',         true, 30),
    ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 'otros_diseno',        'Otros Requerimientos Gráficos',   true, 40)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Cobertura de Eventos
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000002', 'cobertura_eventos',   'Cobertura de Eventos',            true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Gacetilla de Prensa
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000003', 'gacetilla',           'Gacetilla de Prensa',            true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Publicaciones en Redes Sociales
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000004', 'redes_sociales',      'Publicaciones en Redes Sociales', true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Producción Audiovisual
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000005', 'produccion_audiovisual', 'Producción Audiovisual',       true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Motion Graphics
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000009', 'a0000001-0000-0000-0000-000000000006', 'motion_graphics',     'Motion Graphics',                true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Transmisión en Streaming
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-00000000000a', 'a0000001-0000-0000-0000-000000000007', 'streaming',           'Transmisión en Streaming',       true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Desarrollo de Sitios Web
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-00000000000b', 'a0000001-0000-0000-0000-000000000008', 'sitios_web',          'Desarrollo de Sitios Web',       true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- 3. Inicialización de la Secuencia Global para el Año 2026
INSERT INTO public.pedido_sequences (anio, current_value)
VALUES (2026, 0)
ON CONFLICT (anio) DO NOTHING;
