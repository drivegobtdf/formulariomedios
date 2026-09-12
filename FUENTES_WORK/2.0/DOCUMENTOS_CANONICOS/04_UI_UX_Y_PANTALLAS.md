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
