-- ==============================================================================
-- MIGRATION 008: Fix Contractual States, Constraints and Catalog Names
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Asegurar restricción CHECK estricta y nombrada para los 6 estados oficiales de PED
ALTER TABLE public.pedidos 
    DROP CONSTRAINT IF EXISTS check_pedidos_estado,
    DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE public.pedidos 
    ADD CONSTRAINT check_pedidos_estado 
    CHECK (estado IN ('Nuevo', 'En revisión', 'En proceso', 'Esperando información', 'Finalizado', 'Cancelado'));

-- 2. Asegurar restricción CHECK estricta y nombrada para los 3 estados oficiales de Solicitudes de Información
ALTER TABLE public.solicitudes_informacion 
    DROP CONSTRAINT IF EXISTS check_solicitudes_informacion_estado,
    DROP CONSTRAINT IF EXISTS solicitudes_informacion_estado_check;

ALTER TABLE public.solicitudes_informacion 
    ADD CONSTRAINT check_solicitudes_informacion_estado 
    CHECK (estado IN ('pendiente', 'respondida', 'vencida'));

-- 3. Actualizar nombres visibles oficiales de las 8 categorías
UPDATE public.categorias_servicio SET nombre = 'Diseño gráfico' WHERE slug = 'diseno_grafico';
UPDATE public.categorias_servicio SET nombre = 'Cobertura de eventos' WHERE slug = 'cobertura_eventos';
UPDATE public.categorias_servicio SET nombre = 'Gacetilla de prensa' WHERE slug = 'gacetilla';
UPDATE public.categorias_servicio SET nombre = 'Publicaciones en redes sociales' WHERE slug = 'redes_sociales';
UPDATE public.categorias_servicio SET nombre = 'Producción audiovisual' WHERE slug = 'produccion_audiovisual';
UPDATE public.categorias_servicio SET nombre = 'Animación y motion graphics' WHERE slug = 'motion_graphics';
UPDATE public.categorias_servicio SET nombre = 'Transmisión en vivo / streaming' WHERE slug = 'streaming';
UPDATE public.categorias_servicio SET nombre = 'Sitios y contenidos web' WHERE slug = 'sitios_web';
