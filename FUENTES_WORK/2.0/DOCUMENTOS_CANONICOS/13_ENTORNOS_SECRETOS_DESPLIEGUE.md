# 13 — Entornos, secretos y despliegue

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Entornos
| Entorno | WordPress | Supabase | n8n | Datos |
|---|---|---|---|---|
| local | XAMPP/local | CLI/Docker | CE local | seed ficticio |
| staging | WP staging | Supabase staging | n8n staging | sintético |
| production | institucional | Supabase prod | n8n prod | real |

No copiar PII de Production a local.

## 2. Supabase local

```bash
supabase init
supabase start
supabase db reset
```

`db reset` es destructivo para la base objetivo: solo local/staging controlado.

La carpeta `supabase/` se versiona con migrations, functions, tests y seeds.

## 3. Estructura de implementación
Esta estructura corresponde al repositorio oficial `https://github.com/drivegobtdf/formulariomedios`:


```text
/
├── wordpress-plugin/pedidos-medios/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   ├── seed.sql
│   └── config.toml
├── n8n/workflows/
├── docs/development/
└── .github/
```

## 4. Configuración frontend
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_BASE_PATH`
- `APP_ENV`

Publishable key no es secret.

## 5. Secretos
Supabase/n8n:
- secret API key solo donde sea necesaria;
- `N8N_INTEGRATION_SECRET`;
- credenciales de proveedor email.

Nunca en `.env.example` con valor real.

## 6. WordPress
Constantes/filtros por entorno:
- `PEDIDOS_SUPABASE_URL`
- `PEDIDOS_SUPABASE_PUBLISHABLE_KEY`
- `PEDIDOS_APP_ENV`

No guardar secret key Supabase en WordPress.

## 7. Compatibilidad
Aplicar ADR-032 y documento 20 como baseline receptor. Las recomendaciones generales de los fabricantes y las últimas versiones disponibles se consultan al fijar herramientas y preparar un release; no reemplazan automáticamente las versiones de compatibilidad aprobadas. Registrar versión de WordPress/PHP/Elementor/Pro/Betheme, plugins de seguridad/caché, CLI, PostgreSQL/pgmq, runtime Edge, Node/Vite y n8n realmente utilizados.

## 8. Desarrollo sin pago obligatorio
- WordPress.org/XAMPP.
- Supabase CLI local y/o Free.
- n8n CE local.
- Git.

No asumir que Free cubre producción futura.

## 9. Migrations
- todo cambio DB en migration;
- seeds sin PII;
- evitar cambios manuales no versionados;
- cambios destructivos requieren backup y rollback.

## 10. Git
Feature branch → PR → CI → staging → aprobación → producción.

## 11. Release plugin
SemVer. ZIP reproducible. Excluir `.env`, `node_modules`, credenciales y archivos innecesarios.

## 12. Backups
Antes de datos reales y cutover: backup recuperable de PostgreSQL y de los objetos Storage; backup de WordPress y configuración; exports n8n sin credenciales y respaldo protegido de su configuración/clave de cifrado cuando corresponda. El inventario de archivos acompaña al backup, no lo sustituye.

Los backups de DB de Supabase no incluyen objetos Storage. Ensayar restauración conjunta, referencias y permisos, excluyendo envío de eventos históricos. Registrar custodio, periodicidad, retención, cifrado, RPO (pérdida de datos tolerable) y RTO (tiempo de recuperación); parámetros en OPEN-003/011.

Fuente: https://supabase.com/docs/guides/platform/backups (consulta 2026-09-11). No presuponer que una cuenta Free incluye la política de backup requerida.

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

## 13. Baseline del entorno receptor

Producción auditada:
- WordPress 7.0.2;
- PHP 8.2.31;
- no Multisite;
- Betheme 28.5.7;
- Elementor 4.2.3;
- Elementor Pro 3.33.1;
- Wordfence;
- WP Super Cache;
- dominio `https://www.tierradelfuego.gob.ar`.

El entorno local deberá aproximarse a WordPress/PHP de producción cuando sea
práctico. Staging no fue verificado y debe confirmarse antes del despliegue.

## 14. Compatibilidad de versiones y releases
Cada release registra: versión plugin, intervalo de contrato API soportado, versión de formularios, migraciones aplicadas, schema_version de eventos y consumidor compatible. Cambios aditivos preceden la actualización de clientes; eliminar campos o RPC requiere terminar la ventana de compatibilidad. Los errores por contrato incompatible deben ser explícitos.

Preparar ZIP reproducible con checksum, guía de instalación para un tercero, configuración pública requerida y evidencia de QA. Actualizar backend compatible antes del plugin cuando el release así lo requiera; no ejecutar migraciones remotas silenciosamente al activar un ZIP.

## 15. Separación de entornos y secretos
No reutilizar secretos entre local/staging/producción. No enviar correo real en CI: capturador/mock y destinatarios sintéticos. Los ensayos de migración con datos reales exigen entorno aislado, autorización, acceso restringido y política de retención; no llevar PII a local. Fijar allowlists Auth/CORS por entorno y permitir solo callbacks concretos.

El desarrollo gratuito se refiere a no exigir pagos nuevos para construir el núcleo. La disponibilidad/licencia del stack comercial del receptor para QA está pendiente; no se promete reproducirlo gratis sin contar con autorización/paquetes legítimos. Un WordPress genérico valida el shell pero no cierra QA-COMP.

## 16. Operación y recuperación
Logs correlacionan request_id, event_id, delivery_id e intento, sin payloads sensibles. Alertas mínimas: antigüedad del trabajo pendiente, entregas inciertas, failed/dead-letter, errores públicos y presión de Storage. Responsable y umbrales en OPEN-011.

El rollback debe distinguir plugin, backend y tráfico. No restaurar una DB antigua sobre pedidos nuevos. Bloquear escrituras durante reconciliación, inventariar la ventana, conservar PED/relaciones/archivos/respuestas y corregir secuencias sin reutilizar números. Ver 16_MIGRACION_WEWEB.md.
