# 06 — Autenticación, RBAC y RLS

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Modelo

Supabase Auth gestiona identidad. `usuarios_acceso` gestiona aprobación y rol de aplicación. WordPress no participa en la autorización del dominio PEDIDOS.

## 2. Identidad

Login:
- email;
- contraseña.

Identidad operativa:
- `nombre_usuario` único;
- se muestra en asignaciones, tablero, detalle e historial.

Nombre y apellido identifican a la persona. Email no se usa como nombre visible de asignación.

## 3. Alta

Dos caminos:

### Solicitud libre
1. nombre;
2. apellido;
3. `nombre_usuario`;
4. email;
5. contraseña;
6. estado `pendiente`;
7. Administrador aprueba/rechaza y asigna rol.

### Invitación
Administrador ingresa email y rol; Supabase Auth envía invitación. La implementación deberá definir en staging si la cuenta invitada queda `aprobado` inmediatamente por ser una invitación administrativa o si requiere confirmación final; la intención funcional es que la invitación del Administrador no obligue a una segunda aprobación redundante.

## 4. Estados de acceso

- `pendiente`;
- `aprobado`;
- `rechazado`;
- `revocado`.

Solo `aprobado` habilita operación.

## 5. Roles

### `administrador`
- todas las operaciones de Equipo;
- aprobar/rechazar;
- invitar;
- cambiar roles;
- cambiar `nombre_usuario`;
- revocar.

### `equipo`
- leer pedidos;
- asignar/reasignar;
- cambiar estados;
- notas;
- info faltante;
- archivos/entrega;
- finalizar/cancelar;
- archivar/restaurar.

### `observador`
- lectura de información de pedidos;
- sin mutaciones;
- sin administración de usuarios.

## 6. Matriz

| Recurso/acción | anon | pendiente/rechazado/revocado | observador | equipo | administrador |
|---|---:|---:|---:|---:|---:|
| Crear envío público | vía Edge | vía Edge | vía Edge | vía Edge | vía Edge |
| Tracking público | token | token | token/JWT | token/JWT | token/JWT |
| Leer pedidos internos | No | No | Sí | Sí | Sí |
| Asignar/reasignar | No | No | No | Sí | Sí |
| Cambiar estado | No | No | No | Sí | Sí |
| Solicitar información | No | No | No | Sí | Sí |
| Finalizar/cancelar | No | No | No | Sí | Sí |
| Archivar/restaurar | No | No | No | Sí | Sí |
| Gestionar usuarios | No | No | No | No | Sí |

## 7. RLS y grants

- `anon` no tendrá SELECT directo a tablas de PED/PII.
- `authenticated` no basta: toda policy interna verifica `estado_acceso='aprobado'`.
- `observador` recibe SELECT limitado a recursos operativos permitidos.
- mutaciones críticas se realizan por RPC/Edge; no mediante UPDATE genérico desde browser.
- `service_role`/secret key nunca llegan al frontend.

## 8. Revocación

Una cuenta revocada debe quedar bloqueada aunque conserve un JWT todavía vigente. Las RPC/policies consultan `usuarios_acceso` en cada operación relevante.

## 9. `nombre_usuario`

- unique;
- lowercase;
- trim;
- `^[a-z0-9._-]{2,30}$`;
- el usuario no lo cambia libremente tras aprobación;
- solo Administrador puede cambiarlo;
- cambio auditado;
- asignaciones históricas conservan actor UUID y snapshots/joins para poder mostrar correctamente la trazabilidad.

## 10. Recuperación de contraseña

Supabase Auth. No almacenar contraseña en tablas propias. Mensajes de recuperación no deben revelar existencia de otras cuentas más allá de lo necesario.

## 11. Seguridad UI

Ocultar botones por rol mejora UX pero no constituye autorización. El Observador no deberá recibir/mostrar controles de mutación.

## 12. Primer/último Administrador

Bootstrap del primer administrador y protección contra eliminar/revocar al último Administrador quedan en `OPEN-015`. Ninguna implementación debe permitir un lockout administrativo accidental sin procedimiento documentado.

## 13. WordPress

Los nonces WordPress solo protegen acciones propias del plugin/settings. No reemplazan JWT, RLS, policies ni permisos Supabase.
