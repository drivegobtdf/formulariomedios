-- CAM-07D: notificaciones solicitante interno, sin envío real.
-- Base 15bb4f90f2d0842e090ec652bdc4748b72744752.
-- Migración incremental; no modifica migraciones históricas.

-- CAM-07D: nuevo pedido interno; sin contacto en eventos/auditoría ni enlaces inseguros.
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_internal_created(p_pedido_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_ped RECORD;
    v_comm_id uuid;
BEGIN
    SELECT p.id, p.pedido_visible, p.titulo,
           lower(trim(p.informacion_especifica->'solicitante'->>'correo')) AS correo,
           nullif(trim(p.informacion_especifica->'solicitante'->>'nombre'), '') AS nombre,
           nullif(trim(p.informacion_especifica->'solicitante'->>'area'), '') AS area,
           coalesce(c.nombre, 'General') AS categoria,
           coalesce(ts.nombre, 'General') AS tipo
    INTO v_ped
    FROM public.pedidos p
    LEFT JOIN public.categorias_servicio c ON c.id=p.categoria_id
    LEFT JOIN public.tipos_servicio ts ON ts.id=p.tipo_servicio_id
    WHERE p.id=p_pedido_id AND p.origen='interno';

    IF v_ped.id IS NULL OR v_ped.correo IS NULL OR
       v_ped.correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RETURN NULL; -- Históricos sin correo: fail-closed, no bloquea creación.
    END IF;

    INSERT INTO public.comunicaciones_pedido (
        id, pedido_id, envio_id, tipo_comunicacion, destinatario_email,
        estado, attempts, max_attempts, idempotency_key, payload, created_at
    ) VALUES (
        gen_random_uuid(), v_ped.id, NULL, 'pedido_ingresado', v_ped.correo,
        'pendiente', 0, 3, 'pedido_ingresado_interno:' || v_ped.id::text,
        jsonb_build_object(
            'intent_type', 'pedido_ingresado', 'origen', 'interno',
            'pedido_id', v_ped.id, 'pedido_visible', v_ped.pedido_visible,
            'nombre_apellido', coalesce(v_ped.nombre, 'Solicitante'),
            'area_solicitante', coalesce(v_ped.area, 'Gobierno'),
            'pedidos', jsonb_build_array(jsonb_build_object(
                'pedido_visible', v_ped.pedido_visible,
                'categoria', v_ped.categoria, 'tipo', v_ped.tipo
            ))
        ), now()
    ) ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_comm_id;
    RETURN v_comm_id;
END;
$$;
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_internal_created(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_internal_created(uuid) TO service_role;

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
    -- CAM-07D: resolver destinatarios por origen; no reutilizar envío público.

    SELECT
        p.id,
        p.pedido_visible,
        p.estado,
        p.origen,
        CASE WHEN p.origen = 'publico' THEN p.motivo_cancelacion ELSE NULL END AS motivo_cancelacion,
        COALESCE(c.nombre, 'General') AS categoria_nombre,
        COALESCE(ts.nombre, 'General') AS tipo_nombre,
        p.envio_id,
        CASE WHEN p.origen = 'interno'
             THEN lower(trim(p.informacion_especifica->'solicitante'->>'correo'))
             ELSE lower(trim(e.correo)) END AS correo,
        CASE WHEN p.origen = 'interno'
             THEN NULLIF(trim(p.informacion_especifica->'solicitante'->>'nombre'), '')
             ELSE e.nombre_apellido END AS nombre_apellido
    INTO v_ped
    FROM public.pedidos p
    LEFT JOIN public.categorias_servicio c ON p.categoria_id = c.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    LEFT JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE p.id = p_pedido_id;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- CAM-07D: los internos notifican los eventos solicitados, no cancelaciones
    -- ni cambios genéricos de coordinación.
    IF v_ped.origen = 'interno' AND p_tipo NOT IN ('en_proceso', 'finalizado') THEN
        RETURN NULL;
    END IF;
    IF v_ped.origen = 'interno' AND (v_ped.correo IS NULL OR
       v_ped.correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') THEN
        RETURN NULL;
    END IF;

    IF p_tipo = 'en_proceso' THEN
        v_tipo_comm := 'en_proceso';
        IF (p_extra->>'is_reopen')::boolean IS TRUE THEN
            v_idempotency_key := 'en_proceso_reopen:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version_reabierta', '1');
        ELSE
            v_idempotency_key := 'en_proceso:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
        END IF;
    ELSIF p_tipo = 'finalizado' THEN
        v_tipo_comm := 'finalizado';
        v_idempotency_key := 'finalizado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version_number', p_extra->>'version', '1');
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
            'origen', v_ped.origen,
            'pedido_id', p_pedido_id,
            'pedido_visible', v_ped.pedido_visible,
            'categoria', v_ped.categoria_nombre,
            'tipo', v_ped.tipo_nombre,
            'nombre_apellido', v_ped.nombre_apellido,
            'estado', v_ped.estado,
            'motivo_cancelacion', v_ped.motivo_cancelacion,
            -- Nunca serializar nota interna, motivo interno ni URL no curada
            -- desde eventos de dominio de pedidos internos.
            'extra', CASE WHEN v_ped.origen='interno'
                THEN jsonb_build_object(
                    'version', p_extra->>'version',
                    'version_number', p_extra->>'version_number',
                    'version_reabierta', p_extra->>'version_reabierta',
                    'is_reopen', COALESCE((p_extra->>'is_reopen')::boolean, false)
                ) ELSE p_extra END
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
        PERFORM public.comunicacion_enqueue_admin_new_submission(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.created_internal' THEN
        PERFORM public.comunicacion_enqueue_internal_created(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.assigned' THEN
        PERFORM public.comunicacion_enqueue_pedido_assigned(NEW.aggregate_id, NEW.payload);
    ELSIF NEW.event_name = 'user.approved' THEN
        PERFORM public.comunicacion_enqueue_access_approved(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.info_responded' THEN
        PERFORM public.comunicacion_enqueue_info_responded(
            NEW.aggregate_id,
            (NEW.payload->>'solicitud_id')::uuid
        );
    ELSIF NEW.event_name = 'pedido.reopened' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(
            NEW.aggregate_id,
            'en_proceso',
            jsonb_build_object(
                'is_reopen', true,
                'version_reabierta', (NEW.payload->>'version_reabierta'),
                'version', (NEW.payload->>'version')
            )
        );
    ELSIF NEW.event_name = 'pedido.finalized' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'finalizado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.cancelled' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'cancelado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.state_changed' THEN
        IF (NEW.payload->>'estado_nuevo') = 'En proceso' AND COALESCE(NEW.payload->>'estado_anterior', '') <> 'En proceso' THEN
            PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'en_proceso', NEW.payload);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.trg_domain_event_auto_enqueue() FROM PUBLIC, anon, authenticated;
