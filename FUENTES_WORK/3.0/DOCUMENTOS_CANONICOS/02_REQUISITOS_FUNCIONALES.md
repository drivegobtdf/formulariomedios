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
- 48 horas corridas (Cambio aprobado por el responsable: vigencia de solicitudes de información faltante de 15 días a 48 horas corridas);
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
