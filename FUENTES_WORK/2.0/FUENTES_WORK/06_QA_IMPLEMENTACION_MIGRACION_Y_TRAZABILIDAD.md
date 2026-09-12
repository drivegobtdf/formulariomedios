# PEDIDOS — QA, implementación, migración y trazabilidad

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `14_PRUEBAS_QA_ACEPTACION.md`
- `15_PLAN_IMPLEMENTACION.md`
- `16_MIGRACION_WEWEB.md`
- `18_TRAZABILIDAD.md`

---

# DOCUMENTO: 14_PRUEBAS_QA_ACEPTACION.md

# 14 — Pruebas, QA y criterios de aceptación

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Capas
- unitarias: validadores, formatters y helpers;
- PostgreSQL: funciones, constraints e idempotencia;
- RLS: allow/deny;
- Edge: HTTP, seguridad y contratos;
- frontend: componentes/formularios;
- E2E: recorridos;
- migración: reconciliación;
- UAT: equipo real sobre staging.

## 2. Casos críticos
| ID | Caso | Esperado |
|---|---|---|
| QA-001 | envío con 1 servicio | 1 PED + 1 servicio |
| QA-002 | envío con 3 servicios | 1 PED + 3 servicios |
| QA-003 | doble clic | 1 PED |
| QA-004 | retry mismo `submission_key` | mismo PED |
| QA-005 | concurrencia | PED únicos |
| QA-006 | Cancelado sin motivo | rechazado |
| QA-007 | Finalizado sin HTTPS válido | rechazado |
| QA-008 | solicitar información | no cambia estado PED/servicio |
| QA-009 | token info vencido | no permite responder |
| QA-010 | pending user | no gestión |
| QA-011 | revoked user | no gestión |
| QA-012 | equipo intenta admin | denegado |
| QA-013 | anon intenta leer PED | denegado |
| QA-014 | tracking token incorrecto | respuesta neutra |
| QA-015 | n8n caído | negocio persiste + evento pendiente |
| QA-016 | tipo archivo inválido | rechazado |
| QA-017 | archivo >25 MB | rechazado |
| QA-018 | signed URL expirada | denegado |
| QA-019 | Kanban | agrupa por estado servicio |
| QA-020 | tabla | consolida por PED |
| QA-021 | username duplicado | conflicto |
| QA-022 | username formato inválido | rechazado |

## 3. RLS
Probar cada recurso como:
- anon;
- authenticated pending;
- authenticated equipo;
- admin;
- revoked.

Cada policy requiere caso positivo y negativo.

## 4. State machine
Probar todas las transiciones documentadas y varias inválidas. La automatización de estado general mixto no se testea como definitiva hasta resolver `OPEN-001`.

## 5. Archivos
- max 5;
- extensiones;
- MIME;
- 25 MB;
- signed upload;
- asociación DB;
- orphan cleanup;
- download autorizado;
- path guessing;
- expiración URL.

## 6. Auth
- signup;
- login/logout;
- pending;
- approve;
- revoke durante sesión;
- admin;
- sesión expirada.

## 7. Eventos
En staging/mock:
- enqueue;
- consume;
- send;
- ack;
- retry;
- max attempts;
- redelivery con mismo `event_id`.

No enviar emails reales desde tests automatizados.

## 8. Frontend
Wizard:
- next/back conserva datos;
- campos dinámicos;
- errores accesibles;
- loading;
- timeout;
- retry idempotente.

Gestión:
- filtros;
- Kanban/tabla;
- detalle;
- acciones permitidas;
- errores;
- responsive.

## 9. Accesibilidad
- teclado;
- foco;
- labels;
- errores anunciados;
- contraste;
- no color-only;
- modal focus trap.

## 10. Browsers
Chrome, Firefox, Edge y Safari si corresponde al público objetivo.

## 11. UAT
En staging, el equipo valida:
- pedido multservicio;
- gestión;
- responsables;
- estados;
- información faltante;
- entrega;
- administración.

## 12. Release gate
No producción con:
- falla RLS crítica;
- duplicación PED;
- pérdida de archivos;
- secrets en bundle;
- migration no ensayada;
- fallo P0/P1 sin aceptar.


## Repositorios y procedencia

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`

**Repositorio fuente de la auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Branch de auditoría:** `audit/current-weweb-2026-09-10`  
**Commit QA de referencia:** `0efb624`

El repositorio oficial del desarrollo es el único destino previsto para el código nuevo, documentación de implementación, plugin WordPress, migraciones Supabase, pruebas y workflows versionados. El repositorio de auditoría se conserva como evidencia del sistema WeWeb original y no debe confundirse con el repositorio de implementación.

## Documentación técnica oficial

- WordPress Developer Resources: `https://developer.wordpress.org/`
- Supabase Docs: `https://supabase.com/docs/`

La documentación histórica anterior a la auditoría se utiliza solo como referencia cuando no contradice la evidencia current-state.

## 13. Matriz de compatibilidad WordPress receptor

| ID | Caso | Esperado |
|---|---|---|
| QA-COMP-001 | WP 7.0.2 + PHP 8.2.31 | plugin carga sin error |
| QA-COMP-002 | página Elementor | app se monta una sola vez |
| QA-COMP-003 | preview/editor Elementor | sin listeners/requests duplicados |
| QA-COMP-004 | Betheme + ElementsKit | sin colisiones CSS críticas |
| QA-COMP-005 | Wordfence activo | flujos válidos funcionan |
| QA-COMP-006 | WP Super Cache activo | assets de release actual |
| QA-COMP-007 | header/footer | permanecen funcionales |
| QA-COMP-008 | frontend → Supabase | HTTPS exitoso |
| QA-COMP-009 | móvil en Elementor | sin overflow crítico |

Estas pruebas son obligatorias antes de entregar el ZIP.

## 14. Estado de las pruebas
Todos los QA de esta documentación son CASOS PLANIFICADOS. No hay código/pruebas ejecutadas ni resultados de implementación verificables en el repositorio inspeccionado. No interpretar “esperado” como “observado”.

## 15. Casos adicionales derivados de la auditoría
| ID | Escenario | Acción y resultado esperado | Estado |
|---|---|---|---|
| QA-AUD-001 | Token durable | Crear info/recuperación, detener consumidor y reanudarlo: enlace correcto tras commit, solo hash en tablas operativas, sobre privado y ningún raw en logs. | PLANIFICADO |
| QA-AUD-002 | Sobre cifrado | Alterar ciphertext/AAD/contexto: descifrado denegado; rotar claves de modo controlado y verificar vencimiento/eliminación sin perder entregas válidas. | PLANIFICADO |
| QA-AUD-003 | Respuesta perdida creación | Confirmar commit y perder HTTP; retry autorizado misma clave/carga devuelve mismo PED sin rotar token ni repetir eventos; UI ofrece recuperación. | PLANIFICADO |
| QA-AUD-004 | Conflicto idempotente | Misma clave con distinta carga produce 409; peticiones simultáneas iguales producen un PED y resultado estable. | PLANIFICADO |
| QA-AUD-005 | Proveedor aceptó, ledger falló | Inyectar fallo después de aceptación: reconciliar por identidad estable; no reenvío ciego y uncertain si falta evidencia. | PLANIFICADO |
| QA-AUD-006 | Workers concurrentes | Dos consumidores/lease vencida: solo claim vigente modifica ledger; ACK antiguo rechazado y misma identidad externa durante horizonte válido. | PLANIFICADO |
| QA-AUD-007 | ACK perdido | Guardar sent y perder respuesta ACK: redelivery archiva sin emitir de nuevo. Ensayar timeout antes y después del commit del ledger. | PLANIFICADO |
| QA-AUD-008 | Horizonte proveedor | Reintento después del horizonte o resultado irrecuperable queda uncertain/failed con alerta, sin falsa garantía de no duplicados. | PLANIFICADO |
| QA-AUD-009 | Reserva ajena | Intentar asociar archivo de otra sesión/PED/info request: denegado aunque se conozca el path. | PLANIFICADO |
| QA-AUD-010 | Verificación binaria | MIME declarado falso, tamaño distinto, reserva incompleta o sobrecupo: rechazo antes de vincular; objeto válido se consume una vez. | PLANIFICADO |
| QA-AUD-011 | TUS y limpieza | Carga activa al borde del plazo y creación concurrente con cleanup: no se pierde objeto válido/asociado; huérfano vencido se elimina con trazabilidad. | PLANIFICADO |
| QA-AUD-012 | Bypass de Edge | Llamar RPC server-only como anon/authenticated/pending/admin por Data API: siempre denegado; Edge autorizada sí puede ejecutar operación válida. | PLANIFICADO |
| QA-AUD-013 | RLS por superficie | Cada tabla/view/RPC/columna sensible y Storage: allow/deny con anon, sin perfil, pendiente, aprobado equipo/admin y revocado. | PLANIFICADO |
| QA-AUD-014 | Integridad cruzada | Insertar relaciones área/tipo, servicio/PED e info/archivo incompatibles por operaciones autorizadas: rechazo; no permitir PED sin servicio. | PLANIFICADO |
| QA-AUD-015 | Edición concurrente | Dos operadores con misma versión: uno aplica; otro obtiene conflicto y conserva cambios locales para revisión, sin pérdida silenciosa. | PLANIFICADO |
| QA-AUD-016 | Auth/perfil | Signup parcial, username simultáneo, metadata de rol maliciosa, login/logout, callbacks y reset: sin acceso accidental ni escalada. | PLANIFICADO |
| QA-AUD-017 | Revocación viva | Revocar durante sesión: lecturas, RPC, Edge elevada y nuevas firmas quedan denegadas; documentar vida residual de capacidades emitidas. | PLANIFICADO |
| QA-AUD-018 | Scanners y canje | GET de enlace no consume; POST repetido no duplica acción; recuperación no rota hasta canje y no reabre token consumido. | PLANIFICADO |
| QA-AUD-019 | Rate limiting | Solicitudes desde varias instancias/clientes cuentan en un límite compartido; CORS no sirve como autorización; política no se evade con retry. | PLANIFICADO |
| QA-AUD-020 | Privacidad de ejecución | Inspeccionar export/logs/ejecuciones n8n manuales, exitosas y fallidas, frontend y auditoría: sin secretos ni enlaces portadores persistidos. | PLANIFICADO |
| QA-AUD-021 | Routing y montaje | Recarga de subrutas, canonical redirects, atrás/adelante, nodo Elementor reemplazado y editor: sin pérdida de ruta ni listeners/envíos duplicados. | PLANIFICADO |
| QA-AUD-022 | Versiones y ZIP | Instalar limpio, actualizar y volver al ZIP previo con backend compatible; assets correctos con caché y error explícito ante contrato incompatible. | PLANIFICADO |
| QA-AUD-023 | Backup/restore | Restaurar DB y objetos, validar relaciones/privacidad, configuración necesaria y ausencia de reenvío de eventos históricos. | PLANIFICADO |
| QA-AUD-024 | Rollback de ventana | Crear/modificar PED y archivos durante corte simulado; retornar sin perder operaciones ni reutilizar PED; reconciliar secuencia. | PLANIFICADO |
| QA-AUD-025 | Contrato de campos | Por cada campo y versión aprobada: obligatorios, máximos, enum, fechas, zona, selección dinámica, errores y ejemplos inválidos coinciden UI/backend. | PLANIFICADO |
| QA-AUD-026 | Estados completos | Por cada transición aprobada: actor, precondición, efecto general, reapertura, asignación y entrega; matriz pendiente bloquea ejecución definitiva. | PLANIFICADO |
| QA-AUD-027 | Notificaciones | Cada evento produce solo destinatarios y plantilla aprobados, varias entregas independientes, payload estable en retry y aviso obsoleto según regla. | PLANIFICADO |
| QA-AUD-028 | Accesibilidad | Teclado, foco, contraste, lector de pantalla, modal, errores anunciados, móvil y progreso: evidencia contra criterios WCAG acordados. | PLANIFICADO |
| QA-AUD-029 | Carga representativa | Listados paginados, filtros, índices y numeración concurrente con volumen/meta definidos: registrar latencias y consumo, sin porcentaje de rendimiento inventado. | PLANIFICADO |
| QA-AUD-030 | Observabilidad | Fallar consumidor/proveedor/Storage y producir dead-letter: alerta correlacionada llega al responsable, recuperación documentada sin duplicar negocio. | PLANIFICADO |
| QA-AUD-031 | Migración granular | Reconciliar campo/ID/estado/responsable/archivo y usuarios; no importar perfiles antes de Auth ni disparar comunicaciones históricas. | PLANIFICADO |
| QA-AUD-032 | Integridad documental | Cada requisito original sigue presente, links/manifiesto resuelven, hashes coinciden y OPEN/ADR/plan no afirman implementación inexistente. | PLANIFICADO |
| QA-AUD-033 | Parámetros | TTL, tamaño exacto, cooldown, visibilidad, backoff y límites están versionados, aprobados según impacto y probados en sus fronteras. | PLANIFICADO |
| QA-AUD-034 | Gobernanza y exposición | Validar política de PII/retención, usuarios de operación, limpieza/backs y contextos de archivos; no habilitar datos reales sin decisión institucional. | PLANIFICADO |
| QA-AUD-035 | Separación arquitectónica | Revisar plugin/DB/eventos: no tablas wp_pedidos, no permisos por wp_users, no secreto en bundle, n8n no decide commit ni autorización. | PLANIFICADO |

## 16. Herramientas y evidencia
Propuesta técnica para fijar en OPEN-010: pgTAP o harness SQL equivalente para integridad/RLS; Vitest para lógica TypeScript; Playwright para E2E; pruebas PHP/integración WordPress pertinentes. Son herramientas propuestas, no instaladas ni verificadas. Elegir las mínimas que cubran riesgos sin tests que solo reproduzcan implementación.

Cada resultado debe registrar requisito, versión/commit, entorno, setup, comando, datos sintéticos, esperado, observado, evidencia y estado PASS/FAIL/BLOCKED. Gates de seguridad incluyen casos negativos. Un OPEN relacionado produce BLOCKED, nunca PASS. La cobertura trazada a un caso no demuestra que este se haya ejecutado.

## 17. Criterio de release ampliado
No cerrar release con bypass RPC, archivo cruzado, pérdida de cambio concurrente, pérdida de objetos al restaurar, token expuesto, correo reenviado a ciegas o compatibilidad no ensayada. RLS, idempotencia, archivo privado y ausencia de secretos son obligatorios. No aprobar fallas críticas por silencio; cualquier aceptación excepcional de riesgo se registra con alcance y autorización.

La excepción de entorno WordPress exige aprobación explícita y evidencia sobre réplica representativa; no elimina staging de migración. La matriz exacta de versiones se adjunta a cada release del plugin.

# FIN DOCUMENTO: 14_PRUEBAS_QA_ACEPTACION.md


---

# DOCUMENTO: 15_PLAN_IMPLEMENTACION.md

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

# FIN DOCUMENTO: 15_PLAN_IMPLEMENTACION.md


---

# DOCUMENTO: 16_MIGRACION_WEWEB.md

# 16 — Migración desde WeWeb

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Objetivo
**Origen documental/auditoría:** `https://github.com/saldiviapablo/formulariopedidos`  
**Destino de implementación y migraciones:** `https://github.com/drivegobtdf/formulariomedios`

Migrar el sistema actual a WSN-SC manteniendo PED visibles, relaciones, estados, usuarios necesarios, archivos y continuidad operativa.

La fuente es la auditoría current-state, no el handoff MySQL histórico.

## 2. Mapeo
| WeWeb actual | Supabase objetivo |
|---|---|
| `pedidos` | `pedidos` |
| `servicios_solicitados` | `servicios_solicitados` |
| `solicitudes_informacion` | `solicitudes_informacion` |
| `comunicaciones_pedido` | `comunicaciones_pedido` |
| `archivos` | `archivos` + Storage |
| `secuencias` | `pedido_sequences` |
| `usuarios_acceso` | `usuarios_acceso` |
| `areas` | `areas` |
| `tipos_servicio` | `tipos_servicio` |
| `configuracion` | env/seed/solo tabla si se justifica |

Notion queda fuera salvo `OPEN-002`.

## 3. PED
Conservar `pedido_visible` exactamente.

Antes de habilitar creación nueva:
- calcular máximo por año;
- inicializar `pedido_sequences.current_value`;
- verificar que nunca genere un número existente.

## 4. Multiservicio
Reconciliar:
- todo pedido tiene >=1 servicio;
- cada servicio apunta a pedido válido;
- **no crear un PED nuevo por servicio** durante transformación.

Esta es una prueba crítica por el error histórico previo.

## 5. Auth
No asumir que hashes/passwords de WeWeb son migrables. Preparar inventario de identidades y mapa old_id → nuevo Auth UUID antes de importar FKs.

Orden seguro: crear/invitar identidad Supabase por canal administrativo; crear/vincular perfil con estado/rol revisados; importar responsables y actores mediante mapa; establecer/resetear password; validar acceso. No insertar perfiles con FK a identidades que aún no existen. No poner PII o credenciales en seeds del repositorio.

Migrar hashes solo con compatibilidad oficialmente demostrada. Ensayar colisiones de username/email, cuentas faltantes, responsables históricos revocados y el primer admin. No autorizar acceso como efecto implícito de importar una fila.

## 6. Tokens
No copiar raw tokens por conveniencia.
- PED visible se conserva.
- emitir/rotar tracking token nuevo cuando corresponda.
- requests info activas: conservar hash solo si contrato compatible; si no, reemitir acceso.

## 7. Storage
1. inventario metadata;
2. copiar a bucket privado;
3. validar size/MIME;
4. insertar metadata;
5. reconciliar conteos/checksum cuando sea posible;
6. no conservar URL pública permanente.

## 8. Comunicaciones
Migrar histórico que tenga valor operativo/auditor. No encolar mensajes históricos como nuevos.

## 9. Estados
Mapeo inicial uno-a-uno. No “normalizar” estados de producción sin regla aprobada.

## 10. Notion
Si se elimina: no sincronizar en v1.  
Si se mantiene: consumidor asíncrono posterior al core.

## 11. Ensayo staging
Reconciliar:
- conteos;
- PED únicos;
- servicios por PED;
- estados;
- responsables;
- info requests;
- archivos;
- usuarios;
- secuencia.

## 12. Cutover
1. anunciar;
2. backup;
3. freeze writes WeWeb si es posible;
4. export delta;
5. importar delta;
6. fijar sequence;
7. activar WordPress;
8. smoke test;
9. monitor.

## 13. Rollback
Preparar antes del cutover un registro de la ventana y responsables. Si hay falla, congelar escrituras en ambos lados, conservar operaciones nuevas y determinar si basta volver al ZIP anterior con backend compatible. Volver a WeWeb requiere reconciliar PED, servicios, respuestas, archivos y usuarios creados/modificados durante la ventana; no restaurar simplemente un backup que los borre.

No reutilizar números PED ya asignados. Reconciliar secuencias, eventos procesados y enlaces emitidos; evitar emails repetidos. Probar el procedimiento con datos sintéticos y con el ensayo autorizado de migración. Cerrar rollback solo después de la ventana de estabilidad y aprobación del propietario.

## 14. Retiro
No eliminar WeWeb inmediatamente. Conservarlo durante una ventana acordada de consulta/rollback y realizar export final.


## Repositorios y procedencia

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`

**Repositorio fuente de la auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Branch de auditoría:** `audit/current-weweb-2026-09-10`  
**Commit QA de referencia:** `0efb624`

El repositorio oficial del desarrollo es el único destino previsto para el código nuevo, documentación de implementación, plugin WordPress, migraciones Supabase, pruebas y workflows versionados. El repositorio de auditoría se conserva como evidencia del sistema WeWeb original y no debe confundirse con el repositorio de implementación.

## Documentación técnica oficial

- WordPress Developer Resources: `https://developer.wordpress.org/`
- Supabase Docs: `https://supabase.com/docs/`

La documentación histórica anterior a la auditoría se utiliza solo como referencia cuando no contradice la evidencia current-state.

## 15. Requisitos del WordPress receptor para cutover

Antes del cutover:
- reconfirmar versiones de WordPress/PHP/Elementor;
- confirmar ensayo staging y ventana controlada con rollback; una réplica WP exige aprobación explícita y no elimina ensayo de migración;
- invalidar WP Super Cache tras instalar una nueva versión;
- smoke test con Wordfence activo;
- validar `/formulariomedios` con header/footer real.

## 16. Mapeo previo obligatorio
No repetir auditoría general WeWeb. Usar evidencia current-state ya aceptada para construir mapeo columna → columna, transformaciones, IDs preservados/remapeados, validación de casos excepcionales y procedencia. Verificar puntualmente solo vacíos reales. El commit QA 0efb624 es referencia DOCUMENTADA; esta revisión no reabrió esa auditoría.

Para cada tabla: conteo inicial/final, claves únicas, FKs, nulos, estados, responsables, versiones de formulario y casos no migrables. Para Storage: copia real, checksum cuando sea viable y prueba de descarga autorizada. No copiar enlaces públicos como sustituto del objeto privado. Las excepciones tienen resolución aprobada, nunca eliminación silenciosa.

No emitir nuevos eventos por importar historia. Los mensajes de transición/cutover definidos por negocio son operaciones nuevas identificadas aparte. Freeze efectivo, delta y revalidación de secuencia son requisitos; si no es posible congelar, diseñar captura del delta antes de autorizar el corte.

# FIN DOCUMENTO: 16_MIGRACION_WEWEB.md


---

# DOCUMENTO: 18_TRAZABILIDAD.md

# 18 — Trazabilidad

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

## 0. SRS como contrato verificable

`00A_SRS.md` es la capa formal entre PRD y diseño técnico. Los requisitos `SRS-*`
deben vincularse a implementación y pruebas antes de cerrar cada feature.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Matriz

| Función | Requisito | Diseño | Datos | Operación | QA |
|---|---|---|---|---|---|
| Wizard | RF-PUB-* | 03/04 | pedidos/servicios | create-pedido | QA-001..005 |
| 1 PED N servicios | RF-PED-* | 01/05 | pedidos→servicios | pedidos_create | QA-001..005 |
| Seguimiento | RF-SEG-* | 07/12 | tracking hash | tracking-get | QA-014 |
| Información faltante | RF-INF-* | 03/07 | solicitudes_info | info_* | QA-008/009 |
| Kanban | RF-GES-002 | 04/10 | servicios | read/RPC | QA-019 |
| Tabla | RF-GES-003 | 04/10 | pedidos | read/view | QA-020 |
| Asignación | RF-GES-007 | 06/07 | servicio/usuario | servicio_assign | RLS QA |
| Finalización | RF-SER-008 | 07 | servicio | servicio_finalize | QA-007 |
| Auth | RF-USR-* | 06 | auth+perfil | Auth/Admin RPC | QA-010..012 |
| Archivos | RF-ARC-* | 08 | Storage+archivos | upload-prepare | QA-016..018 |
| Comunicaciones | RF-COM-* | 09 | communications+Queue | n8n | QA-015 |
| Auditoría | RF-SEC-007 | 05/12 | audit_log | operaciones críticas | Security QA |

**Repositorio destino de código y pruebas:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de evidencia WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`

## 2. WeWeb → WSN-SC
| Actual | Objetivo |
|---|---|
| WeWeb frontend | plugin WordPress + TypeScript |
| Pinia/state WeWeb | state frontend |
| Backend Workflows | RPC/Edge |
| WeWeb Tables | Supabase PostgreSQL |
| WeWeb Auth | Supabase Auth |
| WeWeb Private Storage | Supabase Storage |
| n8n alta + email directo | Queue + n8n unificado |
| Notion sync | OPEN-002 |
| handoff MySQL WordPress | descartado |

## 3. Invariantes
- 1 envío = 1 PED.
- 1 PED = N servicios.
- estado/responsable por servicio.
- pedir información no cambia estados automáticamente.
- info request vence a 15 días.
- Kanban y tabla.
- username como identidad operativa.
- archivos privados.

## 4. Mejoras deliberadas
- PED solo no autoriza seguimiento.
- tracking token hash.
- Queue durable.
- audit log.
- idempotencia formal.
- no duplicar categorías en JSON si se derivan.
- no depender de Notion.
- no WordPress MySQL para negocio.

## 5. OPEN
**OPEN-001:** agregación `estado_general` mixta.  
**OPEN-002:** Notion.  
**OPEN-003:** retención.  
**OPEN-004:** resuelto documentalmente para desarrollo; ver ADR-032 y documento 20.

## 6. Definition of Ready
Tarea lista si tiene requisito, diseño, permisos, errores, QA y no depende de un OPEN sin resolver.

## 7. Definition of Done
Código revisado, tests verdes, RLS negativa cuando aplica, sin secretos, docs actualizadas, migration reproducible, smoke test e informe de archivos modificados.


## Repositorios y procedencia

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`

**Repositorio fuente de la auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Branch de auditoría:** `audit/current-weweb-2026-09-10`  
**Commit QA de referencia:** `0efb624`

El repositorio oficial del desarrollo es el único destino previsto para el código nuevo, documentación de implementación, plugin WordPress, migraciones Supabase, pruebas y workflows versionados. El repositorio de auditoría se conserva como evidencia del sistema WeWeb original y no debe confundirse con el repositorio de implementación.

## Documentación técnica oficial

- WordPress Developer Resources: `https://developer.wordpress.org/`
- Supabase Docs: `https://supabase.com/docs/`

La documentación histórica anterior a la auditoría se utiliza solo como referencia cuando no contradice la evidencia current-state.

## 8. Compatibilidad del sitio receptor

| Requisito | Diseño | QA |
|---|---|---|
| SRS-COMP-001 | 10_PLUGIN / 20_BASELINE | QA-COMP-001 |
| SRS-COMP-002..004 | 04_UI_UX / 10_PLUGIN | QA-COMP-002..004 |
| SRS-COMP-005 | 12_SEGURIDAD | QA-COMP-005 |
| SRS-COMP-006 | 10_PLUGIN / 13_ENTORNOS | QA-COMP-006 |
| SRS-COMP-007 | 01_ARQUITECTURA / 11_API | QA-COMP-008 |
| SRS-COMP-009 | 15_PLAN / 16_MIGRACION | gate preproducción |

## 9. Matriz individual de requisitos — revisión 2.0
La matriz temática original sirve como resumen. Esta matriz lista cada identificador individual SRS/RF definido en la entrega y su suite de aceptación planificada. Los números de diseño corresponden a originales del índice. Las suites comunes se parametrizan por requisito; antes de cerrar una feature se registra el caso ejecutable y evidencia exacta para cada fila. Esto no constituye porcentaje de cobertura ejecutada.

| Requisito | Documento de definición | Obligación / título | Diseño | Fase | QA planificado | Estado |
|---|---|---|---|---|---|---|
| RF-ARC-001 | 02_REQUISITOS_FUNCIONALES.md | máximo inicial 5 adjuntos. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-002 | 02_REQUISITOS_FUNCIONALES.md | máximo inicial 25 MB por archivo. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-003 | 02_REQUISITOS_FUNCIONALES.md | PDF/PNG/JPG/JPEG/DOCX/ZIP. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-004 | 02_REQUISITOS_FUNCIONALES.md | validar extensión, MIME y límites. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-005 | 02_REQUISITOS_FUNCIONALES.md | privados. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-006 | 02_REQUISITOS_FUNCIONALES.md | descarga autorizada o signed URL. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-ARC-007 | 02_REQUISITOS_FUNCIONALES.md | limpieza de uploads huérfanos. | 08 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-001 | 02_REQUISITOS_FUNCIONALES.md | pedido creado produce evento asíncrono. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-002 | 02_REQUISITOS_FUNCIONALES.md | información faltante notifica al solicitante. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-003 | 02_REQUISITOS_FUNCIONALES.md | respuesta puede notificar al equipo. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-004 | 02_REQUISITOS_FUNCIONALES.md | finalización notifica. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-005 | 02_REQUISITOS_FUNCIONALES.md | cancelación notifica si la regla lo requiere. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-006 | 02_REQUISITOS_FUNCIONALES.md | `event_id` único. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-007 | 02_REQUISITOS_FUNCIONALES.md | fallo externo deja trabajo reintentable. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-COM-008 | 02_REQUISITOS_FUNCIONALES.md | reintentos idempotentes. | 09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-007, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| RF-GEN-001 | 02_REQUISITOS_FUNCIONALES.md | estados: Nuevo, En proceso, Finalizado, Cancelado. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-GEN-002 | 02_REQUISITOS_FUNCIONALES.md | no se modifica libremente desde frontend. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-GEN-003 | 02_REQUISITOS_FUNCIONALES.md | la agregación terminal mixta queda `OPEN-001`. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-001 | 02_REQUISITOS_FUNCIONALES.md | solo cuentas aprobadas. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-002 | 02_REQUISITOS_FUNCIONALES.md | Kanban por estado de servicio. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-003 | 02_REQUISITOS_FUNCIONALES.md | tabla consolidada por PED. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-004 | 02_REQUISITOS_FUNCIONALES.md | búsqueda y filtros por área, estado y responsable. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-005 | 02_REQUISITOS_FUNCIONALES.md | no se requiere drag & drop. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-006 | 02_REQUISITOS_FUNCIONALES.md | detalle reúne cabecera, servicios, info, archivos, entrega e historial. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-007 | 02_REQUISITOS_FUNCIONALES.md | selector de responsable muestra `nombre_usuario`, guarda UUID técnico. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-GES-008 | 02_REQUISITOS_FUNCIONALES.md | escrituras respetan transiciones válidas y se auditan. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-001 | 02_REQUISITOS_FUNCIONALES.md | personal aprobado puede solicitarla sobre un servicio. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-002 | 02_REQUISITOS_FUNCIONALES.md | registra mensaje, actor, timestamps, estado y expiración. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-003 | 02_REQUISITOS_FUNCIONALES.md | vigencia inicial 15 días. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-004 | 02_REQUISITOS_FUNCIONALES.md | NO cambia automáticamente estado PED ni servicio. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-005 | 02_REQUISITOS_FUNCIONALES.md | acceso público con token específico. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-006 | 02_REQUISITOS_FUNCIONALES.md | respuesta admite texto y adjuntos válidos. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-007 | 02_REQUISITOS_FUNCIONALES.md | al responder pasa a `respondida`. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-INF-008 | 02_REQUISITOS_FUNCIONALES.md | token vencido/consumido no permite uso indebido. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-001 | 02_REQUISITOS_FUNCIONALES.md | cada envío confirmado crea exactamente un PED. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-002 | 02_REQUISITOS_FUNCIONALES.md | formato `PED-YYYY-NNNNNN`. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-003 | 02_REQUISITOS_FUNCIONALES.md | numeración única bajo concurrencia. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-004 | 02_REQUISITOS_FUNCIONALES.md | cada PED contiene 1..N servicios. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-005 | 02_REQUISITOS_FUNCIONALES.md | todos los servicios del envío comparten cabecera PED. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-006 | 02_REQUISITOS_FUNCIONALES.md | doble clic/retry con mismo submission key no duplica. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-007 | 02_REQUISITOS_FUNCIONALES.md | creación cabecera + servicios + relaciones críticas es atómica. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PED-008 | 02_REQUISITOS_FUNCIONALES.md | éxito muestra PED y acceso al seguimiento. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-001 | 02_REQUISITOS_FUNCIONALES.md | visitante crea solicitud sin cuenta. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-002 | 02_REQUISITOS_FUNCIONALES.md | wizard `Datos → Pedido → Confirmación`. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-003 | 02_REQUISITOS_FUNCIONALES.md | Paso 1 exige nombre y apellido, teléfono, email y área/dependencia. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-004 | 02_REQUISITOS_FUNCIONALES.md | debe seleccionarse al menos una categoría: Diseño, Cobertura, Gacetilla o Redes. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-005 | 02_REQUISITOS_FUNCIONALES.md | Paso 2 muestra solo formularios de categorías seleccionadas. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-006 | 02_REQUISITOS_FUNCIONALES.md | Diseño permite una o más piezas: Flyer RRSS, Invitación, Certificado, Otros. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-007 | 02_REQUISITOS_FUNCIONALES.md | validaciones bloquean avance si faltan datos. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-008 | 02_REQUISITOS_FUNCIONALES.md | Paso 3 resume datos, servicios y adjuntos. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-PUB-009 | 02_REQUISITOS_FUNCIONALES.md | errores no borran entradas válidas. | 03/04/19 | F6 | QA-001, QA-002, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-ROB-001 | 02_REQUISITOS_FUNCIONALES.md | Mantener datos válidos ante timeout; explicar que reintentar no crea otro PED. | 03/04/11 | F6/F8/F9 | QA-AUD-003, QA-AUD-004, QA-AUD-010, QA-AUD-015, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-ROB-002 | 02_REQUISITOS_FUNCIONALES.md | Ante conflicto de edición, mostrar que hubo un cambio ajeno y permitir recargar antes de aplicar una acción nueva. | 03/04/11 | F6/F8/F9 | QA-AUD-003, QA-AUD-004, QA-AUD-010, QA-AUD-015, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-ROB-003 | 02_REQUISITOS_FUNCIONALES.md | Mostrar progreso y error por archivo, impedir confirmar asociaciones incompletas. | 03/04/11 | F6/F8/F9 | QA-AUD-003, QA-AUD-004, QA-AUD-010, QA-AUD-015, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-ROB-004 | 02_REQUISITOS_FUNCIONALES.md | Diferenciar PED confirmado de correo pendiente; la demora de correo no cambia el estado del pedido. | 03/04/11 | F6/F8/F9 | QA-AUD-003, QA-AUD-004, QA-AUD-010, QA-AUD-015, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-ROB-005 | 02_REQUISITOS_FUNCIONALES.md | Ofrecer recuperación segura cuando se perdió la respuesta inicial y el token ya no está disponible. | 03/04/11 | F6/F8/F9 | QA-AUD-003, QA-AUD-004, QA-AUD-010, QA-AUD-015, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-001 | 02_REQUISITOS_FUNCIONALES.md | ningún secret en browser/plugin público. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-002 | 02_REQUISITOS_FUNCIONALES.md | publishable key no sustituye RLS. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-003 | 02_REQUISITOS_FUNCIONALES.md | `anon` no lee PED/PII directamente. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-004 | 02_REQUISITOS_FUNCIONALES.md | admin siempre validado server-side. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-005 | 02_REQUISITOS_FUNCIONALES.md | tokens públicos almacenados como hash. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-006 | 02_REQUISITOS_FUNCIONALES.md | errores públicos no revelan existencia de PED/email. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEC-007 | 02_REQUISITOS_FUNCIONALES.md | acciones críticas auditadas. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| RF-SEG-001 | 02_REQUISITOS_FUNCIONALES.md | consulta pública sin cuenta. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-SEG-002 | 02_REQUISITOS_FUNCIONALES.md | PED visible no basta para datos sensibles; requiere token. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-SEG-003 | 02_REQUISITOS_FUNCIONALES.md | respuesta pública excluye información interna. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-SEG-004 | 02_REQUISITOS_FUNCIONALES.md | recuperación por email no permite enumeración. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-001 | 02_REQUISITOS_FUNCIONALES.md | estado independiente. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-002 | 02_REQUISITOS_FUNCIONALES.md | responsable independiente. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-003 | 02_REQUISITOS_FUNCIONALES.md | información específica. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-004 | 02_REQUISITOS_FUNCIONALES.md | observaciones internas. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-005 | 02_REQUISITOS_FUNCIONALES.md | entrega final. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-006 | 02_REQUISITOS_FUNCIONALES.md | estados: Nuevo, En revisión, Asignado, En proceso, Esperando información, Correcciones, Finalizado, Cancelado. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-007 | 02_REQUISITOS_FUNCIONALES.md | Cancelado requiere motivo. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-SER-008 | 02_REQUISITOS_FUNCIONALES.md | Finalizado requiere entrega válida según contrato. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| RF-UI-001 | 02_REQUISITOS_FUNCIONALES.md | conservar wizard, Kanban, tabla y detalle. | 04/10 | F2/F6/F9 | QA-AUD-021, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-UI-002 | 02_REQUISITOS_FUNCIONALES.md | responsive desktop/tablet/mobile. | 04/10 | F2/F6/F9 | QA-AUD-021, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-UI-003 | 02_REQUISITOS_FUNCIONALES.md | loading/empty/error/success. | 04/10 | F2/F6/F9 | QA-AUD-021, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-UI-004 | 02_REQUISITOS_FUNCIONALES.md | formularios accesibles. | 04/10 | F2/F6/F9 | QA-AUD-021, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-UI-005 | 02_REQUISITOS_FUNCIONALES.md | estilos aislados del theme WordPress. | 04/10 | F2/F6/F9 | QA-AUD-021, QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-001 | 02_REQUISITOS_FUNCIONALES.md | registro objetivo: nombre, apellido, username, email, password. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-002 | 02_REQUISITOS_FUNCIONALES.md | nuevo usuario = `pendiente`. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-003 | 02_REQUISITOS_FUNCIONALES.md | pendiente no accede a datos operativos. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-004 | 02_REQUISITOS_FUNCIONALES.md | admin aprueba/revoca y edita username. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-005 | 02_REQUISITOS_FUNCIONALES.md | roles mínimos `equipo_interno`, `admin`. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-006 | 02_REQUISITOS_FUNCIONALES.md | username 2..30, lowercase, `[a-z0-9._-]`, único. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| RF-USR-007 | 02_REQUISITOS_FUNCIONALES.md | revocación elimina autorización aunque el JWT técnico aún no expire. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-001 | 00A_SRS.md | Las operaciones de negocio críticas deberán realizarse mediante RPC controladas. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-002 | 00A_SRS.md | Las Edge Functions se usarán solo cuando haya frontera HTTP pública, tokens, rate limiting, CORS, secrets o signed uploads. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-003 | 00A_SRS.md | `create-pedido` deberá invocar una operación transaccional en PostgreSQL. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-004 | 00A_SRS.md | `servicio_assign` deberá validar que el responsable esté aprobado. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-005 | 00A_SRS.md | `servicio_update` deberá aceptar únicamente campos explícitamente permitidos. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-006 | 00A_SRS.md | `servicio_finalize` deberá validar la entrega. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-007 | 00A_SRS.md | `tracking-get` deberá devolver un DTO público mínimo. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-008 | 00A_SRS.md | Los errores HTTP no deberán exponer SQL, stacktraces ni secretos. | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-API-009 | 00A_SRS.md | Los endpoints sensibles deberán usar allowlist de origins. --- | 07/11 | F3/F6/F9 | QA-AUD-012, QA-AUD-013, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUD-001 | 00A_SRS.md | Las operaciones sensibles deberán registrar: - actor; - acción; - entidad; - timestamp; - request_id; - old/new values relevantes. | 05/12/13 | Transversal | QA-AUD-020, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUD-002 | 00A_SRS.md | No se deberán registrar secretos ni PII innecesaria. | 05/12/13 | Transversal | QA-AUD-020, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUD-003 | 00A_SRS.md | Los errores de backend deberán poder correlacionarse mediante `request_id`. --- | 05/12/13 | Transversal | QA-AUD-020, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-001 | 00A_SRS.md | Supabase Auth deberá autenticar al personal interno. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-002 | 00A_SRS.md | Los solicitantes públicos no deberán requerir cuenta Auth. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-003 | 00A_SRS.md | Una cuenta nueva deberá quedar con `estado_acceso = pendiente`. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-004 | 00A_SRS.md | Una cuenta pendiente no deberá leer datos operativos. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-005 | 00A_SRS.md | Una cuenta revocada no deberá conservar autorización de negocio aunque su JWT técnico continúe vigente. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-006 | 00A_SRS.md | Roles de aplicación mínimos: - `equipo_interno`; - `admin`. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-007 | 00A_SRS.md | `nombre_usuario` deberá: - tener entre 2 y 30 caracteres; - estar en minúsculas; - cumplir `[a-z0-9._-]`; - ser único. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-008 | 00A_SRS.md | El cliente no deberá poder asignarse o elevar su propio rol. | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-AUTH-009 | 00A_SRS.md | La administración de usuarios deberá validarse server-side. --- | 06/07 | F3/F9 | QA-010, QA-011, QA-012, QA-021, QA-022, QA-AUD-016, QA-AUD-017 | PLANIFICADO; código/evidencia pendiente |
| SRS-BIZ-001 | 00A_SRS.md | Cada envío confirmado del formulario deberá crear exactamente un PED. | 05/07 | F3/F6 | QA-001, QA-002, QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-BIZ-002 | 00A_SRS.md | Cada PED deberá contener uno o más `servicios_solicitados`. | 05/07 | F3/F6 | QA-001, QA-002, QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-BIZ-003 | 00A_SRS.md | Un servicio solicitado no deberá crear un PED independiente. | 05/07 | F3/F6 | QA-001, QA-002, QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-BIZ-004 | 00A_SRS.md | Cada servicio deberá conservar su propio: - estado; - responsable; - información específica; - observaciones internas; - entrega final. | 05/07 | F3/F6 | QA-001, QA-002, QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-BIZ-005 | 00A_SRS.md | El identificador visible del pedido deberá pertenecer a la cabecera `pedidos`. --- | 05/07 | F3/F6 | QA-001, QA-002, QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-001 | 00A_SRS.md | El plugin deberá funcionar con WordPress 7.0.2 y PHP 8.2.31. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-002 | 00A_SRS.md | La app deberá poder montarse dentro de una página Elementor mediante shortcode/app shell sin depender internamente de Elementor. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-003 | 00A_SRS.md | El CSS deberá aislarse de Betheme, Elementor y ElementsKit. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-004 | 00A_SRS.md | La inicialización frontend deberá ser idempotente ante renders repetidos de Elementor preview/editor. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-005 | 00A_SRS.md | El plugin deberá funcionar con Wordfence Security activo. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-006 | 00A_SRS.md | El plugin deberá funcionar con WP Super Cache activo y versionar sus assets. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-007 | 00A_SRS.md | La comunicación HTTPS navegador → Supabase deberá mantenerse operativa. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-008 | 00A_SRS.md | Los límites PHP de upload no deberán ser una dependencia para adjuntos PEDIDOS; estos continuarán directos a Supabase Storage. | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-COMP-009 | 00A_SRS.md | Antes de producción deberá existir un ensayo de migración en staging verificado, además de un procedimiento aprobado de instalación y rollback. Si no existe sta | 10/20 | F2/F10 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006, QA-COMP-007, QA-COMP-008, QA-COMP-009, QA-AUD-021, QA-AUD-022 | PLANIFICADO; código/evidencia pendiente |
| SRS-CON-001 | 00A_SRS.md | Misma clave idempotente y contenido diferente produce conflicto; reintentos concurrentes de la misma operación retornan una sola entidad. | 05/07/11 | F3/F6/F9 | QA-AUD-004, QA-AUD-015 | PLANIFICADO; código/evidencia pendiente |
| SRS-CON-002 | 00A_SRS.md | Una escritura sobre una versión obsoleta de servicio produce conflicto, sin sobrescribir silenciosamente cambios ajenos. | 05/07/11 | F3/F6/F9 | QA-AUD-004, QA-AUD-015 | PLANIFICADO; código/evidencia pendiente |
| SRS-ENV-001 | 00A_SRS.md | El desarrollo deberá poder ejecutarse localmente sin servicios pagos obligatorios. | 13/16 | F1/F10/F11 | QA-AUD-022, QA-AUD-023, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-ENV-002 | 00A_SRS.md | Deberán existir entornos separados: - local; - staging; - production. | 13/16 | F1/F10/F11 | QA-AUD-022, QA-AUD-023, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-ENV-003 | 00A_SRS.md | Las migrations deberán versionarse en el repositorio oficial. | 13/16 | F1/F10/F11 | QA-AUD-022, QA-AUD-023, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-ENV-004 | 00A_SRS.md | El plugin deberá ser entregable como ZIP versionado. | 13/16 | F1/F10/F11 | QA-AUD-022, QA-AUD-023, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-ENV-005 | 00A_SRS.md | No se deberán reutilizar datos personales de Production en local. --- | 13/16 | F1/F10/F11 | QA-AUD-022, QA-AUD-023, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-001 | 00A_SRS.md | Toda comunicación asíncrona deberá originarse en un evento durable. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-002 | 00A_SRS.md | Supabase Queues deberá separar la transacción de negocio de n8n. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-003 | 00A_SRS.md | La indisponibilidad de n8n no deberá revertir un PED confirmado. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-004 | 00A_SRS.md | Cada evento deberá tener `event_id` único. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-005 | 00A_SRS.md | El consumidor deberá ser idempotente. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-006 | 00A_SRS.md | Los reintentos deberán ser acotados. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-007 | 00A_SRS.md | Después del máximo de intentos deberá existir estado failed/dead-letter operativo. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-008 | 00A_SRS.md | n8n no deberá: - generar PED; - decidir roles; - autorizar usuarios; - ser fuente de verdad. --- | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-009 | 00A_SRS.md | Cada entrega tiene identidad estable y una sola reclamación vigente; ACK y cambios de ledger se validan con el intento actual. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-010 | 00A_SRS.md | Un resultado incierto del proveedor no se reenvía a ciegas fuera de su garantía documentada de idempotencia. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EVT-011 | 00A_SRS.md | El estado enviado indica aceptación por proveedor; entrega real/rebote solo se afirma con evidencia del proveedor. | 05/09 | F4/F7 | QA-015, QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008, QA-AUD-027 | PLANIFICADO; código/evidencia pendiente |
| SRS-EXP-001 | 00A_SRS.md | Las RPC exclusivas de Edge/automatización no son ejecutables directamente por anon ni por usuarios internos. | 06/07 | F3 | QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-001 | 00A_SRS.md | Inicio de solicitud | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-002 | 00A_SRS.md | Wizard | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-003 | 00A_SRS.md | Datos obligatorios | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-004 | 00A_SRS.md | Categorías | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-005 | 00A_SRS.md | Formularios condicionales | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-006 | 00A_SRS.md | Diseño gráfico | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-007 | 00A_SRS.md | Conservación de datos | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-008 | 00A_SRS.md | Confirmación | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-009 | 00A_SRS.md | Adjuntos | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-010 | 00A_SRS.md | Tipos permitidos | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-011 | 00A_SRS.md | Tamaño | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-FUN-012 | 00A_SRS.md | Resultado | 19/11 | F6 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-GEN-001 | 00A_SRS.md | `pedidos.estado_general` deberá existir separado de `servicios_solicitados.estado`. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-GEN-002 | 00A_SRS.md | Valores permitidos: - Nuevo; - En proceso; - Finalizado; - Cancelado. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-GEN-003 | 00A_SRS.md | El frontend no deberá poder modificar arbitrariamente `estado_general`. | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-GEN-004 | 00A_SRS.md | La regla exacta para combinaciones terminales mixtas deberá permanecer pendiente hasta resolver `OPEN-001`. --- | 05/07/17 | F9 | QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-001 | 00A_SRS.md | Solo usuarios aprobados con rol permitido deberán acceder a Gestión. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-002 | 00A_SRS.md | La Gestión deberá ofrecer una vista Kanban. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-003 | 00A_SRS.md | El Kanban deberá agrupar por estado de servicio. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-004 | 00A_SRS.md | La Gestión deberá ofrecer una vista Tabla consolidada por PED. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-005 | 00A_SRS.md | Deberán existir búsqueda y filtros al menos por: - área; - estado; - responsable; - PED/solicitante cuando aplique. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-006 | 00A_SRS.md | El MVP no requerirá drag & drop. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-007 | 00A_SRS.md | El detalle deberá distinguir visualmente: - estado general del PED; - estado de cada servicio. | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-GES-008 | 00A_SRS.md | Las acciones críticas deberán ejecutarse mediante RPC/Edge controlados. --- | 04/07/10 | F9 | QA-019, QA-020, QA-AUD-013, QA-AUD-015, QA-AUD-029 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-001 | 00A_SRS.md | Un usuario interno aprobado podrá solicitar información sobre un servicio. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-002 | 00A_SRS.md | La solicitud deberá registrar: - pedido; - servicio; - mensaje; - actor; - token hash; - estado; - fecha de creación; - expiración. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-003 | 00A_SRS.md | La vigencia inicial deberá ser de 15 días. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-004 | 00A_SRS.md | Crear una solicitud de información no deberá modificar automáticamente: - `pedidos.estado_general`; - `servicios_solicitados.estado`. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-005 | 00A_SRS.md | El solicitante deberá responder mediante token público seguro. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-006 | 00A_SRS.md | El estado deberá evolucionar: `pendiente → respondida / vencida`. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-007 | 00A_SRS.md | Un token vencido no deberá permitir respuesta. | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INF-008 | 00A_SRS.md | La respuesta podrá incluir texto y archivos autorizados. --- | 05/07/08 | F8 | QA-008, QA-009, QA-AUD-001, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-INT-001 | 00A_SRS.md | Se valida coherencia entre PED, servicio, tipo, área, solicitud de información y archivos en las operaciones permitidas. | 05/07 | F3 | QA-AUD-014 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-001 | 00A_SRS.md | Los PED visibles existentes deberán conservarse. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-002 | 00A_SRS.md | La migración no deberá transformar N servicios de un PED en N PED diferentes. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-003 | 00A_SRS.md | La secuencia nueva deberá inicializarse por encima del máximo PED migrado. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-004 | 00A_SRS.md | Los archivos migrados deberán quedar privados. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-005 | 00A_SRS.md | Los usuarios deberán reestablecer credenciales si los hashes actuales no son compatibles de forma segura con Supabase Auth. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-006 | 00A_SRS.md | La migración deberá ensayarse en staging antes del cutover. | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-MIG-007 | 00A_SRS.md | El cutover deberá tener rollback documentado. --- | 16 | F10/F11 | QA-AUD-023, QA-AUD-024, QA-AUD-031 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-001 | 00A_SRS.md | La creación de PED deberá ser transaccional. | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-002 | 00A_SRS.md | La creación deberá ser idempotente ante retries. | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-003 | 00A_SRS.md | La UI no deberá depender de Realtime para funcionar correctamente. | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-004 | 00A_SRS.md | Los listados de Gestión deberán usar índices adecuados para estado, responsable, área y fechas. | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-005 | 00A_SRS.md | Las operaciones asíncronas deberán admitir reintento sin duplicados. | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-NFR-006 | 00A_SRS.md | El sistema deberá poder recuperarse de fallo de n8n sin pérdida de negocio. --- | 05/07/09 | F3/F6/F7/F10 | QA-AUD-004, QA-AUD-005, QA-AUD-029, QA-AUD-030 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-001 | 00A_SRS.md | El PED deberá usar el formato `PED-YYYY-NNNNNN`. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-002 | 00A_SRS.md | La numeración deberá ser única bajo concurrencia. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-003 | 00A_SRS.md | La secuencia deberá generarse en PostgreSQL, no en JavaScript, WordPress ni n8n. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-004 | 00A_SRS.md | La creación de `pedidos`, `servicios_solicitados` y relaciones críticas deberá ser atómica. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-005 | 00A_SRS.md | La operación de creación deberá ser idempotente mediante `submission_key`. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-006 | 00A_SRS.md | Repetir la misma operación con el mismo `submission_key` no deberá crear un segundo PED. | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-PED-007 | 00A_SRS.md | Si ocurre un fallo antes del commit, no deberá quedar una creación parcial del PED. --- | 05/07/11 | F3/F6 | QA-001, QA-002, QA-003, QA-004, QA-005, QA-AUD-003, QA-AUD-004 | PLANIFICADO; código/evidencia pendiente |
| SRS-REC-001 | 00A_SRS.md | La restauración incluye objetos de Storage y metadata, configuración necesaria y pedidos creados durante una ventana de rollback. | 13/16 | F10/F11 | QA-AUD-023, QA-AUD-024 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-001 | 00A_SRS.md | Toda tabla operativa expuesta por Data API deberá tener RLS habilitada. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-002 | 00A_SRS.md | Los grants deberán seguir mínimo privilegio. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-003 | 00A_SRS.md | El rol `anon` no deberá tener SELECT directo sobre tablas de PED/PII. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-004 | 00A_SRS.md | `authenticated` no deberá equivaler automáticamente a acceso operativo. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-005 | 00A_SRS.md | Las policies deberán comprobar `estado_acceso = aprobado` cuando corresponda. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-006 | 00A_SRS.md | Las acciones administrativas deberán comprobar `app_role = admin`. | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-RLS-007 | 00A_SRS.md | Toda policy deberá tener tests allow/deny. --- | 06/07/12 | F3 | QA-010, QA-011, QA-012, QA-013, QA-AUD-012, QA-AUD-013 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-001 | 00A_SRS.md | Todo input del navegador deberá considerarse no confiable. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-002 | 00A_SRS.md | La publishable key no deberá considerarse mecanismo de autorización. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-003 | 00A_SRS.md | Los secretos deberán existir solo server-side. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-004 | 00A_SRS.md | Los tokens públicos deberán tener entropía suficiente y persistirse como hash. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-005 | 00A_SRS.md | Las operaciones críticas deberán dejar auditoría. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-006 | 00A_SRS.md | Los logs no deberán incluir: - passwords; - raw tokens; - Authorization headers; - cookies; - secret keys. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-007 | 00A_SRS.md | Los archivos deberán validarse por extensión, MIME, tamaño y contexto. | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEC-008 | 00A_SRS.md | Deberá existir protección anti-abuso para endpoints públicos. --- | 06/08/12 | Transversal | QA-AUD-012, QA-AUD-013, QA-AUD-019, QA-AUD-020, QA-AUD-034, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-001 | 00A_SRS.md | El solicitante deberá poder consultar su PED sin una cuenta interna. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-002 | 00A_SRS.md | El PED visible por sí solo no deberá autorizar acceso a información sensible. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-003 | 00A_SRS.md | El seguimiento deberá requerir un token seguro. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-004 | 00A_SRS.md | El token persistido deberá almacenarse como hash, no en texto plano. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-005 | 00A_SRS.md | La respuesta pública deberá excluir: - observaciones internas; - UUID Auth; - emails del equipo; - auditoría interna; - cualquier PII no necesaria. | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SEG-006 | 00A_SRS.md | La recuperación de seguimiento mediante email deberá responder de forma neutra para impedir enumeración. --- | 07/11/12 | F8 | QA-014, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-001 | 00A_SRS.md | Cada servicio deberá tener estado independiente. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-002 | 00A_SRS.md | Estados permitidos: - Nuevo; - En revisión; - Asignado; - En proceso; - Esperando información; - Correcciones; - Finalizado; - Cancelado. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-003 | 00A_SRS.md | Cada servicio podrá tener un responsable diferente. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-004 | 00A_SRS.md | El responsable visible deberá mostrarse mediante `nombre_usuario`. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-005 | 00A_SRS.md | El identificador técnico del responsable deberá ser el UUID del usuario Auth. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-006 | 00A_SRS.md | Un servicio Cancelado deberá requerir motivo. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-007 | 00A_SRS.md | Un servicio Finalizado deberá requerir una entrega válida según contrato. | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-SER-008 | 00A_SRS.md | Los cambios de estado deberán validarse server-side. --- | 05/07 | F9 | QA-006, QA-007, QA-AUD-015, QA-AUD-026 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-001 | 00A_SRS.md | Los archivos deberán almacenarse en Supabase Storage. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-002 | 00A_SRS.md | El bucket operativo deberá ser privado. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-003 | 00A_SRS.md | Los archivos no deberán almacenarse en `wp-content/uploads`. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-004 | 00A_SRS.md | El público no deberá recibir INSERT/SELECT genérico sobre el bucket. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-005 | 00A_SRS.md | Las cargas públicas deberán usar signed upload temporal. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-006 | 00A_SRS.md | Las descargas deberán usar autorización o signed URL temporal. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-007 | 00A_SRS.md | Los paths no deberán contener PII ni secretos. | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-STO-008 | 00A_SRS.md | Deberá existir un proceso para limpiar uploads huérfanos. --- | 05/08/12 | F5 | QA-016, QA-017, QA-018, QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-TOK-001 | 00A_SRS.md | La credencial de acceso se valida por hash; cualquier copia cifrada para envío es temporal, separada, restringida y trazable sin registrar el token. | 05/07/12 | F4/F8 | QA-AUD-001, QA-AUD-002, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-TOK-002 | 00A_SRS.md | Un replay de creación no genera ni rota tokens; la recuperación usa un flujo independiente y no invalida el acceso vigente por una simple solicitud pública. | 05/07/12 | F4/F8 | QA-AUD-001, QA-AUD-002, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-TOK-003 | 00A_SRS.md | La validación de enlaces no consume credenciales; una acción explícita autorizada consume o canjea el token de un solo uso de forma atómica. | 05/07/12 | F4/F8 | QA-AUD-001, QA-AUD-002, QA-AUD-003, QA-AUD-018 | PLANIFICADO; código/evidencia pendiente |
| SRS-UPL-001 | 00A_SRS.md | Toda asociación de archivo consume una reserva verificada del mismo contexto/presentación; paths aportados libremente no autorizan asociación. | 05/08 | F5 | QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-UPL-002 | 00A_SRS.md | La limpieza respeta cargas activas, ventanas técnicas de upload y transacciones de vinculación; no elimina objetos asociados. | 05/08 | F5 | QA-AUD-009, QA-AUD-010, QA-AUD-011 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-001 | 00A_SRS.md | El frontend deberá ser responsive en desktop, tablet y móvil. | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-002 | 00A_SRS.md | Los formularios deberán tener labels visibles. | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-003 | 00A_SRS.md | Los errores deberán asociarse a sus campos. | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-004 | 00A_SRS.md | El sistema deberá proporcionar estados: - loading; - empty; - error; - success; - unauthorized. | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-005 | 00A_SRS.md | El objetivo de accesibilidad será WCAG 2.2 AA. | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-UX-006 | 00A_SRS.md | La interfaz deberá ser navegable por teclado. --- | 04/19 | F6/F9/F10 | QA-AUD-025, QA-AUD-028 | PLANIFICADO; código/evidencia pendiente |
| SRS-VER-001 | 00A_SRS.md | Cada release declara compatibilidad de versión de plugin, contrato API, migraciones, eventos y formularios. | 10/11/13 | F1/F11 | QA-AUD-022, QA-AUD-032 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-001 | 00A_SRS.md | WordPress deberá alojar la interfaz bajo `/formulariomedios`. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-002 | 00A_SRS.md | La aplicación deberá distribuirse como plugin propio. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-003 | 00A_SRS.md | El plugin deberá usar APIs WordPress para assets y routing. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-004 | 00A_SRS.md | El plugin no deberá crear tablas operativas `wp_pedidos_*`. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-005 | 00A_SRS.md | La sesión de WordPress no deberá autorizar PEDIDOS. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-006 | 00A_SRS.md | Los estilos deberán estar aislados del theme. | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |
| SRS-WP-007 | 00A_SRS.md | El plugin no deberá contener Supabase secret key, JWT secret, credenciales n8n o credenciales de email. --- | 10/20 | F2/F11 | QA-COMP-001, QA-COMP-002, QA-COMP-004, QA-AUD-021, QA-AUD-022, QA-AUD-035 | PLANIFICADO; código/evidencia pendiente |

## 10. Hallazgos → resolución documental → validación
No se cierra un hallazgo de implementación porque se haya escrito una solución.

| Hallazgo | Tema | Documentos | Estado real | QA |
|---|---|---|---|---|
| H-01 | Jerarquía/resúmenes | README, índice, 17, 18 | Corregido documentalmente | QA-AUD-032 |
| H-02 | Formulario incompleto | 19, 00A, 11 | Pendientes visibles OPEN-005/012; implementación bloqueada en campos afectados | QA-AUD-025 |
| H-03 | Transiciones/estado general | 02, 03, 07, 17 | OPEN-001 explícito; sin regla inventada | QA-AUD-026 |
| H-04 | Token y entrega diferida | 05, 07, 09, 12, ADR-028 | Diseño técnico corregido; parámetros OPEN-012 y pruebas pendientes | QA-AUD-001, QA-AUD-002, QA-AUD-018 |
| H-05 | Duplicación de emails | 05, 09, ADR-020 | Diseño corregido; proveedor OPEN-009 | QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008 |
| H-06 | Asociación archivos | 05, 08, 11, ADR-033 | Diseño definido; parámetros y UX pendientes | QA-AUD-009, QA-AUD-010, QA-AUD-011 |
| H-07 | Exposición RPC/Edge | 06, 07, 12, ADR-035 | Matriz técnica definida; implementación no verificada | QA-AUD-012, QA-AUD-013 |
| H-08 | Integridad relacional | 05, 07 | Invariantes especificadas; migraciones pendientes | QA-AUD-014 |
| H-09 | Concurrencia/replay | 05, 07, 11, ADR-034 | Diseño definido; pruebas pendientes | QA-AUD-003, QA-AUD-004, QA-AUD-015 |
| H-10 | Auth/roles | 06, 17 | Seguridad fail-closed definida; negocio OPEN-006 | QA-AUD-016, QA-AUD-017 |
| H-11 | Contexto WordPress | 10, 12, 20 | Riesgos y criterios especificados; ensayo pendiente | QA-AUD-020, QA-AUD-021 |
| H-12 | Baseline/versiones | 10, 13, 20, ADR-032 | Referencias corregidas; receptor no inspeccionado | QA-COMP-001, QA-AUD-022 |
| H-13 | Staging/restore/rollback | 13, 16, 20, ADR-036 | Diseño corregido; OPEN-003/008/011 y ensayos pendientes | QA-AUD-023, QA-AUD-024, QA-AUD-031 |
| H-14 | Operación n8n | 09, 12, 13 | Contrato ampliado; OPEN-007/009/011/012 | QA-AUD-020, QA-AUD-027, QA-AUD-030 |

## 11. ADR → aceptación planificada
Para ADR pendientes/diferidas, el caso comprueba su exclusión o permanece bloqueado hasta decisión; no certifica una función aún no aprobada.

| ADR | QA planificado | Implementación/evidencia |
|---|---|---|
| ADR-001 | QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-002 | QA-AUD-021, QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-003 | QA-015, QA-AUD-005 | Pendiente; ver estado en documento 17 |
| ADR-004 | QA-001, QA-002, QA-AUD-031 | Pendiente; ver estado en documento 17 |
| ADR-005 | QA-AUD-014, QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-006 | QA-AUD-026 | Pendiente; ver estado en documento 17 |
| ADR-007 | QA-008 | Pendiente; ver estado en documento 17 |
| ADR-008 | QA-005 | Pendiente; ver estado en documento 17 |
| ADR-009 | QA-AUD-003, QA-AUD-004 | Pendiente; ver estado en documento 17 |
| ADR-010 | QA-AUD-016 | Pendiente; ver estado en documento 17 |
| ADR-011 | QA-AUD-013, QA-AUD-017 | Pendiente; ver estado en documento 17 |
| ADR-012 | QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-013 | QA-AUD-013 | Pendiente; ver estado en documento 17 |
| ADR-014 | QA-AUD-012, QA-AUD-015 | Pendiente; ver estado en documento 17 |
| ADR-015 | QA-AUD-012 | Pendiente; ver estado en documento 17 |
| ADR-016 | QA-AUD-020, QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-017 | QA-AUD-009, QA-AUD-013 | Pendiente; ver estado en documento 17 |
| ADR-018 | QA-AUD-010, QA-AUD-011 | Pendiente; ver estado en documento 17 |
| ADR-019 | QA-015, QA-AUD-007 | Pendiente; ver estado en documento 17 |
| ADR-020 | QA-AUD-005, QA-AUD-006, QA-AUD-007, QA-AUD-008 | Pendiente; ver estado en documento 17 |
| ADR-021 | QA-AUD-027 | Pendiente; ver estado en documento 17 |
| ADR-022 | QA-019, QA-020 | Pendiente; ver estado en documento 17 |
| ADR-023 | QA-021, QA-022, QA-AUD-016 | Pendiente; ver estado en documento 17 |
| ADR-024 | QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-025 | QA-AUD-029 | Pendiente; ver estado en documento 17 |
| ADR-026 | QA-AUD-035 | Pendiente; ver estado en documento 17 |
| ADR-027 | QA-AUD-031 | Pendiente; ver estado en documento 17 |
| ADR-028 | QA-AUD-001, QA-AUD-002 | Pendiente; ver estado en documento 17 |
| ADR-029 | QA-AUD-021 | Pendiente; ver estado en documento 17 |
| ADR-030 | QA-AUD-026 | Pendiente; ver estado en documento 17 |
| ADR-031 | QA-AUD-032 | Pendiente; ver estado en documento 17 |
| ADR-032 | QA-COMP-001, QA-COMP-002, QA-COMP-003, QA-COMP-004, QA-COMP-005, QA-COMP-006 | Pendiente; ver estado en documento 17 |
| ADR-033 | QA-AUD-009, QA-AUD-010, QA-AUD-011 | Pendiente; ver estado en documento 17 |
| ADR-034 | QA-AUD-004, QA-AUD-015 | Pendiente; ver estado en documento 17 |
| ADR-035 | QA-AUD-012, QA-AUD-013 | Pendiente; ver estado en documento 17 |
| ADR-036 | QA-AUD-022, QA-AUD-023, QA-AUD-024 | Pendiente; ver estado en documento 17 |

# FIN DOCUMENTO: 18_TRAZABILIDAD.md
