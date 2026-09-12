-- ==============================================================================
-- MIGRATION 012: Harden Observer Visibility, Technical Tables & Admin Lockout
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. Visibilidad Restringida de Notas de Pedido (Observador no ve notas internas)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "notas_select_approved" ON public.notas_pedido;
DROP POLICY IF EXISTS "notas_select_solicitante_approved" ON public.notas_pedido;

CREATE POLICY "notas_select_solicitante_approved" ON public.notas_pedido
    FOR SELECT
    TO authenticated
    USING (
        private.is_approved() AND (
            visibilidad = 'solicitante'
            OR private.is_team_or_admin()
        )
    );

-- -----------------------------------------------------------------------------
-- 2. Mínimo Privilegio sobre Tablas Técnicas e Infraestructura
-- -----------------------------------------------------------------------------

-- A. upload_reservations: Infraestructura de subida, no expuesta a browser
REVOKE SELECT ON public.upload_reservations FROM anon, authenticated;
DROP POLICY IF EXISTS "upload_reservations_select_team" ON public.upload_reservations;

-- B. domain_events: Infraestructura de eventos asíncronos, no expuesta a browser
REVOKE SELECT ON public.domain_events FROM anon, authenticated;
DROP POLICY IF EXISTS "domain_events_select_admin" ON public.domain_events;

-- C. comunicaciones_pedido: Ledger técnico raw, no expuesto directamente a browser
REVOKE SELECT ON public.comunicaciones_pedido FROM anon, authenticated;
DROP POLICY IF EXISTS "comunicaciones_select_team" ON public.comunicaciones_pedido;

-- D. pedido_sequences: Infraestructura de secuencias atómicas, no expuesta a browser
REVOKE SELECT ON public.pedido_sequences FROM anon, authenticated;
DROP POLICY IF EXISTS "sequences_select_team" ON public.pedido_sequences;

-- -----------------------------------------------------------------------------
-- 3. Aislamiento del Esquema Private y Políticas de Catálogos
-- -----------------------------------------------------------------------------

-- Separar políticas de catálogos para desacoplar anon del esquema private
DROP POLICY IF EXISTS "categorias_public_read" ON public.categorias_servicio;
DROP POLICY IF EXISTS "categorias_public_read_anon" ON public.categorias_servicio;
DROP POLICY IF EXISTS "categorias_read_auth" ON public.categorias_servicio;

CREATE POLICY "categorias_public_read_anon" ON public.categorias_servicio
    FOR SELECT
    TO anon
    USING (activo = true);

CREATE POLICY "categorias_read_auth" ON public.categorias_servicio
    FOR SELECT
    TO authenticated
    USING (activo = true OR private.is_approved());

DROP POLICY IF EXISTS "tipos_public_read" ON public.tipos_servicio;
DROP POLICY IF EXISTS "tipos_public_read_anon" ON public.tipos_servicio;
DROP POLICY IF EXISTS "tipos_read_auth" ON public.tipos_servicio;

CREATE POLICY "tipos_public_read_anon" ON public.tipos_servicio
    FOR SELECT
    TO anon
    USING (activo = true);

CREATE POLICY "tipos_read_auth" ON public.tipos_servicio
    FOR SELECT
    TO authenticated
    USING (activo = true OR private.is_approved());

-- Revocar esquema private y sus funciones de anon y PUBLIC
REVOKE USAGE ON SCHEMA private FROM PUBLIC, anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Protección de Funciones Trigger (No Ejecutables como RPC)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_new_user_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_signup() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user_signup() FROM authenticated;

-- -----------------------------------------------------------------------------
-- 5. Protección contra Desbloqueo/Eliminación del Último Administrador (OPEN-015 Guard)
-- -----------------------------------------------------------------------------

-- A. Actualizar admin_revoke_user con guard LAST_ADMIN_PROTECTED
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
    v_other_admins integer;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    IF p_motivo IS NULL OR length(trim(p_motivo)) < 1 THEN
        RAISE EXCEPTION 'El motivo de revocación es obligatorio' USING ERRCODE = '23514';
    END IF;

    -- Obtener datos actuales del usuario objetivo
    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_old_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- Protección contra auto-revocación directa
    IF p_user_id = v_actor_id THEN
        RAISE EXCEPTION 'LAST_ADMIN_PROTECTED: Un administrador no puede auto-revocarse directamente' USING ERRCODE = '42501';
    END IF;

    -- Guard: Protección del último administrador aprobado
    IF v_old_role = 'administrador' AND v_old_state = 'aprobado' THEN
        SELECT count(*) INTO v_other_admins
        FROM public.usuarios_acceso
        WHERE estado_acceso = 'aprobado'
          AND app_role = 'administrador'
          AND user_id <> p_user_id;

        IF v_other_admins = 0 THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTED: No es posible revocar al único administrador aprobado del sistema' USING ERRCODE = '42501';
        END IF;
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

-- B. Actualizar admin_change_user_role con guard LAST_ADMIN_PROTECTED
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
    v_other_admins integer;
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

    -- Guard: Protección contra degradar al último administrador aprobado (incluso si es auto-degradación)
    IF v_old_role = 'administrador' AND v_state = 'aprobado' AND p_new_role <> 'administrador' THEN
        SELECT count(*) INTO v_other_admins
        FROM public.usuarios_acceso
        WHERE estado_acceso = 'aprobado'
          AND app_role = 'administrador'
          AND user_id <> p_user_id;

        IF v_other_admins = 0 THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTED: No es posible degradar el rol del único administrador aprobado del sistema' USING ERRCODE = '42501';
        END IF;
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

-- C. Actualizar admin_reject_user con guard LAST_ADMIN_PROTECTED
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
    v_old_role text;
    v_username text;
    v_other_admins integer;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_old_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- Guard: Protección del último administrador aprobado
    IF v_old_role = 'administrador' AND v_old_state = 'aprobado' THEN
        SELECT count(*) INTO v_other_admins
        FROM public.usuarios_acceso
        WHERE estado_acceso = 'aprobado'
          AND app_role = 'administrador'
          AND user_id <> p_user_id;

        IF v_other_admins = 0 THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTED: No es posible rechazar al único administrador aprobado del sistema' USING ERRCODE = '42501';
        END IF;
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
