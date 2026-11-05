-- CAM-07C: pedidos internos, solicitudes de información y respuesta 72 horas.
-- Generada desde funciones canónicas del commit 6f015ba119d9245f40824380582649c820ce0299.
-- SIN cambios a datos históricos ni migraciones anteriores.

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

    -- CAM-07C: habilitar internos sin alterar matriz de estados y permisos.
    IF v_ped.origen NOT IN ('publico', 'interno') THEN
        RAISE EXCEPTION 'INVALID_ORIGIN: Origen de pedido no reconocido' USING ERRCODE = '42200';
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

CREATE OR REPLACE FUNCTION public.info_response_submit_core(
    p_token_hash text,
    p_respuesta_texto text DEFAULT NULL,
    p_archivo_ids uuid[] DEFAULT NULL,
    p_enlaces text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_solicitud RECORD;
    v_pedido_id uuid;
    v_envio_id uuid;
    v_arch_id uuid;
    v_url text;
    v_enlace_id uuid;
    v_arch_estado text;
    v_current_pedido_estado text;
BEGIN
    -- 1. Buscar y bloquear solicitud por token_hash
    SELECT id, pedido_id, estado, expires_at, respuesta_texto INTO v_solicitud
    FROM public.solicitudes_informacion
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF v_solicitud.id IS NULL THEN
        RAISE EXCEPTION 'TOKEN_NOT_FOUND: Solicitud de información no encontrada para el token provisto' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Idempotencia: Si ya está respondida, retornar éxito idempotente
    IF v_solicitud.estado = 'respondida' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'solicitud_id', v_solicitud.id,
            'pedido_id', v_solicitud.pedido_id,
            'message', 'Esta solicitud ya ha sido respondida previamente'
        );
    END IF;

    -- 3. Vencimiento por expires_at vigente (histórico 48h / nuevo 72h)
    IF now() >= v_solicitud.expires_at THEN
        UPDATE public.solicitudes_informacion
        SET estado = 'vencida'
        WHERE id = v_solicitud.id;

        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha vencido' USING ERRCODE = '42201';
    END IF;

    -- 4. Validar contenido
    IF (p_respuesta_texto IS NULL OR length(trim(p_respuesta_texto)) = 0)
       AND (p_archivo_ids IS NULL OR cardinality(p_archivo_ids) = 0)
       AND (p_enlaces IS NULL OR cardinality(p_enlaces) = 0) THEN
        RAISE EXCEPTION 'PAYLOAD_REQUIRED: Debe incluir texto de respuesta, archivos o enlaces' USING ERRCODE = '42200';
    END IF;

    v_pedido_id := v_solicitud.pedido_id;

    -- H1 BLOQUEO DEL AGREGADO RAÍZ: Bloquear public.pedidos FOR UPDATE para serializar decisiones de estado
    SELECT envio_id, estado INTO v_envio_id, v_current_pedido_estado
    FROM public.pedidos
    WHERE id = v_pedido_id
    FOR UPDATE;

    IF v_current_pedido_estado IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', v_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- 5. Validar y asociar archivos aportados
    IF p_archivo_ids IS NOT NULL AND cardinality(p_archivo_ids) > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivo_ids LOOP
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % aún no se encuentra verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.archivo_solicitud_informacion
                WHERE archivo_id = v_arch_id AND solicitud_informacion_id <> v_solicitud.id
            ) THEN
                RAISE EXCEPTION 'FILE_ALREADY_ASSOCIATED: El archivo % ya está asociado a otra solicitud de información', v_arch_id USING ERRCODE = '42200';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido
                WHERE archivo_id = v_arch_id AND pedido_id <> v_pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;

            UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;

            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_pedido_id)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.archivo_solicitud_informacion (solicitud_informacion_id, archivo_id)
            VALUES (v_solicitud.id, v_arch_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 6. Validar y asociar enlaces aportados
    IF p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0 THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF v_url IS NOT NULL AND length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
                VALUES (v_enlace_id, v_envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información', now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_pedido_id)
                ON CONFLICT DO NOTHING;

                INSERT INTO public.enlace_solicitud_informacion (solicitud_informacion_id, enlace_id)
                VALUES (v_solicitud.id, v_enlace_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 7. Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_solicitud.id;

    -- H1 REGLA DE CONSISTENCIA SERIALIZADA: Retorno condicional a 'En proceso'
    -- Con public.pedidos bloqueado FOR UPDATE, verificar si quedan solicitudes del mismo pedido con estado 'pendiente' y vigentes (por expires_at)
    IF NOT EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = v_pedido_id
          AND id <> v_solicitud.id
          AND estado = 'pendiente'
          AND now() < expires_at
    ) THEN
        UPDATE public.pedidos
        SET estado = 'En proceso',
            version = version + 1,
            updated_at = now()
        WHERE id = v_pedido_id
          AND estado = 'Esperando información';
    END IF;

    -- 8. Emitir evento durable y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_pedido_id,
        jsonb_build_object(
            'solicitud_id', v_solicitud.id,
            'pedido_id', v_pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivo_ids), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0),
            'respondida_at', now()
        ),
        NULL, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL, 'solicitudes_informacion', v_solicitud.id::text, 'respond',
        jsonb_build_object(
            'pedido_id', v_pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivo_ids), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0)
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_solicitud.id,
        'pedido_id', v_pedido_id
    );
END;
$$;

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
    v_arch_estado text;
    v_has_text boolean := (p_respuesta_texto IS NOT NULL AND length(trim(p_respuesta_texto)) > 0);
    v_has_links boolean := (p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0);
    v_has_files boolean := (p_archivos IS NOT NULL AND cardinality(p_archivos) > 0);
    v_pedido_estado text;
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia bloqueando la solicitud
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto, p.envio_id
    INTO v_sol
    FROM public.solicitudes_informacion si
    JOIN public.pedidos p ON si.pedido_id = p.id
    LEFT JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE si.id = p_solicitud_id
      AND (
        (p.origen = 'publico' AND lower(trim(e.correo)) = v_correo)
        OR (p.origen = 'interno' AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_correo)
      )
    FOR UPDATE OF si;

    IF v_sol.id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_NOT_FOUND: Solicitud no encontrada o no autorizada' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotencia
    IF v_sol.estado = 'respondida' THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'solicitud_id', v_sol.id);
    END IF;

    -- Vigencia real segun expires_at (historicos 48h, nuevos 72h)
    IF now() >= v_sol.expires_at THEN
        UPDATE public.solicitudes_informacion
        SET estado = 'vencida'
        WHERE id = v_sol.id;

        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha expirado' USING ERRCODE = '42201';
    END IF;

    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

    -- H1 BLOQUEO DEL AGREGADO RAÍZ: Bloquear public.pedidos FOR UPDATE para serializar decisiones de estado
    SELECT estado INTO v_pedido_estado
    FROM public.pedidos
    WHERE id = v_sol.pedido_id
    FOR UPDATE;

    -- Validar y asociar archivos adjuntos aportados
    IF v_has_files THEN
        FOREACH v_arch_id IN ARRAY p_archivos LOOP
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % aún no se encuentra verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.archivo_solicitud_informacion
                WHERE archivo_id = v_arch_id AND solicitud_informacion_id <> v_sol.id
            ) THEN
                RAISE EXCEPTION 'FILE_ALREADY_ASSOCIATED: El archivo % ya está asociado a otra solicitud de información', v_arch_id USING ERRCODE = '42200';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido
                WHERE archivo_id = v_arch_id AND pedido_id <> v_sol.pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;

            UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;

            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_sol.pedido_id)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.archivo_solicitud_informacion (solicitud_informacion_id, archivo_id)
            VALUES (v_sol.id, v_arch_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Validar y asociar enlaces aportados
    IF v_has_links THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
                VALUES (v_enlace_id, v_sol.envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información', now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;

                INSERT INTO public.enlace_solicitud_informacion (solicitud_informacion_id, enlace_id)
                VALUES (v_sol.id, v_enlace_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_sol.id;

    -- H1 REGLA DE CONSISTENCIA SERIALIZADA: Retorno condicional a 'En proceso'
    -- Con public.pedidos bloqueado FOR UPDATE, verificar si quedan solicitudes del mismo pedido con estado 'pendiente' y vigentes (por expires_at)
    IF NOT EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = v_sol.pedido_id
          AND id <> v_sol.id
          AND estado = 'pendiente'
          AND now() < expires_at
    ) THEN
        UPDATE public.pedidos
        SET estado = 'En proceso',
            version = version + 1,
            updated_at = now()
        WHERE id = v_sol.pedido_id
          AND estado = 'Esperando información';
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

CREATE OR REPLACE FUNCTION public.solicitante_get_internal_pedido_detail(
    p_session_token text,
    p_pedido_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_email text;
    v_ped RECORD;
    v_entrega jsonb := NULL;
    v_versiones jsonb := '[]'::jsonb;
    v_historial jsonb := '[]'::jsonb;
    v_solicitudes jsonb := '[]'::jsonb;
BEGIN
    v_email := private.validate_solicitante_session(p_session_token);

    SELECT p.id, p.envio_id, p.pedido_visible, p.anio, p.numero,
           p.codigo_categoria, p.estado, p.retrabajo_activo, p.revision_count,
           p.informacion_especifica, p.archivado, p.created_at, p.updated_at,
           cs.nombre AS categoria_nombre, ts.nombre AS tipo_nombre
      INTO v_ped
      FROM public.pedidos p
      LEFT JOIN public.categorias_servicio cs ON cs.id = p.categoria_id
      LEFT JOIN public.tipos_servicio ts ON ts.id = p.tipo_servicio_id
     WHERE p.origen = 'interno'
       AND (p.id::text = p_pedido_ref OR p.pedido_visible = p_pedido_ref)
       AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_email;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado o no autorizado para esta sesión' USING ERRCODE = 'P0002';
    END IF;

    -- CAM-07C: only this authorized pedido's requester-facing questions/answers.
    -- Never expose operator notes, event payloads or CAM-11 reference files.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', si.id,
        'mensaje', si.mensaje,
        'estado', si.estado,
        'expires_at', si.expires_at,
        'created_at', si.created_at,
        'respuesta_texto', si.respuesta_texto,
        'responded_at', si.responded_at,
        'archivos_respuesta', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'nombre_original', a.nombre_original,
                'size_bytes', a.size_bytes, 'mime_type', a.mime_type
            )) FROM public.archivo_solicitud_informacion asi
            JOIN public.archivos a ON a.id = asi.archivo_id
            WHERE asi.solicitud_informacion_id = si.id
              AND a.estado = 'verified' AND a.contexto = 'informacion_respuesta'
        ), '[]'::jsonb),
        'enlaces_respuesta', COALESCE((
            SELECT jsonb_agg(em.url)
            FROM public.enlace_solicitud_informacion esi
            JOIN public.enlaces_material em ON em.id = esi.enlace_id
            WHERE esi.solicitud_informacion_id = si.id
        ), '[]'::jsonb)
    ) ORDER BY si.created_at ASC), '[]'::jsonb)
    INTO v_solicitudes
    FROM public.solicitudes_informacion si WHERE si.pedido_id = v_ped.id;

    -- Only active delivery material, never internal notes, ad-hoc attached files,
    -- private draft links or CAM-11 references.
    SELECT jsonb_build_object(
        'id', ep.id,
        'version', ep.version,
        'enlace_externo', ep.enlace_externo,
        'url_entrega', ep.enlace_externo,
        'nota', NULL,
        'nota_publica', NULL,
        'created_at', ep.created_at,
        'archivo', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', a.id, 'nombre_original', a.nombre_original,
            'size_bytes', a.size_bytes, 'mime_type', a.mime_type
        ) END,
        'archivos', COALESCE((
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
                'id', af.id, 'nombre_original', af.nombre_original,
                'size_bytes', af.size_bytes, 'mime_type', af.mime_type
            ))
            FROM (
                SELECT ep.archivo_id AS archivo_id WHERE ep.archivo_id IS NOT NULL
                UNION
                SELECT ea.archivo_id FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id
            ) f
            JOIN public.archivos af ON af.id = f.archivo_id
            WHERE af.estado = 'verified' AND af.contexto = 'entrega'
        ), '[]'::jsonb)
    ) INTO v_entrega
      FROM public.entregas_pedido ep
      LEFT JOIN public.archivos a ON a.id = ep.archivo_id
                                 AND a.estado = 'verified' AND a.contexto = 'entrega'
     WHERE ep.pedido_id = v_ped.id AND ep.es_vigente IS TRUE
       AND (ep.enlace_externo IS NOT NULL OR
            EXISTS (
               SELECT 1 FROM public.entrega_archivos ea
               JOIN public.archivos a2 ON a2.id = ea.archivo_id
               WHERE ea.entrega_id = ep.id AND a2.estado = 'verified' AND a2.contexto = 'entrega'
            ) OR a.id IS NOT NULL)
     LIMIT 1;

    -- Preserve the visible version history but redact ALL internal closure notes.
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'version_number')::integer DESC), '[]'::jsonb)
      INTO v_versiones
      FROM (
        SELECT jsonb_build_object(
            'version_number', pv.version_number,
            'finalizado_at', pv.finalizado_at,
            'nota', NULL,
            'enlace_externo', ep.enlace_externo,
            'archivos', COALESCE((
                SELECT jsonb_agg(DISTINCT jsonb_build_object(
                    'id', a.id, 'nombre_original', a.nombre_original,
                    'size_bytes', a.size_bytes, 'mime_type', a.mime_type
                ))
                FROM (
                    SELECT ep.archivo_id AS archivo_id WHERE ep.archivo_id IS NOT NULL
                    UNION
                    SELECT ea.archivo_id FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id
                ) f
                JOIN public.archivos a ON a.id = f.archivo_id
                WHERE a.estado = 'verified' AND a.contexto = 'entrega'
            ), '[]'::jsonb)
        ) AS item
        FROM public.pedido_versiones pv
        LEFT JOIN public.entregas_pedido ep ON ep.id = pv.entrega_id AND ep.pedido_id = v_ped.id
        WHERE pv.pedido_id = v_ped.id
      ) versions;

    -- Event metadata is translated to a hardcoded public-safe vocabulary.
    -- DO NOT return event payload, actor IDs, message bodies or private reasons.
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
      INTO v_historial
      FROM (
         SELECT jsonb_build_object(
             'tipo', CASE de.event_name
                 WHEN 'pedido.created_internal' THEN 'created'
                 WHEN 'pedido.info_requested' THEN 'info_requested'
                 WHEN 'pedido.info_responded' THEN 'info_responded'
                 WHEN 'pedido.state_changed' THEN 'state_changed'
                 WHEN 'pedido.finalized' THEN 'finalized'
                 WHEN 'pedido.reopened' THEN 'reopened'
                 WHEN 'pedido.cancelled' THEN 'cancelled'
             END,
             'titulo', CASE de.event_name
                 WHEN 'pedido.created_internal' THEN 'Solicitud recibida'
                 WHEN 'pedido.info_requested' THEN 'Información solicitada'
                 WHEN 'pedido.info_responded' THEN 'Información respondida'
                 WHEN 'pedido.state_changed' THEN 'Estado actualizado'
                 WHEN 'pedido.finalized' THEN 'Pedido finalizado'
                 WHEN 'pedido.reopened' THEN 'Pedido reabierto'
                 WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
             END,
             'descripcion', 'Actualización del seguimiento del pedido.',
             'created_at', de.created_at
         ) AS item
         FROM public.domain_events de
         WHERE de.aggregate_id = v_ped.id
           AND de.event_name IN (
             'pedido.created_internal', 'pedido.info_requested', 'pedido.info_responded', 'pedido.state_changed',
             'pedido.finalized', 'pedido.reopened', 'pedido.cancelled'
           )
      ) events;

    RETURN jsonb_build_object(
        'success', true,
        'pedido', jsonb_build_object(
            'id', v_ped.id,
            'envio_id', v_ped.envio_id,
            'origen', 'interno',
            'pedido_visible', v_ped.pedido_visible,
            'anio', v_ped.anio,
            'numero', v_ped.numero,
            'codigo_categoria', v_ped.codigo_categoria,
            'categoria_nombre', v_ped.categoria_nombre,
            'tipo_nombre', v_ped.tipo_nombre,
            'estado', v_ped.estado,
            'retrabajo_activo', v_ped.retrabajo_activo,
            'revision_count', v_ped.revision_count,
            'archivado', v_ped.archivado,
            'created_at', v_ped.created_at,
            'updated_at', v_ped.updated_at,
            'informacion_especifica', jsonb_build_object(
                'titulo', v_ped.informacion_especifica->>'titulo',
                'descripcion', v_ped.informacion_especifica->>'descripcion'
            ),
            'solicitante', jsonb_build_object(
                'nombre_apellido', v_ped.informacion_especifica->'solicitante'->>'nombre',
                'area_solicitante', v_ped.informacion_especifica->'solicitante'->>'area',
                'correo', v_email,
                'telefono', NULL
            )
        ),
        'solicitudes', v_solicitudes,
        'notas', '[]'::jsonb,
        'entrega', v_entrega,
        'nota_final', NULL,
        'versiones', v_versiones,
        'historial', v_historial,
        'revision_activa', NULL,
        'revisiones_historial', '[]'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) TO service_role;
REVOKE ALL ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.solicitante_get_internal_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_internal_pedido_detail(text, text) TO service_role;
