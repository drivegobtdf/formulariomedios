-- =============================================================================
-- Migration 025: RBAC Archive/Restore for Equipo, Configurable TTL Settings,
--                and Enhanced Info Response Attachments (SRS-RBAC-002, SRS-INF-004)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de Parámetros y Configuración Centralizada (public.configuracion_sistema)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.configuracion_sistema FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.configuracion_sistema TO authenticated;
GRANT ALL ON TABLE public.configuracion_sistema TO service_role;

DROP POLICY IF EXISTS "configuracion_select_approved" ON public.configuracion_sistema;
CREATE POLICY "configuracion_select_approved" ON public.configuracion_sistema
    FOR SELECT TO authenticated
    USING (private.is_approved());

-- Seed de valores técnicos provisionales centralizados
INSERT INTO public.configuracion_sistema (key, value, description)
VALUES 
    ('solicitante_magic_link_ttl_seconds', '7200', 'TTL técnico provisional del magic link de acceso (2 horas)'),
    ('solicitante_session_ttl_seconds', '14400', 'TTL técnico provisional de la sesión pública de solicitante (4 horas)'),
    ('tracking_recovery_ttl_seconds', '86400', 'TTL técnico provisional del token de canje de recuperación (24 horas)')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- Helper seguro para lectura de enteros con clamp y fallback
CREATE OR REPLACE FUNCTION public.get_setting_integer(
    p_key text,
    p_default integer,
    p_min integer DEFAULT 60,
    p_max integer DEFAULT 2592000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_val text;
    v_int integer;
BEGIN
    SELECT value INTO v_val
    FROM public.configuracion_sistema
    WHERE key = p_key;

    IF v_val IS NULL THEN
        RETURN p_default;
    END IF;

    BEGIN
        v_int := v_val::integer;
    EXCEPTION WHEN OTHERS THEN
        RETURN p_default;
    END;

    IF v_int < p_min OR v_int > p_max THEN
        RETURN p_default;
    END IF;

    RETURN v_int;
END;
$$;

-- Helper para modificación de configuración por Service Role
CREATE OR REPLACE FUNCTION public.set_system_setting(
    p_key text,
    p_val text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
BEGIN
    INSERT INTO public.configuracion_sistema (key, value, updated_at)
    VALUES (trim(p_key), trim(p_val), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END;
$$;

-- Helper para modificación de configuración por Administrador
CREATE OR REPLACE FUNCTION public.admin_set_system_setting(
    p_key text,
    p_val text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_role text;
BEGIN
    IF auth.uid() IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role <> 'administrador' THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Solo un administrador puede modificar la configuración del sistema' USING ERRCODE = '42501';
    END IF;

    PERFORM public.set_system_setting(p_key, p_val);

    RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_val);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Actualización de solicitante_request_access con TTL Configurable
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_request_access(
    p_correo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_found_count integer := 0;
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
    v_ttl_seconds integer;
    v_expires_at timestamptz;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'message', 'Si existen solicitudes asociadas al correo ingresado, se enviarán las instrucciones de acceso.'
        );
    END IF;

    -- Obtener TTL técnico provisional desde configuración centralizada
    v_ttl_seconds := public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000);
    v_expires_at := now() + (v_ttl_seconds || ' seconds')::interval;

    SELECT count(*) INTO v_found_count
    FROM public.envios_formulario
    WHERE lower(trim(correo)) = v_norm_email;

    IF v_found_count > 0 THEN
        v_raw_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
        v_token_id := gen_random_uuid();

        INSERT INTO public.solicitante_access_tokens (
            id, correo, token_hash, expires_at, created_at
        ) VALUES (
            v_token_id, v_norm_email, v_token_hash, v_expires_at, now()
        );

        INSERT INTO public.comunicaciones_pedido (
            pedido_id, envio_id, tipo_comunicacion, destinatario_email, estado, attempts, payload, created_at
        )
        SELECT 
            p.id, e.id, 'magic_link_access', v_norm_email, 'pendiente', 0,
            jsonb_build_object(
                'token_id', v_token_id,
                'correo', v_norm_email,
                'raw_token', v_raw_token,
                'expires_at', v_expires_at,
                'intent_type', 'mis_solicitudes_access'
            ),
            now()
        FROM public.envios_formulario e
        JOIN public.pedidos p ON p.envio_id = e.id
        WHERE lower(trim(e.correo)) = v_norm_email
        ORDER BY p.created_at DESC
        LIMIT 1;

        INSERT INTO public.domain_events (
            event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
        ) VALUES (
            'solicitante.access_requested', 'solicitante', v_token_id,
            jsonb_build_object(
                'token_id', v_token_id,
                'correo', v_norm_email,
                'expires_at', v_expires_at
            ),
            NULL, now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'found', (v_found_count > 0),
        'message', 'Si existen solicitudes asociadas al correo ingresado, se enviarán las instrucciones de acceso.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Actualización de solicitante_session_exchange con TTL Configurable
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_session_exchange(
    p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_clean_token text := trim(COALESCE(p_token, ''));
    v_token_hash text;
    v_rec RECORD;
    v_raw_session text;
    v_session_hash text;
    v_session_id uuid;
    v_session_ttl_seconds integer;
    v_session_expires_at timestamptz;
BEGIN
    IF length(v_clean_token) = 0 THEN
        RAISE EXCEPTION 'TOKEN_REQUIRED: El token de acceso es obligatorio' USING ERRCODE = '42200';
    END IF;

    v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

    SELECT id, correo, expires_at, used_at INTO v_rec
    FROM public.solicitante_access_tokens
    WHERE token_hash = v_token_hash
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token de acceso no válido o inexistente' USING ERRCODE = 'P0002';
    END IF;

    IF v_rec.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'TOKEN_ALREADY_USED: Este enlace de acceso ya ha sido utilizado previamente' USING ERRCODE = '42202';
    END IF;

    IF now() >= v_rec.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: El enlace de acceso ha expirado' USING ERRCODE = '42201';
    END IF;

    UPDATE public.solicitante_access_tokens
    SET used_at = now()
    WHERE id = v_rec.id;

    -- Obtener TTL técnico provisional de sesión desde configuración
    v_session_ttl_seconds := public.get_setting_integer('solicitante_session_ttl_seconds', 14400, 60, 2592000);
    v_session_expires_at := now() + (v_session_ttl_seconds || ' seconds')::interval;

    v_raw_session := encode(gen_random_bytes(32), 'hex');
    v_session_hash := encode(digest(v_raw_session, 'sha256'), 'hex');
    v_session_id := gen_random_uuid();

    INSERT INTO public.solicitante_sesiones (
        id, correo, session_token_hash, expires_at, created_at
    ) VALUES (
        v_session_id, v_rec.correo, v_session_hash, v_session_expires_at, now()
    );

    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'solicitante.session_created', 'solicitante', v_session_id,
        jsonb_build_object(
            'session_id', v_session_id,
            'correo', v_rec.correo,
            'expires_at', v_session_expires_at
        ),
        NULL, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_session,
        'correo', v_rec.correo,
        'expires_at', v_session_expires_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. SRS-RBAC-002: pedido_archive y pedido_restore para Administrador Y Equipo
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
    v_archivado boolean;
    v_new_version integer;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para archivar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    SELECT estado, version, archivado INTO v_current_state, v_current_version, v_archivado
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
        RAISE EXCEPTION 'INVALID_STATE_FOR_ARCHIVE: Solo pedidos en estado Finalizado o Cancelado pueden ser archivados' USING ERRCODE = '42200';
    END IF;

    IF v_archivado = true THEN
        RETURN jsonb_build_object('success', true, 'pedido_id', p_pedido_id, 'archivado', true, 'version', v_current_version);
    END IF;

    v_new_version := v_current_version + 1;

    UPDATE public.pedidos
    SET archivado = true,
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

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'archivado', true,
        'version', v_new_version
    );
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
    v_current_version integer;
    v_archivado boolean;
    v_new_version integer;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para desarchivar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    SELECT version, archivado INTO v_current_version, v_archivado
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_version IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Versión esperada % no coincide con actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    IF v_archivado = false THEN
        RETURN jsonb_build_object('success', true, 'pedido_id', p_pedido_id, 'archivado', false, 'version', v_current_version);
    END IF;

    v_new_version := v_current_version + 1;

    UPDATE public.pedidos
    SET archivado = false,
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

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'archivado', false,
        'version', v_new_version
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. SRS-INF-004: solicitante_submit_info_response con Texto, Enlaces y Adjuntos
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.solicitante_submit_info_response(text, uuid, text, text[]);

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
    v_has_text boolean := (p_respuesta_texto IS NOT NULL AND length(trim(p_respuesta_texto)) > 0);
    v_has_links boolean := (p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0);
    v_has_files boolean := (p_archivos IS NOT NULL AND cardinality(p_archivos) > 0);
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto
    INTO v_sol
    FROM public.solicitudes_informacion si
    JOIN public.pedidos p ON si.pedido_id = p.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE si.id = p_solicitud_id AND lower(trim(e.correo)) = v_correo
    FOR UPDATE;

    IF v_sol.id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_NOT_FOUND: Solicitud no encontrada o no autorizada' USING ERRCODE = 'P0002';
    END IF;

    -- Idempotencia
    IF v_sol.estado = 'respondida' THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'solicitud_id', v_sol.id);
    END IF;

    -- Validación estricta de vigencia de 48 horas
    IF now() >= v_sol.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha expirado tras las 48 horas corridas' USING ERRCODE = '42201';
    END IF;

    -- SRS-INF-004: Requiere al menos texto, enlaces o archivos adjuntos
    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

    -- Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_sol.id;

    -- Asociar enlaces aportados (Drive, Dropbox, OneDrive, WeTransfer o cualquier URL válida)
    IF v_has_links THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, url, descripcion, created_at)
                VALUES (v_enlace_id, trim(v_url), 'Aportado en respuesta a solicitud de información 48h', now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Asociar archivos adjuntos aportados
    IF v_has_files THEN
        FOREACH v_arch_id IN ARRAY p_archivos LOOP
            -- Validar existencia previa del archivo registrado
            IF EXISTS (SELECT 1 FROM public.archivos WHERE id = v_arch_id) THEN
                INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
                VALUES (v_arch_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Emitir evento de dominio
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'info_request.responded', 'pedido', v_sol.pedido_id,
        jsonb_build_object(
            'pedido_id', v_sol.pedido_id,
            'solicitud_id', v_sol.id,
            'correo', v_correo,
            'has_text', v_has_text,
            'links_count', COALESCE(cardinality(p_enlaces), 0),
            'files_count', COALESCE(cardinality(p_archivos), 0),
            'responded_at', now()
        ),
        NULL, now()
    );

    RETURN jsonb_build_object('success', true, 'solicitud_id', v_sol.id, 'estado', 'respondida');
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Helper de Pruebas: solicitante_test_claim_magic_token
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_test_claim_magic_token(
    p_correo text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_raw_token text;
BEGIN
    SELECT (c.payload->>'raw_token')::text INTO v_raw_token
    FROM public.comunicaciones_pedido c
    JOIN public.solicitante_access_tokens t ON t.id = (c.payload->>'token_id')::uuid
    WHERE c.destinatario_email = v_norm_email 
      AND c.tipo_comunicacion = 'magic_link_access'
      AND t.used_at IS NULL
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;

    RETURN v_raw_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Permisos Granulares y Revocaciones
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_setting_integer(text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_setting_integer(text, integer, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_system_setting(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_setting(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_set_system_setting(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_system_setting(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_test_claim_magic_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_test_claim_magic_token(text) TO service_role;

COMMIT;
