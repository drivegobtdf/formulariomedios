/**
 * PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 * Configuración Pública en Tiempo de Ejecución (Desarrollo Local / Entorno de Pruebas)
 *
 * NOTA DE SEGURIDAD:
 * En desarrollo local y pruebas NUNCA se conecta a Supabase Producción.
 * La configuración de Producción se inyecta exclusivamente durante el empaquetado de release
 * (scripts/postbuild-standalone.mjs) o mediante las variables de compilación de Cloudflare.
 */
window.__PEDIDOS_CONFIG__ = {
  // Endpoint de Supabase TEST / Staging (SEGURO para desarrollo local)
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',

  // Clave pública/anon de Supabase TEST
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU',

  // Entorno de ejecución: 'development'
  environment: 'development',

  // Modo de interfaz: 'development' (habilita badges e información de QA)
  uiMode: 'development',

  // Ruta base de la aplicación dentro del dev server
  basePath: '/',

  // URL pública canónica completa local
  publicAppUrl: 'http://localhost:5173',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '3.0',

  // Versión del paquete
  pluginVersion: '0.1.0-beta2',
};
