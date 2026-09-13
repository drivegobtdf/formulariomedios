-- =============================================================================
-- Migration 026: F10 Outbox Queue, Concurrency Claim, and Communications Dispatch
-- =============================================================================

-- 1. Actualizar restricciones y columnas en public.comunicaciones_pedido
ALTER TABLE public.comunicaciones_pedido 
    DROP CONSTRAINT IF EXISTS comunicaciones_pedido_estado_check;

ALTER TABLE public.comunicaciones_pedido 
    ADD CONSTRAINT comunicaciones_pedido_estado_check 
    CHECK (estado IN ('pendiente', 'processing', 'enviada', 'fallida', 'retry_wait', 'cancelada'));

ALTER TABLE public.comunicaciones_pedido 
    ADD COLUMN IF NOT EXISTS retry_after timestamptz NULL,
    ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS subject text NULL,
    ADD COLUMN IF NOT EXISTS body_html text NULL,
    ADD COLUMN IF NOT EXISTS body_text text NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_comunicaciones_queue_dispatch 
    ON public.comunicaciones_pedido (estado, retry_after, created_at)
    WHERE estado IN ('pendiente', 'retry_wait');

-- 2. Configuración técnica centralizada para n8n y comunicaciones
INSERT INTO public.configuracion_sistema (key, value, description)
VALUES 
    ('n8n_webhook_path', 'pedidos-email', 'Ruta del webhook de n8n para envío de correos'),
    ('n8n_dispatch_batch_size', '10', 'Tamaño de lote máximo por ejecución del despachador'),
    ('n8n_retry_backoff_seconds', '300', 'Tiempo de espera base para reintentos (5 minutos)'),
    ('n8n_dispatch_max_attempts', '3', 'Cantidad máxima de intentos antes de marcar fallida')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- 3. RPC: comunicacion_claim_batch (Claim atómico con FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.comunicacion_claim_batch(
    p_batch_size integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    pedido_id uuid,
    envio_id uuid,
    event_id uuid,
    tipo_comunicacion text,
    destinatario_email text,
    estado text,
    attempts integer,
    max_attempts integer,
    payload jsonb,
    subject text,
    body_html text,
    body_text text,
    idempotency_key text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_limit integer := COALESCE(p_batch_size, 10);
BEGIN
    IF v_limit < 1 THEN v_limit := 1; END IF;
    IF v_limit > 100 THEN v_limit := 100; END IF;

    RETURN QUERY
    WITH claimed AS (
        SELECT c.id AS claim_id
        FROM public.comunicaciones_pedido c
        WHERE c.estado IN ('pendiente', 'retry_wait')
          AND (c.retry_after IS NULL OR c.retry_after <= now())
          AND c.attempts < c.max_attempts
        ORDER BY c.created_at ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.comunicaciones_pedido u
    SET estado = 'processing',
        attempts = u.attempts + 1,
        updated_at = now()
    FROM claimed
    WHERE u.id = claimed.claim_id
    RETURNING 
        u.id,
        u.pedido_id,
        u.envio_id,
        u.event_id,
        u.tipo_comunicacion,
        u.destinatario_email,
        u.estado,
        u.attempts,
        u.max_attempts,
        u.payload,
        u.subject,
        u.body_html,
        u.body_text,
        u.idempotency_key,
        u.created_at;
END;
$$;

-- 4. RPC: comunicacion_mark_result (Actualización atómica de resultado)
CREATE OR REPLACE FUNCTION public.comunicacion_mark_result(
    p_id uuid,
    p_success boolean,
    p_provider_msg_id text DEFAULT NULL,
    p_error text DEFAULT NULL,
    p_retry_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_new_attempts integer;
    v_new_estado text;
    v_retry_after timestamptz := NULL;
BEGIN
    SELECT * INTO v_rec
    FROM public.comunicaciones_pedido
    WHERE id = p_id
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'COMUNICACION_NOT_FOUND: Registro % no encontrado', p_id USING ERRCODE = 'P0002';
    END IF;

    IF p_success = true THEN
        UPDATE public.comunicaciones_pedido
        SET estado = 'enviada',
            provider_message_id = trim(COALESCE(p_provider_msg_id, provider_message_id)),
            sent_at = now(),
            error_message = NULL,
            updated_at = now()
        WHERE id = p_id;

        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
        ) VALUES (
            'comunicacion.sent', 'comunicacion', p_id,
            jsonb_build_object(
                'comunicacion_id', p_id,
                'destinatario', v_rec.destinatario_email,
                'tipo', v_rec.tipo_comunicacion,
                'provider_message_id', p_provider_msg_id,
                'sent_at', now()
            ),
            NULL, now()
        );

        RETURN jsonb_build_object(
            'success', true,
            'id', p_id,
            'estado', 'enviada',
            'provider_message_id', p_provider_msg_id
        );
    ELSE
        v_new_attempts := v_rec.attempts + 1;
        IF v_new_attempts >= v_rec.max_attempts THEN
            v_new_estado := 'fallida';
        ELSE
            v_new_estado := 'retry_wait';
            v_retry_after := now() + (COALESCE(p_retry_seconds, 300) || ' seconds')::interval;
        END IF;

        UPDATE public.comunicaciones_pedido
        SET estado = v_new_estado,
            attempts = v_new_attempts,
            retry_after = v_retry_after,
            error_message = trim(COALESCE(p_error, 'Error no especificado')),
            updated_at = now()
        WHERE id = p_id;

        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
        ) VALUES (
            'comunicacion.failed', 'comunicacion', p_id,
            jsonb_build_object(
                'comunicacion_id', p_id,
                'destinatario', v_rec.destinatario_email,
                'tipo', v_rec.tipo_comunicacion,
                'attempts', v_new_attempts,
                'max_attempts', v_rec.max_attempts,
                'estado', v_new_estado,
                'error', p_error,
                'retry_after', v_retry_after
            ),
            NULL, now()
        );

        RETURN jsonb_build_object(
            'success', false,
            'id', p_id,
            'estado', v_new_estado,
            'attempts', v_new_attempts,
            'retry_after', v_retry_after,
            'error', p_error
        );
    END IF;
END;
$$;

-- 5. Helper de Encolado de Notificación de Envío Agrupado Inicial (submission.created)
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_submission_created(
    p_envio_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_envio RECORD;
    v_pedidos jsonb;
    v_comm_id uuid;
    v_idempotency_key text;
BEGIN
    SELECT id, correo, nombre_apellido, area_solicitante, created_at
    INTO v_envio
    FROM public.envios_formulario
    WHERE id = p_envio_id;

    IF v_envio.id IS NULL THEN
        RAISE EXCEPTION 'ENVIO_NOT_FOUND: Envío % no encontrado', p_envio_id USING ERRCODE = 'P0002';
    END IF;

    -- Obtener lista de pedidos asociados con categoría y tipo
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'pedido_visible', p.pedido_visible,
            'categoria', c.nombre,
            'tipo', ts.nombre,
            'fecha_limite', p.fecha_limite
        ) ORDER BY p.created_at ASC
    ) INTO v_pedidos
    FROM public.pedidos p
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    WHERE p.envio_id = p_envio_id;

    v_idempotency_key := 'submission_created:' || p_envio_id::text;
    v_comm_id := gen_random_uuid();

    INSERT INTO public.comunicaciones_pedido (
        id,
        envio_id,
        pedido_id,
        tipo_comunicacion,
        destinatario_email,
        estado,
        attempts,
        max_attempts,
        idempotency_key,
        payload,
        created_at
    ) VALUES (
        v_comm_id,
        p_envio_id,
        NULL,
        'pedido_ingresado',
        lower(trim(v_envio.correo)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'submission_created',
            'envio_id', p_envio_id,
            'nombre_apellido', v_envio.nombre_apellido,
            'area_solicitante', v_envio.area_solicitante,
            'correo', v_envio.correo,
            'pedidos', COALESCE(v_pedidos, '[]'::jsonb),
            'pedidos_count', jsonb_array_length(COALESCE(v_pedidos, '[]'::jsonb))
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

-- 6. Helper de Encolado de Notificación de Requerimiento de Información 48h
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_requested(
    p_solicitud_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_sol RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
BEGIN
    SELECT 
        si.id AS solicitud_id,
        si.pedido_id,
        si.mensaje,
        si.expires_at,
        si.created_at,
        p.pedido_visible,
        c.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        e.correo,
        e.nombre_apellido
    INTO v_sol
    FROM public.solicitudes_informacion si
    JOIN public.pedidos p ON si.pedido_id = p.id
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE si.id = p_solicitud_id;

    IF v_sol.solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_NOT_FOUND: Solicitud % no encontrada', p_solicitud_id USING ERRCODE = 'P0002';
    END IF;

    v_idempotency_key := 'info_requested:' || p_solicitud_id::text;
    v_comm_id := gen_random_uuid();

    INSERT INTO public.comunicaciones_pedido (
        id,
        envio_id,
        pedido_id,
        tipo_comunicacion,
        destinatario_email,
        estado,
        attempts,
        max_attempts,
        idempotency_key,
        payload,
        created_at
    ) VALUES (
        v_comm_id,
        NULL,
        v_sol.pedido_id,
        'informacion_faltante',
        lower(trim(v_sol.correo)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'info_requested',
            'solicitud_id', v_sol.solicitud_id,
            'pedido_id', v_sol.pedido_id,
            'pedido_visible', v_sol.pedido_visible,
            'categoria', v_sol.categoria_nombre,
            'tipo', v_sol.tipo_nombre,
            'nombre_apellido', v_sol.nombre_apellido,
            'mensaje', v_sol.mensaje,
            'expires_at', v_sol.expires_at,
            'plazo_horas', 48
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

-- 7. Helper de Encolado de Notificación de Finalización / Cancelación
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_lifecycle(
    p_pedido_id uuid,
    p_tipo text,
    p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_ped RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
    v_tipo_comm text;
BEGIN
    SELECT 
        p.id,
        p.pedido_visible,
        p.estado,
        p.motivo_cancelacion,
        c.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        e.id AS envio_id,
        e.correo,
        e.nombre_apellido
    INTO v_ped
    FROM public.pedidos p
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE p.id = p_pedido_id;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF p_tipo = 'finalizado' THEN
        v_tipo_comm := 'finalizado';
        v_idempotency_key := 'finalizado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSIF p_tipo = 'cancelado' THEN
        v_tipo_comm := 'cancelado';
        v_idempotency_key := 'cancelado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSE
        v_tipo_comm := 'cambio_estado';
        v_idempotency_key := 'cambio_estado:' || p_pedido_id::text || ':' || v_ped.estado || ':' || COALESCE(p_extra->>'version', '1');
    END IF;

    v_comm_id := gen_random_uuid();

    INSERT INTO public.comunicaciones_pedido (
        id,
        envio_id,
        pedido_id,
        tipo_comunicacion,
        destinatario_email,
        estado,
        attempts,
        max_attempts,
        idempotency_key,
        payload,
        created_at
    ) VALUES (
        v_comm_id,
        v_ped.envio_id,
        p_pedido_id,
        v_tipo_comm,
        lower(trim(v_ped.correo)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', v_tipo_comm,
            'pedido_id', p_pedido_id,
            'pedido_visible', v_ped.pedido_visible,
            'categoria', v_ped.categoria_nombre,
            'tipo', v_ped.tipo_nombre,
            'nombre_apellido', v_ped.nombre_apellido,
            'estado', v_ped.estado,
            'motivo_cancelacion', v_ped.motivo_cancelacion,
            'extra', p_extra
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

-- 8. Trigger automático en public.domain_events para encolar comunicaciones
CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.info_requested' AND NEW.payload ? 'solicitud_id' THEN
        PERFORM public.comunicacion_enqueue_info_requested((NEW.payload->>'solicitud_id')::uuid);
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

-- 9. Permisos y Revocaciones
REVOKE ALL ON FUNCTION public.comunicacion_claim_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_claim_batch(integer) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_mark_result(uuid, boolean, text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_submission_created(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_submission_created(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_requested(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_requested(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) TO service_role;

COMMIT;