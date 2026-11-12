-- Migration: 20261112000004_fix_pedido_get_historial_assignment_duplicates.sql
-- Description: Evitar duplicación de registros de asignación en pedido_get_historial.
-- Causa raíz: pedido_assign registra simultáneamente en domain_events ('pedido.assigned')
-- y en pedido_asignaciones. Al hacer UNION ALL de ambas fuentes sin exclusión, cada asignación
-- se proyectaba dos veces en la línea de tiempo.
-- Solución: Excluir de domain_events el evento 'pedido.assigned', dado que pedido_asignaciones
-- provee el registro enriquecido canónico con responsable_anterior, responsable_nuevo y motivo.

CREATE OR REPLACE FUNCTION public.pedido_get_historial(
    p_pedido_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, auth, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_historial jsonb;
BEGIN
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    -- Proyección combinada de eventos de ciclo de vida, asignaciones y notas sin duplicados
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb)
    INTO v_historial
    FROM (
        -- Eventos de dominio operativos (se excluye 'pedido.assigned' porque proviene de pedido_asignaciones)
        SELECT jsonb_build_object(
            'tipo', 'evento',
            'evento', de.event_name,
            'created_at', de.created_at,
            'actor_nombre', CASE 
                WHEN ua.user_id IS NOT NULL THEN concat(ua.nombre, ' ', ua.apellido)
                ELSE 'Sistema'
            END,
            'payload', de.payload - 'token_hash' - 'raw_token' - 'exchange_token'
        ) AS item
        FROM public.domain_events de
        LEFT JOIN public.usuarios_acceso ua ON de.actor_user_id = ua.user_id
        WHERE de.aggregate_id = p_pedido_id
          AND de.event_name != 'pedido.assigned'

        UNION ALL

        -- Historial de asignaciones enriquecido
        SELECT jsonb_build_object(
            'tipo', 'asignacion',
            'evento', 'pedido.assigned',
            'created_at', pa.created_at,
            'actor_nombre', concat(ua_asig.nombre, ' ', ua_asig.apellido),
            'payload', jsonb_build_object(
                'responsable_anterior', concat(ua_ant.nombre, ' ', ua_ant.apellido),
                'responsable_nuevo', concat(ua_nue.nombre, ' ', ua_nue.apellido),
                'motivo', pa.motivo
            )
        ) AS item
        FROM public.pedido_asignaciones pa
        LEFT JOIN public.usuarios_acceso ua_asig ON pa.asignado_por = ua_asig.user_id
        LEFT JOIN public.usuarios_acceso ua_ant ON pa.responsable_anterior = ua_ant.user_id
        LEFT JOIN public.usuarios_acceso ua_nue ON pa.responsable_nuevo = ua_nue.user_id
        WHERE pa.pedido_id = p_pedido_id
    ) t;

    RETURN v_historial;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedido_get_historial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_get_historial(uuid) TO authenticated, service_role;
