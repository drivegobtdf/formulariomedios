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
