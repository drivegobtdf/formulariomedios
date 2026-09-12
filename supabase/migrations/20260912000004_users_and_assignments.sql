-- ==============================================================================
-- MIGRATION 004: Users Access and Order Assignments
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Tabla de Perfiles y Accesos de Usuarios Internos
CREATE TABLE public.usuarios_acceso (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    apellido text NOT NULL,
    nombre_usuario text UNIQUE NOT NULL,
    estado_acceso text NOT NULL CHECK (estado_acceso IN ('pendiente', 'aprobado', 'rechazado', 'revocado')),
    app_role text NOT NULL CHECK (app_role IN ('administrador', 'equipo', 'observador')),
    solicitado_at timestamptz NOT NULL DEFAULT now(),
    aprobado_at timestamptz NULL,
    aprobado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    rechazado_at timestamptz NULL,
    rechazado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    revocado_at timestamptz NULL,
    revocado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    motivo_revocacion text NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_nombre_usuario_format CHECK (nombre_usuario ~ '^[a-z0-9._-]{2,30}$'),
    CONSTRAINT check_nombre_not_empty CHECK (length(trim(nombre)) >= 1),
    CONSTRAINT check_apellido_not_empty CHECK (length(trim(apellido)) >= 1)
);

-- 2. Tabla de Historial de Asignaciones de Responsable por Pedido
CREATE TABLE public.pedido_asignaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    responsable_anterior uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    responsable_nuevo uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    asignado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    motivo text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
