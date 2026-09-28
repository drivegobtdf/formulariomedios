-- ==============================================================================
-- MIGRATION 053: Google Drive Folder Structure and Multi-File Deliveries
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. Tabla de Carpetas de Google Drive por Pedido (public.pedido_drive_folders)
-- Fuente de verdad para la relación pedido + tipo de carpeta -> Google Drive folder ID.
CREATE TABLE IF NOT EXISTS public.pedido_drive_folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    folder_type text NOT NULL CHECK (folder_type IN ('solicitud', 'enviado')),
    drive_folder_id text NOT NULL,
    folder_name text NOT NULL,
    organization_status text NOT NULL DEFAULT 'completed' CHECK (organization_status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count integer NOT NULL DEFAULT 0,
    last_error text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_pedido_drive_folders_type UNIQUE (pedido_id, folder_type)
);

CREATE INDEX IF NOT EXISTS idx_pedido_drive_folders_pedido ON public.pedido_drive_folders(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_drive_folders_org_status ON public.pedido_drive_folders(organization_status) WHERE organization_status <> 'completed';

-- 2. Tabla de Archivos de Entrega (public.entrega_archivos)
-- Normaliza la relación de múltiples archivos por entrega versionada.
CREATE TABLE IF NOT EXISTS public.entrega_archivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrega_id uuid NOT NULL REFERENCES public.entregas_pedido(id) ON DELETE CASCADE,
    archivo_id uuid NOT NULL REFERENCES public.archivos(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_entrega_archivos UNIQUE (entrega_id, archivo_id)
);

CREATE INDEX IF NOT EXISTS idx_entrega_archivos_entrega ON public.entrega_archivos(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_archivos_archivo ON public.entrega_archivos(archivo_id);

-- 3. Habilitar RLS en las nuevas tablas
ALTER TABLE public.pedido_drive_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_archivos ENABLE ROW LEVEL SECURITY;

-- Políticas para public.pedido_drive_folders
DROP POLICY IF EXISTS "drive_folders_select_approved" ON public.pedido_drive_folders;
CREATE POLICY "drive_folders_select_approved" ON public.pedido_drive_folders
    FOR SELECT TO authenticated
    USING (
        private.is_approved() AND 
        private.current_app_role() IN ('administrador', 'equipo', 'observador')
    );

-- Políticas para public.entrega_archivos
DROP POLICY IF EXISTS "entrega_archivos_select_approved" ON public.entrega_archivos;
CREATE POLICY "entrega_archivos_select_approved" ON public.entrega_archivos
    FOR SELECT TO authenticated
    USING (
        private.is_approved() AND 
        private.current_app_role() IN ('administrador', 'equipo', 'observador')
    );

-- Grants
GRANT SELECT ON public.pedido_drive_folders TO authenticated;
GRANT ALL ON public.pedido_drive_folders TO service_role;

GRANT SELECT ON public.entrega_archivos TO authenticated;
GRANT ALL ON public.entrega_archivos TO service_role;


-- 4. Helper RPC para registrar o actualizar carpetas de Drive de forma atómica
CREATE OR REPLACE FUNCTION private.register_pedido_drive_folder(
    p_pedido_id uuid,
    p_folder_type text,
    p_drive_folder_id text,
    p_folder_name text,
    p_organization_status text DEFAULT 'completed',
    p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_rec public.pedido_drive_folders%ROWTYPE;
BEGIN
    INSERT INTO public.pedido_drive_folders (
        pedido_id, folder_type, drive_folder_id, folder_name, organization_status, last_error, updated_at
    ) VALUES (
        p_pedido_id, p_folder_type, p_drive_folder_id, p_folder_name, p_organization_status, p_last_error, now()
    )
    ON CONFLICT (pedido_id, folder_type) DO UPDATE SET
        drive_folder_id = EXCLUDED.drive_folder_id,
        folder_name = EXCLUDED.folder_name,
        organization_status = EXCLUDED.organization_status,
        last_error = EXCLUDED.last_error,
        updated_at = now()
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_rec.id,
        'pedido_id', v_rec.pedido_id,
        'folder_type', v_rec.folder_type,
        'drive_folder_id', v_rec.drive_folder_id,
        'folder_name', v_rec.folder_name,
        'organization_status', v_rec.organization_status
    );
END;
$$;

REVOKE ALL ON FUNCTION private.register_pedido_drive_folder(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.register_pedido_drive_folder(uuid, text, text, text, text, text) TO service_role;


-- 5. Actualización canónica de public.pedido_finalize
-- Soportando N archivos en entrega_archivos + enlace externo opcional
CREATE OR REPLACE FUNCTION public.pedido_finalize(
    p_pedido_id uuid,
    p_expected_version integer,
    p_archivos_entrega uuid[] DEFAULT NULL,
    p_url_entrega text DEFAULT NULL,
    p_nota_entrega text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_state text;
    v_current_version integer;
    v_responsable_id uuid;
    v_entrega_version integer;
    v_entrega_id uuid;
    v_new_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_archivos_count integer := 0;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para finalizar pedidos', v_actor_role USING ERRCODE = '42501';
    END IF;

    v_clean_url := NULLIF(trim(p_url_entrega), '');

    -- Contar archivos entregados
    IF p_archivos_entrega IS NOT NULL THEN
        v_archivos_count := cardinality(p_archivos_entrega);
    END IF;

    -- Validar que exista al menos archivo o enlace de entrega
    IF v_archivos_count = 0 AND v_clean_url IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega' USING ERRCODE = '42200';
    END IF;

    -- Validar formato de URL si se suministró
    IF v_clean_url IS NOT NULL THEN
        IF v_clean_url !~* '^https?://.+' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS' USING ERRCODE = '42200';
        END IF;
    END IF;

    -- Bloquear pedido y validar versión
    SELECT estado, version, responsable_user_id INTO v_current_state, v_current_version, v_responsable_id
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Versión esperada % no coincide con actual %', p_expected_version, v_current_version USING ERRCODE = '40001';
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);
    
    -- REGLA CANÓNICA: ÚNICAMENTE DESDE 'En proceso'
    IF v_current_state <> 'En proceso' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- HARD GUARD: Responsable asignado obligatorio y válido
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- D2 HARD GUARD: Rechazar finalización si existen solicitudes de información pendientes y vigentes (48h)
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

    -- Calcular siguiente versión de entrega
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_entrega_version
    FROM public.entregas_pedido
    WHERE pedido_id = p_pedido_id;

    -- Desmarcar entrega anterior como vigente
    UPDATE public.entregas_pedido
    SET es_vigente = false
    WHERE pedido_id = p_pedido_id;

    -- Crear nueva entrega
    v_entrega_id := gen_random_uuid();
    INSERT INTO public.entregas_pedido (
        id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
    ) VALUES (
        v_entrega_id, p_pedido_id, v_entrega_version, true,
        CASE WHEN v_archivos_count > 0 THEN p_archivos_entrega[1] ELSE NULL END,
        v_clean_url,
        NULLIF(trim(p_nota_entrega), ''),
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

    v_new_version := v_current_version + 1;

    -- Actualizar pedido a finalizado
    UPDATE public.pedidos
    SET estado = 'Finalizado',
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
            'has_enlace', (v_clean_url IS NOT NULL)
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
            'entrega_version', v_entrega_version,
            'version', v_new_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL)
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'Finalizado',
        'entrega_id', v_entrega_id,
        'entrega_version', v_entrega_version,
        'version', v_new_version,
        'archivos_count', v_archivos_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, integer, uuid[], text, text) TO authenticated;


-- 6. Actualización de public.solicitante_get_pedido_detail
-- Retornando archivos de entrega normalizados con fallback
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
    v_session_token_hash text;
    v_session_email text;
    v_ped RECORD;
    v_solicitudes jsonb := '[]'::jsonb;
    v_notas jsonb := '[]'::jsonb;
    v_entrega jsonb := NULL;
    v_historial jsonb := '[]'::jsonb;
    v_archivos_iniciales jsonb := '[]'::jsonb;
BEGIN
    -- 1. Validar sesión activa del solicitante
    IF p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
        RAISE EXCEPTION 'SESSION_REQUIRED: Token de sesión requerido' USING ERRCODE = '42203';
    END IF;

    v_session_token_hash := encode(digest(p_session_token, 'sha256'), 'hex');

    SELECT correo INTO v_session_email
    FROM public.solicitante_sessions
    WHERE session_token_hash = v_session_token_hash
      AND expires_at > now()
      AND revoked_at IS NULL;

    IF v_session_email IS NULL THEN
        RAISE EXCEPTION 'SESSION_INVALID: Sesión inválida, expirada o revocada' USING ERRCODE = '42501';
    END IF;

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

    -- 2. Solicitudes de Información Públicas
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
                WHERE asi.solicitud_id = si.id
            ), '[]'::jsonb),
            'enlaces_respuesta', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', em.url,
                    'descripcion', em.descripcion
                ))
                FROM public.enlace_solicitud_informacion esi
                JOIN public.enlaces_material em ON esi.enlace_id = em.id
                WHERE esi.solicitud_id = si.id
            ), '[]'::jsonb)
        ) AS item
        FROM public.solicitudes_informacion si
        WHERE si.pedido_id = v_ped.id
    ) t;

    -- 2. Notas públicas dirigidas al solicitante
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

    -- 3. Entrega vigente con archivos normalizados y fallback
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

    -- 4. Proyección de Historial Público
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', de.event_name,
            'created_at', de.created_at,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido ingresado y registrado en el sistema'
                WHEN 'pedido.assigned' THEN 'Pedido asignado al equipo técnico para su tratamiento'
                WHEN 'pedido.state_changed' THEN concat('Estado actualizado a: ', COALESCE(de.payload->>'estado_nuevo', 'En proceso'))
                WHEN 'info_request.created' THEN 'Se emitió una solicitud de información complementaria'
                WHEN 'info_request.responded' THEN 'Respuesta de información complementaria recibida'
                WHEN 'pedido.finalized' THEN 'Trabajo finalizado y entrega de materiales disponible'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                WHEN 'pedido.reopened' THEN 'Pedido reabierto para revisión'
                ELSE 'Actualización de seguimiento'
            END
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created', 'pedido.assigned', 'pedido.state_changed',
              'info_request.created', 'info_request.responded',
              'pedido.finalized', 'pedido.cancelled', 'pedido.reopened'
          )
    ) t;

    -- 5. Archivos iniciales del solicitante
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
        'archivos_iniciales', v_archivos_iniciales
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
