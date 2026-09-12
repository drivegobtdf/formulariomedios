# 17 — ADR · Decisiones de arquitectura

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Registro consolidado

| ADR | Decisión | Estado v3 |
|---|---|---|
| ADR-001 | Supabase es fuente de verdad de negocio | Aceptada |
| ADR-002 | WordPress es host de UI | Aceptada |
| ADR-003 | n8n es asíncrono, fuera del commit | Aceptada |
| ADR-004 | 1 envío = 1 PED = N servicios | **SUPERADA por ADR-037** |
| ADR-005 | No crear entidad solicitudes adicional | **SUPERADA parcialmente por ADR-037**; se crea `envios_formulario` técnica/de agrupación, no PED alternativo |
| ADR-006 | Estado general separado de servicio | **SUPERADA por ADR-038** |
| ADR-007 | Pedir información no cambia estado automáticamente | Aceptada |
| ADR-008 | PED se genera en PostgreSQL | Aceptada |
| ADR-009 | Idempotencia por submission_key | Aceptada/ampliada |
| ADR-010 | Supabase Auth interno | Aceptada |
| ADR-011 | usuarios_acceso contiene aprobación/rol | Aceptada/ampliada |
| ADR-012 | No wp_users para autorización | Aceptada |
| ADR-013 | Grants mínimos + RLS | Aceptada |
| ADR-014 | Escrituras críticas por RPC | Aceptada |
| ADR-015 | Edge para fronteras necesarias | Aceptada/ampliada |
| ADR-016 | Publishable/secret keys modernas | Aceptada |
| ADR-017 | Supabase Storage privado | **SUPERADA por ADR-042** |
| ADR-018 | Signed upload Supabase | **SUPERADA por ADR-042/043** |
| ADR-019 | Supabase Queues durable | Aceptada |
| ADR-020 | evento/entrega/ledger/reconciliación | Aceptada |
| ADR-021 | comunicaciones Queue+n8n | Aceptada |
| ADR-022 | Kanban + tabla, sin drag/drop MVP | Aceptada/ampliada |
| ADR-023 | nombre/apellido/username | Aceptada/ampliada |
| ADR-024 | Notion | OPEN-002 |
| ADR-025 | Realtime | Diferida |
| ADR-026 | desarrollo sin pago obligatorio | Aceptada |
| ADR-027 | QA como baseline verificable | Aceptada |
| ADR-028 | hash + sobre cifrado temporal cuando sea necesario | Aceptada |
| ADR-029 | base URL /formulariomedios | Aceptada |
| ADR-030 | agregación estado general | **Ya no aplica por ADR-038** |
| ADR-031 | repositorio oficial | Aceptada |
| ADR-032 | baseline WordPress receptor | Aceptada |
| ADR-033 | reservas de upload | Aceptada, adaptada a Drive |
| ADR-034 | idempotencia/concurrencia mutaciones | Aceptada |
| ADR-035 | exposición mínima | Aceptada |
| ADR-036 | operación/recuperación verificables | Aceptada |
| ADR-037 | 1 envío = N PED; cada pieza = 1 PED | **Aceptada 2026-09-11** |
| ADR-038 | PED es unidad operativa y tiene un único estado | **Aceptada** |
| ADR-039 | seis estados y asignación como atributo, no estado | **Aceptada** |
| ADR-040 | secuencia global anual + código de categoría | **Aceptada** |
| ADR-041 | RBAC Admin/Equipo/Observador | **Aceptada** |
| ADR-042 | Google Drive almacena binarios | **Aceptada** |
| ADR-043 | Supabase autoriza/metadata; OAuth Drive solo server-side | **Aceptada** |
| ADR-044 | 10 archivos x 10 MB + link opcional | **Aceptada** |
| ADR-045 | archivos generales o específicos por PED, N:M | **Aceptada** |
| ADR-046 | email inicial agrupado; cambios posteriores por PED | **Aceptada** |
| ADR-047 | archivado reversible separado del estado | **Aceptada** |
| ADR-048 | Dashboard + Board/Table + atención | **Aceptada** |
| ADR-049 | finalización con entrega versionada | **Aceptada** |
| ADR-050 | cancelación/reapertura auditada | **Aceptada** |

## 2. ADR-037 — agregado funcional v3

**Decisión:** un envío puede crear N PED y cada pieza/servicio recibe su PED.  
**Motivo:** el área necesita ciclos de estado, responsable y notificación independientes.  
**Consecuencia:** `servicios_solicitados` deja de ser unidad operativa nueva; `envios_formulario` agrupa idempotencia/correo/material común.

## 3. ADR-038/039 — estado

Cada PED posee:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información;
- Finalizado;
- Cancelado.

No existe `estado_general`. `Asignado` no es estado. `Correcciones` se retira. En revisión requiere responsable.

## 4. ADR-040 — numeración

`PED-YYYY-CNNNNNN`, con C de categoría y NNNNNN de secuencia global anual.

## 5. ADR-041 — roles

- Administrador;
- Equipo;
- Observador.

Observador solo lectura. Backend y UI aplican la separación.

## 6. ADR-042/043 — Google Drive

Drive reemplaza Supabase Storage para binarios. Supabase continúa como autoridad. OAuth server-side, scope mínimo, ninguna credencial al navegador.

La cuenta actualmente disponible puede ser cuenta Google personal con almacenamiento suficiente; no se exige Workspace para la arquitectura actual.

## 7. ADR-044/045 — material

10 archivos, 10 MB cada uno. Material mayor por link opcional. Con varios PED, cada archivo/link puede ser general o específico. Binario general no se duplica necesariamente.

## 8. ADR-046 — emails

Creación:
`1 envío → 1 email con N PED`.

Después:
`1 evento de PED → email de ese PED`, si el evento es notificable.

## 9. ADR-047 — Archivo

`archivado_at`/metadata de archivo no son estado. Terminales pueden archivarse/restaurarse sin borrar.

## 10. ADR-048 — gestión

Tablero + tabla, Mis pedidos, Sin asignar, Requieren atención, vistas terminales y Archivo. Sin drag/drop MVP.

## 11. ADR-049 — entrega

Finalizar exige archivo/link. Entrega posterior se versiona.

## 12. ADR-050 — cancelación/reapertura

Cancelar requiere motivo. Finalizado no se cancela directamente. Cancelado puede reabrirse con motivo:
- Nuevo sin responsable;
- En revisión con responsable.

## 13. Decisiones abiertas

| ID | Estado v3 | Pendiente |
|---|---|---|
| OPEN-001 | **CERRADO por ADR-038/039/050** | — |
| OPEN-002 | ABIERTO | Notion |
| OPEN-003 | ABIERTO | retención, borrado, backups, custodio |
| OPEN-004 | CERRADO documental | baseline WP; reconfirmar release |
| OPEN-005 | **CERRADO en lo principal** | campos/adjuntos/entrega definidos; MIME audiovisual queda OPEN-014 |
| OPEN-006 | **CERRADO en lo principal** | Auth/roles/rechazo/username definidos; último Admin → OPEN-015 |
| OPEN-007 | **CERRADO funcionalmente** | proveedor/preferencias finas quedan OPEN-009/011 |
| OPEN-008 | ABIERTO | staging receptor |
| OPEN-009 | ABIERTO | proveedor email/idempotencia |
| OPEN-010 | ABIERTO | framework UI/versiones |
| OPEN-011 | ABIERTO | volumen/SLO/RPO/RTO/umbrales restantes |
| OPEN-012 | ABIERTO | TTL/cooldown/antiabuso |
| OPEN-013 | ABIERTO | migración de históricos multiservicio |
| OPEN-014 | ABIERTO | MIME/extensiones audiovisuales adicionales |
| OPEN-015 | ABIERTO | último Admin/recuperación |
| OPEN-016 | ABIERTO | spike final upload/download Google Drive |

## 14. Propuestas no adoptadas

No se consideran aprobados:
- Google Workspace;
- storage público;
- Notion;
- Realtime;
- nuevos estados;
- drag & drop;
- borrado automático;
- MIME de video adicional;
- proveedor email;
- SLA;
- migración histórica destructiva.
