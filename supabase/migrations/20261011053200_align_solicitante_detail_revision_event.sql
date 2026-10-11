-- =============================================================================
-- Migration: 20261011053200_align_solicitante_detail_revision_event.sql
-- Description:
-- Alinea solicitante_get_pedido_detail para soportar tanto 'pedido.revision_solicitada'
-- (nombre canónico de evento de dominio de la plataforma) como 'pedido.revision_requested'
-- en la proyección del historial amigable para el solicitante.
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
    v_nota_final jsonb := NULL;
    v_historial jsonb := '[]'::jsonb;
    v_revision_activa jsonb := NULL;
    v_revisiones_historial jsonb := '[]'::jsonb;
BEGIN
    -- 1. Validar sesión activa del solicitante
    v_session_email := private.validate_solicitante_session(p_session_token);

    -- 2. Localizar el pedido verificando pertenencia estricta por correo y origen público
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
      AND lower(trim(ef.correo)) = v_session_email
      AND p.origen = 'publico';

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado o no autorizado para esta sesión' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Solicitudes de información (proyección limpia para el solicitante)
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_solicitudes
    FROM (
        SELECT jsonb_build_object(
            'id', si.id,
            'mensaje', si.mensaje,
            'estado', si.estado,
            'expires_at', si.expires_at,
            'created_at', si.created_at,
            'respuesta_texto', si.respuesta_texto,
            'responded_at', si.responded_at,
            'archivos_respuesta', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', a.id,
                    'nombre_original', a.nombre_original,
                    'size_bytes', a.size_bytes,
                    'mime_type', a.mime_type
                ))
                FROM public.archivo_solicitud_informacion asi
                JOIN public.archivos a ON asi.archivo_id = a.id
                WHERE asi.solicitud_informacion_id = si.id
            ), '[]'::jsonb),
            'enlaces_respuesta', COALESCE((
                SELECT jsonb_agg(em.url)
                FROM public.enlace_solicitud_informacion esi
                JOIN public.enlaces_material em ON esi.enlace_id = em.id
                WHERE esi.solicitud_informacion_id = si.id
            ), '[]'::jsonb)
        ) AS item
        FROM public.solicitudes_informacion si
        WHERE si.pedido_id = v_ped.id
    ) t;

    -- 4. Notas públicas (estrictamente 'solicitante' o 'para_solicitante', JAMÁS 'interna')
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_notas
    FROM (
        SELECT jsonb_build_object(
            'id', np.id,
            'texto', np.texto,
            'created_at', np.created_at
        ) AS item
        FROM public.notas_pedido np
        WHERE np.pedido_id = v_ped.id
          AND np.visibilidad IN ('solicitante', 'para_solicitante')
    ) t;

    -- 5. Entrega vigente (únicamente si existe material de entrega; no inventar objeto sintético)
    SELECT jsonb_build_object(
        'id', ep.id,
        'version', ep.version,
        'enlace_externo', ep.enlace_externo,
        'nota', ep.nota,
        'created_at', ep.created_at,
        'archivo', (
            SELECT jsonb_build_object(
                'id', a.id,
                'nombre_original', a.nombre_original,
                'size_bytes', a.size_bytes,
                'mime_type', a.mime_type
            )
            FROM public.archivos a
            WHERE a.id = ep.archivo_id
        ),
        'archivos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'nombre_original', a.nombre_original,
                'size_bytes', a.size_bytes,
                'mime_type', a.mime_type
            ))
            FROM public.entrega_archivos ea
            JOIN public.archivos a ON ea.archivo_id = a.id
            WHERE ea.entrega_id = ep.id
        ), '[]'::jsonb)
    )
    INTO v_entrega
    FROM public.entregas_pedido ep
    WHERE ep.pedido_id = v_ped.id 
      AND ep.es_vigente = true
      AND (
          ep.archivo_id IS NOT NULL 
          OR (ep.enlace_externo IS NOT NULL AND trim(ep.enlace_externo) <> '')
          OR EXISTS (SELECT 1 FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id)
      );

    -- 6. Nota final visible para el solicitante cuando el pedido está Finalizado
    IF v_ped.estado = 'Finalizado' THEN
        -- 6.1 Buscar nota explícita en el evento de dominio 'pedido.finalized'
        SELECT jsonb_build_object(
            'texto', trim(de.payload->>'nota'),
            'created_at', de.created_at
        )
        INTO v_nota_final
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name = 'pedido.finalized'
          AND de.payload->>'nota' IS NOT NULL
          AND trim(de.payload->>'nota') <> ''
        ORDER BY de.created_at DESC
        LIMIT 1;

        -- 6.2 Si no existe en el evento, buscar en la entrega vigente
        IF v_nota_final IS NULL THEN
            SELECT jsonb_build_object(
                'texto', trim(ep.nota),
                'created_at', ep.created_at
            )
            INTO v_nota_final
            FROM public.entregas_pedido ep
            WHERE ep.pedido_id = v_ped.id
              AND ep.es_vigente = true
              AND ep.nota IS NOT NULL
              AND trim(ep.nota) <> ''
            LIMIT 1;
        END IF;

        -- 6.3 Si aún no existe, buscar la última nota pública del pedido
        IF v_nota_final IS NULL THEN
            SELECT jsonb_build_object(
                'texto', trim(np.texto),
                'created_at', np.created_at
            )
            INTO v_nota_final
            FROM public.notas_pedido np
            WHERE np.pedido_id = v_ped.id
              AND np.visibilidad IN ('solicitante', 'para_solicitante')
              AND trim(np.texto) <> ''
            ORDER BY np.created_at DESC
            LIMIT 1;
        END IF;
    END IF;

    -- 7. Revisión activa
    SELECT jsonb_build_object(
        'id', rp.id,
        'revision_number', rp.revision_number,
        'motivo', rs.motivo,
        'estado', rp.estado,
        'created_at', rp.created_at
    )
    INTO v_revision_activa
    FROM public.revision_pedidos rp
    LEFT JOIN public.revision_solicitudes rs ON rp.revision_solicitud_id = rs.id
    WHERE rp.pedido_id = v_ped.id AND rp.estado IN ('abierta', 'en_tratamiento')
    ORDER BY rp.revision_number DESC
    LIMIT 1;

    -- 8. Historial de revisiones resueltas
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'revision_number')::int ASC), '[]'::jsonb)
    INTO v_revisiones_historial
    FROM (
        SELECT jsonb_build_object(
            'id', rp.id,
            'revision_number', rp.revision_number,
            'motivo', rs.motivo,
            'estado', rp.estado,
            'resolucion_notas', rp.resolucion_notas,
            'created_at', rp.created_at,
            'resolved_at', rp.resolved_at
        ) AS item
        FROM public.revision_pedidos rp
        LEFT JOIN public.revision_solicitudes rs ON rp.revision_solicitud_id = rs.id
        WHERE rp.pedido_id = v_ped.id AND rp.estado = 'resuelta'
    ) t;

    -- 9. Historial amigable server-side (DTO público limpio sin payloads crudos ni campos internos)
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'tipo', CASE de.event_name
                WHEN 'pedido.created' THEN 'created'
                WHEN 'pedido.info_requested' THEN 'info_requested'
                WHEN 'pedido.info_responded' THEN 'info_responded'
                WHEN 'pedido.finalized' THEN 'finalized'
                WHEN 'pedido.cancelled' THEN 'cancelled'
                WHEN 'pedido.revision_solicitada' THEN 'revision_requested'
                WHEN 'pedido.revision_requested' THEN 'revision_requested'
                ELSE replace(de.event_name, 'pedido.', '')
            END,
            'titulo', CASE de.event_name
                WHEN 'pedido.created' THEN 'Solicitud recibida'
                WHEN 'pedido.info_requested' THEN 'Se solicitó información adicional'
                WHEN 'pedido.info_responded' THEN 'Respondiste la información solicitada'
                WHEN 'pedido.finalized' THEN 'Pedido finalizado'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.revision_solicitada' THEN 'Solicitud de revisión ingresada'
                WHEN 'pedido.revision_requested' THEN 'Solicitud de revisión ingresada'
                ELSE 'Actualización de seguimiento'
            END,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Tu solicitud fue registrada en el sistema.'
                WHEN 'pedido.info_requested' THEN 'El equipo solicitó información complementaria para avanzar con el pedido.'
                WHEN 'pedido.info_responded' THEN 'Se enviaron las respuestas solicitadas por el equipo.'
                WHEN 'pedido.finalized' THEN 'El pedido fue completado y cerrado por el equipo.'
                WHEN 'pedido.cancelled' THEN 'El pedido fue cancelado.'
                WHEN 'pedido.revision_solicitada' THEN 'Se ingresó una solicitud de revisión sobre la entrega.'
                WHEN 'pedido.revision_requested' THEN 'Se ingresó una solicitud de revisión sobre la entrega.'
                ELSE 'Actualización registrada en el seguimiento del pedido.'
            END,
            'created_at', de.created_at
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created',
              'pedido.info_requested',
              'pedido.info_responded',
              'pedido.finalized',
              'pedido.cancelled',
              'pedido.revision_solicitada',
              'pedido.revision_requested'
          )
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'pedido', jsonb_build_object(
            'id', v_ped.id,
            'envio_id', v_ped.envio_id,
            'pedido_visible', v_ped.pedido_visible,
            'anio', v_ped.anio,
            'numero', v_ped.numero,
            'codigo_categoria', v_ped.codigo_categoria,
            'categoria_nombre', v_ped.categoria_nombre,
            'tipo_nombre', v_ped.tipo_nombre,
            'estado', v_ped.estado,
            'retrabajo_activo', v_ped.retrabajo_activo,
            'revision_count', v_ped.revision_count,
            'informacion_especifica', v_ped.informacion_especifica,
            'created_at', v_ped.created_at,
            'updated_at', v_ped.updated_at,
            'solicitante', jsonb_build_object(
                'nombre_apellido', v_ped.nombre_apellido,
                'area_solicitante', v_ped.area_solicitante,
                'correo', v_ped.correo,
                'telefono', v_ped.telefono
            )
        ),
        'solicitudes', v_solicitudes,
        'notas', v_notas,
        'entrega', v_entrega,
        'nota_final', v_nota_final,
        'historial', v_historial,
        'revision_activa', v_revision_activa,
        'revisiones_historial', v_revisiones_historial
    );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
