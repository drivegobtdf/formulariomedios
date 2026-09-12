# 16 — Migración desde WeWeb

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Objetivo
**Origen documental/auditoría:** `https://github.com/saldiviapablo/formulariopedidos`  
**Destino de implementación y migraciones:** `https://github.com/drivegobtdf/formulariomedios`

Migrar el sistema actual a WSN-SC manteniendo PED visibles, relaciones, estados, usuarios necesarios, archivos y continuidad operativa.

La fuente es la auditoría current-state, no el handoff MySQL histórico.

## 2. Mapeo
| WeWeb actual | Supabase objetivo |
|---|---|
| `pedidos` | `pedidos` |
| `servicios_solicitados` | `servicios_solicitados` |
| `solicitudes_informacion` | `solicitudes_informacion` |
| `comunicaciones_pedido` | `comunicaciones_pedido` |
| `archivos` | `archivos` + Storage |
| `secuencias` | `pedido_sequences` |
| `usuarios_acceso` | `usuarios_acceso` |
| `areas` | `areas` |
| `tipos_servicio` | `tipos_servicio` |
| `configuracion` | env/seed/solo tabla si se justifica |

Notion queda fuera salvo `OPEN-002`.

## 3. PED
Conservar `pedido_visible` exactamente.

Antes de habilitar creación nueva:
- calcular máximo por año;
- inicializar `pedido_sequences.current_value`;
- verificar que nunca genere un número existente.

## 4. Multiservicio
Reconciliar:
- todo pedido tiene >=1 servicio;
- cada servicio apunta a pedido válido;
- **no crear un PED nuevo por servicio** durante transformación.

Esta es una prueba crítica por el error histórico previo.

## 5. Auth
No asumir que hashes/passwords de WeWeb son migrables. Preparar inventario de identidades y mapa old_id → nuevo Auth UUID antes de importar FKs.

Orden seguro: crear/invitar identidad Supabase por canal administrativo; crear/vincular perfil con estado/rol revisados; importar responsables y actores mediante mapa; establecer/resetear password; validar acceso. No insertar perfiles con FK a identidades que aún no existen. No poner PII o credenciales en seeds del repositorio.

Migrar hashes solo con compatibilidad oficialmente demostrada. Ensayar colisiones de username/email, cuentas faltantes, responsables históricos revocados y el primer admin. No autorizar acceso como efecto implícito de importar una fila.

## 6. Tokens
No copiar raw tokens por conveniencia.
- PED visible se conserva.
- emitir/rotar tracking token nuevo cuando corresponda.
- requests info activas: conservar hash solo si contrato compatible; si no, reemitir acceso.

## 7. Storage
1. inventario metadata;
2. copiar a bucket privado;
3. validar size/MIME;
4. insertar metadata;
5. reconciliar conteos/checksum cuando sea posible;
6. no conservar URL pública permanente.

## 8. Comunicaciones
Migrar histórico que tenga valor operativo/auditor. No encolar mensajes históricos como nuevos.

## 9. Estados
Mapeo inicial uno-a-uno. No “normalizar” estados de producción sin regla aprobada.

## 10. Notion
Si se elimina: no sincronizar en v1.  
Si se mantiene: consumidor asíncrono posterior al core.

## 11. Ensayo staging
Reconciliar:
- conteos;
- PED únicos;
- servicios por PED;
- estados;
- responsables;
- info requests;
- archivos;
- usuarios;
- secuencia.

## 12. Cutover
1. anunciar;
2. backup;
3. freeze writes WeWeb si es posible;
4. export delta;
5. importar delta;
6. fijar sequence;
7. activar WordPress;
8. smoke test;
9. monitor.

## 13. Rollback
Preparar antes del cutover un registro de la ventana y responsables. Si hay falla, congelar escrituras en ambos lados, conservar operaciones nuevas y determinar si basta volver al ZIP anterior con backend compatible. Volver a WeWeb requiere reconciliar PED, servicios, respuestas, archivos y usuarios creados/modificados durante la ventana; no restaurar simplemente un backup que los borre.

No reutilizar números PED ya asignados. Reconciliar secuencias, eventos procesados y enlaces emitidos; evitar emails repetidos. Probar el procedimiento con datos sintéticos y con el ensayo autorizado de migración. Cerrar rollback solo después de la ventana de estabilidad y aprobación del propietario.

## 14. Retiro
No eliminar WeWeb inmediatamente. Conservarlo durante una ventana acordada de consulta/rollback y realizar export final.


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

## 15. Requisitos del WordPress receptor para cutover

Antes del cutover:
- reconfirmar versiones de WordPress/PHP/Elementor;
- confirmar ensayo staging y ventana controlada con rollback; una réplica WP exige aprobación explícita y no elimina ensayo de migración;
- invalidar WP Super Cache tras instalar una nueva versión;
- smoke test con Wordfence activo;
- validar `/formulariomedios` con header/footer real.

## 16. Mapeo previo obligatorio
No repetir auditoría general WeWeb. Usar evidencia current-state ya aceptada para construir mapeo columna → columna, transformaciones, IDs preservados/remapeados, validación de casos excepcionales y procedencia. Verificar puntualmente solo vacíos reales. El commit QA 0efb624 es referencia DOCUMENTADA; esta revisión no reabrió esa auditoría.

Para cada tabla: conteo inicial/final, claves únicas, FKs, nulos, estados, responsables, versiones de formulario y casos no migrables. Para Storage: copia real, checksum cuando sea viable y prueba de descarga autorizada. No copiar enlaces públicos como sustituto del objeto privado. Las excepciones tienen resolución aprobada, nunca eliminación silenciosa.

No emitir nuevos eventos por importar historia. Los mensajes de transición/cutover definidos por negocio son operaciones nuevas identificadas aparte. Freeze efectivo, delta y revalidación de secuencia son requisitos; si no es posible congelar, diseñar captura del delta antes de autorizar el corte.
