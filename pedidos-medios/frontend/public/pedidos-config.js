/**
 * PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 * Configuración Pública en Tiempo de Ejecución (Standalone SPA)
 *
 * Este archivo permite al administrador modificar parámetros de conexión y URLs
 * sin necesidad de recompilar el bundle de la aplicación React.
 *
 * NOTA DE SEGURIDAD:
 * Este archivo se ejecuta directamente en el navegador del usuario.
 * NUNCA incluya credenciales privadas, service_role, contraseñas ni secretos aquí.
 */
window.__PEDIDOS_CONFIG__ = {
  // URL base de Supabase Cloud TEST / Producción
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',

  // Clave pública/anon de Supabase (protegida por RLS en el backend)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU',

  // Entorno de ejecución: 'production' | 'staging' | 'development'
  environment: 'production',

  // Modo de interfaz: 'production-preview' (institucional limpia) o 'development' (con badges y nav dev)
  uiMode: 'production-preview',

  // Ruta base de la aplicación dentro del dominio ('/' para raíz de subdominio)
  basePath: '/',

  // URL pública canónica completa de la aplicación
  publicAppUrl: 'https://formulariomedios.tierradelfuego.gob.ar',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '3.0',

  // Versión del paquete
  pluginVersion: '0.1.0-beta2',
};
