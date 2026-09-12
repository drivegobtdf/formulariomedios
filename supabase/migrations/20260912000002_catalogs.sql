-- ==============================================================================
-- MIGRATION 002: Catalogs (Categorías y Tipos de Servicio)
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Tabla de Categorías de Servicio
CREATE TABLE public.categorias_servicio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    codigo_ped char(1) UNIQUE NOT NULL,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    orden integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_codigo_ped_uppercase CHECK (codigo_ped ~ '^[A-Z]$'),
    CONSTRAINT check_slug_format CHECK (slug ~ '^[a-z0-9_]+$'),
    CONSTRAINT check_nombre_not_empty CHECK (length(trim(nombre)) >= 1)
);

-- 2. Tabla de Tipos de Servicio
CREATE TABLE public.tipos_servicio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id uuid NOT NULL REFERENCES public.categorias_servicio(id) ON DELETE RESTRICT,
    slug text NOT NULL,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    orden integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tipos_servicio_categoria_slug UNIQUE (categoria_id, slug),
    CONSTRAINT uq_tipos_servicio_composite UNIQUE (categoria_id, id),
    CONSTRAINT check_tipo_slug_format CHECK (slug ~ '^[a-z0-9_]+$'),
    CONSTRAINT check_tipo_nombre_not_empty CHECK (length(trim(nombre)) >= 1)
);
