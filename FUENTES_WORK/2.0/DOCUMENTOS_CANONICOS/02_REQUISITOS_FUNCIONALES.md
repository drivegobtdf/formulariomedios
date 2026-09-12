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
