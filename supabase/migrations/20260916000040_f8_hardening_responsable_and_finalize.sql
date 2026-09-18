-- =============================================================================
-- Migración: 20260916000040_f8_hardening_responsable_and_finalize.sql
-- Hardening y consistencia de:
-- 1. Helper private.validate_operational_assignee
-- 2. public.pedido_change_state (transiciones canónicas)
-- 3. public.pedido_finalize (restricción estricta solo desde 'En proceso' + validaciones completas de entrega)
-- 4. public.pedido_assign (soporte completo de p_motivo e integridad de historial)
-- =============================================================================

-- 1. Helper privado para validar responsable asignado
CREATE OR REPLACE FUNCTION private.validate_operational_assignee(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_role text;
    v_estado text;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'RESPONSABLE_REQUIRED: El pedido debe tener un responsable asignado para avanzar por el circuito operativo' USING ERRCODE = '42200';
    END IF;

    SELECT app_role, estado_acceso INTO v_role, v_estado
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF v_estado IS NULL OR v_estado <> 'aprobado' OR v_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'RESPONSABLE_REQUIRED: El responsable asignado no es un operador o administrador aprobado válido' USING ERRCODE = '42200';
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_operational_assignee(uuid) FROM PUBLIC, anon, authenticated;

-- 2. public.pedido_change_state
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
$$;

REVOKE ALL ON FUNCTION public.pedido_change_state(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_change_state(uuid, text, integer, text) TO authenticated;

-- 3. public.pedido_finalize (CANÓNICO: Solo desde 'En proceso' + validaciones completas de entrega)
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

-- 4. public.pedido_assign (Preserva p_motivo y auditoría completa)
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
$$;

REVOKE ALL ON FUNCTION public.pedido_assign(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_assign(uuid, uuid, integer, text) TO authenticated;
