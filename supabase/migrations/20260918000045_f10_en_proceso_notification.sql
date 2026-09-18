-- =============================================================================
-- Migración: 20260918000045_f10_en_proceso_notification.sql
-- Notificación automática al solicitante cuando un PED pasa a 'En proceso'.
-- Preserva outbox F10, idempotencia determinista y previene reenvíos retrospectivos.
-- =============================================================================

-- 1. Actualizar public.comunicacion_enqueue_lifecycle para soportar 'en_proceso'
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

    IF p_tipo = 'en_proceso' THEN
        v_tipo_comm := 'en_proceso';
        v_idempotency_key := 'en_proceso:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSIF p_tipo = 'finalizado' THEN
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

-- 2. Actualizar trg_domain_event_auto_enqueue para capturar transiciones a 'En proceso'
CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
    -- pedido.info_requested NO auto-encola por trigger; se crea atómicamente con su sobre cifrado
    ELSIF NEW.event_name = 'pedido.info_responded' THEN
        PERFORM public.comunicacion_enqueue_info_responded(
            NEW.aggregate_id,
            (NEW.payload->>'solicitud_id')::uuid
        );
    ELSIF NEW.event_name = 'pedido.finalized' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'finalizado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.cancelled' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'cancelado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.state_changed' THEN
        -- Notificar únicamente cuando la transición confirmada sea hacia 'En proceso'
        IF (NEW.payload->>'estado_nuevo') = 'En proceso' AND COALESCE(NEW.payload->>'estado_anterior', '') <> 'En proceso' THEN
            PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'en_proceso', NEW.payload);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Permisos y PoLP
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) TO service_role;
