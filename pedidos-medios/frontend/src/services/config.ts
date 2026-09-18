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
  publicAppUrl?: string;
  contractVersion: string;
  pluginVersion: string;
}

declare global {
  interface Window {
    __PEDIDOS_CONFIG__?: Partial<PedidosPublicConfig>;
  }
}

const DEFAULT_CONFIG: PedidosPublicConfig = {
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU',
  environment: 'development',
  uiMode: 'development',
  basePath: '/formulariomedios',
  contractVersion: '3.0',
  pluginVersion: '0.1.0-beta2',
};

/**
 * Normaliza cualquier entrada de base path o URL a un basePath canónico para React Router.
 * - Elimina protocolos y dominios si se pasa una URL completa (ej: https://host/formulariomedios/ -> /formulariomedios).
 * - Garantiza leading slash (ej: formulariomedios -> /formulariomedios).
 * - Elimina trailing slashes redundantes (ej: /formulariomedios/ -> /formulariomedios).
 * - Elimina slashes múltiples consecutivos (ej: //formulariomedios/// -> /formulariomedios).
 * - Trimea espacios en blanco invisibles.
 * - Siempre retorna una cadena sin trailing slash (salvo si la raíz pura es '/').
 */
export function normalizeBasePath(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') {
    return '/formulariomedios';
  }

  let cleaned = raw.trim();
  if (!cleaned) {
    return '/formulariomedios';
  }

  // Si es una URL completa (http://, https://, o //domain), extraer solo el pathname
  if (/^https?:\/\//i.test(cleaned) || /^\/\/[^/]+/i.test(cleaned)) {
    try {
      const target = cleaned.startsWith('//') ? `http:${cleaned}` : cleaned;
      const url = new URL(target);
      cleaned = url.pathname;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\/[^/]+/i, '');
    }
  }

  // Normalizar slashes repetidos
  cleaned = cleaned.replace(/\/+/g, '/');

  // Asegurar leading slash
  if (!cleaned.startsWith('/')) {
    cleaned = `/${cleaned}`;
  }

  // Quitar trailing slashes si tiene más de 1 caracter
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    cleaned = cleaned.replace(/\/+$/, '');
  }

  return cleaned || '/formulariomedios';
}

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

  const basePath = normalizeBasePath(rawBasePath);

  const publicAppUrl =
    wpConfig.publicAppUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${basePath}`
      : undefined);

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
    publicAppUrl,
    contractVersion,
    pluginVersion,
  };
}

