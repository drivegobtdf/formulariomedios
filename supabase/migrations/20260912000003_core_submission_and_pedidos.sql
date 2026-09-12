-- ==============================================================================
-- MIGRATION 003: Core Submissions and Pedidos
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Tabla de Envíos de Formulario (Agrupador de PEDs hermanos)
CREATE TABLE public.envios_formulario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_key uuid UNIQUE NOT NULL,
    request_fingerprint text NOT NULL,
    nombre_apellido text NOT NULL,
    telefono text NOT NULL,
    correo text NOT NULL,
    area_solicitante text NOT NULL,
    form_schema_version integer NOT NULL DEFAULT 1 CHECK (form_schema_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_envio_correo_format CHECK (correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT check_envio_nombre_not_empty CHECK (length(trim(nombre_apellido)) >= 2),
    CONSTRAINT check_envio_area_not_empty CHECK (length(trim(area_solicitante)) >= 1)
);

-- 2. Tabla de Secuencias Anuales Globales
CREATE TABLE public.pedido_sequences (
    anio integer PRIMARY KEY CHECK (anio >= 2026),
    current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabla Principal de Pedidos
CREATE TABLE public.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envio_id uuid NOT NULL REFERENCES public.envios_formulario(id) ON DELETE RESTRICT,
    pedido_visible text UNIQUE NOT NULL,
    anio integer NOT NULL CHECK (anio >= 2026),
    numero bigint NOT NULL CHECK (numero > 0),
    categoria_id uuid NOT NULL REFERENCES public.categorias_servicio(id) ON DELETE RESTRICT,
    tipo_servicio_id uuid NOT NULL REFERENCES public.tipos_servicio(id) ON DELETE RESTRICT,
    codigo_categoria char(1) NOT NULL CHECK (codigo_categoria ~ '^[A-Z]$'),
    estado text NOT NULL CHECK (estado IN ('Nuevo', 'En revisión', 'En proceso', 'Esperando información', 'Finalizado', 'Cancelado')),
    responsable_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    informacion_especifica jsonb NOT NULL DEFAULT '{}'::jsonb,
    form_schema_version integer NOT NULL DEFAULT 1 CHECK (form_schema_version > 0),
    fecha_limite date NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    tracking_token_version bigint NOT NULL DEFAULT 1 CHECK (tracking_token_version >= 1),
    tracking_token_hash text UNIQUE NOT NULL,
    tracking_token_created_at timestamptz NOT NULL DEFAULT now(),
    cancelado_at timestamptz NULL,
    finalizado_at timestamptz NULL,
    archivado_at timestamptz NULL,
    archivado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_pedidos_anio_numero UNIQUE (anio, numero),
    CONSTRAINT fk_pedidos_categoria_tipo_composite FOREIGN KEY (categoria_id, tipo_servicio_id) 
        REFERENCES public.tipos_servicio(categoria_id, id) ON DELETE RESTRICT,
    CONSTRAINT check_pedidos_visible_format CHECK (pedido_visible ~ '^PED-[0-9]{4}-[A-Z][0-9]{6}$')
);
