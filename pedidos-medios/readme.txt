=== Pedidos — Secretaría de Medios ===
Contributors: drivegobtdf
Tags: pedidos, medios, gobierno, forms, supabase
Requires at least: 6.0
Tested up to: 7.0.2
Requires PHP: 8.2
Stable tag: 0.1.0-alpha
License: Proprietary

App frontend y host de integración institucional para el sistema de PEDIDOS (Secretaría de Medios - Gobierno de Tierra del Fuego AIAS).

== Description ==

Plugin WordPress que hospeda la SPA cliente del sistema de recepción y gestión de pedidos de comunicación y prensa.

Arquitectura: WSN-GD-v2 (WordPress + Supabase + n8n + Google Drive).
- WordPress: host institucional, enrutamiento y contenedor frontend.
- Supabase: base de datos relacional PostgreSQL, Auth, RLS, RPCs y metadata.
- Google Drive: almacenamiento de binarios.
- n8n: notificaciones por correo y flujos asíncronos.

== Installation ==

1. Subir la carpeta `pedidos-medios` al directorio `/wp-content/plugins/` o instalar el archivo ZIP desde el panel de WordPress.
2. Activar el plugin desde el menú 'Plugins' en WordPress.
3. Insertar el shortcode `[pedidos_medios_app]` en la página designada (p. ej. `/formulariomedios`).

== Changelog ==

= 0.1.0-alpha =
* Versión inicial: Fase F1 (skeleton de repositorio, app shell, shortcode y toolchain Vite/React/TypeScript).
