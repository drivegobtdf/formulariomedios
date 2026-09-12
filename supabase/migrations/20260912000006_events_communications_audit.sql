-- ==============================================================================
-- MIGRATION 006: Domain Events, Communications and Audit Log
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Tabla de Eventos de Dominio (Event Sourcing / Integraciones Asíncronas)
CREATE TABLE public.domain_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabla de Registro de Comunicaciones y Notificaciones
CREATE TABLE public.comunicaciones_pedido (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    envio_id uuid NULL REFERENCES public.envios_formulario(id) ON DELETE SET NULL,
    event_id uuid NULL REFERENCES public.domain_events(id) ON DELETE SET NULL,
    tipo_comunicacion text NOT NULL,
    destinatario_email text NOT NULL,
    estado text NOT NULL CHECK (estado IN ('pendiente', 'enviada', 'fallida', 'cancelada')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text NULL,
    provider_message_id text NULL,
    idempotency_key text UNIQUE NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz NULL,
    CONSTRAINT check_comunicacion_email_format CHECK (destinatario_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- 3. Tabla de Registro de Auditoría (Append-only)
CREATE TABLE public.audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    recurso_tipo text NOT NULL,
    recurso_id text NOT NULL,
    accion text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
