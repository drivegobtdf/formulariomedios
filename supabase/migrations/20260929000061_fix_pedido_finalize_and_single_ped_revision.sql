-- Migration: 20260929000061_fix_pedido_finalize_and_single_ped_revision.sql
-- Description:
-- 1. Elimina ambigüedad de sobrecargas de public.pedido_finalize en PostgREST (integer vs bigint).
-- 2. Establece la RPC canónica única public.pedido_finalize.
-- 3. Implementa RPC canónica public.pedido_request_revision para el flujo enfocado de revisión individual por PED.
-- 4. Preserva compatibilidad con la estructura normalizada de datos (revision_solicitudes, revision_pedidos, revision_archivos).

-- ============================================================================
-- 1. ELIMINACIÓN DE SOBRECARGAS CONFLICTIVAS DE public.pedido_finalize
-- ============================================================================

DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, integer, uuid[], text, text);
DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, bigint, uuid[], text, text);

-- ============================================================================
-- 2. CREACIÓN DE LA VERSIÓN CANÓNICA ÚNICA DE public.pedido_finalize
-- ============================================================================

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

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;


-- ============================================================================
-- 3. RPC CANÓNICA: public.pedido_request_revision (Revisión Individual por PED)
-- ============================================================================

DROP FUNCTION IF EXISTS public.pedido_request_revision(text, uuid, uuid[], text, uuid[]);
DROP FUNCTION IF EXISTS public.pedido_request_revision(text, uuid, text, uuid[]);

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

    -- 11. Registrar en Historial Operativo de Pedidos
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

    -- 12. Registrar Evento de Dominio y Auditoría
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

    -- 13. Encolar Comunicación Outbox F10 para este PED
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

-- 4. Notificar a PostgREST para recargar el esquema inmediatamente
NOTIFY pgrst, 'reload schema';
