# PEDIDOS — Plugin WordPress e integración

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `10_PLUGIN_WORDPRESS.md`
- `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md`

---

# DOCUMENTO: 10_PLUGIN_WORDPRESS.md

# 10 — Arquitectura del plugin WordPress

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


**Plugin:** `pedidos-medios`
**Repositorio de implementación:** `https://github.com/drivegobtdf/formulariomedios`

## 1. Responsabilidad
El plugin integra la interfaz PEDIDOS dentro de WordPress.org. No es el backend del dominio.

## 2. Estructura propuesta

```text
pedidos-medios/
├── pedidos-medios.php
├── readme.txt
├── src/PHP/
│   ├── Plugin.php
│   ├── Assets.php
│   ├── AppShell.php
│   ├── Routes.php
│   └── Config.php
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts
│       ├── components/
│       ├── pages/
│       ├── router/
│       ├── services/
│       ├── auth/
│       ├── validation/
│       └── styles/
├── dist/
│   ├── app.js
│   └── app.css
└── tests/
```

PHP debe mantenerse pequeño; no es necesario introducir un framework.

## 3. App shell
Crear página WordPress `formulariomedios` con shortcode:

```text
[pedidos_medios_app]
```

El callback del shortcode solo devuelve el mount point y markup mínimo.

## 4. Routing
Registrar rewrite rules para que `/formulariomedios/*` llegue al mismo app shell. El router JS resuelve la vista.

`flush_rewrite_rules()` solo en activación/migración de versión, nunca en cada request.

## 5. Assets
Usar `wp_enqueue_script()` y `wp_enqueue_style()` en `wp_enqueue_scripts`. Cargar assets solo en la página/rutas PEDIDOS.

## 6. Frontend
TypeScript + Vite. `supabase-js` empaquetado localmente, sin depender de CDN.

Módulos:
- form;
- tracking;
- information response;
- auth;
- management;
- order detail;
- admin users;
- common UI;
- validation;
- API client.

## 7. Configuración pública
El bundle necesita:
- Supabase URL;
- publishable key;
- environment;
- base path.

Puede inyectarse desde constantes/filtros WordPress. La publishable key es pública por diseño; su seguridad depende de RLS/grants.

## 8. Secretos
El plugin NO contiene:
- Supabase secret key;
- DB password;
- JWT signing secret;
- n8n secret;
- email credentials.

## 9. Seguridad WordPress
Para settings propios:
- `current_user_can()`;
- nonce;
- validar/sanitizar;
- escapar output.

Los nonces WordPress no reemplazan la autorización Supabase.

## 10. CSS
- namespace `.pedidos-app`;
- variables CSS propias;
- reset mínimo;
- sin selectores globales invasivos;
- respetar header/footer/theme.

## 11. Usuarios
No crear roles `gestor_pedidos` en WordPress. `wp_users` y Supabase Auth son dominios distintos.

## 12. Compatibilidad
Baseline de compatibilidad aprobado por ADR-032: WordPress 7.0.2 / PHP 8.2.31 con el stack receptor documentado. OPEN-004 está resuelto documentalmente para desarrollo. Una versión estable más reciente no sustituye automáticamente ese contrato. La matriz de release debe identificar versiones realmente probadas y reconfirmar el receptor antes de instalar.

TypeScript + Vite están definidos. La elección de framework UI y versiones de herramientas se registra antes del skeleton como decisión técnica reproducible; no se presupone React ni otro framework.

## 13. Entrega
ZIP versionado:
`pedidos-medios-x.y.z.zip`.

Instalación:
1. backup;
2. instalar;
3. configurar URL/publishable key;
4. crear/usar página;
5. insertar shortcode;
6. verificar permalinks;
7. smoke tests;
8. no reemplazar DB WordPress.


## Repositorios y procedencia

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`

**Repositorio fuente de la auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Branch de auditoría:** `audit/current-weweb-2026-09-10`  
**Commit QA de referencia:** `0efb624`

El repositorio oficial del desarrollo es el único destino previsto para el código nuevo, documentación de implementación, plugin WordPress, migraciones Supabase, pruebas y workflows versionados. El repositorio de auditoría se conserva como evidencia del sistema WeWeb original y no debe confundirse con el repositorio de implementación.

## Documentación técnica oficial

- WordPress Developer Resources: `https://developer.wordpress.org/`
- Supabase Docs: `https://supabase.com/docs/`

La documentación histórica anterior a la auditoría se utiliza solo como referencia cuando no contradice la evidencia current-state.

## 14. Baseline real del sitio receptor

Compatibilidad objetivo:
- WordPress 7.0.2;
- PHP 8.2.31;
- Betheme 28.5.7;
- Elementor 4.2.3;
- Elementor Pro 3.33.1;
- ElementsKit Lite;
- Wordfence Security;
- WP Super Cache.

El plugin deberá:
1. insertarse mediante shortcode/app shell;
2. montar la app una única vez;
3. tolerar renders repetidos de Elementor;
4. versionar CSS/JS;
5. no depender de APIs privadas de Elementor;
6. no requerir desactivar Wordfence o caché;
7. aislar CSS bajo `.pedidos-app`.

## 15. Montaje, routing y assets verificables
Resolver rutas conocidas dentro de /formulariomedios sin interceptar el resto de WordPress. Probar recarga directa, barras finales, query strings permitidas, deep links, atrás/adelante, URL desconocida y redirección canónica. Un token no debe perderse en redirecciones ni terminar en query strings.

El guard de montaje es por nodo; si Elementor reemplaza el nodo, desmontar recursos anteriores y montar el nuevo una vez. El editor no debe iniciar envíos de prueba reales por render. No cargar assets exclusivamente por buscar un shortcode en post_content: Elementor puede almacenarlo fuera de ese campo. Resolver por página/ruta objetivo y comportamiento del shortcode.

Usar el manifiesto de build para chunks y CSS versionados, cargados con el tipo de script correcto. Probar bajo caché/minificación reales del receptor. Namespacing limita los estilos propios, pero las reglas externas aún pueden afectar el interior: comprobar ambos sentidos, modales, overlays, tipografía, foco y z-index.

## 16. Configuración y ciclo de vida
La configuración pública contiene URL, publishable key, entorno, base path y versión de contrato; nunca claves elevadas. Si se implementa pantalla de ajustes: capability + nonce + validación + escaping. Definir fallo visible sin exponer secretos cuando falta configuración o el backend es incompatible.

Activación/desactivación no borra PEDIDOS, usuarios, Storage ni datos históricos. Desinstalación solo puede retirar ajustes propios según política explícita; no ejecuta borrados remotos. Rewrites se refrescan únicamente en eventos de ciclo de vida pertinentes.

El ZIP debe contener assets compilados y poder instalarse sin Node, npm ni Supabase CLI en el servidor receptor. Probar instalación limpia, actualización y retorno al ZIP previo contra una versión compatible del backend. Añadir cabeceras de compatibilidad y versionado del plugin; no incluir source maps sensibles, tests, node_modules o credenciales.

## 17. Sesión y seguridad compartida
La separación Supabase/WordPress no aísla el JavaScript ejecutado dentro de la misma página. Revisar scripts de terceros/analítica y XSS del contexto anfitrión, persistencia de sesión, CSP compatible y exposición de fragmentos. Wordfence no protege solicitudes que viajan directamente del navegador a Supabase; esas fronteras requieren controles propios. No presentar CORS como autenticación.

El shell puede ser cacheable si solo contiene markup y configuración pública. Las respuestas con PED, PII o credenciales no deben persistirse en cachés compartidas; usar políticas de no almacenamiento en endpoints sensibles. Registrar comportamiento de rutas autenticadas y Auth callbacks en QA.

# FIN DOCUMENTO: 10_PLUGIN_WORDPRESS.md


---

# DOCUMENTO: 20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md

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

# FIN DOCUMENTO: 20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md
