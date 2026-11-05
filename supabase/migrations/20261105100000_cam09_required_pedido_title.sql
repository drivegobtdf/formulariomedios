-- CAM-09 — Título obligatorio para TODO PED nuevo (público e interno).
-- Base: 2ef5f980dba9303ee4c915e7e66a2d4068dfe3d3.
-- Adición forward-only: no reescribe ni invalida pedidos históricos sin título.
-- No altera la RPC pública existente, la clave de idempotencia ni el flujo de Drive.

CREATE OR REPLACE FUNCTION public.cam09_require_new_pedido_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_title text;
BEGIN
    -- En el formulario público, el título llega dentro del JSON de cada pieza.
    -- En creación interna ya llega en public.pedidos.titulo.
    v_title := btrim(COALESCE(NULLIF(btrim(NEW.titulo), ''), NEW.informacion_especifica->>'titulo', ''));

    IF char_length(v_title) < 3 OR char_length(v_title) > 200 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED: Cada pedido debe tener un título de 3 a 200 caracteres'
            USING ERRCODE = '42200';
    END IF;
    IF v_title ~ '<[^>]*>' THEN
        RAISE EXCEPTION 'TITLE_INVALID: El título no puede contener etiquetas HTML'
            USING ERRCODE = '42200';
    END IF;

    NEW.titulo := v_title;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cam09_require_new_pedido_title ON public.pedidos;
CREATE TRIGGER trg_cam09_require_new_pedido_title
BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.cam09_require_new_pedido_title();

REVOKE ALL ON FUNCTION public.cam09_require_new_pedido_title() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.cam09_require_new_pedido_title()
IS 'CAM-09: título obligatorio de PED nuevos, sin backfill ni constraints contra históricos.';
