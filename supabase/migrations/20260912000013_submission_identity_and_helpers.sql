-- ==============================================================================
-- MIGRATION 013: Schema Identity & Submission Helpers
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Incorporar client_request_ref a pedidos con restricción UNIQUE compuesta
ALTER TABLE public.pedidos 
    ADD COLUMN client_request_ref uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.pedidos 
    ALTER COLUMN client_request_ref DROP DEFAULT;

ALTER TABLE public.pedidos 
    ADD CONSTRAINT uq_pedidos_envio_client_ref UNIQUE (envio_id, client_request_ref);

-- 2. Restricción de formato hexadecimal para request_fingerprint en envios_formulario
ALTER TABLE public.envios_formulario
    ADD CONSTRAINT check_envio_fingerprint_hex CHECK (request_fingerprint ~ '^[a-f0-9]{64}$');

-- -----------------------------------------------------------------------------
-- 3. Helper para Derivación de Año Calendario en Timezone Ushuaia
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.ped_calendar_year(p_timestamp timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXTRACT(YEAR FROM p_timestamp AT TIME ZONE 'America/Argentina/Ushuaia')::integer;
$$;

-- -----------------------------------------------------------------------------
-- 4. Helper para Reserva Atómica de Bloque de N Números de Secuencia
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reserve_ped_numbers(
    p_count integer,
    p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
    year integer,
    first_number integer,
    last_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_year integer;
    v_current bigint;
BEGIN
    IF p_count IS NULL OR p_count < 1 THEN
        RAISE EXCEPTION 'p_count debe ser mayor o igual a 1' USING ERRCODE = '22023';
    END IF;

    -- Derivar año calendario explícito de Tierra del Fuego (America/Argentina/Ushuaia)
    v_year := private.ped_calendar_year(p_now);

    -- Asegurar que existe fila en pedido_sequences para el año
    INSERT INTO public.pedido_sequences (anio, current_value)
    VALUES (v_year, 0)
    ON CONFLICT (anio) DO NOTHING;

    -- Bloquear la fila anual mediante SELECT ... FOR UPDATE dentro de la transacción
    SELECT current_value INTO v_current
    FROM public.pedido_sequences
    WHERE anio = v_year
    FOR UPDATE;

    IF v_current + p_count > 999999 THEN
        RAISE EXCEPTION 'SEQUENCE_EXHAUSTED: Se ha alcanzado el límite máximo anual de 999999 pedidos para el año %', v_year USING ERRCODE = '54000';
    END IF;

    UPDATE public.pedido_sequences
    SET current_value = v_current + p_count,
        updated_at = now()
    WHERE anio = v_year;

    RETURN QUERY SELECT v_year, (v_current + 1)::integer, (v_current + p_count)::integer;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Helper para Canonicalización y Cálculo de Fingerprint Canónico (SHA-256)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.compute_submission_fingerprint(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_schema_version integer;
    v_contacto jsonb;
    v_canonical_contacto jsonb;
    v_canonical_pedidos jsonb;
    v_canonical_links jsonb := '[]'::jsonb;
    v_canonical_files jsonb := '[]'::jsonb;
    v_all_refs text[];
    v_canonical_doc jsonb;
BEGIN
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Payload inválido: debe ser un objeto JSON' USING ERRCODE = '22023';
    END IF;

    v_schema_version := (p_payload->>'schema_version')::integer;
    IF v_schema_version IS NULL OR v_schema_version <> 3 THEN
        RAISE EXCEPTION 'CONTRACT_VERSION_UNSUPPORTED: Solo se soporta schema_version = 3' USING ERRCODE = '22023';
    END IF;

    v_contacto := p_payload->'contacto';
    IF v_contacto IS NULL OR jsonb_typeof(v_contacto) <> 'object' THEN
        RAISE EXCEPTION 'Contacto es obligatorio y debe ser un objeto JSON' USING ERRCODE = '22023';
    END IF;

    v_canonical_contacto := jsonb_build_object(
        'area_solicitante', trim(COALESCE(v_contacto->>'area_solicitante', '')),
        'correo', lower(trim(COALESCE(v_contacto->>'correo', ''))),
        'nombre_apellido', trim(COALESCE(v_contacto->>'nombre_apellido', '')),
        'telefono', trim(COALESCE(v_contacto->>'telefono', ''))
    );

    IF p_payload->'pedidos' IS NULL OR jsonb_typeof(p_payload->'pedidos') <> 'array' OR jsonb_array_length(p_payload->'pedidos') < 1 THEN
        RAISE EXCEPTION 'Debe incluir al menos un pedido en el envío' USING ERRCODE = '22023';
    END IF;

    -- Obtener lista ordenada de todos los client_request_ref
    SELECT array_agg(ref ORDER BY ref) INTO v_all_refs
    FROM (
        SELECT lower(trim(elem->>'client_request_ref')) AS ref
        FROM jsonb_array_elements(p_payload->'pedidos') AS elem
    ) t;

    -- Validar que no haya refs duplicadas
    IF (SELECT count(DISTINCT ref) FROM unnest(v_all_refs) AS ref) <> array_length(v_all_refs, 1) THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: client_request_ref duplicado dentro del envío' USING ERRCODE = '23505';
    END IF;

    -- Canonicalizar pedidos ordenados por client_request_ref
    SELECT jsonb_agg(
        jsonb_build_object(
            'categoria_slug', trim(elem->>'categoria_slug'),
            'client_request_ref', lower(trim(elem->>'client_request_ref')),
            'informacion_especifica', COALESCE(elem->'informacion_especifica', '{}'::jsonb),
            'tipo_slug', trim(elem->>'tipo_slug')
        )
        ORDER BY lower(trim(elem->>'client_request_ref'))
    )
    INTO v_canonical_pedidos
    FROM jsonb_array_elements(p_payload->'pedidos') AS elem;

    -- Canonicalizar material_links si existen
    IF p_payload ? 'material_links' AND jsonb_typeof(p_payload->'material_links') = 'array' AND jsonb_array_length(p_payload->'material_links') > 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'descripcion', NULLIF(trim(COALESCE(elem->>'descripcion', '')), ''),
                'targets', CASE
                    WHEN elem->>'targets' = 'all' THEN to_jsonb(v_all_refs)
                    WHEN jsonb_typeof(elem->'targets') = 'array' THEN (
                        SELECT jsonb_agg(lower(trim(t::text, '"')) ORDER BY lower(trim(t::text, '"')))
                        FROM jsonb_array_elements(elem->'targets') AS t
                    )
                    ELSE to_jsonb(v_all_refs)
                END,
                'url', trim(elem->>'url')
            )
            ORDER BY trim(elem->>'url')
        )
        INTO v_canonical_links
        FROM jsonb_array_elements(p_payload->'material_links') AS elem;
    END IF;

    -- Canonicalizar file_bindings si existen
    IF p_payload ? 'file_bindings' AND jsonb_typeof(p_payload->'file_bindings') = 'array' AND jsonb_array_length(p_payload->'file_bindings') > 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'expected_name', trim(elem->>'expected_name'),
                'expected_size', (elem->>'expected_size')::bigint,
                'mime_type', lower(trim(elem->>'mime_type')),
                'targets', CASE
                    WHEN elem->>'targets' = 'all' THEN to_jsonb(v_all_refs)
                    WHEN jsonb_typeof(elem->'targets') = 'array' THEN (
                        SELECT jsonb_agg(lower(trim(t::text, '"')) ORDER BY lower(trim(t::text, '"')))
                        FROM jsonb_array_elements(elem->'targets') AS t
                    )
                    ELSE to_jsonb(v_all_refs)
                END
            )
            ORDER BY trim(elem->>'expected_name'), lower(trim(elem->>'mime_type'))
        )
        INTO v_canonical_files
        FROM jsonb_array_elements(p_payload->'file_bindings') AS elem;
    END IF;

    -- Ensamblar objeto canónico
    v_canonical_doc := jsonb_build_object(
        'contacto', v_canonical_contacto,
        'file_bindings', v_canonical_files,
        'material_links', v_canonical_links,
        'pedidos', v_canonical_pedidos,
        'schema_version', 3
    );

    RETURN encode(digest(v_canonical_doc::text, 'sha256'), 'hex');
END;
$$;
