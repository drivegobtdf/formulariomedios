-- ==============================================================================
-- SEED DATA: Catálogos Oficiales de PEDIDOS (Revisión 3.0)
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- -- 1. Inserción de las 8 Categorías Oficiales
INSERT INTO public.categorias_servicio (id, slug, codigo_ped, nombre, activo, orden) VALUES
    ('a0000001-0000-0000-0000-000000000001', 'diseno_grafico',         'D', 'Diseño gráfico',                    true, 10),
    ('a0000001-0000-0000-0000-000000000002', 'cobertura_eventos',      'C', 'Cobertura de eventos',               true, 20),
    ('a0000001-0000-0000-0000-000000000003', 'gacetilla',              'G', 'Gacetilla de prensa',               true, 30),
    ('a0000001-0000-0000-0000-000000000004', 'redes_sociales',         'R', 'Publicaciones en redes sociales',   true, 40),
    ('a0000001-0000-0000-0000-000000000005', 'produccion_audiovisual', 'P', 'Producción audiovisual',          true, 50),
    ('a0000001-0000-0000-0000-000000000006', 'motion_graphics',        'M', 'Animación y motion graphics',       true, 60),
    ('a0000001-0000-0000-0000-000000000007', 'streaming',              'S', 'Transmisión en vivo / streaming',  true, 70),
    ('a0000001-0000-0000-0000-000000000008', 'sitios_web',             'W', 'Sitios y contenidos web',          true, 80)
ON CONFLICT (slug) DO UPDATE SET
    codigo_ped = EXCLUDED.codigo_ped,
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- 2. Inserción de los Tipos de Servicio por Categoría
-- Categoría: Diseño Gráfico (4 piezas/tipos)
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'flyer_rrss',          'Flyer para redes sociales',       true, 10),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'invitacion_digital',  'Invitación digital',              true, 20),
    ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'certificado',         'Certificados y diplomas',         true, 30),
    ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 'otros_diseno',        'Otros requerimientos gráficos',   true, 40)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Cobertura de eventos
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000002', 'cobertura_eventos',   'Cobertura de eventos',            true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Gacetilla de prensa
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000003', 'gacetilla',           'Gacetilla de prensa',            true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Publicaciones en redes sociales
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000004', 'redes_sociales',      'Publicaciones en redes sociales', true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Producción audiovisual
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000005', 'produccion_audiovisual', 'Producción audiovisual',       true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Animación y motion graphics
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-000000000009', 'a0000001-0000-0000-0000-000000000006', 'motion_graphics',     'Animación y motion graphics',     true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Transmisión en vivo / streaming
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-00000000000a', 'a0000001-0000-0000-0000-000000000007', 'streaming',           'Transmisión en vivo / streaming', true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- Categoría: Sitios y contenidos web
INSERT INTO public.tipos_servicio (id, categoria_id, slug, nombre, activo, orden) VALUES
    ('b0000001-0000-0000-0000-00000000000b', 'a0000001-0000-0000-0000-000000000008', 'sitios_web',          'Sitios y contenidos web',       true, 10)
ON CONFLICT (categoria_id, slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden;

-- 3. Inicialización de la Secuencia Global para el Año 2026
INSERT INTO public.pedido_sequences (anio, current_value)
VALUES (2026, 0)
ON CONFLICT (anio) DO NOTHING;
