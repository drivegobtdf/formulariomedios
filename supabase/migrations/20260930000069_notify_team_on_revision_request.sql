-- =============================================================================
-- Migration: 20260930000069_notify_team_on_revision_request.sql
-- Description:
-- 1. Actualiza public.pedido_request_revision para encolar una comunicación
--    outbox hacia el integrante del equipo correspondiente (entregado_por de
--    la entrega cuestionada o responsable_user_id del pedido) cuando el
--    solicitante pide una revisión/retrabajo de un pedido finalizado.
-- 2. Garantiza idempotencia mediante clave única por pedido, número de revisión
--    y usuario destinatario.
-- 3. Verifica que el usuario interno posea estado_acceso = 'aprobado' y correo válido.
-- =============================================================================

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
    v_target_user_id uuid;
    v_team_recipient RECORD;
    v_team_comm_id uuid;
    v_team_idempotency_key text;
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

    -- 7. Obtener entrega vigente cuestionada y su entregador
    SELECT id, version, entregado_por INTO v_entrega
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

    -- 12. Encolar Comunicación Outbox F10 para el Solicitante (Confirmación)
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

    -- 13. Encolar Notificación al Integrante del Equipo (Responsable / Finalizador)
    v_target_user_id := COALESCE(v_entrega.entregado_por, v_pedido.responsable_user_id);
    IF v_target_user_id IS NOT NULL THEN
        SELECT 
            ua.user_id,
            ua.nombre,
            ua.apellido,
            ua.app_role,
            au.email
        INTO v_team_recipient
        FROM public.usuarios_acceso ua
        JOIN auth.users au ON ua.user_id = au.id
        WHERE ua.user_id = v_target_user_id
          AND ua.estado_acceso = 'aprobado'
          AND au.email IS NOT NULL;

        IF v_team_recipient.user_id IS NOT NULL AND v_team_recipient.email IS NOT NULL THEN
            v_team_comm_id := gen_random_uuid();
            v_team_idempotency_key := 'pedido_retrabajo_solicitado:' || v_pedido.id::text || ':' || v_rev_num::text || ':' || v_team_recipient.user_id::text;

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
                v_team_comm_id,
                v_pedido.envio_id,
                v_pedido.id,
                'pedido_retrabajo_solicitado',
                lower(trim(v_team_recipient.email)),
                'pendiente',
                0,
                3,
                v_team_idempotency_key,
                jsonb_build_object(
                    'intent_type', 'pedido_retrabajo_solicitado',
                    'pedido_id', v_pedido.id,
                    'pedido_visible', v_pedido.pedido_visible,
                    'categoria', v_pedido.categoria_nombre,
                    'tipo', v_pedido.tipo_nombre,
                    'solicitante_nombre', v_pedido.nombre_apellido,
                    'area_solicitante', v_pedido.area_solicitante,
                    'revision_number', v_rev_num,
                    'motivo', v_clean_motivo,
                    'archivos_count', v_archivos_count,
                    'nombre_apellido', trim(v_team_recipient.nombre || ' ' || v_team_recipient.apellido),
                    'responsable_id', v_team_recipient.user_id
                ),
                now()
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END IF;
    END IF;

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
