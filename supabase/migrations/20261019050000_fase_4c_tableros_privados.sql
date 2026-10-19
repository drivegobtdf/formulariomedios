-- ==============================================================================
-- MIGRATION 20261019050000_fase_4c_tableros_privados.sql
-- Fase 4C: Tableros Privados Colaborativos
-- Tableros independientes del Kanban de pedidos con permisos granulares,
-- columnas reordenables, tarjetas con múltiples tipos de contenido,
-- checklists colaborativos, comentarios, búsqueda y Realtime.
-- ==============================================================================

-- 1. Tablas principales
CREATE TABLE IF NOT EXISTS public.tableros_privados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL CHECK (length(trim(titulo)) >= 1 AND length(titulo) <= 100),
    descripcion text NULL,
    color text NOT NULL DEFAULT 'azul' CHECK (color IN ('azul', 'verde', 'rojo', 'ambar', 'morado', 'gris', 'cyan', 'esmeralda')),
    propietario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tablero_miembros (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tablero_id uuid NOT NULL REFERENCES public.tableros_privados(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rol_tablero text NOT NULL CHECK (rol_tablero IN ('lectura', 'edicion')),
    invitado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tablero_miembros_unique UNIQUE (tablero_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tablero_columnas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tablero_id uuid NOT NULL REFERENCES public.tableros_privados(id) ON DELETE CASCADE,
    nombre text NOT NULL CHECK (length(trim(nombre)) >= 1 AND length(nombre) <= 60),
    orden integer NOT NULL DEFAULT 0,
    color text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tablero_tarjetas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tablero_id uuid NOT NULL REFERENCES public.tableros_privados(id) ON DELETE CASCADE,
    columna_id uuid NOT NULL REFERENCES public.tablero_columnas(id) ON DELETE CASCADE,
    titulo text NOT NULL CHECK (length(trim(titulo)) >= 1 AND length(titulo) <= 200),
    descripcion text NULL,
    tipo_contenido text NOT NULL DEFAULT 'nota_rapida' CHECK (tipo_contenido IN ('nota_rapida', 'checklist', 'enlace', 'contacto', 'recordatorio', 'pedido_ref', 'documentacion')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    color text NOT NULL DEFAULT 'blanco' CHECK (color IN ('blanco', 'azul', 'verde', 'rojo', 'ambar', 'morado', 'gris', 'cyan')),
    orden integer NOT NULL DEFAULT 0,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tablero_tarjeta_checklists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tablero_id uuid NOT NULL REFERENCES public.tableros_privados(id) ON DELETE CASCADE,
    tarjeta_id uuid NOT NULL REFERENCES public.tablero_tarjetas(id) ON DELETE CASCADE,
    texto text NOT NULL CHECK (length(trim(texto)) >= 1 AND length(texto) <= 300),
    completado boolean NOT NULL DEFAULT false,
    orden integer NOT NULL DEFAULT 0,
    completado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    completado_at timestamptz NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tablero_tarjeta_comentarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tablero_id uuid NOT NULL REFERENCES public.tableros_privados(id) ON DELETE CASCADE,
    tarjeta_id uuid NOT NULL REFERENCES public.tablero_tarjetas(id) ON DELETE CASCADE,
    autor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contenido text NOT NULL CHECK (length(trim(contenido)) >= 1 AND length(contenido) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Conceder privilegios en tablas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tableros_privados TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablero_miembros TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablero_columnas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablero_tarjetas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablero_tarjeta_checklists TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tablero_tarjeta_comentarios TO authenticated, service_role;

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_tableros_privados_propietario ON public.tableros_privados (propietario_id);
CREATE INDEX IF NOT EXISTS idx_tablero_miembros_tablero_user ON public.tablero_miembros (tablero_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tablero_columnas_tablero_orden ON public.tablero_columnas (tablero_id, orden);
CREATE INDEX IF NOT EXISTS idx_tablero_tarjetas_tablero_col_orden ON public.tablero_tarjetas (tablero_id, columna_id, orden);
CREATE INDEX IF NOT EXISTS idx_tablero_tarjetas_titulo ON public.tablero_tarjetas (titulo);
CREATE INDEX IF NOT EXISTS idx_tablero_checklists_tarjeta_orden ON public.tablero_tarjeta_checklists (tarjeta_id, orden);
CREATE INDEX IF NOT EXISTS idx_tablero_comentarios_tarjeta ON public.tablero_tarjeta_comentarios (tarjeta_id, created_at);

-- 4. Funciones helper de seguridad (esquema private)
CREATE OR REPLACE FUNCTION private.can_view_tablero(p_tablero_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    -- Solo usuarios con acceso aprobado y rol equipo o administrador
    IF NOT private.is_team_or_admin() THEN
        RETURN false;
    END IF;

    -- Administrador puede VER todos los tableros privados (regla administrativa especial)
    IF private.is_admin() THEN
        RETURN true;
    END IF;

    -- Propietario del tablero
    IF EXISTS (
        SELECT 1 FROM public.tableros_privados tp
        WHERE tp.id = p_tablero_id AND tp.propietario_id = v_uid
    ) THEN
        RETURN true;
    END IF;

    -- Miembro invitado (lectura o edición)
    IF EXISTS (
        SELECT 1 FROM public.tablero_miembros tm
        WHERE tm.tablero_id = p_tablero_id AND tm.user_id = v_uid
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_edit_tablero(p_tablero_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    -- Solo usuarios aprobados equipo o administrador
    IF NOT private.is_team_or_admin() THEN
        RETURN false;
    END IF;

    -- Propietario del tablero puede editar siempre
    IF EXISTS (
        SELECT 1 FROM public.tableros_privados tp
        WHERE tp.id = p_tablero_id AND tp.propietario_id = v_uid
    ) THEN
        RETURN true;
    END IF;

    -- Miembro invitado con rol explícito 'edicion'
    IF EXISTS (
        SELECT 1 FROM public.tablero_miembros tm
        WHERE tm.tablero_id = p_tablero_id AND tm.user_id = v_uid AND tm.rol_tablero = 'edicion'
    ) THEN
        RETURN true;
    END IF;

    -- Los administradores que NO son propietarios ni invitados con 'edicion'
    -- NO pueden editar tableros ajenos (regla de seguridad estricta).
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_tablero_owner(p_tablero_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tableros_privados tp
        WHERE tp.id = p_tablero_id AND tp.propietario_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION private.can_view_tablero(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_edit_tablero(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_tablero_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_tablero(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_edit_tablero(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_tablero_owner(uuid) TO authenticated, service_role;

-- 5. Habilitar RLS en todas las tablas
ALTER TABLE public.tableros_privados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_columnas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_tarjeta_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_tarjeta_comentarios ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS
-- tableros_privados
DROP POLICY IF EXISTS "tableros_privados_select" ON public.tableros_privados;
CREATE POLICY "tableros_privados_select" ON public.tableros_privados
    FOR SELECT TO authenticated
    USING (
        private.is_team_or_admin() AND (
            propietario_id = auth.uid() OR
            private.is_admin() OR
            EXISTS (
                SELECT 1 FROM public.tablero_miembros tm
                WHERE tm.tablero_id = tableros_privados.id AND tm.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "tableros_privados_insert" ON public.tableros_privados;
CREATE POLICY "tableros_privados_insert" ON public.tableros_privados
    FOR INSERT TO authenticated
    WITH CHECK (private.is_team_or_admin() AND propietario_id = auth.uid());

DROP POLICY IF EXISTS "tableros_privados_update" ON public.tableros_privados;
CREATE POLICY "tableros_privados_update" ON public.tableros_privados
    FOR UPDATE TO authenticated
    USING (propietario_id = auth.uid())
    WITH CHECK (propietario_id = auth.uid());

DROP POLICY IF EXISTS "tableros_privados_delete" ON public.tableros_privados;
CREATE POLICY "tableros_privados_delete" ON public.tableros_privados
    FOR DELETE TO authenticated
    USING (propietario_id = auth.uid());

-- tablero_miembros
DROP POLICY IF EXISTS "tablero_miembros_select" ON public.tablero_miembros;
CREATE POLICY "tablero_miembros_select" ON public.tablero_miembros
    FOR SELECT TO authenticated
    USING (private.can_view_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_miembros_insert" ON public.tablero_miembros;
CREATE POLICY "tablero_miembros_insert" ON public.tablero_miembros
    FOR INSERT TO authenticated
    WITH CHECK (private.is_tablero_owner(tablero_id));

DROP POLICY IF EXISTS "tablero_miembros_update" ON public.tablero_miembros;
CREATE POLICY "tablero_miembros_update" ON public.tablero_miembros
    FOR UPDATE TO authenticated
    USING (private.is_tablero_owner(tablero_id))
    WITH CHECK (private.is_tablero_owner(tablero_id));

DROP POLICY IF EXISTS "tablero_miembros_delete" ON public.tablero_miembros;
CREATE POLICY "tablero_miembros_delete" ON public.tablero_miembros
    FOR DELETE TO authenticated
    USING (private.is_tablero_owner(tablero_id));

-- tablero_columnas
DROP POLICY IF EXISTS "tablero_columnas_select" ON public.tablero_columnas;
CREATE POLICY "tablero_columnas_select" ON public.tablero_columnas
    FOR SELECT TO authenticated
    USING (private.can_view_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_columnas_insert" ON public.tablero_columnas;
CREATE POLICY "tablero_columnas_insert" ON public.tablero_columnas
    FOR INSERT TO authenticated
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_columnas_update" ON public.tablero_columnas;
CREATE POLICY "tablero_columnas_update" ON public.tablero_columnas
    FOR UPDATE TO authenticated
    USING (private.can_edit_tablero(tablero_id))
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_columnas_delete" ON public.tablero_columnas;
CREATE POLICY "tablero_columnas_delete" ON public.tablero_columnas
    FOR DELETE TO authenticated
    USING (private.can_edit_tablero(tablero_id));

-- tablero_tarjetas
DROP POLICY IF EXISTS "tablero_tarjetas_select" ON public.tablero_tarjetas;
CREATE POLICY "tablero_tarjetas_select" ON public.tablero_tarjetas
    FOR SELECT TO authenticated
    USING (private.can_view_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjetas_insert" ON public.tablero_tarjetas;
CREATE POLICY "tablero_tarjetas_insert" ON public.tablero_tarjetas
    FOR INSERT TO authenticated
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjetas_update" ON public.tablero_tarjetas;
CREATE POLICY "tablero_tarjetas_update" ON public.tablero_tarjetas
    FOR UPDATE TO authenticated
    USING (private.can_edit_tablero(tablero_id))
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjetas_delete" ON public.tablero_tarjetas;
CREATE POLICY "tablero_tarjetas_delete" ON public.tablero_tarjetas
    FOR DELETE TO authenticated
    USING (private.can_edit_tablero(tablero_id));

-- tablero_tarjeta_checklists
DROP POLICY IF EXISTS "tablero_tarjeta_checklists_select" ON public.tablero_tarjeta_checklists;
CREATE POLICY "tablero_tarjeta_checklists_select" ON public.tablero_tarjeta_checklists
    FOR SELECT TO authenticated
    USING (private.can_view_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjeta_checklists_insert" ON public.tablero_tarjeta_checklists;
CREATE POLICY "tablero_tarjeta_checklists_insert" ON public.tablero_tarjeta_checklists
    FOR INSERT TO authenticated
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjeta_checklists_update" ON public.tablero_tarjeta_checklists;
CREATE POLICY "tablero_tarjeta_checklists_update" ON public.tablero_tarjeta_checklists
    FOR UPDATE TO authenticated
    USING (private.can_edit_tablero(tablero_id))
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjeta_checklists_delete" ON public.tablero_tarjeta_checklists;
CREATE POLICY "tablero_tarjeta_checklists_delete" ON public.tablero_tarjeta_checklists
    FOR DELETE TO authenticated
    USING (private.can_edit_tablero(tablero_id));

-- tablero_tarjeta_comentarios
DROP POLICY IF EXISTS "tablero_tarjeta_comentarios_select" ON public.tablero_tarjeta_comentarios;
CREATE POLICY "tablero_tarjeta_comentarios_select" ON public.tablero_tarjeta_comentarios
    FOR SELECT TO authenticated
    USING (private.can_view_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjeta_comentarios_insert" ON public.tablero_tarjeta_comentarios;
CREATE POLICY "tablero_tarjeta_comentarios_insert" ON public.tablero_tarjeta_comentarios
    FOR INSERT TO authenticated
    WITH CHECK (private.can_edit_tablero(tablero_id) AND autor_id = auth.uid());

DROP POLICY IF EXISTS "tablero_tarjeta_comentarios_update" ON public.tablero_tarjeta_comentarios;
CREATE POLICY "tablero_tarjeta_comentarios_update" ON public.tablero_tarjeta_comentarios
    FOR UPDATE TO authenticated
    USING (private.can_edit_tablero(tablero_id) AND (autor_id = auth.uid() OR private.is_tablero_owner(tablero_id)))
    WITH CHECK (private.can_edit_tablero(tablero_id));

DROP POLICY IF EXISTS "tablero_tarjeta_comentarios_delete" ON public.tablero_tarjeta_comentarios;
CREATE POLICY "tablero_tarjeta_comentarios_delete" ON public.tablero_tarjeta_comentarios
    FOR DELETE TO authenticated
    USING (private.can_edit_tablero(tablero_id) AND (autor_id = auth.uid() OR private.is_tablero_owner(tablero_id)));

-- 7. RPCs de Gestión de Tableros y Colaboración

-- Crear Tablero con columnas iniciales y auditoría
CREATE OR REPLACE FUNCTION public.tablero_create(
    p_titulo text,
    p_descripcion text DEFAULT NULL,
    p_color text DEFAULT 'azul'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tablero_id uuid;
    v_res jsonb;
BEGIN
    IF v_uid IS NULL OR NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo usuarios del equipo o administradores pueden crear tableros' USING ERRCODE = '42501';
    END IF;

    IF length(trim(coalesce(p_titulo, ''))) < 1 THEN
        RAISE EXCEPTION 'INVALID_TITLE: El título del tablero es obligatorio' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tableros_privados (titulo, descripcion, color, propietario_id)
    VALUES (trim(p_titulo), nullif(trim(p_descripcion), ''), coalesce(p_color, 'azul'), v_uid)
    RETURNING id INTO v_tablero_id;

    -- Columnas predeterminadas
    INSERT INTO public.tablero_columnas (tablero_id, nombre, orden, color) VALUES
    (v_tablero_id, 'Por hacer', 0, 'gris'),
    (v_tablero_id, 'En curso', 1, 'azul'),
    (v_tablero_id, 'Hecho', 2, 'verde');

    -- Auditoría
    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_privado', v_tablero_id::text, 'tablero.creado', jsonb_build_object('titulo', p_titulo));

    SELECT to_jsonb(t) INTO v_res FROM public.tableros_privados t WHERE t.id = v_tablero_id;
    RETURN v_res;
END;
$$;

-- Eliminar Tablero (solo propietario)
CREATE OR REPLACE FUNCTION public.tablero_delete(
    p_tablero_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_titulo text;
BEGIN
    IF v_uid IS NULL OR NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Operación no permitida' USING ERRCODE = '42501';
    END IF;

    SELECT titulo INTO v_titulo FROM public.tableros_privados
    WHERE id = p_tablero_id AND propietario_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el propietario puede eliminar el tablero' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.tableros_privados WHERE id = p_tablero_id;

    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_privado', p_tablero_id::text, 'tablero.eliminado', jsonb_build_object('titulo', v_titulo));

    RETURN true;
END;
$$;

-- Invitar miembro
CREATE OR REPLACE FUNCTION public.tablero_member_invite(
    p_tablero_id uuid,
    p_user_id uuid,
    p_rol_tablero text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_target_role text;
    v_target_estado text;
    v_res jsonb;
BEGIN
    IF v_uid IS NULL OR NOT private.is_tablero_owner(p_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el propietario puede invitar miembros' USING ERRCODE = '42501';
    END IF;

    IF p_rol_tablero NOT IN ('lectura', 'edicion') THEN
        RAISE EXCEPTION 'INVALID_ROLE: El rol de tablero debe ser lectura o edicion' USING ERRCODE = '22023';
    END IF;

    IF p_user_id = v_uid THEN
        RAISE EXCEPTION 'INVALID_USER: El propietario no puede invitarse a sí mismo' USING ERRCODE = '22023';
    END IF;

    SELECT app_role, estado_acceso INTO v_target_role, v_target_estado
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND OR v_target_estado != 'aprobado' OR v_target_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo se pueden invitar usuarios aprobados de roles administrador o equipo' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.tablero_miembros (tablero_id, user_id, rol_tablero, invitado_por)
    VALUES (p_tablero_id, p_user_id, p_rol_tablero, v_uid)
    ON CONFLICT (tablero_id, user_id) DO UPDATE
    SET rol_tablero = EXCLUDED.rol_tablero, updated_at = now()
    RETURNING to_jsonb(tablero_miembros.*) INTO v_res;

    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_privado', p_tablero_id::text, 'tablero.miembro_invitado', jsonb_build_object(
        'user_id', p_user_id,
        'rol_tablero', p_rol_tablero
    ));

    RETURN v_res;
END;
$$;

-- Modificar rol de miembro
CREATE OR REPLACE FUNCTION public.tablero_member_update_role(
    p_tablero_id uuid,
    p_user_id uuid,
    p_rol_tablero text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_res jsonb;
BEGIN
    IF v_uid IS NULL OR NOT private.is_tablero_owner(p_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el propietario puede modificar permisos de miembros' USING ERRCODE = '42501';
    END IF;

    IF p_rol_tablero NOT IN ('lectura', 'edicion') THEN
        RAISE EXCEPTION 'INVALID_ROLE: El rol de tablero debe ser lectura o edicion' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tablero_miembros
    SET rol_tablero = p_rol_tablero, updated_at = now()
    WHERE tablero_id = p_tablero_id AND user_id = p_user_id
    RETURNING to_jsonb(tablero_miembros.*) INTO v_res;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: El usuario no es miembro del tablero' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_privado', p_tablero_id::text, 'tablero.miembro_actualizado', jsonb_build_object(
        'user_id', p_user_id,
        'rol_tablero', p_rol_tablero
    ));

    RETURN v_res;
END;
$$;

-- Revocar acceso a miembro
CREATE OR REPLACE FUNCTION public.tablero_member_revoke(
    p_tablero_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL OR NOT private.is_tablero_owner(p_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el propietario puede revocar el acceso a miembros' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.tablero_miembros
    WHERE tablero_id = p_tablero_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: El usuario no es miembro del tablero' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_privado', p_tablero_id::text, 'tablero.miembro_revocado', jsonb_build_object('user_id', p_user_id));

    RETURN true;
END;
$$;

-- Mover tarjeta entre columnas y posiciones
CREATE OR REPLACE FUNCTION public.tablero_tarjeta_move(
    p_tarjeta_id uuid,
    p_columna_destino_id uuid,
    p_nuevo_orden integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tablero_id uuid;
    v_columna_origen_id uuid;
    v_res jsonb;
BEGIN
    SELECT tablero_id, columna_id INTO v_tablero_id, v_columna_origen_id
    FROM public.tablero_tarjetas
    WHERE id = p_tarjeta_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Tarjeta no encontrada' USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.can_edit_tablero(v_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: No tiene permisos de edición en este tablero' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tablero_columnas
        WHERE id = p_columna_destino_id AND tablero_id = v_tablero_id
    ) THEN
        RAISE EXCEPTION 'INVALID_COLUMN: La columna destino no pertenece a este tablero' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tablero_tarjetas
    SET columna_id = p_columna_destino_id,
        orden = greatest(0, coalesce(p_nuevo_orden, 0)),
        updated_at = now()
    WHERE id = p_tarjeta_id
    RETURNING to_jsonb(tablero_tarjetas.*) INTO v_res;

    INSERT INTO public.audit_log (actor_user_id, recurso_tipo, recurso_id, accion, metadata)
    VALUES (v_uid, 'tablero_tarjeta', p_tarjeta_id::text, 'tarjeta.movida', jsonb_build_object(
        'tablero_id', v_tablero_id,
        'columna_origen', v_columna_origen_id,
        'columna_destino', p_columna_destino_id,
        'nuevo_orden', p_nuevo_orden
    ));

    RETURN v_res;
END;
$$;

-- Reordenar columnas en lote
CREATE OR REPLACE FUNCTION public.tablero_columnas_reorder(
    p_tablero_id uuid,
    p_columna_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id uuid;
    v_idx integer := 0;
BEGIN
    IF v_uid IS NULL OR NOT private.can_edit_tablero(p_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: No tiene permisos de edición en este tablero' USING ERRCODE = '42501';
    END IF;

    FOREACH v_id IN ARRAY p_columna_ids LOOP
        UPDATE public.tablero_columnas
        SET orden = v_idx, updated_at = now()
        WHERE id = v_id AND tablero_id = p_tablero_id;
        v_idx := v_idx + 1;
    END LOOP;

    RETURN true;
END;
$$;

-- Reordenar tarjetas en lote dentro de una columna
CREATE OR REPLACE FUNCTION public.tablero_tarjetas_reorder(
    p_tablero_id uuid,
    p_columna_id uuid,
    p_tarjeta_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id uuid;
    v_idx integer := 0;
BEGIN
    IF v_uid IS NULL OR NOT private.can_edit_tablero(p_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: No tiene permisos de edición en este tablero' USING ERRCODE = '42501';
    END IF;

    FOREACH v_id IN ARRAY p_tarjeta_ids LOOP
        UPDATE public.tablero_tarjetas
        SET orden = v_idx, columna_id = p_columna_id, updated_at = now()
        WHERE id = v_id AND tablero_id = p_tablero_id;
        v_idx := v_idx + 1;
    END LOOP;

    RETURN true;
END;
$$;

-- Toggle checklist en tarjeta
CREATE OR REPLACE FUNCTION public.tablero_tarjeta_checklist_toggle(
    p_checklist_id uuid,
    p_completado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tablero_id uuid;
    v_res jsonb;
BEGIN
    SELECT tablero_id INTO v_tablero_id
    FROM public.tablero_tarjeta_checklists
    WHERE id = p_checklist_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Ítem no encontrado' USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.can_edit_tablero(v_tablero_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: No tiene permisos de edición en este tablero' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tablero_tarjeta_checklists
    SET completado = p_completado,
        completado_por = CASE WHEN p_completado THEN v_uid ELSE NULL END,
        completado_at = CASE WHEN p_completado THEN now() ELSE NULL END
    WHERE id = p_checklist_id
    RETURNING to_jsonb(tablero_tarjeta_checklists.*) INTO v_res;

    RETURN v_res;
END;
$$;

-- Listado de colaboradores aprobados (admin / equipo)
CREATE OR REPLACE FUNCTION public.tablero_get_collaborators()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL OR NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo usuarios del equipo o administradores pueden listar colaboradores' USING ERRCODE = '42501';
    END IF;

    RETURN (
        SELECT coalesce(jsonb_agg(
            jsonb_build_object(
                'user_id', u.user_id,
                'nombre', u.nombre,
                'apellido', u.apellido,
                'nombre_usuario', u.nombre_usuario,
                'app_role', u.app_role
            ) ORDER BY u.nombre, u.apellido
        ), '[]'::jsonb)
        FROM public.usuarios_acceso u
        WHERE u.estado_acceso = 'aprobado'
          AND u.app_role IN ('administrador', 'equipo')
          AND u.user_id != v_uid
    );
END;
$$;

-- Búsqueda de tarjetas dentro de tableros autorizados
CREATE OR REPLACE FUNCTION public.tablero_tarjetas_search(
    p_query text,
    p_tablero_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL OR NOT private.is_team_or_admin() THEN
        RETURN '[]'::jsonb;
    END IF;

    IF p_query IS NULL OR trim(p_query) = '' THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN (
        SELECT coalesce(jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'tablero_id', t.tablero_id,
                'tablero_titulo', b.titulo,
                'columna_id', t.columna_id,
                'columna_nombre', c.nombre,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'tipo_contenido', t.tipo_contenido,
                'color', t.color,
                'orden', t.orden,
                'created_at', t.created_at,
                'updated_at', t.updated_at
            ) ORDER BY t.updated_at DESC
        ), '[]'::jsonb)
        FROM public.tablero_tarjetas t
        JOIN public.tableros_privados b ON b.id = t.tablero_id
        JOIN public.tablero_columnas c ON c.id = t.columna_id
        WHERE private.can_view_tablero(t.tablero_id)
          AND (p_tablero_id IS NULL OR t.tablero_id = p_tablero_id)
          AND (
              t.titulo ILIKE '%' || trim(p_query) || '%' OR
              coalesce(t.descripcion, '') ILIKE '%' || trim(p_query) || '%' OR
              t.tipo_contenido ILIKE '%' || trim(p_query) || '%'
          )
        LIMIT 50
    );
END;
$$;

-- Obtener referencias a pedidos para asociar a tarjetas
CREATE OR REPLACE FUNCTION public.tablero_get_pedidos_reference_list(
    p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL OR NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Acceso restringido' USING ERRCODE = '42501';
    END IF;

    RETURN (
        SELECT coalesce(jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'numero_identificador', p.pedido_visible,
                'titulo', coalesce(p.titulo, 'Pedido ' || p.pedido_visible),
                'estado', p.estado,
                'created_at', p.created_at
            ) ORDER BY p.created_at DESC
        ), '[]'::jsonb)
        FROM public.pedidos p
        WHERE (p_search IS NULL OR trim(p_search) = '' OR
               p.pedido_visible ILIKE '%' || trim(p_search) || '%' OR
               p.titulo ILIKE '%' || trim(p_search) || '%')
          AND p.archivado = false
        LIMIT 25
    );
END;
$$;

-- Permisos sobre RPCs
REVOKE ALL ON FUNCTION public.tablero_create(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_member_invite(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_member_update_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_member_revoke(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_tarjeta_move(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_columnas_reorder(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_tarjetas_reorder(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_tarjeta_checklist_toggle(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_get_collaborators() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_tarjetas_search(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tablero_get_pedidos_reference_list(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.tablero_create(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_delete(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_member_invite(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_member_update_role(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_member_revoke(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_tarjeta_move(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_columnas_reorder(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_tarjetas_reorder(uuid, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_tarjeta_checklist_toggle(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_get_collaborators() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_tarjetas_search(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tablero_get_pedidos_reference_list(text) TO authenticated, service_role;

-- 8. Habilitar Supabase Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tableros_privados'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tableros_privados;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tablero_miembros'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tablero_miembros;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tablero_columnas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tablero_columnas;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tablero_tarjetas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tablero_tarjetas;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tablero_tarjeta_checklists'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tablero_tarjeta_checklists;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tablero_tarjeta_comentarios'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tablero_tarjeta_comentarios;
    END IF;
END $$;
