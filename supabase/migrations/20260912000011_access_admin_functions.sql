-- ==============================================================================
-- MIGRATION 011: Administrative Access RPC Functions & Audit
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Función RPC: Aprobar Solicitud de Usuario y Asignar Rol
CREATE OR REPLACE FUNCTION public.admin_approve_user(
    p_user_id uuid,
    p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_old_state text;
    v_old_role text;
    v_username text;
BEGIN
    -- Verificar autorización del invocador
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    -- Validar rol objetivo
    IF p_role NOT IN ('administrador', 'equipo', 'observador') THEN
        RAISE EXCEPTION 'Rol de aplicación no válido: %', p_role USING ERRCODE = '23514';
    END IF;

    -- Obtener datos actuales del usuario
    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_old_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- Actualizar acceso
    UPDATE public.usuarios_acceso
    SET estado_acceso = 'aprobado',
        app_role = p_role,
        aprobado_at = now(),
        aprobado_por = v_actor_id,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Registrar auditoría
    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.approved',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'nombre_usuario', v_username,
            'previous_state', v_old_state,
            'previous_role', v_old_role,
            'new_state', 'aprobado',
            'new_role', p_role
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'estado_acceso', 'aprobado',
        'app_role', p_role
    );
END;
$$;

-- 2. Función RPC: Rechazar Solicitud de Usuario
CREATE OR REPLACE FUNCTION public.admin_reject_user(
    p_user_id uuid,
    p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_old_state text;
    v_username text;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    SELECT estado_acceso, nombre_usuario 
    INTO v_old_state, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.usuarios_acceso
    SET estado_acceso = 'rechazado',
        rechazado_at = now(),
        rechazado_por = v_actor_id,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.rejected',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'nombre_usuario', v_username,
            'previous_state', v_old_state,
            'new_state', 'rechazado',
            'motivo', p_motivo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'estado_acceso', 'rechazado'
    );
END;
$$;

-- 3. Función RPC: Revocar Acceso de Usuario
CREATE OR REPLACE FUNCTION public.admin_revoke_user(
    p_user_id uuid,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_old_state text;
    v_old_role text;
    v_username text;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    IF p_motivo IS NULL OR length(trim(p_motivo)) < 1 THEN
        RAISE EXCEPTION 'El motivo de revocación es obligatorio' USING ERRCODE = '23514';
    END IF;

    -- Protección básica contra auto-bloqueo directo del invocador
    IF p_user_id = v_actor_id THEN
        RAISE EXCEPTION 'Un administrador no puede auto-revocarse directamente' USING ERRCODE = '42501';
    END IF;

    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_old_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.usuarios_acceso
    SET estado_acceso = 'revocado',
        revocado_at = now(),
        revocado_por = v_actor_id,
        motivo_revocacion = trim(p_motivo),
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.revoked',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'nombre_usuario', v_username,
            'previous_state', v_old_state,
            'previous_role', v_old_role,
            'new_state', 'revocado',
            'motivo', trim(p_motivo)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'estado_acceso', 'revocado'
    );
END;
$$;

-- 4. Función RPC: Cambiar Rol de Usuario
CREATE OR REPLACE FUNCTION public.admin_change_user_role(
    p_user_id uuid,
    p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_old_role text;
    v_state text;
    v_username text;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    IF p_new_role NOT IN ('administrador', 'equipo', 'observador') THEN
        RAISE EXCEPTION 'Rol de aplicación no válido: %', p_new_role USING ERRCODE = '23514';
    END IF;

    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.usuarios_acceso
    SET app_role = p_new_role,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.role_changed',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'nombre_usuario', v_username,
            'previous_role', v_old_role,
            'new_role', p_new_role,
            'estado_acceso', v_state
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'app_role', p_new_role
    );
END;
$$;

-- 5. Función RPC: Modificar Nombre de Usuario Oficial
CREATE OR REPLACE FUNCTION public.admin_change_username(
    p_user_id uuid,
    p_new_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_clean_username text := trim(COALESCE(p_new_username, ''));
    v_old_username text;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    IF v_clean_username !~ '^[a-z0-9._-]{2,30}$' THEN
        RAISE EXCEPTION 'El nombre de usuario debe contener entre 2 y 30 caracteres alfanuméricos, puntos, guiones o guiones bajos en minúsculas' USING ERRCODE = '23514';
    END IF;

    SELECT nombre_usuario INTO v_old_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    IF v_old_username = v_clean_username THEN
        RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'nombre_usuario', v_clean_username);
    END IF;

    IF EXISTS (SELECT 1 FROM public.usuarios_acceso WHERE nombre_usuario = v_clean_username AND user_id <> p_user_id) THEN
        RAISE EXCEPTION 'El nombre de usuario ya se encuentra en uso por otra cuenta' USING ERRCODE = '23505';
    END IF;

    UPDATE public.usuarios_acceso
    SET nombre_usuario = v_clean_username,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.username_changed',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'previous_username', v_old_username,
            'new_username', v_clean_username
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'nombre_usuario', v_clean_username
    );
END;
$$;

-- Permisos sobre funciones administrativas
REVOKE ALL ON FUNCTION public.admin_approve_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_user(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revoke_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_change_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_change_username(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text) TO authenticated;
