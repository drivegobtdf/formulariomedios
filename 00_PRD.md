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
- `OPEN-010`: CERRADO por baseline F1 (React 19 + TypeScript + Vite + React Router + Vitest + Playwright).
- `OPEN-011`: objetivos de volumen/latencia/RPO/RTO y algunos umbrales.
- `OPEN-012`: TTL exactos de tokens/capacidades y antiabuso.
- `OPEN-013`: estrategia de migración histórica de PED multiservicio de la revisión 2.0.
- `OPEN-014`: extensiones/MIME adicionales para material audiovisual menor de 10 MB.
- `OPEN-015`: protección del último Administrador y procedimiento de recuperación administrativa.
- `OPEN-016`: mecanismo definitivo de upload/download Drive tras prueba de integración en browsers objetivo.

## 21. Evidencia

Esta revisión registra decisiones funcionales aprobadas en conversación el 11/09/2026. No implica que el repositorio, Supabase, Drive, n8n o WordPress ya estén implementados o configurados.
