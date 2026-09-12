-- ==============================================================================
-- MIGRATION 022: F7 & F8 RPCs, 48-Hour Missing Info & State Machine Management
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Ajuste de Columnas Operativas en pedidos y notas_pedido si faltan
-- -----------------------------------------------------------------------------

-- Columna motivo_cancelacion en pedidos
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- Columna archivado, archivado_at, archivado_por en pedidos
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archivado_at timestamptz,
    ADD COLUMN IF NOT EXISTS archivado_por uuid REFERENCES auth.users(id);

-- Asegurar columna visibilidad en notas_pedido ('interna' o 'solicitante')
ALTER TABLE public.notas_pedido 
    ADD COLUMN IF NOT EXISTS visibilidad text NOT NULL DEFAULT 'interna' 
    CHECK (visibilidad IN ('interna', 'solicitante'));

-- -----------------------------------------------------------------------------
-- 1. F8 RPC: pedido_assign (Asignación y Reasignación de Responsable)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pedido_assign(
    p_pedido_id uuid,
    p_responsable_user_id uuid,
    p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_target_role text;
    v_target_status text;
    v_current_version integer;
    v_old_responsable uuid;
    v_new_version integer;
BEGIN
    -- 1. Validar autenticación y rol del actor
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para asignar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 2. Validar que el responsable de destino exista, esté aprobado y sea equipo o administrador
    SELECT app_role, estado_acceso INTO v_target_role, v_target_status
    FROM public.usuarios_acceso
    WHERE user_id = p_responsable_user_id;

    IF v_target_role IS NULL OR v_target_status <> 'aprobado' OR v_target_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ASSIGNEE_NOT_ELIGIBLE: El responsable seleccionado no tiene rol ni estado habilitado para asignaciones' USING ERRCODE = '42200';
    END IF;

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

    v_new_version := v_current_version + 1;

    -- 4. Actualizar responsable y versión
    UPDATE public.pedidos
    SET responsable_user_id = p_responsable_user_id,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 5. Registrar en historial de asignaciones
    INSERT INTO public.pedido_asignaciones (
        id, pedido_id, responsable_anterior, responsable_nuevo, asignado_por, created_at
    ) VALUES (
        gen_random_uuid(), p_pedido_id, v_old_responsable, p_responsable_user_id, v_actor_id, now()
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

-- Helper de normalización de estados para compatibilidad API/DB
CREATE OR REPLACE FUNCTION private.normalize_pedido_state(p_state text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_state IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN CASE lower(trim(p_state))
        WHEN 'nuevo' THEN 'Nuevo'
        WHEN 'en_revision' THEN 'En revisión'
        WHEN 'en revision' THEN 'En revisión'
        WHEN 'en revisión' THEN 'En revisión'
        WHEN 'en_proceso' THEN 'En proceso'
        WHEN 'en proceso' THEN 'En proceso'
        WHEN 'esperando_informacion' THEN 'Esperando información'
        WHEN 'esperando informacion' THEN 'Esperando información'
        WHEN 'esperando información' THEN 'Esperando información'
        WHEN 'finalizado' THEN 'Finalizado'
        WHEN 'cancelado' THEN 'Cancelado'
        ELSE p_state
    END;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. F8 RPC: pedido_change_state (Transición de Estados del Tablero)
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
        RAISE EXCEPTION 'VERSION_CONFLICT: Versión esperada % no coincide con actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);

    -- 4. Validar matriz de transiciones contractuales
    IF v_current_state = 'Nuevo' THEN
        IF v_target_norm = 'En revisión' THEN
            IF v_responsable_id IS NULL THEN
                RAISE EXCEPTION 'ASSIGNEE_REQUIRED: Para pasar a En revisión el pedido debe tener responsable asignado' USING ERRCODE = '42200';
            END IF;
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
        ELSIF v_target_norm NOT IN ('Esperando información', 'Cancelado') THEN
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

-- -----------------------------------------------------------------------------
-- 3. F8 RPC: pedido_finalize (Finalización con Entrega Obligatoria)
-- -----------------------------------------------------------------------------

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
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para finalizar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- Validar que exista al menos archivo o enlace de entrega
    IF (p_archivos_entrega IS NULL OR cardinality(p_archivos_entrega) = 0) AND (p_url_entrega IS NULL OR length(trim(p_url_entrega)) = 0) THEN
        RAISE EXCEPTION 'DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega' USING ERRCODE = '42200';
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
    IF v_current_state NOT IN ('En proceso', 'En revisión') THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso o En revisión (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    IF v_responsable_id IS NULL THEN
        RAISE EXCEPTION 'ASSIGNEE_REQUIRED: No se puede finalizar un pedido sin responsable asignado' USING ERRCODE = '42200';
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
        NULLIF(trim(p_url_entrega), ''),
        NULLIF(trim(p_nota_entrega), ''),
        v_actor_id, now()
    );

    -- Asociar archivos de entrega si se suministraron
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

-- -----------------------------------------------------------------------------
-- 4. F8 RPC: pedido_cancel (Cancelación con Motivo)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pedido_cancel(
    p_pedido_id uuid,
    p_expected_version integer,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
BEGIN
    RETURN public.pedido_change_state(p_pedido_id, 'Cancelado', p_expected_version, p_motivo);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. F8 RPC: pedido_reopen (Reapertura desde Cancelado)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pedido_reopen(
    p_pedido_id uuid,
    p_expected_version integer,
    p_motivo text,
    p_responsable_user_id uuid DEFAULT NULL
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
    v_existing_resp uuid;
    v_target_resp uuid := NULL;
    v_target_state text;
    v_new_version integer;
    v_resp_role text;
    v_resp_status text;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para reabrir pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
        RAISE EXCEPTION 'REOPEN_REASON_REQUIRED: La reapertura exige un motivo obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Bloquear pedido y verificar versión
    SELECT estado, version, responsable_user_id INTO v_current_state, v_current_version, v_existing_resp
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
    IF v_current_state <> 'Cancelado' THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se pueden reabrir pedidos en estado Cancelado (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- Determinar responsable y estado de reapertura
    IF p_responsable_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso INTO v_resp_role, v_resp_status
        FROM public.usuarios_acceso
        WHERE user_id = p_responsable_user_id;

        IF v_resp_role IS NOT NULL AND v_resp_status = 'aprobado' AND v_resp_role IN ('administrador', 'equipo') THEN
            v_target_resp := p_responsable_user_id;
            v_target_state := 'En revisión';
        ELSE
            RAISE EXCEPTION 'ASSIGNEE_NOT_ELIGIBLE: El responsable asignado no es elegible' USING ERRCODE = '42200';
        END IF;
    ELSIF v_existing_resp IS NOT NULL THEN
        SELECT app_role, estado_acceso INTO v_resp_role, v_resp_status
        FROM public.usuarios_acceso
        WHERE user_id = v_existing_resp;

        IF v_resp_role IS NOT NULL AND v_resp_status = 'aprobado' AND v_resp_role IN ('administrador', 'equipo') THEN
            v_target_resp := v_existing_resp;
            v_target_state := 'En revisión';
        ELSE
            v_target_resp := NULL;
            v_target_state := 'Nuevo';
        END IF;
    ELSE
        v_target_resp := NULL;
        v_target_state := 'Nuevo';
    END IF;

    v_new_version := v_current_version + 1;

    -- Actualizar pedido
    UPDATE public.pedidos
    SET estado = v_target_state,
        responsable_user_id = v_target_resp,
        motivo_cancelacion = NULL,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.reopened', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'motivo', trim(p_motivo),
            'estado_nuevo', v_target_state,
            'responsable_id', v_target_resp,
            'actor_id', v_actor_id,
            'version', v_new_version
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'reopen',
        jsonb_build_object(
            'motivo', trim(p_motivo),
            'estado_nuevo', v_target_state,
            'responsable_id', v_target_resp,
            'version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', v_target_state,
        'responsable_id', v_target_resp,
        'version', v_new_version
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. F8 RPC: pedido_archive & pedido_restore (Archivado Reversible de Terminales)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pedido_archive(
    p_pedido_id uuid,
    p_expected_version integer
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
    v_new_version integer;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para archivar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    SELECT estado, version INTO v_current_state, v_current_version
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
    IF v_current_state NOT IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se pueden archivar pedidos en estado Finalizado o Cancelado (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    v_new_version := v_current_version + 1;

    UPDATE public.pedidos
    SET archivado = true,
        archivado_at = now(),
        archivado_por = v_actor_id,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.archived', 'pedido', p_pedido_id,
        jsonb_build_object('pedido_id', p_pedido_id, 'actor_id', v_actor_id, 'version', v_new_version),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'archive',
        jsonb_build_object('version', v_new_version),
        now()
    );

    RETURN jsonb_build_object('success', true, 'pedido_id', p_pedido_id, 'archivado', true, 'version', v_new_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.pedido_restore(
    p_pedido_id uuid,
    p_expected_version integer
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
    v_new_version integer;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para restaurar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    SELECT estado, version INTO v_current_state, v_current_version
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
    IF v_current_state NOT IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se pueden restaurar pedidos en estado Finalizado o Cancelado (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    v_new_version := v_current_version + 1;

    UPDATE public.pedidos
    SET archivado = false,
        archivado_at = NULL,
        archivado_por = NULL,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.restored', 'pedido', p_pedido_id,
        jsonb_build_object('pedido_id', p_pedido_id, 'actor_id', v_actor_id, 'version', v_new_version),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'restore',
        jsonb_build_object('version', v_new_version),
        now()
    );

    RETURN jsonb_build_object('success', true, 'pedido_id', p_pedido_id, 'archivado', false, 'version', v_new_version);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. F8 RPC: nota_pedido_create (Notas Internas / Públicas)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nota_pedido_create(
    p_pedido_id uuid,
    p_contenido text,
    p_visibilidad text DEFAULT 'interna'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_nota_id uuid;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para agregar notas', v_actor_role USING ERRCODE = '42501';
    END IF;

    IF p_contenido IS NULL OR length(trim(p_contenido)) = 0 THEN
        RAISE EXCEPTION 'CONTENT_REQUIRED: El contenido de la nota no puede estar vacío' USING ERRCODE = '42200';
    END IF;

    IF p_visibilidad NOT IN ('interna', 'solicitante') THEN
        RAISE EXCEPTION 'INVALID_VISIBILITY: Visibilidad debe ser interna o solicitante' USING ERRCODE = '42200';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    v_nota_id := gen_random_uuid();
    INSERT INTO public.notas_pedido (
        id, pedido_id, autor_user_id, texto, visibilidad, created_at
    ) VALUES (
        v_nota_id, p_pedido_id, v_actor_id, trim(p_contenido), p_visibilidad, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'notas_pedido', v_nota_id::text, 'create',
        jsonb_build_object('pedido_id', p_pedido_id, 'visibilidad', p_visibilidad),
        now()
    );

    RETURN jsonb_build_object('success', true, 'nota_id', v_nota_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. F7 RPC: info_request_create (48 Horas Corridas Aprobadas)
-- -----------------------------------------------------------------------------

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

    -- REGLA APROBADA: 48 HORAS CORRIDAS
    v_expires_at := now() + interval '48 hours';
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

-- -----------------------------------------------------------------------------
-- 9. F7 RPC: info_response_submit_core (Recepción y Validación de Respuestas)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.info_response_submit_core(
    p_token_hash text,
    p_respuesta_texto text,
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

    -- 5. Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(p_respuesta_texto),
        responded_at = now()
    WHERE id = v_solicitud.id;

    -- 6. Asociar archivos aportados
    IF p_archivo_ids IS NOT NULL THEN
        FOREACH v_arch_id IN ARRAY p_archivo_ids LOOP
            UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;
            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_pedido_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 7. Asociar enlaces de material aportados
    IF p_enlaces IS NOT NULL THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF v_url IS NOT NULL AND length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
                VALUES (v_enlace_id, v_envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información', now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_pedido_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 8. Emitir evento durable y auditoría (NO muta estado del PED automáticamente)
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_pedido_id,
        jsonb_build_object(
            'solicitud_id', v_solicitud.id,
            'pedido_id', v_pedido_id,
            'respondida_at', now()
        ),
        NULL, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL, 'solicitudes_informacion', v_solicitud.id::text, 'respond',
        jsonb_build_object('pedido_id', v_pedido_id, 'archivos_count', COALESCE(cardinality(p_archivo_ids), 0)),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_solicitud.id,
        'pedido_id', v_pedido_id
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. F7 RPC: tracking_get_core (DTO Público Seguro sin Filtraciones Internas)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tracking_get_core(
    p_pedido_visible text,
    p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_pedido RECORD;
    v_comunicaciones jsonb;
    v_solicitudes jsonb;
    v_archivos jsonb;
    v_entrega jsonb;
BEGIN
    -- 1. Buscar pedido con comparación de hash
    SELECT 
        p.id,
        p.pedido_visible,
        p.anio,
        p.numero,
        p.codigo_categoria,
        p.estado,
        p.informacion_especifica,
        p.created_at,
        p.updated_at,
        c.nombre AS categoria_nombre,
        c.slug AS categoria_slug,
        t.nombre AS tipo_nombre,
        t.slug AS tipo_slug
    INTO v_pedido
    FROM public.pedidos p
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio t ON p.tipo_servicio_id = t.id
    WHERE upper(trim(p.pedido_visible)) = upper(trim(p_pedido_visible))
      AND p.tracking_token_hash = p_token_hash;

    IF v_pedido.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Recopilar notas de cara al solicitante
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', n.id,
            'mensaje', n.texto,
            'created_at', n.created_at
        ) ORDER BY n.created_at ASC
    ), '[]'::jsonb) INTO v_comunicaciones
    FROM public.notas_pedido n
    WHERE n.pedido_id = v_pedido.id
      AND n.visibilidad = 'solicitante';

    -- 3. Recopilar solicitudes de información
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'mensaje', s.mensaje,
            'estado', s.estado,
            'expires_at', s.expires_at,
            'is_expired', (now() >= s.expires_at),
            'respuesta_texto', s.respuesta_texto,
            'responded_at', s.responded_at,
            'created_at', s.created_at
        ) ORDER BY s.created_at ASC
    ), '[]'::jsonb) INTO v_solicitudes
    FROM public.solicitudes_informacion s
    WHERE s.pedido_id = v_pedido.id;

    -- 4. Recopilar metadatos de archivos adjuntos (sin URLs internas ni drive IDs)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'nombre', a.nombre_original,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes,
            'contexto', a.contexto
        ) ORDER BY a.created_at ASC
    ), '[]'::jsonb) INTO v_archivos
    FROM public.archivos a
    JOIN public.archivo_pedido ap ON a.id = ap.archivo_id
    WHERE ap.pedido_id = v_pedido.id
      AND a.estado = 'verified';

    -- 5. Recopilar entrega si está disponible
    SELECT jsonb_build_object(
        'id', e.id,
        'version', e.version,
        'nota_publica', e.nota,
        'url_entrega', e.enlace_externo,
        'archivo_id', e.archivo_id,
        'created_at', e.created_at
    ) INTO v_entrega
    FROM public.entregas_pedido e
    WHERE e.pedido_id = v_pedido.id
      AND e.es_vigente = true
    LIMIT 1;

    -- 6. Retornar DTO público estricto (SIN datos internos de usuarios, emails de equipo ni audit logs)
    RETURN jsonb_build_object(
        'id', v_pedido.id,
        'pedido_visible', v_pedido.pedido_visible,
        'anio', v_pedido.anio,
        'numero', v_pedido.numero,
        'codigo_categoria', v_pedido.codigo_categoria,
        'categoria_nombre', v_pedido.categoria_nombre,
        'categoria_slug', v_pedido.categoria_slug,
        'tipo_nombre', v_pedido.tipo_nombre,
        'tipo_slug', v_pedido.tipo_slug,
        'estado', v_pedido.estado,
        'informacion_especifica', v_pedido.informacion_especifica,
        'created_at', v_pedido.created_at,
        'updated_at', v_pedido.updated_at,
        'comunicaciones', v_comunicaciones,
        'solicitudes_informacion', v_solicitudes,
        'archivos_adjuntos', v_archivos,
        'entrega', v_entrega
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. F7 RPC: tracking_recover_core (Anti-Enumeración)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tracking_recover_core(
    p_correo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_envio RECORD;
    v_found_count integer := 0;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', true, 'found', false);
    END IF;

    FOR v_envio IN
        SELECT id, nombre_apellido, correo
        FROM public.envios_formulario
        WHERE lower(trim(correo)) = v_norm_email
    LOOP
        v_found_count := v_found_count + 1;

        -- Emitir evento asíncrono para envío de correo con enlaces seguros
        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
        ) VALUES (
            'tracking.recovery_requested', 'envio', v_envio.id,
            jsonb_build_object(
                'envio_id', v_envio.id,
                'correo', v_envio.correo,
                'requested_at', now()
            ),
            NULL, now()
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'found', (v_found_count > 0));
END;
$$;

-- -----------------------------------------------------------------------------
-- 12. Permisos y Concesiones Granulares para RPCs de F7 y F8
-- -----------------------------------------------------------------------------

-- Revocar permisos de EXECUTE públicos en todas las nuevas funciones
REVOKE EXECUTE ON FUNCTION public.pedido_assign(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_change_state(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_cancel(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_reopen(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_archive(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedido_restore(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nota_pedido_create(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.info_request_create(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tracking_get_core(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tracking_recover_core(text) FROM PUBLIC, anon, authenticated;

-- Conceder a authenticated (usuarios logueados, el control interno valida aprobación y rol)
GRANT EXECUTE ON FUNCTION public.pedido_assign(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_change_state(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_cancel(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_reopen(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_archive(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_restore(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nota_pedido_create(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create(uuid, text, integer) TO authenticated;

-- Conceder a service_role (Edge Functions)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Concesión de SELECT a authenticated en tablas operativas
GRANT SELECT ON public.notas_pedido TO authenticated;
GRANT SELECT ON public.entregas_pedido TO authenticated;
GRANT SELECT ON public.solicitudes_informacion TO authenticated;
GRANT SELECT ON public.pedido_asignaciones TO authenticated;
GRANT SELECT ON public.enlaces_material TO authenticated;
GRANT SELECT ON public.enlace_pedido TO authenticated;

-- Asegurar políticas RLS de lectura para usuarios aprobados
DROP POLICY IF EXISTS "notas_pedido_select_approved" ON public.notas_pedido;
DROP POLICY IF EXISTS "notas_select_solicitante_approved" ON public.notas_pedido;
CREATE POLICY "notas_select_solicitante_approved" ON public.notas_pedido
    FOR SELECT TO authenticated
    USING (
        private.is_approved() AND (
            visibilidad = 'solicitante'
            OR private.is_team_or_admin()
        )
    );

DROP POLICY IF EXISTS "entregas_pedido_select_approved" ON public.entregas_pedido;
CREATE POLICY "entregas_pedido_select_approved" ON public.entregas_pedido
    FOR SELECT TO authenticated
    USING (private.is_approved());

DROP POLICY IF EXISTS "pedido_asignaciones_select_approved" ON public.pedido_asignaciones;
CREATE POLICY "pedido_asignaciones_select_approved" ON public.pedido_asignaciones
    FOR SELECT TO authenticated
    USING (private.is_approved());

DROP POLICY IF EXISTS "enlaces_material_select_approved" ON public.enlaces_material;
CREATE POLICY "enlaces_material_select_approved" ON public.enlaces_material
    FOR SELECT TO authenticated
    USING (private.is_approved());

DROP POLICY IF EXISTS "enlace_pedido_select_approved" ON public.enlace_pedido;
CREATE POLICY "enlace_pedido_select_approved" ON public.enlace_pedido
    FOR SELECT TO authenticated
    USING (private.is_approved());

COMMIT;
