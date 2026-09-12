# 15 — Plan de implementación · revisión 2.0

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Arquitectura:** PEDIDOS-WSN-SC-v1. **Repositorio:** https://github.com/drivegobtdf/formulariomedios
**Estado:** Plan documental revisado; no constituye permiso de implementación. Cada fase requiere aprobación y gate. No repetir auditoría general WeWeb.

## Fases y gates
| Fase | Trabajo | Dependencias | Gate / evidencia requerida |
|---|---|---|---|
| F0 Cierre documental | Revisión 2.0, decisiones, contratos y alcance de primera entrega | Aprobación del propietario | OPEN afectados resueltos, requisitos/QA concretos; QA-AUD-032. Esta revisión completa la edición, no cierra todos los OPEN |
| F1 Entorno/repositorio | Publicar base documental autorizada, skeleton, CLI/Docker, herramientas y CI | F0; OPEN-010 | Entorno reproducible, versiones/lockfiles, sin secretos; sin pagos nuevos obligatorios para núcleo |
| F2 Integración temprana WordPress | Shortcode, app shell, rutas, assets, montaje y configuración pública | F1; acceso a entorno de ensayo | QA-COMP inicial + QA-AUD-021; pila real/representativa pendiente OPEN-008 |
| F3 Datos/Auth/RLS | Modelo, catálogos, constraints, perfiles, primer admin y RPC permitidas | F1; reglas aplicables OPEN-005/006 | Reset reproducible, integridad y matriz RLS; QA-AUD-012..017/035 |
| F4 Eventos y tokens | Queue durable, ledger, sobres, emisión/canje y operaciones idempotentes | F3; OPEN-012 y política necesaria OPEN-007 | Commit incluye eventos; hash/sobre/privacidad y replay comprobados; QA-AUD-001..004/018 |
| F5 Storage | Sesiones, reservas, uploads/TUS, verificación, asociación y limpieza | F3; OPEN-005/012 | QA-016..018 + QA-AUD-009..011 |
| F6 Formulario completo | Wizard, contratos, creación PED multiservicio/adjuntos y confirmación | F2..F5; contratos funcionales cerrados | QA-001..005 + QA-AUD-003/004/025; 1 envío = 1 PED completo |
| F7 n8n | Consumo, plantilla, proveedor, claims, reintentos y reconciliación | F4; OPEN-007/009; inicialmente mock | QA-015 + QA-AUD-005..008/020/027/030; proveedor real validado antes de gate productivo |
| F8 Seguimiento/información | Tracking, recuperación y respuestas con archivos | F4..F7; parámetros/contratos cerrados | QA-008/009/014 + QA-AUD-001/009/018 |
| F9 Gestión y administración UI | Kanban/tabla, filtros, detalle, estados, responsables, entregas, roles | F3/F8; OPEN-001/005/006 | Paridad, permisos, concurrencia y transiciones completas; QA-AUD-015/016/026 |
| F10 QA y ensayo de migración | Accesibilidad, capacidad, seguridad integral, mappings, restore, staging | Funciones anteriores; OPEN-003/008/011 | QA-COMP completo + QA-AUD-022..034 aplicables, UAT y migración reconciliada |
| F11 Release/cutover | ZIP reproducible, guía, backup, freeze, delta, secuencia, instalación, smoke y observación | F10 aprobado | Sin pérdida de operaciones, rollback ensayado y responsables de monitoreo |
| F12 Retiro WeWeb | Export final, cierre de convivencia/retorno | Ventana de estabilidad y aprobación explícita | Reconciliación final y cierre de rollback; no borrar prematuramente |

## Correspondencia con plan anterior
| Anterior | Nuevo |
|---|---|
| F0 y F0B | F0; baseline de compatibilidad se conserva como DOCUMENTADO |
| F1 | F1 |
| F2 y F3 | F3; esquema nace con permisos restrictivos |
| F4 | F2, adelantada para reducir riesgo de integración |
| F5 | F6, después de colas/tokens/Storage |
| F6 | F5 |
| F7 | F8 |
| F8 y F9 | F9; backend admin básico existe en F3 |
| F10 | Infraestructura F4 y consumidor F7 |
| F11 | Seguridad desde cada frontera; verificación integral F10 |
| F12 | Preparación de mapping temprana, ensayo completo F10 |
| F13 | F11 |
| F14 | F12 |

## Orden y límites
Seguridad, rate limiting, CORS, pruebas y documentación acompañan cada fase; no se difieren hasta hardening. Enqueue durable existe antes de confirmar un PED. Storage y su asociación existen antes de considerar completo el formulario. No introducir un stub permisivo en una frontera pendiente.

F0 no necesita contratar proveedor para editar documentación, pero F7 productiva no se cierra sin capacidad verificada. Notion no bloquea núcleo. Retención no bloquea desarrollo con datos sintéticos, sí datos reales. La máquina de estados no se implementa sin OPEN-001. Preparar mapa de migración no exige reauditar WeWeb completo.

## Definition of Ready y Done
Ready: requisito, contrato, permisos, errores, datos, QA y decisiones dependientes cerradas. Done: cambios mínimos revisados, pruebas significativas verdes, evidencia negativa de permisos, migración reproducible, documentación/ADR/trazabilidad actualizadas, Git identificado y sin secretos. No considerar Done por informe narrativo de agente.

La aprobación de esta documentación no implica que una fase de implementación se haya ejecutado ni aprobado. Antes de cada cambio real inspeccionar archivos, flujo, dependencias, riesgos y reglas del repositorio.
