-- =============================================================================
-- Migration: 20261019030000_fase_4a_reopen_and_versions.sql
-- Description:
-- FASE 4A — REAPERTURA INTERNA + VERSIONADO DE FINALIZACIONES
-- 
-- 1. Tabla canónica public.pedido_versiones
-- 2. Backfill histórico seguro e idempotente desde domain_events / pedidos
-- 3. RPC public.pedido_reopen_finalized
-- 4. Actualización de public.pedido_finalize (numeración canónica y reset de es_vigente)
-- 5. Actualización de public.trg_domain_event_auto_enqueue y public.comunicacion_enqueue_lifecycle
-- 6. Actualización de public.solicitante_get_pedido_detail con versiones y eventos amigables
-- =============================================================================

-- =============================================================================
-- 1. CREACIÓN DE TABLA public.pedido_versiones
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pedido_versiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    version_number integer NOT NULL CHECK (version_number >= 1),
    entrega_id uuid NULL REFERENCES public.entregas_pedido(id) ON DELETE SET NULL,
    nota_cierre text NULL,
    finalizado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    finalizado_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_pedido_versiones_pedido_numero UNIQUE (pedido_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_pedido_versiones_pedido ON public.pedido_versiones(pedido_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_versiones_entrega ON public.pedido_versiones(entrega_id);

ALTER TABLE public.pedido_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "versiones_select_approved" ON public.pedido_versiones;
CREATE POLICY "versiones_select_approved" ON public.pedido_versiones
    FOR SELECT TO authenticated
    USING (
        private.is_approved() AND 
        private.current_app_role() IN ('administrador', 'equipo', 'observador')
    );

REVOKE ALL ON public.pedido_versiones FROM PUBLIC, anon;
GRANT SELECT ON public.pedido_versiones TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.pedido_versiones TO service_role;


-- =============================================================================
-- 2. BACKFILL HISTÓRICO DETERMINISTA E IDEMPOTENTE
-- =============================================================================

DO $$
BEGIN
    -- 2.1 Reconstrucción de versiones desde domain_events 'pedido.finalized'
    INSERT INTO public.pedido_versiones (
        pedido_id,
        version_number,
        entrega_id,
        nota_cierre,
        finalizado_por,
        finalizado_at,
        created_at
    )
    SELECT
        sub.pedido_id,
        sub.version_number,
        sub.entrega_id,
        sub.nota_cierre,
        sub.finalizado_por,
        sub.finalizado_at,
        sub.created_at
    FROM (
        SELECT
            de.aggregate_id AS pedido_id,
            ROW_NUMBER() OVER (PARTITION BY de.aggregate_id ORDER BY de.created_at ASC) AS version_number,
            CASE 
                WHEN de.payload->>'entrega_id' IS NOT NULL 
                     AND EXISTS (SELECT 1 FROM public.entregas_pedido ep WHERE ep.id = (de.payload->>'entrega_id')::uuid)
                    THEN (de.payload->>'entrega_id')::uuid
                WHEN (de.payload->>'entrega_version') IS NOT NULL 
                     AND EXISTS (SELECT 1 FROM public.entregas_pedido ep WHERE ep.pedido_id = de.aggregate_id AND ep.version = (de.payload->>'entrega_version')::int)
                    THEN (SELECT ep.id FROM public.entregas_pedido ep WHERE ep.pedido_id = de.aggregate_id AND ep.version = (de.payload->>'entrega_version')::int LIMIT 1)
                ELSE NULL
            END AS entrega_id,
            NULLIF(trim(de.payload->>'nota'), '') AS nota_cierre,
            CASE 
                WHEN de.actor_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = de.actor_user_id)
                    THEN de.actor_user_id
                ELSE NULL
            END AS finalizado_por,
            de.created_at AS finalizado_at,
            de.created_at AS created_at
        FROM public.domain_events de
        JOIN public.pedidos p ON de.aggregate_id = p.id
        WHERE de.event_name = 'pedido.finalized'
    ) sub
    ON CONFLICT (pedido_id, version_number) DO NOTHING;

    -- 2.2 Cobertura para pedidos actualmente Finalizados sin evento domain_events previo
    INSERT INTO public.pedido_versiones (
        pedido_id,
        version_number,
        entrega_id,
        nota_cierre,
        finalizado_por,
        finalizado_at,
        created_at
    )
    SELECT
        p.id AS pedido_id,
        1 AS version_number,
        (SELECT ep.id FROM public.entregas_pedido ep WHERE ep.pedido_id = p.id AND ep.es_vigente = true LIMIT 1) AS entrega_id,
        COALESCE(
            (SELECT ep.nota FROM public.entregas_pedido ep WHERE ep.pedido_id = p.id AND ep.es_vigente = true LIMIT 1),
            (SELECT np.texto FROM public.notas_pedido np WHERE np.pedido_id = p.id AND np.visibilidad IN ('solicitante', 'para_solicitante') ORDER BY np.created_at DESC LIMIT 1)
        ) AS nota_cierre,
        CASE 
            WHEN p.responsable_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.responsable_user_id)
                THEN p.responsable_user_id
            ELSE NULL
        END AS finalizado_por,
        COALESCE(p.finalizado_at, p.updated_at, p.created_at) AS finalizado_at,
        COALESCE(p.finalizado_at, p.updated_at, p.created_at) AS created_at
    FROM public.pedidos p
    WHERE p.estado = 'Finalizado'
      AND NOT EXISTS (SELECT 1 FROM public.pedido_versiones pv WHERE pv.pedido_id = p.id)
    ON CONFLICT (pedido_id, version_number) DO NOTHING;
END;
$$;


-- =============================================================================
-- 3. RPC DE REAPERTURA: public.pedido_reopen_finalized
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pedido_reopen_finalized(
    p_pedido_id uuid,
    p_expected_version integer,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_state text;
    v_current_version integer;
    v_responsable_id uuid;
    v_origen text;
    v_pedido_visible text;
    v_new_version integer;
    v_clean_motivo text;
    v_version_reabierta integer;
BEGIN
    -- 1. Validar actor autenticado y aprobado
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'FORBIDDEN: Rol % no autorizado para reabrir pedidos finalizados', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 2. Validar motivo obligatorio
    v_clean_motivo := trim(COALESCE(p_motivo, ''));
    IF length(v_clean_motivo) < 3 THEN
        RAISE EXCEPTION 'REOPEN_REASON_REQUIRED: La reapertura exige un motivo obligatorio' USING ERRCODE = '42200';
    END IF;

    -- 3. Bloquear pedido y verificar versión (concurrencia pesimista/optimista)
    SELECT estado, version, responsable_user_id, origen, pedido_visible
    INTO v_current_state, v_current_version, v_responsable_id, v_origen, v_pedido_visible
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: Versión esperada %s no coincide con actual %s', p_expected_version, v_current_version);
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);
    IF v_current_state <> 'Finalizado' THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se pueden reabrir pedidos en estado Finalizado (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- 4. Validar que el responsable conservado sea elegible
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- 5. Obtener versión reabierta
    SELECT COALESCE(MAX(version_number), 1) INTO v_version_reabierta
    FROM public.pedido_versiones
    WHERE pedido_id = p_pedido_id;

    v_new_version := v_current_version + 1;

    -- 6. Transición del pedido: Finalizado -> En proceso conservando responsable
    UPDATE public.pedidos
    SET estado = 'En proceso',
        retrabajo_activo = false,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 7. Registrar evento de dominio
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.reopened', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'pedido_visible', v_pedido_visible,
            'estado_anterior', 'Finalizado',
            'estado_nuevo', 'En proceso',
            'version_reabierta', v_version_reabierta,
            'responsable_id', v_responsable_id,
            'actor_id', v_actor_id,
            'version', v_new_version,
            'motivo', v_clean_motivo,
            'origen', v_origen,
            'is_reopen', true
        ),
        v_actor_id, now()
    );

    -- 8. Auditoría interna
    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'reopen_finalized',
        jsonb_build_object(
            'pedido_visible', v_pedido_visible,
            'version_reabierta', v_version_reabierta,
            'responsable_id', v_responsable_id,
            'motivo', v_clean_motivo,
            'new_version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'En proceso',
        'version', v_new_version,
        'version_reabierta', v_version_reabierta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_reopen_finalized(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_reopen_finalized(uuid, integer, text) TO authenticated, service_role;


-- =============================================================================
-- 4. ACTUALIZACIÓN DE public.pedido_finalize
-- =============================================================================

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
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid;
    v_current_state text;
    v_current_version bigint;
    v_responsable_id uuid;
    v_origen text;
    v_new_version bigint;
    v_entrega_id uuid := NULL;
    v_next_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_clean_nota text;
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
    v_clean_nota := NULLIF(trim(p_nota_entrega), '');

    -- Contar archivos entregados
    IF p_archivos_entrega IS NOT NULL THEN
        v_archivos_count := cardinality(p_archivos_entrega);
    END IF;

    -- Validar formato de URL si se suministró contenido
    IF v_clean_url IS NOT NULL THEN
        IF v_clean_url !~* '^https?://.+' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS' USING ERRCODE = '42200';
        END IF;
    END IF;

    -- Bloquear pedido y validar versión
    SELECT estado, version, responsable_user_id, retrabajo_activo, origen 
    INTO v_current_state, v_current_version, v_responsable_id, v_is_retrabajo, v_origen
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA DEFINITIVA DE NEGOCIO:
    -- Para pedidos públicos, la nota de entrega es OBLIGATORIA (trim no vacío).
    IF v_origen = 'publico' AND v_clean_nota IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOTE_REQUIRED: La nota de entrega es obligatoria para finalizar un pedido público' USING ERRCODE = '42200';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: Versión esperada %s no coincide con actual %s', p_expected_version, v_current_version);
    END IF;

    v_current_state := private.normalize_pedido_state(v_current_state);
    
    -- REGLA CANÓNICA: ÚNICAMENTE DESDE 'En proceso'
    IF v_current_state <> 'En proceso' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: %)', v_current_state USING ERRCODE = '42200';
    END IF;

    -- HARD GUARD: Responsable asignado obligatorio y válido
    PERFORM private.validate_operational_assignee(v_responsable_id);

    -- HARD GUARD: Rechazar finalización si existen solicitudes de información pendientes y vigentes (48h)
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

    -- 1. Calcular siguiente número de versión canónica
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.pedido_versiones
    WHERE pedido_id = p_pedido_id;

    -- 2. REGLA CRÍTICA: Desmarcar cualquier entrega previa como vigente SIEMPRE
    -- Si la nueva finalización no posee material, ninguna entrega quedará vigente.
    UPDATE public.entregas_pedido
    SET es_vigente = false
    WHERE pedido_id = p_pedido_id;

    -- 3. Registrar entrega material SOLO si hay archivo o enlace
    IF v_archivos_count > 0 OR v_clean_url IS NOT NULL THEN
        v_entrega_id := gen_random_uuid();
        INSERT INTO public.entregas_pedido (
            id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
        ) VALUES (
            v_entrega_id, p_pedido_id, v_next_version, true,
            CASE WHEN v_archivos_count > 0 THEN p_archivos_entrega[1] ELSE NULL END,
            v_clean_url,
            v_clean_nota,
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
    ELSIF v_clean_nota IS NOT NULL THEN
        -- Finalización sin material pero con nota:
        INSERT INTO public.notas_pedido (
            id, pedido_id, autor_user_id, visibilidad, texto, created_at
        ) VALUES (
            gen_random_uuid(), p_pedido_id, v_actor_id,
            CASE WHEN v_origen = 'publico' THEN 'solicitante' ELSE 'interna' END,
            v_clean_nota, now()
        );
    END IF;

    -- 4. Registrar la versión canónica inmutable en pedido_versiones
    INSERT INTO public.pedido_versiones (
        pedido_id, version_number, entrega_id, nota_cierre, finalizado_por, finalizado_at
    ) VALUES (
        p_pedido_id, v_next_version, v_entrega_id, v_clean_nota, v_actor_id, now()
    );

    -- 5. Si el pedido estaba en retrabajo, resolver la revisión activa correspondiente
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
                resolucion_notas = v_clean_nota
            WHERE id = v_active_rev_id;
        END IF;
    END IF;

    v_new_version := v_current_version + 1;

    -- 6. Actualizar pedido a finalizado y desactivar flag de retrabajo
    UPDATE public.pedidos
    SET estado = 'Finalizado',
        retrabajo_activo = false,
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 7. Registrar evento y auditoría
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.finalized', 'pedido', p_pedido_id,
        jsonb_build_object(
            'pedido_id', p_pedido_id,
            'entrega_id', v_entrega_id,
            'entrega_version', v_next_version,
            'version_number', v_next_version,
            'is_nueva_version', (v_next_version > 1),
            'actor_id', v_actor_id,
            'version', v_new_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'nota', v_clean_nota
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
            'version_number', v_next_version,
            'archivos_count', v_archivos_count,
            'has_enlace', (v_clean_url IS NOT NULL),
            'nota', v_clean_nota,
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen,
            'new_version', v_new_version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'estado', 'Finalizado',
        'version', v_new_version,
        'version_number', v_next_version,
        'entrega_id', v_entrega_id,
        'entrega_version', v_next_version,
        'retrabajo_resuelto', v_is_retrabajo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;


-- =============================================================================
-- 5. ACTUALIZACIÓN DE COMUNICACIONES Y TRIGGERS DE CICLO DE VIDA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comunicacion_enqueue_lifecycle(
    p_pedido_id uuid,
    p_tipo text,
    p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_ped RECORD;
    v_comm_id uuid;
    v_idempotency_key text;
    v_tipo_comm text;
BEGIN
    -- Si el pedido es interno, omitir la emisión de comunicaciones externas al solicitante
    IF EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id AND origen = 'interno') THEN
        RETURN NULL;
    END IF;

    SELECT 
        p.id,
        p.pedido_visible,
        p.estado,
        p.motivo_cancelacion,
        COALESCE(c.nombre, 'General') AS categoria_nombre,
        COALESCE(ts.nombre, 'General') AS tipo_nombre,
        e.id AS envio_id,
        e.correo,
        e.nombre_apellido
    INTO v_ped
    FROM public.pedidos p
    LEFT JOIN public.categorias_servicio c ON p.categoria_id = c.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE p.id = p_pedido_id;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF p_tipo = 'en_proceso' THEN
        v_tipo_comm := 'en_proceso';
        IF (p_extra->>'is_reopen')::boolean IS TRUE THEN
            v_idempotency_key := 'en_proceso_reopen:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version_reabierta', '1');
        ELSE
            v_idempotency_key := 'en_proceso:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
        END IF;
    ELSIF p_tipo = 'finalizado' THEN
        v_tipo_comm := 'finalizado';
        v_idempotency_key := 'finalizado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version_number', p_extra->>'version', '1');
    ELSIF p_tipo = 'cancelado' THEN
        v_tipo_comm := 'cancelado';
        v_idempotency_key := 'cancelado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSE
        v_tipo_comm := 'cambio_estado';
        v_idempotency_key := 'cambio_estado:' || p_pedido_id::text || ':' || v_ped.estado || ':' || COALESCE(p_extra->>'version', '1');
    END IF;

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
        v_ped.envio_id,
        p_pedido_id,
        v_tipo_comm,
        lower(trim(v_ped.correo)),
        'pendiente',
        0,
        3,
        v_idempotency_key,
        jsonb_build_object(
            'intent_type', v_tipo_comm,
            'pedido_id', p_pedido_id,
            'pedido_visible', v_ped.pedido_visible,
            'categoria', v_ped.categoria_nombre,
            'tipo', v_ped.tipo_nombre,
            'nombre_apellido', v_ped.nombre_apellido,
            'estado', v_ped.estado,
            'motivo_cancelacion', v_ped.motivo_cancelacion,
            'extra', p_extra
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.trg_domain_event_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'submission.created' THEN
        PERFORM public.comunicacion_enqueue_submission_created(NEW.aggregate_id);
        PERFORM public.comunicacion_enqueue_admin_new_submission(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.assigned' THEN
        PERFORM public.comunicacion_enqueue_pedido_assigned(NEW.aggregate_id, NEW.payload);
    ELSIF NEW.event_name = 'user.approved' THEN
        PERFORM public.comunicacion_enqueue_access_approved(NEW.aggregate_id);
    ELSIF NEW.event_name = 'pedido.info_responded' THEN
        PERFORM public.comunicacion_enqueue_info_responded(
            NEW.aggregate_id,
            (NEW.payload->>'solicitud_id')::uuid
        );
    ELSIF NEW.event_name = 'pedido.reopened' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(
            NEW.aggregate_id,
            'en_proceso',
            jsonb_build_object(
                'is_reopen', true,
                'version_reabierta', (NEW.payload->>'version_reabierta'),
                'version', (NEW.payload->>'version')
            )
        );
    ELSIF NEW.event_name = 'pedido.finalized' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'finalizado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.cancelled' THEN
        PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'cancelado', NEW.payload);
    ELSIF NEW.event_name = 'pedido.state_changed' THEN
        IF (NEW.payload->>'estado_nuevo') = 'En proceso' AND COALESCE(NEW.payload->>'estado_anterior', '') <> 'En proceso' THEN
            PERFORM public.comunicacion_enqueue_lifecycle(NEW.aggregate_id, 'en_proceso', NEW.payload);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


-- =============================================================================
-- 6. ACTUALIZACIÓN DE public.solicitante_get_pedido_detail
-- =============================================================================

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

REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;
