# 08 — Storage y archivos

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Decisión
Bucket Supabase privado: `pedidos-private`. No `wp-content/uploads`.

## 2. Baseline
- máximo 5 archivos;
- máximo 25 MB;
- PDF, PNG, JPG/JPEG, DOCX, ZIP;
- privados.

25 MB queda por debajo del límite máximo actual de 50 MB por archivo configurable en proyectos Supabase Free.

## 3. Carga pública
1. submission-prepare emite sesión/capacidad de presentación sin crear un PED.
2. upload-prepare valida esa capacidad, contexto y cupo; crea reserva y path aleatorio.
3. Emite autorización firmada; navegador transfiere directamente a Storage.
4. upload-complete verifica objeto, bytes, tipo y estado; marca verified o rejected.
5. create-pedido consume la reserva verificada y la asocia de forma atómica al pedido/servicio.

No dar INSERT genérico a anon. Una ruta de objeto recibida del cliente no demuestra pertenencia. Para solicitudes de información se emite reserva vinculada al token/contexto específico; no se acepta una reserva inicial de otro PED. Las cargas internas requieren usuario aprobado y autorización de contexto.

Para archivos mayores de 6 MB usar TUS reanudable como diseño preferido. Supabase soporta tokens firmados con x-signature en TUS. Probar la librería/versión elegida sin incluir upsert general: las cargas son inmutables y no deben sobrescribir archivos asociados.

Referencia: https://supabase.com/docs/guides/storage/uploads/resumable-uploads (consulta 2026-09-11).

## 4. Paths
```text
incoming/<submission_key>/<file_uuid>/<safe_filename>
```

No incluir PII ni tokens.

## 5. Huérfanos
El plazo inicial genérico de 24 h se sustituye por una política coordinada con la ventana máxima de carga reanudable y las autorizaciones emitidas. Nunca limpiar solo por antigüedad del path. Registrar último vencimiento técnico y margen, sin borrar antes de que expire toda autorización activa.

El job reclama reservas vencidas no asociadas, bloquea nuevas vinculaciones mientras elimina y reintenta de forma segura si falla Storage. Una reserva en committing o attached no se elimina. Un inventario reconcilia objetos sin reserva, reservas sin objeto y metadata sin objeto. No borrar metadata de objetos asociados para ocultar un fallo.

Los plazos concretos se registran en OPEN-012 antes de habilitar la función. La ventana de upload TUS y la de la URL firmada son distintas; probar ambas, no inventar expiraciones soportadas por el proveedor.

## 6. Descarga interna
Sesión aprobada → autorización → signed URL corta (p.ej. 15 minutos).

## 7. Descarga pública
Solo para archivo/entregable autorizado por tracking token; generar signed URL específica y temporal.

## 8. Policies
- bucket no listable públicamente;
- public sin SELECT directo;
- carga pública solo por signed upload emitido por backend;
- personal aprobado con políticas de acceso;
- delete restringido.

## 9. Validación
Dos capas:
1. restricciones bucket;
2. aplicación: extensión, MIME, tamaño y contexto.

No afirmar antivirus si no se implementa; puede añadirse según política institucional.

## 10. Metadata
`archivos`: relaciones, path, nombre original, MIME, bytes, contexto, uploader interno y timestamp.

## 11. Borrado
No habilitar borrado físico de datos históricos hasta aprobar `OPEN-003`. Toda eliminación debe sincronizar autorización, objeto, metadata y auditoría.


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

## 12. Verificación y límites por contexto
Cinco archivos por presentación inicial, 25 MB por archivo y formatos PDF/PNG/JPG/JPEG/DOCX/ZIP se conservan. El límite se cuenta sobre reservas activas/objetos vinculables de la sesión y se hace cumplir server-side; no se evade abriendo varias ventanas. Definir bytes exactos de “25 MB” en OPEN-012 y comunicarlos igual en UI/servidor/bucket.

No confiar solo en Content-Type o extensión del cliente. Comparar tamaño almacenado y verificar firma/formato según tipo; DOCX y ZIP necesitan identificación específica sin extracción insegura. Los metadatos declarados y detectados se distinguen. Una discrepancia rechaza el archivo. No se afirma protección antivirus si no existe; análisis antimalware/ZIP y política de descarga se deciden según riesgo institucional antes de producción.

Entrega/adjuntos internos/respuestas de información usan contratos de cupo independientes pendientes OPEN-005; no ampliar automáticamente el máximo inicial.

## 13. Descargas
La Edge de firma valida primero el contexto y autorización, luego devuelve una URL temporal únicamente del objeto permitido. Separar adjuntos internos y entregables públicos mediante contexto, no por nombre de archivo. No devolver listados de buckets ni paths que no necesita el cliente.

La revocación impide nuevas firmas; documentar acceso residual de URLs ya emitidas y su TTL. La respuesta de firma y cualquier token se excluyen de logs y cachés compartidas. Regenerar URLs al consultar; los datos operativos conservan referencias estables.
