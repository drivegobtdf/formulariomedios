-- ==============================================================================
-- MIGRATION 031: RLS Policy for Approved Users to View Approved Colleagues
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- Permitir a cualquier usuario interno aprobado (Admin, Equipo, Observador)
-- consultar únicamente los perfiles de otros usuarios aprobados (para asignaciones y visualización en el tablero).
-- Los usuarios pendientes, rechazados y revocados siguen siendo visibles ÚNICAMENTE para Administradores.

DROP POLICY IF EXISTS "usuarios_acceso_select_approved" ON public.usuarios_acceso;
CREATE POLICY "usuarios_acceso_select_approved" ON public.usuarios_acceso
    FOR SELECT
    TO authenticated
    USING (private.is_approved() AND estado_acceso = 'aprobado');
