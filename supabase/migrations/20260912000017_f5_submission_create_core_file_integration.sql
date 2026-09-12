-- ==============================================================================
-- MIGRATION 017: Atomic Submission Creation with Verified File Integration (F5)
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

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

    -- Validar file_bindings (F5: máximo 10 archivos)
    IF p_payload ? 'file_bindings' AND jsonb_typeof(p_payload->'file_bindings') = 'array' THEN
        v_files_json := p_payload->'file_bindings';
        v_files_count := jsonb_array_length(v_files_json);
        IF v_files_count > 10 THEN
            RAISE EXCEPTION 'MAX_FILES_EXCEEDED: Se permite un máximo de 10 archivos por envío' USING ERRCODE = '22023';
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

            -- Invariante de tamaño máximo contractual: 10 MB (10485760 bytes)
            IF v_file_size > 10485760 THEN
                RAISE EXCEPTION 'FILE_SIZE_EXCEEDED: El archivo % excede el límite máximo de 10 MB (% bytes)', v_file_name, v_file_size USING ERRCODE = '22023';
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
                'application/x-zip'
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

-- Permisos estrictos: Ningún rol de browser puede invocar submission_create_core
REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submission_create_core(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submission_create_core(jsonb) TO service_role;
