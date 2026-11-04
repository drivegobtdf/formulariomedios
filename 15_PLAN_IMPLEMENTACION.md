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


## Seguimiento Backlog 2026-11 (Rama `feature/backlog-12-cambios-202611`)

| Fase | Cambios incluidos | Estado | Evidencia |
|---|---|---|---|
| GATE-0 (`0` a `0I`) | Auditoría Git, aislamiento de worktrees, backups cifrados PROD, guard *fail-closed* standalone y bloqueo de PROD en tests | **APROBADO** (`fe36bd9b190743729367bb6f24c6e78aaaa921be`) | 637 tests unitarios PASS, 0 escrituras PROD |
| **Fase 1A** | **`CAM-04` (Orden Historial vs. Versiones de finalización) y `CAM-06` (Hora real de ingreso `created_at` en tarjetas y detalle)** | **APROBADO** | **644 tests unitarios PASS (`60/60` suites), `typecheck` OK, `build:wordpress` OK, `build:standalone` (`TEST`) OK, QA visual verificado** |
| **Fase 1B** | **CAM-01 (Extensión de vigencia de solicitudes de información de 48 h a 72 h corridas con compatibilidad histórica)** | **APROBADO** (:98d5e3e6fddd820c84a4b29f6a4d952338fe3c) | **Migración SQL 61103193000, templates de email, drive-upload-prepare, 6 vistas frontend, pgTAP 00005/00007 y 654 tests unitarios PASS** |
| **Fase 2** | **CAM-03 (Vista Finalizados: orden cronológico configurable y filtros adicionales)** | **IMPLEMENTADO (Pendiente revisión Dirección Técnica)** | **gestionApi.ts, GestionDashboardPage.tsx, pp.css, 669 tests unitarios PASS (2/62 suites), 	ypecheck OK, uild:wordpress OK, uild:standalone OK, 5 capturas QA visuales Playwright** |
| Fases subsiguientes | CAM-02, CAM-05, CAM-07 a CAM-11 | PENDIENTE | Planificado según docs/backlog/PEDIDOS_backlog_cambios_2026-11-02.md |
