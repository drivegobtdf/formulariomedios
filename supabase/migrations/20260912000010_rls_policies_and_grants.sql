-- ==============================================================================
-- MIGRATION 010: RLS Policies and Principle of Least Privilege Grants
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Revocación Total de Privilegios por Defecto
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Concesión Selectiva de Privilegios SELECT (Mínimo Privilegio)
GRANT SELECT ON public.categorias_servicio TO anon, authenticated;
GRANT SELECT ON public.tipos_servicio TO anon, authenticated;

GRANT SELECT ON public.envios_formulario TO authenticated;
GRANT SELECT ON public.pedidos TO authenticated;
GRANT SELECT ON public.pedido_asignaciones TO authenticated;
GRANT SELECT ON public.usuarios_acceso TO authenticated;
GRANT SELECT ON public.solicitudes_informacion TO authenticated;
GRANT SELECT ON public.archivos TO authenticated;
GRANT SELECT ON public.archivo_pedido TO authenticated;
GRANT SELECT ON public.upload_reservations TO authenticated;
GRANT SELECT ON public.enlaces_material TO authenticated;
GRANT SELECT ON public.enlace_pedido TO authenticated;
GRANT SELECT ON public.notas_pedido TO authenticated;
GRANT SELECT ON public.entregas_pedido TO authenticated;
GRANT SELECT ON public.domain_events TO authenticated;
GRANT SELECT ON public.comunicaciones_pedido TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.pedido_sequences TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Políticas RLS: Catálogos Públicos
-- -----------------------------------------------------------------------------

-- categorias_servicio
DROP POLICY IF EXISTS "categorias_public_read" ON public.categorias_servicio;
CREATE POLICY "categorias_public_read" ON public.categorias_servicio
    FOR SELECT
    TO anon, authenticated
    USING (activo = true OR private.is_approved());

-- tipos_servicio
DROP POLICY IF EXISTS "tipos_public_read" ON public.tipos_servicio;
CREATE POLICY "tipos_public_read" ON public.tipos_servicio
    FOR SELECT
    TO anon, authenticated
    USING (activo = true OR private.is_approved());

-- -----------------------------------------------------------------------------
-- 4. Políticas RLS: Perfiles de Usuario (usuarios_acceso)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "usuarios_acceso_select_self" ON public.usuarios_acceso;
CREATE POLICY "usuarios_acceso_select_self" ON public.usuarios_acceso
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "usuarios_acceso_select_admin" ON public.usuarios_acceso;
CREATE POLICY "usuarios_acceso_select_admin" ON public.usuarios_acceso
    FOR SELECT
    TO authenticated
    USING (private.is_admin());

-- -----------------------------------------------------------------------------
-- 5. Políticas RLS: Dominio Operativo de Pedidos (Aprobados: Observador, Equipo, Admin)
-- -----------------------------------------------------------------------------

-- envios_formulario
DROP POLICY IF EXISTS "envios_select_approved" ON public.envios_formulario;
CREATE POLICY "envios_select_approved" ON public.envios_formulario
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- pedidos
DROP POLICY IF EXISTS "pedidos_select_approved" ON public.pedidos;
CREATE POLICY "pedidos_select_approved" ON public.pedidos
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- pedido_asignaciones
DROP POLICY IF EXISTS "asignaciones_select_approved" ON public.pedido_asignaciones;
CREATE POLICY "asignaciones_select_approved" ON public.pedido_asignaciones
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- solicitudes_informacion
DROP POLICY IF EXISTS "solicitudes_info_select_approved" ON public.solicitudes_informacion;
CREATE POLICY "solicitudes_info_select_approved" ON public.solicitudes_informacion
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- archivos
DROP POLICY IF EXISTS "archivos_select_approved" ON public.archivos;
CREATE POLICY "archivos_select_approved" ON public.archivos
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- archivo_pedido
DROP POLICY IF EXISTS "archivo_pedido_select_approved" ON public.archivo_pedido;
CREATE POLICY "archivo_pedido_select_approved" ON public.archivo_pedido
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- enlaces_material
DROP POLICY IF EXISTS "enlaces_select_approved" ON public.enlaces_material;
CREATE POLICY "enlaces_select_approved" ON public.enlaces_material
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- enlace_pedido
DROP POLICY IF EXISTS "enlace_pedido_select_approved" ON public.enlace_pedido;
CREATE POLICY "enlace_pedido_select_approved" ON public.enlace_pedido
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- notas_pedido
DROP POLICY IF EXISTS "notas_select_approved" ON public.notas_pedido;
CREATE POLICY "notas_select_approved" ON public.notas_pedido
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- entregas_pedido
DROP POLICY IF EXISTS "entregas_select_approved" ON public.entregas_pedido;
CREATE POLICY "entregas_select_approved" ON public.entregas_pedido
    FOR SELECT
    TO authenticated
    USING (private.is_approved());

-- -----------------------------------------------------------------------------
-- 6. Políticas RLS: Recursos Restringidos a Equipo y Administrador
-- -----------------------------------------------------------------------------

-- upload_reservations
DROP POLICY IF EXISTS "upload_reservations_select_team" ON public.upload_reservations;
CREATE POLICY "upload_reservations_select_team" ON public.upload_reservations
    FOR SELECT
    TO authenticated
    USING (private.is_team_or_admin());

-- comunicaciones_pedido
DROP POLICY IF EXISTS "comunicaciones_select_team" ON public.comunicaciones_pedido;
CREATE POLICY "comunicaciones_select_team" ON public.comunicaciones_pedido
    FOR SELECT
    TO authenticated
    USING (private.is_team_or_admin());

-- pedido_sequences
DROP POLICY IF EXISTS "sequences_select_team" ON public.pedido_sequences;
CREATE POLICY "sequences_select_team" ON public.pedido_sequences
    FOR SELECT
    TO authenticated
    USING (private.is_team_or_admin());

-- -----------------------------------------------------------------------------
-- 7. Políticas RLS: Recursos Restringidos Estrictamente a Administrador
-- -----------------------------------------------------------------------------

-- domain_events
DROP POLICY IF EXISTS "domain_events_select_admin" ON public.domain_events;
CREATE POLICY "domain_events_select_admin" ON public.domain_events
    FOR SELECT
    TO authenticated
    USING (private.is_admin());

-- audit_log
DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
    FOR SELECT
    TO authenticated
    USING (private.is_admin());
