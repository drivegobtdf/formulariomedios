-- ==============================================================================
-- MIGRATION 029: Clean Legacy Magic Token Payloads from Pre-027 Testing
-- ==============================================================================

UPDATE public.comunicaciones_pedido
SET payload = (payload - 'raw_token' - 'magic_token' - 'token')
WHERE payload ? 'raw_token' OR payload ? 'magic_token' OR payload ? 'token';
