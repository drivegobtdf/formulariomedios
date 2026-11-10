-- ==============================================================================
-- MIGRACIÓN: 20261110000003_inc04_inc08_title_limits_and_mp4_support.sql
-- Paquete 4 Post-QA: INC-04 e INC-08
--
-- INC-04 — Títulos:
--   - Establece límite obligatorio de 3 a 50 caracteres para pedidos nuevos
--     tanto en formulario público como en creación interna.
--   - Rechaza etiquetas HTML (<[^>]*>).
--   - Preserva pedidos históricos mayores a 50 caracteres al operar exclusivamente
--     como BEFORE INSERT (trg_cam09_require_new_pedido_title). Las actualizaciones
--     (UPDATE) de pedidos existentes no son bloqueadas.
--   - Prohíbe truncamiento silencioso devolviendo error explícito 42200.
--
-- INC-08 — Archivos MP4:
--   - Incorpora 'video/mp4' hasta 25 MB en submission_create_core.
--   - Preserva OPEN-014 en estado ABIERTO para autorización formal posterior
--     de otros formatos audiovisuales.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- INC-04: Actualización de trigger function cam09_require_new_pedido_title
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cam09_require_new_pedido_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_title text;
BEGIN
    -- En el formulario público, el título llega dentro del JSON de cada pieza.
    -- En creación interna ya llega en public.pedidos.titulo.
    v_title := btrim(COALESCE(NULLIF(btrim(NEW.titulo), ''), NEW.informacion_especifica->>'titulo', ''));

    IF char_length(v_title) < 3 OR char_length(v_title) > 50 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED: Cada pedido debe tener un título de 3 a 50 caracteres'
            USING ERRCODE = '42200';
    END IF;
    IF v_title ~ '<[^>]*>' THEN
        RAISE EXCEPTION 'TITLE_INVALID: El título no puede contener etiquetas HTML'
            USING ERRCODE = '42200';
    END IF;

    NEW.titulo := v_title;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;
CREATE TRIGGER trg_cam09_require_new_pedido_title
BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.cam09_require_new_pedido_title();

REVOKE ALL ON FUNCTION public.cam09_require_new_pedido_title() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.cam09_require_new_pedido_title()
IS 'INC-04: Título obligatorio de 3 a 50 caracteres para PED nuevos (públicos e internos), sin alterar históricos.';

-- ------------------------------------------------------------------------------
-- INC-04: Actualización de RPC pedido_create_internal
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_create_internal(
    p_titulo text,
    p_descripcion text DEFAULT NULL,
    p_solicitante_nombre text DEFAULT NULL,
    p_solicitante_area text DEFAULT NULL,
    p_solicitante_correo text DEFAULT NULL,
    p_solicitante_telefono text DEFAULT NULL,
    p_categoria_id uuid DEFAULT NULL,
    p_tipo_servicio_id uuid DEFAULT NULL,
    p_prioridad text DEFAULT NULL,
    p_etiqueta_interna text DEFAULT NULL,
    p_fecha_limite date DEFAULT NULL,
    p_enlaces text[] DEFAULT NULL,
    p_client_request_ref uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid;
    v_role text;
    v_estado text;
    v_new_id uuid;
    v_pedido_visible text;
    v_year integer;
    v_number bigint;
    v_codigo_cat char(1);
    v_titulo_clean text;
    v_correo_clean text;
    v_prioridad_clean text;
    v_etiqueta_clean text;
    v_client_ref uuid;
    v_info jsonb;
    v_link text;
    v_clean_link text;
    v_enlace_id uuid;
    v_existing RECORD;
BEGIN
    -- 1. Autenticación obligatoria
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Autorización PoLP: solo administrador o equipo con estado aprobado
    SELECT app_role, estado_acceso INTO v_role, v_estado
    FROM public.usuarios_acceso
    WHERE user_id = v_actor_id;

    IF v_estado IS NULL OR v_estado <> 'aprobado' OR v_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'FORBIDDEN: Rol no autorizado para crear pedidos internos' USING ERRCODE = '42501';
    END IF;

    -- 3. Idempotencia: si se provee client_request_ref y ya existe un pedido interno, retornarlo
    IF p_client_request_ref IS NOT NULL THEN
        SELECT id, pedido_visible, estado, version, created_at
        INTO v_existing
        FROM public.pedidos
        WHERE client_request_ref = p_client_request_ref AND origen = 'interno';

        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'id', v_existing.id,
                'pedido_visible', v_existing.pedido_visible,
                'estado', v_existing.estado,
                'origen', 'interno',
                'version', v_existing.version,
                'idempotent', true,
                'created_at', v_existing.created_at
            );
        END IF;
    END IF;

    -- 4. Validación de campos obligatorios (INC-04: 3 a 50 caracteres y sin HTML)
    v_titulo_clean := trim(COALESCE(p_titulo, ''));
    IF char_length(v_titulo_clean) < 3 OR char_length(v_titulo_clean) > 50 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED: El título del pedido es obligatorio y debe tener entre 3 y 50 caracteres' USING ERRCODE = '42200';
    END IF;
    IF v_titulo_clean ~ '<[^>]*>' THEN
        RAISE EXCEPTION 'TITLE_INVALID: El título no puede contener etiquetas HTML' USING ERRCODE = '42200';
    END IF;

    v_correo_clean := lower(trim(COALESCE(p_solicitante_correo, '')));
    IF v_correo_clean = '' THEN
        RAISE EXCEPTION 'SOLICITANTE_CORREO_REQUIRED: El correo electrónico del solicitante es obligatorio' USING ERRCODE = '42200';
    END IF;

    IF v_correo_clean !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'INVALID_SOLICITANTE_CORREO: El formato del correo electrónico es inválido' USING ERRCODE = '42200';
    END IF;

    -- 5. Normalización y validación de prioridad
    v_prioridad_clean := NULLIF(trim(lower(COALESCE(p_prioridad, ''))), '');
    IF v_prioridad_clean IN ('normal', 'sin_prioridad') THEN
        v_prioridad_clean := NULL;
    END IF;
    IF v_prioridad_clean IS NOT NULL AND v_prioridad_clean NOT IN ('alta', 'media', 'baja') THEN
        RAISE EXCEPTION 'INVALID_PRIORITY: La prioridad debe ser alta, media o baja' USING ERRCODE = '22000';
    END IF;

    -- 6. Normalización y validación de etiqueta interna
    v_etiqueta_clean := NULLIF(trim(COALESCE(p_etiqueta_interna, '')), '');
    IF v_etiqueta_clean IS NOT NULL THEN
        IF char_length(v_etiqueta_clean) > 10 OR char_length(v_etiqueta_clean) = 0 THEN
            RAISE EXCEPTION 'INVALID_LABEL: La etiqueta interna no puede superar los 10 caracteres' USING ERRCODE = '22000';
        END IF;
    END IF;

    -- 7. Validación de categoría y tipo de servicio opcionales
    IF p_categoria_id IS NOT NULL THEN
        SELECT codigo_ped INTO v_codigo_cat
        FROM public.categorias_servicio
        WHERE id = p_categoria_id;

        IF v_codigo_cat IS NULL THEN
            RAISE EXCEPTION 'INVALID_CATEGORY: Categoría de servicio no encontrada' USING ERRCODE = '42200';
        END IF;

        IF p_tipo_servicio_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.tipos_servicio
                WHERE id = p_tipo_servicio_id AND categoria_id = p_categoria_id
            ) THEN
                RAISE EXCEPTION 'INVALID_SERVICE_TYPE: El tipo de servicio no pertenece a la categoría seleccionada' USING ERRCODE = '42200';
            END IF;
        END IF;
    ELSE
        IF p_tipo_servicio_id IS NOT NULL THEN
            RAISE EXCEPTION 'CATEGORY_REQUIRED: No se puede especificar tipo de servicio sin categoría' USING ERRCODE = '42200';
        END IF;
        v_codigo_cat := 'X';
    END IF;

    -- 8. Reserva atómica de correlativo anual
    SELECT year, first_number INTO v_year, v_number
    FROM private.reserve_ped_numbers(1);

    v_pedido_visible := 'PED-' || v_year::text || '-' || v_codigo_cat || lpad(v_number::text, 6, '0');

    -- 9. Preparación de informacion_especifica normalizada
    v_info := jsonb_build_object(
        'titulo', v_titulo_clean,
        'descripcion', NULLIF(trim(COALESCE(p_descripcion, '')), ''),
        'contacto_nombre', NULLIF(trim(COALESCE(p_solicitante_nombre, '')), ''),
        'contacto_area', NULLIF(trim(COALESCE(p_solicitante_area, '')), ''),
        'contacto_correo', v_correo_clean,
        'contacto_telefono', NULLIF(trim(COALESCE(p_solicitante_telefono, '')), ''),
        'solicitante', jsonb_build_object(
            'nombre', NULLIF(trim(COALESCE(p_solicitante_nombre, '')), ''),
            'area', NULLIF(trim(COALESCE(p_solicitante_area, '')), ''),
            'correo', v_correo_clean,
            'telefono', NULLIF(trim(COALESCE(p_solicitante_telefono, '')), '')
        ),
        'enlaces', COALESCE(to_jsonb(p_enlaces), '[]'::jsonb)
    );

    -- 10. Inserción del pedido interno
    v_new_id := gen_random_uuid();
    v_client_ref := COALESCE(p_client_request_ref, gen_random_uuid());

    INSERT INTO public.pedidos (
        id,
        envio_id,
        pedido_visible,
        anio,
        numero,
        categoria_id,
        tipo_servicio_id,
        codigo_categoria,
        estado,
        origen,
        titulo,
        prioridad,
        etiqueta_interna,
        fecha_limite,
        created_by_user_id,
        client_request_ref,
        informacion_especifica,
        version,
        tracking_token_version,
        tracking_token_hash,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        NULL,
        v_pedido_visible,
        v_year,
        v_number,
        p_categoria_id,
        p_tipo_servicio_id,
        v_codigo_cat,
        'Nuevo',
        'interno',
        v_titulo_clean,
        v_prioridad_clean,
        v_etiqueta_clean,
        p_fecha_limite,
        v_actor_id,
        v_client_ref,
        v_info,
        1,
        1,
        NULL,
        now(),
        now()
    );

    -- 11. Registro de enlaces externos opcionales
    IF p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0 THEN
        FOREACH v_link IN ARRAY p_enlaces LOOP
            v_clean_link := trim(COALESCE(v_link, ''));
            IF v_clean_link <> '' THEN
                IF v_clean_link !~* '^https?://' THEN
                    RAISE EXCEPTION 'INVALID_LINK_URL: Los enlaces deben comenzar con http:// o https://' USING ERRCODE = '42200';
                END IF;
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, created_at)
                VALUES (v_enlace_id, NULL, v_clean_link, now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id, created_at)
                VALUES (v_enlace_id, v_new_id, now())
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 12. Domain Event y Audit Log
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.created_internal',
        'pedido',
        v_new_id,
        jsonb_build_object(
            'pedido_id', v_new_id,
            'pedido_visible', v_pedido_visible,
            'origen', 'interno',
            'titulo', v_titulo_clean,
            'actor_id', v_actor_id,
            'prioridad', v_prioridad_clean,
            'etiqueta', v_etiqueta_clean,
            'codigo_categoria', v_codigo_cat
        ),
        v_actor_id,
        now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id,
        'pedidos',
        v_new_id::text,
        'create_internal',
        jsonb_build_object(
            'pedido_visible', v_pedido_visible,
            'origen', 'interno',
            'titulo', v_titulo_clean,
            'prioridad', v_prioridad_clean,
            'etiqueta', v_etiqueta_clean,
            'codigo_categoria', v_codigo_cat
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_id,
        'pedido_visible', v_pedido_visible,
        'estado', 'Nuevo',
        'origen', 'interno',
        'codigo_categoria', v_codigo_cat,
        'version', 1,
        'idempotent', false,
        'created_at', now()
    );
END;
$$;

-- Permisos canónicos PoLP
REVOKE ALL ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- INC-08: Actualización de submission_create_core con soporte para video/mp4
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submission_create_core(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    v_submission_key uuid;
    v_schema_version integer;
    v_contacto jsonb;
    v_nombre_apellido text;
    v_telefono text;
    v_correo text;
    v_area_solicitante text;
    v_fingerprint text;
    v_existing_id uuid;
    v_existing_fp text;
    v_pedidos_json jsonb;
    v_ped_count integer;
    v_files_json jsonb := '[]'::jsonb;
    v_files_count integer := 0;
    v_links_count integer := 0;
    v_session_id uuid := NULL;
    v_session_estado text;
    v_session_expires timestamptz;
    v_year integer;
    v_first_num integer;
    v_last_num integer;
    v_envio_id uuid;
    v_elem jsonb;
    v_client_ref uuid;
    v_cat_slug text;
    v_tipo_slug text;
    v_info_esp jsonb;
    v_cat_id uuid;
    v_tipo_id uuid;
    v_codigo_cat char(1);
    v_current_num bigint;
    v_raw_token text;
    v_token_hash text;
    v_pedido_visible text;
    v_fecha_limite date;
    v_fecha_limite_raw text;
    v_pedido_id uuid;
    v_pedido_ids uuid[] := '{}';
    v_pedido_visibles text[] := '{}';
    v_ref_to_id jsonb := '{}'::jsonb;
    v_response_pedidos jsonb := '[]'::jsonb;
    v_replay_pedidos jsonb;
    v_replay_files jsonb;
    v_response_files jsonb := '[]'::jsonb;
    v_link_elem jsonb;
    v_link_id uuid;
    v_link_url text;
    v_link_desc text;
    v_link_targets jsonb;
    v_target_ref text;
    v_target_ped_id uuid;
    v_file_elem jsonb;
    v_client_file_ref uuid;
    v_res_id uuid;
    v_arch_id uuid;
    v_drive_id text;
    v_file_size bigint;
    v_file_mime text;
    v_file_name text;
    v_arch_estado text;
    v_file_targets jsonb;
    v_seen_file_refs uuid[] := '{}';
    i integer;
BEGIN
    -- 1. Validaciones de Payload y Versión de Contrato
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Payload inválido: debe ser un objeto JSON' USING ERRCODE = '22023';
    END IF;

    v_schema_version := (p_payload->>'schema_version')::integer;
    IF v_schema_version IS NULL OR v_schema_version <> 3 THEN
        RAISE EXCEPTION 'CONTRACT_VERSION_UNSUPPORTED: Solo se soporta schema_version = 3' USING ERRCODE = '22023';
    END IF;

    -- Validar submission_key
    BEGIN
        v_submission_key := (p_payload->>'submission_key')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'submission_key debe ser un UUID válido' USING ERRCODE = '22023';
    END;

    IF v_submission_key IS NULL THEN
        RAISE EXCEPTION 'submission_key es obligatorio' USING ERRCODE = '22023';
    END IF;

    -- Validar datos de contacto
    v_contacto := p_payload->'contacto';
    IF v_contacto IS NULL OR jsonb_typeof(v_contacto) <> 'object' THEN
        RAISE EXCEPTION 'contacto es obligatorio y debe ser un objeto JSON' USING ERRCODE = '22023';
    END IF;

    v_nombre_apellido := trim(COALESCE(v_contacto->>'nombre_apellido', ''));
    v_telefono := trim(COALESCE(v_contacto->>'telefono', ''));
    v_correo := lower(trim(COALESCE(v_contacto->>'correo', '')));
    v_area_solicitante := trim(COALESCE(v_contacto->>'area_solicitante', ''));

    IF length(v_nombre_apellido) < 2 THEN
        RAISE EXCEPTION 'nombre_apellido debe tener al menos 2 caracteres' USING ERRCODE = '23514';
    END IF;
    IF length(v_telefono) < 1 THEN
        RAISE EXCEPTION 'telefono es obligatorio' USING ERRCODE = '23514';
    END IF;
    IF v_correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'correo tiene formato inválido' USING ERRCODE = '23514';
    END IF;
    IF length(v_area_solicitante) < 1 THEN
        RAISE EXCEPTION 'area_solicitante es obligatoria' USING ERRCODE = '23514';
    END IF;

    -- Validar array de pedidos
    v_pedidos_json := p_payload->'pedidos';
    IF v_pedidos_json IS NULL OR jsonb_typeof(v_pedidos_json) <> 'array' OR jsonb_array_length(v_pedidos_json) < 1 THEN
        RAISE EXCEPTION 'Debe incluir al menos un pedido en el envío' USING ERRCODE = '22023';
    END IF;

    v_ped_count := jsonb_array_length(v_pedidos_json);

    -- Validar file_bindings (Límite canónico: máximo 5 archivos por presentación)
    IF p_payload ? 'file_bindings' AND jsonb_typeof(p_payload->'file_bindings') = 'array' THEN
        v_files_json := p_payload->'file_bindings';
        v_files_count := jsonb_array_length(v_files_json);
        IF v_files_count > 5 THEN
            RAISE EXCEPTION 'MAX_FILES_EXCEEDED: Se permite un máximo de 5 archivos por envío (recibidos: %)', v_files_count USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 2. Bloqueo Transaccional por submission_key (Serialización de Replay / Concurrencia)
    PERFORM pg_advisory_xact_lock(hashtext('submission_key:' || v_submission_key::text));

    -- 3. Calcular Fingerprint Canónico Server-Side
    v_fingerprint := private.compute_submission_fingerprint(p_payload);

    -- 4. Comprobar Idempotencia / Replay
    SELECT id, request_fingerprint INTO v_existing_id, v_existing_fp
    FROM public.envios_formulario
    WHERE submission_key = v_submission_key;

    IF FOUND THEN
        -- Si existe con fingerprint diferente -> Conflicto de Idempotencia
        IF v_existing_fp <> v_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: submission_key ya utilizada con contenido diferente' USING ERRCODE = '40001';
        END IF;

        -- Si existe con el mismo fingerprint -> Idempotent Replay (Sin mutaciones)
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'client_request_ref', p.client_request_ref,
                'pedido_visible', p.pedido_visible,
                'categoria_slug', c.slug,
                'tipo_slug', t.slug,
                'tracking_token', NULL,
                'tracking_recovery_required', true
            )
            ORDER BY p.numero
        )
        INTO v_replay_pedidos
        FROM public.pedidos p
        JOIN public.categorias_servicio c ON c.id = p.categoria_id
        JOIN public.tipos_servicio t ON t.id = p.tipo_servicio_id
        WHERE p.envio_id = v_existing_id;

        -- Metadata de archivos asociados en el replay
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'nombre_original', a.nombre_original,
                'mime_type', a.mime_type,
                'size_bytes', a.size_bytes
            )
            ORDER BY a.nombre_original
        )
        INTO v_replay_files
        FROM public.upload_reservations r
        JOIN public.archivos a ON a.id = r.archivo_id
        WHERE r.envio_id = v_existing_id;

        RETURN jsonb_build_object(
            'envio_id', v_existing_id,
            'idempotent_replay', true,
            'pedidos', COALESCE(v_replay_pedidos, '[]'::jsonb),
            'archivos', COALESCE(v_replay_files, '[]'::jsonb)
        );
    END IF;

    -- 5. Comprobar Sesión de Envío si existe (submission_sessions)
    SELECT id, estado, expires_at INTO v_session_id, v_session_estado, v_session_expires
    FROM public.submission_sessions
    WHERE submission_key = v_submission_key;

    IF FOUND THEN
        IF v_session_expires <= now() OR v_session_estado = 'expirada' THEN
            RAISE EXCEPTION 'SESSION_EXPIRED: La sesión de carga ha expirado' USING ERRCODE = '22023';
        END IF;
        IF v_session_estado <> 'abierta' THEN
            RAISE EXCEPTION 'SESSION_NOT_OPEN: La sesión de carga ya no está abierta' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 6. Pre-validar y Comprobar Verificación de Archivos (F5 Storage Precondition)
    IF v_files_count > 0 THEN
        FOR v_file_elem IN SELECT * FROM jsonb_array_elements(v_files_json)
        LOOP
            BEGIN
                v_client_file_ref := (COALESCE(v_file_elem->>'client_file_ref', v_file_elem->>'file_id'))::uuid;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'client_file_ref debe ser un UUID válido' USING ERRCODE = '22023';
            END;

            IF v_client_file_ref IS NULL THEN
                RAISE EXCEPTION 'client_file_ref es obligatorio' USING ERRCODE = '22023';
            END IF;

            IF v_client_file_ref = ANY(v_seen_file_refs) THEN
                RAISE EXCEPTION 'VALIDATION_ERROR: client_file_ref duplicado dentro del envío' USING ERRCODE = '23505';
            END IF;
            v_seen_file_refs := array_append(v_seen_file_refs, v_client_file_ref);

            -- Buscar reserva verificada vinculada a la sesión o submission_key
            SELECT r.id, r.archivo_id, a.drive_file_id, a.size_bytes, a.mime_type, a.nombre_original, a.estado
            INTO v_res_id, v_arch_id, v_drive_id, v_file_size, v_file_mime, v_file_name, v_arch_estado
            FROM public.upload_reservations r
            JOIN public.archivos a ON a.id = r.archivo_id
            WHERE (r.client_file_ref = v_client_file_ref OR r.archivo_id = v_client_file_ref)
              AND (v_session_id IS NULL OR r.session_id = v_session_id);

            IF NOT FOUND THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % no posee reserva verificada en almacenamiento', v_client_file_ref USING ERRCODE = '55000';
            END IF;

            -- Invariante de almacenamiento: el archivo debe estar verificado en Google Drive
            IF v_arch_estado <> 'verified' OR v_drive_id IS NULL OR length(trim(v_drive_id)) < 1 THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % no ha sido verificado en almacenamiento', v_client_file_ref USING ERRCODE = '55000';
            END IF;

            -- Invariante de tamaño máximo contractual: 25 MB (26,214,400 bytes)
            IF v_file_size > 26214400 THEN
                RAISE EXCEPTION 'FILE_SIZE_EXCEEDED: El archivo % excede el límite máximo de 25 MB (% bytes)', v_file_name, v_file_size USING ERRCODE = '22023';
            END IF;

            -- Invariante de MIME baseline contractual (PDF, PNG, JPG/JPEG, DOCX, ZIP)
            IF lower(trim(v_file_mime)) NOT IN (
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/jpg',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/zip',
                'application/x-zip-compressed',
                'application/x-zip',
                'video/mp4'
            ) THEN
                RAISE EXCEPTION 'FILE_MIME_UNSUPPORTED: Tipo MIME no permitido para el archivo %: %', v_file_name, v_file_mime USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;

    -- 7. Creación Nueva de Envío (Primera Vez)
    v_envio_id := gen_random_uuid();

    INSERT INTO public.envios_formulario (
        id,
        submission_key,
        request_fingerprint,
        nombre_apellido,
        telefono,
        correo,
        area_solicitante,
        form_schema_version,
        created_at
    ) VALUES (
        v_envio_id,
        v_submission_key,
        v_fingerprint,
        v_nombre_apellido,
        v_telefono,
        v_correo,
        v_area_solicitante,
        3,
        now()
    );

    -- Reservar bloque atómico de N números de secuencia
    SELECT year, first_number, last_number
    INTO v_year, v_first_num, v_last_num
    FROM private.reserve_ped_numbers(v_ped_count);

    -- Iterar pedidos ordenados canónicamente por client_request_ref
    i := 0;
    FOR v_elem IN
        SELECT elem
        FROM jsonb_array_elements(v_pedidos_json) AS elem
        ORDER BY lower(trim(elem->>'client_request_ref'))
    LOOP
        BEGIN
            v_client_ref := (v_elem->>'client_request_ref')::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'client_request_ref debe ser un UUID válido' USING ERRCODE = '22023';
        END;

        v_cat_slug := trim(COALESCE(v_elem->>'categoria_slug', ''));
        v_tipo_slug := trim(COALESCE(v_elem->>'tipo_slug', ''));
        v_info_esp := COALESCE(v_elem->'informacion_especifica', '{}'::jsonb);

        IF jsonb_typeof(v_info_esp) <> 'object' THEN
            RAISE EXCEPTION 'informacion_especifica debe ser un objeto JSON' USING ERRCODE = '22023';
        END IF;

        -- Resolver categoría activa
        SELECT id, codigo_ped INTO v_cat_id, v_codigo_cat
        FROM public.categorias_servicio
        WHERE slug = v_cat_slug AND activo = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Categoría no encontrada o inactiva: %', v_cat_slug USING ERRCODE = 'P0002';
        END IF;

        -- Resolver tipo de servicio activo y perteneciente a la categoría
        SELECT id INTO v_tipo_id
        FROM public.tipos_servicio
        WHERE slug = v_tipo_slug AND categoria_id = v_cat_id AND activo = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tipo de servicio no encontrado, inactivo o no perteneciente a la categoría: %', v_tipo_slug USING ERRCODE = 'P0002';
        END IF;

        -- Número consecutivo dentro del bloque reservado
        v_current_num := v_first_num + i;
        i := i + 1;

        -- Generar tracking token (256 bits criptográficos)
        v_raw_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

        -- Construir identificador visible PED-YYYY-CNNNNNN
        v_pedido_visible := 'PED-' || v_year::text || '-' || v_codigo_cat || lpad(v_current_num::text, 6, '0');

        -- Proyectar fecha_limite si viene explícita en informacion_especifica
        v_fecha_limite := NULL;
        v_fecha_limite_raw := trim(COALESCE(v_info_esp->>'fecha_limite', ''));
        IF length(v_fecha_limite_raw) > 0 THEN
            BEGIN
                v_fecha_limite := v_fecha_limite_raw::date;
            EXCEPTION WHEN OTHERS THEN
                v_fecha_limite := NULL;
            END;
        END IF;

        v_pedido_id := gen_random_uuid();

        INSERT INTO public.pedidos (
            id,
            envio_id,
            client_request_ref,
            pedido_visible,
            anio,
            numero,
            categoria_id,
            tipo_servicio_id,
            codigo_categoria,
            estado,
            responsable_user_id,
            informacion_especifica,
            form_schema_version,
            fecha_limite,
            version,
            tracking_token_version,
            tracking_token_hash,
            tracking_token_created_at,
            created_at,
            updated_at
        ) VALUES (
            v_pedido_id,
            v_envio_id,
            v_client_ref,
            v_pedido_visible,
            v_year,
            v_current_num,
            v_cat_id,
            v_tipo_id,
            v_codigo_cat,
            'Nuevo',
            NULL,
            v_info_esp,
            3,
            v_fecha_limite,
            1,
            1,
            v_token_hash,
            now(),
            now(),
            now()
        );

        v_pedido_ids := array_append(v_pedido_ids, v_pedido_id);
        v_pedido_visibles := array_append(v_pedido_visibles, v_pedido_visible);
        v_ref_to_id := v_ref_to_id || jsonb_build_object(v_client_ref::text, v_pedido_id::text);

        v_response_pedidos := v_response_pedidos || jsonb_build_array(
            jsonb_build_object(
                'id', v_pedido_id,
                'client_request_ref', v_client_ref,
                'pedido_visible', v_pedido_visible,
                'categoria_slug', v_cat_slug,
                'tipo_slug', v_tipo_slug,
                'tracking_token', v_raw_token,
                'tracking_recovery_required', false
            )
        );
    END LOOP;

    -- 8. Procesar enlaces_material y asociaciones
    IF p_payload ? 'material_links' AND jsonb_typeof(p_payload->'material_links') = 'array' THEN
        FOR v_link_elem IN SELECT * FROM jsonb_array_elements(p_payload->'material_links')
        LOOP
            v_link_url := trim(COALESCE(v_link_elem->>'url', ''));
            v_link_desc := NULLIF(trim(COALESCE(v_link_elem->>'descripcion', '')), '');
            v_link_targets := v_link_elem->'targets';

            IF v_link_url !~* '^https://' THEN
                RAISE EXCEPTION 'URL de enlace de material debe iniciar con https://' USING ERRCODE = '23514';
            END IF;

            v_link_id := gen_random_uuid();
            v_links_count := v_links_count + 1;

            INSERT INTO public.enlaces_material (id, envio_id, url, descripcion, created_at)
            VALUES (v_link_id, v_envio_id, v_link_url, v_link_desc, now());

            IF v_link_targets IS NULL OR v_link_targets = '"all"'::jsonb OR (jsonb_typeof(v_link_targets) = 'string' AND v_link_targets = '"all"') THEN
                FOREACH v_target_ped_id IN ARRAY v_pedido_ids
                LOOP
                    INSERT INTO public.enlace_pedido (enlace_id, pedido_id, created_at)
                    VALUES (v_link_id, v_target_ped_id, now())
                    ON CONFLICT DO NOTHING;
                END LOOP;
            ELSIF jsonb_typeof(v_link_targets) = 'array' THEN
                FOR v_target_ref IN SELECT jsonb_array_elements_text(v_link_targets)
                LOOP
                    IF NOT (v_ref_to_id ? lower(trim(v_target_ref))) THEN
                        RAISE EXCEPTION 'Target de enlace no coincide con ningún client_request_ref: %', v_target_ref USING ERRCODE = '22023';
                    END IF;
                    v_target_ped_id := (v_ref_to_id->>lower(trim(v_target_ref)))::uuid;

                    INSERT INTO public.enlace_pedido (enlace_id, pedido_id, created_at)
                    VALUES (v_link_id, v_target_ped_id, now())
                    ON CONFLICT DO NOTHING;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    -- 9. Procesar file_bindings, vincular a pedidos (archivo_pedido) y consumir reservas
    IF v_files_count > 0 THEN
        FOR v_file_elem IN SELECT * FROM jsonb_array_elements(v_files_json)
        LOOP
            v_client_file_ref := (COALESCE(v_file_elem->>'client_file_ref', v_file_elem->>'file_id'))::uuid;
            v_file_targets := v_file_elem->'targets';

            SELECT r.id, r.archivo_id, a.drive_file_id, a.nombre_original, a.mime_type, a.size_bytes
            INTO v_res_id, v_arch_id, v_drive_id, v_file_name, v_file_mime, v_file_size
            FROM public.upload_reservations r
            JOIN public.archivos a ON a.id = r.archivo_id
            WHERE (r.client_file_ref = v_client_file_ref OR r.archivo_id = v_client_file_ref)
              AND (v_session_id IS NULL OR r.session_id = v_session_id);

            -- Asociar archivo a PEDs (N:M)
            IF v_file_targets IS NULL OR v_file_targets = '"all"'::jsonb OR (jsonb_typeof(v_file_targets) = 'string' AND v_file_targets = '"all"') THEN
                FOREACH v_target_ped_id IN ARRAY v_pedido_ids
                LOOP
                    INSERT INTO public.archivo_pedido (archivo_id, pedido_id, created_at)
                    VALUES (v_arch_id, v_target_ped_id, now())
                    ON CONFLICT DO NOTHING;
                END LOOP;
            ELSIF jsonb_typeof(v_file_targets) = 'array' THEN
                FOR v_target_ref IN SELECT jsonb_array_elements_text(v_file_targets)
                LOOP
                    IF NOT (v_ref_to_id ? lower(trim(v_target_ref))) THEN
                        RAISE EXCEPTION 'Target de archivo no coincide con ningún client_request_ref: %', v_target_ref USING ERRCODE = '22023';
                    END IF;
                    v_target_ped_id := (v_ref_to_id->>lower(trim(v_target_ref)))::uuid;

                    INSERT INTO public.archivo_pedido (archivo_id, pedido_id, created_at)
                    VALUES (v_arch_id, v_target_ped_id, now())
                    ON CONFLICT DO NOTHING;
                END LOOP;
            END IF;

            -- Consumir y asociar la reserva al envío
            UPDATE public.upload_reservations
            SET state = 'completed',
                completed_at = now(),
                envio_id = v_envio_id
            WHERE id = v_res_id;

            v_response_files := v_response_files || jsonb_build_array(
                jsonb_build_object(
                    'id', v_arch_id,
                    'client_file_ref', v_client_file_ref,
                    'nombre_original', v_file_name,
                    'mime_type', v_file_mime,
                    'size_bytes', v_file_size
                )
            );
        END LOOP;
    END IF;

    -- 10. Confirmar Sesión de Envío si existe
    IF v_session_id IS NOT NULL THEN
        UPDATE public.submission_sessions
        SET estado = 'confirmada',
            envio_id = v_envio_id
        WHERE id = v_session_id;
    END IF;

    -- 11. Registrar Exactamente 1 Evento de Dominio submission.created
    INSERT INTO public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload,
        actor_user_id,
        created_at
    ) VALUES (
        'submission.created',
        'envio',
        v_envio_id,
        jsonb_build_object(
            'event_id', gen_random_uuid(),
            'envio_id', v_envio_id,
            'schema_version', 3,
            'pedido_ids', to_jsonb(v_pedido_ids),
            'archivos_count', v_files_count,
            'enlaces_count', v_links_count,
            'occurred_at', now()
        ),
        NULL,
        now()
    );

    -- 12. Registrar Entrada en audit_log (Sin raw tokens ni secretos)
    INSERT INTO public.audit_log (
        recurso_tipo,
        recurso_id,
        accion,
        metadata,
        actor_user_id,
        created_at
    ) VALUES (
        'envios_formulario',
        v_envio_id::text,
        'submission.created',
        jsonb_build_object(
            'submission_key', v_submission_key,
            'pedidos_count', v_ped_count,
            'pedido_visibles', to_jsonb(v_pedido_visibles),
            'archivos_count', v_files_count,
            'enlaces_count', v_links_count
        ),
        NULL,
        now()
    );

    -- 13. Retornar Respuesta Inicial
    RETURN jsonb_build_object(
        'envio_id', v_envio_id,
        'idempotent_replay', false,
        'pedidos', v_response_pedidos,
        'archivos', v_response_files
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submission_create_core(jsonb) TO service_role;

COMMENT ON FUNCTION public.submission_create_core(jsonb) IS 'INC-08: Ingesta de envíos con soporte añadido para video/mp4 hasta 25 MB.';
