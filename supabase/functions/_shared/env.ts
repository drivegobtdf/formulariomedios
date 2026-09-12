declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
} | undefined;

/**
 * Lee una variable de entorno prefiriendo la API nativa de Deno (Edge Runtime)
 * con fallback seguro a process.env (para Vitest y Node.js runner).
 */
export function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    try {
      return Deno.env.get(name);
    } catch {
      // Ignorar si no hay permisos de lectura de entorno en Deno
    }
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}

export interface SupabaseConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
}

/**
 * Resuelve las credenciales de Supabase priorizando las variables modernas de Supabase Cloud
 * (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS en formato JSON) con fallback legacy.
 */
export function getSupabaseConfig(): SupabaseConfig {
  const supabaseUrl = getEnv('SUPABASE_URL') || 'http://127.0.0.1:54351';

  // 1. SUPABASE_SECRET_KEYS (JSON) -> fallback a SUPABASE_SERVICE_ROLE_KEY
  let serviceRoleKey = '';
  const rawSecretKeys = getEnv('SUPABASE_SECRET_KEYS');
  if (rawSecretKeys) {
    try {
      const parsed = JSON.parse(rawSecretKeys);
      serviceRoleKey = parsed?.default || parsed?.service_role || (typeof parsed === 'string' ? parsed : '');
    } catch {
      serviceRoleKey = rawSecretKeys;
    }
  }
  if (!serviceRoleKey) {
    serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || '';
  }

  // 2. SUPABASE_PUBLISHABLE_KEYS (JSON) -> fallback a SUPABASE_ANON_KEY
  let publishableKey = '';
  const rawPublishableKeys = getEnv('SUPABASE_PUBLISHABLE_KEYS');
  if (rawPublishableKeys) {
    try {
      const parsed = JSON.parse(rawPublishableKeys);
      publishableKey = parsed?.default || parsed?.anon || (typeof parsed === 'string' ? parsed : '');
    } catch {
      publishableKey = rawPublishableKeys;
    }
  }
  if (!publishableKey) {
    publishableKey = getEnv('SUPABASE_ANON_KEY') || '';
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}
