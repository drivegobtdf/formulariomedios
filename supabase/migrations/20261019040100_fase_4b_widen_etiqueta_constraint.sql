-- ============================================================================
-- MIGRATION: 20261019040100_fase_4b_widen_etiqueta_constraint.sql
-- DESCRIPTION: FASE 4B - Ampliación de constraint check_pedidos_etiqueta_interna
--               para sincronización backward-compatible con pedido_etiquetas
-- ============================================================================

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS check_pedidos_etiqueta_interna;
ALTER TABLE public.pedidos ADD CONSTRAINT check_pedidos_etiqueta_interna 
  CHECK (etiqueta_interna IS NULL OR (char_length(etiqueta_interna) <= 30 AND char_length(trim(etiqueta_interna)) > 0));
