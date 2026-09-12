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
- 48 horas corridas (Cambio aprobado por el responsable: vigencia de solicitudes de información faltante de 15 días a 48 horas corridas);
- respuesta;
- vencimiento (now >= expires_at rechazado);
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
