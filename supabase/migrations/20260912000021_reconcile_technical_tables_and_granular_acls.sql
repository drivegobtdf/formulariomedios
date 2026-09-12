-- ==============================================================================
-- MIGRATION 021: Reconcile Technical Tables Isolation and Granular ACLs
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Aislamiento Total de Tablas Técnicas y Ledgers Crudos (DENY para Browser)
-- -----------------------------------------------------------------------------

-- submission_sessions
DROP POLICY IF EXISTS "submission_sessions_select_team" ON public.submission_sessions;
ALTER TABLE public.submission_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.submission_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.submission_sessions FROM anon;
REVOKE ALL ON TABLE public.submission_sessions FROM authenticated;

-- upload_reservations
DROP POLICY IF EXISTS "upload_reservations_select_team" ON public.upload_reservations;
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.upload_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.upload_reservations FROM anon;
REVOKE ALL ON TABLE public.upload_reservations FROM authenticated;

-- domain_events (ledger crudo)
DROP POLICY IF EXISTS "domain_events_select_admin" ON public.domain_events;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.domain_events FROM PUBLIC;
REVOKE ALL ON TABLE public.domain_events FROM anon;
REVOKE ALL ON TABLE public.domain_events FROM authenticated;

-- comunicaciones_pedido (ledger crudo)
DROP POLICY IF EXISTS "comunicaciones_select_team" ON public.comunicaciones_pedido;
ALTER TABLE public.comunicaciones_pedido ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comunicaciones_pedido FROM PUBLIC;
REVOKE ALL ON TABLE public.comunicaciones_pedido FROM anon;
REVOKE ALL ON TABLE public.comunicaciones_pedido FROM authenticated;

-- pedido_sequences (tabla técnica de secuencia anual)
DROP POLICY IF EXISTS "sequences_select_team" ON public.pedido_sequences;
ALTER TABLE public.pedido_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pedido_sequences FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_sequences FROM anon;
REVOKE ALL ON TABLE public.pedido_sequences FROM authenticated;

-- -----------------------------------------------------------------------------
-- 2. Configuración Estricta de audit_log (SELECT solo para Administrador Aprobado)
-- -----------------------------------------------------------------------------

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_log FROM anon;
REVOKE ALL ON TABLE public.audit_log FROM authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
    FOR SELECT
    TO authenticated
    USING (private.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Refinamiento Granular de Privilegios para service_role (PoLP Estricto)
-- -----------------------------------------------------------------------------

-- Revocar privilegios amplios previos de service_role sobre tablas públicas
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role;

-- A) Tablas Operativas con Ciclo de Vida Completo (SELECT, INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.usuarios_acceso,
    public.pedido_asignaciones,
    public.submission_sessions,
    public.upload_reservations,
    public.archivos,
    public.archivo_pedido,
    public.enlaces_material,
    public.enlace_pedido,
    public.solicitudes_informacion,
    public.notas_pedido,
    public.entregas_pedido
TO service_role;

-- B) Tablas de Dominio y Catálogos sin Eliminación Runtime (SELECT, INSERT, UPDATE)
GRANT SELECT, INSERT, UPDATE ON TABLE
    public.categorias_servicio,
    public.tipos_servicio,
    public.envios_formulario,
    public.pedidos,
    public.pedido_sequences
TO service_role;

-- C) Tablas Inmutables / Append-Only (SELECT, INSERT)
GRANT SELECT, INSERT ON TABLE
    public.domain_events,
    public.audit_log,
    public.comunicaciones_pedido
TO service_role;

-- D) Secuencias (USAGE, SELECT, UPDATE)
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- E) Funciones y Rutinas
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

-- F) RPC Core: Invocación Exclusiva Server-Side
REVOKE EXECUTE ON FUNCTION public.submission_create_core(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_create_core(jsonb) TO service_role;

-- G) Default Privileges en schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO service_role;

COMMIT;
