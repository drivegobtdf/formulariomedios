-- =============================================================================
-- Migration 036: Atomic info_request Creation with Encrypted Envelope
--                and Elimination of Race Conditions
-- =============================================================================

-- 1. RPC Atómica de Creación de Requerimiento de Información con Sobre Cifrado
CREATE OR REPLACE FUNCTION public.info_request_create_atomic(
    p_solicitud_id uuid,
    p_pedido_id uuid,
    p_actor_user_id uuid,
    p_mensaje text,
    p_token_hash text,
    p_encrypted_envelope jsonb,
    p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_acceso RECORD;
    v_ped RECORD;
    v_envio RECORD;
    v_cat_nombre text;
    v_tipo_nombre text;
    v_expires_at timestamptz;
    v_comm_id uuid;
    v_idempotency_key text;
    v_payload jsonb;
BEGIN
    -- Validaciones de parámetros
    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_ID_REQUIRED: Se requiere un UUID para la solicitud' USING ERRCODE = '42200';
    END IF;

    IF p_pedido_id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_ID_REQUIRED: Se requiere el identificador del pedido' USING ERRCODE = '42200';
    END IF;

    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'ACTOR_REQUIRED: Se requiere el identificador del usuario actor' USING ERRCODE = '42501';
    END IF;

    IF p_mensaje IS NULL OR length(trim(p_mensaje)) < 5 THEN
        RAISE EXCEPTION 'MESSAGE_REQUIRED: El mensaje de solicitud debe tener al menos 5 caracteres' USING ERRCODE = '42200';
    END IF;

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'TOKEN_HASH_REQUIRED: Se requiere el hash criptográfico del token' USING ERRCODE = '42200';
    END IF;

    IF p_encrypted_envelope IS NULL OR NOT (p_encrypted_envelope ? 'ciphertext') OR NOT (p_encrypted_envelope ? 'iv') OR NOT (p_encrypted_envelope ? 'tag') THEN
        RAISE EXCEPTION 'ENVELOPE_REQUIRED: Se requiere sobre cifrado AES-256-GCM válido para la entrega' USING ERRCODE = '42200';
    END IF;

    -- Validar permisos de actor
    SELECT app_role, estado_acceso INTO v_actor_acceso
    FROM public.usuarios_acceso
    WHERE user_id = p_actor_user_id;

    IF v_actor_acceso.estado_acceso IS NULL OR v_actor_acceso.estado_acceso <> 'aprobado' OR v_actor_acceso.app_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para solicitar información', v_actor_acceso.app_role USING ERRCODE = '42501';
    END IF;

    -- Bloqueo pesimista del pedido y control de concurrencia
    SELECT 
        p.id, p.envio_id, p.categoria_id, p.tipo_servicio_id, p.estado, p.pedido_visible, p.version
    INTO v_ped
    FROM public.pedidos p
    WHERE p.id = p_pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_version IS NOT NULL AND v_ped.version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: El pedido fue modificado concurrentemente (esperada %, actual %)', p_expected_version, v_ped.version USING ERRCODE = '40001';
    END IF;

    -- Obtener datos asociados
    SELECT e.correo, e.nombre_apellido
    INTO v_envio
    FROM public.envios_formulario e
    WHERE e.id = v_ped.envio_id;

    SELECT c.nombre INTO v_cat_nombre FROM public.categorias_servicio c WHERE c.id = v_ped.categoria_id;
    SELECT ts.nombre INTO v_tipo_nombre FROM public.tipos_servicio ts WHERE ts.id = v_ped.tipo_servicio_id;

    -- Plazo estricto de 48 horas corridas
    v_expires_at := now() + interval '48 hours';
    v_idempotency_key := 'info_requested:' || p_solicitud_id::text;
    v_comm_id := gen_random_uuid();

    -- Insertar solicitud de información
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at, created_at
    ) VALUES (
        p_solicitud_id, p_pedido_id, p_actor_user_id, trim(p_mensaje), trim(p_token_hash), 'pendiente', v_expires_at, now()
    );

    -- Insertar domain event (NO auto-encola comunicación en el trigger)
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_requested', 'pedido', p_pedido_id,
        jsonb_build_object(
            'solicitud_id', p_solicitud_id,
            'pedido_id', p_pedido_id,
            'solicitada_por', p_actor_user_id,
            'expires_at', v_expires_at,
            'token_hash', trim(p_token_hash)
        ),
        p_actor_user_id, now()
    );

    -- Construir payload completo con encrypted_envelope incluido
    v_payload := jsonb_build_object(
        'intent_type', 'info_requested',
        'solicitud_id', p_solicitud_id,
        'pedido_id', p_pedido_id,
        'pedido_visible', v_ped.pedido_visible,
        'categoria', v_cat_nombre,
        'tipo', v_tipo_nombre,
        'nombre_apellido', v_envio.nombre_apellido,
        'mensaje', trim(p_mensaje),
        'expires_at', v_expires_at,
        'plazo_horas', 48,
        'encrypted_envelope', p_encrypted_envelope
    );

    -- Insertar comunicación encolada atómicamente con su sobre listo desde el inicio
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
        p_pedido_id,
        'informacion_faltante',
        lower(trim(v_envio.correo)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        v_payload,
        now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
    SET payload = jsonb_set(comunicaciones_pedido.payload, '{encrypted_envelope}', p_encrypted_envelope),
        updated_at = now()
    RETURNING id INTO v_comm_id;

    -- Auditoría
    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        p_actor_user_id, 'solicitudes_informacion', p_solicitud_id::text, 'create',
        jsonb_build_object('pedido_id', p_pedido_id, 'expires_at', v_expires_at, 'has_envelope', true),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', p_solicitud_id,
        'communication_id', v_comm_id,
        'expires_at', v_expires_at
    );
END;
$$;

-- 2. Modificar Trigger de Dominio para evitar Auto-Encolado Incompleto de pedido.info_requested
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
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Endurecer comunicacion_enqueue_info_requested para exigir sobre cifrado
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
    IF p_encrypted_envelope IS NULL OR NOT (p_encrypted_envelope ? 'ciphertext') THEN
        RAISE EXCEPTION 'ENVELOPE_REQUIRED: Se requiere sobre cifrado AES-256-GCM para encolar requerimiento de información' USING ERRCODE = '42200';
    END IF;

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
        'plazo_horas', 48,
        'encrypted_envelope', p_encrypted_envelope
    );

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
    SET payload = jsonb_set(comunicaciones_pedido.payload, '{encrypted_envelope}', p_encrypted_envelope),
        updated_at = now()
    RETURNING id INTO v_comm_id;

    RETURN v_comm_id;
END;
$$;

-- 4. Permisos Granulares y Revocación de RPC Directa para Clientes
REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) TO service_role;

-- Revocar acceso directo a la RPC legada para impedir bypass de la Edge Function
REVOKE ALL ON FUNCTION public.info_request_create(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create(uuid, text, integer) TO service_role;
