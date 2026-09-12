# PEDIDOS — Consolidado revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Documentos incluidos:** `00_PRD.md`, `00A_SRS.md`, `02_REQUISITOS_FUNCIONALES.md`, `03_FLUJOS_USUARIO.md`, `04_UI_UX_Y_PANTALLAS.md`, `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md`


---

# DOCUMENTO: 00_PRD.md

# 00 — PRD · Product Requirements Document

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Resumen

PEDIDOS recibe solicitudes de servicios de comunicación de la Secretaría de Medios. Una persona puede completar un único formulario y solicitar varias piezas o servicios; **cada pieza/servicio genera un PED independiente**. Los PED nacidos juntos conservan una agrupación interna de envío solo para idempotencia, correo inicial, materiales compartidos y trazabilidad.

## 2. Problema

La versión anterior de la documentación modelaba un PED con múltiples servicios. El propietario funcional corrigió esa regla: el trabajo operativo debe seguirse, asignarse, finalizarse y cancelarse por pieza. Al mismo tiempo, el ciudadano no debe recibir varios correos de confirmación por un mismo formulario.

## 3. Objetivos

- Retirar WeWeb sin perder funciones necesarias.
- Publicar bajo `/formulariomedios`.
- Mantener Supabase como fuente de verdad del negocio.
- Entregar el frontend como plugin WordPress.org.
- Crear un PED independiente por pieza/servicio.
- Agrupar en un único email los PED del envío inicial.
- Mantener cambios posteriores y seguimiento por PED.
- Incorporar ocho categorías de servicio.
- Usar Google Drive como almacenamiento físico de archivos.
- Mantener n8n fuera de la transacción crítica.
- Garantizar permisos, trazabilidad, idempotencia y auditoría.

## 4. No objetivos del MVP

- No guardar PEDIDOS en MySQL/MariaDB de WordPress.
- No usar `wp_users` como autorización de PEDIDOS.
- No usar n8n para generar PED ni almacenar binarios.
- No exponer Google Drive al solicitante.
- No exigir drag & drop.
- No exigir Realtime.
- No integrar Notion al core mientras `OPEN-002` siga abierto.
- No borrar físicamente PED por archivado.
- No inventar reglas de retención aún no aprobadas.

## 5. Actores

**Solicitante público:** crea PED, sigue cada uno y responde pedidos de información.  
**Usuario pendiente:** tiene identidad pero no acceso operativo.  
**Equipo:** trabaja, asigna y gestiona PED.  
**Administrador:** además administra usuarios y roles.  
**Observador:** consulta pedidos en modo solo lectura.

## 6. Regla central

```text
UN envío del formulario
        ↓
   1..N PED independientes
        ↓
cada PED = una pieza/servicio
```

Ejemplo:

```text
Envío E-...
├── PED-2026-D000101 — Flyer
├── PED-2026-D000102 — Invitación digital
└── PED-2026-C000103 — Cobertura de eventos
```

El `envio_id` es interno y no reemplaza al PED visible.

## 7. Categorías

1. Diseño gráfico.
2. Cobertura de eventos.
3. Gacetilla de prensa.
4. Publicaciones en redes sociales.
5. Producción audiovisual.
6. Animación y motion graphics.
7. Transmisión en vivo / streaming.
8. Sitios y contenidos web.

Diseño gráfico puede contener varias piezas seleccionadas en un mismo formulario; cada una genera su PED.

## 8. Formulario público

### Datos personales
- Nombre y apellido.
- Teléfono/WhatsApp.
- Correo electrónico.
- Área/dependencia solicitante.

### Selección y formularios
Solo se muestran los formularios elegidos. Las cuatro categorías nuevas incluyen `¿Necesitás asesoramiento para definir la pieza?`; si se elige Sí, se reduce el formulario a objetivo breve y canal preferido de contacto.

### Adjuntos
- máximo 10;
- máximo 10 MB cada uno;
- link al material opcional para material pesado;
- en envío con varios PED, archivo/link puede aplicarse a todos o a uno específico;
- archivos físicos en Google Drive.

### Confirmación
Resumen editable, confirmación explícita y envío idempotente.

## 9. Numeración

Formato:
`PED-YYYY-CNNNNNN`

`C` es código de categoría; la parte numérica usa **una única secuencia global por año**.

Ejemplo:

```text
PED-2026-D000101
PED-2026-C000102
PED-2026-G000103
```

## 10. Seguimiento público

Cada PED se consulta de forma independiente. El número visible no basta: se utiliza token seguro. El seguimiento puede mostrar estado, fechas, mensajes públicos, información solicitada y entrega. Nunca muestra notas internas ni datos técnicos.

## 11. Estados

- Nuevo.
- En revisión.
- En proceso.
- Esperando información.
- Finalizado.
- Cancelado.

Para pasar de Nuevo a En revisión debe existir responsable. Asignar no es un estado.

## 12. Gestión interna

- Dashboard por rol.
- Tablero + tabla.
- Mis pedidos.
- Sin asignar.
- Requieren atención.
- Finalizados.
- Cancelados.
- Archivo.
- Detalle del PED con resumen, solicitante, material, comunicación, notas internas e historial.
- Sin drag & drop en MVP.

## 13. Archivado

Finalizados y Cancelados pueden archivarse para limpiar el área de trabajo. Archivar no cambia el estado, no borra datos y es reversible. Toda acción se audita.

## 14. Usuarios

Roles:
- Administrador;
- Equipo;
- Observador.

Estados de acceso:
- pendiente;
- aprobado;
- rechazado;
- revocado.

Alta mediante solicitud o invitación. Login por email + contraseña. `nombre_usuario` único funciona como identidad operativa de asignación.

## 15. Comunicaciones

**Correo inicial:** uno por envío, con todos los PED creados y enlaces de seguimiento.  
**Después:** cada cambio genera, cuando corresponda, un correo solo del PED afectado.

n8n procesa notificaciones asíncronas; su falla no revierte la operación.

## 16. Entrega

Finalizar requiere archivo, enlace o ambos. Las entregas posteriores se versionan; una nueva entrega no borra silenciosamente la anterior.

## 17. Alertas

- sin responsable;
- sin actividad;
- esperando información;
- solicitud vencida;
- fecha límite próxima/vencida.

Alertar no cambia automáticamente estados.

## 18. Requisitos no funcionales

Seguridad por RLS/RPC/Edge, secretos server-side, OAuth Drive protegido, auditoría, idempotencia, concurrencia, WCAG 2.2 AA, responsive, compatibilidad con WordPress receptor, y desarrollo sin compra obligatoria de software.

## 19. Criterios de éxito

- N piezas → N PED.
- Un correo inicial agrupa N PED.
- Notificación posterior solo por PED afectado.
- Numeración global anual sin colisiones.
- Retry no duplica.
- Seguimiento seguro.
- Asignación obligatoria antes de En revisión.
- Observador realmente solo lectura.
- Archivos privados en Drive.
- Archivo histórico reversible.
- QA/RLS/security aprobados.
- Cutover y rollback ensayados.

## 20. Decisiones abiertas remanentes

- `OPEN-002`: Notion.
- `OPEN-003`: retención/borrado institucional.
- `OPEN-008`: staging receptor e instalación.
- `OPEN-009`: proveedor de email e idempotencia externa.
- `OPEN-010`: framework UI y versiones.
- `OPEN-011`: objetivos de volumen/latencia/RPO/RTO y algunos umbrales.
- `OPEN-012`: TTL exactos de tokens/capacidades y antiabuso.
- `OPEN-013`: estrategia de migración histórica de PED multiservicio de la revisión 2.0.
- `OPEN-014`: extensiones/MIME adicionales para material audiovisual menor de 10 MB.
- `OPEN-015`: protección del último Administrador y procedimiento de recuperación administrativa.
- `OPEN-016`: mecanismo definitivo de upload/download Drive tras prueba de integración en browsers objetivo.

## 21. Evidencia

Esta revisión registra decisiones funcionales aprobadas en conversación el 11/09/2026. No implica que el repositorio, Supabase, Drive, n8n o WordPress ya estén implementados o configurados.



---

# DOCUMENTO: 00A_SRS.md

# 00A — SRS · Software Requirements Specification

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Propósito

Definir requisitos verificables de PEDIDOS después de las decisiones funcionales aprobadas el 11/09/2026. Esta revisión reemplaza el modelo anterior `1 envío = 1 PED = N servicios`.

## 2. Alcance del sistema

PEDIDOS recibe uno o más requerimientos de comunicación desde un único formulario público. Cada pieza o servicio solicitado se convierte en un PED independiente. WordPress.org aloja la interfaz; Supabase gestiona datos, Auth, permisos, lógica y auditoría; Google Drive almacena los archivos físicos; n8n procesa notificaciones e integraciones asíncronas.

## 3. Actores

### ACT-001 — Solicitante público
Crea uno o más PED en un mismo envío, consulta cada PED mediante seguimiento seguro, responde solicitudes de información y recibe entregas.

### ACT-002 — Usuario pendiente
Posee identidad Supabase Auth pero aún no tiene acceso operativo.

### ACT-003 — Equipo
Puede trabajar pedidos, asignar/reasignar, cambiar estados, solicitar información, registrar notas, entregar, cancelar, archivar y restaurar.

### ACT-004 — Administrador
Tiene todas las capacidades de Equipo y además administra altas, rechazos, roles y revocaciones de usuarios.

### ACT-005 — Observador
Solo lectura sobre información de pedidos. No puede ejecutar ni visualizar controles de operación o administración.

## 4. Regla estructural principal

### SRS-BIZ-001
Un envío confirmado deberá crear uno o más PED independientes.

### SRS-BIZ-002
Cada pieza o servicio solicitado deberá crear exactamente un PED.

### SRS-BIZ-003
Los PED nacidos del mismo envío deberán quedar vinculados mediante una entidad interna `envios_formulario`, sin exponer un identificador adicional al solicitante.

### SRS-BIZ-004
Cada PED deberá poseer directamente su categoría, tipo, estado, responsable, datos específicos, archivos asociados, comunicaciones, seguimiento y entrega.

### SRS-BIZ-005
No deberá existir un segundo nivel operativo `servicios_solicitados` para representar trabajo dentro de un PED nuevo.

### SRS-BIZ-006
El envío común deberá permitir agrupar el correo inicial, la idempotencia y los archivos/materiales compartidos sin fusionar el ciclo de vida de los PED.

## 5. Requisitos funcionales públicos

### SRS-FUN-001 — Inicio
Un usuario no autenticado deberá poder iniciar una presentación.

### SRS-FUN-002 — Wizard
El formulario deberá organizarse en:
1. datos personales;
2. selección de categorías;
3. formularios de servicios seleccionados;
4. adjuntos/material;
5. resumen y confirmación.

La UI puede presentar esos bloques como pasos equivalentes mientras conserve el flujo.

### SRS-FUN-003 — Datos personales
Requerir:
- nombre y apellido;
- teléfono/WhatsApp;
- correo electrónico;
- área/dependencia solicitante.

### SRS-FUN-004 — Categorías
Permitir una o más:
- Diseño gráfico;
- Cobertura de eventos;
- Gacetilla de prensa;
- Publicaciones en redes sociales;
- Producción audiovisual;
- Animación y motion graphics;
- Transmisión en vivo / streaming;
- Sitios y contenidos web.

### SRS-FUN-005 — Render condicional
Mostrar únicamente los formularios de las categorías/piezas seleccionadas.

### SRS-FUN-006 — Diseño gráfico
Permitir seleccionar una o varias piezas:
- Flyer RRSS;
- Invitación digital;
- Certificados;
- Otros requerimientos gráficos.
Cada pieza seleccionada crea un PED independiente.

### SRS-FUN-007 — Asesoramiento
Las cuatro categorías nuevas deberán ofrecer al inicio:
`¿Necesitás asesoramiento para definir la pieza?`.

Aplica a:
- Producción audiovisual;
- Animación y motion graphics;
- Streaming;
- Sitios y contenidos web.

Si se elige asesoramiento:
- no se exigirán los campos técnicos específicos;
- se pedirá una descripción breve del objetivo;
- se permitirá elegir contacto preferido WhatsApp o email;
- se reutilizarán teléfono y correo del Paso 1;
- podrá ofrecerse acceso directo a WhatsApp/email del área;
- la solicitud deberá crear igualmente un PED de la categoría.

### SRS-FUN-008 — Conservación
Volver entre pasos, validar o recibir un error recuperable no deberá borrar datos válidos de la sesión activa.

### SRS-FUN-009 — Resumen
Antes del envío definitivo deberá mostrarse cada solicitud por separado, sus datos, adjuntos/material asociado y controles para editar.

### SRS-FUN-010 — Confirmación
El envío definitivo requerirá confirmación explícita de que los datos fueron revisados.

### SRS-FUN-011 — Resultado
Tras éxito, mostrar todos los PED generados, cada uno con su categoría/tipo y acceso seguro de seguimiento.

## 6. PED y numeración

### SRS-PED-001
Formato:
`PED-{YYYY}-{CODIGO}{NNNNNN}`.

### SRS-PED-002
Códigos:
- D — Diseño gráfico;
- C — Cobertura de eventos;
- G — Gacetilla;
- R — Redes sociales;
- P — Producción audiovisual;
- M — Motion graphics;
- S — Streaming;
- W — Web.

### SRS-PED-003
La secuencia numérica deberá ser global por año, no por categoría.

Ejemplo válido:
- `PED-2026-D000101`;
- `PED-2026-C000102`;
- `PED-2026-G000103`.

### SRS-PED-004
La secuencia reinicia en cada año calendario.

### SRS-PED-005
La reserva del número deberá ejecutarse atómicamente en PostgreSQL.

### SRS-PED-006
WordPress, JavaScript y n8n no deberán generar números PED.

### SRS-PED-007
La creación de todos los PED de un envío y sus relaciones críticas deberá protegerse contra creación parcial.

### SRS-PED-008 — Idempotencia
El envío deberá usar `submission_key` + `request_fingerprint`. Un retry idéntico devuelve el mismo conjunto de PED. La misma clave con contenido distinto deberá rechazarse como conflicto.

## 7. Estados y responsabilidad

### SRS-EST-001
Estados permitidos por PED:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información;
- Finalizado;
- Cancelado.

### SRS-EST-002
`Asignado` y `Correcciones` dejan de ser estados.

### SRS-EST-003
Un PED en `Nuevo` no podrá pasar a `En revisión` si no posee responsable.

### SRS-EST-004
Toda asignación/reasignación deberá registrar:
- actor que asigna;
- responsable anterior;
- responsable nuevo;
- fecha/hora.

### SRS-EST-005
Un PED activo que ya alcanzó `En revisión` no deberá quedar sin responsable; deberá reasignarse a otro usuario aprobado cuando corresponda.

### SRS-EST-006
Cancelar requiere motivo obligatorio.

### SRS-EST-007
Finalizar requiere una entrega válida: al menos archivo, enlace o ambos.

### SRS-EST-008
Un PED Finalizado no pasa directamente a Cancelado.

### SRS-EST-009
Un PED Cancelado puede reabrirse por Administrador o Equipo con motivo obligatorio:
- a `Nuevo` si queda sin responsable;
- a `En revisión` si conserva/asigna responsable.

### SRS-EST-010
Solicitar información no cambia automáticamente el estado del PED. El operador decide si corresponde `Esperando información`.

### SRS-EST-011
Toda transición deberá validarse server-side y auditarse.

## 8. Seguimiento público

### SRS-SEG-001
Cada PED deberá tener seguimiento independiente.

### SRS-SEG-002
Conocer el PED visible no será autorización suficiente.

### SRS-SEG-003
El seguimiento requerirá token seguro; el token persistido deberá almacenarse como hash.

### SRS-SEG-004
El correo inicial podrá incluir un botón/enlace seguro independiente para cada PED.

### SRS-SEG-005
El DTO público podrá incluir:
- PED;
- tipo/categoría;
- estado;
- fecha de creación;
- última actualización;
- mensajes explícitamente públicos;
- solicitudes de información dirigidas al solicitante;
- entregas autorizadas.

### SRS-SEG-006
Excluir:
- notas internas;
- datos administrativos;
- UUID Auth;
- emails de empleados;
- secretos;
- auditoría técnica.

### SRS-SEG-007
La recuperación por email deberá responder neutralmente para impedir enumeración.

## 9. Solicitudes de información

### SRS-INF-001
Administrador y Equipo podrán solicitar información para un PED.

### SRS-INF-002
Cada solicitud tendrá ciclo:
`pendiente → respondida | vencida`.

### SRS-INF-003
Vigencia funcional inicial: 15 días.

### SRS-INF-004
El solicitante podrá responder texto, adjuntos permitidos y/o link al material.

### SRS-INF-005
Responder no cambiará automáticamente el estado del PED.

### SRS-INF-006
Toda creación/respuesta/vencimiento deberá ser trazable.

## 10. Archivos y material externo

### SRS-STO-001
El almacenamiento físico principal de archivos será una carpeta dedicada de Google Drive controlada por la aplicación.

### SRS-STO-002
Supabase conservará metadata, asociaciones, reservas, permisos y auditoría; no el binario principal.

### SRS-STO-003
El solicitante no deberá ver la interfaz de Drive ni recibir credenciales OAuth.

### SRS-STO-004
Límite de presentación pública:
- máximo 10 archivos;
- máximo 10 MB por archivo.

### SRS-STO-005
Si el material supera 10 MB por archivo, el formulario ofrecerá `Link al material (opcional)`.

### SRS-STO-006
Con un solo PED en el envío, un archivo/link se asociará a ese PED sin pregunta adicional.

### SRS-STO-007
Con varios PED, el usuario podrá asociar cada archivo/link:
- a todos los PED del envío; o
- a un PED específico.

### SRS-STO-008
Un archivo compartido por varios PED no deberá duplicarse físicamente por obligación; se permiten asociaciones N:M.

### SRS-STO-009
Los archivos finales deberán diferenciarse de material recibido y conservar versiones de entrega cuando se reemplacen.

### SRS-STO-010
Las credenciales OAuth, client secret y refresh token de Google deberán permanecer exclusivamente server-side.

### SRS-STO-011
La integración deberá usar OAuth 2.0 de servidor con acceso offline y el scope mínimo viable. `drive.file` es el alcance preferido cuando el flujo de bootstrap permita que la app cree/gestione su carpeta.

## 11. Gestión interna

### SRS-GES-001
Vista principal híbrida:
- Tablero para operación diaria;
- Tabla para búsqueda y volumen.

### SRS-GES-002
El tablero activo mostrará principalmente:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información.

Finalizados y Cancelados se consultarán en vistas separadas.

### SRS-GES-003
No se requiere drag & drop en MVP. Cambios de estado usarán acciones controladas.

### SRS-GES-004
Accesos rápidos:
- Todos;
- Mis pedidos;
- Sin asignar;
- Requieren atención.

### SRS-GES-005
Filtros mínimos:
- estado;
- servicio/categoría;
- responsable;
- área solicitante;
- fecha de ingreso;
- fecha límite si existe;
- con/sin responsable;
- requiere atención;
- archivado.

### SRS-GES-006
Búsqueda global por PED, solicitante, email/área cuando el rol esté autorizado y `nombre_usuario`.

### SRS-GES-007
La tabla deberá paginar; no cargar todos los registros de forma ilimitada.

### SRS-GES-008
El detalle de PED tendrá:
- Resumen;
- Solicitante;
- Material;
- Comunicación;
- Notas internas;
- Historial.

### SRS-GES-009
Toda acción importante quedará registrada.

## 12. Archivado

### SRS-ARC-001
Archivar no es un estado del PED.

### SRS-ARC-002
Finalizados y Cancelados podrán archivarse para limpiar el área operativa.

### SRS-ARC-003
Archivado será reversible mediante `Restaurar del archivo`.

### SRS-ARC-004
Archivar/restaurar no elimina datos ni modifica el estado terminal.

### SRS-ARC-005
La acción y su actor deberán auditarse.

## 13. Usuarios y Auth

### SRS-AUTH-001
Supabase Auth identifica usuarios internos. WordPress `wp_users` no autoriza PEDIDOS.

### SRS-AUTH-002
Alta disponible mediante:
- solicitud libre sujeta a aprobación;
- invitación de Administrador.

### SRS-AUTH-003
Datos:
- nombre;
- apellido;
- `nombre_usuario`;
- email;
- contraseña administrada por Supabase Auth.

### SRS-AUTH-004
El login será email + contraseña.

### SRS-AUTH-005
`nombre_usuario` será el identificador operativo para asignaciones y deberá ser único.

### SRS-AUTH-006
Una vez aprobado, el usuario no podrá modificar libremente `nombre_usuario`; un Administrador podrá cambiarlo y el cambio se auditará.

### SRS-AUTH-007
Estados de acceso:
- pendiente;
- aprobado;
- rechazado;
- revocado.

### SRS-AUTH-008
Roles:
- administrador;
- equipo;
- observador.

### SRS-AUTH-009
Pendiente, rechazado y revocado no tendrán acceso operativo.

### SRS-AUTH-010
La revocación deberá surtir efecto también sobre sesiones ya emitidas mediante verificación server-side del estado de acceso.

### SRS-AUTH-011
La recuperación de contraseña será gestionada por Supabase Auth.

## 14. RBAC

### SRS-RBAC-001 — Administrador
Puede administrar usuarios y realizar todas las acciones operativas sobre PED.

### SRS-RBAC-002 — Equipo
Puede trabajar PED, asignar/reasignar, cambiar estado, notas, información faltante, entregas, cancelación, archivo/restauración. No administra usuarios/roles.

### SRS-RBAC-003 — Observador
Solo lectura de pedidos; no puede ejecutar mutaciones.

### SRS-RBAC-004
La UI del Observador no renderizará botones ni menús de mutación.

### SRS-RBAC-005
Ocultar controles no sustituye autorización: RLS/RPC/Edge deberán rechazar las mutaciones no autorizadas.

## 15. Dashboard y alertas

### SRS-DASH-001
Administrador: resumen general, usuarios pendientes, operación y actividad reciente.

### SRS-DASH-002
Equipo: prioriza Mis pedidos, estados propios y atención requerida, con acceso a todos los PED según RBAC.

### SRS-DASH-003
Observador: resumen y navegación de consulta, sin acciones.

### SRS-DASH-004
Alertas mínimas:
- Nuevo sin responsable;
- Nuevo sin asignar después del umbral;
- sin actividad;
- esperando información;
- solicitud de información vencida;
- fecha límite próxima;
- fecha límite vencida.

### SRS-DASH-005
Las alertas no cambiarán estados automáticamente.

### SRS-DASH-006
Los umbrales serán configurables. Defaults funcionales:
- nuevo sin asignar: advertencia desde 1 día hábil;
- solicitud de información: 15 días;
- otros umbrales se versionarán/configurarán antes de producción.

## 16. Comunicaciones

### SRS-EVT-001
Un envío que crea N PED generará un único correo inicial al solicitante con todos los PED y sus enlaces seguros.

### SRS-EVT-002
Los cambios posteriores se notificarán únicamente por el PED afectado.

### SRS-EVT-003
Eventos al solicitante:
- creación agrupada;
- cambio de estado notificable;
- solicitud de información;
- confirmación de respuesta;
- finalización;
- cancelación;
- recuperación de seguimiento.

### SRS-EVT-004
Notificaciones internas relevantes:
- nuevo envío/PED;
- sin responsable según regla;
- respuesta de solicitante;
- solicitud de acceso;
- fallo de comunicación agotado.

### SRS-EVT-005
n8n deberá permanecer fuera de la transacción crítica.

### SRS-EVT-006
Un fallo de email nunca revierte una operación de negocio confirmada.

### SRS-EVT-007
Toda entrega de email tendrá ledger y estado técnico auditable.

## 17. Seguridad y no funcionales

- RLS y grants mínimos.
- Secretos únicamente server-side.
- Tokens públicos hasheados.
- CORS allowlist.
- Validación server-side de payloads y archivos.
- Prevención de IDOR y enumeración.
- Auditoría append-only lógica.
- Accesibilidad objetivo WCAG 2.2 AA.
- Responsive.
- Idempotencia y concurrencia verificadas.
- Caché WordPress no deberá cachear contenido autenticado/sensible.
- Desarrollo posible sin servicios pagos obligatorios; el almacenamiento Drive utiliza la cuenta ya disponible y no implica garantía contractual de gratuidad futura.

## 18. Criterios de aceptación globales

1. Un envío con 3 piezas crea 3 PED independientes.
2. Los tres PED comparten `envio_id`.
3. La secuencia numérica es global y anual.
4. El prefijo de categoría es correcto.
5. Doble clic/retry no duplica.
6. `Nuevo → En revisión` falla sin responsable.
7. Asignaciones/reasignaciones registran actor y destinatario.
8. Observador no puede mutar ni ve controles.
9. Archivo/restauración no borra ni cambia estado terminal.
10. 10 archivos de 10 MB se validan; el undécimo o >10 MB se rechaza con indicación de usar link.
11. Archivos generales pueden relacionarse con varios PED sin duplicado físico obligatorio.
12. Drive permanece privado y credenciales no llegan al navegador.
13. Correo inicial agrupa PED; cambios posteriores son individuales.
14. n8n caído no pierde cambios de negocio.
15. Seguimiento de un PED no expone otro PED del mismo envío sin su autorización.



---

# DOCUMENTO: 02_REQUISITOS_FUNCIONALES.md

# 02 — Requisitos funcionales

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Portal y formulario

- Acceso público sin cuenta.
- Captura de identidad/contacto del solicitante.
- Selección de una o más de ocho categorías.
- Render condicional.
- Diseño admite varias piezas.
- Las cuatro categorías nuevas admiten flujo de asesoramiento.
- Resumen editable y confirmación final.
- Conservación de datos ante navegación y errores recuperables.

## 2. PED

- Cada pieza/servicio crea un PED.
- Un envío puede crear N PED.
- Formato `PED-YYYY-CNNNNNN`.
- Secuencia global por año.
- Categoría representada por código.
- Creación idempotente y segura bajo concurrencia.
- Cada PED tiene seguimiento propio.

## 3. Datos específicos de servicios

Los contratos exactos viven en `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md`. No agregar campos obligatorios no aprobados.

## 4. Estados

`Nuevo`, `En revisión`, `En proceso`, `Esperando información`, `Finalizado`, `Cancelado`.

Reglas:
- En revisión exige responsable;
- Cancelado exige motivo;
- Finalizado exige entrega;
- solicitud de información no cambia estado automáticamente;
- Finalizado no pasa directo a Cancelado;
- Cancelado puede reabrirse con motivo y auditoría.

## 5. Seguimiento

- PED + token seguro.
- DTO mínimo.
- mensajes públicos, info faltante y entrega;
- nunca notas internas ni seguridad técnica;
- recuperación por email anti-enumeración.

## 6. Información faltante

- mensaje;
- token seguro;
- 15 días;
- respuesta texto + archivos permitidos + link opcional;
- estado propio pendiente/respondida/vencida;
- no muta PED automáticamente.

## 7. Gestión

- Dashboard por rol;
- Tablero + Tabla;
- Mis pedidos;
- Sin asignar;
- Requieren atención;
- Finalizados/Cancelados;
- Archivo;
- filtros/paginación/búsqueda;
- detalle integral;
- historial.

## 8. Asignaciones

- Administrador y Equipo pueden asignar/reasignar.
- Responsable se muestra por `nombre_usuario`.
- UUID Auth es identificador técnico.
- actor, origen, destino y timestamp quedan registrados.
- después de En revisión el PED no debe quedar sin responsable.

## 9. Usuarios

Roles:
- Administrador;
- Equipo;
- Observador.

Estados:
- pendiente;
- aprobado;
- rechazado;
- revocado.

Alta:
- solicitud pública interna;
- invitación de Administrador.

Login por email; `nombre_usuario` solo para identidad operativa.

## 10. Archivos

- Google Drive como binario.
- Supabase metadata.
- 10 archivos por presentación inicial.
- 10 MB máximo por archivo.
- link opcional si el material excede el peso.
- asociación a todos o a PED específico cuando hay varios.
- archivos recibidos y entregas diferenciados.
- acceso mediante backend autorizado.

## 11. Comunicaciones

- 1 email inicial por envío con N PED.
- después, email solo del PED afectado.
- eventos asíncronos.
- ledger y reintentos.
- n8n no modifica negocio implícitamente.

## 12. Archivado

- solo terminales Finalizado/Cancelado;
- no cambia estado;
- reversible;
- no borra;
- auditable.

## 13. UI

- acciones importantes visibles en lugar estable;
- Observador no ve acciones;
- sin drag & drop MVP;
- alertas claras, no basadas solo en color;
- mobile/responsive;
- WCAG 2.2 AA.

## 14. Alertas

- nuevo sin responsable;
- sin movimiento;
- esperando respuesta;
- información vencida;
- deadline próximo/vencido.
No cambian estados.

## 15. Entregas

- archivo, link o ambos;
- al menos uno requerido para Finalizado;
- reemplazo crea nueva versión y conserva historial interno.

## 16. Reglas que no deben inferirse

No inferir:
- retención definitiva;
- compra de Workspace;
- publicación de links Drive;
- formatos audiovisuales adicionales;
- proveedor email;
- SLA;
- transición no documentada;
- migración destructiva de históricos.



---

# DOCUMENTO: 03_FLUJOS_USUARIO.md

# 03 — Flujos de usuario

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Nueva solicitud pública

```text
/formulariomedios/
→ Datos personales
→ Selección de categorías
→ Formularios condicionales
→ Adjuntos/material
→ Resumen
→ Confirmar
→ creación idempotente de N PED
→ /solicitud-recibida con N PED
→ 1 email inicial agrupado
```

Un error recuperable no borra la sesión activa.

## 2. Diseño con varias piezas

Ejemplo:
- Flyer;
- Invitación digital.

Un solo formulario produce:
- `PED-2026-D000101`;
- `PED-2026-D000102`.

## 3. Asesoramiento

En Producción audiovisual, Motion graphics, Streaming o Web:

```text
¿Necesitás asesoramiento?
→ Sí
→ objetivo breve
→ WhatsApp o email
→ crear PED de la categoría
```

No se fuerzan campos técnicos que el solicitante todavía no puede definir.

## 4. Adjuntos

Si hay un PED:
- archivo/link queda asociado a ese PED.

Si hay varios:
- `Todas las solicitudes`; o
- PED/pieza específica.

Material >10 MB por archivo:
- no se sube por el formulario;
- se ofrece `Link al material (opcional)`.

## 5. Seguimiento

```text
email/pantalla de éxito
→ Ver seguimiento PED
→ validación PED + token
→ estado/mensajes/solicitudes/entrega
```

Cada enlace autoriza únicamente su PED.

## 6. Información faltante

```text
Equipo/Admin
→ Solicitar información
→ mensaje
→ correo al PED
→ solicitante responde texto/archivo/link
→ solicitud pasa a respondida
→ PED conserva estado salvo acción explícita
```

A los 15 días una solicitud pendiente puede marcarse vencida.

## 7. Solicitar acceso

```text
/solicitar-acceso
→ nombre
→ apellido
→ nombre_usuario
→ email
→ contraseña
→ estado pendiente
→ Administrador aprueba/rechaza + rol
```

## 8. Invitación

Administrador:
```text
Usuarios → Invitar
→ email + rol
→ Supabase Auth envía invitación
→ persona establece credencial
→ cuenta queda conforme al flujo de aprobación/invitación documentado
```

## 9. Login

Email + contraseña. Después de autenticar se valida `usuarios_acceso`.

- pendiente → pantalla pendiente;
- rechazado → acceso denegado;
- revocado → acceso denegado;
- aprobado → dashboard según rol.

## 10. Gestión diaria

Administrador:
- visión global;
- usuarios pendientes;
- tablero/tabla;
- acciones operativas.

Equipo:
- Mis pedidos primero;
- puede operar todo PED autorizado;
- puede asignar/reasignar.

Observador:
- lectura;
- no ve controles de mutación.

## 11. Asignación y En revisión

```text
PED Nuevo, sin responsable
→ operador intenta En revisión
→ sistema exige responsable
→ asignación auditada
→ transición En revisión
```

Puede ofrecerse en un único modal `Asignar y pasar a En revisión` sin perder la separación auditada de ambas operaciones.

## 12. Cambio de estado

El usuario selecciona un estado permitido; el backend valida precondiciones y versión.

No hay drag & drop obligatorio.

## 13. Esperando información

Solicitar información no cambia el estado. El operador puede, por separado, cambiar a `Esperando información`.

Cuando llega la respuesta tampoco cambia automáticamente: el responsable decide continuar en `En revisión` o `En proceso` según el flujo permitido.

## 14. Finalización

```text
Finalizar
→ archivo y/o link obligatorio
→ nota opcional
→ confirmar
→ Estado Finalizado
→ nueva versión de entrega
→ audit
→ evento
→ email al solicitante
```

Una corrección posterior de entrega crea una nueva versión, no borra la anterior.

## 15. Cancelación

```text
Cancelar
→ motivo obligatorio
→ confirmar
→ Cancelado
→ audit
→ email
```

Finalizado no pasa directo a Cancelado.

## 16. Reapertura

Cancelado:
```text
Reabrir
→ motivo obligatorio
→ Nuevo si no hay responsable
  o En revisión si hay responsable válido
→ audit
```

## 17. Archivado

Finalizado/Cancelado:
```text
Archivar
→ desaparece de vistas operativas por defecto
→ sigue consultable en Archivo
```

Restaurar:
```text
Archivo → Restaurar
→ vuelve a vista terminal correspondiente
→ estado no cambia
→ audit
```

## 18. Fallos

- n8n caído: negocio permanece confirmado.
- email falla: ledger reintenta/reconcilia.
- Drive upload falla antes de completar: no asociar archivo como válido.
- create response perdida: retry con misma clave devuelve mismos PED.
- token inválido: respuesta neutra.
- usuario revocado durante sesión: mutación denegada server-side.



---

# DOCUMENTO: 04_UI_UX_Y_PANTALLAS.md

# 04 — UI, UX y pantallas

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Principio

Interfaz institucional, clara y operativa. Evitar sobrecarga, acciones ambiguas y formularios técnicos innecesarios.

## 2. Pantallas

### `/formulariomedios/`
Wizard público.

### `/formulariomedios/solicitud-recibida`
Lista de todos los PED del envío:
- categoría/tipo;
- PED;
- botón seguimiento.

### `/formulariomedios/seguimiento`
Vista segura de un PED.

### `/formulariomedios/solicitud-informacion`
Respuesta a pedido de información.

### `/formulariomedios/login`
Email + contraseña, recuperación y enlace a solicitar acceso.

### `/formulariomedios/solicitar-acceso`
Nombre, apellido, `nombre_usuario`, email, contraseña.

### `/formulariomedios/gestion`
Dashboard + Tablero/Tabla.

### `/formulariomedios/pedido/:id`
Detalle interno.

### `/formulariomedios/usuarios`
Solo Administrador.

### `/formulariomedios/archivo`
Histórico archivado.

## 3. Wizard público

### Paso Datos
Campos de contacto.

### Paso Servicios
Ocho categorías. Solo se expanden las elegidas.

### Formularios
Cada pieza se presenta como tarjeta claramente separada. Diseño puede tener varias tarjetas simultáneas.

### Asesoramiento
En las cuatro categorías nuevas se ofrece al inicio. Al seleccionarlo, la interfaz oculta requisitos técnicos y muestra objetivo + preferencia de contacto.

### Adjuntos
Texto visible:
`Hasta 10 archivos, máximo 10 MB por archivo.`

Si un archivo supera 10 MB:
`El máximo por archivo es 10 MB. Si tu material pesa más, compartilo mediante Link al material.`

Con múltiples solicitudes se habilita selector:
- Todas las solicitudes;
- pieza específica.

### Resumen
Cada PED futuro aparece como bloque editable. No se muestra todavía número PED.

### Confirmación
Checkbox obligatorio + `Enviar solicitudes`.

## 4. Pantalla de éxito

Ejemplo:

```text
Solicitudes recibidas

Flyer
PED-2026-D000101
[Ver seguimiento]

Invitación digital
PED-2026-D000102
[Ver seguimiento]

Cobertura de eventos
PED-2026-C000103
[Ver seguimiento]
```

## 5. Dashboard

### Administrador
- activos;
- sin responsable;
- requieren atención;
- esperando información;
- usuarios pendientes;
- actividad reciente.

### Equipo
- Mis pedidos;
- En revisión;
- En proceso;
- Esperando información;
- Requieren mi atención;
- accesos a Todos/Sin asignar.

### Observador
- métricas de consulta;
- Tablero;
- Tabla;
- Finalizados;
- Archivo.
Sin controles de mutación.

## 6. Tablero

Columnas activas:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información.

Tarjeta:
- PED;
- servicio;
- área solicitante;
- responsable;
- fecha;
- alerta si aplica.

Finalizados/Cancelados fuera del tablero activo.

## 7. Tabla

Columnas:
- PED;
- servicio;
- estado;
- responsable;
- solicitante;
- área solicitante;
- fecha ingreso;
- fecha límite si aplica;
- última actividad;
- atención.

Búsqueda global y filtros por estado, servicio, responsable, área, fechas, asignación, atención y archivo. Paginación server-side.

## 8. Mis pedidos y atención

Accesos rápidos:
`Todos | Mis pedidos | Sin asignar | Requieren atención`.

Alertas ejemplos:
- `Sin responsable hace 2 días`.
- `Fecha límite mañana`.
- `Esperando respuesta hace 6 días`.

No depender solo de color.

## 9. Detalle PED

Cabecera:
- PED;
- servicio;
- estado;
- responsable;
- acciones autorizadas.

Bloques:
- Resumen;
- Solicitante;
- Material;
- Comunicación;
- Notas internas;
- Historial.

Acciones fijas/claras:
- asignar/reasignar;
- cambiar estado;
- solicitar información;
- agregar nota;
- finalizar;
- cancelar;
- archivar/restaurar.

Observador no recibe controles deshabilitados: no se renderizan.

## 10. Notas

Separar:
- `Nota interna`: nunca pública.
- `Mensaje para el solicitante`: puede aparecer en seguimiento.

## 11. Finalización

Modal:
- archivo final;
- link de entrega;
- mensaje opcional;
- confirmar.

Al menos archivo/link.

## 12. Cancelación y reapertura

Cancelación: motivo obligatorio.  
Reapertura: motivo obligatorio.

## 13. Responsive

- wizard a una columna en móvil;
- tabla puede usar cards/scroll controlado;
- tablero horizontal controlado;
- acciones táctiles suficientes;
- sin overflow crítico dentro de Elementor.

## 14. Accesibilidad

WCAG 2.2 AA objetivo:
- teclado;
- foco visible;
- labels;
- errores anunciados;
- contraste;
- focus trap;
- no color-only;
- `aria-live` para estados asíncronos.

## 15. Integración WordPress

Namespace `.pedidos-app`; sin selectores globales. Montaje idempotente frente a renders repetidos de Elementor. No iniciar acciones reales por preview/editor.



---

# DOCUMENTO: 19_ESPECIFICACION_FORMULARIO_SERVICIOS.md

# 19 — Especificación de formulario y servicios

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Datos personales

| Campo | Requerido |
|---|---:|
| Nombre y apellido | Sí |
| Teléfono / WhatsApp | Sí |
| Correo electrónico | Sí |
| Área/dependencia solicitante | Sí |
| ¿Qué necesitás solicitar? | mínimo 1 |

## 2. Categorías y códigos PED

| Categoría | slug | código |
|---|---|---|
| Diseño gráfico | diseno_grafico | D |
| Cobertura de eventos | cobertura_eventos | C |
| Gacetilla de prensa | gacetilla | G |
| Publicaciones en redes sociales | redes_sociales | R |
| Producción audiovisual | produccion_audiovisual | P |
| Animación y motion graphics | motion_graphics | M |
| Transmisión en vivo / streaming | streaming | S |
| Sitios y contenidos web | sitios_web | W |

Cada pieza/servicio genera un PED.

## 3. Diseño gráfico

Puede elegir una o varias piezas.

### `flyer_rrss`
- Formato.
- Texto.
- Fecha límite.

**No** dividir el texto en título/fecha/hora/lugar salvo cambio futuro.

### `invitacion_digital`
- Nombre del evento.
- Fecha.
- Hora.
- Lugar.
- Modalidad.
- Programa.

### `certificado`
- Nombre de la actividad.
- Firmantes.
- Lista de destinatarios.

### `otros_diseno`
- Descripción de la pieza.
- Medidas o soporte técnico.

Cada pieza seleccionada genera un PED D independiente.

## 4. Cobertura de eventos

`cobertura_eventos`

- Fecha.
- Hora de inicio.
- **Hora de fin (opcional)**.
- Lugar.
- Ciudad.
- Autoridades asistentes.
- Requerimientos de cobertura.

Ciudad baseline: Ushuaia, Río Grande o Tolhuin, salvo ampliación explícita futura.

## 5. Gacetilla de prensa

`gacetilla`

- Referente de contacto.
- Teléfono de contacto directo.
- Datos del hecho noticioso / información base.

## 6. Publicaciones en redes sociales

`redes_sociales`

- Fecha sugerida de publicación.
- Texto / copy.
- Enlaces de referencia.

## 7. Patrón de asesoramiento para 4 categorías nuevas

Mostrar al inicio:

**¿Necesitás asesoramiento para definir la pieza?**

Opciones:
- Sí, necesito asesoramiento.
- No, sé lo que necesito.

Si Sí:
- `objetivo_asesoramiento`: texto breve requerido;
- `contacto_preferido`: WhatsApp | email;
- reutilizar teléfono/email de Datos personales;
- permitir `Editar mis datos de contacto`;
- opcionalmente botones `Abrir WhatsApp` / `Enviar correo` cuando existan contactos institucionales configurados;
- no exigir campos técnicos restantes;
- crear igualmente un PED de esa categoría;
- mostrar en gestión `Requiere asesoramiento`.

## 8. Producción audiovisual

`produccion_audiovisual`

Si no necesita asesoramiento:

**Tipo de producción**
- Video institucional.
- Entrevista.
- Reel.
- Edición de material existente.
- Otro.

Campos:
- Descripción / objetivo.
- Formato: Horizontal 16:9 | Vertical 9:16 | Cuadrado 1:1 | No estoy seguro.
- Fecha límite.
- ¿Requiere grabación?: Sí/No.

Si requiere grabación:
- Fecha de grabación.
- Hora.
- Lugar.
- Ciudad.

Si es edición de material existente:
- Material a editar / enlace de referencia (opcional).
- Adjuntos generales según límites.

No pedir codec/FPS/resolución avanzada al solicitante.

## 9. Animación y motion graphics

`motion_graphics`

Tipo:
- Placa animada.
- Títulos animados.
- Infografía en movimiento.
- Video explicativo animado.
- Otro.

Campos:
- Texto / contenido.
- Descripción de lo que necesita.
- Formato: 16:9 | 9:16 | 1:1 | No estoy seguro.
- Duración aproximada (opcional).
- Fecha límite.
- Referencias o ejemplos (opcional).

## 10. Transmisión en vivo / streaming

`streaming`

Tipo:
- Transmisión en vivo de un evento.
- Link / sala de Zoom.
- Link / sala de Google Meet.
- Sala de streaming.
- Otro.

Campos generales:
- Nombre del evento / actividad.
- Fecha.
- Hora de inicio.
- Hora de fin (opcional).
- Modalidad: Presencial | Virtual | Híbrida.
- Descripción / requerimientos.

Si Presencial/Híbrida:
- Lugar.
- Ciudad.

Si requiere sala/link:
- Cantidad estimada de participantes (opcional).

## 11. Sitios y contenidos web

`sitios_web`

Tipo:
- Crear una página.
- Actualizar una página existente.
- Landing page.
- Formulario.
- Actualizar contenido.
- Otro.

Campos:
- Descripción / objetivo.
- ¿Existe actualmente una página relacionada?: Sí/No.
- Si Sí: URL.
- Contenido o cambios solicitados.
- Fecha límite.
- Enlaces de referencia (opcional).

No pedir CMS, hosting, DNS o HTML al solicitante salvo necesidad futura.

## 12. Adjuntos

- Máximo 10 archivos por presentación inicial.
- Máximo 10 MB por archivo.
- Baseline MIME/extensiones aún aprobado: PDF, PNG, JPG/JPEG, DOCX, ZIP.
- `OPEN-014`: decidir MP4/MOV/u otros si se quieren subir pequeños audiovisuales.
- Material superior al límite: `Link al material (opcional)`.

### Un solo PED
No preguntar asociación: aplica a ese PED.

### Varios PED
Por archivo/link:
- Todas las solicitudes.
- Una solicitud específica.

La UI debe usar nombres de pieza, no UUID.

## 13. Resumen y confirmación

Mostrar:
- contacto;
- cada pieza;
- campos;
- adjuntos;
- asociación;
- links.

Permitir Editar por bloque.

Checkbox:
`Confirmo que revisé los datos y que la información ingresada es correcta.`

Botón:
`Enviar solicitudes`.

## 14. Resultado

Ejemplo:

- Flyer — `PED-2026-D000101`.
- Invitación — `PED-2026-D000102`.
- Cobertura — `PED-2026-C000103`.

Un único email inicial contiene todos.

## 15. Numeración

El código refleja categoría; la secuencia `000101/000102/000103` es global anual.

## 16. Validación

UI y server-side deben compartir contrato versionado. Longitudes, bytes exactos de 10 MB y MIME finales se fijan como constantes de schema; no esconder reglas solo en frontend.

## 17. Criterio de cierre

No considerar implementado hasta probar:
- cada campo/condicional;
- asesoramiento;
- multi-PED;
- asociación de material;
- límites;
- resumen;
- idempotencia;
- accesibilidad.
