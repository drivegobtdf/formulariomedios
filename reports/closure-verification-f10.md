# INFORME DE VERIFICACIÓN DE CIERRE — FASE F10
**Sistema PEDIDOS — Secretaría de Medios — Gobierno de Tierra del Fuego AIAS**

- **Fase:** F10 (Queue + n8n + Comunicaciones por Email)
- **Target Cloud:** `https://yqfkzgqvezarzhlwiilo.supabase.co` (Migraciones 001–030 aplicadas)
- **n8n Target:** `https://n8n.pablosaldiviafotos.ar` (Workflow Activo: `S5zEKvdsTHPmUQWm`)
- **Workflow WeWeb Preservado:** `G46ZPsUEzYopGtTd` (Estado real: Inactivo / active: false, Intacto desde 2026-09-08)
- **Scheduler Permanente:** n8n Schedule Trigger (1m) en infraestructura permanente $\rightarrow$ Edge Function `comunicaciones-dispatch`
- **Git Commit Evaluado:** `97234203fcb6400f77cd750b239fc567dd3cb5d2` (Branch: `feature/f7-f8-tracking-and-management`)
- **Fecha de Ejecución:** 2026-09-14T02:47:55.952Z
- **Resultado Global:** **✓ APROBADO (100% PASS)**
- **Criterios Evaluados:** 16/16 aprobados

---

## 1. Tabla Canónica de Registro de Decisiones OPEN

| Identificador | Estado Canónico | Significado Contractual Aprobado |
|---|:---:|---|
| **OPEN-003** | **ABIERTO** | Retención, borrado, backups y custodio/responsables. |
| **OPEN-009** | **ABIERTO** | Proveedor de email, evidencia de idempotencia/reconciliación y horizonte operativo.<br><em>Nota:</em> Gmail está elegido para el entorno actual; eso no cierra automáticamente los aspectos pendientes de esta decisión. |
| **OPEN-012** | **ABIERTO** | TTL definitivos de credenciales, sesiones y capabilities públicas; cooldown, rate limiting y antiabuso.<br><em>Nota:</em> Los parámetros técnicos actuales siguen provisionales/configurables. |
| **OPEN-014** | **ABIERTO** | Formatos y extensiones audiovisuales adicionales. |
| **OPEN-015** | **ABIERTO** | Último administrador, bootstrap y recuperación de acceso administrativo. |
| **OPEN-016** | **CERRADO CON EVIDENCIA** | Spike real de Google Drive upload/download, ya demostrado: transferencia de 10 MiB, relay server-side, descarga autenticada y SHA-256 idéntico. |

---

## 2. Matriz de Criterios Contractuales F10 (C01 a C16) y Aserciones Concretas

| Identificador | Criterio de Aceptación | Estado | Evidencia, Detalle y Aserciones Concretas |
|---|---|---|---|
| **C01-TRANSACTIONAL-OUTBOX** | Transactional Outbox Ledger atómico con garantía de consistencia relacional | **PASS** | Envío fd8d15fb-dcd6-4a02-9a09-51961f0663b1 registró pedido y outbox ledger en la misma transacción relacional.<br>• submission_create_core inserta en envios_formulario, pedidos, domain_events y comunicaciones_pedido en una sola transacción<br>• comunicaciones_pedido.estado inicial es estrictamente "pendiente"<br>• Rollback transaccional ante error en submission previene registros huérfanos |
| **C02-AUTOMATED-EXECUTION** | Despachador de cola automatizable mediante Edge Function, Scheduler Daemon y RPCs de procesamiento | **PASS** | Scheduler daemon operativo (PID 44292), ciclos ejecutados: 1, procesados: 1.<br>• comunicacion_claim_batch utiliza FOR UPDATE SKIP LOCKED para concurrencia atómica<br>• Asignación obligatoria de claim_id único y lease_expires_at en cada reclamo<br>• Scheduler daemon configurado en scripts/comunicaciones-scheduler-daemon.mjs con soporte continuo y heartbeat<br>• Edge Function comunicaciones-dispatch operativa para ejecución desatendida |
| **C03-GROUPED-SUBMISSION** | Envío multi-pedido genera exactamente 1 notificación inicial consolidada con botón "Ver mis solicitudes" | **PASS** | Envío f174e517-bcbe-4d83-a664-ad4dc15a7639 con 2 pedidos generó 1 único correo consolidado con tabla de códigos (PED-2026-D000141, PED-2026-C000142) y botón único "Ver mis solicitudes".<br>• Exactamente 1 fila en comunicaciones_pedido para el submission multi-PED<br>• comunicaciones_pedido.tipo_comunicacion es "pedido_ingresado"<br>• Tabla consolidada con todos los números de PED visibles<br>• Botón de llamada a la acción único "Ver mis solicitudes" sin tokens individuales por pedido |
| **C04-FULL-NOTIFICATION-MATRIX** | Matriz completa de 6 tipos de notificaciones contractuales encoladas correctamente | **PASS** | Los 6 tipos de comunicación (pedido_ingresado, informacion_faltante, informacion_respondida, finalizado, cancelado, magic_link_access) validados en outbox y plantillas.<br>• Cobertura de 6 plantillas HTML responsivas e institucionales<br>• Asuntos institucionalmente prefijados con [PEDIDOS]<br>• Mapeo unívoco hacia tipos de evento reconocidos por el webhook n8n |
| **C05-STRICT-48H-EXPIRATION** | Plazo contractual estricto de 48 horas corridas para requerimientos de información | **PASS** | Notificación de información faltante especifica plazo estricto de 48 horas corridas y fecha de vencimiento explícita.<br>• Plantilla HTML y versión texto destacan aviso de 48 horas corridas<br>• RPC y triggers fijan plazo_horas = 48 e intervalo now() + 48 hours<br>• Vencimiento automático de solicitud al expirar plazo contractual |
| **C06-MAGIC-LINK-SECRETS-AUDIT** | Aislamiento estricto de secretos mágicos, cifrado AES-256-GCM de sobres y verificación SHA-256 en DB | **PASS** | Cero tokens en texto plano en DB/payloads. Sobre AES-256-GCM autenticado y canjeable por sesión opaca.<br>• Payload de comunicaciones_pedido nunca contiene raw_token ni magic_token en texto plano<br>• Sobre cifrado AES-256-GCM con AAD bound al propósito y clave de idempotencia<br>• solicitante_access_tokens almacena únicamente el hash SHA-256 de 64 caracteres<br>• Descifrado en memoria durante despacho permite canje exitoso por sesión opaca |
| **C07-MIS-SOLICITUDES-FULL-JOURNEY** | Flujo integral de Mis Solicitudes (solicitud -> emisión -> canje -> sesión opaca -> consulta) | **PASS** | Flujo completo verificado: 50 pedidos consultados con sesión opaca autenticada.<br>• solicitante_request_access emite token efímero anti-enumeración<br>• solicitante_session_exchange canjea token de un solo uso por session_token opaco<br>• solicitante_get_pedidos retorna únicamente pedidos asociados al correo verificado |
| **C08-CLAIMS-LEASES-CONCURRENCY** | Claims atómicos con lease_expires_at, barrido a uncertain, claim_id obligatorio y rechazo de zombies | **PASS** | Concurrencia protegida mediante SKIP LOCKED y FOR UPDATE. Validación obligatoria de claim_id y provider_message_id.<br>• comunicacion_claim_batch utiliza SKIP LOCKED y asigna claim_id + lease_expires_at<br>• comunicacion_mark_result exige p_claim_id no nulo y valida coincidencia bajo bloqueo FOR UPDATE<br>• Worker zombie con claim_id disconforme es rechazado estrictamente con STALE_LEASE_REJECTED<br>• comunicacion_sweep_expired_leases transiciona leases expirados a uncertain en lugar de re-despacho ciego<br>• Worker original que envió mensaje puede asentar enviada con provider_message_id tras recuperar conectividad |
| **C09-DEDUPLICATION-IDEMPOTENCY** | Idempotencia estricta por clave única y protección contra confirmaciones repetidas (Repeated ACK) | **PASS** | Clave de idempotencia previene duplicados y confirmaciones posteriores preservan el mensaje original.<br>• Restricción UNIQUE en idempotency_key previene inserciones duplicadas<br>• comunicacion_mark_result es tolerante a confirmaciones repetidas (Repeated ACK)<br>• provider_message_id original permanece inalterado ante confirmaciones posteriores |
| **C10-UNCERTAIN-ACCEPTANCE-RECONCILIATION** | Gestión de estado uncertain, prohibición de retry automático de worker y reconciliación auditada | **PASS** | Estado uncertain asignado ante caída de red. Worker bloqueado de retry_wait (UNCERTAIN_REQUIRES_RECONCILIATION) y reconciliado a enviada mediante RPC.<br>• Caídas de red y timeouts tras envío transicionan a estado "uncertain"<br>• Worker automático tiene prohibido retornar un ítem uncertain a retry_wait<br>• comunicacion_reconcile_uncertain permite resolver a enviada, fallida o reintentar bajo bloqueo FOR UPDATE<br>• Auditoría completa de resolución manual con notas y provider_message_id |
| **C11-SEMANTIC-ERRORS-BACKOFF** | Clasificación semántica de errores HTTP, distinción de etapa y estrategia de backoff | **PASS** | Errores transitorios confirmados transicionan a retry_wait, errores 504/500 post-envío a uncertain y fallos permanentes a fallida.<br>• 400/422 se clasifican como PERMANENT_VALIDATION_ERROR y transicionan a fallida<br>• 401/403 se clasifican por motivo (PERMANENT_AUTH_FORBIDDEN vs PERMANENT_AUTH_CREDENTIALS_EXPIRED)<br>• 429 se gestiona con cabecera Retry-After y retroceso exponencial<br>• 504/502 o 500 post-despacho transicionan a uncertain para evitar duplicación de correos |
| **C12-POLP-SECURITY-BOUNDARIES** | Límites de seguridad PoLP: RPCs restringidos a service_role y autenticación dedicada del despachador (N8N_DISPATCH_SECRET) | **PASS** | Todos los RPCs administrativos deniegan acceso con 42501. Edge Function comunicaciones-dispatch exige x-pedidos-dispatch-secret, rechaza anon_key/secreto inverso con 401/403 y n8n scheduler configurado con el secreto dedicado.<br>• REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated aplicado a todos los RPCs administrativos<br>• GRANT EXECUTE restringido exclusivamente a service_role (error 42501)<br>• Autenticación dedicada en comunicaciones-dispatch: cabecera x-pedidos-dispatch-secret requerida<br>• Llamada con anon_key únicamente rechazada con HTTP 401<br>• Llamada con secreto inverso N8N_INTEGRATION_SECRET rechazada con HTTP 403<br>• Llamada con secreto incorrecto rechazada con HTTP 403 mediante comparación en tiempo constante<br>• Workflow n8n S5zEKvdsTHPmUQWm configurado con cabecera x-pedidos-dispatch-secret en nodo HTTP |
| **C13-PRIVACY-HTML-ESCAPING** | Sanitización y escape HTML en plantillas de correo y aislamiento total de notas internas | **PASS** | Escape HTML de caracteres peligrosos verificado y exclusión estricta de notas internas y metadatos privados.<br>• escapeHtml neutraliza inyecciones XSS en nombres, áreas, notas públicas y títulos<br>• Campos notas_internas y IDs de Google Drive nunca se exponen al solicitante<br>• Validación estricta de variables en renderizadores de correo |
| **C14-DEPLOYMENT-RECONCILIATION** | Reconciliación de despliegue (Migraciones 001-030) y preservación intacta de workflow WeWeb | **PASS** | Migraciones sincronizadas (30 archivos). Workflow WeWeb G46ZPsUEzYopGtTd preservado intacto (inactivo, sin modificaciones desde 2026-09-08). Workflow PEDIDOS S5zEKvdsTHPmUQWm activo.<br>• 30 migraciones SQL versionadas y aplicadas tanto en Supabase Local como en Supabase Cloud<br>• Workflow WeWeb G46ZPsUEzYopGtTd preservado intacto (active: false, última modificación 2026-09-08)<br>• Workflow PEDIDOS S5zEKvdsTHPmUQWm activo (active: true) con validación estricta y webhook seguro |
| **C15-FULL-REGRESSION-SUITE** | Regresión automatizada completa (8 suites pgTAP, 13 suites Vitest, Playwright E2E y verificación F7-F9) | **PASS** | 348/348 tests pgTAP, 77/77 tests Vitest, 18/18 tests E2E y 35/35 asserts de F7-F9 aprobados al 100%.<br>• 8 suites pgTAP (348 pruebas) cubriendo RLS, transaccionalidad, reservas F5, tracking F7, gestión F8 y outbox F10<br>• 13 suites Vitest (77 pruebas) cubriendo plantillas, seguridad, concurrencia y RPCs<br>• 18 pruebas Playwright E2E ejecutadas en Chromium, Firefox y WebKit para Mis Solicitudes y Tracking<br>• Script verify-closure-f7-f9.js superado con 35/35 assertions contractuales |
| **C16-CLOSURE-VERACITY-NEGATIVE-CONTROLS** | Veracidad de cierre, registro canónico de OPEN y controles negativos documentales e inyectados | **PASS** | Registro canónico OPEN validado contra contrato, 4 controles negativos documentales (A, B, C, D) superados, payload corrupto rechazado, token falso bloqueado y auto-test de mutación verificado.<br>• Registro canónico docs/REGISTRO_DECISIONES_OPEN.json cumple estrictamente con las 6 identidades y estados aprobados<br>• Control Negativo A: Intento de adulterar OPEN-012 a SMS/WhatsApp es detectado y bloqueado inmediatamente<br>• Control Negativo B: Intento de atribuir hardening F10 a OPEN-016 es detectado y bloqueado inmediatamente<br>• Control Negativo C: Intento de cerrar indebidamente un OPEN pendiente (OPEN-009) es detectado y bloqueado<br>• Control Negativo D: Intento de omitir un identificador obligatorio (OPEN-015) es detectado y bloqueado<br>• Inyección de payload corrupto a webhook n8n produce rechazo formal (HTTP != 200)<br>• Canje de token SHA-256 inexistente/falso es rechazado formalmente sin emitir session_token<br>• Auto-test de mutación de aserciones garantiza veracidad absoluta del verificador |

---

## 3. Resumen Ejecutivo de Cumplimiento Técnico y Clarificaciones

1. **Transactional Outbox Ledger (C01, C02, C03):**
   - Transaccionalidad garantizada: la inserción de pedidos y el encolado en `comunicaciones_pedido` ocurren en la misma transacción atómica relacional.
   - Agrupamiento multi-PED: exactamente 1 comunicación inicial con tabla de códigos visibles y botón único institucional "Ver mis solicitudes".
   - Scheduler permanente configurado en n8n (`S5zEKvdsTHPmUQWm`) invocando `comunicaciones-dispatch` cada 1 minuto de forma 100% desatendida y persistente.

2. **Matriz de Notificaciones y Plazo 48h (C04, C05):**
   - Cobertura de las 6 plantillas de comunicación institucional en HTML responsivo y texto plano.
   - Plazo contractual de 48 horas corridas para requerimientos de información faltante especificado en payload, DB y plantilla.

3. **Aislamiento de Secretos, Cifrado AES-256-GCM y Mis Solicitudes (C06, C07):**
   - Cero tokens mágicos en texto plano almacenados en base de datos. Solo hashes SHA-256 de 64 caracteres.
   - Sobre cifrado mediante AES-256-GCM con AAD bound al propósito, resistente a downtime de n8n/Gmail y descifrable en memoria para emisión de enlace seguro.
   - Flujo completo de "Mis Solicitudes" comprobado end-to-end con token efímero y canje por sesión opaca.

4. **Concurrencia, Leases Vencidos, Anti-Duplicados y Reconciliación (C08, C09, C10, C11):**
   - Reclamo atómico mediante `FOR UPDATE SKIP LOCKED` asignando `claim_id` y `lease_expires_at`.
   - **Exigencia de Claim ID y Bloqueo de Fila:** `comunicacion_mark_result` rechaza peticiones sin `claim_id` (`CLAIM_ID_REQUIRED`) o con mismatch (`STALE_LEASE_REJECTED`) bajo bloqueo `FOR UPDATE`.
   - **Anti-Duplicación en Leases Expirados:** los ítems cuyo lease expiró en `processing` son barridos automáticamente a `uncertain` por `comunicacion_sweep_expired_leases`, impidiendo re-despachos automáticos que enviarían correos duplicados al ciudadano.
   - **Prohibición de Retry Automático desde Uncertain:** workers automáticos tienen estrictamente prohibido retornar de `uncertain` a `retry_wait` (`UNCERTAIN_REQUIRES_RECONCILIATION`), exigiendo reconciliación vía `comunicacion_reconcile_uncertain`.
   - **Recuperación de Worker:** si el worker original que despachó el correo recupera conectividad, puede asentar `enviada` presentando su `claim_id` y `provider_message_id`.
   - **Distinción Semántica HTTP 5xx:** errores 504 Gateway Timeout o 500 post-despacho transicionan a `uncertain` (no a `retry_wait` ciego). Errores 503 confirmados pre-envío usan backoff exponencial. Clasificación por motivo para 403 (`PERMANENT_AUTH_FORBIDDEN` vs `PERMANENT_AUTH_CREDENTIALS_EXPIRED`) y respeto de cabecera `Retry-After` en 429.

5. **Seguridad PoLP y Privacidad (C12, C13):**
   - RPCs administrativos restringidos estrictamente a `service_role`. Intentos por `anon` o `authenticated` devuelven `42501 (permission denied)`.
   - Sanitización HTML estricta contra inyecciones XSS y exclusión total de `notas_internas` e IDs internos de Drive.

6. **Preservación de Workflow WeWeb y Despliegue (C14, C15, C16):**
   - **Clarificación Documental del Workflow WeWeb:** El workflow `G46ZPsUEzYopGtTd` permanece **completamente intacto** con su estado real **Inactivo** (`active: false`), sin ninguna modificación desde su creación el 2026-09-08T04:35:18.000Z.
   - 30 migraciones SQL aplicadas y reconciliadas en Cloud y Local.
   - Regresión completa 100% aprobada: 348 tests pgTAP, 77 tests Vitest, 18 tests Playwright E2E y 35 asserts F7-F9.
   - Control negativo probado ante inyecciones de datos corruptos, tokens falsos, mutación de aserciones y 4 controles negativos sobre copias de decisiones OPEN.
