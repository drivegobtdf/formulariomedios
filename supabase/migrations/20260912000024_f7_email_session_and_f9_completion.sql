-- ==============================================================================
-- MIGRATION 024: F7 Mis Solicitudes (Email Verified Session) & F9 Completion
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tablas para Enlace Seguro y Sesiones Públicas por Correo Verificado
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.solicitante_access_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correo text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_access_token_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_solicitante_access_tokens_hash 
    ON public.solicitante_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_solicitante_access_tokens_correo 
    ON public.solicitante_access_tokens(correo);

ALTER TABLE public.solicitante_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitante_access_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitante_access_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.solicitante_sesiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correo text NOT NULL,
    session_token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_sesion_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_solicitante_sesiones_hash 
    ON public.solicitante_sesiones(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_solicitante_sesiones_correo 
    ON public.solicitante_sesiones(correo);

ALTER TABLE public.solicitante_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitante_sesiones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitante_sesiones TO service_role;

-- -----------------------------------------------------------------------------
-- 2. RPC: solicitante_request_access (Emisión de Enlace Seguro + Outbox)
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
    -- TTL técnico provisional del enlace de acceso: 2 horas (configurable / no contractualmente fijo)
    v_expires_at timestamptz := now() + interval '2 hours';
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'message', 'Si existen solicitudes asociadas al correo ingresado, se enviarán las instrucciones de acceso.'
        );
    END IF;

    SELECT count(*) INTO v_found_count
    FROM public.envios_formulario
    WHERE lower(trim(correo)) = v_norm_email;

    IF v_found_count > 0 THEN
        -- Generar token criptográfico único (256 bits)
        v_raw_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
        v_token_id := gen_random_uuid();

        -- Persistir registro de token de acceso
        INSERT INTO public.solicitante_access_tokens (
            id, correo, token_hash, expires_at, created_at
        ) VALUES (
            v_token_id, v_norm_email, v_token_hash, v_expires_at, now()
        );

        -- Encolar notificación en outbox de comunicaciones para envío por F10
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

        -- Emitir evento de dominio (sin secretos en payload)
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
-- 3. RPC: solicitante_session_exchange (Canje Atómico de Enlace a Sesión Opaque)
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
    -- TTL técnico provisional de la sesión pública: 4 horas
    v_session_expires_at timestamptz := now() + interval '4 hours';
BEGIN
    IF length(v_clean_token) = 0 THEN
        RAISE EXCEPTION 'TOKEN_REQUIRED: El token de acceso es obligatorio' USING ERRCODE = '42200';
    END IF;

    v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

    -- Bloqueo transaccional de fila para garantizar canje único
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

    -- Consumo atómico: marcar token como usado
    UPDATE public.solicitante_access_tokens
    SET used_at = now()
    WHERE id = v_rec.id;

    -- Generar sesión pública opaca en memoria (256 bits)
    v_raw_session := encode(gen_random_bytes(32), 'hex');
    v_session_hash := encode(digest(v_raw_session, 'sha256'), 'hex');
    v_session_id := gen_random_uuid();

    INSERT INTO public.solicitante_sesiones (
        id, correo, session_token_hash, expires_at, created_at
    ) VALUES (
        v_session_id, v_rec.correo, v_session_hash, v_session_expires_at, now()
    );

    -- Emitir evento de dominio
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
-- 4. Helper de Validación de Sesión y Revocación
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validate_solicitante_session(
    p_session_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_clean_token text := trim(COALESCE(p_session_token, ''));
    v_session_hash text;
    v_rec RECORD;
BEGIN
    IF length(v_clean_token) = 0 THEN
        RAISE EXCEPTION 'SESSION_REQUIRED: Token de sesión obligatorio' USING ERRCODE = '42501';
    END IF;

    v_session_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

    SELECT id, correo, expires_at, revoked_at INTO v_rec
    FROM public.solicitante_sesiones
    WHERE session_token_hash = v_session_hash;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión no encontrada o inválida' USING ERRCODE = '42501';
    END IF;

    IF v_rec.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'SESSION_REVOKED: La sesión ha sido cerrada' USING ERRCODE = '42501';
    END IF;

    IF now() >= v_rec.expires_at THEN
        RAISE EXCEPTION 'SESSION_EXPIRED: La sesión ha expirado' USING ERRCODE = '42501';
    END IF;

    RETURN v_rec.correo;
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitante_session_revoke(
    p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_clean_token text := trim(COALESCE(p_session_token, ''));
    v_session_hash text;
BEGIN
    IF length(v_clean_token) > 0 THEN
        v_session_hash := encode(digest(v_clean_token, 'sha256'), 'hex');
        UPDATE public.solicitante_sesiones
        SET revoked_at = now()
        WHERE session_token_hash = v_session_hash AND revoked_at IS NULL;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: solicitante_get_pedidos (Listado Paginado de Solicitudes Autorizadas)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_get_pedidos(
    p_session_token text,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_correo text;
    v_pedidos jsonb;
    v_total integer;
    v_eff_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_eff_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    SELECT count(*) INTO v_total
    FROM public.pedidos p
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE lower(trim(e.correo)) = v_correo;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_pedidos
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'pedido_visible', p.pedido_visible,
            'anio', p.anio,
            'numero', p.numero,
            'codigo_categoria', p.codigo_categoria,
            'categoria_nombre', cs.nombre,
            'tipo_nombre', ts.nombre,
            'estado', p.estado,
            'archivado', p.archivado,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'solicitudes_pendientes_count', (
                SELECT count(*)::integer 
                FROM public.solicitudes_informacion si
                WHERE si.pedido_id = p.id AND si.estado = 'pendiente' AND now() < si.expires_at
            ),
            'tiene_entrega', EXISTS (
                SELECT 1 FROM public.entregas_pedido ep
                WHERE ep.pedido_id = p.id AND ep.es_vigente = true
            )
        ) AS item
        FROM public.pedidos p
        JOIN public.envios_formulario e ON p.envio_id = e.id
        LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
        LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE lower(trim(e.correo)) = v_correo
        ORDER BY p.created_at DESC
        LIMIT v_eff_limit OFFSET v_eff_offset
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'correo', v_correo,
        'total', v_total,
        'limit', v_eff_limit,
        'offset', v_eff_offset,
        'pedidos', v_pedidos
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: solicitante_get_pedido_detail (Detalle Público e Historial de PED)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_get_pedido_detail(
    p_session_token text,
    p_pedido_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_correo text;
    v_clean_ref text := trim(COALESCE(p_pedido_ref, ''));
    v_ped RECORD;
    v_solicitudes jsonb;
    v_comunicaciones jsonb;
    v_entrega jsonb;
    v_historial jsonb;
    v_archivos_iniciales jsonb;
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF length(v_clean_ref) = 0 THEN
        RAISE EXCEPTION 'PEDIDO_REF_REQUIRED: Referencia de pedido obligatoria' USING ERRCODE = '42200';
    END IF;

    -- Obtener pedido garantizando estricta pertenencia al correo verificado
    SELECT 
        p.id, p.pedido_visible, p.anio, p.numero, p.codigo_categoria, p.estado,
        p.informacion_especifica, p.archivado, p.created_at, p.updated_at,
        cs.nombre AS categoria_nombre, ts.nombre AS tipo_nombre,
        e.id AS envio_id, e.nombre_apellido, e.telefono, e.correo, e.area_solicitante
    INTO v_ped
    FROM public.pedidos p
    JOIN public.envios_formulario e ON p.envio_id = e.id
    LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    WHERE (p.id::text = v_clean_ref OR p.pedido_visible = upper(v_clean_ref))
      AND lower(trim(e.correo)) = v_correo;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado o no autorizado para este correo' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Solicitudes de Información (con vigencia de 48 horas)
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_solicitudes
    FROM (
        SELECT jsonb_build_object(
            'id', si.id,
            'mensaje', si.mensaje,
            'estado', si.estado,
            'expires_at', si.expires_at,
            'is_expired', (now() >= si.expires_at),
            'respuesta_texto', si.respuesta_texto,
            'responded_at', si.responded_at,
            'created_at', si.created_at
        ) AS item
        FROM public.solicitudes_informacion si
        WHERE si.pedido_id = v_ped.id
    ) t;

    -- 2. Comunicaciones y Notas públicas (visibilidad = 'solicitante')
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_comunicaciones
    FROM (
        SELECT jsonb_build_object(
            'id', n.id,
            'mensaje', n.texto,
            'created_at', n.created_at
        ) AS item
        FROM public.notas_pedido n
        WHERE n.pedido_id = v_ped.id AND n.visibilidad = 'solicitante'
    ) t;

    -- 3. Entrega vigente
    SELECT jsonb_build_object(
        'version', ep.version,
        'url_entrega', ep.enlace_externo,
        'nota', ep.nota,
        'created_at', ep.created_at
    )
    INTO v_entrega
    FROM public.entregas_pedido ep
    WHERE ep.pedido_id = v_ped.id AND ep.es_vigente = true;

    -- 4. Proyección de Historial Público (eventos de dominio filtrados y sanitizados)
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', de.event_name,
            'created_at', de.created_at,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido ingresado y registrado en el sistema'
                WHEN 'pedido.assigned' THEN 'Pedido asignado al equipo técnico para su tratamiento'
                WHEN 'pedido.state_changed' THEN concat('Estado actualizado a: ', COALESCE(de.payload->>'estado_nuevo', 'En proceso'))
                WHEN 'info_request.created' THEN 'Se emitió una solicitud de información complementaria'
                WHEN 'info_request.responded' THEN 'Respuesta de información complementaria recibida'
                WHEN 'pedido.finalized' THEN 'Trabajo finalizado y entrega de materiales disponible'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.reopened' THEN 'Pedido reabierto para revisión'
                ELSE 'Actualización de seguimiento'
            END
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created', 'pedido.assigned', 'pedido.state_changed',
              'info_request.created', 'info_request.responded',
              'pedido.finalized', 'pedido.cancelled', 'pedido.reopened'
          )
    ) t;

    -- 5. Archivos iniciales del solicitante (metadatos públicos sin IDs internos)
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_archivos_iniciales
    FROM (
        SELECT jsonb_build_object(
            'nombre_original', a.nombre_original,
            'size_bytes', a.size_bytes,
            'mime_type', a.mime_type,
            'created_at', a.created_at
        ) AS item
        FROM public.archivo_pedido ap
        JOIN public.archivos a ON ap.archivo_id = a.id
        WHERE ap.pedido_id = v_ped.id AND a.contexto = 'solicitud'
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_ped.id,
        'pedido_visible', v_ped.pedido_visible,
        'anio', v_ped.anio,
        'numero', v_ped.numero,
        'codigo_categoria', v_ped.codigo_categoria,
        'categoria_nombre', v_ped.categoria_nombre,
        'tipo_nombre', v_ped.tipo_nombre,
        'estado', v_ped.estado,
        'informacion_especifica', v_ped.informacion_especifica,
        'archivado', v_ped.archivado,
        'created_at', v_ped.created_at,
        'updated_at', v_ped.updated_at,
        'solicitante', jsonb_build_object(
            'nombre_apellido', v_ped.nombre_apellido,
            'area_solicitante', v_ped.area_solicitante,
            'correo', v_ped.correo,
            'telefono', v_ped.telefono
        ),
        'solicitudes_informacion', v_solicitudes,
        'comunicaciones', v_comunicaciones,
        'entrega', v_entrega,
        'historial_publico', v_historial,
        'archivos', v_archivos_iniciales
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: solicitante_submit_info_response (Respuesta a Información 48h desde Sesión)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitante_submit_info_response(
    p_session_token text,
    p_solicitud_id uuid,
    p_respuesta_texto text,
    p_enlaces text[] DEFAULT NULL
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
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar existencia y pertenencia al correo
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

    -- Idempotencia: si ya fue respondida
    IF v_sol.estado = 'respondida' THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'solicitud_id', v_sol.id);
    END IF;

    -- Validación estricta de vigencia de 48 horas
    IF now() >= v_sol.expires_at THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: La solicitud de información ha expirado tras las 48 horas corridas' USING ERRCODE = '42201';
    END IF;

    IF (p_respuesta_texto IS NULL OR length(trim(p_respuesta_texto)) = 0) AND (p_enlaces IS NULL OR cardinality(p_enlaces) = 0) THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta o al menos un enlace' USING ERRCODE = '42200';
    END IF;

    -- Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_sol.id;

    -- Asociar enlaces si se adjuntaron
    IF p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0 THEN
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

    -- Emitir evento de dominio
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'info_request.responded', 'pedido', v_sol.pedido_id,
        jsonb_build_object(
            'pedido_id', v_sol.pedido_id,
            'solicitud_id', v_sol.id,
            'correo', v_correo,
            'responded_at', now()
        ),
        NULL, now()
    );

    RETURN jsonb_build_object('success', true, 'solicitud_id', v_sol.id, 'estado', 'respondida');
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Helper de Testing para Consumidor Sintético en Pruebas
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
    -- Obtener el token crudo encolado en el outbox para el correo indicado
    SELECT (payload->>'raw_token')::text INTO v_raw_token
    FROM public.comunicaciones_pedido
    WHERE destinatario_email = v_norm_email AND tipo_comunicacion = 'magic_link_access'
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN v_raw_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Concesión de Permisos Granulares y Revocaciones
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.solicitante_request_access(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_request_access(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_session_exchange(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_session_exchange(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_session_revoke(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_session_revoke(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_test_claim_magic_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_test_claim_magic_token(text) TO service_role;

COMMIT;
