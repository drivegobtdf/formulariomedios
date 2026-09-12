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
