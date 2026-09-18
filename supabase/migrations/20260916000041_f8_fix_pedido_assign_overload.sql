-- =============================================================================
-- Migración: 20260916000041_f8_fix_pedido_assign_overload.sql
-- Eliminar sobrecarga ambigua de public.pedido_assign y conservar una única firma canónica.
-- =============================================================================

-- 1. Eliminar EXCLUSIVAMENTE la firma obsoleta de 3 argumentos
DROP FUNCTION IF EXISTS public.pedido_assign(uuid, uuid, integer);

-- 2. Asegurar y recrear la firma canónica única de 4 argumentos con DEFAULT NULL
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
