-- Migration: 20261010190009_fase_b3_internal_requests.sql
-- FASE B.3 — Carga Interna de Pedidos (SISTEMA PEDIDOS)
-- Permite al equipo (administrador, equipo) crear pedidos originados internamente
-- sin formulario público, manteniendo trazabilidad, auditoría, versionado y aislamiento estricto.

-- =============================================================================
-- 1. EXTENSIÓN DEL ESQUEMA public.pedidos
-- =============================================================================

-- 1.1 Columna origen con valor por defecto 'publico' para compatibilidad retroactiva
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'publico' 
    CHECK (origen IN ('publico', 'interno'));

-- 1.2 Columna created_by_user_id para registrar el autor interno
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL 
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1.3 Columna titulo para pedidos internos
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS titulo text NULL;

-- 1.4 Relajar NOT NULL de campos públicos para pedidos internos
ALTER TABLE public.pedidos 
    ALTER COLUMN envio_id DROP NOT NULL;

ALTER TABLE public.pedidos 
    ALTER COLUMN categoria_id DROP NOT NULL;

ALTER TABLE public.pedidos 
    ALTER COLUMN tipo_servicio_id DROP NOT NULL;

ALTER TABLE public.pedidos 
    ALTER COLUMN tracking_token_hash DROP NOT NULL;

-- 1.5 Índice único de idempotencia para pedidos internos por client_request_ref
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_interno_client_ref 
    ON public.pedidos (client_request_ref) 
    WHERE origen = 'interno';

-- 1.6 Índice para filtrado eficiente por origen
CREATE INDEX IF NOT EXISTS idx_pedidos_origen 
    ON public.pedidos (origen);

-- 1.7 Relajar restricción de entrega_material para admitir notas de entrega o pedidos internos
ALTER TABLE public.entregas_pedido 
    DROP CONSTRAINT IF EXISTS check_entrega_material;

ALTER TABLE public.entregas_pedido 
    ADD CONSTRAINT check_entrega_material 
    CHECK (archivo_id IS NOT NULL OR enlace_externo IS NOT NULL OR nota IS NOT NULL);


-- =============================================================================
-- 2. RPC CANÓNICA: public.pedido_create_internal
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pedido_create_internal(
    p_titulo text,
    p_descripcion text DEFAULT NULL,
    p_solicitante_nombre text DEFAULT NULL,
    p_solicitante_area text DEFAULT NULL,
    p_solicitante_correo text DEFAULT NULL,
    p_solicitante_telefono text DEFAULT NULL,
    p_categoria_id uuid DEFAULT NULL,
    p_tipo_servicio_id uuid DEFAULT NULL,
    p_prioridad text DEFAULT NULL,
    p_etiqueta_interna text DEFAULT NULL,
    p_fecha_limite date DEFAULT NULL,
    p_enlaces text[] DEFAULT NULL,
    p_client_request_ref uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid;
    v_role text;
    v_estado text;
    v_titulo_clean text;
    v_prioridad_clean text;
    v_etiqueta_clean text;
    v_codigo_cat text := 'I';
    v_year integer;
    v_number integer;
    v_pedido_visible text;
    v_new_id uuid;
    v_client_ref uuid;
    v_info jsonb;
    v_link text;
    v_clean_link text;
    v_enlace_id uuid;
    v_existing RECORD;
BEGIN
    -- 1. Autenticación obligatoria
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Autorización PoLP: solo administrador o equipo con estado aprobado
    SELECT app_role, estado_acceso INTO v_role, v_estado
    FROM public.usuarios_acceso
    WHERE user_id = v_actor_id;

    IF v_estado IS NULL OR v_estado <> 'aprobado' OR v_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'FORBIDDEN: Rol no autorizado para crear pedidos internos' USING ERRCODE = '42501';
    END IF;

    -- 3. Idempotencia: si se provee client_request_ref y ya existe un pedido interno, retornarlo
    IF p_client_request_ref IS NOT NULL THEN
        SELECT id, pedido_visible, estado, version, created_at
        INTO v_existing
        FROM public.pedidos
        WHERE client_request_ref = p_client_request_ref AND origen = 'interno';

        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'id', v_existing.id,
                'pedido_visible', v_existing.pedido_visible,
                'estado', v_existing.estado,
                'origen', 'interno',
                'version', v_existing.version,
                'idempotent', true,
                'created_at', v_existing.created_at
            );
        END IF;
    END IF;

    -- 4. Validación de campos obligatorios
    v_titulo_clean := trim(COALESCE(p_titulo, ''));
    IF char_length(v_titulo_clean) < 3 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED: El título del pedido es obligatorio y debe tener al menos 3 caracteres' USING ERRCODE = '42200';
    END IF;

    -- 5. Normalización y validación de prioridad
    v_prioridad_clean := NULLIF(trim(lower(COALESCE(p_prioridad, ''))), '');
    IF v_prioridad_clean IN ('normal', 'sin_prioridad') THEN
        v_prioridad_clean := NULL;
    END IF;
    IF v_prioridad_clean IS NOT NULL AND v_prioridad_clean NOT IN ('alta', 'media', 'baja') THEN
        RAISE EXCEPTION 'INVALID_PRIORITY: La prioridad debe ser alta, media o baja' USING ERRCODE = '22000';
    END IF;

    -- 6. Normalización y validación de etiqueta interna
    v_etiqueta_clean := NULLIF(trim(COALESCE(p_etiqueta_interna, '')), '');
    IF v_etiqueta_clean IS NOT NULL THEN
        IF char_length(v_etiqueta_clean) > 10 OR char_length(v_etiqueta_clean) = 0 THEN
            RAISE EXCEPTION 'INVALID_LABEL: La etiqueta interna no puede superar los 10 caracteres' USING ERRCODE = '22000';
        END IF;
    END IF;

    -- 7. Validación de categoría y tipo de servicio opcionales
    IF p_categoria_id IS NOT NULL THEN
        SELECT codigo_ped INTO v_codigo_cat
        FROM public.categorias_servicio
        WHERE id = p_categoria_id;

        IF v_codigo_cat IS NULL THEN
            RAISE EXCEPTION 'INVALID_CATEGORY: Categoría de servicio no encontrada' USING ERRCODE = '42200';
        END IF;

        IF p_tipo_servicio_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.tipos_servicio
                WHERE id = p_tipo_servicio_id AND categoria_id = p_categoria_id
            ) THEN
                RAISE EXCEPTION 'INVALID_SERVICE_TYPE: El tipo de servicio no pertenece a la categoría seleccionada' USING ERRCODE = '42200';
            END IF;
        END IF;
    ELSE
        IF p_tipo_servicio_id IS NOT NULL THEN
            RAISE EXCEPTION 'CATEGORY_REQUIRED: No se puede especificar tipo de servicio sin categoría' USING ERRCODE = '42200';
        END IF;
        v_codigo_cat := 'I';
    END IF;

    -- 8. Reserva atómica de correlativo anual
    SELECT year, first_number INTO v_year, v_number
    FROM private.reserve_ped_numbers(1);

    v_pedido_visible := 'PED-' || v_year::text || '-' || v_codigo_cat || lpad(v_number::text, 6, '0');

    -- 9. Preparación de informacion_especifica normalizada
    v_info := jsonb_build_object(
        'titulo', v_titulo_clean,
        'descripcion', NULLIF(trim(COALESCE(p_descripcion, '')), ''),
        'contacto_nombre', NULLIF(trim(COALESCE(p_solicitante_nombre, '')), ''),
        'contacto_area', NULLIF(trim(COALESCE(p_solicitante_area, '')), ''),
        'contacto_correo', NULLIF(trim(COALESCE(p_solicitante_correo, '')), ''),
        'contacto_telefono', NULLIF(trim(COALESCE(p_solicitante_telefono, '')), ''),
        'solicitante', jsonb_build_object(
            'nombre', NULLIF(trim(COALESCE(p_solicitante_nombre, '')), ''),
            'area', NULLIF(trim(COALESCE(p_solicitante_area, '')), ''),
            'correo', NULLIF(trim(COALESCE(p_solicitante_correo, '')), ''),
            'telefono', NULLIF(trim(COALESCE(p_solicitante_telefono, '')), '')
        ),
        'enlaces', COALESCE(to_jsonb(p_enlaces), '[]'::jsonb)
    );

    -- 10. Inserción del pedido interno
    v_new_id := gen_random_uuid();
    v_client_ref := COALESCE(p_client_request_ref, gen_random_uuid());

    INSERT INTO public.pedidos (
        id,
        envio_id,
        pedido_visible,
        anio,
        numero,
        categoria_id,
        tipo_servicio_id,
        codigo_categoria,
        estado,
        origen,
        titulo,
        prioridad,
        etiqueta_interna,
        fecha_limite,
        created_by_user_id,
        client_request_ref,
        informacion_especifica,
        version,
        tracking_token_version,
        tracking_token_hash,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        NULL,
        v_pedido_visible,
        v_year,
        v_number,
        p_categoria_id,
        p_tipo_servicio_id,
        v_codigo_cat,
        'Nuevo',
        'interno',
        v_titulo_clean,
        v_prioridad_clean,
        v_etiqueta_clean,
        p_fecha_limite,
        v_actor_id,
        v_client_ref,
        v_info,
        1,
        1,
        NULL,
        now(),
        now()
    );

    -- 11. Registro de enlaces externos opcionales
    IF p_enlaces IS NOT NULL AND cardinality(p_enlaces) > 0 THEN
        FOREACH v_link IN ARRAY p_enlaces LOOP
            v_clean_link := trim(COALESCE(v_link, ''));
            IF v_clean_link <> '' THEN
                IF v_clean_link !~* '^https?://' THEN
                    RAISE EXCEPTION 'INVALID_LINK_URL: Los enlaces deben comenzar con http:// o https://' USING ERRCODE = '42200';
                END IF;
                v_enlace_id := gen_random_uuid();
                INSERT INTO public.enlaces_material (id, envio_id, url, created_at)
                VALUES (v_enlace_id, NULL, v_clean_link, now());

                INSERT INTO public.enlace_pedido (enlace_id, pedido_id, created_at)
                VALUES (v_enlace_id, v_new_id, now())
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 12. Domain Event y Audit Log
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.created_internal',
        'pedido',
        v_new_id,
        jsonb_build_object(
            'pedido_id', v_new_id,
            'pedido_visible', v_pedido_visible,
            'origen', 'interno',
            'titulo', v_titulo_clean,
            'actor_id', v_actor_id,
            'prioridad', v_prioridad_clean,
            'etiqueta', v_etiqueta_clean
        ),
        v_actor_id,
        now()
    );

    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        v_actor_id,
        'pedidos',
        v_new_id::text,
        'create_internal',
        jsonb_build_object(
            'pedido_visible', v_pedido_visible,
            'origen', 'interno',
            'titulo', v_titulo_clean,
            'prioridad', v_prioridad_clean,
            'etiqueta', v_etiqueta_clean
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_id,
        'pedido_visible', v_pedido_visible,
        'estado', 'Nuevo',
        'origen', 'interno',
        'version', 1,
        'idempotent', false,
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_create_internal(text, text, text, text, text, text, uuid, uuid, text, text, date, text[], uuid) TO authenticated, service_role;


-- =============================================================================
-- 3. ACTUALIZACIÓN DE info_request_create_atomic (RECHAZO EN PEDIDOS INTERNOS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.info_request_create_atomic(
    p_solicitud_id uuid,
    p_pedido_id uuid,
    p_actor_user_id uuid,
    p_mensaje text,
    p_token_hash text,
    p_encrypted_envelope jsonb,
    p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_acceso RECORD;
    v_ped RECORD;
    v_envio RECORD;
    v_cat_nombre text;
    v_tipo_nombre text;
    v_expires_at timestamptz;
    v_comm_id uuid;
    v_idempotency_key text;
    v_payload jsonb;
    v_new_version integer;
BEGIN
    -- Validaciones de parámetros
    IF p_solicitud_id IS NULL THEN
        RAISE EXCEPTION 'SOLICITUD_ID_REQUIRED: Se requiere un UUID para la solicitud' USING ERRCODE = '42200';
    END IF;

    IF p_pedido_id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_ID_REQUIRED: Se requiere el identificador del pedido' USING ERRCODE = '42200';
    END IF;

    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'ACTOR_REQUIRED: Se requiere el identificador del usuario actor' USING ERRCODE = '42501';
    END IF;

    IF p_mensaje IS NULL OR length(trim(p_mensaje)) < 5 THEN
        RAISE EXCEPTION 'MESSAGE_REQUIRED: El mensaje de solicitud debe tener al menos 5 caracteres' USING ERRCODE = '42200';
    END IF;

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'TOKEN_HASH_REQUIRED: Se requiere el hash criptográfico del token' USING ERRCODE = '42200';
    END IF;

    IF p_encrypted_envelope IS NULL OR NOT (p_encrypted_envelope ? 'ciphertext') OR NOT (p_encrypted_envelope ? 'iv') OR NOT (p_encrypted_envelope ? 'tag') THEN
        RAISE EXCEPTION 'ENVELOPE_REQUIRED: Se requiere sobre cifrado AES-256-GCM válido para la entrega' USING ERRCODE = '42200';
    END IF;

    -- Validar permisos del actor
    SELECT app_role, estado_acceso INTO v_actor_acceso
    FROM public.usuarios_acceso
    WHERE user_id = p_actor_user_id;

    IF v_actor_acceso.estado_acceso IS NULL OR v_actor_acceso.estado_acceso <> 'aprobado' OR v_actor_acceso.app_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para solicitar información', v_actor_acceso.app_role USING ERRCODE = '42501';
    END IF;

    -- Bloqueo pesimista del pedido y control de concurrencia
    SELECT 
        p.id, p.envio_id, p.categoria_id, p.tipo_servicio_id, p.estado, p.pedido_visible, p.version, p.origen
    INTO v_ped
    FROM public.pedidos p
    WHERE p.id = p_pedido_id
    FOR UPDATE;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- REGLA ESTRICTA B.3: Prohibir solicitudes de información sobre pedidos internos
    IF v_ped.origen = 'interno' THEN
        RAISE EXCEPTION 'INFO_REQUEST_NOT_ALLOWED_FOR_INTERNAL: No se puede solicitar información en pedidos de origen interno' USING ERRCODE = '22000';
    END IF;

    -- Rechazar explícitamente estados terminales o incompatibles
    IF v_ped.estado IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'INVALID_STATE: No se puede solicitar información sobre un pedido en estado terminal %', v_ped.estado USING ERRCODE = '42200';
    END IF;

    IF v_ped.estado NOT IN ('Nuevo', 'En revisión', 'En proceso') THEN
        RAISE EXCEPTION 'INVALID_STATE: Solo se puede solicitar información sobre pedidos en estado Nuevo, En revisión o En proceso (estado actual: %)', v_ped.estado USING ERRCODE = '42200';
    END IF;

    -- Validar versión esperada
    IF p_expected_version IS NOT NULL AND v_ped.version <> p_expected_version THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = format('VERSION_CONFLICT: El pedido fue modificado concurrentemente (esperada %s, actual %s)', p_expected_version, v_ped.version);
    END IF;

    -- Comprobar que no exista ya una solicitud de información pendiente para este pedido
    IF EXISTS (
        SELECT 1 FROM public.solicitudes_informacion
        WHERE pedido_id = p_pedido_id AND estado = 'pendiente'
    ) THEN
        RAISE EXCEPTION 'PENDING_REQUEST_EXISTS: Ya existe una solicitud de información pendiente de respuesta para este pedido' USING ERRCODE = '42200';
    END IF;

    -- Recuperar datos del envío público asociado
    SELECT correo, nombre_apellido INTO v_envio
    FROM public.envios_formulario
    WHERE id = v_ped.envio_id;

    IF v_envio.correo IS NULL THEN
        RAISE EXCEPTION 'RECIPIENT_NOT_FOUND: No se encontró destinatario válido para el pedido' USING ERRCODE = 'P0002';
    END IF;

    -- Recuperar nombres legibles de catálogo
    SELECT nombre INTO v_cat_nombre FROM public.categorias_servicio WHERE id = v_ped.categoria_id;
    SELECT nombre INTO v_tipo_nombre FROM public.tipos_servicio WHERE id = v_ped.tipo_servicio_id;

    -- Calcular vencimiento exacto (48 horas reloj)
    v_expires_at := now() + interval '48 hours';

    -- 1. Insertar la solicitud de información
    INSERT INTO public.solicitudes_informacion (
        id,
        pedido_id,
        creado_por,
        mensaje,
        token_hash,
        expires_at,
        estado,
        created_at
    ) VALUES (
        p_solicitud_id,
        p_pedido_id,
        p_actor_user_id,
        p_mensaje,
        p_token_hash,
        v_expires_at,
        'pendiente',
        now()
    );

    -- 2. Transicionar pedido a 'Esperando información' e incrementar versión
    v_new_version := v_ped.version + 1;

    UPDATE public.pedidos
    SET 
        estado = 'Esperando información',
        version = v_new_version,
        updated_at = now()
    WHERE id = p_pedido_id;

    -- 3. Emitir domain event del cambio de estado
    INSERT INTO public.domain_events (
        event_name, aggregate_type, aggregate_id, payload, actor_user_id, created_at
    ) VALUES (
        'pedido.info_requested',
        'pedido',
        p_pedido_id,
        jsonb_build_object(
            'solicitud_id', p_solicitud_id,
            'pedido_id', p_pedido_id,
            'estado_previo', v_ped.estado,
            'nuevo_estado', 'Esperando información',
            'version', v_new_version,
            'expires_at', v_expires_at
        ),
        p_actor_user_id,
        now()
    );

    -- 4. Registrar en historial / audit log
    INSERT INTO public.audit_log (
        actor_user_id, recurso_tipo, recurso_id, accion, metadata, created_at
    ) VALUES (
        p_actor_user_id,
        'pedidos',
        p_pedido_id::text,
        'request_info',
        jsonb_build_object(
            'solicitud_id', p_solicitud_id,
            'estado_previo', v_ped.estado,
            'nuevo_estado', 'Esperando información',
            'version', v_new_version,
            'expires_at', v_expires_at
        ),
        now()
    );

    -- 5. Encolar la comunicación atómica en el Outbox
    v_idempotency_key := format('info_req:%s:%s', p_pedido_id, p_solicitud_id);
    v_comm_id := gen_random_uuid();

    v_payload := jsonb_build_object(
        'solicitud_id', p_solicitud_id,
        'pedido_id', p_pedido_id,
        'pedido_visible', v_ped.pedido_visible,
        'solicitante_nombre', v_envio.nombre_apellido,
        'categoria_nombre', COALESCE(v_cat_nombre, 'General'),
        'tipo_nombre', COALESCE(v_tipo_nombre, 'General'),
        'mensaje', p_mensaje,
        'expires_at', v_expires_at,
        'encrypted_envelope', p_encrypted_envelope
    );

    INSERT INTO public.comunicaciones_outbox (
        id,
        tipo,
        canal,
        destinatario,
        plantilla,
        payload,
        idempotency_key,
        estado,
        created_at
    ) VALUES (
        v_comm_id,
        'solicitud_info',
        'email',
        v_envio.correo,
        'solicitud_informacion_48h',
        v_payload,
        v_idempotency_key,
        'pendiente',
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'solicitud_id', p_solicitud_id,
        'communication_id', v_comm_id,
        'expires_at', v_expires_at,
        'estado', 'Esperando información',
        'estado_previo', v_ped.estado,
        'version', v_new_version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.info_request_create_atomic(uuid, uuid, uuid, text, text, jsonb, bigint) TO service_role;


-- =============================================================================
-- 4. ACTUALIZACIÓN DE public.pedido_finalize (SOPORTE PARA PEDIDOS INTERNOS)
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
    v_entrega_id uuid;
    v_entrega_version integer;
    v_arch_id uuid;
    v_arch_estado text;
    v_clean_url text;
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

    -- Determinar si se registra entrega material o nota
    IF v_archivos_count > 0 OR v_clean_url IS NOT NULL OR NULLIF(trim(p_nota_entrega), '') IS NOT NULL THEN
        v_has_entrega := true;

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
            'nota', NULLIF(trim(p_nota_entrega), ''),
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
-- 5. ACTUALIZACIÓN DE solicitante_get_pedidos Y solicitante_get_pedido_detail
--    (AISLAMIENTO ESTRICTO DE ORIGEN = 'publico')
-- =============================================================================

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
    WHERE lower(trim(e.correo)) = v_correo
      AND p.origen = 'publico';

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
          AND p.origen = 'publico'
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
                SELECT jsonb_agg(em.url)
                FROM public.enlace_solicitud_informacion esi
                JOIN public.enlaces_material em ON esi.enlace_id = em.id
                WHERE esi.solicitud_informacion_id = si.id
            ), '[]'::jsonb)
        ) AS item
        FROM public.solicitudes_informacion si
        WHERE si.pedido_id = v_ped.id
    ) t;

    -- 4. Notas visibles para el solicitante
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
          AND np.visibilidad = 'para_solicitante'
    ) t;

    -- 5. Entrega vigente
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
    WHERE ep.pedido_id = v_ped.id AND ep.es_vigente = true;

    -- 6. Revisión activa
    SELECT jsonb_build_object(
        'id', rp.id,
        'revision_number', rp.revision_number,
        'motivo', rp.motivo,
        'estado', rp.estado,
        'created_at', rp.created_at
    )
    INTO v_revision_activa
    FROM public.revision_pedidos rp
    WHERE rp.pedido_id = v_ped.id AND rp.estado IN ('abierta', 'en_tratamiento')
    ORDER BY rp.revision_number DESC
    LIMIT 1;

    -- 7. Historial de revisiones cerradas
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'revision_number')::int ASC), '[]'::jsonb)
    INTO v_revisiones_historial
    FROM (
        SELECT jsonb_build_object(
            'id', rp.id,
            'revision_number', rp.revision_number,
            'motivo', rp.motivo,
            'estado', rp.estado,
            'resolucion_notas', rp.resolucion_notas,
            'created_at', rp.created_at,
            'resolved_at', rp.resolved_at
        ) AS item
        FROM public.revision_pedidos rp
        WHERE rp.pedido_id = v_ped.id AND rp.estado = 'resuelta'
    ) t;

    -- 8. Historial de estados público
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') ASC), '[]'::jsonb)
    INTO v_historial
    FROM (
        SELECT jsonb_build_object(
            'evento', de.event_name,
            'created_at', de.created_at,
            'detalles', de.payload
        ) AS item
        FROM public.domain_events de
        WHERE de.aggregate_id = v_ped.id
          AND de.event_name IN (
              'pedido.created',
              'pedido.info_requested',
              'pedido.info_responded',
              'pedido.finalized',
              'pedido.revision_requested'
          )
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'pedido', jsonb_build_object(
            'id', v_ped.id,
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
        'historial', v_historial,
        'revision_activa', v_revision_activa,
        'revisiones_historial', v_revisiones_historial
    );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedidos(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.solicitante_get_pedido_detail(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitante_get_pedido_detail(text, text) TO service_role;


-- =============================================================================
-- 6. ACTUALIZACIÓN DE comunicacion_enqueue_lifecycle
--    (OMITIR NOTIFICACIONES AL SOLICITANTE PARA PEDIDOS INTERNOS)
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
        c.nombre AS categoria_nombre,
        ts.nombre AS tipo_nombre,
        e.id AS envio_id,
        e.correo,
        e.nombre_apellido
    INTO v_ped
    FROM public.pedidos p
    JOIN public.categorias_servicio c ON p.categoria_id = c.id
    JOIN public.tipos_servicio ts ON p.tipo_servicio_id = ts.id
    JOIN public.envios_formulario e ON p.envio_id = e.id
    WHERE p.id = p_pedido_id;

    IF v_ped.id IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF p_tipo = 'en_proceso' THEN
        v_tipo_comm := 'en_proceso';
        v_idempotency_key := 'en_proceso:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSIF p_tipo = 'finalizado' THEN
        v_tipo_comm := 'finalizado';
        v_idempotency_key := 'finalizado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSIF p_tipo = 'cancelado' THEN
        v_tipo_comm := 'cancelado';
        v_idempotency_key := 'cancelado:' || p_pedido_id::text || ':' || COALESCE(p_extra->>'version', '1');
    ELSE
        v_tipo_comm := 'cambio_estado';
        v_idempotency_key := 'cambio_estado:' || p_pedido_id::text || ':' || v_ped.estado || ':' || COALESCE(p_extra->>'version', '1');
    END IF;

    v_comm_id := gen_random_uuid();

    INSERT INTO public.comunicaciones_outbox (
        id,
        tipo,
        canal,
        destinatario,
        plantilla,
        payload,
        idempotency_key,
        estado,
        created_at
    ) VALUES (
        v_comm_id,
        v_tipo_comm,
        'email',
        v_ped.correo,
        v_tipo_comm,
        jsonb_build_object(
            'pedido_id', v_ped.id,
            'pedido_visible', v_ped.pedido_visible,
            'estado', v_ped.estado,
            'categoria_nombre', v_ped.categoria_nombre,
            'tipo_nombre', v_ped.tipo_nombre,
            'solicitante_nombre', v_ped.nombre_apellido,
            'motivo_cancelacion', v_ped.motivo_cancelacion,
            'extra', p_extra
        ),
        v_idempotency_key,
        'pendiente',
        now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_comm_id;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_lifecycle(uuid, text, jsonb) TO service_role;

