# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `README.md`


---

# DOCUMENTO: README.md

# PEDIDOS — Documentación de desarrollo · revisión 3.0

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## Invariante funcional v3

```text
1 envío = 1..N PED
1 pieza/servicio = 1 PED
```

Ejemplo:
```text
PED-2026-D000101 — Flyer
PED-2026-D000102 — Invitación
PED-2026-C000103 — Cobertura
```

## Stack

- WordPress.org: UI/integración institucional.
- Supabase: PostgreSQL, Auth, RLS, RPC, Edge, Queue, auditoría.
- Google Drive: binarios.
- n8n: comunicaciones/integraciones asíncronas.

## Índice

| # | Archivo |
|---|---|
| 00 | `00_PRD.md` |
| 00A | `00A_SRS.md` |
| 01 | `01_ARQUITECTURA_OFICIAL.md` |
| 02 | `02_REQUISITOS_FUNCIONALES.md` |
| 03 | `03_FLUJOS_USUARIO.md` |
| 04 | `04_UI_UX_Y_PANTALLAS.md` |
| 05 | `05_MODELO_DATOS_SUPABASE.md` |
| 06 | `06_AUTENTICACION_RBAC_RLS.md` |
| 07 | `07_RPC_EDGE_FUNCTIONS.md` |
| 08 | `08_STORAGE_ARCHIVOS.md` |
| 09 | `09_EVENTOS_QUEUES_N8N.md` |
| 10 | `10_PLUGIN_WORDPRESS.md` |
| 11 | `11_API_Y_CONTRATOS.md` |
| 12 | `12_SEGURIDAD.md` |
| 13 | `13_ENTORNOS_SECRETOS_DESPLIEGUE.md` |
| 14 | `14_PRUEBAS_QA_ACEPTACION.md` |
| 15 | `15_PLAN_IMPLEMENTACION.md` |
| 16 | `16_MIGRACION_WEWEB.md` |
| 17 | `17_DECISIONES_ARQUITECTURA_ADR.md` |
| 18 | `18_TRAZABILIDAD.md` |
| 19 | `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md` |
| 20 | `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md` |

## Jerarquía de autoridad

1. instrucciones/decisiones expresas del propietario;
2. ADR aceptados;
3. SRS/PRD/requisitos v3;
4. arquitectura/documentación vigente;
5. código real;
6. pruebas verificables;
7. informes;
8. conversaciones anteriores.

El código demuestra implementación; no puede cambiar un requisito aprobado por sí solo.

## Cambios principales respecto de 2.0

- 1 envío → N PED.
- se elimina `servicios_solicitados` como agregado operativo nuevo.
- 8 categorías.
- PED con código D/C/G/R/P/M/S/W y secuencia global anual.
- 6 estados.
- responsable obligatorio para En revisión.
- Admin/Equipo/Observador.
- Dashboard + Board/Table + Archivo.
- Google Drive en lugar de Supabase Storage.
- 10 archivos × 10 MB + link.
- material general/específico.
- correo inicial agrupado.
- cambios posteriores por PED.
- entrega versionada.
- cancelación/reapertura auditada.

## Reglas para agentes

Antes de modificar código:
- leer PRD, SRS, Arquitectura y documento específico;
- inspeccionar implementación real;
- cambios mínimos;
- no reintroducir modelo v2;
- no secretos frontend;
- no n8n en ruta crítica;
- no Drive público;
- tests;
- reportar archivos modificados.

## OPEN vigentes

Ver documento 17. No cerrar por inferencia.

## Estado

Revisión 3.0 = especificación actualizada. Implementación = NO VERIFICADA.

## Repositorios

Implementación: `https://github.com/drivegobtdf/formulariomedios`  
Auditoría WeWeb: `https://github.com/saldiviapablo/formulariopedidos`

## Fuentes técnicas oficiales

- https://developer.wordpress.org/
- https://supabase.com/docs/
- https://developers.google.com/workspace/drive/api/
- https://developers.google.com/identity/protocols/oauth2/
