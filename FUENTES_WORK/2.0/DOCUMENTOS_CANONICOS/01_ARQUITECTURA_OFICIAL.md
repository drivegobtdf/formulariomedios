# 01 — Arquitectura oficial

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


**Nombre:** WSN-SC — WordPress + Supabase + n8n, Supabase-Centric  
**Código:** `PEDIDOS-WSN-SC-v1`  
**Estado:** Arquitectura aceptada; especificación revisada, implementación no verificada

## 1. Decisión
Supabase será la fuente de verdad. WordPress.org será el host de la interfaz y la integración institucional. n8n será la capa asíncrona de comunicaciones e integraciones.

```text
                 WORDPRESS.ORG
             /formulariomedios/*
                       │
              plugin pedidos-medios
                       │
              HTML/CSS/TypeScript
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
     Supabase Data/API        Edge Functions
          │                         │
          ├──── PostgreSQL ─────────┤
          ├──── Auth                │
          ├──── Storage             │
          └──── Queues ─────────────┘
                       │
                       ▼
                      n8n
```

## 2. Corrección fundamental
La primera documentación asumía erróneamente `1 servicio = 1 PED`.

El modelo oficial es:

```text
1 envío = 1 PED
1 PED = 1..N servicios_solicitados
```

No se introduce una entidad `solicitudes` adicional: `pedidos` ya es la cabecera de la solicitud.

## 3. WordPress
Responsabilidades:
- URL, theme, navegación, SEO e integración institucional;
- página `/formulariomedios`;
- carga del plugin y assets;
- subrutas de la aplicación.

No:
- almacena el dominio PEDIDOS;
- genera numeración PED;
- decide permisos;
- guarda adjuntos operativos;
- contiene secretos backend.

MySQL/MariaDB queda reservado al CMS WordPress.

## 4. Plugin `pedidos-medios`
- App shell.
- Shortcode/bloque de montaje.
- Rewrites.
- CSS y JS.
- Router frontend.
- formularios y UI.
- `supabase-js`.
- configuración pública: URL + publishable key.

No se crea WordPress REST como backend principal.

## 5. PostgreSQL
Responsable de:
- pedidos;
- servicios;
- catálogos;
- perfiles/roles de aplicación;
- sesiones de presentación y reservas de upload;
- sobres cifrados temporales para entrega de tokens;
- ledger de eventos, entregas e intentos;
- secuencia PED;
- solicitudes de información;
- archivos metadata;
- comunicaciones;
- auditoría;
- idempotencia;
- eventos Queue.

## 6. Auth
Supabase Auth identifica al personal interno. El público no necesita cuenta.

`usuarios_acceso` añade:
- `user_id`;
- nombre/apellido;
- `nombre_usuario`;
- `estado_acceso`;
- `app_role`.

`authenticated` es un rol técnico; `equipo_interno`/`admin` son roles de aplicación.

## 7. Autorización
- Publishable key en browser.
- RLS + grants mínimos.
- `anon` sin acceso directo a PED/PII.
- `authenticated` necesita además `estado_acceso = aprobado`.
- secret key solo en componentes controlados.
- escrituras críticas vía RPC/Edge, no `UPDATE` genérico.

## 8. RPC
Operaciones críticas: crear pedido, asignar, cambiar estado, finalizar, pedir información y administración de usuarios.

## 9. Edge Functions
Solo cuando haya frontera pública o necesidad de:
- tokens;
- anti-abuso;
- CORS;
- secretos;
- signed uploads;
- consumo de Queue.

## 10. Storage
Bucket privado `pedidos-private`. Descarga mediante autorización/signed URL. No `wp-content/uploads`.

## 11. n8n
```text
transacción de negocio
→ evento durable
→ Queue
→ n8n
→ email/integración
→ ack/retry
```

n8n no genera PED ni es fuente de verdad.

## 12. Flujo de creación

```text
Browser WordPress
  ├─ submission-prepare → capacidad temporal de presentación
  ├─ upload-prepare → reserva → signed upload → Storage → upload-complete
  └─ create-pedido Edge
           ↓
       RPC transaccional
           ├─ idempotencia
           ├─ secuencia PED
           ├─ pedidos
           ├─ N servicios
           ├─ archivos
           ├─ auditoría
           └─ Queue
```

## 13. Seguimiento
PED + token seguro → Edge Function → DTO público. Las tablas operativas permanecen cerradas a `anon`.

## 14. Rutas objetivo
| WeWeb actual | WordPress objetivo |
|---|---|
| `/` | `/formulariomedios/` |
| `/solicitud-recibida` | `/formulariomedios/solicitud-recibida` |
| `/seguimiento` | `/formulariomedios/seguimiento` |
| `/solicitud-informacion` | `/formulariomedios/solicitud-informacion` |
| `/login` | `/formulariomedios/login` |
| `/solicitar-acceso` | `/formulariomedios/solicitar-acceso` |
| `/gestion` | `/formulariomedios/gestion` |
| `/pedido/:id` | `/formulariomedios/pedido/:id` |
| `/usuarios` | `/formulariomedios/usuarios` |

## 15. Dependencias evitadas
- No `wp_pedidos_*`.
- No doble base WordPress/Supabase.
- No Auth doble.
- No WordPress → n8n directo.
- No n8n en la ruta crítica.
- No Notion en el core.
- Realtime diferido hasta demostrar necesidad.

## 16. Desarrollo
Supabase CLI/Docker para local, migrations versionadas y plugin entregable como ZIP.


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

## 17. Compatibilidad con el WordPress receptor

Baseline:
`WordPress 7.0.2 + PHP 8.2.31 + Betheme 28.5.7 + Elementor 4.2.3 +
Elementor Pro 3.33.1`.

Integración:
- página Elementor;
- shortcode/app shell;
- CSS namespaced;
- guard de montaje único;
- no dependencia de APIs internas de Elementor;
- compatibilidad con Wordfence y WP Super Cache.

Supabase continúa desacoplado de MySQL WordPress.

## 18. Fronteras técnicas precisadas
La transacción que confirma el PED incluye sus servicios, consumo de reservas de archivos ya verificadas, registro de auditoría, eventos/entregas y enqueue durable. La transferencia binaria previa a Storage no forma parte de la transacción PostgreSQL: se coordina mediante estados y limpieza segura. Si la transacción falla, no se publica un PED parcial; pueden quedar objetos no asociados para limpieza posterior.

Las RPC de creación pública, asociación y transporte de tokens son exclusivamente invocables desde Edge con permisos elevados controlados. Las RPC internas que no requieren secretos usan sesión del operador y validación de autorización en PostgreSQL. No conceder acceso elevado al navegador ni a n8n.

Las operaciones que emiten enlaces sensibles pasan por una Edge que genera el secreto y su sobre cifrado; PostgreSQL persiste ambos componentes autorizados (hash de validación y sobre separado) junto al evento en un único commit. La clave de cifrado permanece fuera de DB, WordPress y n8n.

Queue durable y ledger de comunicaciones forman parte temprana del backend. n8n solo consume entregas autorizadas; no gobierna la verdad de negocio, roles ni estados. La fiabilidad de email se expresa con estados comprobables y capacidades verificadas del proveedor.

## 19. Responsabilidad y límites
Un fallo de enqueue dentro de la transacción impide confirmar ese PED; un fallo de n8n posterior no lo revierte. No se promete que se puedan crear pedidos cuando PostgreSQL está caído. La disponibilidad del motor de colas dentro de PostgreSQL es una dependencia del commit documentada.

El frontend institucional comparte seguridad con los scripts del sitio anfitrión. CSS namespaced no es aislamiento de seguridad. No se introduce otro backend, Redis ni microservicios por defecto; cualquier infraestructura adicional se justifica con medición o requisito concreto.
