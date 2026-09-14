/**
 * Módulo de configuración pública del cliente frontend.
 * Lee las opciones inyectadas por WordPress vía window.__PEDIDOS_CONFIG__
 * o recurre a las variables de entorno de Vite en desarrollo local.
 */

export interface PedidosPublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  environment: 'development' | 'staging' | 'production';
  uiMode: 'development' | 'production-preview';
  basePath: string;
  contractVersion: string;
  pluginVersion: string;
}

declare global {
  interface Window {
    __PEDIDOS_CONFIG__?: Partial<PedidosPublicConfig>;
  }
}

const DEFAULT_CONFIG: PedidosPublicConfig = {
  supabaseUrl: 'https://placeholder-project.supabase.co',
  supabaseAnonKey: 'sb_publishable_placeholder_anon_key_for_development_only',
  environment: 'development',
  uiMode: 'development',
  basePath: '/formulariomedios',
  contractVersion: '3.0',
  pluginVersion: '0.1.0-alpha',
};

export function getPublicConfig(): PedidosPublicConfig {
  const wpConfig = typeof window !== 'undefined' ? window.__PEDIDOS_CONFIG__ || {} : {};

  const supabaseUrl =
    wpConfig.supabaseUrl ||
    import.meta.env.VITE_SUPABASE_URL ||
    DEFAULT_CONFIG.supabaseUrl;

  const supabaseAnonKey =
    wpConfig.supabaseAnonKey ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_CONFIG.supabaseAnonKey;

  const environment = (wpConfig.environment ||
    import.meta.env.VITE_ENVIRONMENT ||
    DEFAULT_CONFIG.environment) as PedidosPublicConfig['environment'];

  const rawUiMode =
    wpConfig.uiMode ||
    import.meta.env.VITE_UI_MODE ||
    (environment === 'production' ? 'production-preview' : DEFAULT_CONFIG.uiMode);

  const uiMode =
    rawUiMode === 'production-preview' || rawUiMode === 'production'
      ? 'production-preview'
      : 'development';

  const rawBasePath =
    wpConfig.basePath ||
    import.meta.env.VITE_BASE_PATH ||
    DEFAULT_CONFIG.basePath;

  // Normalizar base path (asegurar leading slash y quitar trailing slash)
  const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
  const basePath =
    normalizedBasePath.length > 1 && normalizedBasePath.endsWith('/')
      ? normalizedBasePath.slice(0, -1)
      : normalizedBasePath;

  const contractVersion =
    wpConfig.contractVersion ||
    import.meta.env.VITE_CONTRACT_VERSION ||
    DEFAULT_CONFIG.contractVersion;

  const pluginVersion = wpConfig.pluginVersion || DEFAULT_CONFIG.pluginVersion;

  return {
    supabaseUrl,
    supabaseAnonKey,
    environment,
    uiMode,
    basePath,
    contractVersion,
    pluginVersion,
  };
}
