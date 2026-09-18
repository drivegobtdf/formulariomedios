-- =============================================================================
-- Migration 035: Fix return value of comunicacion_enqueue_info_requested on conflict
--                Ensure RETURNING id INTO v_comm_id captures persisted row ID
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_requested(
    p_solicitud_id uuid,
    p_encrypted_envelope jsonb DEFAULT NULL
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
    v_payload jsonb;
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

    v_payload := jsonb_build_object(
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
    );

    IF p_encrypted_envelope IS NOT NULL THEN
        v_payload := jsonb_set(v_payload, '{encrypted_envelope}', p_encrypted_envelope);
    END IF;

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
        v_payload,
        now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = CASE 
        WHEN p_encrypted_envelope IS NOT NULL THEN jsonb_set(comunicaciones_pedido.payload, '{encrypted_envelope}', p_encrypted_envelope)
        ELSE comunicaciones_pedido.payload
    END,
    updated_at = CASE
        WHEN p_encrypted_envelope IS NOT NULL AND (comunicaciones_pedido.payload->'encrypted_envelope' IS DISTINCT FROM p_encrypted_envelope) THEN now()
        ELSE comunicaciones_pedido.updated_at
    END
    RETURNING id INTO v_comm_id;

    RETURN v_comm_id;
END;
$$;

-- Permisos granulares de ejecución
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) TO service_role;
