# PEDIDOS — Guía del proyecto y cambios

**Revisión 2.0 — 2026-09-11.** Sustituye el consolidado anterior del mismo tema.

Documento completo de consulta; los originales revisados se encuentran en DOCUMENTOS_CANONICOS del paquete. No implica implementación ni aprobación de reglas pendientes.

## Documentos incluidos

- `README.md`

---

# DOCUMENTO: README.md

# PEDIDOS — Documentación de desarrollo · revisión 2.0

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Arquitectura:** WSN-SC — WordPress + Supabase + n8n, Supabase-Centric  
**Código:** `PEDIDOS-WSN-SC-v1`  
**Fecha base:** 2026-09-10  
**Estado:** Revisión documental terminada; cierre funcional pendiente; desarrollo no iniciado por esta revisión
**Repositorio oficial:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio de auditoría histórica:** `https://github.com/saldiviapablo/formulariopedidos`  

Esta carpeta reemplaza los documentos de desarrollo que habíamos generado antes de contar con la auditoría corregida del WeWeb actual.

## Invariante funcional corregida

```text
1 envío del formulario = 1 PED
1 PED = 1..N servicios_solicitados
cada servicio posee estado, responsable y operación propios
```

El identificador visible `PED-YYYY-NNNNNN` pertenece a la cabecera `pedidos`.

## Índice

| # | Archivo | Propósito |
|---|---|---|
| 00 | `00_PRD.md` | Requisitos de producto y alcance |
| 00A | `00A_SRS.md` | Especificación formal y verificable del software |
| 01 | `01_ARQUITECTURA_OFICIAL.md` | Arquitectura WSN-SC |
| 02 | `02_REQUISITOS_FUNCIONALES.md` | Qué debe hacer el sistema |
| 03 | `03_FLUJOS_USUARIO.md` | Recorridos de cada actor |
| 04 | `04_UI_UX_Y_PANTALLAS.md` | Pantallas y experiencia |
| 05 | `05_MODELO_DATOS_SUPABASE.md` | Modelo PostgreSQL objetivo |
| 06 | `06_AUTENTICACION_RBAC_RLS.md` | Auth, roles y RLS |
| 07 | `07_RPC_EDGE_FUNCTIONS.md` | Operaciones de backend |
| 08 | `08_STORAGE_ARCHIVOS.md` | Archivos privados |
| 09 | `09_EVENTOS_QUEUES_N8N.md` | Eventos y automatizaciones |
| 10 | `10_PLUGIN_WORDPRESS.md` | Plugin frontend |
| 11 | `11_API_Y_CONTRATOS.md` | Contratos de integración |
| 12 | `12_SEGURIDAD.md` | Controles de seguridad |
| 13 | `13_ENTORNOS_SECRETOS_DESPLIEGUE.md` | Local, staging y prod |
| 14 | `14_PRUEBAS_QA_ACEPTACION.md` | Estrategia de pruebas |
| 15 | `15_PLAN_IMPLEMENTACION.md` | Fases de construcción |
| 16 | `16_MIGRACION_WEWEB.md` | Migración y cutover |
| 17 | `17_DECISIONES_ARQUITECTURA_ADR.md` | ADR |
| 18 | `18_TRAZABILIDAD.md` | Requisito → diseño → prueba |
| 19 | `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md` | Campos exactos del formulario/servicios |
| 20 | `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md` | Compatibilidad real del WordPress receptor |

## Jerarquía de autoridad
Las instrucciones vigentes del propietario del Proyecto gobiernan el trabajo. Para resolver discrepancias entre evidencias:
1. ADR aprobados.
2. PRD/SRS/requisitos aprobados.
3. Arquitectura y documentación vigente.
4. Repositorio/código real.
5. Pruebas verificables.
6. Informes de ejecutores.
7. Conversaciones anteriores.

El código demuestra lo implementado; no autoriza a incumplir una decisión aprobada. Una discrepancia se registra y resuelve explícitamente.

Los 23 originales de DOCUMENTOS_CANONICOS son la base editable de esta entrega; FUENTES_WORK contiene siete consolidados de su contenido, índice y manifiesto. No editar ambos juegos independientemente. Publicarlos en Git sigue pendiente; esta entrega no crea un commit.

## Reglas para agentes de programación
Antes de modificar código:
- leer `00_PRD.md`, `01_ARQUITECTURA_OFICIAL.md` y el documento específico;
- inspeccionar primero la implementación existente;
- hacer cambios mínimos y evitar regresiones;
- no introducir secretos en frontend o repositorio;
- ejecutar las pruebas relacionadas;
- informar archivos modificados;
- no alterar una ADR aceptada sin documentar la nueva decisión.

## Decisiones abiertas
- `OPEN-001`: regla exacta de `estado_general` cuando los servicios terminan en estados terminales mixtos.
- `OPEN-002`: confirmar si Notion debe existir en el producto futuro.
- `OPEN-003`: política institucional de retención de PII, archivos y auditoría.
- `OPEN-004`: RESUELTO para desarrollo — WordPress 7.0.2 / PHP 8.2.31.


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

## Baseline WordPress de producción

La compatibilidad del sitio receptor fue auditada en modo solo lectura.

Baseline para desarrollo:
- WordPress **7.0.2**;
- PHP **8.2.31**;
- Betheme **28.5.7**;
- Elementor **4.2.3**;
- Elementor Pro **3.33.1**;
- ElementsKit Lite;
- Wordfence Security;
- WP Super Cache;
- no Multisite;
- URL institucional `https://www.tierradelfuego.gob.ar`;
- página objetivo `/formulariomedios`.

`OPEN-004` queda **resuelto para desarrollo**. Staging permanece como requisito
operativo pendiente antes del despliegue.

Ver `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md`.

## Alcance de la autorización de esta revisión
El propietario pidió generar documentación corregida y reemplazar las fuentes tras la auditoría. Se incorporan correcciones documentales y diseños técnicos de seguridad, consistencia y secuenciación. Esto no implica autorización para programar, desplegar, escribir en GitHub, modificar servicios externos o decidir silenciosamente reglas de negocio abiertas.

Los estados de evidencia son: VERIFICADO (observado directamente), DOCUMENTADO (afirmación de una fuente), INFERIDO (conclusión razonada) y NO VERIFICADO (sin evidencia suficiente). Una especificación puede estar definida y no estar implementada.

## Estado comprobado y entrega
En la auditoría de esta conversación, GitHub respondió que el repositorio oficial estaba vacío tanto al consultar contenido como commits. Es una observación fechada, no una consulta permanente del estado actual. No se inspeccionaron las rutas Windows ni un Supabase, WordPress o n8n desplegados.

Paquete: 23 documentos canónicos revisados, manifest.json y nueve archivos en FUENTES_WORK. No contiene plugin ejecutable, migraciones ejecutables ni workflows implementados.

## Uso de las fuentes nuevas
Reemplazar las nueve fuentes anteriores por las nueve de FUENTES_WORK. No cargar simultáneamente las copias antiguas y nuevas ni los canónicos duplicados. Las instrucciones actuales del Proyecto siguen siendo compatibles; sus referencias a originales se resuelven con el índice maestro. Si la interfaz mantiene una instantánea anterior, sustituir esa fuente por el archivo revisado. No se afirma que guardar un archivo actualice automáticamente una asociación de Fuentes del Proyecto.

## Registro de cambios 2.0
- Conservados los 23 documentos y todos los identificadores de requisitos existentes.
- Corregida jerarquía de autoridad, referencias de versión, OPEN-004 y afirmaciones de verificación.
- Precisados tokens, autorización, uploads, idempotencia, concurrencia y comunicaciones.
- Reordenadas fases y definidos gates por riesgo; añadida trazabilidad individual a casos de prueba.
- Incluidos pendientes funcionales, operativos y de parámetros sin presentarlos como resueltos.
- Sustituido el manifiesto anterior por hashes calculados de esta entrega. No se certifica retrospectivamente la integridad de archivos originales que no estaban adjuntos por separado.

## Instrucciones para un ejecutor futuro
Antes de modificar, leer el requisito, ADR, contrato y gate relacionado; inspeccionar el repositorio y sus reglas. No ejecutar tareas bloqueadas por un OPEN. Informe obligatorio: resumen, archivos creados/modificados/eliminados, migraciones, comandos, pruebas/resultados, errores, riesgos, estado Git, commit si existe y desviaciones. Un informe de éxito sin evidencia no cierra una fase.

## Fuentes técnicas contrastadas
Consultadas durante la auditoría de esta conversación, 2026-09-11; verificar cambios relevantes al implementar:
- Edge y credenciales: https://supabase.com/docs/guides/functions/auth y https://supabase.com/docs/guides/functions/auth-headers
- RLS/funciones: https://supabase.com/docs/guides/database/postgres/row-level-security y https://supabase.com/docs/guides/database/functions
- Queues: https://supabase.com/docs/guides/queues
- TUS firmado: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Backup y objetos: https://supabase.com/docs/guides/platform/backups
- WordPress: https://wordpress.org/download/releases/ y https://developer.wordpress.org/plugins/shortcodes/
- Elementor: https://elementor.com/help/shortcode-widget/
- n8n: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data
- Contexto web/XSS: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

Estas fuentes respaldan mecanismos de plataforma; no prueban configuración, compatibilidad ni comportamiento del proyecto concreto. La selección AES-256-GCM, reservas y ledger es un diseño técnico de esta revisión, no una función desplegada verificada.

# FIN DOCUMENTO: README.md
