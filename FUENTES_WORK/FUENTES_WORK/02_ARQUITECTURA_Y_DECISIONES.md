# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `01_ARQUITECTURA_OFICIAL.md`, `11_API_Y_CONTRATOS.md`, `17_DECISIONES_ARQUITECTURA_ADR.md`


---

# DOCUMENTO: 01_ARQUITECTURA_OFICIAL.md

# 01 — Arquitectura oficial

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Decisión

Arquitectura objetivo:

```text
                   WORDPRESS.ORG
              /formulariomedios/*
                        │
                 plugin frontend
                        │
                        ▼
                 SUPABASE EDGE/API
                  │      │       │
                  │      │       └── Supabase Auth
                  │      └────────── PostgreSQL / RLS / RPC
                  │
                  ├── OAuth 2.0 server-side
                  ▼
               GOOGLE DRIVE
             archivos físicos
                  │
                  └── metadata/IDs vuelven a Supabase

Supabase → eventos/Queue → n8n → email/integraciones
```

**Supabase sigue siendo fuente de verdad del negocio. Google Drive es proveedor de objetos, no base de datos ni sistema de permisos de PEDIDOS.**

## 2. Invariante v3

```text
1 envío = 1..N PED
1 PED = 1 pieza/servicio
```

La relación entre PED hermanos se conserva en `envios_formulario`.

## 3. WordPress

Responsabilidades:
- URL, navegación, integración institucional y theme;
- app shell y assets;
- frontend del formulario, seguimiento, Auth y gestión.

No:
- genera PED;
- almacena dominio PEDIDOS;
- decide permisos;
- guarda secretos de Drive/Supabase;
- actúa como backend de archivos.

## 4. Plugin `pedidos-medios`

TypeScript + Vite; PHP reducido para shell, assets, routing y configuración pública. `supabase-js` local en bundle. Config pública: Supabase URL, publishable key, environment, base path y contract version.

## 5. Supabase PostgreSQL

Fuente de verdad para:
- envíos;
- PED;
- secuencia global anual;
- catálogos;
- estados;
- responsables y asignaciones;
- usuarios de acceso;
- solicitudes de información;
- metadata/asociación de archivos;
- links externos;
- entregas;
- notas;
- eventos, comunicaciones y auditoría;
- idempotencia/concurrencia.

## 6. Supabase Auth

Identifica usuarios internos. `authenticated` es rol técnico; `administrador`, `equipo`, `observador` son roles de aplicación.

## 7. Google Drive

Almacena binarios bajo una carpeta dedicada controlada por la aplicación.

Principios:
- el ciudadano no ve Drive;
- no se publican carpetas `anyone`;
- OAuth y refresh token viven server-side;
- metadata autoritativa vive en Supabase;
- Drive `file_id` es referencia física;
- no usar n8n como proxy de upload.

La cuenta de Drive actual puede ser personal con capacidad disponible; esto es una decisión operativa válida para el desarrollo actual, pero la propiedad institucional/transferencia futura queda cubierta por `OPEN-003/OPEN-016`.

## 8. Upload seguro

Flujo preferido sujeto a spike `OPEN-016`:

```text
Browser
  ↓ upload-prepare
Edge Function
  ├─ valida sesión, tamaño, cantidad, MIME, contexto
  ├─ reserva metadata en PostgreSQL
  ├─ obtiene OAuth access token server-side
  └─ inicia resumable upload de Drive
         ↓
   URI temporal de sesión
         ↓
Browser envía binario a Google
         ↓
upload-complete
         ├─ verifica file_id/metadata
         └─ confirma asociaciones a PED
```

Google documenta resumable uploads como mecanismo recomendado para archivos >5 MB y útil también para pequeños; la sesión de Google no sustituye nuestros TTL/capacidades.

Si la prueba de navegador demuestra que el PUT directo no es viable por CORS/política, se implementará un relay server-side controlado, nunca n8n en la ruta crítica.

## 9. Download seguro

Drive no debe exponerse mediante enlaces públicos permanentes. Un endpoint controlado valida:
- token público o JWT interno;
- rol/estado;
- relación archivo↔PED;
- contexto autorizado.

Luego obtiene/streaming del binario mediante Drive API o entrega un mecanismo temporal equivalente aprobado en `OPEN-016`.

## 10. RPC y Edge

**RPC:** secuencia, creación transaccional, asignaciones, estados, archivo, auditoría.  
**Edge:** fronteras públicas, seguimiento, recuperación, Drive OAuth/upload/download, CORS, antiabuso, Queue/n8n.

## 11. n8n

```text
commit negocio
→ evento durable
→ Queue
→ n8n
→ proveedor email/integración
→ resultado
```

n8n no genera PED, no autoriza usuarios y no recibe uploads públicos como componente obligatorio.

## 12. Flujo de creación

```text
Browser
  ├─ prepara envío
  ├─ prepara/sube archivos
  └─ create-submission
          ↓
      RPC transaccional
          ├─ valida idempotencia
          ├─ crea envios_formulario
          ├─ reserva N números globales
          ├─ crea N pedidos
          ├─ asocia archivos/links
          ├─ crea tokens tracking
          ├─ audit
          └─ evento submission.created
                    ↓
                  Queue → n8n → 1 email inicial
```

## 13. Seguimiento

Cada PED tiene token independiente y DTO público independiente. La pertenencia a un mismo envío no autoriza a consultar automáticamente PED hermanos.

## 14. Rutas objetivo

- `/formulariomedios/`
- `/formulariomedios/solicitud-recibida`
- `/formulariomedios/seguimiento`
- `/formulariomedios/solicitud-informacion`
- `/formulariomedios/login`
- `/formulariomedios/solicitar-acceso`
- `/formulariomedios/gestion`
- `/formulariomedios/pedido/:id`
- `/formulariomedios/usuarios`
- `/formulariomedios/archivo`

## 15. Dependencias evitadas

- `wp_pedidos_*`;
- Auth doble;
- Supabase Storage para binarios v3;
- WordPress uploads para material PEDIDOS;
- n8n en ruta crítica;
- Drive como fuente de permisos;
- enlaces Drive públicos permanentes;
- Realtime obligatorio.

## 16. Desarrollo

- Supabase CLI/Docker local.
- Mock/fake Drive adapter en tests locales.
- Google Drive real en staging controlado.
- migrations, Edge Functions, plugin y workflows versionados.
- credenciales fuera de Git.

## 17. Compatibilidad receptor

Se conserva el baseline documentado de revisión 2.0:
WordPress 7.0.2, PHP 8.2.31, Betheme 28.5.7, Elementor 4.2.3, Elementor Pro 3.33.1, ElementsKit Lite, Wordfence y WP Super Cache. Debe reconfirmarse antes de release.

## 18. Cambio arquitectónico

`PEDIDOS-WSN-GD-v2` sustituye documentalmente `PEDIDOS-WSN-SC-v1` porque:
- cambia el agregado principal;
- se elimina `servicios_solicitados` como unidad operativa de nuevos PED;
- Google Drive reemplaza Supabase Storage para binarios;
- se amplía RBAC y catálogo de servicios.

No existe implementación verificada de esta arquitectura al emitir la revisión.



---

# DOCUMENTO: 11_API_Y_CONTRATOS.md

# 11 — API y contratos

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Principio

Contrato versionado. Entradas públicas mínimas, idempotentes y validadas. Mutaciones internas controladas.

## 2. Preparar envío

`POST /functions/v1/submission-prepare`

Respuesta:
- capability/session ref;
- contract version;
- límites relevantes;
- expiración.

## 3. Preparar upload

`POST /functions/v1/drive-upload-prepare`

Entrada:
- capability;
- client_file_ref;
- name;
- MIME;
- size;
- context.

Respuesta:
- reservation_id;
- estrategia de upload;
- URI/capacidad temporal si procede;
- expires_at.

Nunca OAuth token.

## 4. Completar upload

`POST /functions/v1/drive-upload-complete`

Entrada:
- reservation_id;
- provider result/file id requerido por contrato.

Verifica server-side.

## 5. Crear envío/PED

`POST /functions/v1/submission-create`

```json
{
  "schema_version": 3,
  "submission_key": "uuid",
  "contacto": {
    "nombre_apellido": "...",
    "telefono": "...",
    "correo": "...",
    "area_solicitante": "..."
  },
  "pedidos": [
    {
      "client_request_ref": "uuid",
      "categoria_slug": "diseno_grafico",
      "tipo_slug": "flyer_rrss",
      "informacion_especifica": {}
    }
  ],
  "file_bindings": [
    {
      "reservation_id": "uuid",
      "targets": ["uuid-client-request-ref"]
    }
  ],
  "material_links": []
}
```

`targets="all"` puede normalizarse a la lista concreta de refs antes del fingerprint.

Respuesta 201/200 idempotente:

```json
{
  "envio_id": "uuid",
  "pedidos": [
    {
      "id": "uuid",
      "pedido_visible": "PED-2026-D000101",
      "tipo": "Flyer",
      "tracking": { "..." : "capacidad segura" }
    }
  ]
}
```

## 6. Numeración

Servidor deriva código de categoría. Cliente no envía número final confiable.

## 7. Tracking

`POST /functions/v1/tracking-get`

Entrada PED + token/capacidad. DTO sin internos.

## 8. Información faltante

- validate token;
- submit response;
- aceptar texto, reservas de archivo y links;
- idempotencia.

## 9. Gestión interna

RPC/API por ID técnico de PED, nunca por confiar solo en texto visible.

### Assign
`pedido_id`, `responsable_user_id`, `expected_version`.

### State
`pedido_id`, `target_state`, `expected_version`.

### Finalize
`pedido_id`, entrega file IDs y/o URL, nota, version.

### Cancel
motivo obligatorio.

### Reopen
motivo obligatorio.

### Archive/restore
solo terminales.

## 10. Usuarios

Admin:
- approve;
- reject;
- invite;
- role change;
- username change;
- revoke.

## 11. Errores

Usar códigos HTTP coherentes y `error_code` estable:
- `VALIDATION_ERROR`
- `IDEMPOTENCY_CONFLICT`
- `VERSION_CONFLICT`
- `ASSIGNEE_REQUIRED`
- `INVALID_TRANSITION`
- `DELIVERY_REQUIRED`
- `CANCEL_REASON_REQUIRED`
- `FILE_LIMIT_EXCEEDED`
- `FILE_TOO_LARGE`
- `FILE_NOT_VERIFIED`
- `ACCESS_NOT_APPROVED`
- `ROLE_FORBIDDEN`
- `TOKEN_INVALID_OR_EXPIRED`
- `EXTERNAL_PROVIDER_UNAVAILABLE`

## 12. Canonicalización

Fingerprint incluye:
- contacto normalizado;
- pedidos ordenados por `client_request_ref`;
- schemas/versiones;
- bindings de archivo/link;
- excluye tokens/capacidades temporales.

## 13. Versionado

`schema_version` obligatorio en requests/eventos. Backend rechaza versiones desconocidas en vez de interpretarlas aproximadamente.

## 14. URLs externas

Solo HTTPS salvo entorno local explícito. No fetch automático para validación de material externo.

## 15. Referencias

Drive upload:
https://developers.google.com/workspace/drive/api/guides/manage-uploads



---

# DOCUMENTO: 17_DECISIONES_ARQUITECTURA_ADR.md

# 17 — ADR · Decisiones de arquitectura

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Registro consolidado

| ADR | Decisión | Estado v3 |
|---|---|---|
| ADR-001 | Supabase es fuente de verdad de negocio | Aceptada |
| ADR-002 | WordPress es host de UI | Aceptada |
| ADR-003 | n8n es asíncrono, fuera del commit | Aceptada |
| ADR-004 | 1 envío = 1 PED = N servicios | **SUPERADA por ADR-037** |
| ADR-005 | No crear entidad solicitudes adicional | **SUPERADA parcialmente por ADR-037**; se crea `envios_formulario` técnica/de agrupación, no PED alternativo |
| ADR-006 | Estado general separado de servicio | **SUPERADA por ADR-038** |
| ADR-007 | Pedir información no cambia estado automáticamente | Aceptada |
| ADR-008 | PED se genera en PostgreSQL | Aceptada |
| ADR-009 | Idempotencia por submission_key | Aceptada/ampliada |
| ADR-010 | Supabase Auth interno | Aceptada |
| ADR-011 | usuarios_acceso contiene aprobación/rol | Aceptada/ampliada |
| ADR-012 | No wp_users para autorización | Aceptada |
| ADR-013 | Grants mínimos + RLS | Aceptada |
| ADR-014 | Escrituras críticas por RPC | Aceptada |
| ADR-015 | Edge para fronteras necesarias | Aceptada/ampliada |
| ADR-016 | Publishable/secret keys modernas | Aceptada |
| ADR-017 | Supabase Storage privado | **SUPERADA por ADR-042** |
| ADR-018 | Signed upload Supabase | **SUPERADA por ADR-042/043** |
| ADR-019 | Supabase Queues durable | Aceptada |
| ADR-020 | evento/entrega/ledger/reconciliación | Aceptada |
| ADR-021 | comunicaciones Queue+n8n | Aceptada |
| ADR-022 | Kanban + tabla, sin drag/drop MVP | Aceptada/ampliada |
| ADR-023 | nombre/apellido/username | Aceptada/ampliada |
| ADR-024 | Notion | OPEN-002 |
| ADR-025 | Realtime | Diferida |
| ADR-026 | desarrollo sin pago obligatorio | Aceptada |
| ADR-027 | QA como baseline verificable | Aceptada |
| ADR-028 | hash + sobre cifrado temporal cuando sea necesario | Aceptada |
| ADR-029 | base URL /formulariomedios | Aceptada |
| ADR-030 | agregación estado general | **Ya no aplica por ADR-038** |
| ADR-031 | repositorio oficial | Aceptada |
| ADR-032 | baseline WordPress receptor | Aceptada |
| ADR-033 | reservas de upload | Aceptada, adaptada a Drive |
| ADR-034 | idempotencia/concurrencia mutaciones | Aceptada |
| ADR-035 | exposición mínima | Aceptada |
| ADR-036 | operación/recuperación verificables | Aceptada |
| ADR-037 | 1 envío = N PED; cada pieza = 1 PED | **Aceptada 2026-09-11** |
| ADR-038 | PED es unidad operativa y tiene un único estado | **Aceptada** |
| ADR-039 | seis estados y asignación como atributo, no estado | **Aceptada** |
| ADR-040 | secuencia global anual + código de categoría | **Aceptada** |
| ADR-041 | RBAC Admin/Equipo/Observador | **Aceptada** |
| ADR-042 | Google Drive almacena binarios | **Aceptada** |
| ADR-043 | Supabase autoriza/metadata; OAuth Drive solo server-side | **Aceptada** |
| ADR-044 | 10 archivos x 10 MB + link opcional | **Aceptada** |
| ADR-045 | archivos generales o específicos por PED, N:M | **Aceptada** |
| ADR-046 | email inicial agrupado; cambios posteriores por PED | **Aceptada** |
| ADR-047 | archivado reversible separado del estado | **Aceptada** |
| ADR-048 | Dashboard + Board/Table + atención | **Aceptada** |
| ADR-049 | finalización con entrega versionada | **Aceptada** |
| ADR-050 | cancelación/reapertura auditada | **Aceptada** |

## 2. ADR-037 — agregado funcional v3

**Decisión:** un envío puede crear N PED y cada pieza/servicio recibe su PED.  
**Motivo:** el área necesita ciclos de estado, responsable y notificación independientes.  
**Consecuencia:** `servicios_solicitados` deja de ser unidad operativa nueva; `envios_formulario` agrupa idempotencia/correo/material común.

## 3. ADR-038/039 — estado

Cada PED posee:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información;
- Finalizado;
- Cancelado.

No existe `estado_general`. `Asignado` no es estado. `Correcciones` se retira. En revisión requiere responsable.

## 4. ADR-040 — numeración

`PED-YYYY-CNNNNNN`, con C de categoría y NNNNNN de secuencia global anual.

## 5. ADR-041 — roles

- Administrador;
- Equipo;
- Observador.

Observador solo lectura. Backend y UI aplican la separación.

## 6. ADR-042/043 — Google Drive

Drive reemplaza Supabase Storage para binarios. Supabase continúa como autoridad. OAuth server-side, scope mínimo, ninguna credencial al navegador.

La cuenta actualmente disponible puede ser cuenta Google personal con almacenamiento suficiente; no se exige Workspace para la arquitectura actual.

## 7. ADR-044/045 — material

10 archivos, 10 MB cada uno. Material mayor por link opcional. Con varios PED, cada archivo/link puede ser general o específico. Binario general no se duplica necesariamente.

## 8. ADR-046 — emails

Creación:
`1 envío → 1 email con N PED`.

Después:
`1 evento de PED → email de ese PED`, si el evento es notificable.

## 9. ADR-047 — Archivo

`archivado_at`/metadata de archivo no son estado. Terminales pueden archivarse/restaurarse sin borrar.

## 10. ADR-048 — gestión

Tablero + tabla, Mis pedidos, Sin asignar, Requieren atención, vistas terminales y Archivo. Sin drag/drop MVP.

## 11. ADR-049 — entrega

Finalizar exige archivo/link. Entrega posterior se versiona.

## 12. ADR-050 — cancelación/reapertura

Cancelar requiere motivo. Finalizado no se cancela directamente. Cancelado puede reabrirse con motivo:
- Nuevo sin responsable;
- En revisión con responsable.

## 13. Decisiones abiertas

| ID | Estado v3 | Pendiente |
|---|---|---|
| OPEN-001 | **CERRADO por ADR-038/039/050** | — |
| OPEN-002 | ABIERTO | Notion |
| OPEN-003 | ABIERTO | retención, borrado, backups, custodio |
| OPEN-004 | CERRADO documental | baseline WP; reconfirmar release |
| OPEN-005 | **CERRADO en lo principal** | campos/adjuntos/entrega definidos; MIME audiovisual queda OPEN-014 |
| OPEN-006 | **CERRADO en lo principal** | Auth/roles/rechazo/username definidos; último Admin → OPEN-015 |
| OPEN-007 | **CERRADO funcionalmente** | proveedor/preferencias finas quedan OPEN-009/011 |
| OPEN-008 | ABIERTO | staging receptor |
| OPEN-009 | ABIERTO | proveedor email/idempotencia |
| OPEN-010 | ABIERTO | framework UI/versiones |
| OPEN-011 | ABIERTO | volumen/SLO/RPO/RTO/umbrales restantes |
| OPEN-012 | ABIERTO | TTL/cooldown/antiabuso |
| OPEN-013 | ABIERTO | migración de históricos multiservicio |
| OPEN-014 | ABIERTO | MIME/extensiones audiovisuales adicionales |
| OPEN-015 | ABIERTO | último Admin/recuperación |
| OPEN-016 | ABIERTO | spike final upload/download Google Drive |

## 14. Propuestas no adoptadas

No se consideran aprobados:
- Google Workspace;
- storage público;
- Notion;
- Realtime;
- nuevos estados;
- drag & drop;
- borrado automático;
- MIME de video adicional;
- proveedor email;
- SLA;
- migración histórica destructiva.
