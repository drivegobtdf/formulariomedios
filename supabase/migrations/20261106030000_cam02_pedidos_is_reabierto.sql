-- =============================================================================
-- CAM-02: Persistencia Histórica Canónica de Reapertura de Pedidos
-- Fecha: 2026-11-06
-- Worktree: _worktrees_pedidos/CAM-08-hotfix
--
-- 1. Agrega columna canónica public.pedidos.is_reabierto (boolean DEFAULT false).
-- 2. Backfill histórico idempotente exclusivamente desde public.domain_events ('pedido.reopened').
-- 3. Trigger transaccional trg_domain_events_sync_reabierto en domain_events para marcar
--    inmediatamente is_reabierto = true ante nuevos eventos 'pedido.reopened'.
-- 4. Trigger de protección trg_pedidos_protect_reabierto en pedidos para impedir
--    que is_reabierto sea degradado a false mediante cualquier operación ordinaria.
-- =============================================================================

-- 1. Columna canónica en pedidos
ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS is_reabierto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pedidos.is_reabierto IS
'Indicador canónico e inmutable de que el pedido transitó por una reapertura institucional autorizada (domain_events: pedido.reopened). Persiste independientemente de estados posteriores.';

-- Índice parcial para consultas eficientes de pedidos reabiertos
CREATE INDEX IF NOT EXISTS idx_pedidos_is_reabierto
ON public.pedidos (is_reabierto)
WHERE is_reabierto = true;

-- 2. Backfill histórico idempotente desde domain_events
DO $$
DECLARE
    v_rows_updated integer;
BEGIN
    UPDATE public.pedidos p
    SET is_reabierto = true
    WHERE EXISTS (
        SELECT 1 FROM public.domain_events de
        WHERE de.aggregate_id = p.id
          AND de.event_name = 'pedido.reopened'
    )
    AND p.is_reabierto = false;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RAISE NOTICE 'CAM-02 Backfill: % pedidos históricos marcados con is_reabierto = true', v_rows_updated;
END $$;

-- 3. Trigger transaccional: Nuevos eventos 'pedido.reopened' establecen is_reabierto = true
CREATE OR REPLACE FUNCTION public.trg_domain_events_sync_is_reabierto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
BEGIN
    IF NEW.event_name = 'pedido.reopened' AND NEW.aggregate_id IS NOT NULL THEN
        UPDATE public.pedidos
        SET is_reabierto = true,
            updated_at = now()
        WHERE id = NEW.aggregate_id
          AND is_reabierto = false;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domain_events_sync_reabierto ON public.domain_events;
CREATE TRIGGER trg_domain_events_sync_reabierto
AFTER INSERT ON public.domain_events
FOR EACH ROW
WHEN (NEW.event_name = 'pedido.reopened')
EXECUTE FUNCTION public.trg_domain_events_sync_is_reabierto();

-- 4. Trigger de protección: Impedir que is_reabierto vuelva a false
CREATE OR REPLACE FUNCTION public.trg_pedidos_protect_is_reabierto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
BEGIN
    -- Si ya estaba marcado como reabierto, impedir que cualquier update ordinario lo regrese a false
    IF OLD.is_reabierto IS TRUE AND NEW.is_reabierto IS FALSE THEN
        NEW.is_reabierto := true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_protect_reabierto ON public.pedidos;
CREATE TRIGGER trg_pedidos_protect_reabierto
BEFORE UPDATE OF is_reabierto ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.trg_pedidos_protect_is_reabierto();
