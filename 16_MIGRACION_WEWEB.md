# 16 — Migración desde WeWeb

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Objetivo

Retirar WeWeb y publicar WordPress + Supabase + Google Drive + n8n sin perder comportamiento necesario ni fabricar una migración histórica no aprobada.

## 2. Cambio de modelo

Destino v3:

```text
envío → N pedidos
```

No:
```text
pedido → N servicios_solicitados
```

## 3. Históricos

La revisión 2.0 documentó un modelo multiservicio por PED. Convertir un PED histórico en varios PED nuevos puede alterar:
- identificadores visibles;
- enlaces de seguimiento;
- auditoría;
- comunicaciones;
- referencias externas.

Por tanto `OPEN-013` bloquea cualquier flatten destructivo.

Opciones a decidir:
1. migrar solo datos nuevos desde cutover y conservar histórico WeWeb read-only;
2. importar histórico como snapshots legados sin convertir numeración;
3. convertir servicios históricos a nuevos PED con mapeo explícito y comunicación controlada.

No elegir automáticamente.

## 4. Datos a mapear

Para nuevos/cutover:
- contacto;
- categoría/tipo;
- campos específicos;
- estado;
- responsable si existe y puede mapearse;
- archivos;
- solicitudes info;
- comunicaciones relevantes;
- timestamps;
- IDs legado para trazabilidad.

## 5. Auth

No migrar contraseñas en texto. Usar mecanismos soportados de Supabase Auth/invitación/reset.

## 6. Numeración

Nuevos PED v3 usan `PED-YYYY-CNNNNNN`. Definir punto inicial y reconciliar con IDs históricos antes de producción para no generar colisiones/confusión.

## 7. Archivos

Destino Google Drive. Si se migran archivos:
- copiar/verificar;
- checksum cuando sea posible;
- metadata Supabase;
- no publicar links;
- reconciliar count/bytes.

## 8. Estados

Mapeo legado a:
- Nuevo;
- En revisión;
- En proceso;
- Esperando información;
- Finalizado;
- Cancelado.

Estados legados `Asignado`/`Correcciones` requieren regla explícita de migración, no equivalencia silenciosa.

## 9. Usuarios

Mapear identidades a `nombre_usuario`, rol y estado. Observador es nuevo.

## 10. Ensayo staging

- snapshot fuente;
- import;
- recuentos;
- muestras;
- PED mapping;
- files;
- auth;
- RLS;
- tracking;
- emails deshabilitados/mock;
- rollback.

## 11. Cutover

1. backup/snapshot;
2. freeze o ventana;
3. delta final;
4. migración;
5. smoke;
6. habilitar WordPress;
7. monitoreo;
8. rollback si gate falla.

## 12. Notificaciones

Nunca emitir eventos de `created/state_changed` por importar historia. Marcar eventos históricos para que no generen correo.

## 13. Rollback

Debe preservar:
- datos creados tras cutover o definir reconciliación;
- archivos;
- numeración;
- tokens;
- DNS/rutas/plugin.

## 14. Retiro

WeWeb solo después de aceptación, backup y período definido.

## 15. Bloqueantes

`OPEN-013`, staging, retención y mapeo real de datos existentes.
