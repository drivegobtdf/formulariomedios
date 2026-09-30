-- =============================================================================
-- Migration: 20260929000062_fix_pedido_request_revision_and_timeline.sql
-- Description:
-- 1. Elimina referencia a tabla inexistente 'public.historial_pedidos' en 'public.pedido_request_revision'.
-- 2. Normaliza la proyección del timeline público e historial en 'public.solicitante_get_pedido_detail'
--    incluyendo occurred_at, created_at, fecha y descripcion para evitar 'Invalid Date' en UI.
-- 3. Incluye evento 'pedido.revision_solicitada' en la bitácora pública del solicitante.
-- =============================================================================

-- ============================================================================
-- 1. RPC CANÓNICA: public.pedido_request_revision
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pedido_request_revision(
    p_session_token text,
    p_pedido_id uuid,
    p_motivo text,
    p_archivos_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_session_email text;
    v_pedido RECORD;
    v_clean_motivo text;
    v_revision_solicitud_id uuid;
    v_archivos_count integer := 0;
    v_arch_id uuid;
    v_arch_estado text;
    v_rev_num integer;
    v_entrega RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
BEGIN
    -- 1. Validar sesión del solicitante
    IF p_session_token IS NULL OR trim(p_session_token) = '' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Token de sesión de solicitante requerido' USING ERRCODE = '42501';
    END IF;

    v_session_email := private.validate_solicitante_session(p_session_token);

    -- 2. Validar motivo
    v_clean_motivo := trim(COALESCE(p_motivo, ''));
    IF length(v_clean_motivo) < 10 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: El motivo de revisión debe contener al menos 10 caracteres' USING ERRCODE = '42200';
    END IF;

    -- 3. Validar archivos adjuntos opcionales (máx 5)
    IF p_archivos_ids IS NOT NULL THEN
        v_archivos_count := cardinality(p_archivos_ids);
        IF v_archivos_count > 5 THEN
            RAISE EXCEPTION 'LIMIT_EXCEEDED: No se pueden adjuntar más de 5 archivos a la solicitud de revisión' USING ERRCODE = '42200';
        END IF;

        IF v_archivos_count > 0 THEN
            FOREACH v_arch_id IN ARRAY p_archivos_ids LOOP
                SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
                IF v_arch_estado IS NULL THEN
                    RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo adjunto % no existe', v_arch_id USING ERRCODE = 'P0002';
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 4. Bloquear y validar el pedido individual (FOR UPDATE)
    SELECT p.id, p.pedido_visible, p.estado, p.envio_id, p.responsable_user_id, p.version,
           p.retrabajo_activo,
           ef.correo, ef.nombre_apellido, ef.area_solicitante, ef.telefono,
           c.nombre AS categoria_nombre, ts.nombre AS tipo_nombre
    INTO v_pedido
    FROM public.pedidos p
    JOIN public.envios_formulario ef ON p.envio_id = ef.id
    LEFT JOIN public.categorias_servicio c ON p.categoria_id = c.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    WHERE p.id = p_pedido_id
    FOR UPDATE OF p;

    IF v_pedido.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado' USING ERRCODE = 'P0002';
    END IF;

    -- Pertenencia estricta por correo
    IF lower(trim(v_pedido.correo)) <> lower(trim(v_session_email)) THEN
        RAISE EXCEPTION 'FORBIDDEN: El pedido no pertenece al solicitante autenticado' USING ERRCODE = '42501';
    END IF;

    -- Estado debe ser estrictamente 'Finalizado'
    IF v_pedido.estado <> 'Finalizado' THEN
        RAISE EXCEPTION 'INVALID_STATE: El pedido % no puede ser devuelto porque su estado actual es "%" (solo se admiten pedidos Finalizados)', 
            v_pedido.pedido_visible, v_pedido.estado USING ERRCODE = '42200';
    END IF;

    -- Comprobar que no exista una revisión abierta o en tratamiento
    IF EXISTS (
        SELECT 1 FROM public.revision_pedidos 
        WHERE pedido_id = v_pedido.id AND estado IN ('abierta', 'en_tratamiento')
    ) THEN
        RAISE EXCEPTION 'REVISION_ALREADY_OPEN: El pedido % ya posee una solicitud de revisión activa', v_pedido.pedido_visible USING ERRCODE = '40001';
    END IF;

    -- Comprobar que posea al menos una entrega vigente
    IF NOT EXISTS (
        SELECT 1 FROM public.entregas_pedido 
        WHERE pedido_id = v_pedido.id AND es_vigente = true
    ) THEN
        RAISE EXCEPTION 'DELIVERY_NOT_FOUND: El pedido % no posee una entrega vigente registrada', v_pedido.pedido_visible USING ERRCODE = '42200';
    END IF;

    -- 5. Insertar CABECERA en revision_solicitudes
    v_revision_solicitud_id := gen_random_uuid();
    INSERT INTO public.revision_solicitudes (
        id,
        envio_id,
        solicitante_email,
        motivo,
        created_at
    ) VALUES (
        v_revision_solicitud_id,
        v_pedido.envio_id,
        lower(trim(v_session_email)),
        v_clean_motivo,
        now()
    );

    -- 6. Asociar ARCHIVOS ADJUNTOS a la cabecera
    IF v_archivos_count > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivos_ids LOOP
            INSERT INTO public.revision_archivos (revision_solicitud_id, archivo_id)
            VALUES (v_revision_solicitud_id, v_arch_id)
            ON CONFLICT (revision_solicitud_id, archivo_id) DO NOTHING;

            UPDATE public.archivos SET contexto = 'revision' WHERE id = v_arch_id;

            INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
            VALUES (v_arch_id, v_pedido.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 7. Obtener entrega vigente cuestionada
    SELECT id, version INTO v_entrega
    FROM public.entregas_pedido
    WHERE pedido_id = v_pedido.id AND es_vigente = true
    ORDER BY version DESC
    LIMIT 1;

    -- 8. Calcular número de revisión del pedido
    SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_num
    FROM public.revision_pedidos
    WHERE pedido_id = v_pedido.id;

    -- 9. Insertar HIJO en revision_pedidos
    INSERT INTO public.revision_pedidos (
        revision_solicitud_id,
        pedido_id,
        entrega_id,
        revision_number,
        estado,
        requested_at
    ) VALUES (
        v_revision_solicitud_id,
        v_pedido.id,
        v_entrega.id,
        v_rev_num,
        'abierta',
        now()
    );

    -- 10. Transición del PED a estado 'Nuevo' preservando responsable y campos históricos
    UPDATE public.pedidos
    SET estado = 'Nuevo',
        retrabajo_activo = true,
        revision_requested_at = now(),
        revision_count = v_rev_num,
        version = version + 1,
        updated_at = now()
    WHERE id = v_pedido.id;

    -- 11. Registrar Evento de Dominio y Auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.revision_solicitada',
        'pedido',
        v_pedido.id,
        jsonb_build_object(
            'pedido_id', v_pedido.id,
            'pedido_visible', v_pedido.pedido_visible,
            'revision_solicitud_id', v_revision_solicitud_id,
            'revision_number', v_rev_num,
            'entrega_cuestionada_id', v_entrega.id,
            'entrega_cuestionada_version', v_entrega.version,
            'motivo', v_clean_motivo,
            'solicitante_email', v_session_email,
            'archivos_count', v_archivos_count,
            'responsable_user_id', v_pedido.responsable_user_id
        ),
        NULL,
        now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        NULL,
        'pedidos',
        v_pedido.id::text,
        'revision_requested',
        jsonb_build_object(
            'revision_solicitud_id', v_revision_solicitud_id,
            'revision_number', v_rev_num,
            'motivo', v_clean_motivo,
            'solicitante_email', v_session_email
        ),
        now()
    );

    -- 12. Encolar Comunicación Outbox F10 para este PED
    v_comm_id := gen_random_uuid();
    v_idempotency_key := 'revision_solicitada:' || v_pedido.id::text || ':' || v_rev_num::text;

    INSERT INTO public.comunicaciones_pedido (
        id,
        envio_id,
        pedido_id,
        tipo_comunicacion,
        destinatario_email,
        estado,
        attempts,
        max_attempts,
        idempotency_key,
        payload,
        created_at
    ) VALUES (
        v_comm_id,
        v_pedido.envio_id,
        v_pedido.id,
        'revision_solicitada',
        lower(trim(v_session_email)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'revision_solicitada',
            'pedido_id', v_pedido.id,
            'pedido_visible', v_pedido.pedido_visible,
            'categoria', v_pedido.categoria_nombre,
            'tipo', v_pedido.tipo_nombre,
            'nombre_apellido', v_pedido.nombre_apellido,
            'revision_number', v_rev_num,
            'motivo', v_clean_motivo,
            'archivos_count', v_archivos_count
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'revision_solicitud_id', v_revision_solicitud_id,
        'envio_id', v_pedido.envio_id,
        'pedido_id', v_pedido.id,
        'pedido_visible', v_pedido.pedido_visible,
        'revision_number', v_rev_num,
        'motivo', v_clean_motivo,
        'archivos_count', v_archivos_count,
        'estado', 'Nuevo',
        'retrabajo_activo', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_request_revision(text, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_request_revision(text, uuid, text, uuid[]) TO service_role;


-- ============================================================================
-- 2. PROYECCIÓN NORMALIZADA: public.solicitante_get_pedido_detail
-- ============================================================================

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
        p.pedido_visible,
        p.anio,
        p.numero,
        p.codigo_categoria,
        cs.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        p.estado,
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
        'pedido_visible', v_ped.pedido_visible,
        'anio', v_ped.anio,
        'numero', v_ped.numero,
        'codigo_categoria', v_ped.codigo_categoria,
        'categoria_nombre', v_ped.categoria_nombre,
        'tipo_nombre', v_ped.tipo_nombre,
        'estado', v_ped.estado,
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

-- 3. Notificar a PostgREST para recargar el esquema inmediatamente
NOTIFY pgrst, 'reload schema';
