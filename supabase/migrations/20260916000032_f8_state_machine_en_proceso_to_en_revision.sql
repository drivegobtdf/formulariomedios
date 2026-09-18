-- =============================================================================
-- Migración: 20260916000032_f8_state_machine_en_proceso_to_en_revision.sql
-- Habilitar transición contractualmente permitida 'En proceso' -> 'En revisión'
-- y soporte de reservas de upload asociadas a solicitudes de información.
-- =============================================================================

-- 1. Agregar columnas opcionales a upload_reservations si no existen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'upload_reservations' 
          AND column_name = 'solicitud_id'
    ) THEN
        ALTER TABLE public.upload_reservations 
            ADD COLUMN solicitud_id uuid NULL REFERENCES public.solicitudes_informacion(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'upload_reservations' 
          AND column_name = 'pedido_id'
    ) THEN
        ALTER TABLE public.upload_reservations 
            ADD COLUMN pedido_id uuid NULL REFERENCES public.pedidos(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_upload_reservations_solicitud ON public.upload_reservations(solicitud_id) WHERE solicitud_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_reservations_pedido ON public.upload_reservations(pedido_id) WHERE pedido_id IS NOT NULL;

-- 2. Actualizar función pedido_change_state para admitir retroceso a 'En revisión'
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
