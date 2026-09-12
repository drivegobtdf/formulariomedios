declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve?(handler: (req: Request) => Promise<Response> | Response): void;
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
      if (typeof parsed === 'string') {
        serviceRoleKey = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed)) {
          const found = parsed.find(
            (k: Record<string, unknown>) => k?.name === 'service_role' || k?.name === 'default' || k?.type === 'service_role'
          );
          serviceRoleKey = (found?.api_key || found?.key || found?.value || parsed[0]?.api_key || parsed[0]?.key || parsed[0]?.value || '') as string;
        } else {
          const dict = parsed as Record<string, string>;
          serviceRoleKey =
            dict.default ||
            dict.service_role ||
            dict.secret ||
            (Object.values(dict).find((val) => typeof val === 'string' && val.length > 0) as string) ||
            '';
        }
      }
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
      if (typeof parsed === 'string') {
        publishableKey = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed)) {
          const found = parsed.find(
            (k: Record<string, unknown>) => k?.name === 'anon' || k?.name === 'default' || k?.name === 'publishable'
          );
          publishableKey = (found?.api_key || found?.key || found?.value || parsed[0]?.api_key || parsed[0]?.key || parsed[0]?.value || '') as string;
        } else {
          const dict = parsed as Record<string, string>;
          publishableKey =
            dict.default ||
            dict.anon ||
            dict.publishable ||
            (Object.values(dict).find((val) => typeof val === 'string' && val.length > 0) as string) ||
            '';
        }
      }
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
