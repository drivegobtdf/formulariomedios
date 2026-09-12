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
