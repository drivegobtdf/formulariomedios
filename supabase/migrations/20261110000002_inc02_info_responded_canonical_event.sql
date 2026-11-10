-- =============================================================================
-- Migración INC-02: Emisión Canónica de Evento de Dominio pedido.info_responded
-- Fecha: 2026-11-10
-- Contexto: Paquete 2 Post-QA (INC-02 e INC-10)
-- 1. Actualiza solicitante_submit_info_response para emitir 'pedido.info_responded'
-- 2. Asegura en trg_domain_event_auto_enqueue compatibilidad con 'info_request.responded'
-- 3. Actualiza comunicacion_enqueue_info_responded con soporte para pedidos internos e idempotencia estricta
-- =============================================================================

-- 1. Actualización de solicitante_submit_info_response
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
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'solicitud_id', v_sol.id, 'estado', 'respondida');
    END IF;

    -- Vigencia real según expires_at (históricos 48h, nuevos 72h)
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

    -- Emitir evento de dominio canónico 'pedido.info_responded' (INC-02)
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_sol.pedido_id,
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

    -- Registro en audit_log para trazabilidad forense
    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL, 'solicitudes_informacion', v_sol.id::text, 'respond',
        jsonb_build_object(
            'pedido_id', v_sol.pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivos), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0),
            'solicitante_correo', v_correo
        ),
        now()
    );

    RETURN jsonb_build_object('success', true, 'solicitud_id', v_sol.id, 'estado', 'respondida');
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;


-- 2. Actualización de trg_domain_event_auto_enqueue para admitir tanto 'pedido.info_responded' como 'info_request.responded'
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
    ELSIF NEW.event_name = 'pedido.info_responded' OR NEW.event_name = 'info_request.responded' THEN
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

REVOKE ALL ON FUNCTION public.trg_domain_event_auto_enqueue() FROM PUBLIC, anon, authenticated;


-- 3. Actualización de comunicacion_enqueue_info_responded para robustecer pedidos internos y enriquecer payload con plazos
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_info_responded(
    p_pedido_id uuid,
    p_solicitud_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_pedido RECORD;
    v_envio RECORD;
    v_sol_info RECORD;
    v_cat_nombre text;
    v_tipo_nombre text;
    v_resp RECORD;
    v_idempotency_key text;
    v_comm_id uuid;
    v_solicitante_nombre text := 'Solicitante';
    v_area_solicitante text := 'Gobierno';
    v_plazo_horas integer := NULL;
    v_expires_at timestamptz := NULL;
    v_created_at timestamptz := NULL;
BEGIN
    -- 1. Obtener datos del pedido
    SELECT p.id, p.pedido_visible, p.responsable_user_id, p.categoria_id, p.tipo_servicio_id, p.envio_id, p.origen, p.informacion_especifica
    INTO v_pedido
    FROM public.pedidos p
    WHERE p.id = p_pedido_id;

    IF NOT FOUND THEN RETURN; END IF;

    -- 2. Si NO hay responsable asignado en el momento de la respuesta:
    IF v_pedido.responsable_user_id IS NULL THEN
        INSERT INTO public.audit_log (
            actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
        ) VALUES (
            NULL, 'pedidos', p_pedido_id::text, 'info_responded_unassigned_responsable',
            jsonb_build_object(
                'pedido_visible', v_pedido.pedido_visible,
                'solicitud_id', p_solicitud_id,
                'notice', 'Solicitud respondida sin responsable asignado en el pedido. Correo omitido.'
            ),
            now()
        );

        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
        ) VALUES (
            'pedido.info_responded_unassigned', 'pedido', p_pedido_id,
            jsonb_build_object(
                'pedido_id', p_pedido_id,
                'pedido_visible', v_pedido.pedido_visible,
                'solicitud_id', p_solicitud_id
            ),
            NULL, now()
        );
        RETURN;
    END IF;

    -- 3. Resolver datos y correo del responsable vigente
    SELECT
        ua.user_id,
        ua.nombre,
        ua.apellido,
        ua.app_role,
        au.email
    INTO v_resp
    FROM public.usuarios_acceso ua
    JOIN auth.users au ON ua.user_id = au.id
    WHERE ua.user_id = v_pedido.responsable_user_id
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
      AND au.email IS NOT NULL;

    IF NOT FOUND OR v_resp.email IS NULL THEN
        INSERT INTO public.audit_log (
            actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
        ) VALUES (
            NULL, 'pedidos', p_pedido_id::text, 'info_responded_invalid_responsable',
            jsonb_build_object(
                'pedido_visible', v_pedido.pedido_visible,
                'responsable_id', v_pedido.responsable_user_id,
                'notice', 'Responsable asignado no posee usuario activo con rol operativo o correo válido.'
            ),
            now()
        );
        RETURN;
    END IF;

    -- 4. Obtener datos del solicitante (público o interno) y servicio
    IF v_pedido.envio_id IS NOT NULL THEN
        SELECT e.nombre_apellido, e.area_solicitante INTO v_envio
        FROM public.envios_formulario e
        WHERE e.id = v_pedido.envio_id;

        IF FOUND THEN
            v_solicitante_nombre := COALESCE(v_envio.nombre_apellido, 'Solicitante');
            v_area_solicitante := COALESCE(v_envio.area_solicitante, 'Gobierno');
        END IF;
    ELSIF v_pedido.origen = 'interno' AND v_pedido.informacion_especifica IS NOT NULL THEN
        v_solicitante_nombre := COALESCE(
            v_pedido.informacion_especifica->'solicitante'->>'nombre_apellido',
            v_pedido.informacion_especifica->'solicitante'->>'nombre',
            'Solicitante Interno'
        );
        v_area_solicitante := COALESCE(
            v_pedido.informacion_especifica->'solicitante'->>'area',
            'Área Interna'
        );
    END IF;

    SELECT c.nombre INTO v_cat_nombre FROM public.categorias_servicio c WHERE c.id = v_pedido.categoria_id;
    SELECT ts.nombre INTO v_tipo_nombre FROM public.tipos_servicio ts WHERE ts.id = v_pedido.tipo_servicio_id;

    -- 5. Obtener metadata de la solicitud si está disponible (plazo, fechas)
    IF p_solicitud_id IS NOT NULL THEN
        SELECT si.created_at, si.expires_at
        INTO v_sol_info
        FROM public.solicitudes_informacion si
        WHERE si.id = p_solicitud_id;

        IF FOUND THEN
            v_created_at := v_sol_info.created_at;
            v_expires_at := v_sol_info.expires_at;
            IF v_expires_at IS NOT NULL AND v_created_at IS NOT NULL AND v_expires_at > v_created_at THEN
                v_plazo_horas := ROUND(EXTRACT(EPOCH FROM (v_expires_at - v_created_at)) / 3600);
            END IF;
        END IF;
    END IF;

    -- 6. Clave de idempotencia estricta por pedido, solicitud y responsable actual
    v_idempotency_key := 'info_resp:' || p_pedido_id::text || ':' || COALESCE(p_solicitud_id::text, 'sol') || ':' || v_resp.user_id::text;
    v_comm_id := gen_random_uuid();

    -- 7. Encolar notificación en outbox con metadata enriquecida
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
        v_pedido.envio_id,
        p_pedido_id,
        'informacion_respondida',
        lower(trim(v_resp.email)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'informacion_respondida',
            'pedido_id', p_pedido_id,
            'pedido_visible', v_pedido.pedido_visible,
            'solicitud_id', p_solicitud_id,
            'categoria', v_cat_nombre,
            'tipo', v_tipo_nombre,
            'solicitante_nombre', v_solicitante_nombre,
            'area_solicitante', v_area_solicitante,
            'destinatario_nombre', trim(COALESCE(v_resp.nombre, '') || ' ' || COALESCE(v_resp.apellido, '')),
            'responsable_id', v_resp.user_id,
            'plazo_horas', v_plazo_horas,
            'expires_at', v_expires_at,
            'created_at', v_created_at
        ),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) TO service_role;
