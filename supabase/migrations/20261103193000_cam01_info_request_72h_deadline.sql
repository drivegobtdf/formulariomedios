-- =============================================================================
-- MIGRACIÓN: 20261103193000_cam01_info_request_72h_deadline.sql
-- OBJETIVO: CAM-01 — Extender de 48 a 72 horas corridas el plazo de respuesta
--           a nuevas solicitudes de información adicional emitidas por
--           Secretaría de Medios, preservando el vencimiento y plazo real de
--           las solicitudes históricas.
-- =============================================================================

-- =============================================================================
-- 1. ACTUALIZACIÓN DE public.info_request_create_atomic (72 HORAS CORRIDAS)
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


-- =============================================================================
-- 2. ACTUALIZACIÓN DE public.info_request_create (RPC LEGADO — 72 HORAS)
-- =============================================================================

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

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
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

    -- Emitir evento durable y auditoría (NO cambia estado de PED automáticamente)
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


-- =============================================================================
-- 3. ACTUALIZACIÓN DE public.comunicacion_enqueue_info_requested
--    Conserva el plazo real de la solicitud referenciada (48h histórica o 72h nueva)
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
    v_plazo_horas integer;
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

    -- Conservar el plazo real de la solicitud referenciada (p. ej. 48h histórica o 72h nueva)
    IF v_sol.expires_at IS NOT NULL AND v_sol.created_at IS NOT NULL AND v_sol.expires_at > v_sol.created_at THEN
        v_plazo_horas := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_sol.expires_at - v_sol.created_at)) / 3600.0)::integer);
    ELSE
        v_plazo_horas := NULL;
    END IF;

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
        'plazo_horas', v_plazo_horas,
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

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_requested(uuid, jsonb) TO service_role;


-- =============================================================================
-- 4. ACTUALIZACIÓN DE public.pedido_finalize
--    Elimina referencia fija e inexacta a (48h) en mensaje de bloqueo
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pedido_finalize(
    p_pedido_id uuid,
    p_expected_version bigint,
    p_archivos_entrega uuid[] DEFAULT NULL,
    p_url_entrega text DEFAULT NULL,
    p_nota_entrega text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid;
    v_current_state text;
    v_current_version bigint;
    v_responsable_id uuid;
    v_origen text;
    v_new_version bigint;
    v_entrega_id uuid := NULL;
    v_next_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_clean_nota text;
    v_archivos_count integer := 0;
    v_is_retrabajo boolean := false;
    v_active_rev_id uuid;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Validar rol operativo de gestión
    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios_acceso
        WHERE user_id = v_actor_id
          AND estado_acceso = 'aprobado'
          AND app_role IN ('administrador', 'equipo')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Rol no autorizado para finalizar pedidos' USING ERRCODE = '42501';
    END IF;

    v_clean_url := NULLIF(trim(p_url_entrega), '');
    v_clean_nota := NULLIF(trim(p_nota_entrega), '');

    -- Contar archivos entregados
    IF p_archivos_entrega IS NOT NULL THEN
        v_archivos_count := cardinality(p_archivos_entrega);
    END IF;

    -- Validar formato de URL si se suministró contenido
    IF v_clean_url IS NOT NULL THEN
        IF v_clean_url !~* '^https?://.+' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS' USING ERRCODE = '42200';
        END IF;
    END IF;

    -- Bloquear pedido y validar versión
    SELECT estado, version, responsable_user_id, retrabajo_activo, origen
    INTO v_current_state, v_current_version, v_responsable_id, v_is_retrabajo, v_origen
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA DEFINITIVA DE NEGOCIO:
    -- Para pedidos públicos, la nota de entrega es OBLIGATORIA (trim no vacío).
    IF v_origen = 'publico' AND v_clean_nota IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOTE_REQUIRED: La nota de entrega es obligatoria para finalizar un pedido público' USING ERRCODE = '42200';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: Versión esperada %s no coincide con actual %s', p_expected_version, v_current_version);
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);

    -- REGLA CANÓNICA: ÚNICAMENTE DESDE 'En proceso'
    IF v_current_state <> 'En proceso' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- HARD GUARD: Responsable asignado obligatorio y válido
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- HARD GUARD: Rechazar finalización si existen solicitudes de información pendientes y vigentes
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = p_pedido_id
          AND estado = 'pendiente'
          AND now() < expires_at
    ) THEN
        RAISE EXCEPTION 'PENDING_INFO_REQUEST: No se puede finalizar el pedido porque posee solicitudes de información pendientes y vigentes' USING ERRCODE = '42200';
    END IF;

    -- Validar integridad de archivos de entrega si fueron suministrados
    IF v_archivos_count > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivos_entrega LOOP
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo de entrega % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo de entrega % no está verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;
            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido
                WHERE archivo_id = v_arch_id AND pedido_id <> p_pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;
        END LOOP;
    END IF;

    -- 1. Calcular siguiente número de versión canónica
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.pedido_versiones
    WHERE pedido_id = p_pedido_id;

    -- 2. REGLA CRÍTICA: Desmarcar cualquier entrega previa como vigente SIEMPRE
    -- Si la nueva finalización no posee material, ninguna entrega quedará vigente.
    UPDATE public.entregas_pedido
    SET es_vigente = false
    WHERE pedido_id = p_pedido_id;

    -- 3. Registrar entrega material SOLO si hay archivo o enlace
    IF v_archivos_count > 0 OR v_clean_url IS NOT NULL THEN
        v_entrega_id := gen_random_uuid();
        INSERT INTO public.entregas_pedido (
            id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
        ) VALUES (
            v_entrega_id, p_pedido_id, v_next_version, true,
            CASE WHEN v_archivos_count > 0 THEN p_archivos_entrega[1] ELSE NULL END,
            v_clean_url,
            v_clean_nota,
            v_actor_id, now()
        );

        -- Asociar archivos a la entrega normalizada (entrega_archivos) y al pedido (archivo_pedido)
        IF v_archivos_count > 0 THEN
            FOREACH v_arch_id IN ARRAY p_archivos_entrega LOOP
                INSERT INTO public.entrega_archivos (entrega_id, archivo_id)
                VALUES (v_entrega_id, v_arch_id)
                ON CONFLICT (entrega_id, archivo_id) DO NOTHING;

                UPDATE public.archivos SET contexto = 'entrega' WHERE id = v_arch_id;

                INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
                VALUES (v_arch_id, p_pedido_id)
                ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    ELSIF v_clean_nota IS NOT NULL THEN
        -- Finalización sin material pero con nota:
        INSERT INTO public.notas_pedido (
            id, pedido_id, autor_user_id, visibilidad, texto, created_at
        ) VALUES (
            gen_random_uuid(), p_pedido_id, v_actor_id,
            CASE WHEN v_origen = 'publico' THEN 'solicitante' ELSE 'interna' END,
            v_clean_nota, now()
        );
    END IF;

    -- 4. Registrar la versión canónica inmutable en pedido_versiones
    INSERT INTO public.pedido_versiones (
        pedido_id, version_number, entrega_id, nota_cierre, finalizado_por, finalizado_at
    ) VALUES (
        p_pedido_id, v_next_version, v_entrega_id, v_clean_nota, v_actor_id, now()
    );

    -- 5. Si el pedido estaba en retrabajo, resolver la revisión activa correspondiente
    IF v_is_retrabajo THEN
        SELECT id INTO v_active_rev_id
        FROM public.revision_pedidos
        WHERE pedido_id = p_pedido_id AND estado IN ('abierta', 'en_tratamiento')
        ORDER BY revision_number DESC
        LIMIT 1;

        IF v_active_rev_id IS NOT NULL THEN
            UPDATE public.revision_pedidos
            SET estado = 'resuelta',
                resolved_at = now(),
                resolved_by = v_actor_id,
                resolucion_notas = v_clean_nota
            WHERE id = v_active_rev_id;
        END IF;
    END IF;

    v_new_version := v_current_version + 1;

    -- 6. Actualizar pedido a finalizado y desactivar flag de retrabajo
    UPDATE public.pedidos
    SET estado = 'Finalizado',
        retrabajo_activo = false,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 7. Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.finalized', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'entrega_id', v_entrega_id,
            'entrega_version', v_next_version,
            'version_number', v_next_version,
            'is_nueva_version', (v_next_version > 1),
            'actor_id', v_actor_id,
            'version', v_new_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'nota', v_clean_nota
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
            'version_number', v_next_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'nota', v_clean_nota,
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'new_version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'Finalizado',
        'version', v_new_version,
        'version_number', v_next_version,
        'entrega_id', v_entrega_id,
        'entrega_version', v_next_version,
        'retrabajo_resuelto', v_is_retrabajo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;
