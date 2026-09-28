-- ==============================================================================
-- MIGRATION 052: F10 Admin Requeue Mechanism for Failed Communications
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. RPC: comunicacion_admin_requeue
-- Permite a un administrador del sistema o al rol de servicio reencolar
-- de manera segura, idempotente y auditada una comunicación fallida legítima.
-- Preserva la inmutabilidad de la fila fallida original y genera una nueva
-- entrega encolada ('pendiente') vinculada bidireccionalmente.

CREATE OR REPLACE FUNCTION public.comunicacion_admin_requeue(
    p_communication_id uuid,
    p_reason text,
    p_override_recipient text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_is_authorized boolean := false;
    v_orig public.comunicaciones_pedido%ROWTYPE;
    v_target_email text;
    v_new_comm_id uuid;
    v_new_idempotency_key text;
    v_new_payload jsonb;
    v_existing_child RECORD;
    v_user RECORD;
    v_ped RECORD;
    v_user_id uuid;
    v_pedido_id uuid;
    v_responsable_id uuid;
BEGIN
    -- 1. Verificación Estricta de Autorización (PoLP)
    IF auth.role() = 'service_role' OR current_user = 'postgres' THEN
        v_is_authorized := true;
    ELSIF v_actor_id IS NOT NULL THEN
        v_is_authorized := private.is_admin();
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Se requiere rol de administrador para reprocesar comunicaciones' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación de Parámetros de Entrada
    IF p_communication_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_communication_id es obligatorio' USING ERRCODE = '22023';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Debe especificarse un motivo de reprocesamiento válido (mínimo 5 caracteres)' USING ERRCODE = '22023';
    END IF;

    -- 3. Bloqueo FOR UPDATE y Validación de Estado de la Comunicación Original
    SELECT * INTO v_orig
    FROM public.comunicaciones_pedido
    WHERE id = p_communication_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMMUNICATION_NOT_FOUND: Comunicación % no encontrada', p_communication_id USING ERRCODE = 'P0002';
    END IF;

    -- Solo se permite reencolar comunicaciones en estado terminal 'fallida'
    IF v_orig.estado = 'enviada' THEN
        RAISE EXCEPTION 'CANNOT_REQUEUE_SENT: La comunicación % ya fue enviada exitosamente (sent_at: %)', p_communication_id, v_orig.sent_at USING ERRCODE = '22000';
    ELSIF v_orig.estado IN ('pendiente', 'processing', 'retry_wait') THEN
        RAISE EXCEPTION 'CANNOT_REQUEUE_IN_FLIGHT: La comunicación % se encuentra en proceso o pendiente de despacho (estado: %)', p_communication_id, v_orig.estado USING ERRCODE = '22000';
    ELSIF v_orig.estado = 'cancelada' THEN
        RAISE EXCEPTION 'CANNOT_REQUEUE_CANCELLED: La comunicación % fue cancelada y no es elegible para reprocesamiento', p_communication_id USING ERRCODE = '22000';
    ELSIF v_orig.estado = 'uncertain' THEN
        RAISE EXCEPTION 'CANNOT_REQUEUE_UNCERTAIN: La comunicación % está en estado incierto. Utilice comunicacion_reconcile_uncertain', p_communication_id USING ERRCODE = '22000';
    ELSIF v_orig.estado <> 'fallida' THEN
        RAISE EXCEPTION 'INVALID_COMMUNICATION_STATE: Estado % no permite reprocesamiento', v_orig.estado USING ERRCODE = '22000';
    END IF;

    -- 4. Salvaguardas de Integridad de Entrega Externa
    IF v_orig.sent_at IS NOT NULL THEN
        RAISE EXCEPTION 'DELIVERY_INTEGRITY_VIOLATION: La comunicación posee sent_at (%) pero estado fallida. Requiere investigación manual.', v_orig.sent_at USING ERRCODE = '22000';
    END IF;

    IF v_orig.provider_message_id IS NOT NULL AND trim(v_orig.provider_message_id) <> '' THEN
        RAISE EXCEPTION 'DELIVERY_INTEGRITY_VIOLATION: La comunicación posee provider_message_id (%) pero estado fallida. Requiere investigación manual.', v_orig.provider_message_id USING ERRCODE = '22000';
    END IF;

    -- 5. Control de Duplicación e Idempotencia Administrativa
    -- Verificar si ya existe una entrega hija activa o completada derivada de esta comunicación
    SELECT id, estado, created_at INTO v_existing_child
    FROM public.comunicaciones_pedido
    WHERE payload->>'requeue_from_id' = p_communication_id::text
      AND estado IN ('pendiente', 'processing', 'retry_wait', 'enviada')
    LIMIT 1;

    IF v_existing_child.id IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEUE: La comunicación % ya fue reprocesada previamente en la entrega % (estado actual: %)', p_communication_id, v_existing_child.id, v_existing_child.estado USING ERRCODE = '23505';
    END IF;

    -- 6. Validación de Vigencia del Evento Operativo
    IF v_orig.tipo_comunicacion IN ('acceso_aprobado', 'user_access_approved', 'user_approved') THEN
        v_user_id := NULLIF(v_orig.payload->>'user_id', '')::uuid;
        IF v_user_id IS NOT NULL THEN
            SELECT ua.user_id, ua.estado_acceso, ua.app_role, au.email
            INTO v_user
            FROM public.usuarios_acceso ua
            JOIN auth.users au ON ua.user_id = au.id
            WHERE ua.user_id = v_user_id;

            IF v_user.user_id IS NULL THEN
                RAISE EXCEPTION 'EVENT_NOT_VALID: El usuario asociado (%) no existe en el sistema', v_user_id USING ERRCODE = 'P0002';
            END IF;

            IF v_user.estado_acceso <> 'aprobado' THEN
                RAISE EXCEPTION 'EVENT_NOT_VALID: El acceso del usuario % ya no está aprobado (estado actual: %)', v_user_id, v_user.estado_acceso USING ERRCODE = '22000';
            END IF;
        END IF;

    ELSIF v_orig.tipo_comunicacion IN ('pedido_asignado', 'pedido_assigned', 'assignment_notification') THEN
        v_pedido_id := v_orig.pedido_id;
        v_responsable_id := NULLIF(v_orig.payload->>'responsable_id', '')::uuid;

        IF v_pedido_id IS NOT NULL THEN
            SELECT id, pedido_visible, responsable_user_id, estado
            INTO v_ped
            FROM public.pedidos
            WHERE id = v_pedido_id;

            IF v_ped.id IS NULL THEN
                RAISE EXCEPTION 'EVENT_NOT_VALID: El pedido asociado (%) ya no existe', v_pedido_id USING ERRCODE = 'P0002';
            END IF;

            IF v_responsable_id IS NOT NULL AND (v_ped.responsable_user_id IS NULL OR v_ped.responsable_user_id <> v_responsable_id) THEN
                RAISE EXCEPTION 'EVENT_NOT_VALID: El pedido % ya no está asignado al operador indicado (responsable actual: %)', v_ped.pedido_visible, COALESCE(v_ped.responsable_user_id::text, 'sin asignar') USING ERRCODE = '22000';
            END IF;
        END IF;
    END IF;

    -- 7. Determinación y Validación de Destinatario
    IF p_override_recipient IS NOT NULL AND trim(p_override_recipient) <> '' THEN
        v_target_email := lower(trim(p_override_recipient));
    ELSE
        v_target_email := lower(trim(v_orig.destinatario_email));
    END IF;

    IF v_target_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'INVALID_EMAIL: Formato de correo electrónico inválido: %', v_target_email USING ERRCODE = '23514';
    END IF;

    -- 8. Construcción de la Nueva Entrega Encolada
    v_new_comm_id := gen_random_uuid();
    v_new_idempotency_key := COALESCE(v_orig.idempotency_key, v_orig.id::text) || ':requeue:' || extract(epoch from now())::bigint;

    v_new_payload := COALESCE(v_orig.payload, '{}'::jsonb) || jsonb_build_object(
        'requeue_from_id', p_communication_id,
        'requeue_reason', trim(p_reason),
        'requeued_by', v_actor_id,
        'requeued_at', now()
    );

    -- Insertar la nueva comunicación lista para reclamo por el despachador
    INSERT INTO public.comunicaciones_pedido (
        id,
        pedido_id,
        envio_id,
        event_id,
        tipo_comunicacion,
        destinatario_email,
        estado,
        attempts,
        max_attempts,
        idempotency_key,
        payload,
        created_at
    ) VALUES (
        v_new_comm_id,
        v_orig.pedido_id,
        v_orig.envio_id,
        v_orig.event_id,
        v_orig.tipo_comunicacion,
        v_target_email,
        'pendiente',
        0,
        COALESCE(v_orig.max_attempts, 3),
        v_new_idempotency_key,
        v_new_payload,
        now()
    );

    -- 9. Enlace de Trazabilidad en la Comunicación Original
    UPDATE public.comunicaciones_pedido
    SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{requeued_as}', to_jsonb(v_new_comm_id::text)),
        updated_at = now()
    WHERE id = p_communication_id;

    -- 10. Registro Inmutable en Audit Log
    INSERT INTO public.audit_log (
        actor_user_id,
        recurso_tipo,
        recurso_id,
        accion,
        metadata
    ) VALUES (
        v_actor_id,
        'comunicaciones_pedido',
        p_communication_id::text,
        'comunicacion.admin_requeue',
        jsonb_build_object(
            'original_id', p_communication_id,
            'new_id', v_new_comm_id,
            'tipo_comunicacion', v_orig.tipo_comunicacion,
            'destinatario', v_target_email,
            'reason', trim(p_reason),
            'original_error', v_orig.error_message,
            'original_created_at', v_orig.created_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'original_id', p_communication_id,
        'requeued_id', v_new_comm_id,
        'tipo_comunicacion', v_orig.tipo_comunicacion,
        'destinatario_email', v_target_email,
        'estado', 'pendiente',
        'idempotency_key', v_new_idempotency_key
    );
END;
$$;

-- Permisos y Políticas de Ejecución (PoLP)
REVOKE ALL ON FUNCTION public.comunicacion_admin_requeue(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicacion_admin_requeue(uuid, text, text) TO authenticated, service_role;
