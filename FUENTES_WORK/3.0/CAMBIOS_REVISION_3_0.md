# PEDIDOS — Resumen de cambios de revisión 3.0

**Fecha:** 2026-09-11  
**Arquitectura:** `PEDIDOS-WSN-GD-v2`  
**Base inspeccionada:** los archivos subidos por el propietario:
- `DOCUMENTOS_CANONICOS.rar` SHA-256 `363034c516f27c0872afd5ccc0bf05cc99b6b201b4996c6fbb2f7f6dae00ed4c`
- `FUENTES_WORK.rar` SHA-256 `c7ce3da4b376dbf91297527e4cc532a133c1191a92c401a9aafd4cfab6fb4628`

Ambos paquetes contenían la revisión documental 2.0 del 11/09/2026. La revisión 3.0 se generó sobre esos archivos exactos.

## Cambios funcionales aprobados

1. Un envío puede generar múltiples PED; cada pieza/servicio tiene PED independiente.
2. Correo inicial único con todos los PED; notificaciones posteriores por PED afectado.
3. Ocho categorías: Diseño, Cobertura, Gacetilla, Redes, Producción audiovisual, Motion graphics, Streaming y Web.
4. Numeración `PED-YYYY-CNNNNNN` con código de categoría y contador global anual.
5. Estados: Nuevo, En revisión, En proceso, Esperando información, Finalizado, Cancelado.
6. Responsable obligatorio antes de pasar a En revisión; asignaciones/reasignaciones auditadas.
7. Roles: Administrador, Equipo y Observador.
8. Tablero + Tabla + Mis pedidos + Requieren atención + Finalizados/Cancelados + Archivo.
9. Archivado reversible separado del estado.
10. Google Drive para binarios; Supabase para permisos/metadata.
11. Hasta 10 archivos de 10 MB; link opcional para material más pesado.
12. En multi-PED, archivos/links generales o específicos.
13. Seguimiento independiente y seguro por PED.
14. Finalización con archivo/link y entregas versionadas.
15. Cancelación y reapertura con motivo.
16. Flujo de asesoramiento para las cuatro categorías nuevas.
17. `nombre_usuario` como identificador operativo de asignación; login por email.

## Cambios estructurales

- `envios_formulario` agrupa la presentación.
- `pedidos` pasa a ser la unidad operativa directa.
- `servicios_solicitados` deja de ser agregado operativo para nuevos datos v3.
- desaparece `estado_general`.
- archivo N:M permite compartir un binario Drive entre varios PED.
- nuevo historial explícito de asignaciones.
- eventos `submission.created` y `pedido.*` separan agrupación inicial de cambios individuales.

## Pendientes preservados

No se inventaron decisiones sobre Notion, retención, staging, proveedor email, framework UI, SLA/RPO/RTO, TTL/antiabuso, migración histórica, MIME audiovisual adicional, último administrador ni mecanismo final de transferencia Drive antes del spike.

## Estado

Esta entrega es documentación. No modifica GitHub, Supabase, Google Drive, n8n ni WordPress.
