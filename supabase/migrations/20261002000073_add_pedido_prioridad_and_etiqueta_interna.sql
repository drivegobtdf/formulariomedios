-- =============================================================================
-- Migración: 20261002000073_add_pedido_prioridad_and_etiqueta_interna.sql
-- Propósito: Agregar metadatos internos (prioridad y etiqueta) a public.pedidos
--            y RPC segura con concurrencia optimista y control de acceso PoLP.
-- =============================================================================

-- 1. Agregar columnas aditivas backward-compatible (NULL por defecto, forward-only)
ALTER TABLE public.pedidos
    ADD COLUMN prioridad text NULL,
    ADD COLUMN etiqueta_interna text NULL;

-- 2. Constraints de validación forward-only (falla ante drift)
ALTER TABLE public.pedidos
    ADD CONSTRAINT check_pedidos_prioridad 
    CHECK (prioridad IS NULL OR prioridad IN ('alta', 'media', 'baja'));

ALTER TABLE public.pedidos
    ADD CONSTRAINT check_pedidos_etiqueta_interna 
    CHECK (etiqueta_interna IS NULL OR (char_length(etiqueta_interna) <= 10 AND char_length(trim(etiqueta_interna)) > 0));

-- 3. Documentación de columnas
COMMENT ON COLUMN public.pedidos.prioridad IS 'Prioridad operativa interna: alta, media, baja o null (sin prioridad).';
COMMENT ON COLUMN public.pedidos.etiqueta_interna IS 'Etiqueta de texto plano interna de hasta 10 caracteres o null.';

-- 4. RPC de mutación segura
CREATE OR REPLACE FUNCTION public.pedido_update_metadata(
    p_pedido_id uuid,
    p_expected_version bigint,
    p_prioridad text DEFAULT NULL,
    p_etiqueta_interna text DEFAULT NULL,
    p_update_prioridad boolean DEFAULT false,
    p_update_etiqueta boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_version bigint;
    v_current_estado text;
    v_current_archivado boolean;
    v_old_prioridad text;
    v_old_etiqueta text;
    v_target_prioridad text;
    v_target_etiqueta text;
    v_clean_prioridad text;
    v_clean_etiqueta text;
    v_new_version bigint;
BEGIN
    -- 1. Validar p_expected_version obligatorio (no NULL y >= 1)
    IF p_expected_version IS NULL OR p_expected_version < 1 THEN
        RAISE EXCEPTION 'INVALID_EXPECTED_VERSION: p_expected_version es obligatorio y debe ser >= 1' USING ERRCODE = '22000';
    END IF;

    -- 2. Exigir al menos un campo a actualizar de forma NULL-safe
    IF NOT COALESCE(p_update_prioridad, false) AND NOT COALESCE(p_update_etiqueta, false) THEN
        RAISE EXCEPTION 'NO_FIELDS_TO_UPDATE: Debe especificarse al menos un campo a actualizar' USING ERRCODE = '22000';
    END IF;

    -- 3. Validar autenticación y estado aprobado
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    -- 4. Validar rol operativo (administrador o equipo)
    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para modificar metadatos', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 5. Bloquear fila y verificar versión
    SELECT version, estado, archivado, prioridad, etiqueta_interna
    INTO v_current_version, v_current_estado, v_current_archivado, v_old_prioridad, v_old_etiqueta
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_version IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: La versión esperada % no coincide con la versión actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    -- 6. Validar estado terminal
    IF v_current_archivado OR v_current_estado IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'TERMINAL_STATE: No se pueden editar metadatos en un pedido en estado terminal (%) o archivado', v_current_estado USING ERRCODE = '22000';
    END IF;

    -- 7. Sanitizar y determinar valor objetivo de PRIORIDAD (NULL-safe)
    IF COALESCE(p_update_prioridad, false) THEN
        v_clean_prioridad := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_prioridad)), '');
        IF v_clean_prioridad IS NOT NULL AND v_clean_prioridad NOT IN ('alta', 'media', 'baja') THEN
            RAISE EXCEPTION 'INVALID_PRIORITY: La prioridad debe ser alta, media, baja o null' USING ERRCODE = '22000';
        END IF;
        v_target_prioridad := v_clean_prioridad;
    ELSE
        v_target_prioridad := v_old_prioridad;
    END IF;

    -- 8. Sanitizar y determinar valor objetivo de ETIQUETA INTERNA (NULL-safe)
    IF COALESCE(p_update_etiqueta, false) THEN
        v_clean_etiqueta := NULLIF(pg_catalog.btrim(p_etiqueta_interna), '');
        IF v_clean_etiqueta IS NOT NULL THEN
            IF pg_catalog.char_length(v_clean_etiqueta) > 10 THEN
                RAISE EXCEPTION 'INVALID_LABEL_LENGTH: La etiqueta interna no puede superar 10 caracteres' USING ERRCODE = '22000';
            END IF;
        END IF;
        v_target_etiqueta := v_clean_etiqueta;
    ELSE
        v_target_etiqueta := v_old_etiqueta;
    END IF;

    -- 9. Idempotencia: Si no hay cambios reales, retornar sin bump de versión ni auditoría
    IF (v_old_prioridad IS NOT DISTINCT FROM v_target_prioridad) AND (v_old_etiqueta IS NOT DISTINCT FROM v_target_etiqueta) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'pedido_id', p_pedido_id,
            'prioridad', v_target_prioridad,
            'etiqueta_interna', v_target_etiqueta,
            'version', v_current_version,
            'updated', false
        );
    END IF;

    v_new_version := v_current_version + 1;

    -- 10. Actualización atómica
    UPDATE public.pedidos
    SET prioridad = v_target_prioridad,
        etiqueta_interna = v_target_etiqueta,
        version = v_new_version,
        updated_at = pg_catalog.now()
    WHERE id = p_pedido_id;

    -- 11. Registro en audit_log usando defaults (gen_random_uuid() y now())
    INSERT INTO public.audit_log (
        actor_user_id,
        recurso_tipo,
        recurso_id,
        accion,
        metadata
    ) VALUES (
        v_actor_id,
        'pedidos',
        p_pedido_id::text,
        'update_metadata',
        pg_catalog.jsonb_build_object(
            'pedido_id', p_pedido_id,
            'prioridad_anterior', v_old_prioridad,
            'prioridad_nueva', v_target_prioridad,
            'etiqueta_anterior', v_old_etiqueta,
            'etiqueta_nueva', v_target_etiqueta,
            'version', v_new_version
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'prioridad', v_target_prioridad,
        'etiqueta_interna', v_target_etiqueta,
        'version', v_new_version,
        'updated', true
    );
END;
$$;

-- 5. Privilegios PoLP
REVOKE ALL ON FUNCTION public.pedido_update_metadata(uuid, bigint, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_update_metadata(uuid, bigint, text, text, boolean, boolean) TO authenticated;
