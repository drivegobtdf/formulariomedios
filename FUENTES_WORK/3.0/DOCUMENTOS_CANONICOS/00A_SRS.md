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
Vigencia funcional: 48 horas corridas (Cambio aprobado por el responsable: vigencia de solicitudes de información faltante de 15 días a 48 horas corridas).

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
- solicitud de información: 48 horas corridas (Cambio aprobado por el responsable: vigencia de solicitudes de información faltante de 15 días a 48 horas corridas);
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
