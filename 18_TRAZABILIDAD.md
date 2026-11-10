# 18 — Trazabilidad

**Revisión documental:** 3.4 · 2026-11-10
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
| info 72h corridas (`CAM-01`, hist. 48h preservado) | SRS-INF / ADR-052 | solicitudes_informacion (`expires_at = now() + 72h` nuevas; preserva `expires_at` en históricas) | info QA / `cam01-info-request-72h` |
| finalización entrega | ADR-049 | entregas_pedido | QA-EST-008 |
| cancelar/reabrir | ADR-050 | RPC | QA-EST-007..012 |
| archivar/restaurar | ADR-047 | archivado_at/audit | QA archivo |
| tablero+tabla (refresco sin parpadeo `CAM-05`) | ADR-048 | GestionDashboardPage.tsx (`loadData` isSilent, `latestLoadId`) | UI/E2E / QA `CAM-05` |
| MockDrive dual persistente y fail-closed (`INC-05`) | ADR-042 / INC-05 | `_mock_drive_storage` + `MockDriveAdapter` (bloqueo estricto en test/prod) | `inc05-inc06-storage-and-retry.test.ts` |
| Idempotencia y retry en subida (`INC-06`) | SRS-PED-008 / INC-06 | `drive-upload-prepare` `(session_id, client_file_ref)` relay streaming | `inc05-inc06-storage-and-retry.test.ts` |
| Purga reservas huérfanas (`INC-07`) | ADR-043 / OPEN-003 / INC-07 | RPC `cleanup_orphaned_upload_reservations` (gracia configurable, protege verificados) | `inc05-inc06-storage-and-retry.test.ts` |
| Evento canónico respuesta info (`INC-02`) | ADR-046 / INC-02 | `pedido.info_responded` en `solicitudes_informacion_responder` | `inc02-canonical-event.test.ts` |
| Accesibilidad fechas y contraste (`INC-01`, `INC-03`, `INC-09`) | WCAG 2.1 AA / Paquete 3 | `MisSolicitudesPage`, `CargaInternaModal`, `app.css` | `inc01-inc03-inc09-ux-contrast.test.ts` |
| Títulos 3-50 y soporte MP4 25MB (`INC-04`, `INC-08`) | PRD §6 / INC-04 / INC-08 | `submission_create_core`, triggers y validaciones frontend | `inc04-inc08-title-and-mp4.test.ts` |

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
- implementación: F1-F6 IMPLEMENTADA Y VERIFICADA;
- QA v3: F1-F6 100% PASS (pgTAP 199/199, Vitest 49/49, Playwright 24/24);
- baseline WordPress: DOCUMENTADO;
- integración Google Drive: IMPLEMENTADA Y VERIFICADA EN SUPABASE CLOUD Y GOOGLE REAL (OPEN-016 CERRADO).

- **Backlog 2026-11 — Fase 1A (`CAM-04` y `CAM-06`):**
  - `CAM-04` (`docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md` §CAM-04 → `02_REQUISITOS_FUNCIONALES.md` §17 → `PedidoDetallePage.tsx` → `PedidoDetallePage.test.tsx`): IMPLEMENTADO Y VERIFICADO.
  - `CAM-06` (`docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md` §CAM-06 → `02_REQUISITOS_FUNCIONALES.md` §17 → `formatUtils.ts`, `GestionDashboardPage.tsx`, `PedidoDetallePage.tsx`, `MisSolicitudesPage.tsx`, `SeguimientoPage.tsx`, `app.css` → `formatUtils.test.ts`, `PedidoDetallePage.test.tsx`, `GestionDashboardPage.test.tsx`): IMPLEMENTADO Y VERIFICADO.

- **Backlog 2026-11 — Fase 1B (`CAM-01`):**
  - `CAM-01` (`docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md` §CAM-01 → `02_REQUISITOS_FUNCIONALES.md` §6 → migración SQL `20261103193000`, `drive-upload-prepare`, 6 vistas frontend → `cam01-info-request-72h.test.ts`, pgTAP `00005` y `00007`): IMPLEMENTADO Y APROBADO (`7298d5e3e6fddd820c84a4b29f6a4d952338fe3c`).
- **Backlog 2026-11 — Fase 2 (`CAM-03` y `CAM-05`):**
  - `CAM-03` (`docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md` §CAM-03 → `02_REQUISITOS_FUNCIONALES.md` §18 → `gestionApi.ts`, `GestionDashboardPage.tsx`, `app.css` → `cam03-finalizados-ordering-and-filters.test.tsx` (15 pruebas PASS) y `cam03-pagination-large-datasets-1205.test.tsx` (11 pruebas PASS, 680 pruebas totales en 63 suites), 5 capturas QA visuales Playwright): IMPLEMENTADO Y APROBADO (`22be9172ce9b14907bd7d09fa64d96153ace52bd`).
  - `CAM-05` (`docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md` §CAM-05 → `02_REQUISITOS_FUNCIONALES.md` §19 → `GestionDashboardPage.tsx` → `GestionDashboardPage.test.tsx` (2 pruebas unitarias PASS), 682 pruebas totales en 63 suites, 7 capturas QA visuales Playwright): IMPLEMENTADO (Pendiente revisión Dirección Técnica).

- **Post-QA — Paquete 1 (`INC-05`, `INC-06`, `INC-07`):**
  - `INC-05` (Aislamiento storage mock en pruebas locales → migración `20261110000001`, `MockDriveAdapter.ts` con persistencia dual y fail-closed en test/prod → `inc05-inc06-storage-and-retry.test.ts`): IMPLEMENTADO Y VERIFICADO (`414b2ceca8`).
  - `INC-06` (Idempotencia de subida por `(session_id, client_file_ref)` y resiliencia ante cortes → `drive-upload-prepare`, `drive-adapter.ts` → `inc05-inc06-storage-and-retry.test.ts`): IMPLEMENTADO Y VERIFICADO (`414b2ceca8`).
  - `INC-07` (Limpieza de reservas de carga huérfanas expiradas → migración `20261110000000`, RPC `cleanup_orphaned_upload_reservations` → `inc05-inc06-storage-and-retry.test.ts`): IMPLEMENTADO Y VERIFICADO (`414b2ceca8`).
- **Post-QA — Paquete 2 (`INC-02`, `INC-10`):**
  - `INC-02` (Evento canónico `pedido.info_responded` ante respuesta de solicitante → migración `20261110000002`, triggers y Edge Function dispatcher → `inc02-canonical-event.test.ts`): IMPLEMENTADO Y VERIFICADO (`971e5bb`, `45a052d`).
  - `INC-10` (Normalización de plazos 72h corridas en plantillas de notificación → `renderEmailHtml.ts` → `inc10-deadline-strings.test.ts`): IMPLEMENTADO Y VERIFICADO (`971e5bb`).
- **Post-QA — Paquete 3 (`INC-01`, `INC-03`, `INC-09`):**
  - `INC-01` (Accesibilidad de fechas y formateo unificado en vistas de solicitante → `MisSolicitudesPage.tsx`, `formatUtils.ts`): IMPLEMENTADO Y VERIFICADO (`f8b7012`).
  - `INC-03` (Accesibilidad y navegación por teclado en carga interna → `CargaInternaModal.tsx`): IMPLEMENTADO Y VERIFICADO (`f8b7012`).
  - `INC-09` (Contraste de controles WCAG 2.1 AA >= 3:1 en temas claro y oscuro → `app.css` → `inc01-inc03-inc09-ux-contrast.test.ts`): IMPLEMENTADO Y VERIFICADO (`f8b7012`).
- **Post-QA — Paquete 4 (`INC-04`, `INC-08`):**
  - `INC-04` (Límite estricto de títulos 3–50 caracteres para pedidos nuevos, preservación de históricos → migración `20261110000003`, validaciones frontend y RPCs → `inc04-inc08-title-and-mp4.test.ts`): IMPLEMENTADO Y VERIFICADO (`3d5dcdc`).
  - `INC-08` (Soporte aditivo para archivos `video/mp4` hasta 25 MB → migración `20261110000003`, `submission_create_core` y carga interna → `inc04-inc08-title-and-mp4.test.ts`): IMPLEMENTADO Y VERIFICADO (`3d5dcdc`).
- **Consolidación Integral (`CAM-01`, `CAM-02`, `CAM-08`):**
  - `CAM-01` (Responsable obligatorio al solicitar información → migración `20261106004000`, `solicitud_informacion_crear`): IMPLEMENTADO Y VERIFICADO (`58dd9a9`).
  - `CAM-02` (Insignia `is_reabierto` y trazabilidad de reapertura → migración `20261106030000`, `GestionDashboardPage.tsx`, `PedidoDetallePage.tsx`, `app.css`): IMPLEMENTADO Y VERIFICADO (`fe83027`).
  - `CAM-08` (Historial de notas internas y permisos → migración `20261105002000`, `GestionDashboardPage.tsx`, `PedidoDetallePage.tsx`, `app.css`): IMPLEMENTADO Y VERIFICADO (`35ed5e5`).
