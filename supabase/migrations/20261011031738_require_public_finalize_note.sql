-- Migration: 20261011031738_require_public_finalize_note.sql
-- HOTFIX FUNCIONAL: Regla definitiva de finalización
-- 1. Pedido público: archivos opcionales, enlace opcional, NOTA OBLIGATORIA (trim no vacío).
-- 2. Pedido interno: archivos opcionales, enlace opcional, nota opcional.
-- 3. Si hay enlace: validación HTTP/HTTPS.
-- 4. entregas_pedido mantiene check_entrega_material (solo si hay archivo o enlace).
-- 5. Si no hay material pero hay nota, se persiste en notas_pedido ('solicitante' para público, 'interna' para interno).
-- 6. solicitante_get_pedido_detail actualizado para visibilidad IN ('solicitante', 'para_solicitante').

-- =============================================================================
-- 1. ACTUALIZACIÓN DE public.pedido_finalize
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pedido_finalize(
    p_pedido_id uuid,
    p_expected_version bigint,
    p_archivos_entrega uuid[] DEFAULT NULL,
    p_url_entrega text DEFAULT NULL,
    p_nota_entrega text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid;
    v_current_state text;
    v_current_version bigint;
    v_responsable_id uuid;
    v_origen text;
    v_new_version bigint;
    v_entrega_id uuid;
    v_entrega_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_clean_nota text;
    v_archivos_count integer := 0;
    v_is_retrabajo boolean := false;
    v_active_rev_id uuid;
    v_has_entrega boolean := false;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Validar rol operativo de gestión
    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios_acceso
        WHERE user_id = v_actor_id 
          AND estado_acceso = 'aprobado'
          AND app_role IN ('administrador', 'equipo')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Rol no autorizado para finalizar pedidos' USING ERRCODE = '42501';
    END IF;

    v_clean_url := NULLIF(trim(p_url_entrega), '');
    v_clean_nota := NULLIF(trim(p_nota_entrega), '');

    -- Contar archivos entregados
    IF p_archivos_entrega IS NOT NULL THEN
        v_archivos_count := cardinality(p_archivos_entrega);
    END IF;

    -- Validar formato de URL si se suministró contenido
    IF v_clean_url IS NOT NULL THEN
        IF v_clean_url !~* '^https?://.+' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS' USING ERRCODE = '42200';
        END IF;
    END IF;

    -- Bloquear pedido y validar versión
    SELECT estado, version, responsable_user_id, retrabajo_activo, origen 
    INTO v_current_state, v_current_version, v_responsable_id, v_is_retrabajo, v_origen
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA DEFINITIVA DE NEGOCIO:
    -- Para pedidos públicos, la nota de entrega es OBLIGATORIA (trim no vacío).
    -- Archivos y enlaces son opcionales para ambos orígenes.
    IF v_origen = 'publico' AND v_clean_nota IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOTE_REQUIRED: La nota de entrega es obligatoria para finalizar un pedido público' USING ERRCODE = '42200';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: Versión esperada %s no coincide con actual %s', p_expected_version, v_current_version);
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);
    
    -- REGLA CANÓNICA: ÚNICAMENTE DESDE 'En proceso'
    IF v_current_state <> 'En proceso' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- HARD GUARD: Responsable asignado obligatorio y válido
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- HARD GUARD: Rechazar finalización si existen solicitudes de información pendientes y vigentes (48h)
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = p_pedido_id
          AND estado = 'pendiente'
          AND now() < expires_at
    ) THEN
        RAISE EXCEPTION 'PENDING_INFO_REQUEST: No se puede finalizar el pedido porque posee solicitudes de información pendientes y vigentes (48h)' USING ERRCODE = '42200';
    END IF;

    -- Validar integridad de archivos de entrega si fueron suministrados
    IF v_archivos_count > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivos_entrega LOOP
            SELECT estado INTO v_arch_estado FROM public.archivos WHERE id = v_arch_id;
            IF v_arch_estado IS NULL THEN
                RAISE EXCEPTION 'FILE_NOT_FOUND: El archivo de entrega % no existe', v_arch_id USING ERRCODE = 'P0002';
            END IF;
            IF v_arch_estado <> 'verified' THEN
                RAISE EXCEPTION 'FILE_NOT_VERIFIED: El archivo de entrega % no está verificado en almacenamiento', v_arch_id USING ERRCODE = '42200';
            END IF;
            IF EXISTS (
                SELECT 1 FROM public.archivo_pedido 
                WHERE archivo_id = v_arch_id AND pedido_id <> p_pedido_id
            ) THEN
                RAISE EXCEPTION 'FILE_PEDIDO_MISMATCH: El archivo % pertenece a otro pedido', v_arch_id USING ERRCODE = '42200';
            END IF;
        END LOOP;
    END IF;

    -- Registrar entrega material en entregas_pedido SOLO si hay archivo o enlace
    IF v_archivos_count > 0 OR v_clean_url IS NOT NULL THEN
        v_has_entrega := true;

        -- Calcular siguiente versión de entrega
        SELECT COALESCE(MAX(version), 0) + 1 INTO v_entrega_version
        FROM public.entregas_pedido
        WHERE pedido_id = p_pedido_id;

        -- Desmarcar entrega anterior como vigente
        UPDATE public.entregas_pedido
        SET es_vigente = false
        WHERE pedido_id = p_pedido_id;

        -- Crear nueva entrega material (cumple check_entrega_material: archivo o enlace)
        v_entrega_id := gen_random_uuid();
        INSERT INTO public.entregas_pedido (
            id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
        ) VALUES (
            v_entrega_id, p_pedido_id, v_entrega_version, true,
            CASE WHEN v_archivos_count > 0 THEN p_archivos_entrega[1] ELSE NULL END,
            v_clean_url,
            v_clean_nota,
            v_actor_id, now()
        );

        -- Asociar archivos a la entrega normalizada (entrega_archivos) y al pedido (archivo_pedido)
        IF v_archivos_count > 0 THEN
            FOREACH v_arch_id IN ARRAY p_archivos_entrega LOOP
                INSERT INTO public.entrega_archivos (entrega_id, archivo_id)
                VALUES (v_entrega_id, v_arch_id)
                ON CONFLICT (entrega_id, archivo_id) DO NOTHING;

                UPDATE public.archivos SET contexto = 'entrega' WHERE id = v_arch_id;

                INSERT INTO public.archivo_pedido (archivo_id, pedido_id)
                VALUES (v_arch_id, p_pedido_id)
                ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    ELSIF v_clean_nota IS NOT NULL THEN
        -- Finalización sin material pero con nota:
        -- Para pedidos públicos se registra como visibilidad 'solicitante'; para internos 'interna'.
        INSERT INTO public.notas_pedido (
            id, pedido_id, autor_user_id, visibilidad, texto, created_at
        ) VALUES (
            gen_random_uuid(), p_pedido_id, v_actor_id,
            CASE WHEN v_origen = 'publico' THEN 'solicitante' ELSE 'interna' END,
            v_clean_nota, now()
        );
    END IF;

    -- Si el pedido estaba en retrabajo, resolver la revisión activa correspondiente
    IF v_is_retrabajo THEN
        SELECT id INTO v_active_rev_id
        FROM public.revision_pedidos
        WHERE pedido_id = p_pedido_id AND estado IN ('abierta', 'en_tratamiento')
        ORDER BY revision_number DESC
        LIMIT 1;

        IF v_active_rev_id IS NOT NULL THEN
            UPDATE public.revision_pedidos
            SET estado = 'resuelta',
                resolved_at = now(),
                resolved_by = v_actor_id,
                resolucion_notas = v_clean_nota
            WHERE id = v_active_rev_id;
        END IF;
    END IF;

    v_new_version := v_current_version + 1;

    -- Actualizar pedido a finalizado y desactivar flag de retrabajo
    UPDATE public.pedidos
    SET estado = 'Finalizado',
        retrabajo_activo = false,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.finalized', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'entrega_id', v_entrega_id,
            'entrega_version', v_entrega_version,
            'actor_id', v_actor_id,
            'version', v_new_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'nota', v_clean_nota
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'nota', v_clean_nota,
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'new_version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'Finalizado',
        'version', v_new_version,
        'entrega_id', v_entrega_id,
        'entrega_version', v_entrega_version,
        'retrabajo_resuelto', v_is_retrabajo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;


-- =============================================================================
-- 2. ACTUALIZACIÓN DE solicitante_get_pedido_detail
-- =============================================================================
-- Permite que notas públicas ('solicitante' o 'para_solicitante') sean visibles
-- en el portal de seguimiento, asegurando que finalizaciones con nota sin material
-- expongan la nota al solicitante correctamente.

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

    -- 3. Solicitudes de información
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

    -- 4. Notas visibles para el solicitante (soporta 'solicitante' y legacy 'para_solicitante')
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

    -- 5. Entrega vigente
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
    WHERE ep.pedido_id = v_ped.id AND ep.es_vigente = true;

    -- 6. Revisión activa
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

    -- 7. Historial de revisiones cerradas
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

    -- 8. Historial de estados público
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', de.event_name,
            'created_at', de.created_at,
            'detalles', de.payload
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created',
              'pedido.info_requested',
              'pedido.info_responded',
              'pedido.finalized',
              'pedido.revision_requested'
          )
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'pedido', jsonb_build_object(
            'id', v_ped.id,
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
        'historial', v_historial,
        'revision_activa', v_revision_activa,
        'revisiones_historial', v_revisiones_historial
    );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
