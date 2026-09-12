-- ==============================================================================
-- MIGRATION 009: Auth Private Helpers and Signup Trigger
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Schema privado para helpers de autorización (No expuesto en Data API)
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

-- 2. Función helper: Obtener estado y rol del usuario actual (SECURITY DEFINER para evitar recursión RLS)
CREATE OR REPLACE FUNCTION private.get_my_access()
RETURNS TABLE (estado_acceso text, app_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.estado_acceso, u.app_role
    FROM public.usuarios_acceso u
    WHERE u.user_id = auth.uid();
$$;

-- 3. Función helper: Comprobar si el usuario actual está aprobado
CREATE OR REPLACE FUNCTION private.is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios_acceso u
        WHERE u.user_id = auth.uid()
          AND u.estado_acceso = 'aprobado'
    );
$$;

-- 4. Función helper: Obtener rol del usuario actual (solo si está aprobado)
CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.app_role
    FROM public.usuarios_acceso u
    WHERE u.user_id = auth.uid()
      AND u.estado_acceso = 'aprobado';
$$;

-- 5. Función helper: Comprobar roles permitidos
CREATE OR REPLACE FUNCTION private.has_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios_acceso u
        WHERE u.user_id = auth.uid()
          AND u.estado_acceso = 'aprobado'
          AND u.app_role = ANY(allowed_roles)
    );
$$;

-- 6. Helper específico para Administrador
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.has_role(ARRAY['administrador']);
$$;

-- 7. Helper específico para Equipo o Administrador
CREATE OR REPLACE FUNCTION private.is_team_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.has_role(ARRAY['administrador', 'equipo']);
$$;

-- 8. Helper específico para Observador o Superior (todo usuario aprobado)
CREATE OR REPLACE FUNCTION private.is_observer_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.is_approved();
$$;

-- Revocar y conceder privilegios sobre funciones de private
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated;

-- 9. Trigger de Signup Seguro en auth.users
-- Valida metadata requerida y crea perfil estrictamente en estado 'pendiente' y rol 'observador'
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_nombre text;
    v_apellido text;
    v_nombre_usuario text;
BEGIN
    -- Si no hay metadata (ej. inserción interna sin metadata de usuario), salir
    IF new.raw_user_meta_data IS NULL OR new.raw_user_meta_data = '{}'::jsonb THEN
        RETURN new;
    END IF;

    -- Extraer y sanitizar metadata
    v_nombre := trim(COALESCE(new.raw_user_meta_data->>'nombre', ''));
    v_apellido := trim(COALESCE(new.raw_user_meta_data->>'apellido', ''));
    v_nombre_usuario := trim(COALESCE(new.raw_user_meta_data->>'nombre_usuario', ''));

    -- Validar nombre y apellido no vacíos
    IF length(v_nombre) < 1 THEN
        RAISE EXCEPTION 'El nombre es obligatorio' USING ERRCODE = '23514';
    END IF;

    IF length(v_apellido) < 1 THEN
        RAISE EXCEPTION 'El apellido es obligatorio' USING ERRCODE = '23514';
    END IF;

    -- Validar formato estricto de nombre_usuario
    IF v_nombre_usuario !~ '^[a-z0-9._-]{2,30}$' THEN
        RAISE EXCEPTION 'El nombre de usuario debe contener entre 2 y 30 caracteres alfanuméricos, puntos, guiones o guiones bajos en minúsculas' USING ERRCODE = '23514';
    END IF;

    -- Comprobar unicidad previa para evitar violaciones no controladas
    IF EXISTS (SELECT 1 FROM public.usuarios_acceso WHERE nombre_usuario = v_nombre_usuario) THEN
        RAISE EXCEPTION 'El nombre de usuario ya se encuentra registrado' USING ERRCODE = '23505';
    END IF;

    -- Insertar perfil: Estado 'pendiente' forzado, rol 'observador' base (el cliente no puede autoasignarse rol ni aprobación)
    INSERT INTO public.usuarios_acceso (
        user_id,
        nombre,
        apellido,
        nombre_usuario,
        estado_acceso,
        app_role,
        solicitado_at
    ) VALUES (
        new.id,
        v_nombre,
        v_apellido,
        v_nombre_usuario,
        'pendiente',
        'observador',
        now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new;
END;
$$;

-- Vincular trigger AFTER INSERT sobre auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_signup();

REVOKE ALL ON FUNCTION public.handle_new_user_signup() FROM PUBLIC, anon, authenticated;
