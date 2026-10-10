-- ==============================================================================
-- MIGRATION: 20261010161723_fase_b1_user_notifications.sql
-- FASE B.1: Motor Persistente de Notificaciones Internas (Backend & Realtime)
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
--
-- CARACTERÍSTICAS Y HARDENING:
-- 1. Tabla public.notificaciones_usuario con integridad referencial ON DELETE CASCADE.
-- 2. Clave de idempotencia única para garantizar que reintentos o ejecuciones
--    múltiples no generen notificaciones duplicadas.
-- 3. RLS estricta: usuarios aprobados ('administrador', 'equipo') solo pueden leer
--    sus propias notificaciones (user_id = auth.uid()). Observadores denegados.
-- 4. Modificaciones de estado (read_at) restringidas a RPCs seguras SECURITY DEFINER
--    con SET search_path = '' (notification_mark_read y notification_mark_all_read).
-- 5. Publicación en supabase_realtime para propagación en tiempo real multi-sesión.
-- 6. Generador central reactivo sobre public.domain_events para soportar:
--    - Asignación / reasignación de responsable.
--    - Respuesta a solicitud de información 48 h (al responsable vigente o admins).
--    - Retrabajo / devolución de pedido (al responsable vigente o admins).
--    - Creación de nota interna (al responsable vigente, autor excluido, sin texto).
-- 7. Integración con admin_pedidos_purge y admin_pedidos_purge_preview.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA: public.notificaciones_usuario
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificaciones_usuario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('pedido_asignado', 'info_respondida', 'retrabajo_solicitado', 'nota_creada')),
    actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    source_event_id uuid NULL REFERENCES public.domain_events(id) ON DELETE CASCADE,
    idempotency_key text UNIQUE NOT NULL,
    read_at timestamptz NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. ÍNDICES DE RENDIMIENTO Y CONSULTA
-- ------------------------------------------------------------------------------
-- Optimiza consulta de notificaciones no leídas y ordenamiento temporal por usuario
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_user_read_created 
    ON public.notificaciones_usuario (user_id, read_at, created_at DESC);

-- Optimiza consultas y cascades por pedido
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_pedido_id 
    ON public.notificaciones_usuario (pedido_id);

-- ------------------------------------------------------------------------------
-- 3. SEGURIDAD: ROW LEVEL SECURITY (RLS) & PoLP
-- ------------------------------------------------------------------------------
ALTER TABLE public.notificaciones_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificaciones_select_own_approved" ON public.notificaciones_usuario;
CREATE POLICY "notificaciones_select_own_approved" ON public.notificaciones_usuario
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        AND private.is_approved()
        AND private.is_team_or_admin()
    );

-- Revocar accesos por defecto a PUBLIC y anon
REVOKE ALL ON public.notificaciones_usuario FROM PUBLIC, anon;
GRANT SELECT ON public.notificaciones_usuario TO authenticated;
GRANT ALL ON public.notificaciones_usuario TO service_role;

-- ------------------------------------------------------------------------------
-- 4. REALTIME: Publicación en supabase_realtime
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notificaciones_usuario'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones_usuario;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. RPC: notification_mark_read (Marcar individual como leída)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_mark_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_updated boolean := false;
BEGIN
    -- 1. Validar autenticación y aprobación
    IF v_user_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    -- 2. Observadores no tienen acceso al Centro de Notificaciones
    IF NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Observadores no tienen acceso a notificaciones' USING ERRCODE = '42501';
    END IF;

    IF p_notification_id IS NULL THEN
        RAISE EXCEPTION 'PARAM_REQUIRED: Identificador de notificación requerido' USING ERRCODE = '42200';
    END IF;

    -- 3. Verificar pertenencia de la notificación al usuario actual
    IF NOT EXISTS (
        SELECT 1 FROM public.notificaciones_usuario
        WHERE id = p_notification_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'NOTIFICATION_NOT_FOUND: Notificación no encontrada o no pertenece al usuario' USING ERRCODE = 'P0002';
    END IF;

    -- 4. Marcar leída de forma idempotente
    UPDATE public.notificaciones_usuario
    SET read_at = now()
    WHERE id = p_notification_id
      AND user_id = v_user_id
      AND read_at IS NULL;

    IF FOUND THEN
        v_updated := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', p_notification_id,
        'read', true,
        'updated', v_updated
    );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_mark_read(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: notification_mark_all_read (Marcar todas del usuario actual como leídas)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_mark_all_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_count integer := 0;
BEGIN
    -- 1. Validar autenticación y aprobación
    IF v_user_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    -- 2. Observadores denegados
    IF NOT private.is_team_or_admin() THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Observadores no tienen acceso a notificaciones' USING ERRCODE = '42501';
    END IF;

    -- 3. Actualizar exclusivamente las notificaciones no leídas del usuario actual
    UPDATE public.notificaciones_usuario
    SET read_at = now()
    WHERE user_id = v_user_id
      AND read_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'marked_count', v_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_mark_all_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_mark_all_read() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. HELPER: notification_dispatch_from_domain_event (Generador Central Idempotente)
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
    v_dest_record RECORD;
    v_admin_record RECORD;
    v_actor_name text;
    v_idempotency_key text;
    v_summary text;
    v_metadata jsonb;
BEGIN
    -- Manejo controlado de errores para garantizar que ninguna falla de notificación
    -- interrumpa una operación de negocio principal
    BEGIN
        -- =====================================================================
        -- CASO A: PEDIDO ASIGNADO / REASIGNADO ('pedido.assigned')
        -- =====================================================================
        IF p_event_name = 'pedido.assigned' THEN
            v_dest_user_id := (p_payload->>'responsable_nuevo_id')::uuid;
            IF v_dest_user_id IS NULL THEN
                RETURN;
            END IF;

            -- Validar que el responsable asignado sea un usuario operativo aprobado
            SELECT ua.user_id, ua.nombre, ua.apellido
            INTO v_dest_record
            FROM public.usuarios_acceso ua
            WHERE ua.user_id = v_dest_user_id
              AND ua.estado_acceso = 'aprobado'
              AND ua.app_role IN ('administrador', 'equipo');

            IF NOT FOUND THEN
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

        -- =====================================================================
        -- CASO B: INFORMACIÓN 48 H RESPONDIDA ('pedido.info_responded' o 'pedido.info_responded_unassigned')
        -- =====================================================================
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

            -- Si hay un responsable vigente operativo:
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
                -- CASO SIN RESPONSABLE: Notificar a todos los administradores activos/aprobados
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

        -- =====================================================================
        -- CASO C: DEVUELTO - RETRABAJAR ('pedido.revision_solicitada')
        -- =====================================================================
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
                -- CASO SIN RESPONSABLE: Notificar a todos los administradores activos/aprobados
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

        -- =====================================================================
        -- CASO D: NOTA INTERNA CREADA ('pedido.nota_created')
        -- =====================================================================
        ELSIF p_event_name = 'pedido.nota_created' THEN
            SELECT p.id, p.pedido_visible, p.responsable_user_id INTO v_pedido
            FROM public.pedidos p
            WHERE p.id = p_aggregate_id;

            IF NOT FOUND THEN
                RETURN;
            END IF;

            -- Si no hay responsable: NO generar notificación a todo el sistema (Regla 17)
            IF v_pedido.responsable_user_id IS NULL THEN
                RETURN;
            END IF;

            -- Si el autor es el mismo responsable: NO auto-notificar (Regla 17)
            IF p_actor_id IS NOT NULL AND v_pedido.responsable_user_id = p_actor_id THEN
                RETURN;
            END IF;

            -- Validar que el responsable sea operativo
            SELECT ua.user_id INTO v_dest_record
            FROM public.usuarios_acceso ua
            WHERE ua.user_id = v_pedido.responsable_user_id
              AND ua.estado_acceso = 'aprobado'
              AND ua.app_role IN ('administrador', 'equipo');

            IF NOT FOUND THEN
                RETURN;
            END IF;

            -- Resolver nombre del autor para semántica amigable sin exponer el texto
            SELECT trim(COALESCE(ua.nombre || ' ' || ua.apellido, ua.nombre_usuario, 'Un integrante del equipo'))
            INTO v_actor_name
            FROM public.usuarios_acceso ua
            WHERE ua.user_id = p_actor_id;

            IF v_actor_name IS NULL OR v_actor_name = '' THEN
                v_actor_name := 'Un integrante del equipo';
            END IF;

            v_idempotency_key := 'notif:nota:' || p_event_id::text || ':' || v_dest_record.user_id::text;
            v_summary := v_actor_name || ' dejó una nota interna en ' || v_pedido.pedido_visible;
            v_metadata := jsonb_build_object(
                'pedido_visible', v_pedido.pedido_visible,
                'section', 'notas',
                'nota_id', p_payload->>'nota_id',
                'actor_nombre', v_actor_name,
                'mensaje_resumen', v_summary
            );

            INSERT INTO public.notificaciones_usuario (
                user_id, pedido_id, tipo, actor_user_id, source_event_id, idempotency_key, metadata, created_at
            ) VALUES (
                v_dest_record.user_id, p_aggregate_id, 'nota_creada', p_actor_id, p_event_id, v_idempotency_key, v_metadata, now()
            ) ON CONFLICT (idempotency_key) DO NOTHING;

        END IF;

    EXCEPTION WHEN OTHERS THEN
        -- Registrar advertencia en bitácora interna sin propagar error hacia la transacción principal
        RAISE WARNING 'Fallo en notification_dispatch_from_domain_event para evento %: %', p_event_name, SQLERRM;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_dispatch_from_domain_event(uuid, text, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_dispatch_from_domain_event(uuid, text, uuid, jsonb, uuid) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. TRIGGER: trg_domain_events_user_notifications en public.domain_events
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

DROP TRIGGER IF EXISTS trg_domain_events_user_notifications ON public.domain_events;
CREATE TRIGGER trg_domain_events_user_notifications
    AFTER INSERT ON public.domain_events
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_domain_event_notifications();

-- ------------------------------------------------------------------------------
-- 9. ACTUALIZACIÓN: public.nota_pedido_create para emitir domain_event
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nota_pedido_create(
    p_pedido_id uuid,
    p_contenido text,
    p_visibilidad text DEFAULT 'interna'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_nota_id uuid;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para agregar notas', v_actor_role USING ERRCODE = '42501';
    END IF;

    IF p_contenido IS NULL OR length(trim(p_contenido)) = 0 THEN
        RAISE EXCEPTION 'CONTENT_REQUIRED: El contenido de la nota no puede estar vacío' USING ERRCODE = '42200';
    END IF;

    IF p_visibilidad NOT IN ('interna', 'solicitante') THEN
        RAISE EXCEPTION 'INVALID_VISIBILITY: Visibilidad debe ser interna o solicitante' USING ERRCODE = '42200';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    v_nota_id := gen_random_uuid();
    INSERT INTO public.notas_pedido (
        id, pedido_id, autor_user_id, texto, visibilidad, created_at
    ) VALUES (
        v_nota_id, p_pedido_id, v_actor_id, trim(p_contenido), p_visibilidad, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'notas_pedido', v_nota_id::text, 'create',
        jsonb_build_object('pedido_id', p_pedido_id, 'visibilidad', p_visibilidad),
        now()
    );

    -- Emitir evento de dominio para disparar la notificación interna (sin guardar el texto)
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.nota_created', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'nota_id', v_nota_id,
            'visibilidad', p_visibilidad
        ),
        v_actor_id, now()
    );

    RETURN jsonb_build_object('success', true, 'nota_id', v_nota_id);
END;
$$;

REVOKE ALL ON FUNCTION public.nota_pedido_create(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nota_pedido_create(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 10. INTEGRACIÓN PURGE: admin_pedidos_purge_preview & admin_pedidos_purge
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_pedidos_purge_preview(
    p_pedido_ids uuid[],
    p_actor text DEFAULT 'administrador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_estado text;
    v_actor_display text;
    v_pedidos_count int := 0;
    v_pedidos_visibles jsonb := '[]'::jsonb;
    v_envio_ids uuid[] := ARRAY[]::uuid[];
    v_envios_afectados int := 0;
    v_entregas_count int := 0;
    v_revisiones_count int := 0;
    v_archivos_count int := 0;
    v_comunicaciones_count int := 0;
    v_notificaciones_count int := 0;
    v_drive_file_ids jsonb := '[]'::jsonb;
    v_drive_folder_ids jsonb := '[]'::jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso, COALESCE(nombre || ' ' || apellido, nombre_usuario, p_actor)
        INTO v_role, v_estado, v_actor_display
        FROM public.usuarios_acceso
        WHERE user_id = v_user_id;

        IF v_role IS DISTINCT FROM 'administrador' OR v_estado IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'FORBIDDEN: Solo administradores aprobados pueden acceder al preview de purga' USING ERRCODE = '42501';
        END IF;
    ELSE
        v_actor_display := p_actor;
    END IF;

    IF p_pedido_ids IS NULL OR array_length(p_pedido_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
            'pedidos_count', 0,
            'pedidos_visibles', '[]'::jsonb,
            'envios_afectados', 0,
            'entregas_count', 0,
            'revisiones_count', 0,
            'archivos_count', 0,
            'comunicaciones_count', 0,
            'notificaciones_count', 0,
            'drive_files_count', 0,
            'drive_folders_count', 0,
            'drive_file_ids', '[]'::jsonb,
            'drive_folder_ids', '[]'::jsonb
        );
    END IF;

    SELECT 
        count(*),
        COALESCE(jsonb_agg(p.pedido_visible ORDER BY p.pedido_visible), '[]'::jsonb),
        COALESCE(array_agg(DISTINCT p.envio_id) FILTER (WHERE p.envio_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_pedidos_count, v_pedidos_visibles, v_envio_ids
    FROM public.pedidos p
    WHERE p.id = ANY(p_pedido_ids);

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

    SELECT count(*) INTO v_entregas_count
    FROM public.entregas_pedido ep
    WHERE ep.pedido_id = ANY(p_pedido_ids);

    SELECT count(*) INTO v_revisiones_count
    FROM public.revision_pedidos rp
    WHERE rp.pedido_id = ANY(p_pedido_ids);

    SELECT count(DISTINCT archivo_id) INTO v_archivos_count
    FROM (
        SELECT ap.archivo_id FROM public.archivo_pedido ap WHERE ap.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ea.archivo_id FROM public.entrega_archivos ea 
        JOIN public.entregas_pedido ep ON ea.entrega_id = ep.id WHERE ep.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ep.archivo_id FROM public.entregas_pedido ep WHERE ep.pedido_id = ANY(p_pedido_ids) AND ep.archivo_id IS NOT NULL
        UNION
        SELECT ra.archivo_id FROM public.revision_archivos ra 
        JOIN public.revision_solicitudes rs ON ra.revision_solicitud_id = rs.id WHERE rs.envio_id = ANY(v_envio_ids)
        UNION
        SELECT asi.archivo_id FROM public.archivo_solicitud_informacion asi 
        JOIN public.solicitudes_informacion si ON asi.solicitud_informacion_id = si.id WHERE si.pedido_id = ANY(p_pedido_ids)
    ) a;

    SELECT count(*) INTO v_comunicaciones_count
    FROM public.comunicaciones_pedido cp
    WHERE cp.pedido_id = ANY(p_pedido_ids);

    -- Conteo de notificaciones de usuario asociadas a los pedidos a purgar
    SELECT count(*) INTO v_notificaciones_count
    FROM public.notificaciones_usuario nu
    WHERE nu.pedido_id = ANY(p_pedido_ids);

    SELECT 
        COALESCE(jsonb_agg(DISTINCT a.drive_file_id) FILTER (WHERE a.drive_file_id IS NOT NULL), '[]'::jsonb)
    INTO v_drive_file_ids
    FROM public.archivos a
    WHERE a.id IN (
        SELECT ap.archivo_id FROM public.archivo_pedido ap WHERE ap.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ea.archivo_id FROM public.entrega_archivos ea 
        JOIN public.entregas_pedido ep ON ea.entrega_id = ep.id WHERE ep.pedido_id = ANY(p_pedido_ids)
        UNION
        SELECT ep.archivo_id FROM public.entregas_pedido ep WHERE ep.pedido_id = ANY(p_pedido_ids) AND ep.archivo_id IS NOT NULL
        UNION
        SELECT ra.archivo_id FROM public.revision_archivos ra 
        JOIN public.revision_solicitudes rs ON ra.revision_solicitud_id = rs.id WHERE rs.envio_id = ANY(v_envio_ids)
        UNION
        SELECT asi.archivo_id FROM public.archivo_solicitud_informacion asi 
        JOIN public.solicitudes_informacion si ON asi.solicitud_informacion_id = si.id WHERE si.pedido_id = ANY(p_pedido_ids)
    );

    SELECT 
        COALESCE(jsonb_agg(DISTINCT pdf.drive_folder_id) FILTER (WHERE pdf.drive_folder_id IS NOT NULL), '[]'::jsonb)
    INTO v_drive_folder_ids
    FROM public.pedido_drive_folders pdf
    WHERE pdf.pedido_id = ANY(p_pedido_ids);

    RETURN jsonb_build_object(
        'pedidos_count', v_pedidos_count,
        'pedidos_visibles', v_pedidos_visibles,
        'envios_afectados', v_envios_afectados,
        'entregas_count', v_entregas_count,
        'revisiones_count', v_revisiones_count,
        'archivos_count', v_archivos_count,
        'comunicaciones_count', v_comunicaciones_count,
        'notificaciones_count', v_notificaciones_count,
        'drive_files_count', jsonb_array_length(v_drive_file_ids),
        'drive_folders_count', jsonb_array_length(v_drive_folder_ids),
        'drive_file_ids', v_drive_file_ids,
        'drive_folder_ids', v_drive_folder_ids
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) TO authenticated, service_role;

-- Actualizar admin_pedidos_purge para eliminar explícitamente notificaciones de usuario
CREATE OR REPLACE FUNCTION public.admin_pedidos_purge(
    p_operation_id uuid,
    p_actor text DEFAULT 'administrador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_op RECORD;
    v_user_id uuid;
    v_role text;
    v_estado text;
    v_unresolved_drive int;
    v_pedido_ids uuid[];
    v_envio_ids uuid[];
    v_archivo_ids uuid[];
    v_deleted_count int := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT app_role, estado_acceso
        INTO v_role, v_estado
        FROM public.usuarios_acceso
        WHERE user_id = v_user_id;

        IF v_role IS DISTINCT FROM 'administrador' OR v_estado IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'FORBIDDEN: Solo administradores aprobados pueden ejecutar la purga de base de datos' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_op
    FROM public.admin_purge_operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OPERATION_NOT_FOUND: Operación de purga % no encontrada', p_operation_id USING ERRCODE = 'P0002';
    END IF;

    IF v_op.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'already_completed', true, 'operation_id', p_operation_id);
    END IF;

    IF v_op.status NOT IN ('pending', 'drive_cleared', 'drive_partial', 'failed') THEN
        RAISE EXCEPTION 'INVALID_OPERATION_STATUS: La operación % se encuentra en estado % no apto para purga DB', p_operation_id, v_op.status USING ERRCODE = '55000';
    END IF;

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

    -- Eliminación de dependencias
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

    DELETE FROM public.entrega_archivos WHERE entrega_id IN (SELECT id FROM public.entregas_pedido WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.entregas_pedido WHERE pedido_id = ANY(v_pedido_ids);

    DELETE FROM public.archivo_solicitud_informacion WHERE solicitud_informacion_id IN (SELECT id FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.enlace_solicitud_informacion WHERE solicitud_informacion_id IN (SELECT id FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids));
    DELETE FROM public.solicitudes_informacion WHERE pedido_id = ANY(v_pedido_ids);

    DELETE FROM public.archivo_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.enlace_pedido WHERE pedido_id = ANY(v_pedido_ids);

    DELETE FROM public.pedido_asignaciones WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.notas_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.pedido_drive_folders WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.upload_reservations WHERE pedido_id = ANY(v_pedido_ids);

    -- Eliminación explícita de notificaciones de usuario antes de eventos y pedidos
    DELETE FROM public.notificaciones_usuario WHERE pedido_id = ANY(v_pedido_ids);

    DELETE FROM public.comunicaciones_pedido WHERE pedido_id = ANY(v_pedido_ids);
    DELETE FROM public.domain_events WHERE aggregate_id = ANY(v_pedido_ids);

    DELETE FROM public.pedidos WHERE id = ANY(v_pedido_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF array_length(v_envio_ids, 1) > 0 THEN
        DELETE FROM public.envios_formulario ef
        WHERE ef.id = ANY(v_envio_ids)
          AND NOT EXISTS (SELECT 1 FROM public.pedidos p_rem WHERE p_rem.envio_id = ef.id);
    END IF;

    IF array_length(v_archivo_ids, 1) > 0 THEN
        DELETE FROM public.archivos a
        WHERE a.id = ANY(v_archivo_ids)
          AND NOT EXISTS (SELECT 1 FROM public.archivo_pedido ap WHERE ap.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.entrega_archivos ea WHERE ea.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.entregas_pedido ep WHERE ep.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.revision_archivos ra WHERE ra.archivo_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM public.archivo_solicitud_informacion asi WHERE asi.archivo_id = a.id);
    END IF;

    UPDATE public.admin_purge_items
    SET status = 'deleted', processed_at = now()
    WHERE operation_id = p_operation_id
      AND item_type = 'pedido';

    UPDATE public.admin_purge_operations
    SET status = 'completed', completed_at = now()
    WHERE id = p_operation_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count,
        'operation_id', p_operation_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pedidos_purge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge(uuid, text) TO authenticated, service_role;
