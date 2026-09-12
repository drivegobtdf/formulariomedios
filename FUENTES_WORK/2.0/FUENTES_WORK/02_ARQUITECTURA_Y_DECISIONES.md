# PEDIDOS — Arquitectura, contratos y decisiones

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `01_ARQUITECTURA_OFICIAL.md`
- `11_API_Y_CONTRATOS.md`
- `17_DECISIONES_ARQUITECTURA_ADR.md`

---

# DOCUMENTO: 01_ARQUITECTURA_OFICIAL.md

# 01 — Arquitectura oficial

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


**Nombre:** WSN-SC — WordPress + Supabase + n8n, Supabase-Centric  
**Código:** `PEDIDOS-WSN-SC-v1`  
**Estado:** Arquitectura aceptada; especificación revisada, implementación no verificada

## 1. Decisión
Supabase será la fuente de verdad. WordPress.org será el host de la interfaz y la integración institucional. n8n será la capa asíncrona de comunicaciones e integraciones.

```text
                 WORDPRESS.ORG
             /formulariomedios/*
                       │
              plugin pedidos-medios
                       │
              HTML/CSS/TypeScript
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
     Supabase Data/API        Edge Functions
          │                         │
          ├──── PostgreSQL ─────────┤
          ├──── Auth                │
          ├──── Storage             │
          └──── Queues ─────────────┘
                       │
                       ▼
                      n8n
```

## 2. Corrección fundamental
La primera documentación asumía erróneamente `1 servicio = 1 PED`.

El modelo oficial es:

```text
1 envío = 1 PED
1 PED = 1..N servicios_solicitados
```

No se introduce una entidad `solicitudes` adicional: `pedidos` ya es la cabecera de la solicitud.

## 3. WordPress
Responsabilidades:
- URL, theme, navegación, SEO e integración institucional;
- página `/formulariomedios`;
- carga del plugin y assets;
- subrutas de la aplicación.

No:
- almacena el dominio PEDIDOS;
- genera numeración PED;
- decide permisos;
- guarda adjuntos operativos;
- contiene secretos backend.

MySQL/MariaDB queda reservado al CMS WordPress.

## 4. Plugin `pedidos-medios`
- App shell.
- Shortcode/bloque de montaje.
- Rewrites.
- CSS y JS.
- Router frontend.
- formularios y UI.
- `supabase-js`.
- configuración pública: URL + publishable key.

No se crea WordPress REST como backend principal.

## 5. PostgreSQL
Responsable de:
- pedidos;
- servicios;
- catálogos;
- perfiles/roles de aplicación;
- sesiones de presentación y reservas de upload;
- sobres cifrados temporales para entrega de tokens;
- ledger de eventos, entregas e intentos;
- secuencia PED;
- solicitudes de información;
- archivos metadata;
- comunicaciones;
- auditoría;
- idempotencia;
- eventos Queue.

## 6. Auth
Supabase Auth identifica al personal interno. El público no necesita cuenta.

`usuarios_acceso` añade:
- `user_id`;
- nombre/apellido;
- `nombre_usuario`;
- `estado_acceso`;
- `app_role`.

`authenticated` es un rol técnico; `equipo_interno`/`admin` son roles de aplicación.

## 7. Autorización
- Publishable key en browser.
- RLS + grants mínimos.
- `anon` sin acceso directo a PED/PII.
- `authenticated` necesita además `estado_acceso = aprobado`.
- secret key solo en componentes controlados.
- escrituras críticas vía RPC/Edge, no `UPDATE` genérico.

## 8. RPC
Operaciones críticas: crear pedido, asignar, cambiar estado, finalizar, pedir información y administración de usuarios.

## 9. Edge Functions
Solo cuando haya frontera pública o necesidad de:
- tokens;
- anti-abuso;
- CORS;
- secretos;
- signed uploads;
- consumo de Queue.

## 10. Storage
Bucket privado `pedidos-private`. Descarga mediante autorización/signed URL. No `wp-content/uploads`.

## 11. n8n
```text
transacción de negocio
→ evento durable
→ Queue
→ n8n
→ email/integración
→ ack/retry
```

n8n no genera PED ni es fuente de verdad.

## 12. Flujo de creación

```text
Browser WordPress
  ├─ submission-prepare → capacidad temporal de presentación
  ├─ upload-prepare → reserva → signed upload → Storage → upload-complete
  └─ create-pedido Edge
           ↓
       RPC transaccional
           ├─ idempotencia
           ├─ secuencia PED
           ├─ pedidos
           ├─ N servicios
           ├─ archivos
           ├─ auditoría
           └─ Queue
```

## 13. Seguimiento
PED + token seguro → Edge Function → DTO público. Las tablas operativas permanecen cerradas a `anon`.

## 14. Rutas objetivo
| WeWeb actual | WordPress objetivo |
|---|---|
| `/` | `/formulariomedios/` |
| `/solicitud-recibida` | `/formulariomedios/solicitud-recibida` |
| `/seguimiento` | `/formulariomedios/seguimiento` |
| `/solicitud-informacion` | `/formulariomedios/solicitud-informacion` |
| `/login` | `/formulariomedios/login` |
| `/solicitar-acceso` | `/formulariomedios/solicitar-acceso` |
| `/gestion` | `/formulariomedios/gestion` |
| `/pedido/:id` | `/formulariomedios/pedido/:id` |
| `/usuarios` | `/formulariomedios/usuarios` |

## 15. Dependencias evitadas
- No `wp_pedidos_*`.
- No doble base WordPress/Supabase.
- No Auth doble.
- No WordPress → n8n directo.
- No n8n en la ruta crítica.
- No Notion en el core.
- Realtime diferido hasta demostrar necesidad.

## 16. Desarrollo
Supabase CLI/Docker para local, migrations versionadas y plugin entregable como ZIP.


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

## 17. Compatibilidad con el WordPress receptor

Baseline:
`WordPress 7.0.2 + PHP 8.2.31 + Betheme 28.5.7 + Elementor 4.2.3 +
Elementor Pro 3.33.1`.

Integración:
- página Elementor;
- shortcode/app shell;
- CSS namespaced;
- guard de montaje único;
- no dependencia de APIs internas de Elementor;
- compatibilidad con Wordfence y WP Super Cache.

Supabase continúa desacoplado de MySQL WordPress.

## 18. Fronteras técnicas precisadas
La transacción que confirma el PED incluye sus servicios, consumo de reservas de archivos ya verificadas, registro de auditoría, eventos/entregas y enqueue durable. La transferencia binaria previa a Storage no forma parte de la transacción PostgreSQL: se coordina mediante estados y limpieza segura. Si la transacción falla, no se publica un PED parcial; pueden quedar objetos no asociados para limpieza posterior.

Las RPC de creación pública, asociación y transporte de tokens son exclusivamente invocables desde Edge con permisos elevados controlados. Las RPC internas que no requieren secretos usan sesión del operador y validación de autorización en PostgreSQL. No conceder acceso elevado al navegador ni a n8n.

Las operaciones que emiten enlaces sensibles pasan por una Edge que genera el secreto y su sobre cifrado; PostgreSQL persiste ambos componentes autorizados (hash de validación y sobre separado) junto al evento en un único commit. La clave de cifrado permanece fuera de DB, WordPress y n8n.

Queue durable y ledger de comunicaciones forman parte temprana del backend. n8n solo consume entregas autorizadas; no gobierna la verdad de negocio, roles ni estados. La fiabilidad de email se expresa con estados comprobables y capacidades verificadas del proveedor.

## 19. Responsabilidad y límites
Un fallo de enqueue dentro de la transacción impide confirmar ese PED; un fallo de n8n posterior no lo revierte. No se promete que se puedan crear pedidos cuando PostgreSQL está caído. La disponibilidad del motor de colas dentro de PostgreSQL es una dependencia del commit documentada.

El frontend institucional comparte seguridad con los scripts del sitio anfitrión. CSS namespaced no es aislamiento de seguridad. No se introduce otro backend, Redis ni microservicios por defecto; cualquier infraestructura adicional se justifica con medición o requisito concreto.

# FIN DOCUMENTO: 01_ARQUITECTURA_OFICIAL.md


---

# DOCUMENTO: 11_API_Y_CONTRATOS.md

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

# FIN DOCUMENTO: 11_API_Y_CONTRATOS.md


---

# DOCUMENTO: 17_DECISIONES_ARQUITECTURA_ADR.md

# 17 — ADR · Decisiones de arquitectura

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


| ADR | Decisión | Estado |
|---|---|---|
| ADR-001 | Supabase es fuente de verdad | Aceptada |
| ADR-002 | WordPress es host de UI | Aceptada |
| ADR-003 | n8n es asíncrono, fuera del commit | Aceptada |
| ADR-004 | 1 envío = 1 PED = N servicios | Aceptada/corregida |
| ADR-005 | No crear entidad `solicitudes` adicional | Aceptada |
| ADR-006 | Estado general separado del estado servicio | Aceptada |
| ADR-007 | Pedir información no cambia estados automáticamente | Aceptada |
| ADR-008 | PED se genera en PostgreSQL | Aceptada |
| ADR-009 | Idempotencia por `submission_key` | Aceptada |
| ADR-010 | Supabase Auth para personal interno | Aceptada |
| ADR-011 | `usuarios_acceso` contiene aprobación/rol | Aceptada |
| ADR-012 | No usar `wp_users` para autorización PEDIDOS | Aceptada |
| ADR-013 | Grants mínimos + RLS | Aceptada |
| ADR-014 | Escrituras críticas por RPC | Aceptada |
| ADR-015 | Edge solo para fronteras necesarias | Aceptada |
| ADR-016 | Publishable/secret keys modernas | Aceptada |
| ADR-017 | Storage privado Supabase | Aceptada |
| ADR-018 | Signed upload para público | Aceptada |
| ADR-019 | Supabase Queues durable | Aceptada |
| ADR-020 | event_id para hecho de negocio y delivery_id estable por entrega; ledger, proveedor y reconciliación | Ampliada en revisión documental 2.0 |
| ADR-021 | Unificar comunicaciones en Queue+n8n | Aceptada |
| ADR-022 | Kanban + tabla, sin drag/drop MVP | Aceptada |
| ADR-023 | Registro objetivo con nombre/apellido/username | Aceptada |
| ADR-024 | Notion | Pendiente OPEN-002 |
| ADR-025 | Realtime | Diferida |
| ADR-026 | Desarrollo sin pago obligatorio | Aceptada |
| ADR-027 | Auditoría QA es baseline funcional | Aceptada |
| ADR-028 | Hash para validar; sobre cifrado temporal separado para entrega asíncrona | Ampliada explícitamente en revisión documental 2.0 |
| ADR-029 | Base URL `/formulariomedios` | Aceptada |
| ADR-030 | Agregación terminal de estado general | Pendiente OPEN-001 |
| ADR-031 | `https://github.com/drivegobtdf/formulariomedios` es el repositorio oficial del desarrollo; `https://github.com/saldiviapablo/formulariopedidos` queda como fuente histórica/auditoría | Aceptada |

| ADR-032 | Baseline receptor DOCUMENTADO: WP 7.0.2 / PHP 8.2.31 + Betheme/Elementor; compatibilidad a probar | Aceptada, aclarada en revisión 2.0 |

## Notas de decisiones principales

### ADR-004
Corrige la documentación histórica. El PED pertenece al pedido general; los servicios no reciben un PED independiente.

### ADR-005
Evita sobreingeniería: `pedidos` ya cumple la función de cabecera de solicitud.

### ADR-021
La implementación actual divide n8n y email directo. La futura solución usa una única salida durable para reducir acoplamiento y mejorar reintentos.

### ADR-023
Production y editor no están totalmente sincronizados en registro. Se adopta deliberadamente el modelo nuevo del editor porque el backend auditado ya lo soporta.

### ADR-030
No codificar una regla definitiva para Finalizado/Cancelado mixtos hasta que negocio la apruebe.


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


### ADR-031
El repositorio oficial para la implementación, documentación de desarrollo, plugin WordPress, migraciones Supabase, pruebas y workflows versionados es:

`https://github.com/drivegobtdf/formulariomedios`

El repositorio:

`https://github.com/saldiviapablo/formulariopedidos`

se conserva exclusivamente como fuente histórica y de evidencia de la auditoría del sistema WeWeb original. No es el destino del nuevo desarrollo.

### ADR-032
La compatibilidad objetivo del plugin se fija para desarrollo en WordPress 7.0.2
y PHP 8.2.31, dentro de Betheme 28.5.7 + Elementor 4.2.3 + Elementor Pro 3.33.1,
con Wordfence y WP Super Cache activos.

`OPEN-004` queda resuelto para desarrollo. Staging sigue siendo un requisito
operativo previo a producción.

## Revisión documental 2.0 — alcance y decisiones técnicas
La solicitud del propietario de generar la documentación corregida tras la auditoría autoriza incorporar sus correcciones técnicas y reemplazar las fuentes. No se atribuye una aprobación individual ficticia a reglas funcionales que nunca eligió. Se conservan como pendientes en el registro siguiente. Esta revisión no autoriza implementación ni despliegue.

### ADR-020 — ampliación explícita
Antes: event_id UNIQUE en comunicaciones y comprobación previa de sent. Ahora: event_id identifica el hecho; delivery_id identifica cada envío, UNIQUE por evento/canal/destinatario; reclamación atómica, idempotencia del proveedor y estado uncertain/reconciliación. Motivo: la ventana entre aceptación externa y registro local no se cierra con event_id solo. Impacto: modelo, API automation, workflows y tests. No se rebaja silenciosamente el requisito de evitar duplicados.

### ADR-028 — ampliación explícita
Antes: solo hash persistido, raw una vez. Ahora: hash como credencial de validación y posibilidad de sobre temporal cifrado separado para envío durable; clave fuera de DB, propósito/contexto autenticados, sin logs y eliminación programada. Motivo: un hash no permite formar un enlace después del commit. Impacto: Edge de emisión, tabla privada, rotación de claves, retención y QA. La antigua prohibición absoluta de cualquier material recuperable persistido queda sustituida por esta excepción técnica delimitada; sigue prohibido persistir tokens en texto plano.

### ADR-021 — alcance aclarado
Queue+n8n unifica comunicaciones de negocio PEDIDOS. Los emails nativos de identidad/recuperación de Supabase Auth se mantienen dentro de Auth. No rediseñar autenticación como workflow de n8n.

### ADR-033 — asociación mediante reservas
Estado: diseño técnico definido en revisión 2.0; pendiente implementación. La carga directa requiere sesión/capacidad, reserva verificada y consumo único; path no autoriza asociación. No introduce una segunda entidad de negocio solicitudes; las sesiones son soporte temporal técnico.

### ADR-034 — idempotencia y concurrencia de mutaciones
Estado: diseño técnico definido en revisión 2.0; pendiente implementación. Fingerprint por operación, resultado estable, expected_version para servicios y conflictos explícitos. Completa ADR-009 sin cambiar 1 envío = 1 PED.

### ADR-035 — exposición mínima
Estado: diseño técnico definido en revisión 2.0; pendiente implementación. RPC server-only separadas de RPC internas por sesión. Tablas técnicas privadas y DTO mínimo. Edge elevada revalida actor/contexto y no confía en campos de rol recibidos.

### ADR-036 — operación y recuperación verificables
Estado: diseño técnico definido en revisión 2.0; pendiente implementación. Staging/ensayo de migración, backup de objetos y DB, compatibilidad plugin/backend y rollback con reconciliación de nuevas operaciones. No declarar compatibles releases sin pruebas.

## Registro único de decisiones abiertas
| ID | Decisión pendiente | Responsable de decisión | Bloquea | Recomendación para revisar |
|---|---|---|---|---|
| OPEN-001 | Matriz de transiciones de servicios, reapertura, asignación y agregación general | Propietario funcional | Implementación de estados/asignación/cierre | Preparar tabla origen-destino y resultado general de combinaciones; no codificar una regla inferida |
| OPEN-002 | Mantener/retirar Notion | Propietario | Solo esa integración | Mantener fuera del núcleo hasta decisión |
| OPEN-003 | Retención, privacidad, borrado, backups y responsables | Institución/propietario | Datos reales y funciones de eliminación | Política por clase: pedidos, adjuntos, tokens/sobres, audit y comunicaciones |
| OPEN-004 | Versión receptor | Resuelto documentalmente por ADR-032 | Reconfirmación para release | WP 7.0.2/PHP 8.2.31 como objetivo; no actualiza el sitio |
| OPEN-005 | Contratos de formulario, unidades/fechas, repetición de tipos, adjuntos por contexto y entrega | Propietario funcional | Validadores, UX de selección, numeración y entrega | Resolver matriz del documento 19; conservar cinco archivos globales iniciales |
| OPEN-006 | Login email/username, rechazo, confirmación email, permisos de escritura, último admin y servicios de revocados | Propietario funcional + técnico | Auth UI y RPC afectadas | Mantener denegación de toda cuenta no aprobada y lectura global documentada; no inventar estado rechazado |
| OPEN-007 | Eventos notificables, destinatarios, plantillas y avisos obsoletos | Propietario funcional | Emails de negocio no definidos | Matriz por evento/servicio/destinatario; no notificar de más |
| OPEN-008 | Staging receptor o réplica aprobada, paquetes/licencias y responsable de instalación | Responsable WordPress | QA-COMP y release | Ensayo siempre antes de cutover; excepción del entorno WP no elimina ensayo de migración |
| OPEN-009 | Proveedor email, evidencia de idempotencia/reconciliación y horizonte | Responsable técnico/operativo | Gate de entrega real | Desarrollo con mock; no prometer no duplicados sin capacidad verificable |
| OPEN-010 | Framework UI y baseline de herramientas | Responsable técnico | Skeleton/frontend | Decisión técnica mínima con versiones y lockfile, sin cambiar WSN-SC |
| OPEN-011 | Volúmenes, latencia objetivo, paginación, alertas, RPO/RTO y custodios | Propietario/operación | QA de capacidad y producción | Medir con volúmenes representativos antes de dimensionar |
| OPEN-012 | TTL tracking/recuperación/sobres, cooldown, límites antiabuso, bytes de 25 MB y ventanas upload | Responsable técnico con revisión de impacto UX | Endpoints públicos correspondientes | Valores versionados y pruebas; info mantiene 15 días; respetar expiraciones reales del proveedor |

Un OPEN puede subdividirse en preguntas sin cambiar su identidad. Cerrarlo exige decisión escrita, responsable/fecha, documentos afectados y caso de aceptación. No cambiar su estado por la mera existencia de esta revisión.

## Propuestas no adoptadas automáticamente
No se aprueba una nueva regla de estados, un estado rechazado, un login por username, nuevas categorías, otro límite de adjuntos, nuevos destinatarios, cambio de stack, compra de servicios ni actualización de WordPress. La corrección documental no autoriza esas decisiones.

# FIN DOCUMENTO: 17_DECISIONES_ARQUITECTURA_ADR.md
