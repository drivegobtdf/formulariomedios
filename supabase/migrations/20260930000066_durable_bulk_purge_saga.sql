-- =============================================================================
-- Migration: 20260930000066_durable_bulk_purge_saga.sql
-- Description:
-- Implementa el modelo de Saga Durable e Idempotente para Borrado Masivo Admin:
-- 1. Tablas admin_purge_operations y admin_purge_items
-- 2. RPCs: admin_purge_operation_init, admin_purge_item_update,
--          admin_purge_operation_step_drive, admin_pedidos_purge (vinculada a operation_id)
-- 3. RLS estricto y auditoría vinculada
-- =============================================================================

-- 1. Tabla de Operaciones de Purga Masiva
CREATE TABLE IF NOT EXISTS public.admin_purge_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key text NOT NULL UNIQUE,
    actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_display text NOT NULL DEFAULT 'administrador',
    status text NOT NULL CHECK (status IN ('pending', 'processing_drive', 'drive_partial', 'processing_db', 'completed', 'failed')),
    pedidos_count int NOT NULL DEFAULT 0,
    pedidos_visibles jsonb NOT NULL DEFAULT '[]'::jsonb,
    envios_afectados int NOT NULL DEFAULT 0,
    entregas_count int NOT NULL DEFAULT 0,
    revisiones_count int NOT NULL DEFAULT 0,
    archivos_count int NOT NULL DEFAULT 0,
    comunicaciones_count int NOT NULL DEFAULT 0,
    drive_files_total int NOT NULL DEFAULT 0,
    drive_files_processed int NOT NULL DEFAULT 0,
    drive_folders_total int NOT NULL DEFAULT 0,
    drive_folders_processed int NOT NULL DEFAULT 0,
    last_error text,
    retry_count int NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz
);

-- 2. Tabla de Items / Recursos de la Purga
CREATE TABLE IF NOT EXISTS public.admin_purge_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id uuid NOT NULL REFERENCES public.admin_purge_operations(id) ON DELETE CASCADE,
    item_type text NOT NULL CHECK (item_type IN ('pedido', 'drive_file', 'drive_folder', 'envio_huerfano', 'archivo_huerfano')),
    target_id text NOT NULL,
    pedido_visible text,
    status text NOT NULL CHECK (status IN ('pending', 'deleted', 'already_missing', 'failed')),
    attempts int NOT NULL DEFAULT 0,
    last_error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_purge_operation_item UNIQUE (operation_id, item_type, target_id)
);

-- Índices de optimización
CREATE INDEX IF NOT EXISTS idx_purge_operations_status ON public.admin_purge_operations(status);
CREATE INDEX IF NOT EXISTS idx_purge_operations_idempotency ON public.admin_purge_operations(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_purge_items_op_type_status ON public.admin_purge_items(operation_id, item_type, status);

-- Habilitar RLS
ALTER TABLE public.admin_purge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_purge_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: Solo administradores aprobados o service_role
DROP POLICY IF EXISTS admin_purge_operations_admin_all ON public.admin_purge_operations;
CREATE POLICY admin_purge_operations_admin_all ON public.admin_purge_operations
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = auth.uid()
              AND ua.app_role = 'administrador'
              AND ua.estado_acceso = 'aprobado'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = auth.uid()
              AND ua.app_role = 'administrador'
              AND ua.estado_acceso = 'aprobado'
        )
    );

DROP POLICY IF EXISTS admin_purge_items_admin_all ON public.admin_purge_items;
CREATE POLICY admin_purge_items_admin_all ON public.admin_purge_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = auth.uid()
              AND ua.app_role = 'administrador'
              AND ua.estado_acceso = 'aprobado'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = auth.uid()
              AND ua.app_role = 'administrador'
              AND ua.estado_acceso = 'aprobado'
        )
    );

-- 3. RPC: admin_purge_operation_init
CREATE OR REPLACE FUNCTION public.admin_purge_operation_init(
    p_pedido_ids uuid[],
    p_idempotency_key text,
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
    v_existing_op record;
    v_op_id uuid;
    v_pedidos_count int := 0;
    v_pedidos_visibles jsonb := '[]'::jsonb;
    v_envio_ids uuid[] := ARRAY[]::uuid[];
    v_envios_afectados int := 0;
    v_entregas_count int := 0;
    v_revisiones_count int := 0;
    v_archivos_count int := 0;
    v_comunicaciones_count int := 0;
    v_drive_file_ids text[];
    v_drive_folder_ids text[];
    v_file_id text;
    v_folder_id text;
    v_ped_rec record;
BEGIN
    -- Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso, COALESCE(nombre || ' ' || apellido, nombre_usuario, p_actor)
        INTO v_role, v_estado, v_actor_display
        FROM public.usuarios_acceso
        WHERE user_id = v_user_id;

        IF v_role IS DISTINCT FROM 'administrador' OR v_estado IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'FORBIDDEN: Solo administradores aprobados pueden iniciar purga' USING ERRCODE = '42501';
        END IF;
    ELSE
        v_actor_display := p_actor;
    END IF;

    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: idempotency_key es obligatorio' USING ERRCODE = '22023';
    END IF;

    -- 1. Verificar si ya existe operación con la misma clave de idempotencia
    SELECT * INTO v_existing_op
    FROM public.admin_purge_operations
    WHERE idempotency_key = trim(p_idempotency_key);

    IF v_existing_op.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'is_existing', true,
            'operation_id', v_existing_op.id,
            'status', v_existing_op.status,
            'pedidos_count', v_existing_op.pedidos_count,
            'pedidos_visibles', v_existing_op.pedidos_visibles,
            'drive_files_total', v_existing_op.drive_files_total,
            'drive_files_processed', v_existing_op.drive_files_processed,
            'drive_folders_total', v_existing_op.drive_folders_total,
            'drive_folders_processed', v_existing_op.drive_folders_processed,
            'last_error', v_existing_op.last_error
        );
    END IF;

    IF p_pedido_ids IS NULL OR array_length(p_pedido_ids, 1) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Debe especificar al menos un pedido_id' USING ERRCODE = '22023';
    END IF;

    -- 2. Recolectar datos y snapshot de recursos
    SELECT 
        count(*),
        COALESCE(jsonb_agg(p.pedido_visible ORDER BY p.pedido_visible), '[]'::jsonb),
        COALESCE(array_agg(DISTINCT p.envio_id) FILTER (WHERE p.envio_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_pedidos_count, v_pedidos_visibles, v_envio_ids
    FROM public.pedidos p
    WHERE p.id = ANY(p_pedido_ids);

    IF v_pedidos_count = 0 THEN
        RAISE EXCEPTION 'NOT_FOUND: Ninguno de los pedidos especificados existe en la base de datos' USING ERRCODE = 'P0002';
    END IF;

    -- Envíos huérfanos resultantes
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

    -- Entregas
    SELECT count(*) INTO v_entregas_count
    FROM public.entregas_pedido ep WHERE ep.pedido_id = ANY(p_pedido_ids);

    -- Revisiones
    SELECT count(*) INTO v_revisiones_count
    FROM public.revision_pedidos rp WHERE rp.pedido_id = ANY(p_pedido_ids);

    -- Comunicaciones
    SELECT count(*) INTO v_comunicaciones_count
    FROM public.comunicaciones_pedido cp WHERE cp.pedido_id = ANY(p_pedido_ids);

    -- Archivos y Drive File IDs
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
        COALESCE(array_agg(DISTINCT a.drive_file_id) FILTER (WHERE a.drive_file_id IS NOT NULL AND a.drive_file_id <> ''), ARRAY[]::text[])
    INTO v_archivos_count, v_drive_file_ids
    FROM public.archivos a
    JOIN target_archivos ta ON a.id = ta.archivo_id;

    -- Drive Folder IDs
    SELECT COALESCE(array_agg(DISTINCT pdf.drive_folder_id) FILTER (WHERE pdf.drive_folder_id IS NOT NULL AND pdf.drive_folder_id <> ''), ARRAY[]::text[])
    INTO v_drive_folder_ids
    FROM public.pedido_drive_folders pdf
    WHERE pdf.pedido_id = ANY(p_pedido_ids);

    -- 3. Crear registro de Operación
    INSERT INTO public.admin_purge_operations (
        idempotency_key,
        actor_user_id,
        actor_display,
        status,
        pedidos_count,
        pedidos_visibles,
        envios_afectados,
        entregas_count,
        revisiones_count,
        archivos_count,
        comunicaciones_count,
        drive_files_total,
        drive_files_processed,
        drive_folders_total,
        drive_folders_processed,
        started_at
    ) VALUES (
        trim(p_idempotency_key),
        v_user_id,
        v_actor_display,
        'pending',
        v_pedidos_count,
        v_pedidos_visibles,
        v_envios_afectados,
        v_entregas_count,
        v_revisiones_count,
        v_archivos_count,
        v_comunicaciones_count,
        COALESCE(array_length(v_drive_file_ids, 1), 0),
        0,
        COALESCE(array_length(v_drive_folder_ids, 1), 0),
        0,
        now()
    )
    RETURNING id INTO v_op_id;

    -- 4. Registrar cada pedido como item
    FOR v_ped_rec IN (SELECT id, pedido_visible FROM public.pedidos WHERE id = ANY(p_pedido_ids)) LOOP
        INSERT INTO public.admin_purge_items (
            operation_id,
            item_type,
            target_id,
            pedido_visible,
            status
        ) VALUES (
            v_op_id,
            'pedido',
            v_ped_rec.id::text,
            v_ped_rec.pedido_visible,
            'pending'
        );
    END LOOP;

    -- 5. Registrar cada archivo Drive como item
    IF array_length(v_drive_file_ids, 1) > 0 THEN
        FOREACH v_file_id IN ARRAY v_drive_file_ids LOOP
            INSERT INTO public.admin_purge_items (
                operation_id,
                item_type,
                target_id,
                status
            ) VALUES (
                v_op_id,
                'drive_file',
                v_file_id,
                'pending'
            )
            ON CONFLICT (operation_id, item_type, target_id) DO NOTHING;
        END LOOP;
    END IF;

    -- 6. Registrar cada carpeta Drive como item
    IF array_length(v_drive_folder_ids, 1) > 0 THEN
        FOREACH v_folder_id IN ARRAY v_drive_folder_ids LOOP
            INSERT INTO public.admin_purge_items (
                operation_id,
                item_type,
                target_id,
                status
            ) VALUES (
                v_op_id,
                'drive_folder',
                v_folder_id,
                'pending'
            )
            ON CONFLICT (operation_id, item_type, target_id) DO NOTHING;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'is_existing', false,
        'operation_id', v_op_id,
        'status', 'pending',
        'pedidos_count', v_pedidos_count,
        'pedidos_visibles', v_pedidos_visibles,
        'envios_afectados', v_envios_afectados,
        'entregas_count', v_entregas_count,
        'revisiones_count', v_revisiones_count,
        'archivos_count', v_archivos_count,
        'comunicaciones_count', v_comunicaciones_count,
        'drive_files_total', COALESCE(array_length(v_drive_file_ids, 1), 0),
        'drive_folders_total', COALESCE(array_length(v_drive_folder_ids, 1), 0)
    );
END;
$$;

-- 4. RPC: admin_purge_item_update
CREATE OR REPLACE FUNCTION public.admin_purge_item_update(
    p_operation_id uuid,
    p_item_type text,
    p_target_id text,
    p_status text,
    p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_proc_files int := 0;
    v_proc_folders int := 0;
BEGIN
    UPDATE public.admin_purge_items
    SET 
        status = p_status,
        attempts = attempts + 1,
        last_error = p_error,
        processed_at = now()
    WHERE operation_id = p_operation_id
      AND item_type = p_item_type
      AND target_id = p_target_id;

    -- Recalcular métricas de progreso en la operación
    SELECT 
        count(*) FILTER (WHERE item_type = 'drive_file' AND status IN ('deleted', 'already_missing')),
        count(*) FILTER (WHERE item_type = 'drive_folder' AND status IN ('deleted', 'already_missing'))
    INTO v_proc_files, v_proc_folders
    FROM public.admin_purge_items
    WHERE operation_id = p_operation_id;

    UPDATE public.admin_purge_operations
    SET 
        drive_files_processed = v_proc_files,
        drive_folders_processed = v_proc_folders,
        last_error = COALESCE(p_error, last_error)
    WHERE id = p_operation_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. RPC: admin_purge_operation_step_drive
CREATE OR REPLACE FUNCTION public.admin_purge_operation_step_drive(
    p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_op record;
    v_pending_or_failed_count int := 0;
    v_failed_count int := 0;
    v_new_status text;
BEGIN
    SELECT * INTO v_op
    FROM public.admin_purge_operations
    WHERE id = p_operation_id;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Operación no encontrada' USING ERRCODE = 'P0002';
    END IF;

    -- Contar items Drive no resueltos
    SELECT 
        count(*) FILTER (WHERE status IN ('pending', 'failed')),
        count(*) FILTER (WHERE status = 'failed')
    INTO v_pending_or_failed_count, v_failed_count
    FROM public.admin_purge_items
    WHERE operation_id = p_operation_id
      AND item_type IN ('drive_file', 'drive_folder');

    IF v_pending_or_failed_count = 0 THEN
        -- Todos los recursos de Drive fueron eliminados o ya no existían
        v_new_status := 'processing_db';
    ELSE
        -- Hubo fallos en Drive -> No se permite avanzar a DB
        v_new_status := 'drive_partial';
    END IF;

    UPDATE public.admin_purge_operations
    SET 
        status = v_new_status,
        retry_count = retry_count + 1
    WHERE id = p_operation_id;

    RETURN jsonb_build_object(
        'operation_id', p_operation_id,
        'status', v_new_status,
        'pending_or_failed_drive_items', v_pending_or_failed_count,
        'failed_drive_items', v_failed_count
    );
END;
$$;

-- 6. RPC: admin_pedidos_purge (Re-implementada estrictamente vinculada a operation_id)
CREATE OR REPLACE FUNCTION public.admin_pedidos_purge(
    p_operation_id uuid,
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
    v_op record;
    v_pedido_ids uuid[] := ARRAY[]::uuid[];
    v_envio_ids uuid[] := ARRAY[]::uuid[];
    v_archivo_ids uuid[] := ARRAY[]::uuid[];
    v_unresolved_drive int := 0;
    v_deleted_count int := 0;
BEGIN
    -- Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso, COALESCE(nombre || ' ' || apellido, nombre_usuario, p_actor)
        INTO v_role, v_estado, v_actor_display
        FROM public.usuarios_acceso
        WHERE user_id = v_user_id;

        IF v_role IS DISTINCT FROM 'administrador' OR v_estado IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'FORBIDDEN: Solo administradores aprobados pueden ejecutar la purga masiva' USING ERRCODE = '42501';
        END IF;
    ELSE
        v_actor_display := p_actor;
    END IF;

    -- 1. Validar que la operación exista
    SELECT * INTO v_op
    FROM public.admin_purge_operations
    WHERE id = p_operation_id;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Operación de purga no encontrada' USING ERRCODE = 'P0002';
    END IF;

    IF v_op.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_completed', true,
            'deleted_count', v_op.pedidos_count,
            'operation_id', p_operation_id
        );
    END IF;

    -- 2. VERIFICACIÓN CRÍTICA DE CONSISTENCIA EXTERNA:
    -- Comprobar que NO existan items Drive pendientes o fallidos
    SELECT count(*)
    INTO v_unresolved_drive
    FROM public.admin_purge_items
    WHERE operation_id = p_operation_id
      AND item_type IN ('drive_file', 'drive_folder')
      AND status NOT IN ('deleted', 'already_missing');

    IF v_unresolved_drive > 0 THEN
        UPDATE public.admin_purge_operations
        SET status = 'drive_partial',
            last_error = 'Intento de purga DB bloqueado: existen recursos de Google Drive pendientes o fallidos'
        WHERE id = p_operation_id;

        RAISE EXCEPTION 'DRIVE_RESOURCES_PENDING: No se puede purgar la base de datos mientras haya recursos de Google Drive sin limpiar (% pendientes)', v_unresolved_drive
        USING ERRCODE = '55000';
    END IF;

    -- 3. Extraer los UUIDs de pedidos asociados a la operación
    SELECT array_agg(target_id::uuid)
    INTO v_pedido_ids
    FROM public.admin_purge_items
    WHERE operation_id = p_operation_id
      AND item_type = 'pedido';

    IF v_pedido_ids IS NULL OR array_length(v_pedido_ids, 1) = 0 THEN
        UPDATE public.admin_purge_operations
        SET status = 'completed', completed_at = now()
        WHERE id = p_operation_id;

        RETURN jsonb_build_object('success', true, 'deleted_count', 0, 'operation_id', p_operation_id);
    END IF;

    -- 4. Identificar envíos y archivos vinculados
    SELECT COALESCE(array_agg(DISTINCT p.envio_id) FILTER (WHERE p.envio_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_envio_ids
    FROM public.pedidos p
    WHERE p.id = ANY(v_pedido_ids);

    WITH target_archivos AS (
        SELECT ap.archivo_id FROM public.archivo_pedido ap WHERE ap.pedido_id = ANY(v_pedido_ids)
        UNION
        SELECT ea.archivo_id FROM public.entrega_archivos ea 
        JOIN public.entregas_pedido ep ON ea.entrega_id = ep.id 
        WHERE ep.pedido_id = ANY(v_pedido_ids)
        UNION
        SELECT ep2.archivo_id FROM public.entregas_pedido ep2 
        WHERE ep2.pedido_id = ANY(v_pedido_ids) AND ep2.archivo_id IS NOT NULL
        UNION
        SELECT ra.archivo_id FROM public.revision_archivos ra 
        JOIN public.revision_solicitudes rs ON ra.revision_solicitud_id = rs.id 
        WHERE rs.envio_id = ANY(v_envio_ids)
        UNION
        SELECT asi.archivo_id FROM public.archivo_solicitud_informacion asi 
        JOIN public.solicitudes_informacion si ON asi.solicitud_informacion_id = si.id 
        WHERE si.pedido_id = ANY(v_pedido_ids)
    )
    SELECT COALESCE(array_agg(DISTINCT archivo_id) FILTER (WHERE archivo_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_archivo_ids
    FROM target_archivos;

    -- =========================================================================
    -- 5. EJECUCIÓN ATÓMICA DE PURGA EN POSTGRESQL (Orden estricto de dependencias)
    -- =========================================================================

    -- A. Revisiones
    DELETE FROM public.revision_archivos WHERE archivo_id = ANY(v_archivo_ids);
    DELETE FROM public.revision_pedidos WHERE pedido_id = ANY(v_pedido_ids);
    IF array_length(v_envio_ids, 1) > 0 THEN
        DELETE FROM public.revision_solicitudes rs
        WHERE rs.envio_id = ANY(v_envio_ids)
          AND NOT EXISTS (
              SELECT 1 FROM public.pedidos p_other 
              WHERE p_other.envio_id = rs.envio_id AND NOT (p_other.id = ANY(v_pedido_ids))
          );
    END IF;

    -- B. Entregas
    DELETE FROM public.entrega_archivos WHERE entrega_id IN (SELECT id FROM public.entregas_pedido WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.entregas_pedido WHERE pedido_id = ANY(v_pedido_ids);

    -- C. Solicitudes de Información
    DELETE FROM public.archivo_solicitud_informacion WHERE solicitud_informacion_id IN (SELECT id FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.enlace_solicitud_informacion WHERE solicitud_informacion_id IN (SELECT id FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids);

    -- D. Archivos de Pedido y Enlaces de Pedido
    DELETE FROM public.archivo_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.enlace_pedido WHERE pedido_id = ANY(v_pedido_ids);

    -- E. Asignaciones, Notas, Carpetas de Drive y Upload Reservations
    DELETE FROM public.pedido_asignaciones WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.notas_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.pedido_drive_folders WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.upload_reservations WHERE pedido_id = ANY(v_pedido_ids);

    -- F. Comunicaciones y Eventos de Dominio
    DELETE FROM public.comunicaciones_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.domain_events WHERE aggregate_id = ANY(v_pedido_ids);

    -- G. Pedidos (Dispara eventos DELETE para Supabase Realtime)
    DELETE FROM public.pedidos WHERE id = ANY(v_pedido_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- H. Limpieza de envíos huérfanos
    IF array_length(v_envio_ids, 1) > 0 THEN
        DELETE FROM public.envios_formulario ef
        WHERE ef.id = ANY(v_envio_ids)
          AND NOT EXISTS (SELECT 1 FROM public.pedidos p_rem WHERE p_rem.envio_id = ef.id);
    END IF;

    -- I. Limpieza de archivos huérfanos
    IF array_length(v_archivo_ids, 1) > 0 THEN
        DELETE FROM public.archivos a
        WHERE a.id = ANY(v_archivo_ids)
          AND NOT EXISTS (SELECT 1 FROM public.archivo_pedido ap WHERE ap.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.entrega_archivos ea WHERE ea.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.entregas_pedido ep WHERE ep.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.revision_archivos ra WHERE ra.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.archivo_solicitud_informacion asi WHERE asi.archivo_id = a.id);
    END IF;

    -- 6. Actualizar estado de items y de la operación
    UPDATE public.admin_purge_items
    SET status = 'deleted', processed_at = now()
    WHERE operation_id = p_operation_id
      AND item_type = 'pedido';

    UPDATE public.admin_purge_operations
    SET status = 'completed',
        completed_at = now()
    WHERE id = p_operation_id;

    -- 7. Registro en Audit Log
    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_user_id,
        'ADMIN_BULK_DELETE_PEDIDOS',
        'admin_purge_operations',
        p_operation_id::text,
        jsonb_build_object(
            'operation_id', p_operation_id,
            'idempotency_key', v_op.idempotency_key,
            'actor_display', v_actor_display,
            'pedidos_eliminados_count', v_deleted_count,
            'pedidos_visibles', v_op.pedidos_visibles,
            'drive_files_cleaned', v_op.drive_files_processed,
            'drive_folders_cleaned', v_op.drive_folders_processed,
            'executed_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'operation_id', p_operation_id,
        'deleted_count', v_deleted_count,
        'pedidos_visibles', v_op.pedidos_visibles
    );
END;
$$;
