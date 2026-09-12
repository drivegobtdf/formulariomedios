-- ==============================================================================
-- MIGRATION 018: Harden Technical Tables Isolation (No Direct Client Access)
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Eliminar políticas SELECT que exponían submission_sessions y upload_reservations al rol authenticated
DROP POLICY IF EXISTS "submission_sessions_select_team" ON public.submission_sessions;
DROP POLICY IF EXISTS "upload_reservations_select_team" ON public.upload_reservations;

-- 2. Asegurar que las tablas técnicas tienen RLS habilitado sin policies para clientes
ALTER TABLE public.submission_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;

-- 3. Revocar todo privilegio directo (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER)
-- de los roles de navegador/cliente (PUBLIC, anon, authenticated)
REVOKE ALL ON TABLE public.submission_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.submission_sessions FROM anon;
REVOKE ALL ON TABLE public.submission_sessions FROM authenticated;

REVOKE ALL ON TABLE public.upload_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.upload_reservations FROM anon;
REVOKE ALL ON TABLE public.upload_reservations FROM authenticated;

-- 4. Conceder privilegios exclusivos a service_role (backend Edge Functions y RPCs autorizados)
GRANT ALL ON TABLE public.submission_sessions TO service_role;
GRANT ALL ON TABLE public.upload_reservations TO service_role;
