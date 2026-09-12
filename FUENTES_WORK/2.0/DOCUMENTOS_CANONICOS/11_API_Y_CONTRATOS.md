# 11 — API y contratos

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Principio
El frontend depende de contratos documentados, no de detalles internos. Los errores relevantes incluyen `request_id`.

## 2. Crear pedido
POST create-pedido. Contrato HTTP externo v1; los cambios de diseño aún no tienen clientes desplegados verificados. Campos:
| Campo | Regla |
|---|---|
| submission_key | UUID estable por intención de envío |
| session_id + capability | Sesión emitida por submission-prepare; capacidad solo en header designado, nunca URL/log |
| contract_version | Versión de contrato soportada |
| solicitante | nombre_apellido, telefono, correo, area_solicitante según documento 19 |
| servicios[] | >=1; client_service_ref UUID único dentro de la presentación; area_slug, tipo_slug, form_schema_version, informacion_especifica |
| archivos[] | reservation_id + client_service_ref opcional; el servidor obtiene object_path y metadatos de la reserva |

No se acepta object_path como autorización ni se permite elegir pedido_id, estado, responsable, roles o datos de auditoría. Las longitudes/enums aún pendientes en documento 19 bloquean el validador correspondiente.

Éxito inicial: success, pedido_visible, tracking_token, idempotent_replay=false, request_id. El tracking raw se devuelve solo al primer commit. Replay autorizado: mismo pedido_visible, idempotent_replay=true, tracking_token=null y tracking_recovery_required=true cuando el cliente no dispone del original. Sin PII ni rotación de token. UI conserva el token si ya lo recibió y ofrece recuperación cuando corresponde.

Una respuesta perdida se resuelve reintentando misma clave y contenido; conflicto de contenido → 409 IDEMPOTENCY_CONFLICT. No autorizar lectura por submission_key.

## 3. Preparar presentación y upload
submission-prepare recibe submission_key, aplica antiabuso y emite session_id, capacidad aleatoria y expires_at. La capacidad se almacena como hash. Perder una capacidad no permite obtenerla por enumeración de session_id/submission_key; resolver UX de sesión expirada sin duplicar pedidos confirmados.

upload-prepare recibe contexto/capacidad, client_file_ref, nombre, tamaño declarado, MIME y client_service_ref opcional. Devuelve reservation_id, path asignado, datos firmados de carga y expiraciones reales. Un retry con mismo client_file_ref y metadatos no abre una reserva adicional; metadatos distintos requieren nueva intención o conflicto. No devolver secretos backend.

upload-complete recibe reservation_id y prueba de contexto. Comprueba carga finalizada y datos reales; devuelve verified/rejected. create-pedido solo consume verified. Los datos firmados son credenciales limitadas a un objeto y no se registran ni reutilizan en otro contexto.

## 4. Seguimiento
Request:

```json
{
  "pedido_visible": "PED-2026-000101",
  "token": "<raw>"
}
```

Response:

```json
{
  "pedido_visible": "PED-2026-000101",
  "estado_general": "En proceso",
  "created_at": "...",
  "servicios": [
    {
      "nombre": "Invitación Digital",
      "estado": "En proceso",
      "entrega": null
    }
  ]
}
```

No devolver observaciones internas, IDs Auth ni datos del equipo.

## 5. Validar información faltante

```json
{
  "valid": true,
  "pedido_visible": "PED-2026-000101",
  "servicio": "Invitación Digital",
  "mensaje": "..."
}
```

Nunca devolver token hash.

## 6. Responsables

```json
[
  {
    "value": "auth-user-uuid",
    "label": "operador_1"
  }
]
```

No incluir email/nombre real si UI no lo necesita.

## 7. Actualizar servicio

```json
{
  "servicio_id": "uuid",
  "expected_version": 1,
  "operation_key": "uuid",
  "estado": "En proceso",
  "observaciones_internas": "..."
}
```

Response: servicio actualizado + estado anterior + request/audit id.

## 8. Finalizar

```json
{
  "servicio_id": "uuid",
  "expected_version": 1,
  "operation_key": "uuid",
  "producto_final_url": "https://...",
  "producto_final_nota": "..."
}
```

## 9. Errores

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "No se puede realizar esta acción.",
    "request_id": "uuid"
  }
}
```

Códigos HTTP:
- 400 input;
- 401 auth;
- 403 permiso;
- 404 neutro/contextual;
- 409 conflicto;
- 422 regla de negocio;
- 429 rate limit;
- 500 interno.

## 10. Eventos
Todos llevan `schema_version`. Cambios breaking requieren actualización coordinada de contrato, tests y consumidores.


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

## 11. Contratos adicionales y errores cerrados
| Operación | Input mínimo | Output / condición |
|---|---|---|
| info-request-create | JWT interno, servicio_id, mensaje, operation_key | Solicitud creada e identificador; no entregar raw token al operador por defecto |
| info-token-validate | Token info | Datos mínimos de la solicitud vigente; no consume ni cambia estado |
| info-response-submit | Token info, operation_key, texto y reservation_ids | Resultado estable, sin duplicar respuesta/evento; contenido distinto tras consumo → conflicto |
| tracking-recovery-request | PED + email | Mismo mensaje/estructura para coincidencia o no; rate limit uniforme |
| tracking-recovery-exchange | Token recuperación, acción explícita e operation_key | Tracking nuevo una vez; reintento confirma consumo sin volver a rotar; si se perdió el raw, iniciar recuperación de nuevo |
| listados Gestión | Filtros permitidos, cursor, límite validado | Página y cursor; DTO mínimo; orden estable |
| automation-next-event | Credencial integración | delivery_id, event_id, claim_id, lease_until y contenido mínimo autorizado para ese intento |
| automation-renew | delivery_id, claim_id | Renovación solo de reclamación vigente dentro del contrato |
| automation-result / ack | delivery_id, claim_id, resultado proveedor | Ledger y Queue coherentes; ACK obsoleto rechazado; resultado incierto queda trazable |

Errores adicionales: IDEMPOTENCY_CONFLICT, VERSION_CONFLICT, RESERVATION_INVALID, UPLOAD_INCOMPLETE, CONTEXT_MISMATCH, TOKEN_INVALID_OR_EXPIRED, CONTRACT_VERSION_UNSUPPORTED, DELIVERY_RESULT_UNCERTAIN. Los mensajes públicos no revelan existencia de otra entidad ni detalles SQL. Las respuestas sensibles usan no-store.

## 12. Canonicalización y versiones
Definir una representación determinista de solicitante normalizado, servicios ordenados por client_service_ref y archivos por reservation_id; no normalizar arbitrariamente copy o contenido significativo. Versionar la canonicalización con el contrato. Si el cliente cambia contenido tras un error de validación precommit puede reenviar según sesión; si la operación ya fue confirmada, la misma clave no acepta cambios.

Eventos llevan schema_version, aggregate_version y una identidad estable. Cada entrega tiene delivery_id independiente para proveedor. Formularios llevan form_schema_version. Un cambio incompatible requiere compatibilidad coordinada, tests y documentación, no sustituir contratos en producción silenciosamente.

## 13. Headers y contextos de capacidad
La capacidad de presentación se envía en X-Pedidos-Session-Capability sobre HTTPS; session_id no es una credencial. n8n utiliza X-Pedidos-Automation-Key con el secreto específico, nunca en URL. CORS permite solo headers/métodos/origins necesarios del frontend; el acceso de n8n no depende de CORS. Redactar estos headers también en infraestructura y reportes de error.

Una reserva tiene exactamente un propietario de contexto: sesión inicial, solicitud de información autorizada o identidad interna con permisos. No aceptar combinaciones ambiguas; el servidor obtiene pedido/servicio a partir del contexto y comprueba coherencia, no confía en IDs arbitrarios del cliente.
