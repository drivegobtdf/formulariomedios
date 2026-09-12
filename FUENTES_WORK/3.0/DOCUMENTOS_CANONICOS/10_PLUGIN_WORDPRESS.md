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
