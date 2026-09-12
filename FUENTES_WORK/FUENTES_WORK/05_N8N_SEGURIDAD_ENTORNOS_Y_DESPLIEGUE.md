# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `09_EVENTOS_QUEUES_N8N.md`, `12_SEGURIDAD.md`, `13_ENTORNOS_SECRETOS_DESPLIEGUE.md`


---

# DOCUMENTO: 09_EVENTOS_QUEUES_N8N.md

# 09 — Eventos, Supabase Queues y n8n

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Objetivo

Separar transacciones de negocio de comunicaciones.

```text
operación
→ domain_event
→ Queue
→ n8n
→ proveedor
→ resultado
```

## 2. Queue

Queue durable. Nombre sugerido: `pedidos_events`.

## 3. Eventos

- `submission.created`
- `pedido.assigned`
- `pedido.state_changed`
- `pedido.info_requested`
- `pedido.info_responded`
- `pedido.finalized`
- `pedido.cancelled`
- `pedido.archived`
- `pedido.restored`
- `tracking.recovery_requested`
- `access.requested`

No todos implican email al solicitante.

## 4. Correo inicial agrupado

`submission.created` representa el envío completo.

Payload mínimo:
- event_id;
- envio_id;
- occurred_at;
- schema_version;
- lista de pedido_id;
- no incluir tokens raw ni cuerpo completo.

El consumidor autorizado obtiene el snapshot mínimo y genera **un único correo** con:
- tipo/categoría de cada PED;
- `pedido_visible`;
- link seguro individual de seguimiento.

## 5. Cambios posteriores

Cada PED se notifica por separado.

Ejemplo:
- Flyer cambia a En proceso → email solo Flyer/PED.
- Invitación sin cambio → ningún email.

## 6. Solicitante: eventos notificables

- creación agrupada;
- cambio de estado cuando corresponda plantilla;
- información solicitada;
- confirmación de respuesta;
- finalización;
- cancelación;
- recuperación de seguimiento.

Evitar duplicar correos cuando una acción ya está cubierta por una plantilla más específica.

## 7. Internos

Notificaciones útiles:
- nuevo envío/PED;
- sin responsable después del umbral;
- respuesta del solicitante;
- nueva solicitud de acceso;
- fallo de comunicación no recuperable.

El destinatario interno concreto y preferencias personales se configuran/versionan; no spamear a todo el equipo.

## 8. Entregas y ledger

`comunicaciones_pedido` registra delivery independiente de event.

Estados:
`pending`, `processing`, `sent`, `retry_wait`, `uncertain`, `failed`, `cancelled`.

`sent` significa proveedor aceptó; no necesariamente entrega/leído.

## 9. Consumo n8n

1. polling autorizado;
2. claim atómico;
3. contenido mínimo;
4. envío con provider idempotency cuando exista;
5. result;
6. commit ledger + ack;
7. retry/reconciliación acotados.

## 10. Seguridad

n8n no recibe:
- service role general;
- DB password;
- OAuth refresh token de Google;
- acceso arbitrario a Drive;
- tokens públicos sin necesidad.

La credencial de integración es dedicada y rotatable.

## 11. Fallos

| Escenario | Resultado |
|---|---|
| n8n caído | PED confirmado permanece |
| proveedor no disponible | retry acotado |
| aceptación incierta | reconciliar/uncertain |
| ACK perdido | ledger evita reenvío ciego |
| schema desconocido | estacionar + alerta |
| Drive caído | afecta operación de archivo, no autoriza perder cambio PED ya confirmado |

## 12. Datos de ejecución

No persistir cuerpos sensibles, tokens, OAuth secrets ni archivos binarios en executions/pinned data. Configurar purga.

## 13. Templates

Versionar por:
- tipo de evento;
- destinatario;
- schema;
- campos mínimos.

El correo inicial usa plantilla propia de agrupación por `envio_id`.

## 14. Decisiones abiertas

`OPEN-009`: proveedor real, horizonte de idempotencia y reconciliación.  
Preferencias por usuario pueden incorporarse sin alterar el contrato de eventos.



---

# DOCUMENTO: 12_SEGURIDAD.md

# 12 — Seguridad

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Activos

- PII solicitantes;
- PED y estados;
- notas internas;
- archivos/material;
- tokens tracking/info;
- usuarios/roles;
- OAuth Google;
- secrets n8n/email;
- auditoría.

## 2. Fronteras

- browser público ↔ Supabase Edge;
- browser interno ↔ Supabase Auth/API;
- Edge ↔ Google OAuth/Drive;
- Supabase Queue ↔ n8n;
- n8n ↔ proveedor email.

## 3. Amenazas

### IDOR / enumeración
PED visible no autoriza. Token seguro + DTO mínimo.

### Escalada de roles
RLS/RPC verifica `estado_acceso` + `app_role`. Observador deny write.

### Revocación tardía
Verificar perfil aprobado en operaciones, no confiar solo en JWT existente.

### XSS
Escaping, no render HTML no confiable, CSP cuando sea compatible, nombres de archivo tratados como texto.

### CSRF
Auth bearer + CORS; WordPress nonces solo para acciones WP.

### SQL injection
SQL parametrizado/RPC y validación.

### Upload
Reservas, size, MIME/extensión, count, metadata verificada, no confiar en client. ZIP no se ejecuta.

### SSRF
Links externos no se descargan server-side automáticamente.

### Secret leakage
Nunca OAuth refresh token, client secret, service key, DB password o n8n secret en frontend/logs/repositorio.

### Google Drive
No compartir carpetas `anyone`; scope mínimo; access tokens cortos; refresh token server-side; file ID no es autorización PEDIDOS.

## 4. OAuth Google

Flujo servidor OAuth 2.0 con offline access. Guardar refresh token en secret manager del entorno (Supabase Secrets u otro equivalente aprobado). No en tablas de negocio.

## 5. RLS

Deny-by-default. Policies positivas por rol y estado. Funciones helper auditadas; evitar recursion/performance accidental.

## 6. SECURITY DEFINER

Solo cuando sea necesario:
- `search_path` fijado;
- owner controlado;
- revoke execute public;
- grants explícitos;
- no aceptar IDs sin autorización contextual.

## 7. CORS

Allowlist del WordPress receptor/staging/local. No reflejar Origin arbitrario.

## 8. Auditoría

Append-only lógico para:
- asignación;
- estado;
- notas públicas/internas relevantes;
- info;
- entrega;
- cancelación;
- reapertura;
- archivo;
- usuarios/roles;
- cambios de username.

No registrar secretos/token raw.

## 9. Privacidad

Seguimiento público mínimo. Observador es interno y puede leer pedidos según rol, pero no acceso administrativo ni secretos. Política de retención pendiente `OPEN-003`.

## 10. Archivos

Drive queda privado. Descarga vía autorización PEDIDOS. Verificar Content-Disposition, MIME, filename y caché.

## 11. Antiabuso

Endpoints públicos con rate limiting/cooldown configurable. Valores exactos `OPEN-012`.

## 12. Supply chain

Lockfiles, dependabot/renovate si se adopta, revisión de paquetes, no CDN runtime para supabase-js.

## 13. WordPress

- no desactivar Wordfence/caché como solución permanente;
- no almacenar secretos en JS;
- no cachear respuestas privadas;
- settings con capability+nonce.

## 14. Checklist preproducción

- RLS allow/deny;
- observer deny write;
- Drive no público;
- OAuth secrets ausentes del bundle;
- CORS;
- tracking anti-enumeración;
- upload 10x10MB;
- idempotencia;
- concurrencia;
- revocación;
- n8n retries;
- backup/restore;
- logs sanitizados;
- staging receptor.

## 15. Fuentes oficiales verificadas

- Google OAuth web server: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Drive upload: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Supabase Edge security: https://supabase.com/docs/guides/functions/auth



---

# DOCUMENTO: 13_ENTORNOS_SECRETOS_DESPLIEGUE.md

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
