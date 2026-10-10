-- =============================================================================
-- ROLLBACK SCRIPT PARA MIGRATION 075 (EXTRACTED FROM PROD PRE-075)
-- PROYECTO: PEDIDOS (uwzgyirilafgnbpmrkic)
-- FECHA: 2026-10-10
--
-- DISTINCIÓN OPERATIVA:
-- 1. ROLLBACK DE APLICACIÓN: Revertir frontend/edge functions al commit previo.
--    No requiere cambios destructivos en base de datos gracias a backward-compatibility.
-- 2. ROLLBACK DB DE EMERGENCIA (SECCIÓN 1): Restaurar definiciones exactas de RPCs
--    previas de PROD (sin pérdida de datos, conservando columnas aditivas).
-- 3. ROLLBACK DESTRUCTIVO EXTRAORDINARIO (SECCIÓN 2): Eliminación de índice y columna
--    solicitudes_informacion.estado_previo. SOLO con backup previo y autorización explícita.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: ROLLBACK DB DE EMERGENCIA (RESTAURACIÓN DE RPCS PREVIAS DE PROD)
-- =============================================================================

-- 1. Eliminar función auxiliar de encolado nueva creada por 075
DROP FUNCTION IF EXISTS public.comunicacion_enqueue_info_responded(uuid, uuid);


-- -----------------------------------------------------------------------------
-- info_request_create_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.info_request_create_atomic(p_solicitud_id uuid, p_pedido_id uuid, p_actor_user_id uuid, p_mensaje text, p_token_hash text, p_encrypted_envelope jsonb, p_expected_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'auth', 'pg_temp'
AS $function$
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

    -- H2 HARD GUARD: Rechazar explícitamente creación de solicitudes sobre pedidos en estado terminal (Finalizado o Cancelado)
    IF v_ped.estado IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_STATE: No se puede solicitar información sobre un pedido en estado %', v_ped.estado USING ERRCODE = '42200';
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
$function$
;

-- -----------------------------------------------------------------------------
-- info_response_submit_core
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.info_response_submit_core(p_token_hash text, p_respuesta_texto text DEFAULT NULL::text, p_archivo_ids uuid[] DEFAULT NULL::uuid[], p_enlaces text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'auth', 'pg_temp'
AS $function$
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

    -- H1 BLOQUEO DEL AGREGADO RAÍZ: Bloquear public.pedidos FOR UPDATE para serializar decisiones de estado
    SELECT envio_id, estado INTO v_envio_id, v_current_pedido_estado
    FROM public.pedidos
    WHERE id = v_pedido_id
    FOR UPDATE;

    IF v_envio_id IS NULL THEN
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
    -- Con public.pedidos bloqueado FOR UPDATE, verificar si quedan solicitudes del mismo pedido con estado 'pendiente' y vigentes (< 48h)
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
$function$
;

-- -----------------------------------------------------------------------------
-- pedido_assign
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_assign(p_pedido_id uuid, p_responsable_user_id uuid, p_expected_version integer, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_version integer;
    v_old_responsable uuid;
    v_new_version integer;
    v_clean_motivo text;
BEGIN
    -- 1. Validar autenticación y rol del actor
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para asignar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 2. Validar que el responsable de destino sea válido y operativo
    PERFORM private.validate_operational_assignee(p_responsable_user_id);

    -- 3. Bloquear y verificar versión del pedido
    SELECT version, responsable_user_id INTO v_current_version, v_old_responsable
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_version IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: La versión esperada % no coincide con la versión actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    v_clean_motivo := NULLIF(trim(p_motivo), '');
    v_new_version := v_current_version + 1;

    -- 4. Actualizar responsable y versión
    UPDATE public.pedidos
    SET responsable_user_id = p_responsable_user_id,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 5. Registrar en historial de asignaciones con motivo
    INSERT INTO public.pedido_asignaciones (
        id, pedido_id, responsable_anterior, responsable_nuevo, asignado_por, motivo, created_at
    ) VALUES (
        gen_random_uuid(), p_pedido_id, v_old_responsable, p_responsable_user_id, v_actor_id, v_clean_motivo, now()
    );

    -- 6. Emitir evento de dominio y log de auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.assigned', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'responsable_anterior_id', v_old_responsable,
            'responsable_nuevo_id', p_responsable_user_id,
            'asignado_por', v_actor_id,
            'motivo', v_clean_motivo,
            'version', v_new_version
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'assign',
        jsonb_build_object(
            'responsable_anterior_id', v_old_responsable,
            'responsable_nuevo_id', p_responsable_user_id,
            'motivo', v_clean_motivo,
            'version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'responsable_id', p_responsable_user_id,
        'version', v_new_version
    );
END;
$function$
;

-- -----------------------------------------------------------------------------
-- pedido_change_state
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_change_state(p_pedido_id uuid, p_target_state text, p_expected_version integer, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_state text;
    v_target_norm text;
    v_current_version integer;
    v_responsable_id uuid;
    v_new_version integer;
BEGIN
    -- 1. Validar actor
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para modificar estados', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 2. Normalizar y validar estado objetivo contractual
    v_target_norm := private.normalize_pedido_state(p_target_state);
    IF v_target_norm NOT IN ('Nuevo', 'En revisión', 'En proceso', 'Esperando información', 'Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_TARGET_STATE: Estado % no es válido', p_target_state USING ERRCODE = '42200';
    END IF;

    -- 3. Bloquear pedido y verificar versión
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

    -- HARD GUARD: Si el estado destino es operativo, debe tener responsable asignado válido
    IF v_target_norm IN ('En revisión', 'En proceso', 'Esperando información') THEN
        PERFORM private.validate_operational_assignee(v_responsable_id);
    END IF;

    -- 4. Validar matriz de transiciones contractuales
    IF v_current_state = 'Nuevo' THEN
        IF v_target_norm = 'En revisión' THEN
            -- Validación de responsable realizada en Hard Guard arriba
            NULL;
        ELSIF v_target_norm = 'Cancelado' THEN
            IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
                RAISE EXCEPTION 'CANCEL_REASON_REQUIRED: La cancelación requiere motivo obligatorio' USING ERRCODE = '42200';
            END IF;
        ELSE
            RAISE EXCEPTION 'INVALID_TRANSITION: No se permite transición directa de % a %', v_current_state, v_target_norm USING ERRCODE = '42200';
        END IF;

    ELSIF v_current_state = 'En revisión' THEN
        IF v_target_norm NOT IN ('En proceso', 'Esperando información', 'Cancelado') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: No se permite transición directa de % a %', v_current_state, v_target_norm USING ERRCODE = '42200';
        END IF;
        IF v_target_norm = 'Cancelado' AND (p_motivo IS NULL OR length(trim(p_motivo)) < 3) THEN
            RAISE EXCEPTION 'CANCEL_REASON_REQUIRED: La cancelación requiere motivo obligatorio' USING ERRCODE = '42200';
        END IF;

    ELSIF v_current_state = 'En proceso' THEN
        IF v_target_norm = 'Finalizado' THEN
            RAISE EXCEPTION 'USE_PEDIDO_FINALIZE: Para finalizar un pedido debe utilizarse pedido_finalize con entrega adjunta' USING ERRCODE = '42200';
        ELSIF v_target_norm NOT IN ('En revisión', 'Esperando información', 'Cancelado') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: No se permite transición directa de % a %', v_current_state, v_target_norm USING ERRCODE = '42200';
        END IF;
        IF v_target_norm = 'Cancelado' AND (p_motivo IS NULL OR length(trim(p_motivo)) < 3) THEN
            RAISE EXCEPTION 'CANCEL_REASON_REQUIRED: La cancelación requiere motivo obligatorio' USING ERRCODE = '42200';
        END IF;

    ELSIF v_current_state = 'Esperando información' THEN
        IF v_target_norm NOT IN ('En revisión', 'En proceso', 'Cancelado') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: No se permite transición directa de % a %', v_current_state, v_target_norm USING ERRCODE = '42200';
        END IF;
        IF v_target_norm = 'Cancelado' AND (p_motivo IS NULL OR length(trim(p_motivo)) < 3) THEN
            RAISE EXCEPTION 'CANCEL_REASON_REQUIRED: La cancelación requiere motivo obligatorio' USING ERRCODE = '42200';
        END IF;

    ELSIF v_current_state = 'Cancelado' THEN
        RAISE EXCEPTION 'USE_PEDIDO_REOPEN: Un pedido cancelado solo puede reactivarse mediante pedido_reopen' USING ERRCODE = '42200';

    ELSIF v_current_state = 'Finalizado' THEN
        RAISE EXCEPTION 'TERMINAL_STATE: Un pedido finalizado no admite transiciones directas de estado' USING ERRCODE = '42200';
    END IF;

    v_new_version := v_current_version + 1;

    -- 5. Actualizar estado del pedido
    UPDATE public.pedidos
    SET estado = v_target_norm,
        motivo_cancelacion = CASE WHEN v_target_norm = 'Cancelado' THEN trim(p_motivo) ELSE motivo_cancelacion END,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 6. Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.state_changed', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'estado_anterior', v_current_state,
            'estado_nuevo', v_target_norm,
            'motivo', p_motivo,
            'actor_id', v_actor_id,
            'version', v_new_version
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'change_state',
        jsonb_build_object(
            'estado_anterior', v_current_state,
            'estado_nuevo', v_target_norm,
            'motivo', p_motivo,
            'version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', v_target_norm,
        'version', v_new_version
    );
END;
$function$
;

-- -----------------------------------------------------------------------------
-- solicitante_submit_info_response
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response(p_session_token text, p_solicitud_id uuid, p_respuesta_texto text DEFAULT NULL::text, p_enlaces text[] DEFAULT NULL::text[], p_archivos uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'auth', 'pg_temp'
AS $function$
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
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE si.id = p_solicitud_id AND lower(trim(e.correo)) = v_correo
    FOR UPDATE OF si;

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

    -- H1 REGLA DE CONSISTENCIA SERIALIZADA: Retorno condicional a 'En proceso'
    -- Con public.pedidos bloqueado FOR UPDATE, verificar si quedan solicitudes del mismo pedido con estado 'pendiente' y vigentes (< 48h)
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
$function$
;

-- =============================================================================
-- SECCIÓN 2: ROLLBACK DESTRUCTIVO EXTRAORDINARIO (SOLO CON AUTORIZACIÓN Y BACKUP)
-- =============================================================================
-- ATENCIÓN: Esta sección elimina índices, constraints y columnas de datos.
-- NO ejecutar durante un rollback rutinario si pudieran existir datos en estado_previo.
-- DROP INDEX IF EXISTS public.uq_solicitud_info_pendiente_por_pedido;
-- ALTER TABLE public.solicitudes_informacion DROP CONSTRAINT IF EXISTS chk_solicitud_estado_previo;
-- ALTER TABLE public.solicitudes_informacion DROP COLUMN IF EXISTS estado_previo;

