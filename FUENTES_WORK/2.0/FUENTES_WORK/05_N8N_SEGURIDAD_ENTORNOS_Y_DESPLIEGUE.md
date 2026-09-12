# PEDIDOS — n8n, seguridad, entornos y despliegue

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `09_EVENTOS_QUEUES_N8N.md`
- `12_SEGURIDAD.md`
- `13_ENTORNOS_SECRETOS_DESPLIEGUE.md`

---

# DOCUMENTO: 09_EVENTOS_QUEUES_N8N.md

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

# FIN DOCUMENTO: 09_EVENTOS_QUEUES_N8N.md


---

# DOCUMENTO: 12_SEGURIDAD.md

# 12 — Seguridad

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Activos
PII, PED, servicios, archivos, roles, tokens públicos, secretos, historial y comunicaciones.

## 2. Fronteras

```text
Internet
→ WordPress frontend (no confiable)
→ Supabase API / Edge
→ PostgreSQL + RLS
→ Storage
→ Queue
→ n8n
```

Todo input del browser es no confiable.

## 3. Amenazas y controles

### IDOR
RLS/RPC valida acceso; nunca confiar en `pedido_id` enviado.

### Enumeración de PED
PED + token, respuestas neutras y rate limiting.

### Robo de tokens
- 256 bits;
- hash de validación en DB; sobre cifrado temporal separado únicamente para entrega autorizada conforme ADR-028 revisada;
- expiración cuando aplica;
- no logs;
- preferir fragment URL `#t=` para reducir leakage y limpiarlo del history tras capturarlo.

### XSS
No insertar HTML no confiable. Escaping contextual. Sanitizar rich text si se introduce.

### CSRF
Supabase usa Authorization header para su sesión. Para settings WordPress: nonce + capability. Un nonce no es autorización.

### SQL injection
RPC parametrizada; no concatenar input en SQL.

### Escalada
El signup no elige rol. Admin verificado server-side.

### Secret leakage
Secret keys solo en Edge/server/n8n Credentials.

### Upload
Allowlist, size, MIME, bucket privado, paths aleatorios, archivos no ejecutables.

### Abuso público
Rate limit, honeypot y límites. CAPTCHA solo si el abuso real lo justifica.

## 4. RLS
Toda tabla expuesta por Data API:
- grants mínimos;
- RLS;
- tests positivos y negativos;
- revisar views y funciones.

## 5. SECURITY DEFINER
Checklist:
- necesidad justificada;
- `search_path=''`;
- schema explícito;
- auth/role;
- revoke public;
- grant mínimo;
- sin SQL dinámico inseguro.

## 6. Claves
Publishable: browser permitido, privilegio bajo.  
Secret: elevado, jamás browser/repo/URL/log.

## 7. CORS
Allowlist. No usar `*` en endpoints sensibles de producción. CORS no sustituye autorización.

## 8. Auditoría
Registrar actor, acción, entidad, valores relevantes, request_id, timestamp. Excluir passwords, tokens raw, auth headers y keys.

## 9. Privacidad
No PII en Storage paths. No enviar PII innecesaria a n8n. Retención pendiente `OPEN-003`.

## 10. WordPress
Settings propios con capability, nonce, validación/sanitización y escaping. No SQL de negocio PEDIDOS en WordPress.

## 11. Supply chain
Lockfile, dependencias actualizadas, revisión de bundle y ausencia de secrets/source maps sensibles.

## 12. Checklist preproducción
- tests RLS allow/deny;
- escalada admin;
- pending/revoked;
- enumeración/replay;
- rate limit;
- upload bypass;
- signed URL expiry;
- CORS;
- no secrets bundle;
- no PII logs;
- backup/restore.


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

## 13. Controles específicos del sitio receptor

- Wordfence permanecerá activo en pruebas.
- No se recomendará desactivarlo permanentemente.
- Actualmente no se reporta CSP restrictiva, pero el diseño no dependerá de ello.
- Los dominios Supabase deberán poder incorporarse a una CSP futura.
- WP Super Cache nunca debe cachear secretos; el frontend solo recibe
  configuración pública.

## 14. Cifrado temporal de enlaces
Diseño definido para revisión 2.0: cifrado autenticado AES-256-GCM con nonce aleatorio único por clave, clave de 256 bits en Secrets de Edge, key_version y AAD vinculado a entorno/token_id/propósito/entidad. La librería criptográfica y serialización deben usar APIs oficiales y probar descifrado, autenticidad, rotación y aislamiento; no criptografía casera.

Hash de token sigue siendo el dato usado para autenticar. El sobre existe solo para enviar/reintentar, no como API general de recuperación. Acceso a sobres restringido a funciones server-side y a un delivery reclamado/permitido. El token raw transita únicamente en memoria hacia el destinatario/correo necesario, jamás por logs, audit_log, errores, exports o persistencia de ejecuciones n8n.

Eliminar el sobre al completarse su entrega cuando ya no sea necesario y al alcanzar su plazo máximo; considerar backups y retención de claves en OPEN-003. No retirar una clave antigua antes de resolver sobres válidos que la necesitan. Fallo de descifrado no regenera automáticamente otro token. La vigencia de un token de acceso y la retención del sobre son distintas.

## 15. Superficies de ataque y controles comprobables
- RPC server-only no ejecutables por anon/authenticated; pruebas directas de bypass obligatorias.
- CORS no protege contra clientes no navegador; rate limit distribuido, capacidad, límites de body y validación server-side son necesarios.
- URLs firmadas/capacidades son credenciales portadoras: no en analítica o cache compartida y autorización antes de emitirlas.
- No permitir elevación de rol/estado vía metadata de signup, UPDATE genérico o parámetros actor del body.
- Observar XSS y scripts del sitio anfitrión. No considerar CSS namespaced una separación de origen/seguridad.
- Estado dinámico aprobado/rol se comprueba también en operaciones Edge con privilegios elevados.
- Los eventos, reservas, sobres y operaciones idempotentes se alojan en schema privado no expuesto; si hay funciones de entrada expuestas, grants explícitos mínimos.
- Auditoría excluye tokens, ciphertext, cabeceras y campos sensibles innecesarios; usar whitelist de valores en old/new.

## 16. Privacidad y operación
OPEN-003 debe determinar responsable institucional, finalidad/aviso al solicitante, minimización, retención por clase, acceso y procedimiento de eliminación/solicitud de derechos, incluyendo backups, proveedor email y n8n. Esto es un pendiente de gobernanza, no una declaración de cumplimiento legal verificado.

Definir rate limits, tamaños, TTLs y alertas en configuración versionada antes de habilitar endpoints; tests verifican valor y efecto. No abrir endpoints temporalmente sin controles para facilitar pruebas. Datos de prueba sintéticos y ausencia de secretos en bundle/ZIP/documentación son gates de cada release.

# FIN DOCUMENTO: 12_SEGURIDAD.md


---

# DOCUMENTO: 13_ENTORNOS_SECRETOS_DESPLIEGUE.md

# 13 — Entornos, secretos y despliegue

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Entornos
| Entorno | WordPress | Supabase | n8n | Datos |
|---|---|---|---|---|
| local | XAMPP/local | CLI/Docker | CE local | seed ficticio |
| staging | WP staging | Supabase staging | n8n staging | sintético |
| production | institucional | Supabase prod | n8n prod | real |

No copiar PII de Production a local.

## 2. Supabase local

```bash
supabase init
supabase start
supabase db reset
```

`db reset` es destructivo para la base objetivo: solo local/staging controlado.

La carpeta `supabase/` se versiona con migrations, functions, tests y seeds.

## 3. Estructura de implementación
Esta estructura corresponde al repositorio oficial `https://github.com/drivegobtdf/formulariomedios`:


```text
/
├── wordpress-plugin/pedidos-medios/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   ├── seed.sql
│   └── config.toml
├── n8n/workflows/
├── docs/development/
└── .github/
```

## 4. Configuración frontend
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_BASE_PATH`
- `APP_ENV`

Publishable key no es secret.

## 5. Secretos
Supabase/n8n:
- secret API key solo donde sea necesaria;
- `N8N_INTEGRATION_SECRET`;
- credenciales de proveedor email.

Nunca en `.env.example` con valor real.

## 6. WordPress
Constantes/filtros por entorno:
- `PEDIDOS_SUPABASE_URL`
- `PEDIDOS_SUPABASE_PUBLISHABLE_KEY`
- `PEDIDOS_APP_ENV`

No guardar secret key Supabase en WordPress.

## 7. Compatibilidad
Aplicar ADR-032 y documento 20 como baseline receptor. Las recomendaciones generales de los fabricantes y las últimas versiones disponibles se consultan al fijar herramientas y preparar un release; no reemplazan automáticamente las versiones de compatibilidad aprobadas. Registrar versión de WordPress/PHP/Elementor/Pro/Betheme, plugins de seguridad/caché, CLI, PostgreSQL/pgmq, runtime Edge, Node/Vite y n8n realmente utilizados.

## 8. Desarrollo sin pago obligatorio
- WordPress.org/XAMPP.
- Supabase CLI local y/o Free.
- n8n CE local.
- Git.

No asumir que Free cubre producción futura.

## 9. Migrations
- todo cambio DB en migration;
- seeds sin PII;
- evitar cambios manuales no versionados;
- cambios destructivos requieren backup y rollback.

## 10. Git
Feature branch → PR → CI → staging → aprobación → producción.

## 11. Release plugin
SemVer. ZIP reproducible. Excluir `.env`, `node_modules`, credenciales y archivos innecesarios.

## 12. Backups
Antes de datos reales y cutover: backup recuperable de PostgreSQL y de los objetos Storage; backup de WordPress y configuración; exports n8n sin credenciales y respaldo protegido de su configuración/clave de cifrado cuando corresponda. El inventario de archivos acompaña al backup, no lo sustituye.

Los backups de DB de Supabase no incluyen objetos Storage. Ensayar restauración conjunta, referencias y permisos, excluyendo envío de eventos históricos. Registrar custodio, periodicidad, retención, cifrado, RPO (pérdida de datos tolerable) y RTO (tiempo de recuperación); parámetros en OPEN-003/011.

Fuente: https://supabase.com/docs/guides/platform/backups (consulta 2026-09-11). No presuponer que una cuenta Free incluye la política de backup requerida.

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

## 13. Baseline del entorno receptor

Producción auditada:
- WordPress 7.0.2;
- PHP 8.2.31;
- no Multisite;
- Betheme 28.5.7;
- Elementor 4.2.3;
- Elementor Pro 3.33.1;
- Wordfence;
- WP Super Cache;
- dominio `https://www.tierradelfuego.gob.ar`.

El entorno local deberá aproximarse a WordPress/PHP de producción cuando sea
práctico. Staging no fue verificado y debe confirmarse antes del despliegue.

## 14. Compatibilidad de versiones y releases
Cada release registra: versión plugin, intervalo de contrato API soportado, versión de formularios, migraciones aplicadas, schema_version de eventos y consumidor compatible. Cambios aditivos preceden la actualización de clientes; eliminar campos o RPC requiere terminar la ventana de compatibilidad. Los errores por contrato incompatible deben ser explícitos.

Preparar ZIP reproducible con checksum, guía de instalación para un tercero, configuración pública requerida y evidencia de QA. Actualizar backend compatible antes del plugin cuando el release así lo requiera; no ejecutar migraciones remotas silenciosamente al activar un ZIP.

## 15. Separación de entornos y secretos
No reutilizar secretos entre local/staging/producción. No enviar correo real en CI: capturador/mock y destinatarios sintéticos. Los ensayos de migración con datos reales exigen entorno aislado, autorización, acceso restringido y política de retención; no llevar PII a local. Fijar allowlists Auth/CORS por entorno y permitir solo callbacks concretos.

El desarrollo gratuito se refiere a no exigir pagos nuevos para construir el núcleo. La disponibilidad/licencia del stack comercial del receptor para QA está pendiente; no se promete reproducirlo gratis sin contar con autorización/paquetes legítimos. Un WordPress genérico valida el shell pero no cierra QA-COMP.

## 16. Operación y recuperación
Logs correlacionan request_id, event_id, delivery_id e intento, sin payloads sensibles. Alertas mínimas: antigüedad del trabajo pendiente, entregas inciertas, failed/dead-letter, errores públicos y presión de Storage. Responsable y umbrales en OPEN-011.

El rollback debe distinguir plugin, backend y tráfico. No restaurar una DB antigua sobre pedidos nuevos. Bloquear escrituras durante reconciliación, inventariar la ventana, conservar PED/relaciones/archivos/respuestas y corregir secuencias sin reutilizar números. Ver 16_MIGRACION_WEWEB.md.

# FIN DOCUMENTO: 13_ENTORNOS_SECRETOS_DESPLIEGUE.md
