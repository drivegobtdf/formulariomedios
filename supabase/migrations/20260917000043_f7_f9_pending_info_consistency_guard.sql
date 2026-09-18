-- Migration: 20260917000043_f7_f9_pending_info_consistency_guard.sql
-- Descripción: Corrección de consistencia entre solicitudes de información faltante (48h) y finalización de pedidos
-- Reglas implementadas:
--   D1. solicitante_submit_info_response & info_response_submit_core: Retorno condicional a 'En proceso' solo si no quedan solicitudes pendientes y vigentes (< 48h)
--   D2. public.pedido_finalize: Hard Guard que rechaza la finalización con error PENDING_INFO_REQUEST si existen solicitudes pendientes y vigentes (< 48h)

-- -----------------------------------------------------------------------------
-- 1. Actualización de public.info_response_submit_core con Guarda D1
-- -----------------------------------------------------------------------------

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
BEGIN
    -- 1. Buscar solicitud por token_hash
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

    -- 3. Vencimiento estricto a las 48 horas (now >= expires_at)
    IF now() >= v_solicitud.expires_at THEN
        UPDATE public.solicitudes_informacion
        SET estado = 'vencida'
        WHERE id = v_solicitud.id;

        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha vencido tras 48 horas corridas' USING ERRCODE = '42201';
    END IF;

    -- 4. Validar contenido
    IF (p_respuesta_texto IS NULL OR length(trim(p_respuesta_texto)) = 0)
       AND (p_archivo_ids IS NULL OR cardinality(p_archivo_ids) = 0)
       AND (p_enlaces IS NULL OR cardinality(p_enlaces) = 0) THEN
        RAISE EXCEPTION 'PAYLOAD_REQUIRED: Debe incluir texto de respuesta, archivos o enlaces' USING ERRCODE = '42200';
    END IF;

    v_pedido_id := v_solicitud.pedido_id;
    SELECT envio_id INTO v_envio_id FROM public.pedidos WHERE id = v_pedido_id;

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

    -- D1 REGLA DE CONSISTENCIA: Retorno condicional a 'En proceso'
    -- Solo devolver el PED a 'En proceso' si NO quedan otras solicitudes del mismo pedido con estado 'pendiente' y vigentes (< 48h)
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

REVOKE ALL ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Actualización de public.solicitante_submit_info_response con Guarda D1
-- -----------------------------------------------------------------------------

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
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto, p.envio_id
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
        UPDATE public.solicitudes_informacion
        SET estado = 'vencida'
        WHERE id = v_sol.id;

        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha expirado tras las 48 horas corridas' USING ERRCODE = '42201';
    END IF;

    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

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
                VALUES (v_enlace_id, v_sol.envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información 48h', now());

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

    -- D1 REGLA DE CONSISTENCIA: Retorno condicional a 'En proceso'
    -- Solo devolver el PED a 'En proceso' si NO quedan otras solicitudes del mismo pedido con estado 'pendiente' y vigentes (< 48h)
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

REVOKE ALL ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Actualización de public.pedido_finalize con Guarda D2
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, uuid[], text, text, integer);
DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, integer, uuid[], text, text);

CREATE OR REPLACE FUNCTION public.pedido_finalize(
    p_pedido_id uuid,
    p_expected_version integer,
    p_archivos_entrega uuid[] DEFAULT NULL,
    p_url_entrega text DEFAULT NULL,
    p_nota_entrega text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_state text;
    v_current_version integer;
    v_responsable_id uuid;
    v_entrega_version integer;
    v_entrega_id uuid;
    v_new_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para finalizar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    v_clean_url := NULLIF(trim(p_url_entrega), '');

    -- Validar que exista al menos archivo o enlace de entrega
    IF (p_archivos_entrega IS NULL OR cardinality(p_archivos_entrega) = 0) AND v_clean_url IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega' USING ERRCODE = '42200';
    END IF;

    -- Validar formato de URL si se suministró
    IF v_clean_url IS NOT NULL THEN
        IF v_clean_url !~* '^https?://.+' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS' USING ERRCODE = '42200';
        END IF;
    END IF;

    -- Bloquear pedido y validar versión
    SELECT estado, version, responsable_user_id INTO v_current_state, v_current_version, v_responsable_id
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Versión esperada % no coincide con actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);
    
    -- REGLA CANÓNICA: ÚNICAMENTE DESDE 'En proceso'
    IF v_current_state <> 'En proceso' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- HARD GUARD: Responsable asignado obligatorio y válido
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- D2 HARD GUARD: Rechazar finalización si existen solicitudes de información pendientes y vigentes (48h)
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = p_pedido_id
          AND estado = 'pendiente'
          AND now() < expires_at
    ) THEN
        RAISE EXCEPTION 'PENDING_INFO_REQUEST: No se puede finalizar el pedido porque posee solicitudes de información pendientes y vigentes (48h)' USING ERRCODE = '42200';
    END IF;

    -- Validar integridad de archivos de entrega si fueron suministrados
    IF p_archivos_entrega IS NOT NULL AND cardinality(p_archivos_entrega) > 0 THEN
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

    -- Calcular siguiente versión de entrega
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_entrega_version
    FROM public.entregas_pedido
    WHERE pedido_id = p_pedido_id;

    -- Desmarcar entrega anterior como vigente
    UPDATE public.entregas_pedido
    SET es_vigente = false
    WHERE pedido_id = p_pedido_id;

    -- Crear nueva entrega
    v_entrega_id := gen_random_uuid();
    INSERT INTO public.entregas_pedido (
        id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
    ) VALUES (
        v_entrega_id, p_pedido_id, v_entrega_version, true,
        CASE WHEN p_archivos_entrega IS NOT NULL AND cardinality(p_archivos_entrega) > 0 THEN p_archivos_entrega[1] ELSE NULL END,
        v_clean_url,
        NULLIF(trim(p_nota_entrega), ''),
        v_actor_id, now()
    );

    -- Asociar archivos de entrega
    IF p_archivos_entrega IS NOT NULL THEN
        FOREACH v_arch_id IN ARRAY p_archivos_entrega LOOP
            UPDATE public.archivos SET contexto = 'entrega' WHERE id = v_arch_id;
            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, p_pedido_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    v_new_version := v_current_version + 1;

    -- Actualizar pedido a finalizado
    UPDATE public.pedidos
    SET estado = 'Finalizado',
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.finalized', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'entrega_id', v_entrega_id,
            'entrega_version', v_entrega_version,
            'actor_id', v_actor_id,
            'version', v_new_version
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
            'entrega_version', v_entrega_version,
            'version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'Finalizado',
        'entrega_id', v_entrega_id,
        'entrega_version', v_entrega_version,
        'version', v_new_version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) TO authenticated;
