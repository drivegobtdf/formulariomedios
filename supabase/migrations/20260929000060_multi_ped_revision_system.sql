-- ==============================================================================
-- MIGRATION 060: Multi-PED Revision and Rework Workflow System
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- 
-- Arquitectura:
-- 1. Cabecera y Detalle de Solicitudes de Revisión (revision_solicitudes, revision_pedidos, revision_archivos)
-- 2. Garantía PostgreSQL de Concurrencia (Máx 1 revisión abierta por PED vía índice parcial único)
-- 3. Transición Atómica Multi-PED hacia estado 'Nuevo' con preservación de responsable e histórico
-- 4. Soporte Multi-Versión en Finalización (v1 -> v2 con resolución de revisión y desactivación de es_vigente previa)
-- 5. RPCs Seguras con Autenticación Canónica de Solicitante y Auditoría Integral
-- ==============================================================================

-- 1. TABLAS DEL MODELO DE REVISIONES (PADRE / HIJOS / ADJUNTOS)

CREATE TABLE IF NOT EXISTS public.revision_solicitudes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envio_id uuid NOT NULL REFERENCES public.envios_formulario(id) ON DELETE RESTRICT,
    solicitante_email text NOT NULL,
    motivo text NOT NULL,
    drive_folder_id text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_revision_motivo_len CHECK (length(trim(motivo)) >= 10)
);

CREATE TABLE IF NOT EXISTS public.revision_pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_solicitud_id uuid NOT NULL REFERENCES public.revision_solicitudes(id) ON DELETE CASCADE,
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
    entrega_id uuid REFERENCES public.entregas_pedido(id) ON DELETE SET NULL,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_tratamiento', 'resuelta', 'rechazada')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz NULL,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolucion_notas text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_revision_pedidos_pedido_number UNIQUE (pedido_id, revision_number)
);

CREATE TABLE IF NOT EXISTS public.revision_archivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_solicitud_id uuid NOT NULL REFERENCES public.revision_solicitudes(id) ON DELETE CASCADE,
    archivo_id uuid NOT NULL REFERENCES public.archivos(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_revision_archivos_solicitud_archivo UNIQUE (revision_solicitud_id, archivo_id)
);

-- 2. METADATA Y CAMPOS EN TABLA PEDIDOS

ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS retrabajo_activo boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0;

-- 3. ÍNDICES DE CONCURRENCIA, RENDIMIENTO Y KANBAN

-- Garantía de Concurrencia a nivel de Motor PostgreSQL: Máximo UNA revisión abierta por PED
CREATE UNIQUE INDEX IF NOT EXISTS uq_revision_pedidos_abierta 
    ON public.revision_pedidos (pedido_id) 
    WHERE (estado IN ('abierta', 'en_tratamiento'));

CREATE INDEX IF NOT EXISTS idx_revision_solicitudes_envio 
    ON public.revision_solicitudes (envio_id);

CREATE INDEX IF NOT EXISTS idx_revision_solicitudes_email 
    ON public.revision_solicitudes (lower(solicitante_email));

CREATE INDEX IF NOT EXISTS idx_revision_pedidos_solicitud 
    ON public.revision_pedidos (revision_solicitud_id);

CREATE INDEX IF NOT EXISTS idx_revision_pedidos_pedido 
    ON public.revision_pedidos (pedido_id);

CREATE INDEX IF NOT EXISTS idx_revision_pedidos_estado 
    ON public.revision_pedidos (estado);

-- Índice optimizado para ordenamiento prioritario en Kanban columna 'Nuevo'
CREATE INDEX IF NOT EXISTS idx_pedidos_retrabajo_kanban 
    ON public.pedidos (retrabajo_activo DESC, revision_requested_at DESC NULLS LAST, created_at DESC) 
    WHERE (archivado = false);

-- 4. ROW LEVEL SECURITY Y PERMISOS

ALTER TABLE public.revision_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_archivos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.revision_solicitudes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.revision_pedidos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.revision_archivos FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_solicitudes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_pedidos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_archivos TO service_role;

-- Acceso de lectura para operadores internos autenticados
CREATE POLICY revision_solicitudes_staff_read ON public.revision_solicitudes
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios_acceso WHERE user_id = auth.uid() AND estado_acceso = 'aprobado'));

CREATE POLICY revision_pedidos_staff_read ON public.revision_pedidos
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios_acceso WHERE user_id = auth.uid() AND estado_acceso = 'aprobado'));

CREATE POLICY revision_archivos_staff_read ON public.revision_archivos
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios_acceso WHERE user_id = auth.uid() AND estado_acceso = 'aprobado'));

-- 5. RPC CANÓNICA: public.pedido_request_revision (Multi-PED Atómico)

CREATE OR REPLACE FUNCTION public.pedido_request_revision(
    p_session_token text,
    p_envio_id uuid,
    p_pedido_ids uuid[],
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
    v_envio RECORD;
    v_pedido RECORD;
    v_clean_motivo text;
    v_revision_solicitud_id uuid;
    v_pedidos_count integer;
    v_archivos_count integer := 0;
    v_arch_id uuid;
    v_arch_estado text;
    v_ped_id uuid;
    v_rev_num integer;
    v_entrega RECORD;
    v_updated_pedidos jsonb := '[]'::jsonb;
    v_comm_id uuid;
    v_idempotency_key text;
BEGIN
    -- 1. Validar sesión del solicitante
    IF p_session_token IS NULL OR trim(p_session_token) = '' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Token de sesión de solicitante requerido' USING ERRCODE = '42501';
    END IF;

    v_session_email := private.validate_solicitante_session(p_session_token);

    -- 2. Validar que el envío exista y pertenezca al solicitante autenticado
    SELECT id, correo, nombre_apellido, area_solicitante, telefono
    INTO v_envio
    FROM public.envios_formulario
    WHERE id = p_envio_id;

    IF v_envio.id IS NULL THEN
        RAISE EXCEPTION 'ENVIO_NOT_FOUND: El envío especificado no existe' USING ERRCODE = 'P0002';
    END IF;

    IF lower(trim(v_envio.correo)) <> lower(trim(v_session_email)) THEN
        RAISE EXCEPTION 'FORBIDDEN: El envío no pertenece al solicitante autenticado' USING ERRCODE = '42501';
    END IF;

    -- 3. Validar lista de pedidos seleccionados
    IF p_pedido_ids IS NULL OR cardinality(p_pedido_ids) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Debe seleccionar al menos un pedido para solicitar revisión' USING ERRCODE = '42200';
    END IF;

    -- 4. Validar motivo común
    v_clean_motivo := trim(COALESCE(p_motivo, ''));
    IF length(v_clean_motivo) < 10 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: El motivo de revisión debe contener al menos 10 caracteres' USING ERRCODE = '42200';
    END IF;

    -- 5. Validar archivos adjuntos opcionales (máx 5)
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

    -- 6. Bloquear y validar TODOS los pedidos seleccionados atómicamente (FOR UPDATE)
    SELECT count(*) INTO v_pedidos_count
    FROM public.pedidos
    WHERE id = ANY(p_pedido_ids);

    IF v_pedidos_count <> cardinality(p_pedido_ids) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Uno o más pedidos seleccionados no existen en el sistema' USING ERRCODE = 'P0002';
    END IF;

    -- Validar cada pedido seleccionado
    FOR v_pedido IN 
        SELECT p.id, p.pedido_visible, p.estado, p.envio_id, p.responsable_user_id, p.version,
               c.nombre AS categoria_nombre, ts.nombre AS tipo_nombre
        FROM public.pedidos p
        JOIN public.categorias_servicio c ON p.categoria_id = c.id
        JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE p.id = ANY(p_pedido_ids)
        FOR UPDATE
    LOOP
        -- Pertenencia al mismo envío
        IF v_pedido.envio_id <> p_envio_id THEN
            RAISE EXCEPTION 'PEDIDO_ENVIO_MISMATCH: El pedido % no pertenece al envío indicado', v_pedido.pedido_visible USING ERRCODE = '42200';
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
    END LOOP;

    -- 7. Insertar CABECERA de la solicitud de revisión
    v_revision_solicitud_id := gen_random_uuid();
    INSERT INTO public.revision_solicitudes (
        id,
        envio_id,
        solicitante_email,
        motivo,
        created_at
    ) VALUES (
        v_revision_solicitud_id,
        p_envio_id,
        lower(trim(v_session_email)),
        v_clean_motivo,
        now()
    );

    -- 8. Asociar ARCHIVOS ADJUNTOS a la cabecera
    IF v_archivos_count > 0 THEN
        FOREACH v_arch_id IN ARRAY p_archivos_ids LOOP
            INSERT INTO public.revision_archivos (revision_solicitud_id, archivo_id)
            VALUES (v_revision_solicitud_id, v_arch_id)
            ON CONFLICT (revision_solicitud_id, archivo_id) DO NOTHING;

            UPDATE public.archivos SET contexto = 'revision' WHERE id = v_arch_id;
        END LOOP;
    END IF;

    -- 9. Procesar cada PED seleccionado (Crear hijo, transicionar a Nuevo, auditoría y outbox)
    FOR v_pedido IN 
        SELECT p.id, p.pedido_visible, p.estado, p.envio_id, p.responsable_user_id, p.version,
               c.nombre AS categoria_nombre, ts.nombre AS tipo_nombre
        FROM public.pedidos p
        JOIN public.categorias_servicio c ON p.categoria_id = c.id
        JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE p.id = ANY(p_pedido_ids)
    LOOP
        -- Obtener entrega vigente cuestionada
        SELECT id, version INTO v_entrega
        FROM public.entregas_pedido
        WHERE pedido_id = v_pedido.id AND es_vigente = true
        ORDER BY version DESC
        LIMIT 1;

        -- Calcular número de revisión del pedido
        SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_num
        FROM public.revision_pedidos
        WHERE pedido_id = v_pedido.id;

        -- Insertar HIJO en revision_pedidos
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

        -- Transición del PED a estado 'Nuevo' preservando responsable y campos históricos
        UPDATE public.pedidos
        SET estado = 'Nuevo',
            retrabajo_activo = true,
            revision_requested_at = now(),
            revision_count = v_rev_num,
            version = version + 1,
            updated_at = now()
        WHERE id = v_pedido.id;

        -- Registrar en Historial Operativo de Pedidos
        INSERT INTO public.historial_pedidos (
            pedido_id,
            estado_anterior,
            estado_nuevo,
            cambiado_por,
            notas
        ) VALUES (
            v_pedido.id,
            'Finalizado',
            'Nuevo',
            lower(trim(v_session_email)),
            'Solicitud de Revisión #' || v_rev_num || ': ' || v_clean_motivo
        );

        -- Registrar Evento de Dominio y Auditoría
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

        -- Encolar Comunicación Outbox F10 para este PED
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
                'nombre_apellido', v_envio.nombre_apellido,
                'revision_number', v_rev_num,
                'motivo', v_clean_motivo,
                'archivos_count', v_archivos_count
            ),
            now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        -- Agregar al arreglo de respuesta
        v_updated_pedidos := v_updated_pedidos || jsonb_build_object(
            'pedido_id', v_pedido.id,
            'pedido_visible', v_pedido.pedido_visible,
            'revision_number', v_rev_num,
            'estado', 'Nuevo'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'revision_solicitud_id', v_revision_solicitud_id,
        'envio_id', p_envio_id,
        'motivo', v_clean_motivo,
        'archivos_count', v_archivos_count,
        'pedidos_revisados', v_updated_pedidos
    );
END;
$$;

-- 6. RPC DE CONSULTA: public.solicitante_get_envio_revisable_pedidos

CREATE OR REPLACE FUNCTION public.solicitante_get_envio_revisable_pedidos(
    p_session_token text,
    p_envio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_session_email text;
    v_envio RECORD;
    v_pedidos jsonb := '[]'::jsonb;
BEGIN
    -- 1. Validar sesión
    v_session_email := private.validate_solicitante_session(p_session_token);

    -- 2. Validar pertenencia del envío
    SELECT id, correo, nombre_apellido, area_solicitante, created_at
    INTO v_envio
    FROM public.envios_formulario
    WHERE id = p_envio_id;

    IF v_envio.id IS NULL THEN
        RAISE EXCEPTION 'ENVIO_NOT_FOUND: Envío no encontrado' USING ERRCODE = 'P0002';
    END IF;

    IF lower(trim(v_envio.correo)) <> lower(trim(v_session_email)) THEN
        RAISE EXCEPTION 'FORBIDDEN: No autorizado para consultar este envío' USING ERRCODE = '42501';
    END IF;

    -- 3. Proyectar estado y elegibilidad de cada PED del envío
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'pedido_visible'), '[]'::jsonb)
    INTO v_pedidos
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'pedido_visible', p.pedido_visible,
            'categoria_id', p.categoria_id,
            'categoria_nombre', cs.nombre,
            'tipo_id', p.tipo_servicio_id,
            'tipo_nombre', ts.nombre,
            'estado', p.estado,
            'retrabajo_activo', p.retrabajo_activo,
            'revision_count', p.revision_count,
            'is_eligible', (
                p.estado = 'Finalizado' AND 
                NOT EXISTS (
                    SELECT 1 FROM public.revision_pedidos rp
                    WHERE rp.pedido_id = p.id AND rp.estado IN ('abierta', 'en_tratamiento')
                ) AND
                EXISTS (
                    SELECT 1 FROM public.entregas_pedido ep
                    WHERE ep.pedido_id = p.id AND ep.es_vigente = true
                )
            ),
            'ineligible_reason', CASE 
                WHEN p.estado = 'Cancelado' THEN 'El pedido fue cancelado'
                WHEN p.estado = 'Nuevo' AND p.retrabajo_activo THEN 'Ya se encuentra devuelto en circuito de retrabajo'
                WHEN p.estado IN ('Nuevo', 'En revisión', 'En proceso', 'Esperando información') THEN 'Todavía está en proceso de realización'
                WHEN EXISTS (
                    SELECT 1 FROM public.revision_pedidos rp
                    WHERE rp.pedido_id = p.id AND rp.estado IN ('abierta', 'en_tratamiento')
                ) THEN 'Ya posee una solicitud de revisión abierta'
                WHEN NOT EXISTS (
                    SELECT 1 FROM public.entregas_pedido ep
                    WHERE ep.pedido_id = p.id AND ep.es_vigente = true
                ) THEN 'No posee una entrega vigente registrada'
                ELSE NULL
            END,
            'entrega_vigente', (
                SELECT jsonb_build_object(
                    'id', ep.id,
                    'version', ep.version,
                    'enlace_externo', ep.enlace_externo,
                    'nota', ep.nota,
                    'created_at', ep.created_at
                )
                FROM public.entregas_pedido ep
                WHERE ep.pedido_id = p.id AND ep.es_vigente = true
                ORDER BY ep.version DESC
                LIMIT 1
            ),
            'revision_activa', (
                SELECT jsonb_build_object(
                    'id', rp.id,
                    'revision_number', rp.revision_number,
                    'estado', rp.estado,
                    'motivo', rs.motivo,
                    'requested_at', rp.requested_at
                )
                FROM public.revision_pedidos rp
                JOIN public.revision_solicitudes rs ON rp.revision_solicitud_id = rs.id
                WHERE rp.pedido_id = p.id AND rp.estado IN ('abierta', 'en_tratamiento')
                LIMIT 1
            )
        ) AS item
        FROM public.pedidos p
        LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
        LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE p.envio_id = p_envio_id
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'envio_id', p_envio_id,
        'nombre_apellido', v_envio.nombre_apellido,
        'correo', v_envio.correo,
        'area_solicitante', v_envio.area_solicitante,
        'pedidos', v_pedidos
    );
END;
$$;

-- 7. ACTUALIZACIÓN DE public.pedido_finalize PARA FINALIZACIÓN DE RETRABAJO

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
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_actor_id uuid;
    v_current_state text;
    v_current_version bigint;
    v_responsable_id uuid;
    v_new_version bigint;
    v_entrega_id uuid;
    v_entrega_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_archivos_count integer := 0;
    v_is_retrabajo boolean := false;
    v_active_rev_id uuid;
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
    SELECT estado, version, responsable_user_id, retrabajo_activo 
    INTO v_current_state, v_current_version, v_responsable_id, v_is_retrabajo
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

    -- Crear nueva entrega (v2, v3...)
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
                resolucion_notas = NULLIF(trim(p_nota_entrega), '')
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
            'was_retrabajo', v_is_retrabajo
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
            'has_enlace', (v_clean_url IS NOT NULL),
            'was_retrabajo', v_is_retrabajo
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
        'archivos_count', v_archivos_count,
        'was_retrabajo', v_is_retrabajo
    );
END;
$$;

-- 8. ACTUALIZACIÓN DE solicitante_get_pedidos Y solicitante_get_pedido_detail

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
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE lower(trim(e.correo)) = v_correo;

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
        JOIN public.envios_formulario e ON p.envio_id = e.id
        LEFT JOIN public.categorias_servicio cs ON p.categoria_id = cs.id
        LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE lower(trim(e.correo)) = v_correo
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
      AND lower(trim(ef.correo)) = v_session_email;

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

    -- 5. Entrega vigente con archivos normalizados
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

    -- 6. Revisión activa si existe
    SELECT jsonb_build_object(
        'id', rp.id,
        'revision_number', rp.revision_number,
        'estado', rp.estado,
        'motivo', rs.motivo,
        'requested_at', rp.requested_at,
        'archivos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'nombre_original', a.nombre_original,
                'size_bytes', a.size_bytes,
                'mime_type', a.mime_type
            ))
            FROM public.revision_archivos ra
            JOIN public.archivos a ON ra.archivo_id = a.id
            WHERE ra.revision_solicitud_id = rs.id
        ), '[]'::jsonb)
    )
    INTO v_revision_activa
    FROM public.revision_pedidos rp
    JOIN public.revision_solicitudes rs ON rp.revision_solicitud_id = rs.id
    WHERE rp.pedido_id = v_ped.id AND rp.estado IN ('abierta', 'en_tratamiento')
    LIMIT 1;

    -- 7. Historial de revisiones resueltas o históricas
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'revision_number' DESC), '[]'::jsonb)
    INTO v_revisiones_historial
    FROM (
        SELECT jsonb_build_object(
            'id', rp.id,
            'revision_number', rp.revision_number,
            'estado', rp.estado,
            'motivo', rs.motivo,
            'requested_at', rp.requested_at,
            'resolved_at', rp.resolved_at,
            'resolucion_notas', rp.resolucion_notas
        ) AS item
        FROM public.revision_pedidos rp
        JOIN public.revision_solicitudes rs ON rp.revision_solicitud_id = rs.id
        WHERE rp.pedido_id = v_ped.id
    ) t;

    -- 8. Proyección de Historial Público
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', de.event_name,
            'created_at', de.created_at,
            'descripcion', CASE de.event_name
                WHEN 'pedido.created' THEN 'Pedido registrado'
                WHEN 'pedido.en_proceso' THEN 'Pedido iniciado por el equipo'
                WHEN 'pedido.info_requested' THEN 'Se solicitó información complementaria'
                WHEN 'pedido.info_responded' THEN 'Información complementaria enviada'
                WHEN 'pedido.revision_solicitada' THEN 'Solicitud de revisión enviada'
                WHEN 'pedido.finalized' THEN 'Pedido finalizado y material entregado'
                WHEN 'pedido.cancelled' THEN 'Pedido cancelado'
                ELSE de.event_name
            END
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
    ) t;

    RETURN jsonb_build_object(
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
        'archivado', v_ped.archivado,
        'created_at', v_ped.created_at,
        'updated_at', v_ped.updated_at,
        'contacto', jsonb_build_object(
            'nombre_apellido', v_ped.nombre_apellido,
            'area_solicitante', v_ped.area_solicitante,
            'correo', v_ped.correo,
            'telefono', v_ped.telefono
        ),
        'entrega', v_entrega,
        'revision_activa', v_revision_activa,
        'revisiones_historial', v_revisiones_historial,
        'solicitudes_informacion', v_solicitudes,
        'notas_publicas', v_notas,
        'timeline_publico', v_historial
    );
END;
$$;

-- 9. PERMISOS DE EJECUCIÓN GRANTED A SERVICE_ROLE

REVOKE ALL ON FUNCTION public.pedido_request_revision(text, uuid, uuid[], text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_request_revision(text, uuid, uuid[], text, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_get_envio_revisable_pedidos(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_envio_revisable_pedidos(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
