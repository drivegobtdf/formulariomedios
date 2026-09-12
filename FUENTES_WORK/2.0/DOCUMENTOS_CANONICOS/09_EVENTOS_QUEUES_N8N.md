# 09 — Eventos, Supabase Queues y n8n

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Objetivo
Unificar comunicaciones e integraciones asíncronas.

```text
operación de negocio
→ evento durable
→ Supabase Queue
→ n8n
→ email / integración
→ ack o retry
```

## 2. Queue
Nombre sugerido: `pedidos_events`.

Usar **Basic Queue/durable**, no una unlogged queue, porque perder una notificación por crash no es aceptable.

## 3. Contrato mínimo
Mensaje Queue por entrega: event_id, delivery_id, type, occurred_at, pedido_id, servicio_id opcional, schema_version y aggregate_version. communication_id anterior se normaliza a delivery_id (PK comunicaciones_pedido); no mantener dos identidades distintas para lo mismo.

No incluir tokens raw, email/cuerpo completo ni secretos. La Edge resuelve el contenido mínimo después de validar credencial de integración y reclamar la entrega. event_id identifica el hecho; delivery_id identifica el envío a un destinatario y canal. Un evento puede tener varias entregas independientes.

## 4. Tipos iniciales
- `pedido.created`
- `servicio.state_changed`
- `info.requested`
- `info.responded`
- `servicio.finalized`
- `servicio.cancelled`
- `tracking.recovery_requested`

## 5. Persistencia
La transacción de negocio crea domain_events, comunicaciones_pedido por entrega, referencias al contenido/sobre autorizado y mensaje Queue. UNIQUE por event_id+canal+destinatario canónico evita duplicación de la misma entrega. Estado y auditoría se actualizan en PostgreSQL; n8n no mantiene un estado primario alternativo.

sent = proveedor aceptó el mensaje y hay referencia/evidencia registrada. No equivale a leído ni entregado. Estados adicionales: retry_wait, uncertain, failed y cancelled. Intentos preservan IDs y códigos resumidos sin tokens o PII innecesaria.

## 6. Consumo n8n
1. n8n hace polling de automation-next-event con secreto específico de integración.
2. Edge verifica credencial; RPC backend reclama de forma atómica un mensaje/entrega, fija claim_id y lease_until e incrementa intento.
3. Devuelve solo el contenido permitido. Para enlaces, descifra en memoria el sobre vigente; nunca devuelve la clave de cifrado ni permite consultar cualquier token_id.
4. n8n envía con provider_idempotency_key estable derivada de delivery_id; antes de iniciar/reintentar valida vigencia de claim y política de proveedor.
5. Si requiere más tiempo, renueva la reclamación. Un consumidor antiguo no puede confirmar ni liberar la entrega de otro intento.
6. automation-result registra aceptación, error o incertidumbre. El ACK finaliza ledger y archiva mensaje de modo transaccional cuando corresponde.
7. Expirar la visibilidad permite recuperar trabajo, pero no autoriza repetir sin consultar su ledger y el resultado del intento anterior.

No exponer pgmq a browser. n8n no recibe secret API key de Supabase, contraseña DB ni acceso arbitrario al ledger. La credencial dedicada vive en Supabase Secrets y n8n Credentials; su rotación se ensaya.

## 7. Idempotencia
No basta con consultar sent antes del envío. Contrato obligatorio:
- una entrega tiene identidad estable; payload/template/destinatario permanecen estables durante sus reintentos;
- reclamación atómica y validación de claim_id en cada operación;
- proveedor con idempotencia y horizonte verificados, o consulta fiable de resultado que permita reconciliar;
- la ventana total de reintento automático no supera la garantía comprobada del proveedor;
- aceptación externa sin confirmación local entra en reconciliación; si no puede resolverse, uncertain y alerta, sin reenvío automático ciego;
- registrar sent y ACK en un commit evita una segunda ventana entre ledger y archivado;
- redelivery de sent se archiva sin volver a enviar.

No se garantiza “exactamente un email recibido” por tener Queue/event_id. QA demuestra los escenarios de entrega definidos y sus límites. Si el proveedor elegido no permite cumplir el requisito de no duplicados bajo estos escenarios, no se cierra el gate; cualquier relajación requiere aprobación explícita. Proveedor y límites están en OPEN-009.

## 8. Reintentos
Clasificar errores transitorios, definitivos e inciertos. Configuración versionada: visibility timeout, lease, renovación, timeout proveedor, backoff con dispersión, máximo de intentos, máximo de edad y horizonte de idempotencia. Los números se fijan con el proveedor y medición, no son constantes inventadas en el workflow.

Al agotar intentos/edad o vencer el sobre necesario: failed/dead-letter con motivo y alerta. uncertain requiere consulta/reconciliación o decisión humana autorizada. El reprocesamiento manual es auditado, respeta permisos y no emite un token nuevo ni altera un pedido como efecto implícito.

Contrato desconocido schema_version: no descartar ni interpretar de forma aproximada; estacionar y alertar. No colas infinitas ni archivado silencioso de trabajo sin resolver.

## 9. Fallos
| Escenario | Comportamiento esperado |
|---|---|
| n8n caído | PED confirmado persiste; entregas quedan pendientes |
| Proveedor indisponible antes de aceptación | Reintento limitado conforme a política |
| Proveedor aceptó, respuesta/registro perdido | Reconciliar con misma identidad; uncertain si no es demostrable |
| ACK perdido tras ledger sent | Redelivery verifica sent y archiva sin enviar |
| Lease vencida / dos workers | Solo claim actual puede modificar ledger; idempotencia externa protege la misma entrega en el horizonte válido |
| Token/sobre vencido | No enviar enlace roto ni regenerar silenciosamente; registrar fallo y procedimiento explícito de reemisión |
| Restauración/migración histórica | No notificar hechos históricos como nuevos |

Referencia: Supabase garantiza entrega única dentro de una ventana de visibilidad, no una transacción distribuida con el proveedor de email. https://supabase.com/docs/guides/queues (consulta 2026-09-11).

## 10. Responsabilidades prohibidas a n8n
n8n no:
- genera PED;
- decide roles;
- autoriza usuarios;
- modifica estado como efecto implícito de un email;
- almacena la versión primaria del negocio.

## 11. Desarrollo
Los exports versionables de workflows n8n deben guardarse sin credenciales en `https://github.com/drivegobtdf/formulariomedios` bajo `n8n/workflows/`.

n8n Community Edition local. Exportar workflows sin credenciales.

## 12. Notion
No forma parte del core hasta resolver `OPEN-002`. Si se mantiene, será consumidor asíncrono de eventos y nunca parte de la transacción crítica.


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

## 13. Política de destinatarios y datos de ejecución
OPEN-007 fija qué cambios notifican y a quién, agrupación por PED/servicio, plantillas y cancelación de avisos obsoletos. Hasta cerrarlo, no enviar correos adicionales por suposición. Auth email conserva su circuito Supabase Auth; las notificaciones de negocio pasan por Queue+n8n.

Deshabilitar persistencia de contenido sensible en ejecuciones exitosas, fallidas, manuales y datos fijados/pinned del workflow de envío; verificar comportamiento real de versión n8n y nodos. Los logs propios guardan IDs, tiempos y códigos sanitizados, no body ni enlaces. Configurar purga y accesos; export de workflows sin credenciales ni datos capturados. Fuente: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data (consulta 2026-09-11).

## 14. Catálogo de plantillas
Cada plantilla tiene tipo de evento, versión, destinatario permitido, campos mínimos y clasificación de datos. Congelar esa versión por entrega para que un reintento con la misma idempotency key no envíe un payload distinto. No usar contenido vivo del pedido que cambie entre intentos sin una regla de snapshot y retención aprobada. Los cambios posteriores producen un evento nuevo cuando la regla funcional lo requiere.
