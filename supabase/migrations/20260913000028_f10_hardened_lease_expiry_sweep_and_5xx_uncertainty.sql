-- ==============================================================================
-- MIGRATION 028: F10 Hardening: Expired Lease Sweep to Uncertain (Anti-Duplicate)
--               and 5xx Uncertainty Protection (C01, C08, C10, C11, C12)
-- ==============================================================================

-- 1. RPC: comunicacion_sweep_expired_leases (C08, C10)
-- -----------------------------------------------------------------------------
-- Transiciona automáticamente cualquier ítem en processing cuyo lease haya expirado
-- al estado 'uncertain', impidiendo que sea re-encolado ciegamente para un reenvío
-- no intencional (evita duplicación de correos tras caídas o timeouts de workers).

CREATE OR REPLACE FUNCTION public.comunicacion_sweep_expired_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_swept_count integer := 0;
BEGIN
    WITH swept AS (
        UPDATE public.comunicaciones_pedido
        SET estado = 'uncertain',
            error_message = 'Lease de procesamiento expirado (' || COALESCE(lease_expires_at::text, 'sin fecha') || '). Posible caída de worker o resultado externo desconocido; retenido en uncertain para evitar duplicación de correo.',
            updated_at = now()
        WHERE estado = 'processing'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < now()
        RETURNING id
    )
    SELECT count(*)::integer INTO v_swept_count FROM swept;

    RETURN v_swept_count;
END;
$$;

-- 2. RPC: comunicacion_claim_batch actualizado con barrido previo (C08)
-- -----------------------------------------------------------------------------
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
    -- Paso 1: Barrer leases vencidos a uncertain para garantizar que NINGÚN ítem abandonado
    -- en vuelo sea despachado dos veces al ciudadano.
    PERFORM public.comunicacion_sweep_expired_leases();

    -- Paso 2: Reclamar únicamente ítems en estado pendiente o retry_wait elegibles
    RETURN QUERY
    WITH eligible AS (
        SELECT cp.id
        FROM public.comunicaciones_pedido cp
        WHERE (
            cp.estado = 'pendiente'
            OR (cp.estado = 'retry_wait' AND (cp.retry_after IS NULL OR cp.retry_after <= now()))
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

-- 3. RPC: comunicacion_mark_result con resolución de uncertain por worker original (C08, C10, C11)
-- -----------------------------------------------------------------------------
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

    -- Protección contra workers con claim_id disconforme / worker zombie ajeno (C08)
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
        -- Si el worker legítimo presenta prueba de entrega exitosa (incluso tras barrido de lease),
        -- se asienta enviada de forma segura ya que el worker fue el responsable del despacho.
        UPDATE public.comunicaciones_pedido
        SET estado = 'enviada',
            sent_at = COALESCE(sent_at, now()),
            provider_message_id = p_provider_msg_id,
            error_message = NULL,
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'enviada', 'estado', 'enviada', 'id', p_id, 'provider_message_id', p_provider_msg_id);
    ELSE
        IF p_retry_seconds = 0 OR v_attempts >= v_max_attempts THEN
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

-- 4. Permisos y Seguridad PoLP (C12)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.comunicacion_sweep_expired_leases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_sweep_expired_leases() TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_claim_batch(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_claim_batch(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer, uuid, boolean) TO service_role;
