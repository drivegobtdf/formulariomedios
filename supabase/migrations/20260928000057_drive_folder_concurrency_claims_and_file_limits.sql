-- ==============================================================================
-- MIGRATION 057: Drive Folder Concurrency Claims, Lease Expiry and File Limits
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. Actualizar esquema de public.pedido_drive_folders
-- Permitir NULL en drive_folder_id cuando organization_status <> 'completed'
-- Añadir soporte para claims atómicos, leases y control de reintentos
ALTER TABLE public.pedido_drive_folders ALTER COLUMN drive_folder_id DROP NOT NULL;

ALTER TABLE public.pedido_drive_folders 
    ADD COLUMN IF NOT EXISTS claim_token text NULL,
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 5;

-- Migrar cualquier fila histórica con el placeholder 'pending_creation' a NULL
UPDATE public.pedido_drive_folders
SET drive_folder_id = NULL
WHERE drive_folder_id = 'pending_creation';

-- Constraint de coherencia lógica:
-- Si organization_status = 'completed' -> drive_folder_id DEBE ser NOT NULL y no vacío
-- Si organization_status IN ('pending', 'processing', 'failed') -> drive_folder_id puede ser NULL
ALTER TABLE public.pedido_drive_folders DROP CONSTRAINT IF EXISTS chk_drive_folder_id_status;
ALTER TABLE public.pedido_drive_folders
    ADD CONSTRAINT chk_drive_folder_id_status CHECK (
        (organization_status = 'completed' AND drive_folder_id IS NOT NULL AND length(trim(drive_folder_id)) > 0) OR
        (organization_status IN ('pending', 'processing', 'failed'))
    );

-- Índices de optimización para barridos de recuperación y verificación de claim
CREATE INDEX IF NOT EXISTS idx_pedido_drive_folders_reconcile 
    ON public.pedido_drive_folders (organization_status, retry_count, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_pedido_drive_folders_claim 
    ON public.pedido_drive_folders (claim_token) WHERE claim_token IS NOT NULL;


-- 2. RPC de Reclamo Atómico de Carpeta (public.claim_pedido_drive_folder)
-- Garantiza exclusión mutua antes de cualquier llamada externa a Google Drive (files.create)
CREATE OR REPLACE FUNCTION public.claim_pedido_drive_folder(
    p_pedido_id uuid,
    p_folder_type text,
    p_folder_name text,
    p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_rec public.pedido_drive_folders%ROWTYPE;
    v_claim_token text;
    v_lease_interval interval := (GREATEST(COALESCE(p_lease_seconds, 60), 10) || ' seconds')::interval;
BEGIN
    IF p_pedido_id IS NULL OR p_folder_type IS NULL OR p_folder_type NOT IN ('solicitud', 'enviado') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENTS: pedido_id y folder_type válido (solicitud/enviado) son obligatorios' USING ERRCODE = '22023';
    END IF;

    -- Bloqueo pesimista por clave única (pedido_id, folder_type)
    SELECT * INTO v_rec
    FROM public.pedido_drive_folders
    WHERE pedido_id = p_pedido_id AND folder_type = p_folder_type
    FOR UPDATE;

    IF FOUND THEN
        -- A. Si ya está completada con drive_folder_id válido -> reutilizar de inmediato (idempotencia)
        IF v_rec.organization_status = 'completed' AND v_rec.drive_folder_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'completed',
                'drive_folder_id', v_rec.drive_folder_id,
                'folder_name', v_rec.folder_name,
                'id', v_rec.id
            );
        END IF;

        -- B. Si está en processing y el lease sigue vigente -> locked (otro worker está creando la carpeta)
        IF v_rec.organization_status = 'processing' AND v_rec.lease_expires_at IS NOT NULL AND v_rec.lease_expires_at > now() THEN
            RETURN jsonb_build_object(
                'status', 'locked',
                'lease_expires_at', v_rec.lease_expires_at,
                'message', 'Carpeta en proceso de resolución por otro worker',
                'folder_name', v_rec.folder_name
            );
        END IF;

        -- C. Si está fallida, pendiente o con lease expirado -> otorgar nuevo claim al worker actual
        v_claim_token := encode(gen_random_bytes(16), 'hex');
        
        UPDATE public.pedido_drive_folders
        SET organization_status = 'processing',
            claim_token = v_claim_token,
            claimed_at = now(),
            lease_expires_at = now() + v_lease_interval,
            retry_count = v_rec.retry_count + 1,
            folder_name = COALESCE(NULLIF(trim(p_folder_name), ''), v_rec.folder_name),
            last_error = NULL,
            updated_at = now()
        WHERE id = v_rec.id
        RETURNING * INTO v_rec;

        RETURN jsonb_build_object(
            'status', 'claimed',
            'claim_token', v_claim_token,
            'folder_name', v_rec.folder_name,
            'retry_count', v_rec.retry_count,
            'lease_expires_at', v_rec.lease_expires_at,
            'id', v_rec.id
        );
    ELSE
        -- D. No existe registro previo -> crear nueva fila en estado processing con claim_token
        v_claim_token := encode(gen_random_bytes(16), 'hex');

        INSERT INTO public.pedido_drive_folders (
            pedido_id, folder_type, drive_folder_id, folder_name,
            organization_status, claim_token, claimed_at, lease_expires_at,
            retry_count, max_retries, last_error, created_at, updated_at
        ) VALUES (
            p_pedido_id, p_folder_type, NULL, p_folder_name,
            'processing', v_claim_token, now(), now() + v_lease_interval,
            1, 5, NULL, now(), now()
        )
        RETURNING * INTO v_rec;

        RETURN jsonb_build_object(
            'status', 'claimed',
            'claim_token', v_claim_token,
            'folder_name', v_rec.folder_name,
            'retry_count', 1,
            'lease_expires_at', v_rec.lease_expires_at,
            'id', v_rec.id
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pedido_drive_folder(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pedido_drive_folder(uuid, text, text, integer) TO service_role;


-- 3. RPC de Finalización Exitosa de Carpeta (public.complete_pedido_drive_folder)
CREATE OR REPLACE FUNCTION public.complete_pedido_drive_folder(
    p_pedido_id uuid,
    p_folder_type text,
    p_claim_token text,
    p_drive_folder_id text,
    p_folder_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_rec public.pedido_drive_folders%ROWTYPE;
BEGIN
    IF p_drive_folder_id IS NULL OR length(trim(p_drive_folder_id)) = 0 THEN
        RAISE EXCEPTION 'DRIVE_FOLDER_ID_REQUIRED: drive_folder_id no puede ser nulo o vacío para estado completed' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_rec
    FROM public.pedido_drive_folders
    WHERE pedido_id = p_pedido_id AND folder_type = p_folder_type
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FOLDER_RECORD_NOT_FOUND: No existe registro para pedido % y tipo %', p_pedido_id, p_folder_type USING ERRCODE = 'P0002';
    END IF;

    -- Si ya estaba completada con el mismo drive_folder_id -> respuesta idempotente
    IF v_rec.organization_status = 'completed' AND v_rec.drive_folder_id = p_drive_folder_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'completed',
            'drive_folder_id', v_rec.drive_folder_id,
            'idempotent', true
        );
    END IF;

    -- Validar que el worker posea el claim_token activo
    IF v_rec.claim_token IS NULL OR v_rec.claim_token <> p_claim_token THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CLAIM_MISMATCH_OR_EXPIRED',
            'message', 'El token de reclamo no coincide o ha expirado por lease timeout'
        );
    END IF;

    UPDATE public.pedido_drive_folders
    SET organization_status = 'completed',
        drive_folder_id = p_drive_folder_id,
        folder_name = COALESCE(NULLIF(trim(p_folder_name), ''), v_rec.folder_name),
        claim_token = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'drive_folder_id', v_rec.drive_folder_id,
        'folder_name', v_rec.folder_name,
        'id', v_rec.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pedido_drive_folder(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pedido_drive_folder(uuid, text, text, text, text) TO service_role;


-- 4. RPC de Registro de Fallo en Carpeta (public.fail_pedido_drive_folder)
CREATE OR REPLACE FUNCTION public.fail_pedido_drive_folder(
    p_pedido_id uuid,
    p_folder_type text,
    p_claim_token text,
    p_last_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_rec public.pedido_drive_folders%ROWTYPE;
BEGIN
    SELECT * INTO v_rec
    FROM public.pedido_drive_folders
    WHERE pedido_id = p_pedido_id AND folder_type = p_folder_type
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'FOLDER_RECORD_NOT_FOUND');
    END IF;

    -- Si ya estaba completed, no permitir degradar a failed por respuesta tardía de error
    IF v_rec.organization_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_COMPLETED');
    END IF;

    -- Permitir asentar fallo si coincide el claim o si no hay claim activo
    IF v_rec.claim_token IS NOT NULL AND p_claim_token IS NOT NULL AND v_rec.claim_token <> p_claim_token THEN
        RETURN jsonb_build_object('success', false, 'error', 'CLAIM_MISMATCH');
    END IF;

    UPDATE public.pedido_drive_folders
    SET organization_status = 'failed',
        drive_folder_id = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL,
        last_error = p_last_error,
        updated_at = now()
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'failed',
        'retry_count', v_rec.retry_count,
        'last_error', v_rec.last_error
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fail_pedido_drive_folder(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_pedido_drive_folder(uuid, text, text, text) TO service_role;


-- 5. RPC para Recuperación y Barrido Automático de Carpetas Fallidas
CREATE OR REPLACE FUNCTION public.reconcile_fetch_failed_drive_folders(
    p_max_retries integer DEFAULT 5,
    p_limit integer DEFAULT 10,
    p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_items jsonb := '[]'::jsonb;
    v_row RECORD;
    v_claim_token text;
    v_lease_interval interval := (GREATEST(COALESCE(p_lease_seconds, 120), 10) || ' seconds')::interval;
BEGIN
    FOR v_row IN
        SELECT f.id, f.pedido_id, f.folder_type, f.folder_name, f.retry_count, p.pedido_visible
        FROM public.pedido_drive_folders f
        JOIN public.pedidos p ON f.pedido_id = p.id
        WHERE (
            f.organization_status = 'failed' OR
            (f.organization_status = 'processing' AND f.lease_expires_at < now())
        )
        AND f.retry_count < COALESCE(p_max_retries, 5)
        ORDER BY f.updated_at ASC
        LIMIT COALESCE(p_limit, 10)
        FOR UPDATE OF f SKIP LOCKED
    LOOP
        v_claim_token := encode(gen_random_bytes(16), 'hex');

        UPDATE public.pedido_drive_folders
        SET organization_status = 'processing',
            claim_token = v_claim_token,
            claimed_at = now(),
            lease_expires_at = now() + v_lease_interval,
            retry_count = retry_count + 1,
            updated_at = now()
        WHERE id = v_row.id;

        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'id', v_row.id,
            'pedido_id', v_row.pedido_id,
            'pedido_visible', v_row.pedido_visible,
            'folder_type', v_row.folder_type,
            'folder_name', v_row.folder_name,
            'claim_token', v_claim_token,
            'retry_count', v_row.retry_count + 1
        ));
    END LOOP;

    RETURN jsonb_build_object('success', true, 'claimed_count', jsonb_array_length(v_items), 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_fetch_failed_drive_folders(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_fetch_failed_drive_folders(integer, integer, integer) TO service_role;


-- 6. Actualización de public.submission_create_core
-- Alineando límites canónicos del solicitante: Máx 5 archivos y Máx 25 MB (26,214,400 bytes)
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

    -- Validar file_bindings (Límite canónico: Máximo 5 archivos por presentación)
    IF p_payload ? 'file_bindings' AND jsonb_typeof(p_payload->'file_bindings') = 'array' THEN
        v_files_json := p_payload->'file_bindings';
        v_files_count := jsonb_array_length(v_files_json);
        IF v_files_count > 5 THEN
            RAISE EXCEPTION 'MAX_FILES_EXCEEDED: Se permite un máximo de 5 archivos por envío (recibidos: %)', v_files_count USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 2. Bloqueo Transaccional por submission_key
    PERFORM pg_advisory_xact_lock(hashtext('submission_key:' || v_submission_key::text));

    -- 3. Calcular Fingerprint Canónico Server-Side
    v_fingerprint := private.compute_submission_fingerprint(p_payload);

    -- 4. Comprobar Idempotencia / Replay
    SELECT id, request_fingerprint INTO v_existing_id, v_existing_fp
    FROM public.envios_formulario
    WHERE submission_key = v_submission_key;

    IF FOUND THEN
        IF v_existing_fp <> v_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: submission_key ya utilizada con contenido diferente' USING ERRCODE = '40001';
        END IF;

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
        )
        INTO v_replay_pedidos
        FROM public.pedidos p
        JOIN public.categorias_servicio c ON p.categoria_id = c.id
        LEFT JOIN public.tipos_servicio t ON p.tipo_servicio_id = t.id
        WHERE p.envio_id = v_existing_id;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'client_file_ref', r.client_file_ref,
                'nombre_original', a.nombre_original,
                'mime_type', a.mime_type,
                'size_bytes', a.size_bytes
            )
        ), '[]'::jsonb)
        INTO v_replay_files
        FROM public.upload_reservations r
        JOIN public.archivos a ON a.id = r.archivo_id
        WHERE r.envio_id = v_existing_id;

        RETURN jsonb_build_object(
            'envio_id', v_existing_id,
            'idempotent_replay', true,
            'pedidos', COALESCE(v_replay_pedidos, '[]'::jsonb),
            'archivos', v_replay_files
        );
    END IF;

    -- 5. Validar Sesión de Subida si viene vinculada
    IF p_payload ? 'session_id' AND p_payload->>'session_id' IS NOT NULL AND length(trim(p_payload->>'session_id')) > 0 THEN
        BEGIN
            v_session_id := (p_payload->>'session_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'session_id debe ser un UUID válido' USING ERRCODE = '22023';
        END;

        SELECT estado, expires_at INTO v_session_estado, v_session_expires
        FROM public.submission_sessions
        WHERE id = v_session_id AND submission_key = v_submission_key;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SESSION_NOT_FOUND: No existe sesión para este submission_key' USING ERRCODE = '22023';
        END IF;

        IF v_session_estado <> 'abierta' OR now() > v_session_expires THEN
            RAISE EXCEPTION 'SESSION_EXPIRED: La sesión de subida ha expirado o ya fue confirmada' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 6. Pre-validación de Archivos (Reservas, MIME y Límite de 25 MB)
    IF v_files_count > 0 THEN
        FOR v_file_elem IN SELECT * FROM jsonb_array_elements(v_files_json)
        LOOP
            IF NOT (v_file_elem ? 'client_file_ref') THEN
                RAISE EXCEPTION 'Cada elemento de file_bindings debe incluir client_file_ref' USING ERRCODE = '22023';
            END IF;

            BEGIN
                v_client_file_ref := (v_file_elem->>'client_file_ref')::uuid;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'client_file_ref debe ser un UUID válido' USING ERRCODE = '22023';
            END;

            IF v_client_file_ref = ANY(v_seen_file_refs) THEN
                RAISE EXCEPTION 'DUPLICATE_FILE_REF: client_file_ref duplicado en el envío: %', v_client_file_ref USING ERRCODE = '22023';
            END IF;
            v_seen_file_refs := array_append(v_seen_file_refs, v_client_file_ref);

            SELECT r.id, r.archivo_id, a.drive_file_id, a.size_bytes, a.mime_type, a.nombre_original, a.estado
            INTO v_res_id, v_arch_id, v_drive_id, v_file_size, v_file_mime, v_file_name, v_arch_estado
            FROM public.upload_reservations r
            JOIN public.archivos a ON a.id = r.archivo_id
            WHERE r.client_file_ref = v_client_file_ref
              AND (v_session_id IS NULL OR r.session_id = v_session_id);

            IF NOT FOUND THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % no posee reserva verificada en almacenamiento', v_client_file_ref USING ERRCODE = '55000';
            END IF;

            IF v_arch_estado <> 'verified' OR v_drive_id IS NULL OR length(trim(v_drive_id)) < 1 THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo % no ha sido verificado en almacenamiento', v_client_file_ref USING ERRCODE = '55000';
            END IF;

            -- Invariante de tamaño máximo contractual: 25 MB (26214400 bytes)
            IF v_file_size > 26214400 THEN
                RAISE EXCEPTION 'FILE_SIZE_EXCEEDED: El archivo % excede el límite máximo de 25 MB (% bytes)', v_file_name, v_file_size USING ERRCODE = '22023';
            END IF;

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

    -- 7. Creación de Envío
    v_envio_id := gen_random_uuid();

    INSERT INTO public.envios_formulario (
        id,
        submission_key,
        ip_address,
        user_agent,
        nombre_apellido,
        telefono,
        correo,
        area_solicitante,
        request_fingerprint,
        form_schema_version,
        created_at
    ) VALUES (
        v_envio_id,
        v_submission_key,
        COALESCE(p_payload->>'ip_address', '127.0.0.1'),
        COALESCE(p_payload->>'user_agent', 'Client-Web'),
        v_nombre_apellido,
        v_telefono,
        v_correo,
        v_area_solicitante,
        v_fingerprint,
        3,
        now()
    );

    v_year := date_part('year', CURRENT_DATE)::integer;

    -- 8. Iterar y Crear Pedidos
    FOR i IN 0..(v_ped_count - 1)
    LOOP
        v_elem := v_pedidos_json->i;

        IF NOT (v_elem ? 'client_request_ref') THEN
            RAISE EXCEPTION 'Cada elemento en pedidos debe incluir client_request_ref' USING ERRCODE = '22023';
        END IF;

        BEGIN
            v_client_ref := (v_elem->>'client_request_ref')::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'client_request_ref debe ser un UUID válido' USING ERRCODE = '22023';
        END;

        IF v_ref_to_id ? v_client_ref::text THEN
            RAISE EXCEPTION 'client_request_ref duplicado dentro de la misma presentación: %', v_client_ref USING ERRCODE = '22023';
        END IF;

        v_cat_slug := trim(COALESCE(v_elem->>'categoria_slug', ''));
        IF length(v_cat_slug) < 1 THEN
            RAISE EXCEPTION 'categoria_slug es obligatoria' USING ERRCODE = '22023';
        END IF;

        v_tipo_slug := trim(COALESCE(v_elem->>'tipo_slug', ''));
        IF length(v_tipo_slug) < 1 THEN
            RAISE EXCEPTION 'tipo_slug es obligatoria' USING ERRCODE = '22023';
        END IF;

        v_info_esp := v_elem->'informacion_especifica';
        IF v_info_esp IS NULL OR jsonb_typeof(v_info_esp) <> 'object' THEN
            RAISE EXCEPTION 'informacion_especifica es obligatoria y debe ser un objeto JSON' USING ERRCODE = '22023';
        END IF;

        v_fecha_limite_raw := trim(COALESCE(v_elem->>'fecha_limite', ''));
        IF length(v_fecha_limite_raw) > 0 THEN
            BEGIN
                v_fecha_limite := v_fecha_limite_raw::date;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'fecha_limite inválida: %', v_fecha_limite_raw USING ERRCODE = '22007';
            END;

            IF v_fecha_limite < (CURRENT_DATE + 1) THEN
                RAISE EXCEPTION 'FECHA_LIMITE_INVALIDA: La fecha límite (%) debe ser posterior a hoy (%)', v_fecha_limite, CURRENT_DATE USING ERRCODE = '22023';
            END IF;
        ELSE
            v_fecha_limite := NULL;
        END IF;

        SELECT id, codigo INTO v_cat_id, v_codigo_cat
        FROM public.categorias_servicio
        WHERE slug = v_cat_slug AND activo = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CATEGORIA_INVALIDA: Categoría inactiva o inexistente: %', v_cat_slug USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_tipo_id
        FROM public.tipos_servicio
        WHERE slug = v_tipo_slug AND categoria_id = v_cat_id AND activo = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TIPO_SERVICIO_INVALIDO: Tipo de servicio inactivo o no pertenece a la categoría: %', v_tipo_slug USING ERRCODE = '22023';
        END IF;

        v_current_num := private.get_next_pedido_number(v_year);
        v_pedido_visible := 'PED-' || v_year::text || '-' || lpad(v_current_num::text, 7, '0');

        v_raw_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

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

    -- 9. Procesar enlaces_material
    IF p_payload ? 'material_links' AND jsonb_typeof(p_payload->'material_links') = 'array' THEN
        FOR v_link_elem IN SELECT * FROM jsonb_array_elements(p_payload->'material_links')
        LOOP
            v_link_url := trim(COALESCE(v_link_elem->>'url', ''));
            v_link_desc := NULLIF(trim(COALESCE(v_link_elem->>'descripcion', '')), '');
            v_link_targets := v_link_elem->'targets';

            IF v_link_url = '' OR v_link_url !~* '^https?://.+' THEN
                RAISE EXCEPTION 'URL de enlace de material inválida: %', v_link_url USING ERRCODE = '22023';
            END IF;

            v_link_id := gen_random_uuid();
            INSERT INTO public.enlaces_material (id, url, descripcion, created_at)
            VALUES (v_link_id, v_link_url, v_link_desc, now());
            v_links_count := v_links_count + 1;

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

    -- 10. Procesar file_bindings, vincular a pedidos (archivo_pedido) y consumir reservas
    IF v_files_count > 0 THEN
        FOR v_file_elem IN SELECT * FROM jsonb_array_elements(v_files_json)
        LOOP
            v_client_file_ref := (v_file_elem->>'client_file_ref')::uuid;
            v_file_targets := v_file_elem->'targets';

            SELECT r.id, r.archivo_id, a.drive_file_id, a.nombre_original, a.mime_type, a.size_bytes
            INTO v_res_id, v_arch_id, v_drive_id, v_file_name, v_file_mime, v_file_size
            FROM public.upload_reservations r
            JOIN public.archivos a ON a.id = r.archivo_id
            WHERE r.client_file_ref = v_client_file_ref
              AND (v_session_id IS NULL OR r.session_id = v_session_id);

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

    -- 11. Confirmar Sesión de Envío si existe
    IF v_session_id IS NOT NULL THEN
        UPDATE public.submission_sessions
        SET estado = 'confirmada',
            envio_id = v_envio_id
        WHERE id = v_session_id;
    END IF;

    -- 12. Registrar Exactamente 1 Evento de Dominio submission.created
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

    -- 13. Registrar Entrada en audit_log
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
