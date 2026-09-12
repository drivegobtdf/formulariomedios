# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `14_PRUEBAS_QA_ACEPTACION.md`, `15_PLAN_IMPLEMENTACION.md`, `16_MIGRACION_WEWEB.md`, `18_TRAZABILIDAD.md`


---

# DOCUMENTO: 14_PRUEBAS_QA_ACEPTACION.md

# 14 — Pruebas, QA y criterios de aceptación

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Capas

- unitarias;
- PostgreSQL/constraints;
- RLS/RBAC;
- RPC;
- Edge;
- Google Drive contract;
- frontend;
- E2E;
- n8n/events;
- compatibilidad WordPress;
- migración;
- UAT.

## 2. Casos críticos de producto

| ID | Caso | Esperado |
|---|---|---|
| QA-001 | 1 pieza | 1 envío + 1 PED |
| QA-002 | Flyer + Invitación + Cobertura | 1 envío + 3 PED |
| QA-003 | códigos categoría | D/D/C correctos |
| QA-004 | secuencia global | números consecutivos independientemente del código |
| QA-005 | cambio de año | reinicia secuencia |
| QA-006 | doble clic | mismos PED, sin duplicados |
| QA-007 | retry mismo key/carga | mismo conjunto |
| QA-008 | mismo key distinta carga | 409 |
| QA-009 | concurrencia | números únicos |
| QA-010 | correo inicial | uno con todos los PED |
| QA-011 | cambio de un PED | email solo de ese PED |

## 3. Estados/asignación

| ID | Caso | Esperado |
|---|---|---|
| QA-EST-001 | Nuevo sin responsable → En revisión | rechazado |
| QA-EST-002 | asignar + En revisión | permitido + audit |
| QA-EST-003 | reasignar | conserva historial actor/origen/destino |
| QA-EST-004 | En revisión → En proceso | permitido |
| QA-EST-005 | solicitar info | no cambia estado |
| QA-EST-006 | Esperando info → En proceso | permitido por actor |
| QA-EST-007 | cancelar sin motivo | rechazado |
| QA-EST-008 | finalizar sin archivo/link | rechazado |
| QA-EST-009 | Finalizado → Cancelado | rechazado |
| QA-EST-010 | Cancelado reabrir sin motivo | rechazado |
| QA-EST-011 | Cancelado reabrir con responsable | En revisión |
| QA-EST-012 | Cancelado reabrir sin responsable | Nuevo |

## 4. Roles

Probar como:
- anon;
- pending;
- rejected;
- revoked;
- observer;
- team;
- admin.

Casos:
- Observador lee;
- Observador no muta;
- UI Observador no muestra acciones;
- Equipo no administra usuarios;
- Admin sí administra;
- pending/rejected/revoked sin gestión;
- revoked con JWT anterior falla.

## 5. Formularios

- 8 categorías.
- Diseño múltiples piezas.
- Flyer solo campos aprobados.
- Cobertura `hora fin` opcional.
- Gacetilla 3 campos.
- Redes 3 campos.
- 4 nuevas según contrato.
- asesoramiento omite campos técnicos y crea PED.
- back/forward conserva.
- resumen editable.
- errores accesibles.

## 6. Archivos/Drive

| ID | Caso | Esperado |
|---|---|---|
| QA-FILE-001 | 10 archivos válidos | permitido |
| QA-FILE-002 | 11 archivos | rechazado |
| QA-FILE-003 | 10 MB | permitido según definición exacta de bytes contractual |
| QA-FILE-004 | >10 MB | rechazado + sugerir link |
| QA-FILE-005 | 1 PED | asociación automática |
| QA-FILE-006 | varios PED + general | una copia física, N asociaciones |
| QA-FILE-007 | específico | solo PED objetivo |
| QA-FILE-008 | reserva vencida | denegado |
| QA-FILE-009 | file_id ajeno | denegado |
| QA-FILE-010 | Drive metadata no coincide | no completar |
| QA-FILE-011 | OAuth secrets bundle/log | ausentes |
| QA-FILE-012 | carpeta Drive pública | gate falla |
| QA-FILE-013 | download tracking correcto | permitido |
| QA-FILE-014 | otro PED | denegado |
| QA-FILE-015 | link >10MB | aceptado sin fetch automático |

`OPEN-014` cierra MIME audiovisuales antes del QA final.

## 7. Seguimiento

- token correcto;
- token incorrecto;
- token expirado;
- PED correcto con token de otro PED;
- recuperación neutral;
- no notas internas;
- entrega versionada;
- cache headers seguros.

## 8. Información faltante

- crear no muta estado;
- 15 días;
- respuesta;
- vencimiento;
- archivo/link;
- idempotencia;
- email.

## 9. Archivado

- solo Finalizado/Cancelado;
- no cambia estado;
- oculto por defecto en activo;
- aparece en Archivo;
- restore;
- audit.

## 10. Dashboard/tabla

- métricas por rol;
- Mis pedidos;
- Sin asignar;
- Requieren atención;
- filtros combinados;
- búsqueda PED parcial;
- paginación;
- orden;
- alertas sin mutación.

## 11. Eventos/n8n

- enqueue;
- claim;
- send;
- retry;
- uncertain;
- ack perdido;
- n8n caído;
- `submission.created` agrupado;
- `pedido.state_changed` individual;
- schema desconocido.

No enviar emails reales desde tests automatizados normales.

## 12. Google OAuth

- bootstrap;
- refresh;
- revoke;
- secreto ausente frontend;
- scope efectivo;
- Drive API outage;
- resumable session;
- prueba CORS/PUT browser;
- fallback si aplica.

## 13. Compatibilidad WordPress

- WP 7.0.2 + PHP 8.2.31;
- Elementor render único;
- editor sin submits;
- theme/ElementsKit sin CSS crítico;
- Wordfence activo;
- WP Super Cache activo;
- deep links;
- móvil;
- CORS a Supabase/Google según flujo aprobado.

## 14. Accesibilidad

Teclado, foco, labels, errores, contraste, modales, estados asíncronos y lector de pantalla básico.

## 15. UAT

Equipo real valida:
- multi-PED;
- asignación;
- tablero/tabla;
- roles;
- info;
- entrega;
- cancelación/reapertura;
- archivo;
- Drive;
- correos.

## 16. Release gate

No producción con:
- duplicación PED;
- secuencia rota;
- RLS crítico;
- Observer write;
- secretos expuestos;
- Drive público;
- pérdida/huérfanos no controlados;
- correo inicial incorrecto;
- migración no ensayada;
- P0/P1 abierto sin aceptación explícita.

## 17. Estado

Todos estos QA son PLANIFICADOS hasta que exista evidencia ejecutada.



---

# DOCUMENTO: 15_PLAN_IMPLEMENTACION.md

# 15 — Plan de implementación · revisión 3.0

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## Fases y gates

| Fase | Trabajo | Gate |
|---|---|---|
| F0 | Congelar revisión 3.0 y OPEN | docs/manifiesto consistente |
| F1 | Skeleton repo + toolchain | build/test reproducible |
| F2 | Supabase schema v3 | migrations + DB tests |
| F3 | Auth/RBAC/RLS | matriz allow/deny |
| F4 | Secuencia + creación multi-PED | idempotencia/concurrencia |
| F5 | Google OAuth/Drive spike | upload/download seguros en browsers |
| F6 | Formulario público 8 categorías | E2E wizard |
| F7 | Tracking + info faltante | tokens/anti-enumeración |
| F8 | Gestión Dashboard/Board/Table/Detail | roles + workflow |
| F9 | Entregas/cancelación/reapertura/archivo | state QA |
| F10 | Queue+n8n+emails | agrupación/retry |
| F11 | integración WordPress receptor | QA-COMP |
| F12 | migración/staging/UAT | reconciliación + rollback |
| F13 | release/cutover | gates completos |

## Dependencias

- F5 debe cerrar `OPEN-016` antes de terminar frontend de archivos.
- `OPEN-014` antes de validar uploads audiovisuales.
- `OPEN-009` antes de cerrar emails reales.
- `OPEN-003/011` antes de política de purga y SLO productivo.
- `OPEN-013` antes de migrar históricos.

## Cambios mínimos

Aunque la implementación pueda estar vacía, cada agente debe:
1. inspeccionar repo;
2. leer PRD/SRS/arquitectura/documento específico;
3. no revivir `servicios_solicitados` como agregado v3;
4. no introducir Supabase Storage sin ADR nuevo;
5. no colocar OAuth Google en frontend;
6. ejecutar pruebas relacionadas;
7. informar archivos modificados.

## Definition of Ready

Feature lista para codificar cuando:
- requisitos sin contradicción;
- OPEN bloqueantes cerrados;
- contrato API/DB definido;
- threat model;
- casos QA.

## Definition of Done

- código + migrations versionados;
- tests verdes;
- RLS positivos/negativos;
- secrets audit;
- docs actualizadas;
- compatibilidad relevante;
- rollback donde aplique;
- evidencia guardada.



---

# DOCUMENTO: 16_MIGRACION_WEWEB.md

# 16 — Migración desde WeWeb

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Objetivo

Retirar WeWeb y publicar WordPress + Supabase + Google Drive + n8n sin perder comportamiento necesario ni fabricar una migración histórica no aprobada.

## 2. Cambio de modelo

Destino v3:

```text
envío → N pedidos
```

No:
```text
pedido → N servicios_solicitados
```

## 3. Históricos

La revisión 2.0 documentó un modelo multiservicio por PED. Convertir un PED histórico en varios PED nuevos puede alterar:
- identificadores visibles;
- enlaces de seguimiento;
- auditoría;
- comunicaciones;
- referencias externas.

Por tanto `OPEN-013` bloquea cualquier flatten destructivo.

Opciones a decidir:
1. migrar solo datos nuevos desde cutover y conservar histórico WeWeb read-only;
2. importar histórico como snapshots legados sin convertir numeración;
3. convertir servicios históricos a nuevos PED con mapeo explícito y comunicación controlada.

No elegir automáticamente.

## 4. Datos a mapear

Para nuevos/cutover:
- contacto;
- categoría/tipo;
- campos específicos;
- estado;
- responsable si existe y puede mapearse;
- archivos;
- solicitudes info;
- comunicaciones relevantes;
- timestamps;
- IDs legado para trazabilidad.

## 5. Auth

No migrar contraseñas en texto. Usar mecanismos soportados de Supabase Auth/invitación/reset.

## 6. Numeración

Nuevos PED v3 usan `PED-YYYY-CNNNNNN`. Definir punto inicial y reconciliar con IDs históricos antes de producción para no generar colisiones/confusión.

## 7. Archivos

Destino Google Drive. Si se migran archivos:
- copiar/verificar;
- checksum cuando sea posible;
- metadata Supabase;
- no publicar links;
- reconciliar count/bytes.

## 8. Estados

Mapeo legado a:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información;
- Finalizado;
- Cancelado.

Estados legados `Asignado`/`Correcciones` requieren regla explícita de migración, no equivalencia silenciosa.

## 9. Usuarios

Mapear identidades a `nombre_usuario`, rol y estado. Observador es nuevo.

## 10. Ensayo staging

- snapshot fuente;
- import;
- recuentos;
- muestras;
- PED mapping;
- files;
- auth;
- RLS;
- tracking;
- emails deshabilitados/mock;
- rollback.

## 11. Cutover

1. backup/snapshot;
2. freeze o ventana;
3. delta final;
4. migración;
5. smoke;
6. habilitar WordPress;
7. monitoreo;
8. rollback si gate falla.

## 12. Notificaciones

Nunca emitir eventos de `created/state_changed` por importar historia. Marcar eventos históricos para que no generen correo.

## 13. Rollback

Debe preservar:
- datos creados tras cutover o definir reconciliación;
- archivos;
- numeración;
- tokens;
- DNS/rutas/plugin.

## 14. Retiro

WeWeb solo después de aceptación, backup y período definido.

## 15. Bloqueantes

`OPEN-013`, staging, retención y mapeo real de datos existentes.



---

# DOCUMENTO: 18_TRAZABILIDAD.md

# 18 — Trazabilidad

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Matriz principal

| Requisito | Diseño | Datos/API | QA |
|---|---|---|---|
| 1 pieza = 1 PED | PRD §6 / ADR-037 | envios_formulario + pedidos | QA-001/002 |
| Secuencia global con código | ADR-040 | pedido_sequences + pedidos | QA-003/005/009 |
| Retry no duplica | SRS-PED-008 | submission_key/fingerprint | QA-006/008 |
| 8 categorías | Formulario §2 | catálogos/schema | QA formularios |
| asesoramiento | Formulario §7-10 | informacion_especifica | E2E |
| 6 estados | ADR-039 | CHECK/RPC | QA-EST |
| responsable antes revisión | SRS-EST-003 | pedido_assign/state | QA-EST-001/002 |
| audit asignación | SRS-EST-004 | pedido_asignaciones/audit | QA-EST-003 |
| 3 roles | ADR-041 | usuarios_acceso/RLS | QA roles |
| observer read-only | RBAC | policies/RPC | deny tests |
| Drive | ADR-042/043 | archivos/upload reservations | QA-FILE |
| 10×10MB | ADR-044 | upload_prepare | QA-FILE-001..004 |
| archivo general/específico | ADR-045 | archivo_pedido N:M | QA-FILE-005..007 |
| email inicial agrupado | ADR-046 | submission.created | QA-010 |
| email posterior individual | ADR-046 | pedido.* | QA-011 |
| seguimiento seguro | SRS-SEG | tracking Edge | security/E2E |
| info 15 días | SRS-INF | solicitudes_informacion | info QA |
| finalización entrega | ADR-049 | entregas_pedido | QA-EST-008 |
| cancelar/reabrir | ADR-050 | RPC | QA-EST-007..012 |
| archivar/restaurar | ADR-047 | archivado_at/audit | QA archivo |
| tablero+tabla | ADR-048 | frontend/query APIs | UI/E2E |

## 2. Revisión 2.0 → 3.0

| v2 | v3 |
|---|---|
| 1 envío = 1 PED = N servicios | 1 envío = N PED |
| servicios_solicitados operativo | pedido operativo directo |
| estado_general + estado servicio | un estado PED |
| 4 categorías | 8 |
| PED-YYYY-NNNNNN | PED-YYYY-CNNNNNN |
| 8 estados servicio | 6 estados PED |
| admin/equipo | admin/equipo/observador |
| Supabase Storage | Google Drive |
| 5×25MB | 10×10MB + link |
| adjuntos por pedido/servicio | archivo N:M a PED |
| OPEN-001 | cerrado |
| OPEN-005/006/007 amplios | cerrados en lo principal |

## 3. Invariantes que continúan

- Supabase fuente de verdad.
- WordPress UI.
- n8n asíncrono.
- PostgreSQL genera secuencia.
- RLS/grants.
- tokens hasheados.
- no `wp_users` para autorización.
- no secretos frontend.
- pedir info no cambia estado.
- QA/staging antes de producción.

## 4. Mejoras deliberadas v3

- agrupación técnica `envios_formulario`;
- PED como agregado simple;
- assignment history explícito;
- Observador;
- archivo reversible;
- Dashboard/alertas;
- entrega versionada;
- Drive con OAuth seguro;
- vínculo de material compartido sin duplicado.

## 5. OPEN

Ver documento 17. Todo requisito que dependa de OPEN debe mantener gate.

## 6. Definition of Ready

Cada tarea enlaza requisito → ADR/diseño → pruebas.

## 7. Definition of Done

No marcar requisito cumplido solo porque está escrito; se exige evidencia implementada y prueba.

## 8. Estado de evidencia

- decisiones funcionales v3: DOCUMENTADAS/APROBADAS en conversación;
- implementación: NO VERIFICADA;
- QA v3: PLANIFICADO;
- baseline WordPress: DOCUMENTADO;
- integración Google Drive: DISEÑADA, pendiente spike OPEN-016.
