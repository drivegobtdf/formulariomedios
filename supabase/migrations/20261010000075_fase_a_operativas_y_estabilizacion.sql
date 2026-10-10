-- =============================================================================
-- Migración 075: FASE A — Mejoras Operativas y Estabilización
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
--
-- Contenido:
-- 1. Agregar columna solicitudes_informacion.estado_previo y constraint seguro.
-- 2. Restricción de unicidad para máximo UNA solicitud pendiente por pedido.
-- 3. info_request_create_atomic:
--    - Guarda atómica de estado actual como estado_previo (Nuevo, En revisión, En proceso).
--    - Transición atómica del pedido a 'Esperando información'.
--    - Encolado outbox con sobre cifrado, incremento de versión y audit log.
-- 4. info_response_submit_core y solicitante_submit_info_response:
--    - Aceptación de respuestas tardías (> 48h).
--    - Restauración transaccional de estado_previo si continúa en 'Esperando información'.
--    - Protección contra resurrección de estados terminales (Finalizado/Cancelado).
-- 5. comunicacion_enqueue_info_responded:
--    - Notificación por correo al responsable asignado ACTUAL (pedido.responsable_user_id).
--    - Auditoría y emisión de evento sin error ni email ficticio si no hay responsable asignado.
-- 6. pedido_assign:
--    - Idempotencia: Si se re-asigna exactamente el mismo responsable, no emitir evento redundante ni correo.
-- 7. pedido_change_state:
--    - Permitir transición directa de 'Nuevo' a 'En proceso' con responsable obligatorio.
--    - Bloqueo de transiciones operativas manuales mientras exista solicitud de información pendiente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Esquema: Columna estado_previo en solicitudes_informacion
-- -----------------------------------------------------------------------------
ALTER TABLE public.solicitudes_informacion
ADD COLUMN IF NOT EXISTS estado_previo text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_solicitud_estado_previo'
          AND conrelid = 'public.solicitudes_informacion'::regclass
    ) THEN
        ALTER TABLE public.solicitudes_informacion
        ADD CONSTRAINT chk_solicitud_estado_previo
        CHECK (estado_previo IS NULL OR estado_previo IN ('Nuevo', 'En revisión', 'En proceso'));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Restricción: Máximo una solicitud pendiente por pedido
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_info_pendiente_por_pedido
ON public.solicitudes_informacion (pedido_id)
WHERE (estado = 'pendiente');

-- -----------------------------------------------------------------------------
-- 3. RPC Atómica: info_request_create_atomic
-- -----------------------------------------------------------------------------
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
        p.id, p.envio_id, p.categoria_id, p.tipo_servicio_id, p.estado, p.pedido_visible, p.version
    INTO v_ped
    FROM public.pedidos p
    WHERE p.id = p_pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
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

    -- Obtener datos asociados
    SELECT e.correo, e.nombre_apellido
    INTO v_envio
    FROM public.envios_formulario e
    WHERE e.id = v_ped.envio_id;

    SELECT c.nombre INTO v_cat_nombre FROM public.categorias_servicio c WHERE c.id = v_ped.categoria_id;
    SELECT ts.nombre INTO v_tipo_nombre FROM public.tipos_servicio ts WHERE ts.id = v_ped.tipo_servicio_id;

    -- Plazo referencial de 48 horas corridas
    v_expires_at := now() + interval '48 hours';
    v_idempotency_key := 'info_requested:' || p_solicitud_id::text;
    v_comm_id := gen_random_uuid();
    v_new_version := v_ped.version + 1;

    -- Insertar solicitud de información guardando el estado actual como estado_previo
    INSERT INTO public.solicitudes_informacion (
        id, pedido_id, solicitada_por, mensaje, token_hash, estado, expires_at, created_at, estado_previo
    ) VALUES (
        p_solicitud_id, p_pedido_id, p_actor_user_id, trim(p_mensaje), trim(p_token_hash), 'pendiente', v_expires_at, now(), v_ped.estado
    );

    -- Transición atómica del pedido a 'Esperando información'
    UPDATE public.pedidos
    SET estado = 'Esperando información',
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- Insertar domain event
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_requested', 'pedido', p_pedido_id,
        jsonb_build_object(
            'solicitud_id', p_solicitud_id,
            'pedido_id', p_pedido_id,
            'solicitada_por', p_actor_user_id,
            'estado_previo', v_ped.estado,
            'estado_nuevo', 'Esperando información',
            'expires_at', v_expires_at,
            'token_hash', trim(p_token_hash),
            'version', v_new_version
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

    -- Insertar comunicación encolada atómicamente con su sobre listo
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
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'estado_previo', v_ped.estado,
            'estado_nuevo', 'Esperando información',
            'expires_at', v_expires_at,
            'has_envelope', true,
            'version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', p_solicitud_id,
        'pedido_id', p_pedido_id,
        'estado', 'Esperando información',
        'estado_previo', v_ped.estado,
        'communication_id', v_comm_id,
        'expires_at', v_expires_at,
        'version', v_new_version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. RPCs de Respuesta de Información (Aceptación de tardías + restauración)
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
    v_current_pedido_estado text;
    v_responsable_user_id uuid;
    v_target_restored_state text;
    v_is_tardia boolean;
    v_is_archivado boolean;
BEGIN
    -- 1. Buscar y bloquear solicitud por token_hash
    SELECT id, pedido_id, estado, expires_at, respuesta_texto, estado_previo INTO v_solicitud
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

    -- 3. Respuesta tardía (> 48h): ACEPTADA según requisito aprobado
    v_is_tardia := (now() >= v_solicitud.expires_at);

    -- 4. Validar contenido
    IF (p_respuesta_texto IS NULL OR length(trim(p_respuesta_texto)) = 0)
       AND (p_archivo_ids IS NULL OR cardinality(p_archivo_ids) = 0)
       AND (p_enlaces IS NULL OR cardinality(p_enlaces) = 0) THEN
        RAISE EXCEPTION 'PAYLOAD_REQUIRED: Debe incluir texto de respuesta, archivos o enlaces' USING ERRCODE = '42200';
    END IF;

    v_pedido_id := v_solicitud.pedido_id;

    -- Bloqueo del pedido raíz para serializar decisiones de estado
    SELECT envio_id, estado, responsable_user_id, COALESCE(archivado, false)
    INTO v_envio_id, v_current_pedido_estado, v_responsable_user_id, v_is_archivado
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

    -- 8. Restauración de Estado: Solo si el pedido permanece en 'Esperando información' y NO está archivado.
    -- Los estados terminales ('Finalizado', 'Cancelado', 'Archivado') NUNCA pueden ser alterados.
    v_target_restored_state := NULL;
    IF v_current_pedido_estado = 'Esperando información' AND NOT v_is_archivado THEN
        -- Verificar si quedan otras solicitudes pendientes
        IF NOT EXISTS (
            SELECT 1 FROM public.solicitudes_informacion
            WHERE pedido_id = v_pedido_id
              AND id <> v_solicitud.id
              AND estado = 'pendiente'
        ) THEN
            -- Restaurar estado_previo (o fallback a 'En proceso' si era nulo en registros históricos)
            v_target_restored_state := COALESCE(v_solicitud.estado_previo, 'En proceso');
            IF v_target_restored_state NOT IN ('Nuevo', 'En revisión', 'En proceso') THEN
                v_target_restored_state := 'En proceso';
            END IF;

            UPDATE public.pedidos
            SET estado = v_target_restored_state,
                version = version + 1,
                updated_at = now()
            WHERE id = v_pedido_id
              AND estado = 'Esperando información'
              AND NOT COALESCE(archivado, false);
        END IF;
    END IF;

    -- 9. Emitir evento durable y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_pedido_id,
        jsonb_build_object(
            'solicitud_id', v_solicitud.id,
            'pedido_id', v_pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivo_ids), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0),
            'respondida_at', now(),
            'is_tardia', v_is_tardia,
            'estado_anterior', v_current_pedido_estado,
            'estado_restaurado', v_target_restored_state,
            'responsable_user_id', v_responsable_user_id
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
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0),
            'is_tardia', v_is_tardia,
            'estado_restaurado', v_target_restored_state
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_solicitud.id,
        'pedido_id', v_pedido_id,
        'is_tardia', v_is_tardia,
        'estado_restaurado', v_target_restored_state
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) TO service_role;

-- -----------------------------------------------------------------------------
-- solicitante_submit_info_response (para sesión de solicitante)
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
    v_current_pedido_estado text;
    v_responsable_user_id uuid;
    v_target_restored_state text;
    v_is_tardia boolean;
    v_is_archivado boolean;
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia bloqueando la solicitud
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto, si.estado_previo, p.envio_id
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

    -- Respuesta tardía aceptada
    v_is_tardia := (now() >= v_sol.expires_at);

    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

    -- Bloqueo de public.pedidos FOR UPDATE
    SELECT estado, responsable_user_id, COALESCE(archivado, false)
    INTO v_current_pedido_estado, v_responsable_user_id, v_is_archivado
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

    -- Restaurar estado previo condicional (Solo si el pedido permanece en 'Esperando información' y NO archivado)
    v_target_restored_state := NULL;
    IF v_current_pedido_estado = 'Esperando información' AND NOT v_is_archivado THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.solicitudes_informacion
            WHERE pedido_id = v_sol.pedido_id
              AND id <> v_sol.id
              AND estado = 'pendiente'
        ) THEN
            v_target_restored_state := COALESCE(v_sol.estado_previo, 'En proceso');
            IF v_target_restored_state NOT IN ('Nuevo', 'En revisión', 'En proceso') THEN
                v_target_restored_state := 'En proceso';
            END IF;

            UPDATE public.pedidos
            SET estado = v_target_restored_state,
                version = version + 1,
                updated_at = now()
            WHERE id = v_sol.pedido_id
              AND estado = 'Esperando información'
              AND NOT COALESCE(archivado, false);
        END IF;
    END IF;

    -- Emitir evento de dominio
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
            'responded_at', now(),
            'is_tardia', v_is_tardia,
            'estado_anterior', v_current_pedido_estado,
            'estado_restaurado', v_target_restored_state,
            'responsable_user_id', v_responsable_user_id
        ),
        NULL, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_sol.id,
        'estado', 'respondida',
        'is_tardia', v_is_tardia,
        'estado_restaurado', v_target_restored_state
    );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Helper de Encolado: comunicacion_enqueue_info_responded
--    Notificación exclusiva al RESPONSABLE ACTUAL VIGENTE
-- -----------------------------------------------------------------------------
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
    v_cat_nombre text;
    v_tipo_nombre text;
    v_resp RECORD;
    v_idempotency_key text;
    v_comm_id uuid;
BEGIN
    -- 1. Obtener datos del pedido
    SELECT p.id, p.pedido_visible, p.responsable_user_id, p.categoria_id, p.tipo_servicio_id, p.envio_id
    INTO v_pedido
    FROM public.pedidos p
    WHERE p.id = p_pedido_id;

    IF NOT FOUND THEN RETURN; END IF;

    -- 2. Si NO hay responsable asignado en el momento de la respuesta:
    IF v_pedido.responsable_user_id IS NULL THEN
        -- Registrar auditoría y evento para que FASE B notifique internamente a administradores
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

    -- 3. Resolver datos y correo del responsable vigente (debe estar aprobado y ser equipo o administrador)
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

    -- 4. Obtener datos del solicitante y servicio
    SELECT e.nombre_apellido, e.area_solicitante INTO v_envio
    FROM public.envios_formulario e
    WHERE e.id = v_pedido.envio_id;

    SELECT c.nombre INTO v_cat_nombre FROM public.categorias_servicio c WHERE c.id = v_pedido.categoria_id;
    SELECT ts.nombre INTO v_tipo_nombre FROM public.tipos_servicio ts WHERE ts.id = v_pedido.tipo_servicio_id;

    -- 5. Clave de idempotencia estricta por pedido, solicitud y responsable actual
    v_idempotency_key := 'info_resp:' || p_pedido_id::text || ':' || COALESCE(p_solicitud_id::text, 'sol') || ':' || v_resp.user_id::text;
    v_comm_id := gen_random_uuid();

    -- 6. Encolar notificación en outbox
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
            'solicitante_nombre', v_envio.nombre_apellido,
            'area_solicitante', v_envio.area_solicitante,
            'destinatario_nombre', trim(COALESCE(v_resp.nombre, '') || ' ' || COALESCE(v_resp.apellido, '')),
            'responsable_id', v_resp.user_id
        ),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_info_responded(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. RPC: pedido_assign — Idempotencia en re-asignación del mismo usuario
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_assign(
    p_pedido_id uuid,
    p_responsable_user_id uuid,
    p_expected_version integer,
    p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
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
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: La versión esperada %s no coincide con la versión actual %s', p_expected_version, v_current_version);
    END IF;

    -- REGLA DE IDEMPOTENCIA: Si el nuevo responsable es exactamente el mismo que ya tiene, no mutar ni disparar correos
    IF v_old_responsable IS NOT NULL AND v_old_responsable = p_responsable_user_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'pedido_id', p_pedido_id,
            'responsable_id', p_responsable_user_id,
            'version', v_current_version,
            'unchanged', true
        );
    END IF;

    v_clean_motivo := NULLIF(trim(p_motivo), '');
    v_new_version := v_current_version + 1;

    -- 4. Actualizar responsable y versión
    UPDATE public.pedidos
    SET responsable_user_id = p_responsable_user_id,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 5. Registrar en historial de asignaciones
    INSERT INTO public.pedido_asignaciones (
        id, pedido_id, responsable_anterior, responsable_nuevo, asignado_por, motivo, created_at
    ) VALUES (
        gen_random_uuid(), p_pedido_id, v_old_responsable, p_responsable_user_id, v_actor_id, v_clean_motivo, now()
    );

    -- 6. Emitir evento de dominio (disparará comunicación al nuevo asignado) y log de auditoría
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
$$;

REVOKE EXECUTE ON FUNCTION public.pedido_assign(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_assign(uuid, uuid, integer, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: pedido_change_state — Acceso directo a 'En proceso' y guard de espera
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_change_state(
    p_pedido_id uuid,
    p_target_state text,
    p_expected_version integer,
    p_motivo text DEFAULT NULL
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
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: Versión esperada %s no coincide con actual %s', p_expected_version, v_current_version);
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);

    -- HARD GUARD: Si el estado destino es operativo, debe tener responsable asignado válido
    IF v_target_norm IN ('En revisión', 'En proceso', 'Esperando información') THEN
        PERFORM private.validate_operational_assignee(v_responsable_id);
    END IF;

    -- 4. Validar matriz de transiciones contractuales
    IF v_current_state = 'Nuevo' THEN
        -- Permitir acceso directo tanto a 'En revisión' como a 'En proceso'
        IF v_target_norm IN ('En revisión', 'En proceso') THEN
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
        -- Si hay una solicitud de información pendiente, bloquear transiciones manuales a estados operativos
        IF v_target_norm IN ('Nuevo', 'En revisión', 'En proceso') THEN
            IF EXISTS (
                SELECT 1 FROM public.solicitudes_informacion
                WHERE pedido_id = p_pedido_id AND estado = 'pendiente'
            ) THEN
                RAISE EXCEPTION 'PENDING_INFO_REQUEST: No se puede cambiar el estado operativamente mientras exista una solicitud de información pendiente de respuesta' USING ERRCODE = '42200';
            END IF;
        ELSIF v_target_norm = 'Cancelado' THEN
            IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
                RAISE EXCEPTION 'CANCEL_REASON_REQUIRED: La cancelación requiere motivo obligatorio' USING ERRCODE = '42200';
            END IF;
        ELSE
            RAISE EXCEPTION 'INVALID_TRANSITION: No se permite transición directa de % a %', v_current_state, v_target_norm USING ERRCODE = '42200';
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
            'motivo', CASE WHEN v_target_norm = 'Cancelado' THEN trim(p_motivo) ELSE NULL END,
            'version', v_new_version
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'state_change',
        jsonb_build_object(
            'estado_anterior', v_current_state,
            'estado_nuevo', v_target_norm,
            'motivo', CASE WHEN v_target_norm = 'Cancelado' THEN trim(p_motivo) ELSE NULL END,
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
$$;

REVOKE EXECUTE ON FUNCTION public.pedido_change_state(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_change_state(uuid, text, integer, text) TO authenticated;
