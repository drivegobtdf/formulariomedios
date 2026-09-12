import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPublicConfig } from './config';

let clientInstance: SupabaseClient | null = null;

/**
 * Inicializa y retorna el cliente de Supabase configurado con las credenciales públicas.
 * En la fase F1, este cliente utiliza la anon key y URL configuradas.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    const config = getPublicConfig();
    clientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}
