# 07 — RPC y Edge Functions

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Criterio
- PostgreSQL/RPC: invariantes, transacciones, state machine.
- Edge: frontera pública, tokens, CORS, rate limit, signed uploads, secretos.
- Browser: UI, nunca autorización final.

## 2. Mapeo
| Necesidad | Implementación objetivo |
|---|---|
| crear pedido | Edge `create-pedido` → RPC `pedidos_create` |
| detalle | RPC `pedido_detail_get` |
| responsables | RPC `responsables_list` |
| asignar | RPC `servicio_assign` |
| actualizar servicio | RPC `servicio_update` |
| finalizar | RPC `servicio_finalize` |
| pedir información | Edge `info-request-create` → RPC server-only `info_request_create` |
| validar token info | Edge `info-token-validate` |
| responder info | Edge `info-response-submit` |
| tracking | Edge `tracking-get` |
| recuperación tracking | Edge `tracking-recovery-request` |
| usuarios admin | RPCs admin |
| sesión de presentación | Edge `submission-prepare` |
| upload público | Edge `upload-prepare` / `upload-complete` |
| canje recuperación | Edge `tracking-recovery-exchange` |
| consumo automatización | Edge `automation-next-event` / `automation-ack-event` / renovación/resultado |

## 3. `create-pedido`
Responsabilidades Edge:
- POST;
- CORS allowlist;
- rate limit/anti-abuso;
- límites de body;
- validación estructural;
- normalización;
- llamada RPC;
- DTO público;
- no email directo.

## 4. `pedidos_create`
Invocable solo por Edge. La Edge valida capacidad de presentación, body, contratos, límites y reservas; genera token/hash/sobre cifrado del primer intento sin emitir correo. PostgreSQL revalida lo relevante, serializa por submission_key y confirma en una transacción:
1. validar sesión/contexto, fingerprint y replay;
2. validar catálogo activo y relación tipo/área;
3. validar contrato versionado de cada servicio y mínimo uno;
4. reservar número e insertar pedido;
5. insertar servicios con sus client_service_ref;
6. bloquear/consumir reservas verificadas y asociar archivos;
7. persistir hash y sobre temporal cifrado autorizado;
8. registrar evento, entregas definidas por política y enqueue;
9. auditoría sin raw/ciphertext sensible y marcar sesión committed;
10. devolver DTO con PED y resultado de creación.

Fallo antes del commit → rollback completo de DB. La transferencia previa de archivos puede dejar huérfanos a limpiar. Replay no reemplaza tokens/sobres ni crea eventos. La Edge solo devuelve el raw que corresponde al primer commit efectivo; descarta tokens generados para intentos que terminaron en replay.

## 5. Validadores por servicio
Validación server-side por slug:
`flyer_rrss`, `invitacion_digital`, `certificado`, `otros_diseno`, `cobertura_eventos`, `gacetilla`, `redes_sociales`.

No aceptar JSONB libre sin contrato.

## 6. `servicio_assign`
Valida caller aprobado, alcance autorizado, responsable aprobado, expected_version, existencia y estado. Guarda UUID Auth; cualquier cambio asociado de estado requiere matriz aprobada OPEN-001. Incrementa version y audita atómicamente.

## 7. `servicio_update`
Whitelist de campos. Valida state transition. Cancelación exige motivo.

## 8. `servicio_finalize`
Valida rol, servicio y URL HTTPS; guarda entrega, Finalizado, audit y evento.

## 9. `info_request_create`
La Edge autentica al operador, genera token aleatorio/hash y sobre cifrado. RPC server-only revalida actor/alcance y guarda solicitud con `expires_at = now()+15 días`, estado pendiente, sobre, entrega, Queue y auditoría en un commit. operation_key evita duplicados. **No modifica estado PED/servicio.**

## 10. `info-token-validate`
Recibe token raw, hashea y devuelve solo datos públicos si está pendiente y vigente.

## 11. `info-response-submit`
Valida token, texto/archivos, marca respondida, asocia archivos, crea evento y evita doble respuesta indebida.

## 12. `tracking-get`
Input PED+token. Output solo:
- PED;
- fecha;
- estado general público;
- servicios y estados públicos;
- entregables autorizados.

Excluir observaciones internas, emails del equipo, UUID Auth y audit.

## 13. Recuperación
PED+email siempre recibe respuesta neutra y protección antiabuso. Si coincide, registrar una recuperación temporal y Queue. No rotar el tracking vigente al solicitar. El canje explícito consume la recuperación y rota el acceso de forma atómica; una reentrega no vuelve a rotar.

## 14. Admin
- `admin_users_list`
- `admin_user_approve`
- `admin_user_revoke`
- `admin_username_update`

Todas validan `app_role=admin` server-side.

## 15. Errores HTTP
`400` input; `401` auth; `403` permiso; `404` neutro cuando corresponda; `409` conflicto; `422` negocio; `429` rate limit; `500` interno con `request_id`, sin stacktrace.

## 16. CORS
Origins explícitos local/staging/production. CORS no sustituye Auth/RLS.


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

## 17. Matriz de invocación y errores
| Endpoint / RPC | Caller | Autorización final |
|---|---|---|
| submission-prepare | Público, sin Supabase Auth | Límites compartidos/antiabuso; emite capacidad de presentación |
| upload-prepare/complete inicial | Capacidad de presentación | Hash, estado, plazo, cupo y relación con submission_key |
| create-pedido → pedidos_create | Público con capacidad → Edge | RPC solo backend; sesión, fingerprint, reservas y contratos |
| tracking-get / firma archivo público | PED + tracking token | Hash/contexto; DTO mínimo y archivo autorizado |
| tracking-recovery-request | Público | Respuesta neutra; rate limit/cooldown |
| tracking-recovery-exchange | Token recuperación + acción explícita | Consumo y rotación atómicos |
| info-request-create → info_request_create | JWT interno aprobado → Edge | Actor actual, alcance; RPC solo backend |
| info-token-validate / info-response-submit | Token info | Pendiente, plazo, servicio y reservas del contexto |
| pedido_detail_get / responsables_list | JWT interno | auth.uid(), perfil aprobado y alcance |
| servicio_assign/update/finalize | JWT interno | Actor/alcance, versión, operación idempotente y transición aprobada |
| admin_* | JWT admin | Admin aprobado actual y reglas de administración |
| automation-* | Secreto dedicado n8n | Autenticación integración + delivery/claim vigente; RPC solo backend |

Para endpoints internos, validar JWT del usuario, no una publishable key. Para públicos sin sesión y n8n con credencial propia, configurar verificación de plataforma acorde al mecanismo y validar en el handler; no desactivar controles globalmente. La especificación debe comprobarse con la versión actual de Supabase CLI/Edge antes de desplegar. Referencia: https://supabase.com/docs/guides/functions/auth y /auth-headers (consulta 2026-09-11).

En Edge elevada, actor_user_id proviene de JWT verificado, no del body; la RPC vuelve a comprobar su aprobación/rol y autoriza la entidad. RLS no protege automáticamente operaciones hechas con cliente elevado.

## 18. Transiciones, concurrencia y entrega
servicio_update no puede saltarse servicio_finalize mediante estado=Finalizado. Centralizar invariantes compartidas; negar campos fuera de whitelist. expected_version obliga a detectar cambios concurrentes y devolver VERSION_CONFLICT. operation_key/fingerprint reutilizados devuelven mismo resultado; no vuelven a notificar.

No afirmar que una URL HTTPS garantiza permisos del archivo o disponibilidad futura. La entrega se valida contra el contrato aprobado, sin descargar arbitrariamente URLs de usuario desde backend. Para Storage, persistir referencia estable y firmar al consultar, no guardar una signed URL expirable como entrega permanente.

## 19. Seguridad pública
Rate limiting debe compartir estado y límites entre instancias: un contador en memoria Edge no es control suficiente. Puede usarse PostgreSQL con operaciones atómicas y expiración para el volumen esperado, sin introducir un servicio adicional por defecto. Parámetros y dimensionamiento OPEN-011/012. Combinar dimensiones según endpoint y no bloquear indiscriminadamente redes institucionales compartidas. CORS y honeypot son capas auxiliares, no autorización.

## 20. Consistencia de recuperación
La nueva credencial se genera en Edge y su hash/cambio de versión se confirma solo si el canje de recuperación sigue pendiente y válido bajo bloqueo. Al canjear se invalidan las demás recuperaciones pendientes del mismo PED y se cancelan entregas pendientes de enlaces ya inválidos. Una carrera con un correo ya aceptado puede dejar un enlace antiguo en la bandeja del destinatario: deberá rechazarse sin filtrar datos y ofrecer recuperación. No se promete retirar correos ya enviados.

Si un replay confirma canje ya realizado no vuelve a entregar raw por una clave pública ni rota otra vez. El resultado informa acceso emitido y, si el navegador perdió la credencial, permite iniciar recuperación independiente. No usar generation order del consumidor para decidir qué tracking queda activo.
