-- =============================================================================
-- CAM-01 / CAM-07C: RESPONSABLE OBLIGATORIO PARA SOLICITAR INFORMACIÓN
-- =============================================================================
-- Regla de negocio:
-- Solo se puede emitir una solicitud de información de 72 horas cuando
-- pedidos.responsable_user_id IS NOT NULL.
-- Aplica a pedidos públicos e internos en estados Nuevo, En revisión y En proceso.
-- =============================================================================

-- 1. ACTUALIZACIÓN DE public.info_request_create_atomic
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
        p.id, p.envio_id, p.categoria_id, p.tipo_servicio_id, p.estado, p.pedido_visible, p.version, p.origen, p.responsable_user_id
    INTO v_ped
    FROM public.pedidos p
    WHERE p.id = p_pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- CAM-07C: habilitar internos sin alterar matriz de estados y permisos.
    IF v_ped.origen NOT IN ('publico', 'interno') THEN
        RAISE EXCEPTION 'INVALID_ORIGIN: Origen de pedido no reconocido' USING ERRCODE = '42200';
    END IF;

    -- REGLA OBLIGATORIA: responsable asignado obligatorio para solicitar información
    IF v_ped.responsable_user_id IS NULL THEN
        RAISE EXCEPTION 'RESPONSABLE_REQUIRED: Debe asignar un responsable antes de solicitar información' USING ERRCODE = '42200';
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

    -- CAM-07C: fuente de identidad dependiente del origen, fail-closed.
    IF v_ped.origen = 'interno' THEN
        SELECT lower(trim(p.informacion_especifica->'solicitante'->>'correo')) AS correo,
               NULLIF(trim(p.informacion_especifica->'solicitante'->>'nombre'), '') AS nombre_apellido
        INTO v_envio FROM public.pedidos p WHERE p.id = v_ped.id;
    ELSE
        SELECT lower(trim(e.correo)) AS correo, e.nombre_apellido
        INTO v_envio FROM public.envios_formulario e WHERE e.id = v_ped.envio_id;
    END IF;

    IF v_envio.correo IS NULL OR
       v_envio.correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: El pedido no tiene un correo válido para solicitar información' USING ERRCODE = '42200';
    END IF;

    -- Recuperar nombres legibles de catálogo
    SELECT nombre INTO v_cat_nombre FROM public.categorias_servicio WHERE id = v_ped.categoria_id;
    SELECT nombre INTO v_tipo_nombre FROM public.tipos_servicio WHERE id = v_ped.tipo_servicio_id;

    -- Calcular vencimiento exacto (72 horas corridas — CAM-01)
    v_expires_at := now() + interval '72 hours';
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
        'plazo_horas', 72,
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

-- 2. ACTUALIZACIÓN DE public.info_request_create (RPC LEGADO)
CREATE OR REPLACE FUNCTION public.info_request_create(
    p_pedido_id uuid,
    p_mensaje text,
    p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_ped RECORD;
    v_raw_token text;
    v_token_hash text;
    v_solicitud_id uuid;
    v_expires_at timestamptz;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para solicitar información', v_actor_role USING ERRCODE = '42501';
    END IF;

    IF p_mensaje IS NULL OR length(trim(p_mensaje)) < 5 THEN
        RAISE EXCEPTION 'MESSAGE_REQUIRED: El mensaje de solicitud debe tener al menos 5 caracteres' USING ERRCODE = '42200';
    END IF;

    SELECT id, responsable_user_id, estado INTO v_ped FROM public.pedidos WHERE id = p_pedido_id;
    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA OBLIGATORIA: responsable asignado obligatorio para solicitar información
    IF v_ped.responsable_user_id IS NULL THEN
        RAISE EXCEPTION 'RESPONSABLE_REQUIRED: Debe asignar un responsable antes de solicitar información' USING ERRCODE = '42200';
    END IF;

    IF v_ped.estado NOT IN ('Nuevo', 'En revisión', 'En proceso') THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se puede solicitar información sobre pedidos en estado Nuevo, En revisión o En proceso (estado actual: %)', v_ped.estado USING ERRCODE = '42200';
    END IF;

    -- Generar token criptográfico (256 bits) y su hash SHA-256
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- REGLA APROBADA (CAM-01): 72 HORAS CORRIDAS
    v_expires_at := now() + interval '72 hours';
    v_solicitud_id := gen_random_uuid();

    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at, created_at
    ) VALUES (
        v_solicitud_id, p_pedido_id, v_actor_id, trim(p_mensaje), v_token_hash, 'pendiente', v_expires_at, now()
    );

    -- Emitir evento durable y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_requested', 'pedido', p_pedido_id,
        jsonb_build_object(
            'solicitud_id', v_solicitud_id,
            'pedido_id', p_pedido_id,
            'solicitada_por', v_actor_id,
            'expires_at', v_expires_at,
            'token_hash', v_token_hash
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'solicitudes_informacion', v_solicitud_id::text, 'create',
        jsonb_build_object('pedido_id', p_pedido_id, 'expires_at', v_expires_at),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_solicitud_id,
        'expires_at', v_expires_at,
        'raw_token', v_raw_token
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_request_create(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create(uuid, text, integer) TO service_role;
