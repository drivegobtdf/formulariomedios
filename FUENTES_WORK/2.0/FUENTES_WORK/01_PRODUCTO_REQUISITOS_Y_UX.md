# PEDIDOS — Producto, requisitos y UX

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `00_PRD.md`
- `00A_SRS.md`
- `02_REQUISITOS_FUNCIONALES.md`
- `03_FLUJOS_USUARIO.md`
- `04_UI_UX_Y_PANTALLAS.md`
- `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md`

---

# DOCUMENTO: 00_PRD.md

# 00 — PRD · Product Requirements Document

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


**Producto:** PEDIDOS — Secretaría de Medios  
**Arquitectura objetivo:** `PEDIDOS-WSN-SC-v1`  
**Versión:** 2.0

## 1. Resumen
PEDIDOS recibe solicitudes de servicios de comunicación y permite al equipo de Medios gestionar cada servicio hasta su entrega.

La nueva versión reemplaza WeWeb. WordPress.org integra la aplicación en el sitio institucional; Supabase concentra datos, Auth, seguridad, Storage y lógica; n8n ejecuta notificaciones e integraciones asíncronas.

## 2. Problema
El producto actual funciona pero depende de WeWeb. Se necesita una solución propia, mantenible, portable y entregable sin perder el comportamiento real ya validado.

## 3. Objetivos
- Retirar WeWeb sin perder funciones necesarias.
- Publicar la nueva aplicación bajo `/formulariomedios`.
- Mantener un único backend de negocio en Supabase.
- Entregar el frontend como plugin WordPress instalable.
- Mantener n8n fuera de la transacción crítica.
- Mejorar seguridad, trazabilidad, idempotencia y manejo de fallos.
- Permitir desarrollo sin servicios pagos obligatorios.

## 4. No objetivos del MVP
- No guardar PEDIDOS en MySQL/MariaDB de WordPress.
- No crear `wp_pedidos_*`.
- No usar `wp_users` como autorización de PEDIDOS.
- No usar n8n para generar PED.
- No exigir Realtime.
- No incorporar Notion al core sin decisión explícita.
- No reproducir contradicciones de la documentación histórica.

## 5. Actores
**Solicitante público:** crea un pedido, sigue su PED y responde información faltante sin cuenta interna.  
**Usuario pendiente:** posee identidad Auth, pero no acceso operativo.  
**Equipo interno:** gestiona servicios, estados, responsables, observaciones, aclaraciones y entregas.  
**Administrador:** administra accesos, roles y `nombre_usuario`.

## 6. Regla central

```text
UNA presentación del formulario
          ↓
       UN PED
          ↓
   1..N servicios
```

Ejemplo:

```text
PED-2026-000101
├── Diseño gráfico / Invitación digital
├── Diseño gráfico / Flyer RRSS
└── Cobertura de eventos
```

El PED identifica la solicitud global. Cada servicio es una unidad operativa independiente.

## 7. Formulario público
### Paso 1 — Datos
- Nombre y apellido.
- Teléfono.
- Correo electrónico.
- Área/dependencia solicitante.
- Selección de una o más categorías: Diseño gráfico, Cobertura de eventos, Gacetilla, Publicaciones en redes sociales.

### Paso 2 — Pedido
Se muestran formularios específicos. Diseño admite varias piezas:
- Flyer RRSS.
- Invitación digital.
- Certificados.
- Otros requerimientos gráficos.

También existen los tipos Cobertura de eventos, Gacetilla y Redes sociales.

### Paso 3 — Confirmación
- Adjuntos.
- Resumen.
- Confirmación explícita.
- Envío idempotente.
- Resultado con un único PED.

### Adjuntos
Baseline de paridad:
- máximo 5;
- máximo 25 MB cada uno;
- PDF, PNG, JPG/JPEG, DOCX, ZIP;
- privados por defecto.

## 8. Seguimiento público
El solicitante puede consultar su PED sin cuenta. La nueva solución mejora seguridad: el PED visible no basta para acceder a información sensible; se usa un token seguro. La recuperación mediante email responde de forma neutra para evitar enumeración.

## 9. Información faltante
El equipo puede pedir información para un servicio.

Regla verificada que se conserva:

```text
crear solicitud de información
≠ cambiar automáticamente estado del PED
≠ cambiar automáticamente estado del servicio
```

Su ciclo propio es `pendiente → respondida | vencida`, con vigencia inicial de 15 días.

## 10. Gestión interna
Debe conservar:
- Kanban por estado de servicio;
- tabla consolidada por PED;
- búsqueda y filtros;
- detalle;
- asignación de responsable usando `nombre_usuario`;
- estados por servicio;
- observaciones internas;
- solicitud de información;
- entrega final;
- historial/comunicaciones.

No se requiere drag & drop en MVP.

## 11. Estados
**Pedido general:** Nuevo, En proceso, Finalizado, Cancelado.  
**Servicio:** Nuevo, En revisión, Asignado, En proceso, Esperando información, Correcciones, Finalizado, Cancelado.  
**Información:** pendiente, respondida, vencida.  
**Acceso:** pendiente, aprobado, revocado.

## 12. Usuarios internos
La interfaz objetivo adopta el modelo actualizado ya presente en el editor auditado:
- nombre;
- apellido;
- `nombre_usuario`;
- email;
- contraseña gestionada por Supabase Auth.

`nombre_usuario`: 2–30 caracteres, lowercase, `[a-z0-9._-]`, único.

## 13. Comunicaciones
Eventos mínimos:
- pedido creado;
- cambio de estado notificable;
- información faltante solicitada;
- respuesta recibida;
- servicio finalizado;
- cancelación, si corresponde.

Arquitectura objetivo: `Supabase Queue → n8n`. Un fallo de email no revierte una operación ya confirmada.

## 14. Requisitos no funcionales
**Seguridad:** RLS, grants mínimos, secretos server-side, tokens hasheados, Storage privado, backend crítico controlado y auditoría.  
**Confiabilidad:** transacciones, idempotencia y reintentos acotados.  
**Accesibilidad:** objetivo WCAG 2.2 AA.  
**Responsive:** formularios móviles a una columna; Kanban horizontal en pantallas reducidas.  
**Mantenibilidad:** migrations versionadas, plugin modular, contratos documentados.

## 15. Restricción de costos de desarrollo
El desarrollo debe poder realizarse con costo de plataforma/software igual a cero usando WordPress.org local, Supabase local y/o Free, n8n Community Edition y Git. Esto no garantiza que producción permanezca indefinidamente en cuotas gratuitas.

## 16. Criterios de éxito
- 1 envío con N servicios crea 1 PED + N servicios.
- Doble envío/retry no duplica PED.
- Numeración concurrente sin colisiones.
- Seguimiento protegido.
- Aclaraciones completas.
- Pending/revoked sin acceso.
- Kanban y tabla operativos.
- Estados/responsable por servicio.
- Archivos privados.
- n8n puede fallar sin perder la transacción.
- QA/RLS/security aprobados.
- Migración ensayada y rollback probado.

## 17. Decisiones abiertas
`OPEN-001`: agregación exacta de `estado_general` ante servicios terminales mixtos.  
`OPEN-002`: mantener o retirar Notion.  
`OPEN-003`: retención/borrado institucional.  
`OPEN-004`: resuelto documentalmente para desarrollo; reconfirmación del receptor antes de release.


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

## 18. Baseline de compatibilidad WordPress

El sitio receptor auditado utiliza WordPress 7.0.2, PHP 8.2.31, Betheme 28.5.7,
Elementor 4.2.3, Elementor Pro 3.33.1, ElementsKit Lite, Wordfence Security y
WP Super Cache.

La página objetivo será `/formulariomedios` dentro de
`https://www.tierradelfuego.gob.ar`.

El plugin deberá ser compatible sin exigir desactivar seguridad, caché,
Elementor ni el theme existente.

## 19. Precisiones de alcance de la revisión 2.0
Se mantiene el catálogo de paridad de cuatro categorías y siete tipos de servicio. No se incorporan categorías de conversaciones históricas ni nuevas piezas por inferencia.

El límite de cinco adjuntos se aplica a la presentación inicial completa. La asociación de adjuntos a un servicio es soportada por el modelo y el contrato; el control visual exacto se cierra en OPEN-005. El límite para respuestas de información y entregas se define por contexto antes de implementar esa función, no se deduce del límite inicial.

Una corrección técnica no aprueba una regla de negocio nueva. OPEN-001 (estados), OPEN-005 (campos/adjuntos/entrega), OPEN-006 (identidad/roles) y OPEN-007 (notificaciones) requieren cierre para sus funciones. Ver registro único en 17_DECISIONES_ARQUITECTURA_ADR.md.

El resultado de esta revisión es APTO CON CORRECCIONES: permite preparar una base documental y planificar; no declara el producto listo, seguro en producción ni autorizado para implementación automática.

# FIN DOCUMENTO: 00_PRD.md


---

# DOCUMENTO: 00A_SRS.md

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

# FIN DOCUMENTO: 00A_SRS.md


---

# DOCUMENTO: 02_REQUISITOS_FUNCIONALES.md

# 02 — Requisitos funcionales

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Portal y formulario
- **RF-PUB-001:** visitante crea solicitud sin cuenta.
- **RF-PUB-002:** wizard `Datos → Pedido → Confirmación`.
- **RF-PUB-003:** Paso 1 exige nombre y apellido, teléfono, email y área/dependencia.
- **RF-PUB-004:** debe seleccionarse al menos una categoría: Diseño, Cobertura, Gacetilla o Redes.
- **RF-PUB-005:** Paso 2 muestra solo formularios de categorías seleccionadas.
- **RF-PUB-006:** Diseño permite una o más piezas: Flyer RRSS, Invitación, Certificado, Otros.
- **RF-PUB-007:** validaciones bloquean avance si faltan datos.
- **RF-PUB-008:** Paso 3 resume datos, servicios y adjuntos.
- **RF-PUB-009:** errores no borran entradas válidas.

## 2. PED
- **RF-PED-001:** cada envío confirmado crea exactamente un PED.
- **RF-PED-002:** formato `PED-YYYY-NNNNNN`.
- **RF-PED-003:** numeración única bajo concurrencia.
- **RF-PED-004:** cada PED contiene 1..N servicios.
- **RF-PED-005:** todos los servicios del envío comparten cabecera PED.
- **RF-PED-006:** doble clic/retry con mismo submission key no duplica.
- **RF-PED-007:** creación cabecera + servicios + relaciones críticas es atómica.
- **RF-PED-008:** éxito muestra PED y acceso al seguimiento.

## 3. Servicios
- **RF-SER-001:** estado independiente.
- **RF-SER-002:** responsable independiente.
- **RF-SER-003:** información específica.
- **RF-SER-004:** observaciones internas.
- **RF-SER-005:** entrega final.
- **RF-SER-006:** estados: Nuevo, En revisión, Asignado, En proceso, Esperando información, Correcciones, Finalizado, Cancelado.
- **RF-SER-007:** Cancelado requiere motivo.
- **RF-SER-008:** Finalizado requiere entrega válida según contrato.

## 4. Estado general
- **RF-GEN-001:** estados: Nuevo, En proceso, Finalizado, Cancelado.
- **RF-GEN-002:** no se modifica libremente desde frontend.
- **RF-GEN-003:** la agregación terminal mixta queda `OPEN-001`.

## 5. Seguimiento
- **RF-SEG-001:** consulta pública sin cuenta.
- **RF-SEG-002:** PED visible no basta para datos sensibles; requiere token.
- **RF-SEG-003:** respuesta pública excluye información interna.
- **RF-SEG-004:** recuperación por email no permite enumeración.

## 6. Información faltante
- **RF-INF-001:** personal aprobado puede solicitarla sobre un servicio.
- **RF-INF-002:** registra mensaje, actor, timestamps, estado y expiración.
- **RF-INF-003:** vigencia inicial 15 días.
- **RF-INF-004:** NO cambia automáticamente estado PED ni servicio.
- **RF-INF-005:** acceso público con token específico.
- **RF-INF-006:** respuesta admite texto y adjuntos válidos.
- **RF-INF-007:** al responder pasa a `respondida`.
- **RF-INF-008:** token vencido/consumido no permite uso indebido.

## 7. Gestión
- **RF-GES-001:** solo cuentas aprobadas.
- **RF-GES-002:** Kanban por estado de servicio.
- **RF-GES-003:** tabla consolidada por PED.
- **RF-GES-004:** búsqueda y filtros por área, estado y responsable.
- **RF-GES-005:** no se requiere drag & drop.
- **RF-GES-006:** detalle reúne cabecera, servicios, info, archivos, entrega e historial.
- **RF-GES-007:** selector de responsable muestra `nombre_usuario`, guarda UUID técnico.
- **RF-GES-008:** escrituras respetan transiciones válidas y se auditan.

## 8. Usuarios
- **RF-USR-001:** registro objetivo: nombre, apellido, username, email, password.
- **RF-USR-002:** nuevo usuario = `pendiente`.
- **RF-USR-003:** pendiente no accede a datos operativos.
- **RF-USR-004:** admin aprueba/revoca y edita username.
- **RF-USR-005:** roles mínimos `equipo_interno`, `admin`.
- **RF-USR-006:** username 2..30, lowercase, `[a-z0-9._-]`, único.
- **RF-USR-007:** revocación elimina autorización aunque el JWT técnico aún no expire.

## 9. Archivos
- **RF-ARC-001:** máximo inicial 5 adjuntos.
- **RF-ARC-002:** máximo inicial 25 MB por archivo.
- **RF-ARC-003:** PDF/PNG/JPG/JPEG/DOCX/ZIP.
- **RF-ARC-004:** validar extensión, MIME y límites.
- **RF-ARC-005:** privados.
- **RF-ARC-006:** descarga autorizada o signed URL.
- **RF-ARC-007:** limpieza de uploads huérfanos.

## 10. Comunicaciones
- **RF-COM-001:** pedido creado produce evento asíncrono.
- **RF-COM-002:** información faltante notifica al solicitante.
- **RF-COM-003:** respuesta puede notificar al equipo.
- **RF-COM-004:** finalización notifica.
- **RF-COM-005:** cancelación notifica si la regla lo requiere.
- **RF-COM-006:** `event_id` único.
- **RF-COM-007:** fallo externo deja trabajo reintentable.
- **RF-COM-008:** reintentos idempotentes.

## 11. Seguridad funcional
- **RF-SEC-001:** ningún secret en browser/plugin público.
- **RF-SEC-002:** publishable key no sustituye RLS.
- **RF-SEC-003:** `anon` no lee PED/PII directamente.
- **RF-SEC-004:** admin siempre validado server-side.
- **RF-SEC-005:** tokens públicos almacenados como hash.
- **RF-SEC-006:** errores públicos no revelan existencia de PED/email.
- **RF-SEC-007:** acciones críticas auditadas.

## 12. UI
- **RF-UI-001:** conservar wizard, Kanban, tabla y detalle.
- **RF-UI-002:** responsive desktop/tablet/mobile.
- **RF-UI-003:** loading/empty/error/success.
- **RF-UI-004:** formularios accesibles.
- **RF-UI-005:** estilos aislados del theme WordPress.


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

## 13. Reglas que no deben inferirse
- La lista de estados no equivale a una lista de transiciones permitidas: ver OPEN-001.
- Username es la etiqueta operativa; su uso como credencial de login sigue OPEN-006.
- El estado rechazado mencionado en las instrucciones no se incorpora ni se equipara a revocado sin resolver OPEN-006. Toda identidad no aprobada permanece denegada.
- Cinco adjuntos es el máximo por presentación inicial, no por servicio.
- La entrega actual usa URL HTTPS; el catálogo de destinos aceptados y cualquier alternativa por archivo se resuelven en OPEN-005. No guardar como entrega estable una signed URL que expirará.
- Las comunicaciones por cambio de estado/cancelación requieren destinatarios y regla notificable definidos en OPEN-007.

## 14. Identificadores adicionales
| ID | Requisito |
|---|---|
| RF-ROB-001 | Mantener datos válidos ante timeout; explicar que reintentar no crea otro PED. |
| RF-ROB-002 | Ante conflicto de edición, mostrar que hubo un cambio ajeno y permitir recargar antes de aplicar una acción nueva. |
| RF-ROB-003 | Mostrar progreso y error por archivo, impedir confirmar asociaciones incompletas. |
| RF-ROB-004 | Diferenciar PED confirmado de correo pendiente; la demora de correo no cambia el estado del pedido. |
| RF-ROB-005 | Ofrecer recuperación segura cuando se perdió la respuesta inicial y el token ya no está disponible. |

# FIN DOCUMENTO: 02_REQUISITOS_FUNCIONALES.md


---

# DOCUMENTO: 03_FLUJOS_USUARIO.md

# 03 — Flujos de usuario

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Nueva solicitud

```text
/formulariomedios
→ Paso 1 Datos + categorías
→ Paso 2 servicios específicos
→ Paso 3 adjuntos + resumen
→ preparar sesión de presentación y reservas
→ upload seguro y verificación
→ create-pedido con submission_key y reservas verificadas
→ 1 PED + N servicios
→ solicitud-recibida
```

Si el usuario elige Invitación + Flyer + Cobertura, recibe **un PED** con tres servicios.

## 2. Seguimiento

```text
Seguimiento
→ PED + token
→ backend valida hash
→ válido: DTO público
→ inválido: mensaje neutro
```

Recuperación:

```text
PED + email
→ respuesta neutra
→ si coincide, crear credencial de recuperación y evento
→ email con enlace de canje
→ confirmación explícita y canje atómico por nuevo acceso
→ invalidar recuperación y rotar tracking solo en el canje
```

## 3. Información faltante

```text
Operador abre servicio
→ Solicitar información
→ Edge verifica operador, genera token/cifrado temporal y llama RPC
→ crear solicitud_info pendiente + token hash + expires_at + sobre cifrado
→ NO cambiar estados del pedido/servicio
→ Queue
→ n8n notifica
→ solicitante abre enlace
→ valida token
→ responde texto/archivos
→ solicitud_info = respondida
→ evento al equipo
```

## 4. Solicitar acceso

```text
Nombre + apellido + username + email + password
→ Supabase Auth
→ usuarios_acceso = pendiente
→ sin acceso operativo
→ admin revisa
→ aprobado + rol / revocado
```

## 5. Login

```text
credenciales
→ Auth
→ perfil de aplicación
   ├─ aprobado + rol → Gestión
   ├─ pendiente → mensaje pendiente
   └─ revocado → acceso denegado
```

## 6. Gestión
1. Operador entra.
2. Alterna Kanban/tabla.
3. Busca y filtra.
4. Abre PED/servicio.
5. Consulta detalle.
6. Ejecuta una acción explícita.
7. RPC valida y audita.
8. UI refresca.

## 7. Asignación

```text
seleccionar nombre_usuario
→ validar operador y responsable aprobados
→ asignar UUID Auth
→ aplicar únicamente transición aprobada en OPEN-001; sin regla, la función queda bloqueada
→ audit
```

## 8. Cambio de estado

```text
seleccionar estado
→ validar rol + transición
→ requisitos especiales:
   Cancelado → motivo
   Finalizado → entrega válida
→ update
→ audit
→ evento notificable
```

## 9. Finalización

```text
URL HTTPS + nota
→ validar
→ servicio Finalizado
→ actualizar/recalcular estado general según política aprobada
→ Queue
→ n8n
```

`OPEN-001` impide inventar todavía la agregación exacta cuando existen servicios terminales mixtos.

## 10. Administración
Admin:
- lista usuarios;
- revisa pendientes;
- aprueba con rol;
- revoca;
- cambia `nombre_usuario`;
- todas las acciones quedan auditadas.

## 11. Fallos
**Timeout de creación:** reutilizar `submission_key` y devolver el mismo PED.  
**n8n caído:** no revierte negocio; Queue retiene evento.  
**Upload huérfano:** limpieza posterior.  
**Sesión vencida:** denegar acción y pedir reautenticación.

## 12. Rutas objetivo
`/formulariomedios/`, `/solicitud-recibida`, `/seguimiento`, `/solicitud-informacion`, `/login`, `/solicitar-acceso`, `/gestion`, `/pedido/:id`, `/usuarios`.


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

## 13. Interrupciones y enlaces
La app conserva submission_key y un resumen local no secreto de la operación durante la sesión. La capacidad de presentación y tokens no se introducen en logs ni en URLs de consulta. Si se pierde esa capacidad, no se intenta adivinar ni recuperar una credencial por PED; se usa recuperación por canal de correo y la interfaz evita sugerir una segunda creación de un envío posiblemente confirmado.

Un GET/validación de enlace no responde ni consume la solicitud: los scanners de correo no deben ejecutar la acción. El POST explícito comprueba hash, contexto, expiración, estado y consistencia de archivos dentro de una operación atómica. Un segundo POST idéntico puede confirmar la respuesta ya registrada sin repetir eventos; uno con contenido distinto produce conflicto.

Las rutas abreviadas de este documento son relativas a /formulariomedios. Ninguna ruta de PEDIDOS se publica por accidente en la raíz del sitio.

# FIN DOCUMENTO: 03_FLUJOS_USUARIO.md


---

# DOCUMENTO: 04_UI_UX_Y_PANTALLAS.md

# 04 — UI, UX y pantallas

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Principio
La nueva interfaz conserva la estructura mental validada del WeWeb actual, integrada dentro del sitio WordPress. Los estilos del plugin deben estar aislados del theme bajo un root como `.pedidos-app`.

## 2. Identidad visual de referencia
Baseline auditado:
- Primary: `#003366` / `#0B4F8A`
- Primary hover: `#002244`
- Background: `#F8F9FA`
- Surface: `#FFFFFF`
- Border: `#E5E7EB`
- Text: `#1F2937`
- Muted: `#6B7280`
- Success: `#10B981`
- Warning: `#F59E0B`
- Danger: `#EF4444`
- Info: `#3B82F6`
- Tipografía: Inter / system sans

Estos valores son referencia de continuidad, sujetos a contraste WCAG y compatibilidad con el sitio institucional.

## 3. Pantallas objetivo

### `/formulariomedios/`
Wizard de tres pasos.

### `/formulariomedios/solicitud-recibida`
PED creado, instrucciones, acceso seguro a seguimiento.

### `/formulariomedios/seguimiento`
Consulta PED + credencial segura; recuperación mediante email.

### `/formulariomedios/solicitud-informacion`
Visualiza requerimiento y permite responder texto/adjuntos.

### `/formulariomedios/login`
Login del equipo.

### `/formulariomedios/solicitar-acceso`
Se adopta el modelo actualizado del editor auditado:
`nombre`, `apellido`, `nombre_usuario`, `email`, `password`, `confirm_password`.

### `/formulariomedios/gestion`
Toolbar, filtros y selector Kanban/Tabla.

### `/formulariomedios/pedido/:id`
Detalle con información general, servicios, información faltante, entrega e historial.

### `/formulariomedios/usuarios`
Solo admin.

## 4. Wizard
Stepper visible: `Datos → Pedido → Confirmación`.

**Paso 1:** datos y cuatro categorías principales.  
**Paso 2:** formularios dinámicos por selección.  
**Paso 3:** resumen, adjuntos, volver/corregir y confirmar.

Requisitos UX:
- no perder datos por error;
- indicar campos requeridos;
- loading en operaciones asíncronas;
- botón de confirmación bloqueado durante el mismo request;
- errores junto al campo y resumen cuando ayude.

## 5. Kanban
Una tarjeta representa un `servicio_solicitado`, no el PED completo.

Columnas:
- Nuevo
- En revisión
- Asignado
- En proceso
- Esperando información
- Correcciones
- Finalizado
- Cancelado

Tarjeta:
- PED;
- servicio/categoría;
- área/dependencia solicitante;
- responsable;
- fecha/antigüedad.

MVP sin drag & drop. Los cambios son explícitos mediante controles.

## 6. Tabla
Una fila consolidada por PED:
- PED;
- fecha;
- solicitante/dependencia;
- chips de servicios;
- estado general;
- acción Ver.

## 7. Detalle
Separar visualmente:
- estado general del PED;
- estado individual de cada servicio.

Bloques:
1. datos generales;
2. servicios;
3. aclaraciones;
4. entrega;
5. archivos;
6. comunicaciones/historial.

## 8. Responsive
- `>=1024px`: layouts multicolumna cuando aporten claridad.
- `768–1023px`: formularios una columna; Kanban horizontal.
- `<768px`: full width, controles táctiles, tablas con scroll o representación compacta.

## 9. Accesibilidad
Objetivo WCAG 2.2 AA:
- teclado;
- foco visible;
- labels reales;
- contraste;
- errores asociados;
- no depender solo de color;
- modal con focus trap y retorno de foco;
- live regions para confirmaciones/errores asincrónicos.

## 10. Estados obligatorios
Cada consulta remota debe diseñar:
- loading;
- empty;
- error;
- unauthorized;
- success;
- retry.

## 11. Integración con theme
El plugin no asume jQuery, Bootstrap, Tailwind ni estilos globales. No sobrescribir selectores globales `button`, `input`, `body` fuera de `.pedidos-app`.


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

## 12. Compatibilidad Betheme / Elementor / ElementsKit

- root único `.pedidos-app`;
- no estilos globales invasivos;
- no asumir ancho/layout del theme;
- funcionar dentro del contenedor Elementor;
- evitar doble montaje;
- no registrar listeners duplicados en preview/editor;
- preservar header/footer existentes;
- probar desktop, tablet y móvil dentro de la página real.

## 13. UX de robustez y privacidad
- Error o timeout no elimina el formulario. No mostrar “pedido fallido” si el resultado del commit es incierto: ofrecer comprobación/reintento de la misma operación.
- Upload: progreso y resultado por archivo, cancelar/reintentar, resumen del servicio al que se vincula cuando se apruebe esa UI; el límite global inicial es cinco.
- Desmarcar un servicio con datos requiere resolver OPEN-005; no persistir campos ocultos inadvertidamente.
- Cambio concurrente: presentar conflicto y recarga, sin reenvío automático que pise otra edición.
- Token en fragmento se captura y limpia; no se envía a analítica, historial de eventos, telemetría ni reportes de error. No incluir datos del pedido en títulos o URLs de analítica.
- Limpiar cachés de datos de aplicación al cerrar sesión, cambiar usuario o revocar acceso. Esto no revoca copias ya descargadas.
- Accesibilidad se prueba con teclado y lector de pantalla representativo, además de análisis automático; no declarar WCAG AA solo por labels/contraste.

## 14. Lecturas y rendimiento
Tabla y Kanban se consultan con paginación y filtros server-side; el total y los conteos no se calculan descargando todo el historial. Definir orden estable y política para servicios recién modificados. No se incorpora Realtime sin decisión posterior. Metas de latencia, volúmenes y tamaños de página se fijan y prueban en OPEN-011.

# FIN DOCUMENTO: 04_UI_UX_Y_PANTALLAS.md


---

# DOCUMENTO: 19_ESPECIFICACION_FORMULARIO_SERVICIOS.md

# 19 — Especificación de formulario y servicios

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


Este documento congela los campos funcionales verificados que deben servir como baseline de paridad. La implementación podrá mejorar labels/validación sin eliminar información necesaria.

## 1. Paso 1 — Datos

| Campo | Tipo | Requerido | Baseline |
|---|---|---:|---|
| Nombre y apellido | text | Sí | mínimo 3 caracteres, trim |
| Teléfono | tel/text | Sí | formato de contacto válido |
| Correo electrónico | email | Sí | formato email |
| Área solicitante | select/text | Sí | Ministerio/Secretaría/Ente |
| ¿Qué necesitás solicitar? | checkboxes | Sí | mínimo 1 |

Categorías:
- `diseno_grafico` — Diseño gráfico
- `cobertura_eventos` — Cobertura de eventos
- `gacetilla` — Gacetilla de prensa
- `redes_sociales` — Publicaciones en redes sociales

**Terminología:** `area_solicitante` es el organismo de origen. Las cuatro opciones son áreas/categorías internas de producción y no deben confundirse con el organismo.

## 2. Paso 2 — Diseño gráfico
Permite elegir una o varias piezas.

### `flyer_rrss`
- formato: 1:1, 9:16, historia u opción vigente;
- texto principal/copy;
- fecha límite.

### `invitacion_digital`
- nombre del evento;
- fecha;
- hora;
- lugar;
- modalidad;
- programa.

### `certificado`
- nombre de la actividad;
- firmantes;
- lista de destinatarios.

### `otros_diseno`
- descripción de la pieza;
- medidas o soporte técnico.

## 3. Cobertura de eventos
Tipo `cobertura_eventos`.

Campos baseline obligatorios auditados:
- fecha;
- hora inicio;
- hora fin;
- lugar;
- ciudad: Ushuaia, Río Grande o Tolhuin;
- autoridades asistentes;
- requerimientos de cobertura.

## 4. Gacetilla
Tipo `gacetilla`.

Campos:
- referente de contacto;
- teléfono de contacto directo;
- datos del hecho noticioso / información base.

## 5. Redes sociales
Tipo `redes_sociales`.

Campos:
- fecha sugerida de publicación;
- texto/copy;
- enlaces de referencia.

## 6. Paso 3
- dropzone;
- máximo 5;
- PDF, PNG, JPG/JPEG, DOCX, ZIP;
- máximo 25 MB c/u;
- resumen read-only;
- botón volver;
- botón enviar.

## 7. Extracto de campos de servicios
Cada opción concreta genera un objeto de `servicios[]`; varias piezas de Diseño generan varios servicios dentro del **mismo PED**. El siguiente ejemplo ilustra solo los campos funcionales: no es un request completo. El contrato completo del documento 11 exige además sesión/capacidad, versiones, client_service_ref y reservation_id para adjuntos.

```json
{
  "servicios": [
    {
      "area_slug": "diseno_grafico",
      "tipo_slug": "flyer_rrss",
      "informacion_especifica": {
        "formato": "1:1",
        "copy": "...",
        "fecha_limite": "YYYY-MM-DD"
      }
    },
    {
      "area_slug": "cobertura_eventos",
      "tipo_slug": "cobertura_eventos",
      "informacion_especifica": {
        "fecha": "YYYY-MM-DD",
        "hora_inicio": "HH:mm",
        "hora_fin": "HH:mm",
        "lugar": "...",
        "ciudad": "Ushuaia",
        "autoridades": "...",
        "requerimientos": "..."
      }
    }
  ]
}
```

## 8. Validación
Las reglas exactas adicionales (longitudes máximas, formatos de fecha, etc.) deben definirse como contrato explícito antes de codificar y aplicarse tanto en UI como server-side. No inventar restricciones no presentes en el baseline sin decisión de producto.

## 9. Paridad
El criterio de paridad no exige replicar IDs/variables de WeWeb; exige que el solicitante pueda proporcionar la misma información y que se transforme correctamente en 1 PED + N servicios.


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

## 10. Diccionario contractual y pendientes explícitos
Esta matriz conserva todos los campos del baseline. PENDIENTE significa que no hay decisión suficiente para un validador definitivo; no equivale a opcional. Las claves API ya presentes en ejemplos se conservan; las restantes se fijan junto con el contrato versionado antes de implementar.

| Tipo | Campos preservados | Requerimiento documentado | Pendiente de cierre OPEN-005 |
|---|---|---|---|
| solicitante | nombre_apellido, telefono, correo, area_solicitante | Todos requeridos; nombre trim mínimo 3; email con formato | Máximos, formato de teléfono, select/text y opciones de dependencia |
| selección | Cuatro categorías y tipos asociados | >=1 categoría; Diseño >=1 pieza | Repetir mismo tipo, máximo servicios, cambio de selección con datos |
| flyer_rrss | formato, copy, fecha_limite | Campos existentes; obligatoriedad completa PENDIENTE | Enum exacto 1:1/9:16/historia, longitud y fechas |
| invitacion_digital | nombre evento, fecha, hora, lugar, modalidad, programa | Campos existentes; obligatoriedad PENDIENTE | Claves API, enum modalidad, formato de programa y límites |
| certificado | actividad, firmantes, destinatarios | Campos existentes; obligatoriedad PENDIENTE | Texto vs listas, máximos y tratamiento de datos personales |
| otros_diseno | descripción, medidas/soporte | Campos existentes; obligatoriedad PENDIENTE | Unidades, estructura y límites |
| cobertura_eventos | fecha, hora_inicio, hora_fin, lugar, ciudad, autoridades, requerimientos | Todos obligatorios según baseline | Reglas de medianoche/fechas, múltiples jornadas, longitudes |
| gacetilla | referente, teléfono directo, datos del hecho | Campos existentes; obligatoriedad PENDIENTE | Claves, formato, límites |
| redes_sociales | fecha sugerida, copy, enlaces | Campos existentes; obligatoriedad PENDIENTE | Cantidad/formato enlaces, fechas, longitudes |
| adjuntos iniciales | PDF/PNG/JPG/JPEG/DOCX/ZIP | Máx. cinco por presentación, 25 MB cada uno | Bytes exactos (OPEN-012), control visual de asociación por servicio |
| respuesta información | texto y/o archivos autorizados | Token vigente; una respuesta efectiva | Si basta uno de los dos, cupos y longitudes |
| entrega | URL HTTPS + nota según baseline | Entrega válida al finalizar | Destinos admitidos, nota requerida/opcional, alternativa por archivo estable |

## 11. Contrato de fechas y numeración
Guardar instantes técnicos como timestamptz. El significado de fechas y horas de evento debe tener zona definida sin convertir silenciosamente una fecha civil en otro día. Recomendación pendiente de aprobación: zona institucional America/Argentina/Ushuaia para eventos y año PED. Resolver qué ocurre con eventos que cruzan medianoche, fechas pasadas y desborde de seis dígitos. No derivar el año del reloj del navegador.

## 12. Contrato de cada servicio
Toda instancia incluye client_service_ref, tipo_slug, área derivada/validada, form_schema_version e información tipada. El servidor rechaza tipo inactivo, relación área/tipo inválida, versión no soportada y campos arbitrarios fuera del contrato. Se conservan versiones anteriores para lectura de pedidos históricos. La base técnica de versionado está definida; los enums/longitudes aún pendientes no se completan por intuición.

## 13. Criterio de cierre
Antes de programar validadores/UX, cada fila debe tener nombres API, tipo, obligatoriedad, rango/enum, formato, ejemplo válido, ejemplo inválido y mensaje de error. Producto decide cambios respecto al baseline. Una vez cerrado se actualizan SRS, API, validación DB/Edge y casos QA por tipo. No declarar este documento listo para implementación de campos mientras existan celdas PENDIENTE.

# FIN DOCUMENTO: 19_ESPECIFICACION_FORMULARIO_SERVICIOS.md
