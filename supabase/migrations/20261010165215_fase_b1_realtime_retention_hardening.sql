-- ==============================================================================
-- MIGRATION: 20261010165215_fase_b1_realtime_retention_hardening.sql
-- FASE B.1.1: Cierre de Realtime, Retención y Hardening de Seguridad
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
--
-- CARACTERÍSTICAS Y HARDENING:
-- 1. Retención histórica: Foreign key source_event_id modificada a ON DELETE SET NULL.
--    Permite preservar las notificaciones de usuario aún si los domain_events son depurados.
-- 2. Permisos y PoLP: Revocación explícita de EXECUTE en PUBLIC, anon y authenticated
--    para notification_dispatch_from_domain_event y la función del trigger.
-- 3. Robustez y Aislamiento: Manejo explícito de eventos no relacionados (retorno limpio),
--    destinatarios no habilitados/observadores, sin ocultar excepciones estructurales
--    graves de base de datos.
-- 4. Cumplimiento de search_path = '' y calificación completa de esquemas.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RETENCIÓN: ALTERAR FOREIGN KEY DE source_event_id A ON DELETE SET NULL
-- ------------------------------------------------------------------------------
ALTER TABLE public.notificaciones_usuario
    DROP CONSTRAINT IF EXISTS notificaciones_usuario_source_event_id_fkey;

ALTER TABLE public.notificaciones_usuario
    ADD CONSTRAINT notificaciones_usuario_source_event_id_fkey
    FOREIGN KEY (source_event_id) REFERENCES public.domain_events(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 2. DISPATCHER TRIGGER FUNCTION: trg_domain_event_notifications
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_domain_event_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.notification_dispatch_from_domain_event(
        NEW.id,
        NEW.event_name,
        NEW.aggregate_id,
        NEW.payload,
        NEW.actor_user_id
    );
    RETURN NEW;
END;
$$;

-- Revocación de permisos de API externa para el trigger
REVOKE ALL ON FUNCTION public.trg_domain_event_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_domain_event_notifications() TO service_role;

-- ------------------------------------------------------------------------------
-- 3. GENERADOR CENTRAL: notification_dispatch_from_domain_event
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_dispatch_from_domain_event(
    p_event_id uuid,
    p_event_name text,
    p_aggregate_id uuid,
    p_payload jsonb,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pedido RECORD;
    v_dest_user_id uuid;
    v_admin_record RECORD;
    v_idempotency_key text;
    v_summary text;
    v_metadata jsonb;
BEGIN
    -- 0. Ignorar limpiamente eventos de dominio que no correspondan a notificaciones
    IF p_event_name NOT IN (
        'pedido.assigned',
        'pedido.info_responded',
        'pedido.info_responded_unassigned',
        'pedido.revision_solicitada',
        'pedido.nota_created'
    ) THEN
        RETURN;
    END IF;

    -- =========================================================================
    -- CASO A: ASIGNACIÓN / REASIGNACIÓN ('pedido.assigned')
    -- =========================================================================
    IF p_event_name = 'pedido.assigned' THEN
        v_dest_user_id := (p_payload->>'responsable_nuevo_id')::uuid;
        IF v_dest_user_id IS NULL THEN
            RETURN;
        END IF;

        -- Validar que el responsable sea operativo y aprobado (excluye observadores y pendientes)
        IF NOT EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = v_dest_user_id
              AND ua.estado_acceso = 'aprobado'
              AND ua.app_role IN ('administrador', 'equipo')
        ) THEN
            RETURN;
        END IF;

        SELECT p.id, p.pedido_visible INTO v_pedido
        FROM public.pedidos p
        WHERE p.id = p_aggregate_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        v_idempotency_key := 'notif:assigned:' || p_event_id::text || ':' || v_dest_user_id::text;
        v_summary := 'Te asignaron ' || v_pedido.pedido_visible;
        v_metadata := jsonb_build_object(
            'pedido_visible', v_pedido.pedido_visible,
            'section', 'header',
            'mensaje_resumen', v_summary,
            'asignado_por', p_actor_id
        );

        INSERT INTO public.notificaciones_usuario (
            user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
        ) VALUES (
            v_dest_user_id, p_aggregate_id, 'pedido_asignado', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- =========================================================================
    -- CASO B: INFORMACIÓN 48 H RESPONDIDA
    -- =========================================================================
    ELSIF p_event_name IN ('pedido.info_responded', 'pedido.info_responded_unassigned') THEN
        SELECT p.id, p.pedido_visible, p.responsable_user_id INTO v_pedido
        FROM public.pedidos p
        WHERE p.id = p_aggregate_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        v_dest_user_id := COALESCE(
            NULLIF(p_payload->>'responsable_user_id', '')::uuid,
            v_pedido.responsable_user_id
        );

        -- Validar si el responsable es operativo y aprobado
        IF v_dest_user_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.usuarios_acceso ua
                WHERE ua.user_id = v_dest_user_id
                  AND ua.estado_acceso = 'aprobado'
                  AND ua.app_role IN ('administrador', 'equipo')
            ) THEN
                v_dest_user_id := NULL;
            END IF;
        END IF;

        IF v_dest_user_id IS NOT NULL THEN
            -- Notificar exclusivamente al responsable vigente
            v_idempotency_key := 'notif:info_resp:' || p_event_id::text || ':' || v_dest_user_id::text;
            v_summary := 'Respondieron la información solicitada de ' || v_pedido.pedido_visible;
            v_metadata := jsonb_build_object(
                'pedido_visible', v_pedido.pedido_visible,
                'section', 'info_solicitada',
                'solicitud_id', p_payload->>'solicitud_id',
                'is_tardia', COALESCE((p_payload->>'is_tardia')::boolean, false),
                'mensaje_resumen', v_summary
            );

            INSERT INTO public.notificaciones_usuario (
                user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
            ) VALUES (
                v_dest_user_id, p_aggregate_id, 'info_respondida', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        ELSE
            -- CASO SIN RESPONSABLE VÁLIDO: Notificar a todos los administradores activos/aprobados
            FOR v_admin_record IN
                SELECT ua.user_id
                FROM public.usuarios_acceso ua
                WHERE ua.app_role = 'administrador'
                  AND ua.estado_acceso = 'aprobado'
            LOOP
                v_idempotency_key := 'notif:info_resp_unassigned:' || p_event_id::text || ':' || v_admin_record.user_id::text;
                v_summary := 'Respondieron la información solicitada de ' || v_pedido.pedido_visible || ' (sin responsable asignado)';
                v_metadata := jsonb_build_object(
                    'pedido_visible', v_pedido.pedido_visible,
                    'section', 'info_solicitada',
                    'solicitud_id', p_payload->>'solicitud_id',
                    'is_unassigned', true,
                    'mensaje_resumen', v_summary
                );

                INSERT INTO public.notificaciones_usuario (
                    user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
                ) VALUES (
                    v_admin_record.user_id, p_aggregate_id, 'info_respondida', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
                ) ON CONFLICT (idempotency_key) DO NOTHING;
            END LOOP;
        END IF;

    -- =========================================================================
    -- CASO C: DEVUELTO - RETRABAJAR ('pedido.revision_solicitada')
    -- =========================================================================
    ELSIF p_event_name = 'pedido.revision_solicitada' THEN
        SELECT p.id, p.pedido_visible, p.responsable_user_id INTO v_pedido
        FROM public.pedidos p
        WHERE p.id = p_aggregate_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        v_dest_user_id := COALESCE(
            NULLIF(p_payload->>'responsable_user_id', '')::uuid,
            v_pedido.responsable_user_id
        );

        IF v_dest_user_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.usuarios_acceso ua
                WHERE ua.user_id = v_dest_user_id
                  AND ua.estado_acceso = 'aprobado'
                  AND ua.app_role IN ('administrador', 'equipo')
            ) THEN
                v_dest_user_id := NULL;
            END IF;
        END IF;

        IF v_dest_user_id IS NOT NULL THEN
            v_idempotency_key := 'notif:retrabajo:' || p_event_id::text || ':' || v_dest_user_id::text;
            v_summary := v_pedido.pedido_visible || ' fue devuelto para retrabajar';
            v_metadata := jsonb_build_object(
                'pedido_visible', v_pedido.pedido_visible,
                'section', 'revision',
                'revision_number', (p_payload->>'revision_number')::integer,
                'mensaje_resumen', v_summary
            );

            INSERT INTO public.notificaciones_usuario (
                user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
            ) VALUES (
                v_dest_user_id, p_aggregate_id, 'retrabajo_solicitado', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        ELSE
            -- CASO SIN RESPONSABLE VÁLIDO: Notificar a todos los administradores activos/aprobados
            FOR v_admin_record IN
                SELECT ua.user_id
                FROM public.usuarios_acceso ua
                WHERE ua.app_role = 'administrador'
                  AND ua.estado_acceso = 'aprobado'
            LOOP
                v_idempotency_key := 'notif:retrabajo_unassigned:' || p_event_id::text || ':' || v_admin_record.user_id::text;
                v_summary := v_pedido.pedido_visible || ' fue devuelto para retrabajar (sin responsable asignado)';
                v_metadata := jsonb_build_object(
                    'pedido_visible', v_pedido.pedido_visible,
                    'section', 'revision',
                    'revision_number', (p_payload->>'revision_number')::integer,
                    'is_unassigned', true,
                    'mensaje_resumen', v_summary
                );

                INSERT INTO public.notificaciones_usuario (
                    user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
                ) VALUES (
                    v_admin_record.user_id, p_aggregate_id, 'retrabajo_solicitado', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
                ) ON CONFLICT (idempotency_key) DO NOTHING;
            END LOOP;
        END IF;

    -- =========================================================================
    -- CASO D: NOTA INTERNA CREADA ('pedido.nota_created')
    -- =========================================================================
    ELSIF p_event_name = 'pedido.nota_created' THEN
        SELECT p.id, p.pedido_visible, p.responsable_user_id INTO v_pedido
        FROM public.pedidos p
        WHERE p.id = p_aggregate_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        v_dest_user_id := v_pedido.responsable_user_id;

        -- 1. Si no hay responsable asignado -> 0 notificaciones
        -- 2. Si el autor de la nota es el mismo responsable asignado -> NO auto-notificar
        IF v_dest_user_id IS NULL OR (p_actor_id IS NOT NULL AND v_dest_user_id = p_actor_id) THEN
            RETURN;
        END IF;

        -- 3. Validar que el responsable sea operativo y aprobado (excluye observadores y pendientes)
        IF NOT EXISTS (
            SELECT 1 FROM public.usuarios_acceso ua
            WHERE ua.user_id = v_dest_user_id
              AND ua.estado_acceso = 'aprobado'
              AND ua.app_role IN ('administrador', 'equipo')
        ) THEN
            RETURN;
        END IF;

        v_idempotency_key := 'notif:nota:' || p_event_id::text || ':' || v_dest_user_id::text;
        v_summary := 'Nueva nota en ' || v_pedido.pedido_visible;
        -- PRIVACIDAD: Nunca exponer el contenido textual de la nota en los metadatos
        v_metadata := jsonb_build_object(
            'pedido_visible', v_pedido.pedido_visible,
            'section', 'notas',
            'nota_id', p_payload->>'nota_id',
            'autor_user_id', p_actor_id,
            'mensaje_resumen', v_summary
        );

        INSERT INTO public.notificaciones_usuario (
            user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
        ) VALUES (
            v_dest_user_id, p_aggregate_id, 'nota_creada', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;

    END IF;
END;
$$;

-- Revocar permisos en la API pública para evitar llamadas externas arbitrarias
REVOKE ALL ON FUNCTION public.notification_dispatch_from_domain_event(uuid, text, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_dispatch_from_domain_event(uuid, text, uuid, jsonb, uuid) TO service_role;
