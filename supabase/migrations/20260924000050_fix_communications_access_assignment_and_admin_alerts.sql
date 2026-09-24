-- =============================================================================
-- Migración 050: Fix F10 Outbox Communications — Per-PED Admin Alerts & Canonical Role Verification
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- =============================================================================

-- 1. Helper de Encolado: Alerta a Administradores Activos de Nueva Solicitud Recibida (por Pedido Individual)
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

-- 2. Permisos y PoLP
REVOKE ALL ON FUNCTION public.comunicacion_enqueue_admin_new_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicacion_enqueue_admin_new_submission(uuid) TO service_role;
