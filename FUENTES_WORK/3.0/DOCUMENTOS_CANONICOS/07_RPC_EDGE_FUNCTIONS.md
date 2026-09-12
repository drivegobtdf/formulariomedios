# 07 — RPC y Edge Functions

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Criterio

Usar RPC para invariantes transaccionales y Edge Functions para fronteras públicas, OAuth/Drive, CORS, antiabuso y coordinación externa.

## 2. Operaciones principales

| Operación | Tipo | Actor |
|---|---|---|
| `submission_prepare` | Edge | público |
| `drive_upload_prepare` | Edge | público/interno |
| `drive_upload_complete` | Edge | público/interno |
| `submission_create` | Edge + RPC | público |
| `tracking_get` | Edge | público |
| `tracking_recover` | Edge | público |
| `info_token_validate` | Edge | público |
| `info_response_submit` | Edge + RPC | público |
| `pedido_assign` | RPC | equipo/admin |
| `pedido_change_state` | RPC | equipo/admin |
| `pedido_finalize` | RPC | equipo/admin |
| `pedido_cancel` | RPC | equipo/admin |
| `pedido_reopen` | RPC | equipo/admin |
| `pedido_archive` | RPC | equipo/admin |
| `pedido_restore` | RPC | equipo/admin |
| `info_request_create` | RPC/Edge | equipo/admin |
| `access_approve/reject/role/revoke` | RPC/Edge | admin |
| `drive_download` | Edge | público/interno |
| `automation_next_event/result` | Edge | n8n |

## 3. `submission_prepare`

Crea capacidad temporal ligada a:
- `submission_key`;
- límites de upload;
- contract version;
- antiabuso;
- origen permitido.

No crea PED.

## 4. `drive_upload_prepare`

Entrada:
- submission/session;
- nombre;
- MIME;
- bytes;
- contexto;
- referencias cliente de las piezas objetivo.

Valida:
- máximo 10 archivos en presentación pública;
- máximo 10 MB por archivo;
- tipo permitido por contrato;
- cantidad y contexto;
- capacidad vigente.

Crea reserva y, server-side, inicia sesión resumable de Drive cuando corresponda.

Nunca devuelve access token ni refresh token.

## 5. `drive_upload_complete`

Verifica que el archivo:
- corresponde a la reserva;
- existe en Drive;
- tiene tamaño/nombre/MIME esperados dentro de tolerancias definidas;
- no fue confirmado previamente con identidad diferente.

Marca metadata como verificada. La asociación definitiva a PED ocurre al confirmar el envío.

## 6. `submission_create`

Entrada simplificada:

```json
{
  "submission_key": "uuid",
  "request_fingerprint": "...",
  "contacto": {},
  "pedidos": [
    {
      "client_request_ref": "uuid",
      "categoria": "diseno_grafico",
      "tipo": "flyer_rrss",
      "informacion_especifica": {}
    }
  ],
  "archivos": [],
  "enlaces_material": []
}
```

Reglas:
1. canonicalizar/validar;
2. lock idempotencia;
3. mismo key + mismo fingerprint → devolver mismo resultado;
4. mismo key + distinta carga → 409;
5. reservar N números globales consecutivos/atómicos;
6. crear `envios_formulario`;
7. crear N `pedidos` con códigos;
8. crear tokens tracking;
9. asociar archivos/enlaces N:M;
10. audit;
11. `submission.created`;
12. commit;
13. devolver todos los PED.

## 7. `pedido_assign`

Precondiciones:
- actor equipo/admin aprobado;
- responsable destino aprobado y con rol que pueda trabajar PED (`equipo` o `administrador`);
- `expected_version`.

No asignar a Observador.

Registra `pedido_asignaciones` + audit y actualiza versión.

## 8. `pedido_change_state`

Valida matriz:

- Nuevo → En revisión: responsable obligatorio.
- Nuevo → Cancelado: motivo mediante operación de cancelación.
- En revisión → En proceso.
- En revisión → Esperando información.
- En revisión → Cancelado.
- En proceso → Esperando información.
- En proceso → Finalizado mediante finalize.
- En proceso → Cancelado.
- Esperando información → En revisión.
- Esperando información → En proceso.
- Esperando información → Cancelado.
- Cancelado → reapertura mediante operación específica.
- Finalizado: sin transición directa a Cancelado.

No usar endpoint genérico para saltar precondiciones de Finalizado/Cancelado/Reapertura.

## 9. `pedido_finalize`

Requiere:
- actor autorizado;
- responsable existente;
- archivo de entrega verificado y/o URL HTTPS válida;
- nota opcional;
- expected_version.

Crea `entregas_pedido`, marca actual, preserva versiones anteriores, cambia estado y emite evento.

## 10. `pedido_cancel`

Motivo obligatorio. Estado permitido según matriz. Audita y emite `pedido.cancelled`.

## 11. `pedido_reopen`

Solo desde Cancelado, motivo obligatorio. Resultado:
- En revisión si se conserva/asigna responsable válido;
- Nuevo si no hay responsable.

## 12. `pedido_archive` / `restore`

Solo Finalizado/Cancelado. Modifica campos de archivado, no `estado`.

## 13. Información faltante

`info_request_create`:
- PED;
- mensaje;
- vigencia 15 días;
- token hash;
- evento.
No cambia estado.

`info_response_submit`:
- token válido;
- texto/archivos/link;
- idempotencia;
- marca respondida;
- evento;
- no cambia estado.

## 14. Tracking

`tracking_get` recibe PED + secreto/capacidad segura. Devuelve DTO mínimo. Debe usar comparación segura de hash y respuestas neutras.

## 15. Drive download

Verifica acceso y asociación antes de solicitar el binario a Google Drive. Nunca usa permisos públicos `anyone`.

## 16. Admin

Aprobar/rechazar/cambiar rol/revocar/cambiar username requieren Admin aprobado, concurrencia y auditoría.

## 17. Errores

- 400 payload;
- 401 credencial/token;
- 403 permiso;
- 404/neutral para recursos públicos según threat model;
- 409 idempotencia/concurrencia;
- 410 token/capacidad vencida;
- 413 tamaño;
- 422 regla de negocio;
- 429 antiabuso;
- 5xx externo/interno sin filtrar secretos.

## 18. CORS

Allowlist exacta de origen WordPress por entorno. No `*` para endpoints con credenciales/capacidades.

## 19. Integración Drive

Según documentación oficial, el inicio de un resumable upload requiere OAuth; el URI de sesión obtenido se usa para transferir contenido y expira según Google. La implementación final se cierra con pruebas del browser/receptor en `OPEN-016`.

Referencias:
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/identity/protocols/oauth2/web-server
