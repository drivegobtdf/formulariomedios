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
