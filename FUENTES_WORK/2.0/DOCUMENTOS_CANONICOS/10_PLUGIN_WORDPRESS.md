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
