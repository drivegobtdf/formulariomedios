-- ==============================================================================
-- MIGRATION 067: Fix Purge Preview Auth Context for Edge Function Service Role
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- Actualizar RPC: admin_pedidos_purge_preview para permitir contexto service_role / p_actor
CREATE OR REPLACE FUNCTION public.admin_pedidos_purge_preview(
    p_pedido_ids uuid[],
    p_actor text DEFAULT 'administrador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_estado text;
    v_actor_display text;
    v_pedidos_count int := 0;
    v_pedidos_visibles jsonb := '[]'::jsonb;
    v_envio_ids uuid[] := ARRAY[]::uuid[];
    v_envios_afectados int := 0;
    v_entregas_count int := 0;
    v_revisiones_count int := 0;
    v_archivos_count int := 0;
    v_comunicaciones_count int := 0;
    v_drive_file_ids jsonb := '[]'::jsonb;
    v_drive_folder_ids jsonb := '[]'::jsonb;
BEGIN
    -- Validar autenticación si viene con contexto de usuario
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso, COALESCE(nombre || ' ' || apellido, nombre_usuario, p_actor)
        INTO v_role, v_estado, v_actor_display
        FROM public.usuarios_acceso
        WHERE user_id = v_user_id;

        IF v_role IS DISTINCT FROM 'administrador' OR v_estado IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'FORBIDDEN: Solo administradores aprobados pueden acceder al preview de purga' USING ERRCODE = '42501';
        END IF;
    ELSE
        v_actor_display := p_actor;
    END IF;

    IF p_pedido_ids IS NULL OR array_length(p_pedido_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
            'pedidos_count', 0,
            'pedidos_visibles', '[]'::jsonb,
            'envios_afectados', 0,
            'entregas_count', 0,
            'revisiones_count', 0,
            'archivos_count', 0,
            'comunicaciones_count', 0,
            'drive_files_count', 0,
            'drive_folders_count', 0,
            'drive_file_ids', '[]'::jsonb,
            'drive_folder_ids', '[]'::jsonb
        );
    END IF;

    -- 1. Contar pedidos y recolectar códigos visibles y envíos asociados
    SELECT 
        count(*),
        COALESCE(jsonb_agg(p.pedido_visible ORDER BY p.pedido_visible), '[]'::jsonb),
        COALESCE(array_agg(DISTINCT p.envio_id) FILTER (WHERE p.envio_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_pedidos_count, v_pedidos_visibles, v_envio_ids
    FROM public.pedidos p
    WHERE p.id = ANY(p_pedido_ids);

    -- 2. Envíos afectados (aquellos que quedarían sin ningún otro pedido)
    IF array_length(v_envio_ids, 1) > 0 THEN
        SELECT count(*)
        INTO v_envios_afectados
        FROM public.envios_formulario ef
        WHERE ef.id = ANY(v_envio_ids)
          AND NOT EXISTS (
              SELECT 1 FROM public.pedidos p2 
              WHERE p2.envio_id = ef.id AND NOT (p2.id = ANY(p_pedido_ids))
          );
    END IF;

    -- 3. Entregas
    SELECT count(*)
    INTO v_entregas_count
    FROM public.entregas_pedido ep
    WHERE ep.pedido_id = ANY(p_pedido_ids);

    -- 4. Revisiones
    SELECT count(*)
    INTO v_revisiones_count
    FROM public.revision_pedidos rp
    WHERE rp.pedido_id = ANY(p_pedido_ids);

    -- 5. Comunicaciones
    SELECT count(*)
    INTO v_comunicaciones_count
    FROM public.comunicaciones_pedido cp
    WHERE cp.pedido_id = ANY(p_pedido_ids);

    -- 6. Archivos y Google Drive Files
    WITH target_archivos AS (
        SELECT ap.archivo_id FROM public.archivo_pedido ap WHERE ap.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ea.archivo_id FROM public.entrega_archivos ea 
        JOIN public.entregas_pedido ep ON ea.entrega_id = ep.id 
        WHERE ep.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ep2.archivo_id FROM public.entregas_pedido ep2 
        WHERE ep2.pedido_id = ANY(p_pedido_ids) AND ep2.archivo_id IS NOT NULL
        UNION
        SELECT ra.archivo_id FROM public.revision_archivos ra 
        JOIN public.revision_solicitudes rs ON ra.revision_solicitud_id = rs.id 
        WHERE rs.envio_id = ANY(v_envio_ids)
        UNION
        SELECT asi.archivo_id FROM public.archivo_solicitud_informacion asi 
        JOIN public.solicitudes_informacion si ON asi.solicitud_informacion_id = si.id 
        WHERE si.pedido_id = ANY(p_pedido_ids)
    )
    SELECT 
        count(DISTINCT a.id),
        COALESCE(jsonb_agg(DISTINCT a.drive_file_id) FILTER (WHERE a.drive_file_id IS NOT NULL AND a.drive_file_id <> ''), '[]'::jsonb)
    INTO v_archivos_count, v_drive_file_ids
    FROM public.archivos a
    JOIN target_archivos ta ON a.id = ta.archivo_id;

    -- 7. Google Drive Folders
    SELECT COALESCE(jsonb_agg(DISTINCT pdf.drive_folder_id) FILTER (WHERE pdf.drive_folder_id IS NOT NULL AND pdf.drive_folder_id <> ''), '[]'::jsonb)
    INTO v_drive_folder_ids
    FROM public.pedido_drive_folders pdf
    WHERE pdf.pedido_id = ANY(p_pedido_ids);

    RETURN jsonb_build_object(
        'pedidos_count', v_pedidos_count,
        'pedidos_visibles', v_pedidos_visibles,
        'envios_afectados', v_envios_afectados,
        'entregas_count', v_entregas_count,
        'revisiones_count', v_revisiones_count,
        'archivos_count', v_archivos_count,
        'comunicaciones_count', v_comunicaciones_count,
        'drive_files_count', jsonb_array_length(v_drive_file_ids),
        'drive_folders_count', jsonb_array_length(v_drive_folder_ids),
        'drive_file_ids', v_drive_file_ids,
        'drive_folder_ids', v_drive_folder_ids
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) TO service_role;
