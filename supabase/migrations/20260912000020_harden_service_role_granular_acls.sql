-- ==============================================================================
-- MIGRATION 020: Granular Least-Privilege ACLs for service_role
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

BEGIN;

-- 1. Revocar el grant indiscriminado ALL de service_role sobre tablas públicas
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role;

-- 2. Conceder exclusivamente las operaciones DML necesarias (PoLP: SELECT, INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Conceder privilegios sobre secuencias (USAGE, SELECT, UPDATE)
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Conceder ejecución de rutinas/funciones públicas y privadas a service_role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

-- 5. Ajustar privilegios por defecto futuros en schema public para service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO service_role;

-- 6. Re-asegurar aislamiento estricto de funciones core de servidor
REVOKE EXECUTE ON FUNCTION public.submission_create_core(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_create_core(jsonb) TO service_role;

COMMIT;
