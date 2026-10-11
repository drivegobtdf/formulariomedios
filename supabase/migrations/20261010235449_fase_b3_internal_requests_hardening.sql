-- Migration: 20261010235449_fase_b3_internal_requests_hardening.sql
-- FASE B.3.1 — Hardening de Finalización, Constraint de Entregas y Matriz de Comunicaciones

-- =============================================================================
-- 1. RESTAURACIÓN DEL CONSTRAINT HISTÓRICO DE entregas_pedido
-- =============================================================================
-- El material de entrega sigue exigiendo archivo o enlace externo.
-- La finalización interna flexible (sin archivos ni enlaces) no genera registros en entregas_pedido,
-- preservando 100% la integridad del contrato público anterior.

ALTER TABLE public.entregas_pedido 
    DROP CONSTRAINT IF EXISTS check_entrega_material;

-- Si existen entregas de prueba sin material generadas en pruebas previas de B.3, mover su nota a notas_pedido y eliminarlas de entregas_pedido
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT id, pedido_id, nota, entregado_por, created_at 
        FROM public.entregas_pedido 
        WHERE archivo_id IS NULL AND enlace_externo IS NULL
    LOOP
        IF r.nota IS NOT NULL THEN
            INSERT INTO public.notas_pedido (id, pedido_id, autor_user_id, visibilidad, texto, created_at)
            VALUES (gen_random_uuid(), r.pedido_id, r.entregado_por, 'interna', r.nota, r.created_at);
        END IF;
        DELETE FROM public.entregas_pedido WHERE id = r.id;
    END LOOP;
END;
$$;

ALTER TABLE public.entregas_pedido 
    ADD CONSTRAINT check_entrega_material 
    CHECK (archivo_id IS NOT NULL OR enlace_externo IS NOT NULL);


-- =============================================================================
-- 2. HARDENING DE public.pedido_finalize
-- =============================================================================
-- Garantiza:
-- a) Pedidos públicos: Exigen obligatoriamente archivo o URL.
-- b) Pedidos internos: Totalmente opcionales (archivo, URL y nota).
--    Si no hay archivo ni enlace, NO se crea fila en entregas_pedido (evita valores ficticios).
--    Si se incluye nota opcional sin material, se almacena en notas_pedido y audit_log.

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
    v_entrega_id uuid;
    v_entrega_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
    v_clean_nota text;
    v_archivos_count integer := 0;
    v_is_retrabajo boolean := false;
    v_active_rev_id uuid;
    v_has_entrega boolean := false;
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

    -- Validar formato de URL si se suministró
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

    -- Para pedidos públicos, exigir entrega obligatoria (archivo o url)
    IF v_origen = 'publico' AND v_archivos_count = 0 AND v_clean_url IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega' USING ERRCODE = '42200';
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

    -- Registrar entrega material en entregas_pedido SOLO si hay archivo o enlace
    IF v_archivos_count > 0 OR v_clean_url IS NOT NULL THEN
        v_has_entrega := true;

        -- Calcular siguiente versión de entrega
        SELECT COALESCE(MAX(version), 0) + 1 INTO v_entrega_version
        FROM public.entregas_pedido
        WHERE pedido_id = p_pedido_id;

        -- Desmarcar entrega anterior como vigente
        UPDATE public.entregas_pedido
        SET es_vigente = false
        WHERE pedido_id = p_pedido_id;

        -- Crear nueva entrega material (cumple check_entrega_material)
        v_entrega_id := gen_random_uuid();
        INSERT INTO public.entregas_pedido (
            id, pedido_id, version, es_vigente, archivo_id, enlace_externo, nota, entregado_por, created_at
        ) VALUES (
            v_entrega_id, p_pedido_id, v_entrega_version, true,
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
        -- Si es un pedido interno finalizado solo con nota, registrarla en notas_pedido
        INSERT INTO public.notas_pedido (
            id, pedido_id, autor_user_id, visibilidad, texto, created_at
        ) VALUES (
            gen_random_uuid(), p_pedido_id, v_actor_id, 'interna', v_clean_nota, now()
        );
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
                resolucion_notas = v_clean_nota
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
            'was_retrabajo', v_is_retrabajo,
            'origen', v_origen
        ),
        v_actor_id, now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id, 'pedidos', p_pedido_id::text, 'finalize',
        jsonb_build_object(
            'entrega_id', v_entrega_id,
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
        'entrega_id', v_entrega_id,
        'entrega_version', v_entrega_version,
        'retrabajo_resuelto', v_is_retrabajo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_finalize(uuid, bigint, uuid[], text, text) TO authenticated, service_role;


-- =============================================================================
-- 3. HARDENING DE public.comunicacion_enqueue_pedido_assigned
-- =============================================================================
-- Admite asignación de pedidos internos sin categoría asignada (LEFT JOINs),
-- garantizando que el responsable asignado reciba siempre su comunicación operativa.

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
    v_assignee_id := (p_payload->>'responsable_nuevo_id')::uuid;
    IF v_assignee_id IS NULL THEN
        RETURN NULL;
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

    -- Obtener datos del pedido con LEFT JOINs para admitir pedidos internos sin categoría ni envío público
    SELECT 
        p.id,
        p.pedido_visible,
        p.fecha_limite,
        p.origen,
        p.titulo,
        COALESCE(c.nombre, 'Sin categoría') AS categoria_nombre,
        COALESCE(ts.nombre, 'General') AS tipo_nombre,
        COALESCE(e.area_solicitante, p.informacion_especifica->'solicitante'->>'area', 'Área interna') AS area_solicitante,
        COALESCE(e.nombre_apellido, p.informacion_especifica->'solicitante'->>'nombre', p.titulo, 'Solicitante interno') AS solicitante_nombre
    INTO v_ped
    FROM public.pedidos p
    LEFT JOIN public.categorias_servicio c ON p.categoria_id = c.id
    LEFT JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
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
            'version', v_version,
            'origen', v_ped.origen
        ),
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_pedido_assigned(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_pedido_assigned(uuid, jsonb) TO service_role;
