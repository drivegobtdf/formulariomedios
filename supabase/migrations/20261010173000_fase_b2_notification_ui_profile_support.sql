-- ==============================================================================
-- MIGRATION: 20261010173000_fase_b2_notification_ui_profile_support.sql
-- FASE B.2: Soporte Backend para Perfil de Usuario y Métricas de Notificaciones
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
--
-- CARACTERÍSTICAS Y SEGURIDAD:
-- 1. RPC public.profile_update_self(p_nombre text, p_apellido text):
--    - Permite a cualquier usuario aprobado ('administrador', 'equipo', 'observador')
--      actualizar exclusivamente su nombre y apellido en public.usuarios_acceso y auth.users.
--    - Validación estricta de longitud (1 a 100 caracteres) y sanitización con trim().
--    - Protegido con SECURITY DEFINER y SET search_path = ''.
--    - Imposibilita la modificación de app_role, estado_acceso, email o cualquier otro campo.
-- 2. RPC public.notification_unread_count():
--    - Retorna el conteo exacto de notificaciones no leídas del usuario actual.
--    - Excluye observadores (retorna 0 de forma segura).
--    - Protegido con SECURITY DEFINER y SET search_path = ''.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: profile_update_self
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_update_self(
    p_nombre text,
    p_apellido text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_nombre text;
    v_apellido text;
BEGIN
    -- 1. Validar autenticación
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validar que el usuario exista y tenga estado 'aprobado'
    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios_acceso
        WHERE user_id = v_user_id AND estado_acceso = 'aprobado'
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Perfil no encontrado o no aprobado' USING ERRCODE = '42501';
    END IF;

    -- 3. Sanitizar y validar nombre y apellido
    v_nombre := trim(COALESCE(p_nombre, ''));
    v_apellido := trim(COALESCE(p_apellido, ''));

    IF length(v_nombre) < 1 OR length(v_nombre) > 100 THEN
        RAISE EXCEPTION 'PARAM_INVALID: El nombre debe tener entre 1 y 100 caracteres' USING ERRCODE = '22023';
    END IF;

    IF length(v_apellido) < 1 OR length(v_apellido) > 100 THEN
        RAISE EXCEPTION 'PARAM_INVALID: El apellido debe tener entre 1 y 100 caracteres' USING ERRCODE = '22023';
    END IF;

    -- 4. Actualizar tabla usuarios_acceso de forma segura
    UPDATE public.usuarios_acceso
    SET nombre = v_nombre,
        apellido = v_apellido,
        updated_at = clock_timestamp()
    WHERE user_id = v_user_id;

    -- 5. Sincronizar metadata en auth.users si existe la fila
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'nombre', v_nombre,
        'apellido', v_apellido
    )
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'nombre', v_nombre,
        'apellido', v_apellido
    );
END;
$$;

REVOKE ALL ON FUNCTION public.profile_update_self(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_update_self(text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. RPC: notification_unread_count
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_count integer := 0;
BEGIN
    -- Validar autenticación, aprobación y rol operativo (observadores excluidos)
    IF v_user_id IS NULL OR NOT private.is_approved() OR NOT private.is_team_or_admin() THEN
        RETURN 0;
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM public.notificaciones_usuario
    WHERE user_id = v_user_id
      AND read_at IS NULL;

    RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_unread_count() TO authenticated;
