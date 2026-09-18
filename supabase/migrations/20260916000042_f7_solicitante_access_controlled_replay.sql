-- =============================================================================
-- Migration: 20260916000042_f7_solicitante_access_controlled_replay.sql
-- Description: Implement controlled replay for solicitante access tokens,
--              permitting tab/email reopening within expires_at window without
--              violating the zero-localStorage security contract.
-- =============================================================================

-- 1. Extend solicitante_access_tokens schema
ALTER TABLE public.solicitante_access_tokens
    ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'access_request',
    ADD COLUMN IF NOT EXISTS exchange_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_exchanged_at timestamptz NULL;

-- 2. Update solicitante_session_exchange with controlled replay semantics
CREATE OR REPLACE FUNCTION public.solicitante_session_exchange(
    p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$ 
DECLARE
    v_clean_token text := trim(COALESCE(p_token, ''));
    v_token_hash text;
    v_rec RECORD;
    v_raw_session text;
    v_session_hash text;
    v_session_id uuid;
    v_session_ttl_seconds integer;
    v_session_expires_at timestamptz;
BEGIN
    IF length(v_clean_token) = 0 THEN
        RAISE EXCEPTION 'TOKEN_REQUIRED: El token de acceso es obligatorio' USING ERRCODE = '42200';
    END IF;

    v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

    SELECT id, correo, expires_at, used_at, exchange_count, purpose INTO v_rec
    FROM public.solicitante_access_tokens
    WHERE token_hash = v_token_hash
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token de acceso no válido o inexistente' USING ERRCODE = 'P0002';
    END IF;

    -- Validar vigencia temporal estricta: el token debe estar dentro de su ventana de vida (expires_at)
    IF now() >= v_rec.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: El enlace de acceso ha expirado' USING ERRCODE = '42201';
    END IF;

    -- Controlled Replay: mientras now() < expires_at, se permite el canje y re-canje seguro
    -- Se actualizan las métricas de uso y auditoría
    UPDATE public.solicitante_access_tokens
    SET used_at = COALESCE(used_at, now()),
        exchange_count = COALESCE(exchange_count, 0) + 1,
        last_exchanged_at = now()
    WHERE id = v_rec.id;

    -- Revocar / expirar sesiones previas activas para este correo para evitar proliferación de sesiones huérfanas
    UPDATE public.solicitante_sesiones
    SET expires_at = now()
    WHERE correo = v_rec.correo
      AND expires_at > now();

    -- Obtener TTL técnico de sesión desde configuración (por defecto 4 horas)
    v_session_ttl_seconds := public.get_setting_integer('solicitante_session_ttl_seconds', 14400, 60, 2592000);
    v_session_expires_at := now() + (v_session_ttl_seconds || ' seconds')::interval;

    -- Generar nuevo session token opaco de 32 bytes (64 caracteres hex)
    v_raw_session := encode(gen_random_bytes(32), 'hex');
    v_session_hash := encode(digest(v_raw_session, 'sha256'), 'hex');
    v_session_id := gen_random_uuid();

    INSERT INTO public.solicitante_sesiones (
        id, correo, session_token_hash, expires_at, created_at
    ) VALUES (
        v_session_id, v_rec.correo, v_session_hash, v_session_expires_at, now()
    );

    -- Registrar evento de auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'solicitante.session_created', 'solicitante', v_session_id,
        jsonb_build_object(
            'session_id', v_session_id,
            'correo', v_rec.correo,
            'expires_at', v_session_expires_at,
            'exchange_count', COALESCE(v_rec.exchange_count, 0) + 1,
            'is_replay', (v_rec.used_at IS NOT NULL)
        ),
        NULL, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_session,
        'correo', v_rec.correo,
        'expires_at', v_session_expires_at
    );
END;
$$;

-- 3. Permisos de ejecución mínimos y seguros
REVOKE EXECUTE ON FUNCTION public.solicitante_session_exchange(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_session_exchange(text) TO service_role;

-- 4. Notificar a PostgREST para recarga de esquema
NOTIFY pgrst, 'reload schema';
