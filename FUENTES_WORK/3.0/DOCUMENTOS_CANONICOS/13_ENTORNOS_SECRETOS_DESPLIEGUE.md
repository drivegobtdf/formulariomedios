# 13 — Entornos, secretos y despliegue

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Entornos

- local;
- staging;
- producción.

Separar Supabase projects/config, OAuth redirect URIs, Drive root folders/adapters, n8n credentials y frontend environment.

## 2. Local

- WordPress.org local;
- Supabase CLI/Docker;
- mock/fake Drive provider para pruebas repetibles;
- n8n Community Edition;
- mail mock.

No exigir cuenta Google real para unit/integration local salvo test de contrato.

## 3. Staging

Debe validar:
- WordPress receptor o réplica aceptada;
- Google OAuth/Drive real con carpeta staging;
- CORS;
- upload/download;
- n8n con proveedor mock/sandbox;
- migración/cutover.

## 4. Producción

- Supabase prod;
- OAuth client prod o redirect URIs estrictos;
- carpeta Drive prod;
- n8n credentials prod;
- plugin release firmado/versionado según proceso.

## 5. Estructura repo

```text
wordpress-plugin/
supabase/
  migrations/
  functions/
  tests/
frontend/
n8n/workflows/
docs/
scripts/
```

## 6. Frontend config

Solo:
- Supabase URL;
- publishable key;
- environment;
- base path;
- contract version.

## 7. Secretos

Server-side:
- Supabase secret/service key cuando sea imprescindible;
- DB password;
- Google OAuth client secret;
- Google refresh token;
- n8n integration secret;
- email provider secrets;
- encryption keys.

Nunca Git.

## 8. Google bootstrap

Procedimiento versionado:
1. Google Cloud project;
2. Drive API enabled;
3. OAuth consent/config;
4. web-server client;
5. scope mínimo;
6. autorizar cuenta Drive con offline access;
7. crear/registrar root folder de la app;
8. guardar refresh token en secret store;
9. validar upload/list/download/delete controlados;
10. documentar revocación/rotación.

## 9. Desarrollo sin costo obligatorio

Puede desarrollarse con software gratuito/local y la capacidad Drive ya disponible. No implica garantía de costo cero perpetuo en producción.

## 10. Migrations

- versionadas;
- forward-only normal;
- backups antes de destructivas;
- rollback probado para release;
- no editar schema manual prod sin migration.

## 11. Release plugin

- build reproducible;
- lockfile;
- manifest Vite;
- ZIP;
- smoke test;
- compatibility matrix;
- checksum del artefacto.

## 12. Backups

Supabase y Drive requieren estrategia coordinada. RAID/Drive no sustituye backup lógico de DB ni versionado de documentación. `OPEN-003/011` define RPO/RTO y retención.

## 13. Compatibilidad

Baseline receptor se conserva, pero staging obligatorio antes del cutover.

## 14. Operación

Runbooks:
- OAuth refresh token revocado;
- cuota Drive;
- Drive API outage;
- n8n outage;
- email provider outage;
- Supabase restore;
- rollback plugin;
- usuario admin bloqueado.

## 15. Fuentes

- Google OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- Drive API: https://developers.google.com/workspace/drive/api/guides/about-sdk
- Supabase Edge limits: https://supabase.com/docs/guides/functions/limits
