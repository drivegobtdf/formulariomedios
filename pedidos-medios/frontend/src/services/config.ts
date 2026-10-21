/**
 * Módulo de configuración pública del cliente frontend.
 * Lee las opciones inyectadas por WordPress o Standalone vía window.__PEDIDOS_CONFIG__
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

export const PROD_SUPABASE_REF = 'uwzgyirilafgnbpmrkic';
export const TEST_SUPABASE_REF = 'yqfkzgqvezarzhlwiilo';

export const DEFAULT_CONFIG: PedidosPublicConfig = {
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU',
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

/**
 * Resuelve la configuración efectiva evaluando la precedencia según el entorno de ejecución
 * e imponiendo una guarda estricta para impedir conexiones a Supabase Producción desde local/dev.
 */
export function resolvePublicConfig(options?: {
  isDev?: boolean;
  envOverrides?: Partial<Record<string, string>>;
}): PedidosPublicConfig {
  const wpConfig = typeof window !== 'undefined' ? window.__PEDIDOS_CONFIG__ || {} : {};

  // Detección de entorno: modo desarrollo de Vite o ejecución en localhost/127.0.0.1
  const isDev =
    options?.isDev ??
    Boolean(
      import.meta.env?.MODE === 'development' ||
        (typeof window !== 'undefined' &&
          ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location?.hostname || '') &&
          import.meta.env?.MODE !== 'test')
    );

  const env = options?.envOverrides || (typeof import.meta !== 'undefined' ? import.meta.env || {} : {});

  let rawSupabaseUrl: string;
  let rawSupabaseAnonKey: string;
  let rawEnvironment: string;
  let rawUiMode: string;
  let rawBasePath: string;

  if (isDev) {
    // ENTORNO DESARROLLO LOCAL:
    // Las variables de entorno locales (.env.development / .env.local) tienen precedencia sobre
    // window.__PEDIDOS_CONFIG__ para evitar que una configuración estática de producción contamine local.
    rawSupabaseUrl =
      env.VITE_SUPABASE_URL ||
      wpConfig.supabaseUrl ||
      DEFAULT_CONFIG.supabaseUrl;

    rawSupabaseAnonKey =
      env.VITE_SUPABASE_ANON_KEY ||
      wpConfig.supabaseAnonKey ||
      DEFAULT_CONFIG.supabaseAnonKey;

    rawEnvironment =
      env.VITE_ENVIRONMENT ||
      (wpConfig.environment && wpConfig.environment !== 'production' ? wpConfig.environment : undefined) ||
      'development';

    rawUiMode =
      env.VITE_UI_MODE ||
      wpConfig.uiMode ||
      'development';

    // En desarrollo local el basePath por defecto es '/' (o lo indicado en VITE_BASE_PATH)
    rawBasePath =
      env.VITE_BASE_PATH ||
      wpConfig.basePath ||
      '/';
  } else {
    // ENTORNO PRODUCCIÓN / COMPILACIÓN / WORDPRESS RUNTIME:
    // window.__PEDIDOS_CONFIG__ tiene máxima prioridad para permitir parametrización dinámica sin recompilar.
    rawSupabaseUrl =
      wpConfig.supabaseUrl ||
      env.VITE_SUPABASE_URL ||
      DEFAULT_CONFIG.supabaseUrl;

    rawSupabaseAnonKey =
      wpConfig.supabaseAnonKey ||
      env.VITE_SUPABASE_ANON_KEY ||
      DEFAULT_CONFIG.supabaseAnonKey;

    rawEnvironment =
      wpConfig.environment ||
      env.VITE_ENVIRONMENT ||
      DEFAULT_CONFIG.environment;

    rawUiMode =
      wpConfig.uiMode ||
      env.VITE_UI_MODE ||
      (rawEnvironment === 'production' ? 'production-preview' : DEFAULT_CONFIG.uiMode);

    rawBasePath =
      wpConfig.basePath ||
      env.VITE_BASE_PATH ||
      DEFAULT_CONFIG.basePath;
  }

  // GUARDA DE SEGURIDAD ESTRICTA:
  // Si estamos en entorno local/desarrollo (isDev o hostname localhost), JAMÁS se permite conectar a PROD.
  const isLocalHost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location?.hostname || '');

  if ((isDev || isLocalHost) && rawSupabaseUrl.includes(PROD_SUPABASE_REF)) {
    console.warn(
      `[PEDIDOS Config Guard] Intento de conexión bloqueado: Entorno local/desarrollo no puede conectarse a Supabase Producción (${PROD_SUPABASE_REF}). Redirigiendo a entorno seguro (TEST/LOCAL).`
    );
    rawSupabaseUrl =
      env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_URL.includes(PROD_SUPABASE_REF)
        ? env.VITE_SUPABASE_URL
        : DEFAULT_CONFIG.supabaseUrl;

    rawSupabaseAnonKey =
      env.VITE_SUPABASE_ANON_KEY && !rawSupabaseUrl.includes(PROD_SUPABASE_REF)
        ? env.VITE_SUPABASE_ANON_KEY
        : DEFAULT_CONFIG.supabaseAnonKey;

    rawEnvironment = 'development';
  }

  const environment = (rawEnvironment === 'production'
    ? 'production'
    : rawEnvironment === 'staging'
      ? 'staging'
      : 'development') as PedidosPublicConfig['environment'];

  const uiMode =
    rawUiMode === 'production-preview' || rawUiMode === 'production'
      ? 'production-preview'
      : 'development';

  const basePath = normalizeBasePath(rawBasePath);

  const publicAppUrl =
    wpConfig.publicAppUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${basePath === '/' ? '' : basePath}`
      : undefined);

  const contractVersion =
    wpConfig.contractVersion ||
    env.VITE_CONTRACT_VERSION ||
    DEFAULT_CONFIG.contractVersion;

  const pluginVersion = wpConfig.pluginVersion || DEFAULT_CONFIG.pluginVersion;

  return {
    supabaseUrl: rawSupabaseUrl,
    supabaseAnonKey: rawSupabaseAnonKey,
    environment,
    uiMode,
    basePath,
    publicAppUrl,
    contractVersion,
    pluginVersion,
  };
}

export function getPublicConfig(): PedidosPublicConfig {
  return resolvePublicConfig();
}
