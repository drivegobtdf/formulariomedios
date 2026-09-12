# 20 — Baseline de compatibilidad WordPress de producción

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Producto:** PEDIDOS — Secretaría de Medios  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`  
**Repositorio oficial:** `https://github.com/drivegobtdf/formulariomedios`  
**Fecha del relevamiento recibido:** 2026-09-11  
**Estado:** Baseline DOCUMENTADO por informe previo; instalación y compatibilidad no verificadas en esta revisión

## 1. Propósito

Este documento congela la información de compatibilidad obtenida mediante una
auditoría de solo lectura del proyecto WordPress del responsable del sitio.

No sustituye la auditoría funcional de WeWeb. Define el entorno WordPress real
contra el cual deberá ser compatible el plugin `pedidos-medios`.

## 2. Baseline informado por la auditoría previa

| Elemento | Resultado | Estado informado por la fuente anterior |
|---|---|---|
| WordPress | 7.0.2 | VERIFICADO |
| PHP | 8.2.31 | VERIFICADO |
| MySQL/MariaDB | no determinado | NO-VERIFICADO |
| Tema | Betheme 28.5.7 | VERIFICADO |
| Child theme | No | VERIFICADO |
| Elementor | 4.2.3 | VERIFICADO |
| Elementor Pro | 3.33.1 | VERIFICADO |
| Multisite | No | CONFIG-VERIFICADO |
| Instalación de plugin ZIP | Sí | CONFIG-VERIFICADO |
| URL del sitio | `https://www.tierradelfuego.gob.ar` | CONFIG-VERIFICADO |
| Slug objetivo | `/formulariomedios` pendiente de creación | PENDIENTE |
| Editor de página | Elementor / Elementor Pro | CONFIG-VERIFICADO |
| Header/Footer | Elementor Theme Builder + ElementsKit Mega Menu | VERIFICADO |
| Cloudflare/CDN | No | CONFIG-VERIFICADO |
| Seguridad | Wordfence Security | VERIFICADO |
| Caché | WP Super Cache | VERIFICADO |
| CSP | no configurada / permisiva | NO-DISPONIBLE / PERMISIVO |
| HTTPS externo | permitido para Supabase vía frontend | VERIFICADO |
| `upload_max_filesize` | no determinado | NO-VERIFICADO |
| `post_max_size` | no determinado | NO-VERIFICADO |
| Staging | no determinado | NO-VERIFICADO |

## 3. Plugins activos relevados

- Wordfence Security.
- WP Super Cache.
- Elementor.
- Elementor Pro.
- ElementsKit Lite.
- Site Kit by Google.
- WPForms.
- TablePress.

## 4. Consecuencias para `pedidos-medios`

### Elementor
El plugin se integrará mediante app shell/shortcode y no dependerá de widgets
internos de Elementor. La inicialización JavaScript deberá ser idempotente para
evitar duplicación de eventos o instancias durante preview/editor.

### Betheme + Elementor + ElementsKit
Todo CSS deberá quedar dentro de `.pedidos-app`. No usar reglas globales
invasivas sobre `body`, `button`, `input`, `select`, `a`, headings u otros
elementos fuera del namespace.

### WP Super Cache
Los assets deberán versionarse por versión/hash. Las pruebas de aceptación
deberán incluir caché activa.

### Wordfence
No se diseñará ninguna dependencia que requiera desactivar Wordfence. Si una
request válida fuese bloqueada, se documentará la causa y la excepción mínima.

### Supabase
La auditoría confirmó conectividad HTTPS externa. La arquitectura browser →
Supabase sigue siendo válida.

La ausencia actual de CSP restrictiva no debe asumirse permanente. Los dominios
Supabase deberán poder documentarse para una futura CSP.

### Uploads
`upload_max_filesize` y `post_max_size` no bloquean el diseño actual porque los
adjuntos de PEDIDOS se cargarán directamente a Supabase Storage.

## 5. Riesgos de integración

1. Colisión CSS con Betheme, Elementor y ElementsKit.
2. Doble inicialización JavaScript durante preview/render de Elementor.
3. Assets obsoletos por WP Super Cache.
4. Posibles bloqueos de Wordfence ante requests consideradas sospechosas.
5. Staging no verificado antes de producción.

## 6. Estado de OPEN-004

`OPEN-004 — versión mínima WordPress/PHP del hosting institucional`

**Estado:** RESUELTO PARA DESARROLLO.

Baseline:
- WordPress 7.0.2.
- PHP 8.2.31.
- Betheme 28.5.7.
- Elementor 4.2.3.
- Elementor Pro 3.33.1.

Antes del despliegue productivo:
- confirmar ensayo en staging y ventana de instalación/rollback; cualquier sustitución del staging institucional por réplica exige excepción explícita y no elimina el ensayo de migración;
- volver a confirmar versiones si producción cambia durante el desarrollo.

## 7. No bloqueantes

No impiden comenzar:
- MySQL/MariaDB no verificado, porque el dominio PEDIDOS vive en Supabase;
- límites PHP de upload no verificados, porque los adjuntos van a Supabase Storage.

## 8. Criterio de compatibilidad

Un release será compatible cuando:
- funcione en WordPress 7.0.2 / PHP 8.2.31;
- pueda insertarse mediante shortcode/app shell en Elementor;
- no rompa header/footer Betheme/Elementor/ElementsKit;
- no inicialice la app más de una vez;
- funcione con Wordfence activo;
- funcione con WP Super Cache activo;
- pueda comunicarse con Supabase por HTTPS;
- no dependa de MySQL WordPress para PEDIDOS.

## 9. Alcance de la evidencia y mantenimiento
Las etiquetas VERIFICADO/CONFIG-VERIFICADO de la tabla reproducen lo afirmado por el informe recibido; esta revisión no inspeccionó el servidor ni reprodujo sus pruebas. Para esta auditoría su clasificación es DOCUMENTADO. La disponibilidad de esas versiones y licencias en un entorno de pruebas sigue NO VERIFICADO.

La referencia oficial consultada el 2026-09-11 listaba WordPress 7.1 y revisiones 7.0 posteriores a 7.0.2. Eso no demuestra cuál está instalado ni autoriza una actualización. Mantener compatibilidad objetivo ADR-032 y gestionar actualizaciones del sitio como tarea del receptor con prueba de regresión.

Los límites upload_max_filesize/post_max_size no condicionan los adjuntos directos a Storage, pero sí deben contrastarse con el tamaño real del ZIP si se instala desde wp-admin. Comprobar espacio, permisos y mecanismo de reversión.

Fuente de versiones: https://wordpress.org/download/releases/ (consulta 2026-09-11). Mecanismo de integración: https://elementor.com/help/shortcode-widget/ y https://developer.wordpress.org/plugins/shortcodes/. Ninguna de estas páginas certifica la combinación exacta de plugins del receptor.
