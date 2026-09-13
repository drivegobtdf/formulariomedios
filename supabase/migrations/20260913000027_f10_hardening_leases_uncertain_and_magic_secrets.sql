-- ==============================================================================
-- MIGRATION 027: F10 Hardening: Concurrency Leases, Uncertain State, 
--               Reconciliation and Secrets Isolation (C01, C06, C08, C10, C12)
-- ==============================================================================

-- 1. Ampliacion de columnas y estados en comunicaciones_pedido
-- -----------------------------------------------------------------------------

ALTER TABLE public.comunicaciones_pedido
    ADD COLUMN IF NOT EXISTS claim_id uuid DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz DEFAULT NULL;

ALTER TABLE public.comunicaciones_pedido 
    DROP CONSTRAINT IF EXISTS comunicaciones_pedido_estado_check;

ALTER TABLE public.comunicaciones_pedido 
    ADD CONSTRAINT comunicaciones_pedido_estado_check 
    CHECK (estado IN ('pendiente', 'processing', 'enviada', 'fallida', 'retry_wait', 'cancelada', 'uncertain'));

-- Actualizar indice de despacho para incluir leases vencidos
DROP INDEX IF EXISTS public.idx_comunicaciones_queue_dispatch;

CREATE INDEX idx_comunicaciones_queue_dispatch 
ON public.comunicaciones_pedido (estado, retry_after, lease_expires_at, created_at)
WHERE estado IN ('pendiente', 'retry_wait', 'processing');

-- -----------------------------------------------------------------------------
-- 2. RPC: comunicacion_claim_batch con Leases Temporales y Concurrencia (C08)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.comunicacion_claim_batch(integer);

CREATE OR REPLACE FUNCTION public.comunicacion_claim_batch(
    p_batch_size integer DEFAULT 10,
    p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.comunicaciones_pedido
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lease_sec integer := COALESCE(p_lease_seconds, 300);
BEGIN
    RETURN QUERY
    WITH eligible AS (
        SELECT cp.id
        FROM public.comunicaciones_pedido cp
        WHERE (
            cp.estado = 'pendiente'
            OR (cp.estado = 'retry_wait' AND (cp.retry_after IS NULL OR cp.retry_after <= now()))
            OR (cp.estado = 'processing' AND cp.lease_expires_at IS NOT NULL AND cp.lease_expires_at < now())
        )
        ORDER BY cp.created_at ASC
        LIMIT COALESCE(p_batch_size, 10)
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.comunicaciones_pedido u
        SET estado = 'processing',
            claim_id = gen_random_uuid(),
            claimed_at = now(),
            lease_expires_at = now() + (v_lease_sec || ' seconds')::interval,
            attempts = u.attempts + 1,
            updated_at = now()
        FROM eligible e
        WHERE u.id = e.id
        RETURNING u.*
    )
    SELECT * FROM claimed;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: comunicacion_mark_result con Proteccion de Lease y Estado Uncertain (C08, C10)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.comunicacion_mark_result(uuid, boolean, text, text, integer);

CREATE OR REPLACE FUNCTION public.comunicacion_mark_result(
    p_id uuid,
    p_success boolean,
    p_provider_msg_id text DEFAULT NULL,
    p_error text DEFAULT NULL,
    p_retry_seconds integer DEFAULT 300,
    p_claim_id uuid DEFAULT NULL,
    p_uncertain boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_claim_id uuid;
    v_estado text;
    v_attempts integer;
    v_max_attempts integer;
BEGIN
    SELECT claim_id, estado, attempts, max_attempts 
    INTO v_current_claim_id, v_estado, v_attempts, v_max_attempts
    FROM public.comunicaciones_pedido
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_FOUND');
    END IF;

    -- Si ya fue marcada enviada previamente, no sobrescribir resultado definitivo (C09)
    IF v_estado = 'enviada' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_sent', 'ignored', true);
    END IF;

    -- Proteccion contra workers lentos/zombies: si p_claim_id fue provisto y no coincide, ignorar (C08)
    IF p_claim_id IS NOT NULL AND v_current_claim_id IS NOT NULL AND p_claim_id <> v_current_claim_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'STALE_LEASE_REJECTED', 
            'current_claim_id', v_current_claim_id,
            'provided_claim_id', p_claim_id
        );
    END IF;

    IF p_uncertain THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'uncertain',
            error_message = COALESCE(p_error, 'Estado de entrega externo incierto. Requiere reconciliacion.'),
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'uncertain', 'estado', 'uncertain', 'id', p_id);
    ELSIF p_success THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'enviada',
            sent_at = now(),
            provider_message_id = p_provider_msg_id,
            error_message = NULL,
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'enviada', 'estado', 'enviada', 'id', p_id, 'provider_message_id', p_provider_msg_id);
    ELSE
        IF v_attempts >= v_max_attempts THEN
            UPDATE public.comunicaciones_pedido
            SET estado = 'fallida',
                error_message = p_error,
                updated_at = now()
            WHERE id = p_id;
            
            RETURN jsonb_build_object('success', false, 'status', 'fallida', 'estado', 'fallida', 'id', p_id, 'error', p_error);
        ELSE
            UPDATE public.comunicaciones_pedido
            SET estado = 'retry_wait',
                retry_after = now() + (COALESCE(p_retry_seconds, 300) || ' seconds')::interval,
                error_message = p_error,
                updated_at = now()
            WHERE id = p_id;
            
            RETURN jsonb_build_object('success', false, 'status', 'retry_wait', 'estado', 'retry_wait', 'id', p_id, 'error', p_error);
        END IF;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC: comunicacion_reconcile_uncertain (C10)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.comunicacion_reconcile_uncertain(
    p_id uuid,
    p_resolution text,
    p_provider_msg_id text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_estado text;
BEGIN
    SELECT estado INTO v_estado
    FROM public.comunicaciones_pedido
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_FOUND');
    END IF;

    IF v_estado <> 'uncertain' THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_UNCERTAIN', 'current_state', v_estado);
    END IF;

    IF p_resolution = 'enviada' THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'enviada',
            sent_at = COALESCE(sent_at, now()),
            provider_message_id = COALESCE(p_provider_msg_id, provider_message_id, 'reconciled_manual'),
            error_message = NULL,
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'resolved_to', 'enviada');
    ELSIF p_resolution = 'fallida' THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'fallida',
            error_message = COALESCE(p_notes, 'Reconciliado manualmente como fallo definitivo'),
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'resolved_to', 'fallida');
    ELSIF p_resolution = 'reintentar' THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'retry_wait',
            retry_after = now(),
            error_message = COALESCE(p_notes, 'Reconciliado para reintento inmediato'),
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'resolved_to', 'retry_wait');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_RESOLUTION_ACTION');
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Aislamiento de Secretos: Actualizacion de solicitante_request_access (C06)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_request_access(
    p_correo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_found_count integer := 0;
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
    v_ttl_seconds integer;
    v_expires_at timestamptz;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'message', 'Si existen solicitudes asociadas al correo ingresado, se enviaran las instrucciones de acceso.'
        );
    END IF;

    -- TTL tecnico configurable
    v_ttl_seconds := public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000);
    v_expires_at := now() + (v_ttl_seconds || ' seconds')::interval;

    SELECT count(*) INTO v_found_count
    FROM public.envios_formulario
    WHERE lower(trim(correo)) = v_norm_email;

    IF v_found_count > 0 THEN
        v_raw_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
        v_token_id := gen_random_uuid();

        INSERT INTO public.solicitante_access_tokens (
            id, correo, token_hash, expires_at, created_at
        ) VALUES (
            v_token_id, v_norm_email, v_token_hash, v_expires_at, now()
        );

        -- NOTA C06: No se almacena v_raw_token en el payload persistido de la base de datos
        INSERT INTO public.comunicaciones_pedido (
            pedido_id, envio_id, tipo_comunicacion, destinatario_email, estado, attempts, max_attempts,
            idempotency_key, payload, created_at
        )
        SELECT 
            p.id, e.id, 'magic_link_access', v_norm_email, 'pendiente', 0, 5,
            'magic_link:' || v_token_id::text,
            jsonb_build_object(
                'token_id', v_token_id,
                'correo', v_norm_email,
                'expires_at', v_expires_at,
                'intent_type', 'mis_solicitudes_access'
            ),
            now()
        FROM public.envios_formulario e
        JOIN public.pedidos p ON p.envio_id = e.id
        WHERE lower(trim(e.correo)) = v_norm_email
        ORDER BY p.created_at DESC
        LIMIT 1;

        -- Devolver token seguro temporal exclusivamente en el scope de retorno a la Edge Function
        RETURN jsonb_build_object(
            'success', true,
            'found', true,
            'token_id', v_token_id,
            'magic_token', v_raw_token,
            'expires_at', v_expires_at,
            'message', 'Si existen solicitudes asociadas al correo ingresado, se enviaran las instrucciones de acceso.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'found', false,
        'message', 'Si existen solicitudes asociadas al correo ingresado, se enviaran las instrucciones de acceso.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Helper de Pruebas: solicitante_test_claim_magic_token (C06, C07)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_test_claim_magic_token(
    p_correo text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
    v_ttl_seconds integer;
BEGIN
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
    v_token_id := gen_random_uuid();
    v_ttl_seconds := public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000);

    INSERT INTO public.solicitante_access_tokens (
        id, correo, token_hash, expires_at, created_at
    ) VALUES (
        v_token_id, v_norm_email, v_token_hash, now() + (v_ttl_seconds || ' seconds')::interval, now()
    );

    RETURN v_raw_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Trigger para evento pedido.info_responded (C04)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_responded(
    p_pedido_id uuid,
    p_solicitud_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pedido record;
    v_envio record;
    v_destinatario text;
BEGIN
    SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_envio FROM public.envios_formulario WHERE id = v_pedido.envio_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_destinatario := v_envio.correo;

    INSERT INTO public.comunicaciones_pedido (
        pedido_id, envio_id, tipo_comunicacion, destinatario_email,
        estado, attempts, max_attempts, idempotency_key, payload, created_at
    ) VALUES (
        p_pedido_id, v_pedido.envio_id, 'informacion_respondida', v_destinatario,
        'pendiente', 0, 5,
        'info_resp:' || p_pedido_id::text || ':' || COALESCE(p_solicitud_id::text, 'sol'),
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'pedido_visible', v_pedido.pedido_visible,
            'solicitud_id', p_solicitud_id,
            'destinatario_nombre', v_envio.nombre_apellido
        ),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

-- Actualizar trigger en domain_events para capturar info_responded
CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.info_requested' THEN
        IF NEW.payload ? 'solicitud_id' THEN
            PERFORM public.comunicacion_enqueue_info_requested((NEW.payload->>'solicitud_id')::uuid);
        ELSE
            PERFORM public.comunicacion_enqueue_info_requested(NEW.aggregate_id);
        END IF;
    ELSIF NEW.event_name = 'pedido.info_responded' THEN
        PERFORM public.comunicacion_enqueue_info_responded(
            NEW.aggregate_id,
            (NEW.payload->>'solicitud_id')::uuid
        );
    ELSIF NEW.event_name = 'pedido.finalized' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'finalizado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.cancelled' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'cancelado', NEW.payload);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domain_event_enqueue_comm ON public.domain_events;
CREATE TRIGGER trg_domain_event_enqueue_comm
    AFTER INSERT ON public.domain_events
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_domain_event_auto_enqueue();

-- -----------------------------------------------------------------------------
-- 8. Seguridad PoLP y Grants (C12)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.comunicacion_claim_batch(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_claim_batch(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_reconcile_uncertain(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_reconcile_uncertain(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_test_claim_magic_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_test_claim_magic_token(text) TO service_role;
