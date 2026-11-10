-- =============================================================================
-- Migración INC-05: Tabla de Almacenamiento Técnico para MockDriveAdapter
-- Fecha: 2026-11-10
-- Entorno: Exclusivamente LOCAL y pruebas CI/CD determinísticas
-- Seguridad: Aislamiento estricto RLS y revocación de permisos públicos (42501)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public._mock_drive_storage (
  file_id text PRIMARY KEY,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  md5_checksum text,
  app_properties jsonb DEFAULT '{}'::jsonb,
  parent_folder_id text,
  content_base64 text NOT NULL,
  trashed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar Row Level Security estricto
ALTER TABLE public._mock_drive_storage ENABLE ROW LEVEL SECURITY;

-- Revocar todo permiso directo a roles anon, authenticated y public
REVOKE ALL ON public._mock_drive_storage FROM public, anon, authenticated;

-- Otorgar privilegios exclusivamente al rol de servicio interno (Edge Functions)
GRANT ALL ON public._mock_drive_storage TO service_role;

COMMENT ON TABLE public._mock_drive_storage IS
  'Tabla técnica efímera utilizada por MockDriveAdapter en entorno local para compartir contenido binario entre isolates Deno. Prohibido su uso y acceso directo en producción o roles cliente.';
