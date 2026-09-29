-- ==============================================================================
-- MIGRATION 059: Automatic Periodic Reconciler Job for Google Drive Folders
-- Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
-- Frecuencia: Cada 5 minutos (*/5 * * * *)
-- Seguridad: Autenticación Service-to-Service mediante Supabase Vault (Zero-Secrets in SQL)
-- ==============================================================================

-- 1. Asegurar extensiones requeridas en schema extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Eliminar job previo si ya existiese para evitar duplicidad
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drive-organization-reconcile-prod') THEN
    PERFORM cron.unschedule('drive-organization-reconcile-prod');
  END IF;
END $$;

-- 3. Programar el cron job periódico cada 5 minutos
SELECT cron.schedule(
  'drive-organization-reconcile-prod',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reconcile_endpoint_url' LIMIT 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pedidos-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reconcile_dispatch_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
