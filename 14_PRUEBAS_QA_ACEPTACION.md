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


## 18. Garantías de Aislamiento de la Suite Unitaria (Fase 0H / GATE-0)

- La ejecución de `npm run test:unit` (60 archivos de prueba) está aislada de Supabase PRODUCCIÓN (`uwzgyirilafgnbpmrkic`):
  1. `pedidos-medios/frontend/src/__tests__/setup.ts` instala `createProdBlockedFetch` para interceptar y rechazar cualquier petición HTTP hacia `uwzgyirilafgnbpmrkic.supabase.co`.
  2. `tests/unit/admin-requeue-failed-communications.test.ts` valida los 5 escenarios funcionales del RPC `comunicacion_admin_requeue` mediante un almacén en memoria (`InMemoryRequeueStore`) y un 6.º caso de prueba que verifica tanto el contrato SQL de la migración 052 como la ausencia estática de referencias a `prod-secrets.json` en `tests/unit/`.
  3. `tests/unit/standalone-build-profiles.test.ts` verifica los 22 casos de resolución de perfiles TEST/PROD y el bloqueo *fail-closed* cuando `STANDALONE_ENV` no está definido.

  4. **Cobertura de integración real diferida exclusivamente a TEST (`yqfkzgqvezarzhlwiilo`) o Supabase Docker local (`127.0.0.1:54351`):**
     - Ejecución real de `public.comunicacion_admin_requeue(uuid, text, text)` en PostgreSQL (`SECURITY DEFINER`, `search_path`, bloqueo `FOR UPDATE` sobre `public.comunicaciones_pedido`, `REVOKE ALL FROM PUBLIC, anon`).
     - Validación cruzada con tablas reales (`public.usuarios_acceso` + `auth.users` para `acceso_aprobado` y `public.pedidos.responsable_user_id` para `pedido_asignado`).
     - Verificación de permisos *append-only* sobre `public.audit_log` (`GRANT SELECT, INSERT`, ausencia de `UPDATE`/`DELETE` incluso para `service_role`).


## 19. Evidencia QA — Fase 1A (`CAM-04` y `CAM-06`)

- **Cobertura unitaria agregada y verificada en `Wordpress Formulario Backlog`:**
  - `pedidos-medios/frontend/src/__tests__/formatUtils.test.ts`: 4 pruebas unitarias sobre `formatIngresoDateTime` validando conversión UTC a `America/Argentina/Ushuaia` (`UTC-3`), cruce de medianoche UTC, normalización de timestamps PostgreSQL sin sufijo `Z`, preservación de fechas `YYYY-MM-DD` y manejo de nulos/vacíos.
  - `pedidos-medios/frontend/src/__tests__/PedidoDetallePage.test.tsx`: 2 pruebas unitarias validando `CAM-04` (precedencia DOM de `data-testid="section-historial"` en `.col-right` respecto de `data-testid="section-versiones-finalizacion"` en sección inferior, preservando orden cronológico y botón `Compartir` por WhatsApp) y `CAM-06` (exhibición de `Ingreso: DD/MM/YYYY HH:mm` en `America/Argentina/Ushuaia` a partir de `created_at` sin confusión con `updated_at`).
  - `pedidos-medios/frontend/src/__tests__/GestionDashboardPage.test.tsx`: prueba unitaria validando `CAM-06` en tarjetas Kanban activas, tarjetas terminales (`Finalizados`) y vista Tabla (`Fecha Ingreso`).
- **Compilaciones verificadas:**
  - `npm run typecheck`: `0` errores TypeScript.
  - `npm run build:wordpress`: bundle y paquete ZIP WordPress (`dist/pedidos-medios-wp-plugin.zip`) generados exitosamente.
  - `STANDALONE_ENV=test npm run build:standalone`: compilación standalone apuntando exclusivamente a Supabase TEST (`yqfkzgqvezarzhlwiilo`), verificada por el guard *fail-closed* de `scripts/postbuild-standalone.mjs`.
- **Incidencia de UI responsive preexistente registrada (ajena a `CAM-04` y `CAM-06`):**
  - En viewport móvil `390 × 844 px` (`window.innerWidth = 390`, `document.documentElement.clientWidth = 390`), las vistas autenticadas internas (`/gestion` en Kanban/Tabla y `/gestion/pedido/:id`) presentan `document.documentElement.scrollWidth = 419` (`419.03 px`) y `document.body.scrollWidth = 411`.
  - **Causa raíz:** En `pedidos-medios/frontend/src/components/Layout.tsx` (líneas 79–95) y `pedidos-medios/frontend/src/styles/app.css` (línea 297), el contenedor `.pedidos-header-actions` (`display: flex; gap: 0.75rem`, sin `flex-wrap: wrap`) agrupa en una sola línea el botón de tema (`☀ Modo Claro`), la campana `<NotificationBell />` y `<UserProfileMenu />` (`rectWidth = 253.56 px`), sumando `379.84 px` desde `rectLeft = 39.19 px` hasta `rectRight = 419.03 px` (desbordando `29.03 px` el viewport de `390 px` y llevando `header.pedidos-header.scrollWidth` a `399 px`).
  - **Verificación contra baseline (`c444c9c53e25e0a2dd6bc2cfe691ec307da32e6c`):** Las mediciones sobre el baseline inalterado arrojan valores idénticos (`docScrollWidth = 419`, `bodyScrollWidth = 411`, `header.scrollWidth = 399`, `headerActionsRect.right = 419.03`), confirmando que se trata de una condición preexistente en `Layout.tsx` / `UserProfileMenu.tsx` y no de una regresión introducida por `CAM-04` o `CAM-06` (cuyos contenedores se mantienen dentro de `rectRight <= 370 px`). Queda registrada como incidencia de UI pendiente para su tratamiento específico sin alterar componentes ajenos al alcance de la Fase 1A.
