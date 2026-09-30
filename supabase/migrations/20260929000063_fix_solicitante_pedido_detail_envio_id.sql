-- =============================================================================
-- Migration: 20260929000063_fix_solicitante_pedido_detail_envio_id.sql
-- Description:
-- 1. Incluye 'envio_id' en la proyección de 'public.solicitante_get_pedido_detail'
--    para permitir la correcta resolución de adjuntos y subidas de revisión.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.solicitante_get_pedido_detail(
    p_session_token text,
    p_pedido_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_session_email text;
    v_ped RECORD;
    v_solicitudes jsonb := '[]'::jsonb;
    v_notas jsonb := '[]'::jsonb;
    v_entrega jsonb := NULL;
    v_historial jsonb := '[]'::jsonb;
    v_archivos_iniciales jsonb := '[]'::jsonb;
BEGIN
    -- 1. Validar sesión activa del solicitante mediante helper canónico
    v_session_email := private.validate_solicitante_session(p_session_token);

    -- 2. Localizar el pedido verificando pertenencia estricta por correo
    SELECT 
        p.id,
        p.envio_id,
        p.pedido_visible,
        p.anio,
        p.numero,
        p.codigo_categoria,
        cs.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        p.estado,
        p.retrabajo_activo,
        p.revision_count,
        p.informacion_especifica,
        p.archivado,
        p.created_at,
        p.updated_at,
        ef.nombre_apellido,
        ef.area_solicitante,
        ef.correo,
        ef.telefono
    INTO v_ped
    FROM public.pedidos p
    JOIN public.envios_formulario ef ON p.envio_id = ef.id
    LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    WHERE (p.id::text = p_pedido_ref OR p.pedido_visible = p_pedido_ref)
      AND ef.correo = v_session_email;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado o no autorizado para esta sesión' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Solicitudes de Información Públicas
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
            'created_at', si.created_at,
            'archivos_respuesta', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'nombre_original', a.nombre_original,
                    'size_bytes', a.size_bytes,
                    'mime_type', a.mime_type
                ))
                FROM public.archivo_solicitud_informacion asi
                JOIN public.archivos a ON asi.archivo_id = a.id
                WHERE asi.solicitud_informacion_id = si.id
            ), '[]'::jsonb),
            'enlaces_respuesta', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', em.url,
                    'descripcion', em.descripcion
                ))
                FROM public.enlace_solicitud_informacion esi
                JOIN public.enlaces_material em ON esi.enlace_id = em.id
                WHERE esi.solicitud_informacion_id = si.id
            ), '[]'::jsonb)
        ) AS item
        FROM public.solicitudes_informacion si
        WHERE si.pedido_id = v_ped.id
    ) t;

    -- 4. Notas públicas dirigidas al solicitante
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_notas
    FROM (
        SELECT jsonb_build_object(
            'id', n.id,
            'mensaje', n.texto,
            'created_at', n.created_at
        ) AS item
        FROM public.notas_pedido n
        WHERE n.pedido_id = v_ped.id AND n.visibilidad = 'solicitante'
    ) t;

    -- 5. Entrega vigente con archivos normalizados y fallback
    SELECT jsonb_build_object(
        'version', ep.version,
        'url_entrega', ep.enlace_externo,
        'nota', ep.nota,
        'created_at', ep.created_at,
        'archivos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'nombre_original', a.nombre_original,
                'size_bytes', a.size_bytes,
                'mime_type', a.mime_type,
                'created_at', a.created_at
            ) ORDER BY a.created_at ASC)
            FROM public.entrega_archivos ea
            JOIN public.archivos a ON ea.archivo_id = a.id
            WHERE ea.entrega_id = ep.id
        ), CASE 
            WHEN ep.archivo_id IS NOT NULL THEN (
                SELECT jsonb_build_array(jsonb_build_object(
                    'id', a2.id,
                    'nombre_original', a2.nombre_original,
                    'size_bytes', a2.size_bytes,
                    'mime_type', a2.mime_type,
                    'created_at', a2.created_at
                ))
                FROM public.archivos a2
                WHERE a2.id = ep.archivo_id
            )
            ELSE '[]'::jsonb
        END)
    )
    INTO v_entrega
    FROM public.entregas_pedido ep
    WHERE ep.pedido_id = v_ped.id AND ep.es_vigente = true;

    -- 6. Proyección de Historial / Timeline Público Normalizado
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido ingresado'
                WHEN 'pedido.assigned' THEN 'Pedido asignado'
                WHEN 'pedido.state_changed' THEN concat('Estado: ', COALESCE(de.payload->>'estado_nuevo', 'En proceso'))
                WHEN 'info_request.created' THEN 'Solicitud de información'
                WHEN 'info_request.responded' THEN 'Información complementaria recibida'
                WHEN 'pedido.finalized' THEN 'Trabajo finalizado'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.reopened' THEN 'Pedido reabierto'
                WHEN 'pedido.revision_solicitada' THEN 'Revisión solicitada'
                ELSE de.event_name
            END,
            'fecha', de.created_at,
            'created_at', de.created_at,
            'occurred_at', de.created_at,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido ingresado y registrado en el sistema'
                WHEN 'pedido.assigned' THEN 'Pedido asignado al equipo técnico para su tratamiento'
                WHEN 'pedido.state_changed' THEN concat('Estado actualizado a: ', COALESCE(de.payload->>'estado_nuevo', 'En proceso'))
                WHEN 'info_request.created' THEN 'Se emitió una solicitud de información complementaria'
                WHEN 'info_request.responded' THEN 'Respuesta de información complementaria recibida'
                WHEN 'pedido.finalized' THEN 'Trabajo finalizado y entrega de materiales disponible'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.reopened' THEN 'Pedido reabierto para revisión'
                WHEN 'pedido.revision_solicitada' THEN concat('Solicitud de revisión enviada: ', COALESCE(de.payload->>'motivo', 'Ajustes solicitados'))
                ELSE 'Actualización de seguimiento'
            END,
            'detalle', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido ingresado y registrado en el sistema'
                WHEN 'pedido.assigned' THEN 'Pedido asignado al equipo técnico para su tratamiento'
                WHEN 'pedido.state_changed' THEN concat('Estado actualizado a: ', COALESCE(de.payload->>'estado_nuevo', 'En proceso'))
                WHEN 'info_request.created' THEN 'Se emitió una solicitud de información complementaria'
                WHEN 'info_request.responded' THEN 'Respuesta de información complementaria recibida'
                WHEN 'pedido.finalized' THEN 'Trabajo finalizado y entrega de materiales disponible'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.reopened' THEN 'Pedido reabierto para revisión'
                WHEN 'pedido.revision_solicitada' THEN concat('Solicitud de revisión enviada: ', COALESCE(de.payload->>'motivo', 'Ajustes solicitados'))
                ELSE 'Actualización de seguimiento'
            END
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created', 'pedido.assigned', 'pedido.state_changed',
              'info_request.created', 'info_request.responded',
              'pedido.finalized', 'pedido.cancelled', 'pedido.reopened',
              'pedido.revision_solicitada'
          )
    ) t;

    -- 7. Archivos iniciales del solicitante
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
        'envio_id', v_ped.envio_id,
        'pedido_visible', v_ped.pedido_visible,
        'anio', v_ped.anio,
        'numero', v_ped.numero,
        'codigo_categoria', v_ped.codigo_categoria,
        'categoria_nombre', v_ped.categoria_nombre,
        'tipo_nombre', v_ped.tipo_nombre,
        'estado', v_ped.estado,
        'retrabajo_activo', COALESCE(v_ped.retrabajo_activo, false),
        'revision_count', COALESCE(v_ped.revision_count, 0),
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
        'solicitudes', v_solicitudes,
        'notas', v_notas,
        'entrega', v_entrega,
        'historial', v_historial,
        'timeline_publico', v_historial,
        'archivos_iniciales', v_archivos_iniciales
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;

-- 2. Notificar a PostgREST para recargar el esquema inmediatamente
NOTIFY pgrst, 'reload schema';
