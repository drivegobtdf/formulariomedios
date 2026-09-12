# PEDIDOS — Índice maestro de fuentes · revisión 3.0

**Fecha:** 2026-09-11. **Arquitectura:** `PEDIDOS-WSN-GD-v2`.  
**Estado:** documentación funcional/técnica actualizada; implementación no verificada.

## Invariante

```text
1 envío = 1..N PED
1 pieza/servicio = 1 PED
```

## Decisiones principales

- 8 categorías con códigos D/C/G/R/P/M/S/W.
- secuencia global anual: `PED-YYYY-CNNNNNN`;
- estados: Nuevo, En revisión, En proceso, Esperando información, Finalizado, Cancelado;
- responsable obligatorio antes de En revisión;
- roles Administrador, Equipo y Observador;
- Google Drive para binarios; Supabase para metadata/permisos;
- 10 archivos × 10 MB; link opcional;
- archivo/link general o específico cuando un envío tiene varios PED;
- un correo inicial con todos los PED; correos posteriores por PED;
- Dashboard + Tablero + Tabla + Archivo;
- archivado reversible sin borrar.

## Los nueve archivos de FUENTES_WORK

| Archivo | Contenido |
|---|---|
| `00_INDICE_MAESTRO.md` | Este índice |
| `01_PRODUCTO_REQUISITOS_Y_UX.md` | PRD, SRS, RF, flujos, UX, formulario |
| `02_ARQUITECTURA_Y_DECISIONES.md` | Arquitectura, API, ADR/OPEN |
| `03_SUPABASE_BACKEND_Y_DATOS.md` | PostgreSQL, Auth/RLS, RPC/Edge, Drive |
| `04_WORDPRESS_PLUGIN_E_INTEGRACION.md` | Plugin y baseline receptor |
| `05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md` | Eventos, seguridad, entornos |
| `06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md` | QA, plan, migración, trazabilidad |
| `07_DOCUMENTACION_COMPLEMENTARIA.md` | README |
| `MANIFEST_FUENTES_WORK.md` | hashes e integridad |

## Correspondencia canónica

Los 23 documentos canónicos están en `DOCUMENTOS_CANONICOS/`. Los consolidados se generan desde ellos; **no editar ambos juegos independientemente**.

## Jerarquía

Propietario → ADR → SRS/PRD → arquitectura → código → pruebas → informes → conversaciones anteriores.

## OPEN vigentes

OPEN-002, 003, 008, 009, 010, 011, 012, 013, 014, 015 y 016.  
OPEN-001 se cierra por el nuevo modelo de estado. OPEN-005/006/007 quedan cerrados en lo principal, con subtemas trasladados a nuevos OPEN.

## Baseline receptor

Se conserva como DOCUMENTADO: WP 7.0.2, PHP 8.2.31, Betheme 28.5.7, Elementor 4.2.3/Pro 3.33.1, ElementsKit, Wordfence y WP Super Cache. Reconfirmación obligatoria antes de release.
