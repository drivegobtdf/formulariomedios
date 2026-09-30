-- =============================================================================
-- Migration: 20260930000064_allow_revision_context_in_archivos.sql
-- Description:
-- Actualiza la restricción CHECK 'archivos_contexto_check' en la tabla 'public.archivos'
-- para incluir explícitamente el contexto 'revision', permitiendo la subida de adjuntos
-- en solicitudes de revisión / retrabajo.
-- =============================================================================

ALTER TABLE public.archivos DROP CONSTRAINT IF EXISTS archivos_contexto_check;
ALTER TABLE public.archivos ADD CONSTRAINT archivos_contexto_check 
    CHECK (contexto IN ('solicitud', 'informacion_respuesta', 'interno', 'entrega', 'revision'));

NOTIFY pgrst, 'reload schema';
