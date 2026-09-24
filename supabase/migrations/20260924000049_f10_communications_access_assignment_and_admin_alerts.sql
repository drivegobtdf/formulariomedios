-- =============================================================================
-- Migración 049: F10 Outbox Communications — Access Approval, Order Assignment, and Admin Alerts
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- =============================================================================

-- 1. Helper de Encolado: Notificación de Aprobación de Acceso Operativo
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_access_approved(
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_user RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
BEGIN
    SELECT 
        ua.user_id,
        ua.nombre,
        ua.apellido,
        ua.nombre_usuario,
        ua.app_role,
        ua.estado_acceso,
        ua.aprobado_at,
        au.email
    INTO v_user
    FROM public.usuarios_acceso ua
    JOIN auth.users au ON ua.user_id = au.id
    WHERE ua.user_id = p_user_id;

    IF v_user.user_id IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Usuario % no encontrado en perfiles internos', p_user_id USING ERRCODE = 'P0002';
    END IF;

    IF v_user.email IS NULL OR trim(v_user.email) = '' THEN
        RAISE EXCEPTION 'USER_EMAIL_MISSING: El usuario % no posee correo electrónico registrado', p_user_id USING ERRCODE = '23502';
    END IF;

    v_idempotency_key := 'acceso_aprobado:' || p_user_id::text;
    v_comm_id := gen_random_uuid();

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
        NULL,
        NULL,
        'acceso_aprobado',
        lower(trim(v_user.email)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'acceso_aprobado',
            'user_id', p_user_id,
            'nombre_apellido', trim(v_user.nombre || ' ' || v_user.apellido),
            'nombre', v_user.nombre,
            'apellido', v_user.apellido,
            'nombre_usuario', v_user.nombre_usuario,
            'app_role', v_user.app_role,
            'aprobado_at', COALESCE(v_user.aprobado_at, now())
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

-- 2. Helper de Encolado: Notificación de Asignación de Responsable por Pedido
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_pedido_assigned(
    p_pedido_id uuid,
    p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_assignee_id uuid;
    v_assignee RECORD;
    v_ped RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
    v_version text;
BEGIN
    v_assignee_id := NULLIF(p_payload->>'responsable_nuevo_id', '')::uuid;
    IF v_assignee_id IS NULL THEN
        RETURN NULL; -- Asignación desasignada / vacía, no encolar email
    END IF;

    -- Obtener datos del operador asignado
    SELECT 
        ua.user_id,
        ua.nombre,
        ua.apellido,
        ua.nombre_usuario,
        au.email
    INTO v_assignee
    FROM public.usuarios_acceso ua
    JOIN auth.users au ON ua.user_id = au.id
    WHERE ua.user_id = v_assignee_id;

    IF v_assignee.user_id IS NULL OR v_assignee.email IS NULL THEN
        RETURN NULL; -- Operador no encontrado o sin email, omitir silenciosamente
    END IF;

    -- Obtener datos del pedido
    SELECT 
        p.id,
        p.pedido_visible,
        p.fecha_limite,
        c.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        e.area_solicitante,
        e.nombre_apellido AS solicitante_nombre
    INTO v_ped
    FROM public.pedidos p
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    LEFT JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE p.id = p_pedido_id;

    IF v_ped.id IS NULL THEN
        RETURN NULL;
    END IF;

    v_version := COALESCE(p_payload->>'version', '1');
    v_idempotency_key := 'pedido_asignado:' || p_pedido_id::text || ':' || v_assignee_id::text || ':' || v_version;
    v_comm_id := gen_random_uuid();

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
        NULL,
        p_pedido_id,
        'pedido_asignado',
        lower(trim(v_assignee.email)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', 'pedido_asignado',
            'pedido_id', p_pedido_id,
            'pedido_visible', v_ped.pedido_visible,
            'categoria', v_ped.categoria_nombre,
            'tipo', v_ped.tipo_nombre,
            'area_solicitante', v_ped.area_solicitante,
            'solicitante_nombre', v_ped.solicitante_nombre,
            'fecha_limite', v_ped.fecha_limite,
            'nombre_apellido', trim(v_assignee.nombre || ' ' || v_assignee.apellido),
            'responsable_id', v_assignee_id,
            'motivo', p_payload->>'motivo',
            'version', v_version
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

-- 3. Helper de Encolado: Alerta a Administradores Activos de Nueva Solicitud Recibida (por Pedido Individual)
CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_admin_new_submission(
    p_envio_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_envio RECORD;
    v_ped RECORD;
    v_admin RECORD;
    v_enqueued_count integer := 0;
    v_idempotency_key text;
    v_comm_id uuid;
BEGIN
    SELECT id, correo, nombre_apellido, area_solicitante, created_at
    INTO v_envio
    FROM public.envios_formulario
    WHERE id = p_envio_id;

    IF v_envio.id IS NULL THEN
        RETURN 0;
    END IF;

    -- Iterar por cada pedido generado en este envío
    FOR v_ped IN
        SELECT 
            p.id,
            p.pedido_visible,
            p.fecha_limite,
            c.nombre AS categoria_nombre,
            ts.nombre AS tipo_nombre
        FROM public.pedidos p
        JOIN public.categorias_servicio c ON p.categoria_id = c.id
        JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
        WHERE p.envio_id = p_envio_id
        ORDER BY p.created_at ASC
    LOOP
        -- Iterar por cada administrador activo y aprobado (rol estricto: administrador)
        FOR v_admin IN 
            SELECT ua.user_id, ua.nombre, ua.apellido, au.email
            FROM public.usuarios_acceso ua
            JOIN auth.users au ON ua.user_id = au.id
            WHERE ua.estado_acceso = 'aprobado' 
              AND ua.app_role = 'administrador'
              AND au.email IS NOT NULL
              AND trim(au.email) <> ''
        LOOP
            v_idempotency_key := 'pedido_nuevo_admin:' || v_ped.id::text || ':' || v_admin.user_id::text;
            v_comm_id := gen_random_uuid();

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
                p_envio_id,
                v_ped.id,
                'pedido_nuevo_admin',
                lower(trim(v_admin.email)),
                'pendiente',
                0,
                3,
                v_idempotency_key,
                jsonb_build_object(
                    'intent_type', 'pedido_nuevo_admin',
                    'envio_id', p_envio_id,
                    'pedido_id', v_ped.id,
                    'pedido_visible', v_ped.pedido_visible,
                    'categoria', v_ped.categoria_nombre,
                    'tipo', v_ped.tipo_nombre,
                    'fecha_limite', v_ped.fecha_limite,
                    'solicitante', v_envio.nombre_apellido,
                    'nombre_apellido', trim(v_admin.nombre || ' ' || v_admin.apellido),
                    'area_solicitante', v_envio.area_solicitante,
                    'correo', v_envio.correo
                ),
                now()
            )
            ON CONFLICT (idempotency_key) DO NOTHING;

            v_enqueued_count := v_enqueued_count + 1;
        END LOOP;
    END LOOP;

    RETURN v_enqueued_count;
END;
$$;

-- 4. Actualizar admin_approve_user para registrar domain event y encolar notificación
CREATE OR REPLACE FUNCTION public.admin_approve_user(
    p_user_id uuid,
    p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_old_state text;
    v_old_role text;
    v_username text;
BEGIN
    -- Verificar autorización del invocador
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador' USING ERRCODE = '42501';
    END IF;

    -- Validar rol objetivo
    IF p_role NOT IN ('administrador', 'equipo', 'observador') THEN
        RAISE EXCEPTION 'Rol de aplicación no válido: %', p_role USING ERRCODE = '23514';
    END IF;

    -- Obtener datos actuales del usuario
    SELECT estado_acceso, app_role, nombre_usuario 
    INTO v_old_state, v_old_role, v_username
    FROM public.usuarios_acceso
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- Actualizar acceso
    UPDATE public.usuarios_acceso
    SET estado_acceso = 'aprobado',
        app_role = p_role,
        aprobado_at = now(),
        aprobado_por = v_actor_id,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Registrar auditoría
    INSERT INTO public.audit_log (
        actor_user_id,
        accion,
        recurso_tipo,
        recurso_id,
        metadata
    ) VALUES (
        v_actor_id,
        'user.approved',
        'usuarios_acceso',
        p_user_id::text,
        jsonb_build_object(
            'old_state', v_old_state,
            'new_state', 'aprobado',
            'old_role', v_old_role,
            'new_role', p_role,
            'username', v_username
        )
    );

    -- Emitir evento de dominio
    INSERT INTO public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload,
        actor_user_id,
        created_at
    ) VALUES (
        'user.approved',
        'user',
        p_user_id,
        jsonb_build_object(
            'user_id', p_user_id,
            'app_role', p_role,
            'old_role', v_old_role,
            'username', v_username
        ),
        v_actor_id,
        now()
    );

    -- Encolar notificación en outbox de comunicaciones
    PERFORM public.comunicacion_enqueue_access_approved(p_user_id);

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'estado_acceso', 'aprobado',
        'app_role', p_role
    );
END;
$$;

-- 5. Actualizar trg_domain_event_auto_enqueue para enrutamiento automático centralizado
CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        -- Encolar confirmación para el solicitante
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
        -- Encolar alerta a todos los administradores activos
        PERFORM public.comunicacion_enqueue_admin_new_submission(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.assigned' THEN
        -- Encolar notificación al responsable asignado
        PERFORM public.comunicacion_enqueue_pedido_assigned(NEW.aggregate_id, NEW.payload);
    ELSIF NEW.event_name = 'user.approved' THEN
        -- Encolar notificación de acceso aprobado al usuario interno
        PERFORM public.comunicacion_enqueue_access_approved(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.info_responded' THEN
        PERFORM public.comunicacion_enqueue_info_responded(
            NEW.aggregate_id,
            (NEW.payload->>'solicitud_id')::uuid
        );
    ELSIF NEW.event_name = 'pedido.finalized' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'finalizado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.cancelled' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'cancelado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.state_changed' THEN
        -- Notificar únicamente cuando la transición confirmada sea hacia 'En proceso'
        IF (NEW.payload->>'estado_nuevo') = 'En proceso' AND COALESCE(NEW.payload->>'estado_anterior', '') <> 'En proceso' THEN
            PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'en_proceso', NEW.payload);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 6. Permisos y PoLP
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_access_approved(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_access_approved(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_pedido_assigned(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_pedido_assigned(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_admin_new_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_admin_new_submission(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_approve_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, text) TO authenticated;
