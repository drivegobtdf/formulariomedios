# 00A — SRS · Software Requirements Specification

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Producto:** PEDIDOS — Secretaría de Medios  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Versión:** 2.0  
**Estado:** Especificación revisada; aplicar gates y decisiones abiertas antes de implementar

---

## 1. Propósito

Este SRS define de forma verificable los requisitos de software de PEDIDOS para su
reimplementación con WordPress.org + Supabase + n8n.

El documento traduce el PRD y la auditoría current-state a requisitos técnicos
concretos, testeables y trazables.

---

## 2. Alcance del sistema

La solución deberá:

- publicar la interfaz dentro de WordPress.org;
- usar Supabase como backend y fuente de verdad;
- usar PostgreSQL para datos operativos;
- usar Supabase Auth para personal interno;
- usar Supabase Storage para archivos privados;
- usar RPC/Edge Functions para operaciones críticas;
- usar Supabase Queues + n8n para comunicaciones asíncronas;
- permitir migrar y retirar WeWeb sin perder funcionalidad necesaria.

No deberá:

- almacenar PEDIDOS en MySQL/MariaDB de WordPress;
- usar `wp_users` como autorización de PEDIDOS;
- depender de n8n para confirmar una transacción de negocio;
- exponer secretos en navegador, plugin distribuido o repositorio;
- duplicar un PED por cada servicio.

---

## 3. Actores

### ACT-001 — Solicitante público
Usuario no autenticado que crea solicitudes, consulta seguimiento y responde
información faltante mediante token seguro.

### ACT-002 — Usuario interno pendiente
Usuario autenticado técnicamente pero sin acceso operativo.

### ACT-003 — Equipo interno
Usuario aprobado que gestiona servicios.

### ACT-004 — Administrador
Usuario aprobado con permisos administrativos sobre accesos y usuarios.

---

## 4. Regla estructural principal

### SRS-BIZ-001
Cada envío confirmado del formulario deberá crear exactamente un PED.

### SRS-BIZ-002
Cada PED deberá contener uno o más `servicios_solicitados`.

### SRS-BIZ-003
Un servicio solicitado no deberá crear un PED independiente.

### SRS-BIZ-004
Cada servicio deberá conservar su propio:
- estado;
- responsable;
- información específica;
- observaciones internas;
- entrega final.

### SRS-BIZ-005
El identificador visible del pedido deberá pertenecer a la cabecera `pedidos`.

---

## 5. Requisitos funcionales públicos

### SRS-FUN-001 — Inicio de solicitud
El sistema deberá permitir que un usuario no autenticado inicie una solicitud.

### SRS-FUN-002 — Wizard
El formulario deberá tener tres pasos:
1. Datos.
2. Pedido.
3. Confirmación.

### SRS-FUN-003 — Datos obligatorios
El Paso 1 deberá requerir:
- nombre y apellido;
- teléfono;
- correo electrónico;
- área/dependencia solicitante.

### SRS-FUN-004 — Categorías
El Paso 1 deberá requerir al menos una categoría:
- Diseño gráfico;
- Cobertura de eventos;
- Gacetilla;
- Publicaciones en redes sociales.

### SRS-FUN-005 — Formularios condicionales
El Paso 2 deberá mostrar únicamente los formularios asociados a las categorías
seleccionadas.

### SRS-FUN-006 — Diseño gráfico
Diseño gráfico deberá permitir una o más piezas:
- Flyer RRSS;
- Invitación digital;
- Certificados;
- Otros requerimientos gráficos.

### SRS-FUN-007 — Conservación de datos
Volver a un paso anterior o recibir un error no deberá borrar datos válidos ya
capturados durante la sesión activa.

### SRS-FUN-008 — Confirmación
El Paso 3 deberá mostrar un resumen antes del envío definitivo.

### SRS-FUN-009 — Adjuntos
El usuario deberá poder adjuntar hasta 5 archivos por presentación inicial.

### SRS-FUN-010 — Tipos permitidos
Los formatos iniciales permitidos deberán ser:
PDF, PNG, JPG/JPEG, DOCX y ZIP.

### SRS-FUN-011 — Tamaño
El límite funcional inicial será 25 MB por archivo.

### SRS-FUN-012 — Resultado
Tras un envío exitoso, el sistema deberá mostrar el PED generado y un mecanismo
seguro de seguimiento.

---

## 6. Requisitos de PED y numeración

### SRS-PED-001
El PED deberá usar el formato `PED-YYYY-NNNNNN`.

### SRS-PED-002
La numeración deberá ser única bajo concurrencia.

### SRS-PED-003
La secuencia deberá generarse en PostgreSQL, no en JavaScript, WordPress ni n8n.

### SRS-PED-004
La creación de `pedidos`, `servicios_solicitados` y relaciones críticas deberá
ser atómica.

### SRS-PED-005
La operación de creación deberá ser idempotente mediante `submission_key`.

### SRS-PED-006
Repetir la misma operación con el mismo `submission_key` no deberá crear un
segundo PED.

### SRS-PED-007
Si ocurre un fallo antes del commit, no deberá quedar una creación parcial del PED.

---

## 7. Requisitos de servicios

### SRS-SER-001
Cada servicio deberá tener estado independiente.

### SRS-SER-002
Estados permitidos:
- Nuevo;
- En revisión;
- Asignado;
- En proceso;
- Esperando información;
- Correcciones;
- Finalizado;
- Cancelado.

### SRS-SER-003
Cada servicio podrá tener un responsable diferente.

### SRS-SER-004
El responsable visible deberá mostrarse mediante `nombre_usuario`.

### SRS-SER-005
El identificador técnico del responsable deberá ser el UUID del usuario Auth.

### SRS-SER-006
Un servicio Cancelado deberá requerir motivo.

### SRS-SER-007
Un servicio Finalizado deberá requerir una entrega válida según contrato.

### SRS-SER-008
Los cambios de estado deberán validarse server-side.

---

## 8. Estado general del PED

### SRS-GEN-001
`pedidos.estado_general` deberá existir separado de `servicios_solicitados.estado`.

### SRS-GEN-002
Valores permitidos:
- Nuevo;
- En proceso;
- Finalizado;
- Cancelado.

### SRS-GEN-003
El frontend no deberá poder modificar arbitrariamente `estado_general`.

### SRS-GEN-004
La regla exacta para combinaciones terminales mixtas deberá permanecer pendiente
hasta resolver `OPEN-001`.

---

## 9. Seguimiento público

### SRS-SEG-001
El solicitante deberá poder consultar su PED sin una cuenta interna.

### SRS-SEG-002
El PED visible por sí solo no deberá autorizar acceso a información sensible.

### SRS-SEG-003
El seguimiento deberá requerir un token seguro.

### SRS-SEG-004
El token persistido deberá almacenarse como hash, no en texto plano.

### SRS-SEG-005
La respuesta pública deberá excluir:
- observaciones internas;
- UUID Auth;
- emails del equipo;
- auditoría interna;
- cualquier PII no necesaria.

### SRS-SEG-006
La recuperación de seguimiento mediante email deberá responder de forma neutra
para impedir enumeración.

---

## 10. Solicitudes de información faltante

### SRS-INF-001
Un usuario interno aprobado podrá solicitar información sobre un servicio.

### SRS-INF-002
La solicitud deberá registrar:
- pedido;
- servicio;
- mensaje;
- actor;
- token hash;
- estado;
- fecha de creación;
- expiración.

### SRS-INF-003
La vigencia inicial deberá ser de 15 días.

### SRS-INF-004
Crear una solicitud de información no deberá modificar automáticamente:
- `pedidos.estado_general`;
- `servicios_solicitados.estado`.

### SRS-INF-005
El solicitante deberá responder mediante token público seguro.

### SRS-INF-006
El estado deberá evolucionar:
`pendiente → respondida | vencida`.

### SRS-INF-007
Un token vencido no deberá permitir respuesta.

### SRS-INF-008
La respuesta podrá incluir texto y archivos autorizados.

---

## 11. Gestión interna

### SRS-GES-001
Solo usuarios aprobados con rol permitido deberán acceder a Gestión.

### SRS-GES-002
La Gestión deberá ofrecer una vista Kanban.

### SRS-GES-003
El Kanban deberá agrupar por estado de servicio.

### SRS-GES-004
La Gestión deberá ofrecer una vista Tabla consolidada por PED.

### SRS-GES-005
Deberán existir búsqueda y filtros al menos por:
- área;
- estado;
- responsable;
- PED/solicitante cuando aplique.

### SRS-GES-006
El MVP no requerirá drag & drop.

### SRS-GES-007
El detalle deberá distinguir visualmente:
- estado general del PED;
- estado de cada servicio.

### SRS-GES-008
Las acciones críticas deberán ejecutarse mediante RPC/Edge controlados.

---

## 12. Usuarios, Auth y autorización

### SRS-AUTH-001
Supabase Auth deberá autenticar al personal interno.

### SRS-AUTH-002
Los solicitantes públicos no deberán requerir cuenta Auth.

### SRS-AUTH-003
Una cuenta nueva deberá quedar con `estado_acceso = pendiente`.

### SRS-AUTH-004
Una cuenta pendiente no deberá leer datos operativos.

### SRS-AUTH-005
Una cuenta revocada no deberá conservar autorización de negocio aunque su JWT
técnico continúe vigente.

### SRS-AUTH-006
Roles de aplicación mínimos:
- `equipo_interno`;
- `admin`.

### SRS-AUTH-007
`nombre_usuario` deberá:
- tener entre 2 y 30 caracteres;
- estar en minúsculas;
- cumplir `[a-z0-9._-]`;
- ser único.

### SRS-AUTH-008
El cliente no deberá poder asignarse o elevar su propio rol.

### SRS-AUTH-009
La administración de usuarios deberá validarse server-side.

---

## 13. RLS y permisos

### SRS-RLS-001
Toda tabla operativa expuesta por Data API deberá tener RLS habilitada.

### SRS-RLS-002
Los grants deberán seguir mínimo privilegio.

### SRS-RLS-003
El rol `anon` no deberá tener SELECT directo sobre tablas de PED/PII.

### SRS-RLS-004
`authenticated` no deberá equivaler automáticamente a acceso operativo.

### SRS-RLS-005
Las policies deberán comprobar `estado_acceso = aprobado` cuando corresponda.

### SRS-RLS-006
Las acciones administrativas deberán comprobar `app_role = admin`.

### SRS-RLS-007
Toda policy deberá tener tests allow/deny.

---

## 14. RPC y Edge Functions

### SRS-API-001
Las operaciones de negocio críticas deberán realizarse mediante RPC controladas.

### SRS-API-002
Las Edge Functions se usarán solo cuando haya frontera HTTP pública, tokens,
rate limiting, CORS, secrets o signed uploads.

### SRS-API-003
`create-pedido` deberá invocar una operación transaccional en PostgreSQL.

### SRS-API-004
`servicio_assign` deberá validar que el responsable esté aprobado.

### SRS-API-005
`servicio_update` deberá aceptar únicamente campos explícitamente permitidos.

### SRS-API-006
`servicio_finalize` deberá validar la entrega.

### SRS-API-007
`tracking-get` deberá devolver un DTO público mínimo.

### SRS-API-008
Los errores HTTP no deberán exponer SQL, stacktraces ni secretos.

### SRS-API-009
Los endpoints sensibles deberán usar allowlist de origins.

---

## 15. Storage

### SRS-STO-001
Los archivos deberán almacenarse en Supabase Storage.

### SRS-STO-002
El bucket operativo deberá ser privado.

### SRS-STO-003
Los archivos no deberán almacenarse en `wp-content/uploads`.

### SRS-STO-004
El público no deberá recibir INSERT/SELECT genérico sobre el bucket.

### SRS-STO-005
Las cargas públicas deberán usar signed upload temporal.

### SRS-STO-006
Las descargas deberán usar autorización o signed URL temporal.

### SRS-STO-007
Los paths no deberán contener PII ni secretos.

### SRS-STO-008
Deberá existir un proceso para limpiar uploads huérfanos.

---

## 16. Eventos, colas y n8n

### SRS-EVT-001
Toda comunicación asíncrona deberá originarse en un evento durable.

### SRS-EVT-002
Supabase Queues deberá separar la transacción de negocio de n8n.

### SRS-EVT-003
La indisponibilidad de n8n no deberá revertir un PED confirmado.

### SRS-EVT-004
Cada evento deberá tener `event_id` único.

### SRS-EVT-005
El consumidor deberá ser idempotente.

### SRS-EVT-006
Los reintentos deberán ser acotados.

### SRS-EVT-007
Después del máximo de intentos deberá existir estado failed/dead-letter operativo.

### SRS-EVT-008
n8n no deberá:
- generar PED;
- decidir roles;
- autorizar usuarios;
- ser fuente de verdad.

---

## 17. WordPress

### SRS-WP-001
WordPress deberá alojar la interfaz bajo `/formulariomedios`.

### SRS-WP-002
La aplicación deberá distribuirse como plugin propio.

### SRS-WP-003
El plugin deberá usar APIs WordPress para assets y routing.

### SRS-WP-004
El plugin no deberá crear tablas operativas `wp_pedidos_*`.

### SRS-WP-005
La sesión de WordPress no deberá autorizar PEDIDOS.

### SRS-WP-006
Los estilos deberán estar aislados del theme.

### SRS-WP-007
El plugin no deberá contener Supabase secret key, JWT secret, credenciales n8n
o credenciales de email.

---

## 18. Requisitos de seguridad

### SRS-SEC-001
Todo input del navegador deberá considerarse no confiable.

### SRS-SEC-002
La publishable key no deberá considerarse mecanismo de autorización.

### SRS-SEC-003
Los secretos deberán existir solo server-side.

### SRS-SEC-004
Los tokens públicos deberán tener entropía suficiente y persistirse como hash.

### SRS-SEC-005
Las operaciones críticas deberán dejar auditoría.

### SRS-SEC-006
Los logs no deberán incluir:
- passwords;
- raw tokens;
- Authorization headers;
- cookies;
- secret keys.

### SRS-SEC-007
Los archivos deberán validarse por extensión, MIME, tamaño y contexto.

### SRS-SEC-008
Deberá existir protección anti-abuso para endpoints públicos.

---

## 19. Requisitos de usabilidad y accesibilidad

### SRS-UX-001
El frontend deberá ser responsive en desktop, tablet y móvil.

### SRS-UX-002
Los formularios deberán tener labels visibles.

### SRS-UX-003
Los errores deberán asociarse a sus campos.

### SRS-UX-004
El sistema deberá proporcionar estados:
- loading;
- empty;
- error;
- success;
- unauthorized.

### SRS-UX-005
El objetivo de accesibilidad será WCAG 2.2 AA.

### SRS-UX-006
La interfaz deberá ser navegable por teclado.

---

## 20. Requisitos de rendimiento y confiabilidad

### SRS-NFR-001
La creación de PED deberá ser transaccional.

### SRS-NFR-002
La creación deberá ser idempotente ante retries.

### SRS-NFR-003
La UI no deberá depender de Realtime para funcionar correctamente.

### SRS-NFR-004
Los listados de Gestión deberán usar índices adecuados para estado, responsable,
área y fechas.

### SRS-NFR-005
Las operaciones asíncronas deberán admitir reintento sin duplicados.

### SRS-NFR-006
El sistema deberá poder recuperarse de fallo de n8n sin pérdida de negocio.

---

## 21. Requisitos de auditoría y observabilidad

### SRS-AUD-001
Las operaciones sensibles deberán registrar:
- actor;
- acción;
- entidad;
- timestamp;
- request_id;
- old/new values relevantes.

### SRS-AUD-002
No se deberán registrar secretos ni PII innecesaria.

### SRS-AUD-003
Los errores de backend deberán poder correlacionarse mediante `request_id`.

---

## 22. Requisitos de migración

### SRS-MIG-001
Los PED visibles existentes deberán conservarse.

### SRS-MIG-002
La migración no deberá transformar N servicios de un PED en N PED diferentes.

### SRS-MIG-003
La secuencia nueva deberá inicializarse por encima del máximo PED migrado.

### SRS-MIG-004
Los archivos migrados deberán quedar privados.

### SRS-MIG-005
Los usuarios deberán reestablecer credenciales si los hashes actuales no son
compatibles de forma segura con Supabase Auth.

### SRS-MIG-006
La migración deberá ensayarse en staging antes del cutover.

### SRS-MIG-007
El cutover deberá tener rollback documentado.

---

## 23. Requisitos de entorno y despliegue

### SRS-ENV-001
El desarrollo deberá poder ejecutarse localmente sin servicios pagos obligatorios.

### SRS-ENV-002
Deberán existir entornos separados:
- local;
- staging;
- production.

### SRS-ENV-003
Las migrations deberán versionarse en el repositorio oficial.

### SRS-ENV-004
El plugin deberá ser entregable como ZIP versionado.

### SRS-ENV-005
No se deberán reutilizar datos personales de Production en local.

---

## 24. Trazabilidad mínima

| Área SRS | Documentos relacionados |
|---|---|
| Producto | `00_PRD.md` |
| Arquitectura | `01_ARQUITECTURA_OFICIAL.md` |
| Funcional | `02_REQUISITOS_FUNCIONALES.md` |
| Flujos | `03_FLUJOS_USUARIO.md` |
| UI | `04_UI_UX_Y_PANTALLAS.md` |
| Datos | `05_MODELO_DATOS_SUPABASE.md` |
| Auth/RLS | `06_AUTENTICACION_RBAC_RLS.md` |
| RPC/Edge | `07_RPC_EDGE_FUNCTIONS.md` |
| Storage | `08_STORAGE_ARCHIVOS.md` |
| Eventos/n8n | `09_EVENTOS_QUEUES_N8N.md` |
| Plugin | `10_PLUGIN_WORDPRESS.md` |
| API | `11_API_Y_CONTRATOS.md` |
| Seguridad | `12_SEGURIDAD.md` |
| Entornos | `13_ENTORNOS_SECRETOS_DESPLIEGUE.md` |
| QA | `14_PRUEBAS_QA_ACEPTACION.md` |
| Plan | `15_PLAN_IMPLEMENTACION.md` |
| Migración | `16_MIGRACION_WEWEB.md` |
| ADR | `17_DECISIONES_ARQUITECTURA_ADR.md` |
| Trazabilidad | `18_TRAZABILIDAD.md` |
| Formulario | `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md` |

---

## 25. Decisiones abiertas

### OPEN-001
Regla exacta de agregación de `estado_general` con servicios terminales mixtos.

### OPEN-002
Definir si Notion seguirá existiendo.

### OPEN-003
Definir retención/borrado de PII, archivos y auditoría.

### OPEN-004
Resuelto documentalmente para desarrollo por ADR-032: WordPress 7.0.2 / PHP 8.2.31. La instalación y compatibilidad efectiva requieren evidencia antes del release.

Estas decisiones no invalidan el resto del SRS, pero bloquean la implementación
de las funciones directamente relacionadas.

---

## 26. Criterio de aceptación del SRS

Este SRS se considera satisfecho cuando:
- cada requisito implementado tiene prueba asociada;
- ningún requisito de seguridad depende solo del frontend;
- la regla `1 envío = 1 PED = N servicios` se mantiene en código y migración;
- RLS y roles pasan pruebas negativas;
- la creación es atómica e idempotente;
- archivos son privados;
- n8n puede fallar sin invalidar el negocio;
- la solución completa puede sustituir WeWeb con rollback disponible.

## 27. Baseline de compatibilidad de ejecución

### SRS-COMP-001
El plugin deberá funcionar con WordPress 7.0.2 y PHP 8.2.31.

### SRS-COMP-002
La app deberá poder montarse dentro de una página Elementor mediante
shortcode/app shell sin depender internamente de Elementor.

### SRS-COMP-003
El CSS deberá aislarse de Betheme, Elementor y ElementsKit.

### SRS-COMP-004
La inicialización frontend deberá ser idempotente ante renders repetidos de
Elementor preview/editor.

### SRS-COMP-005
El plugin deberá funcionar con Wordfence Security activo.

### SRS-COMP-006
El plugin deberá funcionar con WP Super Cache activo y versionar sus assets.

### SRS-COMP-007
La comunicación HTTPS navegador → Supabase deberá mantenerse operativa.

### SRS-COMP-008
Los límites PHP de upload no deberán ser una dependencia para adjuntos PEDIDOS;
estos continuarán directos a Supabase Storage.

### SRS-COMP-009
Antes de producción deberá existir un ensayo de migración en staging verificado, además de un procedimiento aprobado de instalación y rollback. Si no existe staging del WordPress institucional, una réplica representativa podrá utilizarse solo con excepción explícita del propietario y responsable receptor; no elimina SRS-MIG-006 ni SRS-ENV-002.

## 28. Requisitos de cierre incorporados en revisión 2.0
| ID | Requisito verificable |
|---|---|
| SRS-TOK-001 | La credencial de acceso se valida por hash; cualquier copia cifrada para envío es temporal, separada, restringida y trazable sin registrar el token. |
| SRS-TOK-002 | Un replay de creación no genera ni rota tokens; la recuperación usa un flujo independiente y no invalida el acceso vigente por una simple solicitud pública. |
| SRS-TOK-003 | La validación de enlaces no consume credenciales; una acción explícita autorizada consume o canjea el token de un solo uso de forma atómica. |
| SRS-UPL-001 | Toda asociación de archivo consume una reserva verificada del mismo contexto/presentación; paths aportados libremente no autorizan asociación. |
| SRS-UPL-002 | La limpieza respeta cargas activas, ventanas técnicas de upload y transacciones de vinculación; no elimina objetos asociados. |
| SRS-CON-001 | Misma clave idempotente y contenido diferente produce conflicto; reintentos concurrentes de la misma operación retornan una sola entidad. |
| SRS-CON-002 | Una escritura sobre una versión obsoleta de servicio produce conflicto, sin sobrescribir silenciosamente cambios ajenos. |
| SRS-EXP-001 | Las RPC exclusivas de Edge/automatización no son ejecutables directamente por anon ni por usuarios internos. |
| SRS-EVT-009 | Cada entrega tiene identidad estable y una sola reclamación vigente; ACK y cambios de ledger se validan con el intento actual. |
| SRS-EVT-010 | Un resultado incierto del proveedor no se reenvía a ciegas fuera de su garantía documentada de idempotencia. |
| SRS-EVT-011 | El estado enviado indica aceptación por proveedor; entrega real/rebote solo se afirma con evidencia del proveedor. |
| SRS-INT-001 | Se valida coherencia entre PED, servicio, tipo, área, solicitud de información y archivos en las operaciones permitidas. |
| SRS-REC-001 | La restauración incluye objetos de Storage y metadata, configuración necesaria y pedidos creados durante una ventana de rollback. |
| SRS-VER-001 | Cada release declara compatibilidad de versión de plugin, contrato API, migraciones, eventos y formularios. |

Estos requisitos formalizan correcciones técnicas autorizadas en la actualización documental. Los parámetros de negocio pendientes no se convierten en valores por defecto implícitos. Los casos y gates se encuentran en 14, 15 y 18.
