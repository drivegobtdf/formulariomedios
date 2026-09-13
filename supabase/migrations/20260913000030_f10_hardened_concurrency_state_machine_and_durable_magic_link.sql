-- ==============================================================================
-- MIGRATION 030: F10 Hardened Concurrency, State Machine & Durable Magic Link
-- (C01, C06, C08, C09, C10, C11, C12)
-- ==============================================================================

-- 1. RPC: comunicacion_mark_result con Bloqueo de Fila y Validación Estricta
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.comunicacion_mark_result(uuid, boolean, text, text, integer, uuid, boolean);
DROP FUNCTION IF EXISTS public.comunicacion_mark_result(uuid, uuid, boolean, text, text, integer, boolean);

CREATE OR REPLACE FUNCTION public.comunicacion_mark_result(
    p_id uuid,
    p_claim_id uuid,
    p_success boolean,
    p_provider_msg_id text DEFAULT NULL,
    p_error text DEFAULT NULL,
    p_retry_seconds integer DEFAULT 300,
    p_uncertain boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.comunicaciones_pedido%ROWTYPE;
BEGIN
    -- 1. Validar presencia obligatoria de claim_id
    IF p_claim_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CLAIM_ID_REQUIRED',
            'message', 'claim_id es obligatorio para registrar el resultado de un worker'
        );
    END IF;

    -- 2. Bloqueo de fila para control de concurrencia atómico
    SELECT * INTO v_row
    FROM public.comunicaciones_pedido
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_FOUND');
    END IF;

    -- 3. Idempotencia estricta ante confirmaciones repetidas (C09)
    IF v_row.estado = 'enviada' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_sent',
            'estado', 'enviada',
            'ignored', true,
            'provider_message_id', v_row.provider_message_id
        );
    END IF;

    -- 4. Protección contra sobrescritura de estados terminales
    IF v_row.estado IN ('fallida', 'cancelada') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CANNOT_OVERWRITE_TERMINAL_STATE',
            'current_state', v_row.estado
        );
    END IF;

    -- 5. Validación de claim_id: debe coincidir exactamente con el claim activo
    IF v_row.claim_id IS NULL OR v_row.claim_id <> p_claim_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'STALE_LEASE_REJECTED',
            'current_claim_id', v_row.claim_id,
            'provided_claim_id', p_claim_id
        );
    END IF;

    -- 6. Transición a UNCERTAIN (C10)
    IF p_uncertain THEN
        IF v_row.estado IN ('processing', 'uncertain') THEN
            UPDATE public.comunicaciones_pedido
            SET estado = 'uncertain',
                error_message = COALESCE(p_error, 'Estado de entrega externo incierto tras timeout/caída post-envío.'),
                updated_at = now()
            WHERE id = p_id;
            
            RETURN jsonb_build_object('success', true, 'status', 'uncertain', 'estado', 'uncertain', 'id', p_id);
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATE_TRANSITION_TO_UNCERTAIN', 'current_state', v_row.estado);
        END IF;

    -- 7. Transición a ENVIADA (Éxito)
    ELSIF p_success THEN
        -- Exigir provider_message_id no vacío obligatorio
        IF p_provider_msg_id IS NULL OR length(trim(p_provider_msg_id)) = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'PROVIDER_MESSAGE_ID_REQUIRED',
                'message', 'provider_message_id no vacío es obligatorio para registrar aceptación exitosa'
            );
        END IF;

        IF v_row.estado IN ('processing', 'uncertain') THEN
            UPDATE public.comunicaciones_pedido
            SET estado = 'enviada',
                sent_at = COALESCE(sent_at, now()),
                provider_message_id = trim(p_provider_msg_id),
                error_message = NULL,
                updated_at = now()
            WHERE id = p_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'status', 'enviada',
                'estado', 'enviada',
                'id', p_id,
                'provider_message_id', trim(p_provider_msg_id)
            );
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATE_TRANSITION_TO_ENVIADA', 'current_state', v_row.estado);
        END IF;

    -- 8. Transición de Fallo (p_success = false)
    ELSE
        -- IMPEDIR que un worker transicione desde 'uncertain' a 'retry_wait' automáticamente
        IF v_row.estado = 'uncertain' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNCERTAIN_REQUIRES_RECONCILIATION',
                'message', 'Una comunicación en estado uncertain no puede retornar a retry_wait automáticamente por worker. Requiere comunicacion_reconcile_uncertain.'
            );
        END IF;

        IF v_row.estado = 'processing' THEN
            IF p_retry_seconds = 0 OR v_row.attempts >= v_row.max_attempts THEN
                UPDATE public.comunicaciones_pedido
                SET estado = 'fallida',
                    error_message = COALESCE(p_error, 'Fallo permanente o agotamiento de intentos'),
                    updated_at = now()
                WHERE id = p_id;
                
                RETURN jsonb_build_object('success', false, 'status', 'fallida', 'estado', 'fallida', 'id', p_id, 'error', p_error);
            ELSE
                UPDATE public.comunicaciones_pedido
                SET estado = 'retry_wait',
                    retry_after = now() + (COALESCE(p_retry_seconds, 300) || ' seconds')::interval,
                    error_message = p_error,
                    claim_id = NULL,
                    lease_expires_at = NULL,
                    updated_at = now()
                WHERE id = p_id;
                
                RETURN jsonb_build_object('success', false, 'status', 'retry_wait', 'estado', 'retry_wait', 'id', p_id, 'error', p_error);
            END IF;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATE_TRANSITION', 'current_state', v_row.estado);
        END IF;
    END IF;
END;
$$;

-- 2. RPC: comunicacion_reconcile_uncertain con Bloqueo de Fila
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
    v_row public.comunicaciones_pedido%ROWTYPE;
BEGIN
    SELECT * INTO v_row
    FROM public.comunicaciones_pedido
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_FOUND');
    END IF;

    IF v_row.estado <> 'uncertain' THEN
        RETURN jsonb_build_object('success', false, 'error', 'COMMUNICATION_NOT_UNCERTAIN', 'current_state', v_row.estado);
    END IF;

    IF p_resolution = 'enviada' THEN
        IF p_provider_msg_id IS NULL OR length(trim(p_provider_msg_id)) = 0 THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'PROVIDER_MESSAGE_ID_REQUIRED_FOR_RECONCILE_ENVIADA',
                'message', 'Se requiere un provider_message_id verificado para reconciliar a enviada'
            );
        END IF;

        UPDATE public.comunicaciones_pedido
        SET estado = 'enviada',
            sent_at = COALESCE(sent_at, now()),
            provider_message_id = trim(p_provider_msg_id),
            error_message = NULL,
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'resolved_to', 'enviada', 'provider_message_id', trim(p_provider_msg_id));
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
            error_message = COALESCE(p_notes, 'Reconciliado manualmente para reintento controlado'),
            claim_id = NULL,
            lease_expires_at = NULL,
            updated_at = now()
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'resolved_to', 'retry_wait');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_RESOLUTION_ACTION');
    END IF;
END;
$$;

-- 3. RPC: solicitante_request_access con Soporte de Sobre Cifrado
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.solicitante_request_access(text);
DROP FUNCTION IF EXISTS public.solicitante_request_access(text, jsonb);

CREATE OR REPLACE FUNCTION public.solicitante_request_access(
    p_correo text,
    p_encrypted_envelope jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_found_count integer := 0;
    v_nombre text := 'Solicitante';
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
    v_ttl_seconds integer;
    v_expires_at timestamptz;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EMAIL', 'message', 'Correo electrónico inválido');
    END IF;

    -- Verificar existencia de pedidos asociados
    SELECT count(*), COALESCE(max(ef.nombre_apellido), 'Solicitante')
    INTO v_found_count, v_nombre
    FROM public.envios_formulario ef
    JOIN public.pedidos p ON p.envio_id = ef.id
    WHERE lower(trim(ef.correo)) = v_norm_email;

    IF v_found_count = 0 THEN
        -- Respuesta uniforme anti-enumeración
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'message', 'Si el correo ingresado tiene solicitudes activas, recibirá un enlace de acceso.'
        );
    END IF;

    -- Obtener TTL configurable
    v_ttl_seconds := public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000);
    v_expires_at := now() + (v_ttl_seconds || ' seconds')::interval;

    -- Generar token efímero y hash SHA-256
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Insertar token hash en base de datos (NUNCA el token en texto plano)
    INSERT INTO public.solicitante_access_tokens (
        correo, token_hash, expires_at, created_at
    ) VALUES (
        v_norm_email, v_token_hash, v_expires_at, now()
    ) RETURNING id INTO v_token_id;

    -- Encolar comunicación con el sobre cifrado si fue provisto
    INSERT INTO public.comunicaciones_pedido (
        destinatario_email, tipo_comunicacion, estado, idempotency_key, payload, created_at
    ) VALUES (
        v_norm_email,
        'magic_link_access',
        'pendiente',
        'magic_link:' || v_token_id::text,
        jsonb_build_object(
            'solicitante_nombre', v_nombre,
            'token_id', v_token_id,
            'expires_at', v_expires_at,
            'encrypted_envelope', p_encrypted_envelope
        ),
        now()
    );

    -- Retornar magic_token ÚNICAMENTE en memoria al llamador
    RETURN jsonb_build_object(
        'success', true,
        'found', true,
        'token_id', v_token_id,
        'magic_token', v_raw_token,
        'expires_at', v_expires_at,
        'ttl_seconds', v_ttl_seconds
    );
END;
$$;

-- 4. Permisos y PoLP (C12)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.comunicacion_mark_result(uuid, uuid, boolean, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_mark_result(uuid, uuid, boolean, text, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_reconcile_uncertain(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_reconcile_uncertain(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_request_access(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_request_access(text, jsonb) TO anon, authenticated, service_role;
