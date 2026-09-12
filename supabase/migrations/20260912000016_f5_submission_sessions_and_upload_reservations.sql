-- ==============================================================================
-- MIGRATION 016: Submission Sessions & Upload Reservations Alignment (F5 Spike)
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Crear Tabla de Sesiones Previas al Envío (submission_sessions)
CREATE TABLE IF NOT EXISTS public.submission_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_key uuid UNIQUE NOT NULL,
    capability_hash text NOT NULL,
    form_schema_version integer NOT NULL DEFAULT 3,
    estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'confirmada', 'expirada')),
    envio_id uuid NULL REFERENCES public.envios_formulario(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_capability_hash_not_empty CHECK (length(trim(capability_hash)) >= 1)
);

-- 2. Alinear y Extender upload_reservations para Integración con F5
ALTER TABLE public.upload_reservations
    ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES public.submission_sessions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS client_file_ref uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS drive_file_id text NULL,
    ADD COLUMN IF NOT EXISTS targets jsonb NOT NULL DEFAULT '"all"'::jsonb;

-- Actualizar el CHECK constraint del estado de upload_reservations
ALTER TABLE public.upload_reservations DROP CONSTRAINT IF EXISTS upload_reservations_state_check;
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_state_check
    CHECK (state IN ('pending', 'uploading', 'completed', 'verified', 'consumed', 'expired', 'failed'));

-- Crear constraint UNIQUE (session_id, client_file_ref)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_upload_reservations_session_client_ref'
    ) THEN
        ALTER TABLE public.upload_reservations
            ADD CONSTRAINT uq_upload_reservations_session_client_ref UNIQUE (session_id, client_file_ref);
    END IF;
END;
$$;

-- 3. Índices de Búsqueda e Integridad
CREATE INDEX IF NOT EXISTS idx_submission_sessions_key ON public.submission_sessions(submission_key);
CREATE INDEX IF NOT EXISTS idx_submission_sessions_envio ON public.submission_sessions(envio_id);
CREATE INDEX IF NOT EXISTS idx_submission_sessions_status ON public.submission_sessions(estado, expires_at);

CREATE INDEX IF NOT EXISTS idx_upload_reservations_session ON public.upload_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_client_ref ON public.upload_reservations(client_file_ref);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_archivo ON public.upload_reservations(archivo_id);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_drive_file ON public.upload_reservations(drive_file_id);

-- 4. Habilitar RLS y Configurar Grants Estrictos
ALTER TABLE public.submission_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: Solo lectura para Equipo y Administrador
DROP POLICY IF EXISTS "submission_sessions_select_team" ON public.submission_sessions;
CREATE POLICY "submission_sessions_select_team" ON public.submission_sessions
    FOR SELECT
    TO authenticated
    USING (private.is_team_or_admin());

DROP POLICY IF EXISTS "upload_reservations_select_team" ON public.upload_reservations;
CREATE POLICY "upload_reservations_select_team" ON public.upload_reservations
    FOR SELECT
    TO authenticated
    USING (private.is_team_or_admin());

-- Revocar mutaciones directas de browser
REVOKE INSERT, UPDATE, DELETE ON public.submission_sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.upload_reservations FROM PUBLIC, anon, authenticated;

-- Otorgar control completo a service_role (usado por Edge Functions)
GRANT ALL ON public.submission_sessions TO service_role;
GRANT ALL ON public.upload_reservations TO service_role;
