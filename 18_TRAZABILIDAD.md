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
| info 48h corridas (aprobado) | SRS-INF | solicitudes_informacion (expires_at = created_at + 48h) | info QA |
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
- implementación: F1-F6 IMPLEMENTADA Y VERIFICADA;
- QA v3: F1-F6 100% PASS (pgTAP 199/199, Vitest 49/49, Playwright 24/24);
- baseline WordPress: DOCUMENTADO;
- integración Google Drive: IMPLEMENTADA Y VERIFICADA EN SUPABASE CLOUD Y GOOGLE REAL (OPEN-016 CERRADO).
