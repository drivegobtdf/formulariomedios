-- ==============================================================================
-- MIGRATION 019: Explicit Grants for service_role on Public Schema Tables
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Conceder permisos completos al rol service_role para operaciones backend server-side (Edge Functions y workers)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 2. Asegurar privilegios por defecto futuros en schema public para service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
