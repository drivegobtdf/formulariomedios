-- =============================================================================
-- Migration 033: Encrypted Envelope Support for info_requested Outbox
--                and Context Tagging in solicitante_submit_info_response
-- =============================================================================

-- 1. Helper de Encolado de Notificación de Requerimiento de Información 48h con Sobre Cifrado Opcional
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
    updated_at = now();

    RETURN v_comm_id;
END;
$$;

-- 2. Asegurar que solicitante_submit_info_response actualice contexto de archivos
CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response(
    p_session_token text,
    p_solicitud_id uuid,
    p_respuesta_texto text DEFAULT NULL,
    p_enlaces text[] DEFAULT NULL,
    p_archivos uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_correo text;
    v_sol RECORD;
    v_url text;
    v_enlace_id uuid;
    v_arch_id uuid;
    v_has_text boolean := (p_respuesta_texto IS NOT NULL AND length(trim(p_respuesta_texto)) > 0);
    v_has_links boolean := (p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0);
    v_has_files boolean := (p_archivos IS NOT NULL AND cardinality(p_archivos) > 0);
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto
    INTO v_sol
    FROM public.solicitudes_informacion si
    JOIN public.pedidos p ON si.pedido_id = p.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE si.id = p_solicitud_id AND lower(trim(e.correo)) = v_correo
    FOR UPDATE;

    IF v_sol.id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_NOT_FOUND: Solicitud no encontrada o no autorizada' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotencia
    IF v_sol.estado = 'respondida' THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'solicitud_id', v_sol.id);
    END IF;

    -- Validación estricta de vigencia de 48 horas
    IF now() >= v_sol.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha expirado tras las 48 horas corridas' USING ERRCODE = '42201';
    END IF;

    -- Requiere al menos texto, enlaces o archivos adjuntos
    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

    -- Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_sol.id;

    -- Asociar enlaces aportados
    IF v_has_links THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, url, descripcion, created_at)
                VALUES (v_enlace_id, trim(v_url), 'Aportado en respuesta a solicitud de información 48h', now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Asociar archivos adjuntos aportados
    IF v_has_files THEN
        FOREACH v_arch_id IN ARRAY p_archivos LOOP
            IF EXISTS (SELECT 1 FROM public.archivos WHERE id = v_arch_id) THEN
                UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;
                INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
                VALUES (v_arch_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Emitir evento de dominio
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'info_request.responded', 'pedido', v_sol.pedido_id,
        jsonb_build_object(
            'pedido_id', v_sol.pedido_id,
            'solicitud_id', v_sol.id,
            'correo', v_correo,
            'has_text', v_has_text,
            'links_count', COALESCE(cardinality(p_enlaces), 0),
            'files_count', COALESCE(cardinality(p_archivos), 0),
            'responded_at', now()
        ),
        NULL, now()
    );

    RETURN jsonb_build_object('success', true, 'solicitud_id', v_sol.id, 'estado', 'respondida');
END;
$$;
