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
- `Esperando información (vence en < 24h)` / `Solicitud de información vencida` (Cambio aprobado por el responsable: vigencia de solicitudes de información faltante de 15 días a 48 horas corridas).

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
