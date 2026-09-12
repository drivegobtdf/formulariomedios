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
