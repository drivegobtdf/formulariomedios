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
