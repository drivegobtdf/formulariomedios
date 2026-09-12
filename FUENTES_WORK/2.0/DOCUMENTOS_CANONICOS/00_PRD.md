# 00 — PRD · Product Requirements Document

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


**Producto:** PEDIDOS — Secretaría de Medios  
**Arquitectura objetivo:** `PEDIDOS-WSN-SC-v1`  
**Versión:** 2.0

## 1. Resumen
PEDIDOS recibe solicitudes de servicios de comunicación y permite al equipo de Medios gestionar cada servicio hasta su entrega.

La nueva versión reemplaza WeWeb. WordPress.org integra la aplicación en el sitio institucional; Supabase concentra datos, Auth, seguridad, Storage y lógica; n8n ejecuta notificaciones e integraciones asíncronas.

## 2. Problema
El producto actual funciona pero depende de WeWeb. Se necesita una solución propia, mantenible, portable y entregable sin perder el comportamiento real ya validado.

## 3. Objetivos
- Retirar WeWeb sin perder funciones necesarias.
- Publicar la nueva aplicación bajo `/formulariomedios`.
- Mantener un único backend de negocio en Supabase.
- Entregar el frontend como plugin WordPress instalable.
- Mantener n8n fuera de la transacción crítica.
- Mejorar seguridad, trazabilidad, idempotencia y manejo de fallos.
- Permitir desarrollo sin servicios pagos obligatorios.

## 4. No objetivos del MVP
- No guardar PEDIDOS en MySQL/MariaDB de WordPress.
- No crear `wp_pedidos_*`.
- No usar `wp_users` como autorización de PEDIDOS.
- No usar n8n para generar PED.
- No exigir Realtime.
- No incorporar Notion al core sin decisión explícita.
- No reproducir contradicciones de la documentación histórica.

## 5. Actores
**Solicitante público:** crea un pedido, sigue su PED y responde información faltante sin cuenta interna.  
**Usuario pendiente:** posee identidad Auth, pero no acceso operativo.  
**Equipo interno:** gestiona servicios, estados, responsables, observaciones, aclaraciones y entregas.  
**Administrador:** administra accesos, roles y `nombre_usuario`.

## 6. Regla central

```text
UNA presentación del formulario
          ↓
       UN PED
          ↓
   1..N servicios
```

Ejemplo:

```text
PED-2026-000101
├── Diseño gráfico / Invitación digital
├── Diseño gráfico / Flyer RRSS
└── Cobertura de eventos
```

El PED identifica la solicitud global. Cada servicio es una unidad operativa independiente.

## 7. Formulario público
### Paso 1 — Datos
- Nombre y apellido.
- Teléfono.
- Correo electrónico.
- Área/dependencia solicitante.
- Selección de una o más categorías: Diseño gráfico, Cobertura de eventos, Gacetilla, Publicaciones en redes sociales.

### Paso 2 — Pedido
Se muestran formularios específicos. Diseño admite varias piezas:
- Flyer RRSS.
- Invitación digital.
- Certificados.
- Otros requerimientos gráficos.

También existen los tipos Cobertura de eventos, Gacetilla y Redes sociales.

### Paso 3 — Confirmación
- Adjuntos.
- Resumen.
- Confirmación explícita.
- Envío idempotente.
- Resultado con un único PED.

### Adjuntos
Baseline de paridad:
- máximo 5;
- máximo 25 MB cada uno;
- PDF, PNG, JPG/JPEG, DOCX, ZIP;
- privados por defecto.

## 8. Seguimiento público
El solicitante puede consultar su PED sin cuenta. La nueva solución mejora seguridad: el PED visible no basta para acceder a información sensible; se usa un token seguro. La recuperación mediante email responde de forma neutra para evitar enumeración.

## 9. Información faltante
El equipo puede pedir información para un servicio.

Regla verificada que se conserva:

```text
crear solicitud de información
≠ cambiar automáticamente estado del PED
≠ cambiar automáticamente estado del servicio
```

Su ciclo propio es `pendiente → respondida | vencida`, con vigencia inicial de 15 días.

## 10. Gestión interna
Debe conservar:
- Kanban por estado de servicio;
- tabla consolidada por PED;
- búsqueda y filtros;
- detalle;
- asignación de responsable usando `nombre_usuario`;
- estados por servicio;
- observaciones internas;
- solicitud de información;
- entrega final;
- historial/comunicaciones.

No se requiere drag & drop en MVP.

## 11. Estados
**Pedido general:** Nuevo, En proceso, Finalizado, Cancelado.  
**Servicio:** Nuevo, En revisión, Asignado, En proceso, Esperando información, Correcciones, Finalizado, Cancelado.  
**Información:** pendiente, respondida, vencida.  
**Acceso:** pendiente, aprobado, revocado.

## 12. Usuarios internos
La interfaz objetivo adopta el modelo actualizado ya presente en el editor auditado:
- nombre;
- apellido;
- `nombre_usuario`;
- email;
- contraseña gestionada por Supabase Auth.

`nombre_usuario`: 2–30 caracteres, lowercase, `[a-z0-9._-]`, único.

## 13. Comunicaciones
Eventos mínimos:
- pedido creado;
- cambio de estado notificable;
- información faltante solicitada;
- respuesta recibida;
- servicio finalizado;
- cancelación, si corresponde.

Arquitectura objetivo: `Supabase Queue → n8n`. Un fallo de email no revierte una operación ya confirmada.

## 14. Requisitos no funcionales
**Seguridad:** RLS, grants mínimos, secretos server-side, tokens hasheados, Storage privado, backend crítico controlado y auditoría.  
**Confiabilidad:** transacciones, idempotencia y reintentos acotados.  
**Accesibilidad:** objetivo WCAG 2.2 AA.  
**Responsive:** formularios móviles a una columna; Kanban horizontal en pantallas reducidas.  
**Mantenibilidad:** migrations versionadas, plugin modular, contratos documentados.

## 15. Restricción de costos de desarrollo
El desarrollo debe poder realizarse con costo de plataforma/software igual a cero usando WordPress.org local, Supabase local y/o Free, n8n Community Edition y Git. Esto no garantiza que producción permanezca indefinidamente en cuotas gratuitas.

## 16. Criterios de éxito
- 1 envío con N servicios crea 1 PED + N servicios.
- Doble envío/retry no duplica PED.
- Numeración concurrente sin colisiones.
- Seguimiento protegido.
- Aclaraciones completas.
- Pending/revoked sin acceso.
- Kanban y tabla operativos.
- Estados/responsable por servicio.
- Archivos privados.
- n8n puede fallar sin perder la transacción.
- QA/RLS/security aprobados.
- Migración ensayada y rollback probado.

## 17. Decisiones abiertas
`OPEN-001`: agregación exacta de `estado_general` ante servicios terminales mixtos.  
`OPEN-002`: mantener o retirar Notion.  
`OPEN-003`: retención/borrado institucional.  
`OPEN-004`: resuelto documentalmente para desarrollo; reconfirmación del receptor antes de release.


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

## 18. Baseline de compatibilidad WordPress

El sitio receptor auditado utiliza WordPress 7.0.2, PHP 8.2.31, Betheme 28.5.7,
Elementor 4.2.3, Elementor Pro 3.33.1, ElementsKit Lite, Wordfence Security y
WP Super Cache.

La página objetivo será `/formulariomedios` dentro de
`https://www.tierradelfuego.gob.ar`.

El plugin deberá ser compatible sin exigir desactivar seguridad, caché,
Elementor ni el theme existente.

## 19. Precisiones de alcance de la revisión 2.0
Se mantiene el catálogo de paridad de cuatro categorías y siete tipos de servicio. No se incorporan categorías de conversaciones históricas ni nuevas piezas por inferencia.

El límite de cinco adjuntos se aplica a la presentación inicial completa. La asociación de adjuntos a un servicio es soportada por el modelo y el contrato; el control visual exacto se cierra en OPEN-005. El límite para respuestas de información y entregas se define por contexto antes de implementar esa función, no se deduce del límite inicial.

Una corrección técnica no aprueba una regla de negocio nueva. OPEN-001 (estados), OPEN-005 (campos/adjuntos/entrega), OPEN-006 (identidad/roles) y OPEN-007 (notificaciones) requieren cierre para sus funciones. Ver registro único en 17_DECISIONES_ARQUITECTURA_ADR.md.

El resultado de esta revisión es APTO CON CORRECCIONES: permite preparar una base documental y planificar; no declara el producto listo, seguro en producción ni autorizado para implementación automática.
