# PEDIDOS — Índice maestro de fuentes · revisión 2.0

**Fecha:** 2026-09-11. **Arquitectura:** PEDIDOS-WSN-SC-v1 (WSN-SC).
**Dictamen de preparación:** APTO CON CORRECCIONES. Documentación revisada; decisiones funcionales y verificación pendientes. No iniciar implementación sin aprobación y gates.

## Lectura rápida
1 envío = 1 PED; 1 PED = 1..N servicios. WordPress aloja interfaz/plugin; Supabase es fuente de verdad y seguridad; n8n procesa comunicaciones asíncronas. MySQL WordPress no almacena negocio. No cambia el stack.

Se conserva baseline receptor DOCUMENTADO: WP 7.0.2, PHP 8.2.31, Betheme 28.5.7, Elementor 4.2.3/Pro 3.33.1, ElementsKit, Wordfence y WP Super Cache. No se verificó el servidor en esta revisión.

## Qué cambió
- Tokens: hash para validación y sobre cifrado temporal para entrega; ADR-028 ampliada expresamente.
- Emails: evento y entrega separados, reclamación, proveedor idempotente/reconciliación; no promesas de entrega única sin evidencia.
- Archivos: reservas verificadas y asociación autorizada, limpieza coordinada.
- Permisos: matriz RPC/Edge y denegación de bypass; concurrencia con conflictos explícitos.
- Plan: F0–F12, dependencias adelantadas y pruebas transversales.
- Fuentes: jerarquía coherente, trazabilidad individual planificada, hashes actuales y pendientes visibles.

## Los nueve archivos para Fuentes
| Archivo | Contenido |
|---|---|
| [00_INDICE_MAESTRO.md](00_INDICE_MAESTRO.md) | Este índice y correspondencias |
| [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) | PRD/SRS/RF, flujos, UX y campos |
| [02_ARQUITECTURA_Y_DECISIONES.md](02_ARQUITECTURA_Y_DECISIONES.md) | Arquitectura, API, ADR-001..036 y OPEN-001..012 |
| [03_SUPABASE_BACKEND_Y_DATOS.md](03_SUPABASE_BACKEND_Y_DATOS.md) | Modelo, Auth/RLS, RPC/Edge y Storage |
| [04_WORDPRESS_PLUGIN_E_INTEGRACION.md](04_WORDPRESS_PLUGIN_E_INTEGRACION.md) | Plugin y baseline receptor |
| [05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md](05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md) | Queues, emails, seguridad y recuperación |
| [06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md](06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md) | QA, F0–F12, migración y matrices |
| [07_DOCUMENTACION_COMPLEMENTARIA.md](07_DOCUMENTACION_COMPLEMENTARIA.md) | README, autoridad, estado e instrucciones |
| [MANIFEST_FUENTES_WORK.md](MANIFEST_FUENTES_WORK.md) | Integridad, versión y cobertura de archivos |

## Correspondencias de las instrucciones del Proyecto
Las referencias a archivos originales siguen siendo válidas como secciones de los consolidados. Los documentos canónicos revisados están también en el ZIP.

| Original | Consolidado |
|---|---|
| `00_PRD.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `00A_SRS.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `02_REQUISITOS_FUNCIONALES.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `03_FLUJOS_USUARIO.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `04_UI_UX_Y_PANTALLAS.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md` | [01_PRODUCTO_REQUISITOS_Y_UX.md](01_PRODUCTO_REQUISITOS_Y_UX.md) |
| `01_ARQUITECTURA_OFICIAL.md` | [02_ARQUITECTURA_Y_DECISIONES.md](02_ARQUITECTURA_Y_DECISIONES.md) |
| `11_API_Y_CONTRATOS.md` | [02_ARQUITECTURA_Y_DECISIONES.md](02_ARQUITECTURA_Y_DECISIONES.md) |
| `17_DECISIONES_ARQUITECTURA_ADR.md` | [02_ARQUITECTURA_Y_DECISIONES.md](02_ARQUITECTURA_Y_DECISIONES.md) |
| `05_MODELO_DATOS_SUPABASE.md` | [03_SUPABASE_BACKEND_Y_DATOS.md](03_SUPABASE_BACKEND_Y_DATOS.md) |
| `06_AUTENTICACION_RBAC_RLS.md` | [03_SUPABASE_BACKEND_Y_DATOS.md](03_SUPABASE_BACKEND_Y_DATOS.md) |
| `07_RPC_EDGE_FUNCTIONS.md` | [03_SUPABASE_BACKEND_Y_DATOS.md](03_SUPABASE_BACKEND_Y_DATOS.md) |
| `08_STORAGE_ARCHIVOS.md` | [03_SUPABASE_BACKEND_Y_DATOS.md](03_SUPABASE_BACKEND_Y_DATOS.md) |
| `10_PLUGIN_WORDPRESS.md` | [04_WORDPRESS_PLUGIN_E_INTEGRACION.md](04_WORDPRESS_PLUGIN_E_INTEGRACION.md) |
| `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md` | [04_WORDPRESS_PLUGIN_E_INTEGRACION.md](04_WORDPRESS_PLUGIN_E_INTEGRACION.md) |
| `09_EVENTOS_QUEUES_N8N.md` | [05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md](05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md) |
| `12_SEGURIDAD.md` | [05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md](05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md) |
| `13_ENTORNOS_SECRETOS_DESPLIEGUE.md` | [05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md](05_N8N_SEGURIDAD_ENTORNOS_Y_DESPLIEGUE.md) |
| `14_PRUEBAS_QA_ACEPTACION.md` | [06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md](06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md) |
| `15_PLAN_IMPLEMENTACION.md` | [06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md](06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md) |
| `16_MIGRACION_WEWEB.md` | [06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md](06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md) |
| `18_TRAZABILIDAD.md` | [06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md](06_QA_IMPLEMENTACION_MIGRACION_Y_TRAZABILIDAD.md) |
| `README.md` | [07_DOCUMENTACION_COMPLEMENTARIA.md](07_DOCUMENTACION_COMPLEMENTARIA.md) |

## Jerarquía y estados
Instrucciones del propietario → ADR aprobados → PRD/SRS/requisitos aprobados → documentación vigente → código → pruebas → informes → conversaciones anteriores. El repositorio muestra implementación, no puede aprobar por sí solo un cambio de requisito.

VERIFICADO = observado directamente; DOCUMENTADO = afirmado por una fuente; INFERIDO = conclusión razonada; NO VERIFICADO = evidencia insuficiente. Los QA y diseños nuevos no son pruebas ejecutadas. El repositorio se observó vacío en la auditoría de esta conversación; no se publicó esta revisión en GitHub.

## Pendientes que deben permanecer visibles
OPEN-001 estados; OPEN-005 formulario/adjuntos/entregas; OPEN-006 identidad/permisos; OPEN-007 destinatarios/avisos. OPEN-002 Notion puede seguir fuera del núcleo. OPEN-003 privacidad/retención, OPEN-008 staging, OPEN-009 proveedor y OPEN-011 operación se cierran antes de sus gates. OPEN-010 herramientas y OPEN-012 parámetros se resuelven antes de implementar funciones dependientes. OPEN-004 está resuelto documentalmente para desarrollo.

## Cobertura real
23 documentos originales revisados incluidos una vez en siete consolidados; índice y manifiesto completan nueve fuentes. Se conservan identificadores SRS/RF previos. Hay 22 casos QA funcionales iniciales, nueve de compatibilidad y 35 adicionales; todos planificados. La matriz conecta requisitos individuales con suites previstas, no demuestra cobertura ejecutada ni aprobación de implementación.

## Sustitución
Usar los nueve archivos nuevos de FUENTES_WORK. Retirar de las fuentes activas las versiones anteriores para evitar contradicciones. No cargar además los canónicos duplicados. Guardar/reemplazar el archivo no garantiza actualizar una instantánea del Proyecto: comprobar que la fuente visible indique revisión 2.0. No publicar código ni comenzar desarrollo por la mera sustitución de documentos.
