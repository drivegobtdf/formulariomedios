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
