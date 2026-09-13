-- ==============================================================================
-- MIGRATION 023: Tracking Recovery & Exchange, Outbox Queue, Operational History Projection and F9 Scope Classification
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabla de Tokens de Canje Temporal para Recuperación Segura de Seguimiento
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tracking_recovery_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    exchange_token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_recovery_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_tracking_recovery_tokens_hash 
    ON public.tracking_recovery_tokens(exchange_token_hash);
CREATE INDEX IF NOT EXISTS idx_tracking_recovery_tokens_pedido 
    ON public.tracking_recovery_tokens(pedido_id);

-- RLS en tracking_recovery_tokens: estricto aislamiento
ALTER TABLE public.tracking_recovery_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tracking_recovery_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_recovery_tokens TO service_role;

-- -----------------------------------------------------------------------------
-- 2. F7 RPC: tracking_recover_core (Generación de Credencial Temporal + Outbox)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tracking_recover_core(
    p_correo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_envio RECORD;
    v_ped RECORD;
    v_found_count integer := 0;
    v_raw_exchange_token text;
    v_exchange_token_hash text;
    v_recovery_id uuid;
    v_expires_at timestamptz;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', true, 'found', false);
    END IF;

    -- Iterar por los envíos asociados al correo proporcionado
    FOR v_envio IN
        SELECT id, nombre_apellido, correo
        FROM public.envios_formulario
        WHERE lower(trim(correo)) = v_norm_email
    LOOP
        -- Para cada pedido activo bajo este envío
        FOR v_ped IN
            SELECT id, pedido_visible
            FROM public.pedidos
            WHERE envio_id = v_envio.id
        LOOP
            v_found_count := v_found_count + 1;

            -- Generar token de canje temporal único (256 bits)
            v_raw_exchange_token := encode(gen_random_bytes(32), 'hex');
            v_exchange_token_hash := encode(digest(v_raw_exchange_token, 'sha256'), 'hex');
            v_recovery_id := gen_random_uuid();
            v_expires_at := now() + interval '24 hours';

            -- Guardar credencial de canje temporal con hash seguro
            INSERT INTO public.tracking_recovery_tokens (
                id, pedido_id, exchange_token_hash, expires_at, created_at
            ) VALUES (
                v_recovery_id, v_ped.id, v_exchange_token_hash, v_expires_at, now()
            );

            -- Registrar en cola / outbox de comunicaciones para envío por F10 (n8n/correo)
            INSERT INTO public.comunicaciones_pedido (
                pedido_id, envio_id, tipo_comunicacion, destinatario_email, estado, attempts, payload, created_at
            ) VALUES (
                v_ped.id,
                v_envio.id,
                'tracking_recovery',
                v_envio.correo,
                'pendiente',
                0,
                jsonb_build_object(
                    'recovery_id', v_recovery_id,
                    'pedido_id', v_ped.id,
                    'pedido_visible', v_ped.pedido_visible,
                    'exchange_token', v_raw_exchange_token,
                    'expires_at', v_expires_at,
                    'nombre_apellido', v_envio.nombre_apellido
                ),
                now()
            );

            -- Emitir evento de dominio (sin secretos en payload)
            INSERT INTO public.domain_events (
                event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
            ) VALUES (
                'tracking.recovery_requested', 'pedido', v_ped.id,
                jsonb_build_object(
                    'recovery_id', v_recovery_id,
                    'pedido_id', v_ped.id,
                    'pedido_visible', v_ped.pedido_visible,
                    'correo', v_envio.correo,
                    'expires_at', v_expires_at
                ),
                NULL, now()
            );
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'found', (v_found_count > 0));
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. F7 RPC: tracking_exchange_core (Canje Atómico de Credencial y Rotación de Acceso)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tracking_exchange_core(
    p_exchange_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_clean_token text := trim(COALESCE(p_exchange_token, ''));
    v_token_hash text;
    v_rec RECORD;
    v_ped RECORD;
    v_new_raw_token text;
    v_new_token_hash text;
    v_new_version bigint;
BEGIN
    IF length(v_clean_token) = 0 THEN
        RAISE EXCEPTION 'TOKEN_REQUIRED: El token de canje es obligatorio' USING ERRCODE = '42200';
    END IF;

    v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

    -- 1. Bloquear y validar registro de recuperación
    SELECT id, pedido_id, expires_at, used_at INTO v_rec
    FROM public.tracking_recovery_tokens
    WHERE exchange_token_hash = v_token_hash
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token de canje no válido o inexistente' USING ERRCODE = 'P0002';
    END IF;

    IF v_rec.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'TOKEN_ALREADY_USED: Este token de canje ya ha sido consumido previamente' USING ERRCODE = '42202';
    END IF;

    IF now() >= v_rec.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: El token de canje ha expirado' USING ERRCODE = '42201';
    END IF;

    -- 2. Consumo atómico: marcar como usado inmediatamente
    UPDATE public.tracking_recovery_tokens
    SET used_at = now()
    WHERE id = v_rec.id;

    -- 3. Bloquear pedido y rotar credencial de seguimiento
    SELECT id, pedido_visible, tracking_token_version INTO v_ped
    FROM public.pedidos
    WHERE id = v_rec.pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido asociado no encontrado' USING ERRCODE = 'P0002';
    END IF;

    -- Generar nuevo token criptográfico de seguimiento (256 bits)
    v_new_raw_token := encode(gen_random_bytes(32), 'hex');
    v_new_token_hash := encode(digest(v_new_raw_token, 'sha256'), 'hex');
    v_new_version := v_ped.tracking_token_version + 1;

    -- Actualizar acceso en pedidos
    UPDATE public.pedidos
    SET tracking_token_hash = v_new_token_hash,
        tracking_token_version = v_new_version,
        tracking_token_created_at = now(),
        updated_at = now()
    WHERE id = v_ped.id;

    -- Registrar evento durable (sin secreto en el registro público)
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'tracking.token_rotated', 'pedido', v_ped.id,
        jsonb_build_object(
            'pedido_id', v_ped.id,
            'pedido_visible', v_ped.pedido_visible,
            'token_version', v_new_version,
            'recovery_id', v_rec.id,
            'rotated_at', now()
        ),
        NULL, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL, 'pedidos', v_ped.id::text, 'tracking_rotate',
        jsonb_build_object('token_version', v_new_version, 'recovery_id', v_rec.id),
        now()
    );

    -- Devolver DTO con el nuevo token de seguimiento al solicitante verificado
    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', v_ped.id,
        'pedido_visible', v_ped.pedido_visible,
        'tracking_token', v_new_raw_token,
        'token_version', v_new_version
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. F8 RPC: pedido_get_historial (Proyección Operativa Segura para Equipo/Observador)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pedido_get_historial(
    p_pedido_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_historial jsonb;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- Proyección combinada de eventos de ciclo de vida, asignaciones y notas
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        -- Eventos de dominio operativos
        SELECT jsonb_build_object(
            'tipo', 'evento',
            'evento', de.event_name,
            'created_at', de.created_at,
            'actor_nombre', CASE 
                WHEN ua.user_id IS NOT NULL THEN concat(ua.nombre, ' ', ua.apellido)
                ELSE 'Sistema'
            END,
            'payload', de.payload - 'token_hash' - 'raw_token' - 'exchange_token'
        ) AS item
        FROM public.domain_events de
        LEFT JOIN public.usuarios_acceso ua ON de.actor_user_id = ua.user_id
        WHERE de.aggregate_id = p_pedido_id

        UNION ALL

        -- Historial de asignaciones
        SELECT jsonb_build_object(
            'tipo', 'asignacion',
            'evento', 'pedido.assigned',
            'created_at', pa.created_at,
            'actor_nombre', concat(ua_asig.nombre, ' ', ua_asig.apellido),
            'payload', jsonb_build_object(
                'responsable_anterior', concat(ua_ant.nombre, ' ', ua_ant.apellido),
                'responsable_nuevo', concat(ua_nue.nombre, ' ', ua_nue.apellido),
                'motivo', pa.motivo
            )
        ) AS item
        FROM public.pedido_asignaciones pa
        LEFT JOIN public.usuarios_acceso ua_asig ON pa.asignado_por = ua_asig.user_id
        LEFT JOIN public.usuarios_acceso ua_ant ON pa.responsable_anterior = ua_ant.user_id
        LEFT JOIN public.usuarios_acceso ua_nue ON pa.responsable_nuevo = ua_nue.user_id
        WHERE pa.pedido_id = p_pedido_id
    ) t;

    RETURN v_historial;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Clasificación y Documentación de Operaciones F9 Preimplementadas
-- -----------------------------------------------------------------------------
-- Las funciones:
--   - public.pedido_finalize
--   - public.pedido_cancel
--   - public.pedido_reopen
--   - public.pedido_archive
--   - public.pedido_restore
-- quedan formalmente clasificadas como:
--   "F9 parcialmente preimplementada, pendiente de aceptación".
-- Sus permisos se mantienen exclusivamente para service_role y roles internos aprobados.

-- -----------------------------------------------------------------------------
-- 6. Concesión de Permisos Granulares y Revocaciones
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.tracking_recover_core(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_recover_core(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tracking_exchange_core(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_exchange_core(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pedido_get_historial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_get_historial(uuid) TO authenticated, service_role;

COMMIT;
