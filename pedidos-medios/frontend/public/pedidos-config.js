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
  // URL base de Supabase Cloud Producción
  supabaseUrl: 'https://uwzgyirilafgnbpmrkic.supabase.co',

  // Clave pública/anon de Supabase Producción (protegida por RLS en el backend)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3emd5aXJpbGFmZ25icG1ya2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY0MjIsImV4cCI6MjEwNTMzMjQyMn0.CF9BcagNdprp7h24aAPrKpdD1SLg9i-LUiCxkdSSPA8',

  // Entorno de ejecución: 'production' | 'staging' | 'development'
  environment: 'production',

  // Modo de interfaz: 'production-preview' (institucional limpia) o 'development' (con badges y nav dev)
  uiMode: 'production-preview',

  // Ruta base de la aplicación dentro del dominio ('/' para raíz de subdominio)
  basePath: '/',

  // URL pública canónica completa de la aplicación
  publicAppUrl: 'https://formulariomedios.netlify.app',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '3.0',

  // Versión del paquete
  pluginVersion: '0.1.0-beta2',
};
