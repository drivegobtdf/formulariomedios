-- CAM-07B: acceso seguro a Mis Solicitudes para pedidos internos.
-- Generada exclusivamente desde definiciones canónicas verificadas de commit 2a4537a2e3017abd3d7c2f4f3dc21d0f7f99b3b2.
-- No altera los datos históricos ni las tablas; no habilita notificaciones ni 72h.

CREATE OR REPLACE FUNCTION public.solicitante_request_access(
    p_correo text,
    p_encrypted_envelope jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_norm_email text := lower(trim(p_correo));
    v_found_count integer := 0;
    v_nombre text := 'Solicitante';
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
    v_ttl_seconds integer;
    v_expires_at timestamptz;
BEGIN
    IF v_norm_email IS NULL OR v_norm_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EMAIL', 'message', 'Correo electrónico inválido');
    END IF;

    -- CAM-07B: identidad por correo, distinguiendo estrictamente ambos orígenes.
    SELECT count(*), COALESCE(max(
        CASE WHEN p.origen = 'publico' THEN ef.nombre_apellido
             ELSE NULLIF(trim(p.informacion_especifica->'solicitante'->>'nombre'), '') END
    ), 'Solicitante')
    INTO v_found_count, v_nombre
    FROM public.pedidos p
    LEFT JOIN public.envios_formulario ef ON p.envio_id = ef.id
    WHERE (p.origen = 'publico' AND lower(trim(ef.correo)) = v_norm_email)
       OR (p.origen = 'interno' AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_norm_email);

    IF v_found_count = 0 THEN
        -- Respuesta uniforme anti-enumeración
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'message', 'Si el correo ingresado tiene solicitudes activas, recibirá un enlace de acceso.'
        );
    END IF;

    -- Obtener TTL configurable
    v_ttl_seconds := public.get_setting_integer('solicitante_magic_link_ttl_seconds', 7200, 60, 2592000);
    v_expires_at := now() + (v_ttl_seconds || ' seconds')::interval;

    -- Generar token efímero y hash SHA-256
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Insertar token hash en base de datos (NUNCA el token en texto plano)
    INSERT INTO public.solicitante_access_tokens (
        correo, token_hash, expires_at, created_at
    ) VALUES (
        v_norm_email, v_token_hash, v_expires_at, now()
    ) RETURNING id INTO v_token_id;

    -- Encolar comunicación SOLO si el sobre cifrado fue provisto
    IF p_encrypted_envelope IS NOT NULL THEN
        INSERT INTO public.comunicaciones_pedido (
            destinatario_email, tipo_comunicacion, estado, idempotency_key, payload, created_at
        ) VALUES (
            v_norm_email,
            'magic_link_access',
            'pendiente',
            'magic_link:' || v_token_id::text,
            jsonb_build_object(
                'solicitante_nombre', v_nombre,
                'token_id', v_token_id,
                'expires_at', v_expires_at,
                'encrypted_envelope', p_encrypted_envelope
            ),
            now()
        );
    END IF;

    -- Retornar magic_token ÚNICAMENTE en memoria al llamador
    RETURN jsonb_build_object(
        'success', true,
        'found', true,
        'token_id', v_token_id,
        'magic_token', v_raw_token,
        'expires_at', v_expires_at,
        'ttl_seconds', v_ttl_seconds,
        'solicitante_nombre', v_nombre
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitante_get_pedidos(
    p_session_token text,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_correo text;
    v_pedidos jsonb;
    v_total integer;
    v_eff_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_eff_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    v_correo := private.validate_solicitante_session(p_session_token);

    SELECT count(*) INTO v_total
    FROM public.pedidos p
    LEFT JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE (
        (p.origen = 'publico' AND lower(trim(e.correo)) = v_correo)
        OR
        (p.origen = 'interno' AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_correo)
    );

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_pedidos
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'envio_id', p.envio_id,
            'pedido_visible', p.pedido_visible,
            'anio', p.anio,
            'numero', p.numero,
            'codigo_categoria', p.codigo_categoria,
            'categoria_nombre', cs.nombre,
            'tipo_nombre', ts.nombre,
            'estado', p.estado,
            'retrabajo_activo', p.retrabajo_activo,
            'revision_count', p.revision_count,
            'archivado', p.archivado,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'solicitudes_pendientes_count', (
                SELECT count(*)::integer
                FROM public.solicitudes_informacion si
                WHERE si.pedido_id = p.id AND si.estado = 'pendiente' AND now() < si.expires_at
            ),
            'tiene_entrega', EXISTS (
                SELECT 1 FROM public.entregas_pedido ep
                WHERE ep.pedido_id = p.id AND ep.es_vigente = true
            ),
            'tiene_revision_abierta', EXISTS (
                SELECT 1 FROM public.revision_pedidos rp
                WHERE rp.pedido_id = p.id AND rp.estado IN ('abierta', 'en_tratamiento')
            )
        ) AS item
        FROM public.pedidos p
        LEFT JOIN public.envios_formulario e ON p.envio_id = e.id
        LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
        LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE (
        (p.origen = 'publico' AND lower(trim(e.correo)) = v_correo)
        OR
        (p.origen = 'interno' AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_correo)
    )
        ORDER BY p.created_at DESC
        LIMIT v_eff_limit OFFSET v_eff_offset
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'correo', v_correo,
        'total', v_total,
        'limit', v_eff_limit,
        'offset', v_eff_offset,
        'pedidos', v_pedidos
    );
END;
$$;

-- CAM-07B: projection ONLY for the verified owner of an internal pedido.
-- The public detail contract remains untouched; do not expose internal notes or
-- CAM-11 reference attachments through this helper.
CREATE OR REPLACE FUNCTION public.solicitante_get_internal_pedido_detail(
    p_session_token text,
    p_pedido_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_email text;
    v_ped RECORD;
    v_entrega jsonb := NULL;
    v_versiones jsonb := '[]'::jsonb;
    v_historial jsonb := '[]'::jsonb;
BEGIN
    v_email := private.validate_solicitante_session(p_session_token);

    SELECT p.id, p.envio_id, p.pedido_visible, p.anio, p.numero,
           p.codigo_categoria, p.estado, p.retrabajo_activo, p.revision_count,
           p.informacion_especifica, p.archivado, p.created_at, p.updated_at,
           cs.nombre AS categoria_nombre, ts.nombre AS tipo_nombre
      INTO v_ped
      FROM public.pedidos p
      LEFT JOIN public.categorias_servicio cs ON cs.id = p.categoria_id
      LEFT JOIN public.tipos_servicio ts ON ts.id = p.tipo_servicio_id
     WHERE p.origen = 'interno'
       AND (p.id::text = p_pedido_ref OR p.pedido_visible = p_pedido_ref)
       AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_email;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no encontrado o no autorizado para esta sesión' USING ERRCODE = 'P0002';
    END IF;

    -- Only active delivery material, never internal notes, ad-hoc attached files,
    -- private draft links or CAM-11 references.
    SELECT jsonb_build_object(
        'id', ep.id,
        'version', ep.version,
        'enlace_externo', ep.enlace_externo,
        'url_entrega', ep.enlace_externo,
        'nota', NULL,
        'nota_publica', NULL,
        'created_at', ep.created_at,
        'archivo', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', a.id, 'nombre_original', a.nombre_original,
            'size_bytes', a.size_bytes, 'mime_type', a.mime_type
        ) END,
        'archivos', COALESCE((
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
                'id', af.id, 'nombre_original', af.nombre_original,
                'size_bytes', af.size_bytes, 'mime_type', af.mime_type
            ))
            FROM (
                SELECT ep.archivo_id AS archivo_id WHERE ep.archivo_id IS NOT NULL
                UNION
                SELECT ea.archivo_id FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id
            ) f
            JOIN public.archivos af ON af.id = f.archivo_id
            WHERE af.estado = 'verified' AND af.contexto = 'entrega'
        ), '[]'::jsonb)
    ) INTO v_entrega
      FROM public.entregas_pedido ep
      LEFT JOIN public.archivos a ON a.id = ep.archivo_id
                                 AND a.estado = 'verified' AND a.contexto = 'entrega'
     WHERE ep.pedido_id = v_ped.id AND ep.es_vigente IS TRUE
       AND (ep.enlace_externo IS NOT NULL OR
            EXISTS (
               SELECT 1 FROM public.entrega_archivos ea
               JOIN public.archivos a2 ON a2.id = ea.archivo_id
               WHERE ea.entrega_id = ep.id AND a2.estado = 'verified' AND a2.contexto = 'entrega'
            ) OR a.id IS NOT NULL)
     LIMIT 1;

    -- Preserve the visible version history but redact ALL internal closure notes.
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'version_number')::integer DESC), '[]'::jsonb)
      INTO v_versiones
      FROM (
        SELECT jsonb_build_object(
            'version_number', pv.version_number,
            'finalizado_at', pv.finalizado_at,
            'nota', NULL,
            'enlace_externo', ep.enlace_externo,
            'archivos', COALESCE((
                SELECT jsonb_agg(DISTINCT jsonb_build_object(
                    'id', a.id, 'nombre_original', a.nombre_original,
                    'size_bytes', a.size_bytes, 'mime_type', a.mime_type
                ))
                FROM (
                    SELECT ep.archivo_id AS archivo_id WHERE ep.archivo_id IS NOT NULL
                    UNION
                    SELECT ea.archivo_id FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id
                ) f
                JOIN public.archivos a ON a.id = f.archivo_id
                WHERE a.estado = 'verified' AND a.contexto = 'entrega'
            ), '[]'::jsonb)
        ) AS item
        FROM public.pedido_versiones pv
        LEFT JOIN public.entregas_pedido ep ON ep.id = pv.entrega_id AND ep.pedido_id = v_ped.id
        WHERE pv.pedido_id = v_ped.id
      ) versions;

    -- Event metadata is translated to a hardcoded public-safe vocabulary.
    -- DO NOT return event payload, actor IDs, message bodies or private reasons.
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
      INTO v_historial
      FROM (
         SELECT jsonb_build_object(
             'tipo', CASE de.event_name
                 WHEN 'pedido.created_internal' THEN 'created'
                 WHEN 'pedido.state_changed' THEN 'state_changed'
                 WHEN 'pedido.finalized' THEN 'finalized'
                 WHEN 'pedido.reopened' THEN 'reopened'
                 WHEN 'pedido.cancelled' THEN 'cancelled'
             END,
             'titulo', CASE de.event_name
                 WHEN 'pedido.created_internal' THEN 'Solicitud recibida'
                 WHEN 'pedido.state_changed' THEN 'Estado actualizado'
                 WHEN 'pedido.finalized' THEN 'Pedido finalizado'
                 WHEN 'pedido.reopened' THEN 'Pedido reabierto'
                 WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
             END,
             'descripcion', 'Actualización del seguimiento del pedido.',
             'created_at', de.created_at
         ) AS item
         FROM public.domain_events de
         WHERE de.aggregate_id = v_ped.id
           AND de.event_name IN (
             'pedido.created_internal', 'pedido.state_changed',
             'pedido.finalized', 'pedido.reopened', 'pedido.cancelled'
           )
      ) events;

    RETURN jsonb_build_object(
        'success', true,
        'pedido', jsonb_build_object(
            'id', v_ped.id,
            'envio_id', v_ped.envio_id,
            'origen', 'interno',
            'pedido_visible', v_ped.pedido_visible,
            'anio', v_ped.anio,
            'numero', v_ped.numero,
            'codigo_categoria', v_ped.codigo_categoria,
            'categoria_nombre', v_ped.categoria_nombre,
            'tipo_nombre', v_ped.tipo_nombre,
            'estado', v_ped.estado,
            'retrabajo_activo', v_ped.retrabajo_activo,
            'revision_count', v_ped.revision_count,
            'archivado', v_ped.archivado,
            'created_at', v_ped.created_at,
            'updated_at', v_ped.updated_at,
            'informacion_especifica', jsonb_build_object(
                'titulo', v_ped.informacion_especifica->>'titulo',
                'descripcion', v_ped.informacion_especifica->>'descripcion'
            ),
            'solicitante', jsonb_build_object(
                'nombre_apellido', v_ped.informacion_especifica->'solicitante'->>'nombre',
                'area_solicitante', v_ped.informacion_especifica->'solicitante'->>'area',
                'correo', v_email,
                'telefono', NULL
            )
        ),
        'solicitudes', '[]'::jsonb,
        'notas', '[]'::jsonb,
        'entrega', v_entrega,
        'nota_final', NULL,
        'versiones', v_versiones,
        'historial', v_historial,
        'revision_activa', NULL,
        'revisiones_historial', '[]'::jsonb
    );
END;
$$;


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
    v_versiones jsonb := '[]'::jsonb;
    v_historial jsonb := '[]'::jsonb;
    v_revision_activa jsonb := NULL;
    v_revisiones_historial jsonb := '[]'::jsonb;
BEGIN
    -- 1. Validar sesión activa del solicitante
    v_session_email := private.validate_solicitante_session(p_session_token);

    -- CAM-07B: ONLY the matching internal pedido can reach the minimal public DTO.
    IF EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.origen = 'interno'
          AND (p.id::text = p_pedido_ref OR p.pedido_visible = p_pedido_ref)
          AND lower(trim(p.informacion_especifica->'solicitante'->>'correo')) = v_session_email
    ) THEN
        RETURN public.solicitante_get_internal_pedido_detail(p_session_token, p_pedido_ref);
    END IF;

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

    -- 4. Notas públicas (estrictamente 'solicitante' o 'para_solicitante')
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

    -- 5. Entrega vigente (compatibilidad hacia atrás)
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
        SELECT jsonb_build_object(
            'texto', trim(pv.nota_cierre),
            'created_at', pv.finalizado_at
        )
        INTO v_nota_final
        FROM public.pedido_versiones pv
        WHERE pv.pedido_id = v_ped.id
          AND pv.nota_cierre IS NOT NULL
          AND trim(pv.nota_cierre) <> ''
        ORDER BY pv.version_number DESC
        LIMIT 1;

        IF v_nota_final IS NULL THEN
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
        END IF;

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

    -- 7. Historial Canónico de Versiones (public.pedido_versiones) ordenado DESC
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'version_number')::int DESC), '[]'::jsonb)
    INTO v_versiones
    FROM (
        SELECT jsonb_build_object(
            'version_number', pv.version_number,
            'finalizado_at', pv.finalizado_at,
            'nota', pv.nota_cierre,
            'enlace_externo', ep.enlace_externo,
            'archivos', COALESCE((
                SELECT jsonb_agg(DISTINCT jsonb_build_object(
                    'id', a.id,
                    'nombre_original', a.nombre_original,
                    'size_bytes', a.size_bytes,
                    'mime_type', a.mime_type
                ))
                FROM (
                    SELECT ea.archivo_id FROM public.entrega_archivos ea WHERE ea.entrega_id = ep.id
                    UNION
                    SELECT ep.archivo_id WHERE ep.archivo_id IS NOT NULL
                ) af
                JOIN public.archivos a ON af.archivo_id = a.id
            ), '[]'::jsonb)
        ) AS item
        FROM public.pedido_versiones pv
        LEFT JOIN public.entregas_pedido ep ON pv.entrega_id = ep.id
        WHERE pv.pedido_id = v_ped.id
    ) t;

    -- 8. Revisión activa
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

    -- 9. Historial de revisiones resueltas
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

    -- 10. Historial amigable server-side
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'tipo', CASE de.event_name
                WHEN 'pedido.created' THEN 'created'
                WHEN 'pedido.info_requested' THEN 'info_requested'
                WHEN 'pedido.info_responded' THEN 'info_responded'
                WHEN 'pedido.reopened' THEN 'reopened'
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
                WHEN 'pedido.reopened' THEN 'Pedido reabierto'
                WHEN 'pedido.finalized' THEN
                    CASE
                        WHEN COALESCE((de.payload->>'version_number')::int, (de.payload->>'entrega_version')::int, 1) > 1
                            THEN 'Nueva versión publicada (v' || COALESCE(de.payload->>'version_number', de.payload->>'entrega_version') || ')'
                        ELSE 'Pedido finalizado'
                    END
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.revision_solicitada' THEN 'Solicitud de revisión ingresada'
                WHEN 'pedido.revision_requested' THEN 'Solicitud de revisión ingresada'
                ELSE 'Actualización de seguimiento'
            END,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Tu solicitud fue registrada en el sistema.'
                WHEN 'pedido.info_requested' THEN 'El equipo solicitó información complementaria para avanzar con el pedido.'
                WHEN 'pedido.info_responded' THEN 'Se enviaron las respuestas solicitadas por el equipo.'
                WHEN 'pedido.reopened' THEN 'El equipo reabrió el pedido para realizar una actualización.'
                WHEN 'pedido.finalized' THEN
                    CASE
                        WHEN COALESCE((de.payload->>'version_number')::int, (de.payload->>'entrega_version')::int, 1) > 1
                            THEN 'El equipo publicó una nueva versión del pedido.'
                        ELSE 'El pedido fue completado y cerrado por el equipo.'
                    END
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
              'pedido.reopened',
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
        'versiones', v_versiones,
        'historial', v_historial,
        'revision_activa', v_revision_activa,
        'revisiones_historial', v_revisiones_historial
    );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_get_internal_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_internal_pedido_detail(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.solicitante_request_access(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_request_access(text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
