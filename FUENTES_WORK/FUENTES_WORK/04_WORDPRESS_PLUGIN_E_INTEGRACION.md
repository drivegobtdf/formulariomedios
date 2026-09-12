# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `10_PLUGIN_WORDPRESS.md`, `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md`


---

# DOCUMENTO: 10_PLUGIN_WORDPRESS.md

# 10 — Arquitectura del plugin WordPress

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Responsabilidad

Integrar la SPA PEDIDOS dentro de WordPress.org. No es backend del dominio ni de Google Drive.

## 2. Estructura

```text
pedidos-medios/
├── pedidos-medios.php
├── src/PHP/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── router/
│       ├── services/
│       ├── auth/
│       ├── validation/
│       └── styles/
├── dist/
└── tests/
```

## 3. App shell

Shortcode:
`[pedidos_medios_app]`

Markup mínimo + mount point.

## 4. Routing

`/formulariomedios/*` al app shell; router JS resuelve vistas. `flush_rewrite_rules()` solo en activación/migración de versión.

## 5. Assets

`wp_enqueue_script/style`; solo rutas PEDIDOS; assets versionados por manifest de build.

## 6. Frontend

Módulos:
- wizard 8 categorías;
- attachments/Drive flow;
- resumen;
- tracking;
- info response;
- auth;
- dashboard;
- board/table;
- order detail;
- users/admin;
- archive;
- common validation.

## 7. Configuración pública

- Supabase URL;
- publishable key;
- environment;
- base path;
- contract version.

No Google OAuth secret.

## 8. Secretos prohibidos en plugin/browser

- Supabase secret/service key;
- DB password;
- JWT signing secrets;
- n8n integration secret;
- Google OAuth client secret;
- Google refresh token;
- access tokens persistentes;
- email credentials.

## 9. Seguridad WordPress

Settings propios: capability, nonce, sanitize/validate, escaping. WordPress nonce no sustituye autorización Supabase.

## 10. CSS

Namespace `.pedidos-app`; reset mínimo; header/footer intactos; probar z-index/modals/foco.

## 11. Usuarios

No crear roles WordPress para PEDIDOS. Supabase Auth + `usuarios_acceso`.

## 12. UX por rol

Frontend recibe claims/datos de perfil autorizados y renderiza:
- Admin;
- Equipo;
- Observador.

Aun así, backend decide.

## 13. Compatibilidad

Baseline documentado:
- WP 7.0.2;
- PHP 8.2.31;
- Betheme 28.5.7;
- Elementor 4.2.3;
- Elementor Pro 3.33.1;
- ElementsKit;
- Wordfence;
- WP Super Cache.

Reconfirmar antes de release.

## 14. Elementor

Montaje idempotente por nodo. Si editor reemplaza mount node, desmontar listeners y montar una sola instancia. Preview no ejecuta submits reales.

## 15. Caché

Contenido autenticado y tokens no deben quedar cacheados públicamente. Assets con hashes/versiones. Pruebas con WP Super Cache real.

## 16. Drive

El plugin no llama Drive con credenciales. Solo usa endpoints/capacidades temporales de backend definidas en `07`/`08`.

## 17. Entrega

ZIP versionado `pedidos-medios-x.y.z.zip`, smoke tests, rollback de plugin y sin tocar DB WordPress.



---

# DOCUMENTO: 20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md

# 20 — Baseline de compatibilidad WordPress de producción

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Propósito

Conservar el baseline del receptor auditado y actualizar sus implicancias para v3.

## 2. Baseline documentado

- WordPress 7.0.2.
- PHP 8.2.31.
- Betheme 28.5.7.
- Elementor 4.2.3.
- Elementor Pro 3.33.1.
- ElementsKit Lite.
- Wordfence Security.
- WP Super Cache.
- No Multisite.
- URL institucional `https://www.tierradelfuego.gob.ar`.
- objetivo `/formulariomedios`.

Es evidencia DOCUMENTADA de revisión previa; debe reconfirmarse antes de release.

## 3. Consecuencias plugin

### Elementor
Montaje idempotente, deep links, preview sin side effects.

### Betheme/ElementsKit
CSS namespaced, overlays/foco/z-index probados.

### WP Super Cache
No cachear contenido autenticado/tokens/respuestas privadas. Assets versionados.

### Wordfence
No pedir desactivación permanente. Ajustar reglas solo con evidencia y mínimo alcance.

### Supabase
HTTPS/CORS y endpoints permitidos.

### Google Drive
El navegador puede necesitar comunicarse con endpoints Google únicamente mediante el flujo temporal aprobado en `OPEN-016`. Las credenciales OAuth jamás forman parte de WordPress. Probar CSP/Wordfence/CORS y fallback.

## 4. Rutas

Probar:
- raíz;
- solicitud-recibida;
- seguimiento;
- información;
- login;
- registro;
- gestión;
- detalle;
- usuarios;
- archivo.

## 5. QA compatibilidad

- mount una vez;
- back/forward;
- trailing slash;
- query/fragment seguro;
- mobile;
- cache release;
- login;
- logout;
- role UI;
- 10MB upload;
- download;
- Wordfence;
- editor Elementor.

## 6. OPEN-004

Cerrado documentalmente para desarrollo; reconfirmación obligatoria para release.

## 7. No bloqueantes de arquitectura

No requiere:
- cambio de theme;
- desactivar plugins;
- guardar PED en MySQL;
- roles WP;
- WP uploads para PEDIDOS.

## 8. Evidencia

No se ha ejecutado QA v3 sobre el receptor como parte de esta revisión.
