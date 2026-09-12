-- ==============================================================================
-- MIGRATION 005: Information Requests, Files, Links, Notes and Deliveries
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Tabla de Solicitudes de Información Faltante
CREATE TABLE public.solicitudes_informacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    solicitada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    mensaje text NOT NULL,
    token_hash text UNIQUE NOT NULL,
    estado text NOT NULL CHECK (estado IN ('pendiente', 'respondida', 'vencida')),
    expires_at timestamptz NOT NULL,
    respuesta_texto text NULL,
    responded_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_mensaje_not_empty CHECK (length(trim(mensaje)) >= 1)
);

-- 2. Tabla de Metadata de Archivos Google Drive
CREATE TABLE public.archivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
    drive_file_id text UNIQUE NULL,
    drive_parent_id text NULL,
    nombre_original text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    sha256 text NULL,
    contexto text NOT NULL CHECK (contexto IN ('solicitud', 'informacion_respuesta', 'interno', 'entrega')),
    estado text NOT NULL CHECK (estado IN ('reserved', 'uploaded', 'verified', 'orphaned', 'deleted')),
    uploaded_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_nombre_original_not_empty CHECK (length(trim(nombre_original)) >= 1)
);

-- 3. Tabla Intermedia N:M de Asociación Archivo <-> Pedido
CREATE TABLE public.archivo_pedido (
    archivo_id uuid NOT NULL REFERENCES public.archivos(id) ON DELETE CASCADE,
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (archivo_id, pedido_id)
);

-- 4. Tabla de Reservas de Carga de Archivos
CREATE TABLE public.upload_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envio_id uuid NULL REFERENCES public.envios_formulario(id) ON DELETE SET NULL,
    archivo_id uuid NOT NULL REFERENCES public.archivos(id) ON DELETE CASCADE,
    expected_name text NOT NULL,
    expected_size bigint NOT NULL CHECK (expected_size >= 0),
    expected_mime text NOT NULL,
    drive_session_ref text NULL,
    expires_at timestamptz NOT NULL,
    completed_at timestamptz NULL,
    state text NOT NULL CHECK (state IN ('pending', 'completed', 'expired', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Tabla de Enlaces Externos de Material
CREATE TABLE public.enlaces_material (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envio_id uuid NULL REFERENCES public.envios_formulario(id) ON DELETE SET NULL,
    url text NOT NULL CHECK (url ~* '^https://'),
    descripcion text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Tabla Intermedia N:M de Asociación Enlace <-> Pedido
CREATE TABLE public.enlace_pedido (
    enlace_id uuid NOT NULL REFERENCES public.enlaces_material(id) ON DELETE CASCADE,
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (enlace_id, pedido_id)
);

-- 7. Tabla de Notas del Pedido (Internas y para Solicitante)
CREATE TABLE public.notas_pedido (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    autor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    visibilidad text NOT NULL CHECK (visibilidad IN ('interna', 'solicitante')),
    texto text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_nota_texto_not_empty CHECK (length(trim(texto)) >= 1)
);

-- 8. Tabla de Entregas Versionadas de Pedidos
CREATE TABLE public.entregas_pedido (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    es_vigente boolean NOT NULL DEFAULT true,
    archivo_id uuid NULL REFERENCES public.archivos(id) ON DELETE SET NULL,
    enlace_externo text NULL CHECK (enlace_externo IS NULL OR enlace_externo ~* '^https://'),
    nota text NULL,
    entregado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_entrega_material CHECK (archivo_id IS NOT NULL OR enlace_externo IS NOT NULL),
    CONSTRAINT uq_entregas_pedido_version UNIQUE (pedido_id, version)
);
