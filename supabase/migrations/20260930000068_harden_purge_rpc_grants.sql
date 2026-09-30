-- ==============================================================================
-- MIGRATION 068: Strict PoLP Grants for Internal Admin Purge Saga RPCs
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- ==============================================================================

-- 1. Eliminar sobrecargas obsoletas de migraciones anteriores
DROP FUNCTION IF EXISTS public.admin_pedidos_purge_preview(uuid[]);
DROP FUNCTION IF EXISTS public.admin_pedidos_purge(uuid[], text);

-- 2. Revocar privilegios públicos, anónimos y autenticados (Principio de Menor Privilegio)
-- Toda la orquestación y validación de purga debe ocurrir exclusivamente a través
-- de la Edge Function 'admin-pedidos-purge'.

REVOKE ALL ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge_preview(uuid[], text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_purge_operation_init(uuid[], text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_purge_operation_init(uuid[], text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_operation_init(uuid[], text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_purge_item_update(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_purge_item_update(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_item_update(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_purge_operation_step_drive(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_purge_operation_step_drive(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_operation_step_drive(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_pedidos_purge(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_pedidos_purge(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pedidos_purge(uuid, text) TO service_role;
