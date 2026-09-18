-- =============================================================================
-- Migration 047: Reset Clean Slate for Production
-- Secretaría de Medios — Gobierno de Tierra del Fuego AIAS
-- 
-- Objetivo:
-- Garantizar un estado operativo 100% limpio (0 pedidos, 0 envíos, 0 archivos,
-- 0 comunicaciones, 0 eventos de dominio) y secuencia 2026 inicializada en 0,
-- preservando intactos los catálogos oficiales y usuarios administrativos.
-- =============================================================================

DO $$
BEGIN
    -- Truncar tablas operativas y transaccionales
    TRUNCATE TABLE 
        public.pedidos,
        public.envios_formulario,
        public.archivos,
        public.upload_reservations,
        public.archivo_pedido,
        public.solicitudes_informacion,
        public.notas_pedido,
        public.entregas_pedido,
        public.pedido_asignaciones,
        public.comunicaciones_pedido,
        public.domain_events,
        public.audit_log,
        public.submission_sessions,
        public.solicitante_sesiones,
        public.solicitante_access_tokens,
        public.tracking_recovery_tokens,
        public.enlaces_material,
        public.enlace_pedido,
        public.archivo_solicitud_informacion,
        public.enlace_solicitud_informacion
    CASCADE;

    -- Resetear secuencia anual de pedidos a 0 para el año 2026
    INSERT INTO public.pedido_sequences (anio, current_value)
    VALUES (2026, 0)
    ON CONFLICT (anio) DO UPDATE SET current_value = 0;
END $$;
