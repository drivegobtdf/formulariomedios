-- Migration: 20261011014123_hotfix_comunicaciones_outbox_state_change.sql
-- HOTFIX: Corrección de referencias erróneas a public.comunicaciones_outbox
-- Restauración de tabla canónica public.comunicaciones_pedido preservando
-- la regla de no-emisión externa en pedidos internos (Fase B.3).

-- =============================================================================
-- 1. CORRECCIÓN DE public.comunicacion_enqueue_lifecycle
-- =============================================================================

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
    -- Si el pedido es interno, omitir la emisión de comunicaciones externas al solicitante
    IF EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id AND origen = 'interno') THEN
        RETURN NULL;
    END IF;

    SELECT 
        p.id,
        p.pedido_visible,
        p.estado,
        p.motivo_cancelacion,
        COALESCE(c.nombre, 'General') AS categoria_nombre,
        COALESCE(ts.nombre, 'General') AS tipo_nombre,
        e.id AS envio_id,
        e.correo,
        e.nombre_apellido
    INTO v_ped
    FROM public.pedidos p
    LEFT JOIN public.categorias_servicio c ON p.categoria_id = c.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
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

    -- Inserción canónica en public.comunicaciones_pedido
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

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) TO service_role;


-- =============================================================================
-- 2. CORRECCIÓN DE public.info_request_create_atomic
-- =============================================================================

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
SET search_path = ''
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
    v_new_version integer;
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

    -- Validar permisos del actor
    SELECT app_role, estado_acceso INTO v_actor_acceso
    FROM public.usuarios_acceso
    WHERE user_id = p_actor_user_id;

    IF v_actor_acceso.estado_acceso IS NULL OR v_actor_acceso.estado_acceso <> 'aprobado' OR v_actor_acceso.app_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para solicitar información', v_actor_acceso.app_role USING ERRCODE = '42501';
    END IF;

    -- Bloqueo pesimista del pedido y control de concurrencia
    SELECT 
        p.id, p.envio_id, p.categoria_id, p.tipo_servicio_id, p.estado, p.pedido_visible, p.version, p.origen
    INTO v_ped
    FROM public.pedidos p
    WHERE p.id = p_pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA ESTRICTA B.3: Prohibir solicitudes de información sobre pedidos internos
    IF v_ped.origen = 'interno' THEN
        RAISE EXCEPTION 'INFO_REQUEST_NOT_ALLOWED_FOR_INTERNAL: No se puede solicitar información en pedidos de origen interno' USING ERRCODE = '22000';
    END IF;

    -- Rechazar explícitamente estados terminales o incompatibles
    IF v_ped.estado IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_STATE: No se puede solicitar información sobre un pedido en estado terminal %', v_ped.estado USING ERRCODE = '42200';
    END IF;

    IF v_ped.estado NOT IN ('Nuevo', 'En revisión', 'En proceso') THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se puede solicitar información sobre pedidos en estado Nuevo, En revisión o En proceso (estado actual: %)', v_ped.estado USING ERRCODE = '42200';
    END IF;

    -- Validar versión esperada
    IF p_expected_version IS NOT NULL AND v_ped.version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: El pedido fue modificado concurrentemente (esperada %s, actual %s)', p_expected_version, v_ped.version);
    END IF;

    -- Comprobar que no exista ya una solicitud de información pendiente para este pedido
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = p_pedido_id AND estado = 'pendiente'
    ) THEN
        RAISE EXCEPTION 'PENDING_REQUEST_EXISTS: Ya existe una solicitud de información pendiente de respuesta para este pedido' USING ERRCODE = '42200';
    END IF;

    -- Recuperar datos del envío público asociado
    SELECT correo, nombre_apellido INTO v_envio
    FROM public.envios_formulario
    WHERE id = v_ped.envio_id;

    IF v_envio.correo IS NULL THEN
        RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: No se encontró destinatario válido para el pedido' USING ERRCODE = 'P0002';
    END IF;

    -- Recuperar nombres legibles de catálogo
    SELECT nombre INTO v_cat_nombre FROM public.categorias_servicio WHERE id = v_ped.categoria_id;
    SELECT nombre INTO v_tipo_nombre FROM public.tipos_servicio WHERE id = v_ped.tipo_servicio_id;

    -- Calcular vencimiento exacto (48 horas reloj)
    v_expires_at := now() + interval '48 hours';
    v_idempotency_key := 'info_requested:' || p_solicitud_id::text;
    v_comm_id := gen_random_uuid();
    v_new_version := v_ped.version + 1;

    -- 1. Insertar la solicitud de información guardando el estado actual como estado_previo
    INSERT INTO public.solicitudes_informacion (
        id,
        pedido_id,
        solicitada_por,
        mensaje,
        token_hash,
        estado,
        expires_at,
        created_at,
        estado_previo
    ) VALUES (
        p_solicitud_id,
        p_pedido_id,
        p_actor_user_id,
        trim(p_mensaje),
        trim(p_token_hash),
        'pendiente',
        v_expires_at,
        now(),
        v_ped.estado
    );

    -- 2. Transicionar pedido a 'Esperando información' e incrementar versión
    UPDATE public.pedidos
    SET 
        estado = 'Esperando información',
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 3. Emitir domain event del cambio de estado
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_requested',
        'pedido',
        p_pedido_id,
        jsonb_build_object(
            'solicitud_id', p_solicitud_id,
            'pedido_id', p_pedido_id,
            'solicitada_por', p_actor_user_id,
            'estado_previo', v_ped.estado,
            'nuevo_estado', 'Esperando información',
            'expires_at', v_expires_at,
            'token_hash', trim(p_token_hash),
            'version', v_new_version
        ),
        p_actor_user_id,
        now()
    );

    -- 4. Registrar en historial / audit log
    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        p_actor_user_id,
        'solicitudes_informacion',
        p_solicitud_id::text,
        'create',
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'estado_previo', v_ped.estado,
            'nuevo_estado', 'Esperando información',
            'expires_at', v_expires_at,
            'has_envelope', true,
            'version', v_new_version
        ),
        now()
    );

    -- 5. Encolar comunicación atómica en public.comunicaciones_pedido
    v_payload := jsonb_build_object(
        'intent_type', 'info_requested',
        'solicitud_id', p_solicitud_id,
        'pedido_id', p_pedido_id,
        'pedido_visible', v_ped.pedido_visible,
        'categoria', COALESCE(v_cat_nombre, 'General'),
        'tipo', COALESCE(v_tipo_nombre, 'General'),
        'nombre_apellido', v_envio.nombre_apellido,
        'mensaje', trim(p_mensaje),
        'expires_at', v_expires_at,
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

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', p_solicitud_id,
        'pedido_id', p_pedido_id,
        'communication_id', v_comm_id,
        'expires_at', v_expires_at,
        'estado', 'Esperando información',
        'estado_previo', v_ped.estado,
        'version', v_new_version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;
