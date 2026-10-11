-- =============================================================================
-- FASE B.3.2: CIERRE DE NUMERACIÓN TÉCNICA NEUTRAL Y COLOR INTERNO
-- =============================================================================
-- 1. Actualización de pedido_create_internal:
--    Cuando categoria_id IS NULL, se asigna codigo_categoria = 'X' (Sin categoría /
--    Sin clasificar) para satisfacer el constraint de formato PED-YYYY-XNNNNNN.
--    X es puramente un requisito técnico del correlativo visible y no representa origen.
--    El origen canónico se preserva exclusivamente en pedidos.origen = 'interno'.
-- 2. Migración de pedidos internos existentes sin categoría que tenían 'I'.
-- =============================================================================

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

    -- 4. Validación de campos obligatorios
    v_titulo_clean := trim(COALESCE(p_titulo, ''));
    IF char_length(v_titulo_clean) < 3 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED: El título del pedido es obligatorio y debe tener al menos 3 caracteres' USING ERRCODE = '42200';
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
    -- Si se selecciona categoría, se toma su código oficial existente (ej. D -> PED-YYYY-D...).
    -- Si NO se selecciona categoría, categoria_id permanece NULL y se asigna el código neutral 'X'.
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
        'contacto_correo', NULLIF(trim(COALESCE(p_solicitante_correo, '')), ''),
        'contacto_telefono', NULLIF(trim(COALESCE(p_solicitante_telefono, '')), ''),
        'solicitante', jsonb_build_object(
            'nombre', NULLIF(trim(COALESCE(p_solicitante_nombre, '')), ''),
            'area', NULLIF(trim(COALESCE(p_solicitante_area, '')), ''),
            'correo', NULLIF(trim(COALESCE(p_solicitante_correo, '')), ''),
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

-- Permisos canónicos
REVOKE ALL ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) TO authenticated, service_role;

-- 2. Migración de pedidos internos existentes sin categoría que tenían 'I' a 'X'
UPDATE public.pedidos
SET codigo_categoria = 'X',
    pedido_visible = regexp_replace(pedido_visible, '^PED-([0-9]{4})-I([0-9]{6})$', 'PED-\1-X\2')
WHERE origen = 'interno' AND categoria_id IS NULL AND codigo_categoria = 'I';
