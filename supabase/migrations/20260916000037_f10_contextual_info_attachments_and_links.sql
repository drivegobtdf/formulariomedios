-- ==============================================================================
-- Migration 037: Contextual Association of Files and Links to Info Requests
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. Tabla de Asociación N:M Archivo <-> Solicitud de Información
CREATE TABLE IF NOT EXISTS public.archivo_solicitud_informacion (
    solicitud_informacion_id uuid NOT NULL REFERENCES public.solicitudes_informacion(id) ON DELETE CASCADE,
    archivo_id uuid NOT NULL REFERENCES public.archivos(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (solicitud_informacion_id, archivo_id)
);

-- 2. Tabla de Asociación N:M Enlace <-> Solicitud de Información
CREATE TABLE IF NOT EXISTS public.enlace_solicitud_informacion (
    solicitud_informacion_id uuid NOT NULL REFERENCES public.solicitudes_informacion(id) ON DELETE CASCADE,
    enlace_id uuid NOT NULL REFERENCES public.enlaces_material(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (solicitud_informacion_id, enlace_id)
);

-- 3. Configuración de RLS y Permisos Granulares
ALTER TABLE public.archivo_solicitud_informacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enlace_solicitud_informacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.archivo_solicitud_informacion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.enlace_solicitud_informacion FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.archivo_solicitud_informacion TO authenticated;
GRANT ALL ON TABLE public.archivo_solicitud_informacion TO service_role;

GRANT SELECT ON TABLE public.enlace_solicitud_informacion TO authenticated;
GRANT ALL ON TABLE public.enlace_solicitud_informacion TO service_role;

DROP POLICY IF EXISTS "archivo_solicitud_select_approved" ON public.archivo_solicitud_informacion;
CREATE POLICY "archivo_solicitud_select_approved" ON public.archivo_solicitud_informacion
    FOR SELECT TO authenticated
    USING (private.is_approved());

DROP POLICY IF EXISTS "enlace_solicitud_select_approved" ON public.enlace_solicitud_informacion;
CREATE POLICY "enlace_solicitud_select_approved" ON public.enlace_solicitud_informacion
    FOR SELECT TO authenticated
    USING (private.is_approved());

-- 4. Actualización del Write Path Canónico Directo: info_response_submit_core
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
    v_arch_estado text;
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

    -- 5. Validar y asociar archivos aportados
    IF p_archivo_ids IS NOT NULL AND cardinality(p_archivo_ids) > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivo_ids LOOP
            -- Validar existencia y estado verified
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % aún no se encuentra verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;

            -- Validar que no pertenezca a otra solicitud diferente
            IF EXISTS (
                SELECT 1 FROM public.archivo_solicitud_informacion 
                WHERE archivo_id = v_arch_id AND solicitud_informacion_id <> v_solicitud.id
            ) THEN
                RAISE EXCEPTION 'FILE_ALREADY_ASSOCIATED: El archivo % ya está asociado a otra solicitud de información', v_arch_id USING ERRCODE = '42200';
            END IF;

            -- Validar que no pertenezca a otro pedido diferente
            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido 
                WHERE archivo_id = v_arch_id AND pedido_id <> v_pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;

            UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;
            
            -- Mantener asociación global con el PED
            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_pedido_id)
            ON CONFLICT DO NOTHING;

            -- Agregar asociación contextual con la solicitud
            INSERT INTO public.archivo_solicitud_informacion (solicitud_informacion_id, archivo_id)
            VALUES (v_solicitud.id, v_arch_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 6. Validar y asociar enlaces aportados
    IF p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0 THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF v_url IS NOT NULL AND length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
                VALUES (v_enlace_id, v_envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información', now());

                -- Mantener asociación global con el PED
                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_pedido_id)
                ON CONFLICT DO NOTHING;

                -- Agregar asociación contextual con la solicitud
                INSERT INTO public.enlace_solicitud_informacion (solicitud_informacion_id, enlace_id)
                VALUES (v_solicitud.id, v_enlace_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 7. Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_solicitud.id;

    -- 8. Emitir evento durable y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_responded', 'pedido', v_pedido_id,
        jsonb_build_object(
            'solicitud_id', v_solicitud.id,
            'pedido_id', v_pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivo_ids), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0),
            'respondida_at', now()
        ),
        NULL, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL, 'solicitudes_informacion', v_solicitud.id::text, 'respond',
        jsonb_build_object(
            'pedido_id', v_pedido_id,
            'archivos_count', COALESCE(cardinality(p_archivo_ids), 0),
            'enlaces_count', COALESCE(cardinality(p_enlaces), 0)
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', v_solicitud.id,
        'pedido_id', v_pedido_id
    );
END;
$$;

-- 5. Actualización del Write Path de Portal: solicitante_submit_info_response
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
    v_arch_estado text;
    v_has_text boolean := (p_respuesta_texto IS NOT NULL AND length(trim(p_respuesta_texto)) > 0);
    v_has_links boolean := (p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0);
    v_has_files boolean := (p_archivos IS NOT NULL AND cardinality(p_archivos) > 0);
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_REQUIRED: Identificador de solicitud obligatorio' USING ERRCODE = '42200';
    END IF;

    -- Validar pertenencia y existencia
    SELECT si.id, si.pedido_id, si.estado, si.expires_at, si.respuesta_texto, p.envio_id
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

    -- Requiere al menos texto, enlaces o archivos adjuntos
    IF NOT v_has_text AND NOT v_has_links AND NOT v_has_files THEN
        RAISE EXCEPTION 'RESPONSE_REQUIRED: Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' USING ERRCODE = '42200';
    END IF;

    -- Validar y asociar archivos adjuntos aportados
    IF v_has_files THEN
        FOREACH v_arch_id IN ARRAY p_archivos LOOP
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % aún no se encuentra verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;

            -- Validar que no pertenezca a otra solicitud diferente
            IF EXISTS (
                SELECT 1 FROM public.archivo_solicitud_informacion 
                WHERE archivo_id = v_arch_id AND solicitud_informacion_id <> v_sol.id
            ) THEN
                RAISE EXCEPTION 'FILE_ALREADY_ASSOCIATED: El archivo % ya está asociado a otra solicitud de información', v_arch_id USING ERRCODE = '42200';
            END IF;

            -- Validar que no pertenezca a otro pedido diferente
            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido 
                WHERE archivo_id = v_arch_id AND pedido_id <> v_sol.pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;

            UPDATE public.archivos SET contexto = 'informacion_respuesta' WHERE id = v_arch_id;

            -- Mantener asociación global con el PED
            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_sol.pedido_id)
            ON CONFLICT DO NOTHING;

            -- Agregar asociación contextual con la solicitud
            INSERT INTO public.archivo_solicitud_informacion (solicitud_informacion_id, archivo_id)
            VALUES (v_sol.id, v_arch_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Validar y asociar enlaces aportados
    IF v_has_links THEN
        FOREACH v_url IN ARRAY p_enlaces LOOP
            IF length(trim(v_url)) > 0 THEN
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
                VALUES (v_enlace_id, v_sol.envio_id, trim(v_url), 'Aportado en respuesta a solicitud de información 48h', now());

                -- Mantener asociación global con el PED
                INSERT INTO public.enlace_pedido (enlace_id, pedido_id)
                VALUES (v_enlace_id, v_sol.pedido_id)
                ON CONFLICT DO NOTHING;

                -- Agregar asociación contextual con la solicitud
                INSERT INTO public.enlace_solicitud_informacion (solicitud_informacion_id, enlace_id)
                VALUES (v_sol.id, v_enlace_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Actualizar solicitud a respondida
    UPDATE public.solicitudes_informacion
    SET estado = 'respondida',
        respuesta_texto = trim(COALESCE(p_respuesta_texto, '')),
        responded_at = now()
    WHERE id = v_sol.id;

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

-- 6. Permisos de Ejecución
REVOKE EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_response_submit_core(text, text, uuid[], text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_submit_info_response(text, uuid, text, text[], uuid[]) TO service_role;

-- 7. Backfill Controlado Exclusivo para PED-2026-D000155 (Última Solicitud Verificada)
-- Solicitud: 958f05fb-26b6-4ffc-ae80-da7e480751ae ("PRUEBA FINAL ENLACE DIRECTO...")
-- Archivo: b6a118ad-a7f0-4eaf-baf2-a5f2b54d5dcb (WhatsApp Image 2026-08-25 at 17.49.04.jpeg)
-- Enlace: 7f37bd57-08a8-4a83-a98f-6bc4a1c3c113 (Google Drive)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion WHERE id = '958f05fb-26b6-4ffc-ae80-da7e480751ae'
    ) AND EXISTS (
        SELECT 1 FROM public.archivos WHERE id = 'b6a118ad-a7f0-4eaf-baf2-a5f2b54d5dcb'
    ) THEN
        INSERT INTO public.archivo_solicitud_informacion (solicitud_informacion_id, archivo_id, created_at)
        VALUES ('958f05fb-26b6-4ffc-ae80-da7e480751ae', 'b6a118ad-a7f0-4eaf-baf2-a5f2b54d5dcb', '2026-09-16T19:55:53.912242+00:00')
        ON CONFLICT DO NOTHING;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion WHERE id = '958f05fb-26b6-4ffc-ae80-da7e480751ae'
    ) AND EXISTS (
        SELECT 1 FROM public.enlaces_material WHERE id = '7f37bd57-08a8-4a83-a98f-6bc4a1c3c113'
    ) THEN
        INSERT INTO public.enlace_solicitud_informacion (solicitud_informacion_id, enlace_id, created_at)
        VALUES ('958f05fb-26b6-4ffc-ae80-da7e480751ae', '7f37bd57-08a8-4a83-a98f-6bc4a1c3c113', '2026-09-16T19:55:53.912242+00:00')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
