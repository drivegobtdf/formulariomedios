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
