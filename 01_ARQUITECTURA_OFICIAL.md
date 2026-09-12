# 01 — Arquitectura oficial

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Decisión

Arquitectura objetivo:

```text
                   WORDPRESS.ORG
              /formulariomedios/*
                        │
                 plugin frontend
                        │
                        ▼
                 SUPABASE EDGE/API
                  │      │       │
                  │      │       └── Supabase Auth
                  │      └────────── PostgreSQL / RLS / RPC
                  │
                  ├── OAuth 2.0 server-side
                  ▼
               GOOGLE DRIVE
             archivos físicos
                  │
                  └── metadata/IDs vuelven a Supabase

Supabase → eventos/Queue → n8n → email/integraciones
```

**Supabase sigue siendo fuente de verdad del negocio. Google Drive es proveedor de objetos, no base de datos ni sistema de permisos de PEDIDOS.**

## 2. Invariante v3

```text
1 envío = 1..N PED
1 PED = 1 pieza/servicio
```

La relación entre PED hermanos se conserva en `envios_formulario`.

## 3. WordPress

Responsabilidades:
- URL, navegación, integración institucional y theme;
- app shell y assets;
- frontend del formulario, seguimiento, Auth y gestión.

No:
- genera PED;
- almacena dominio PEDIDOS;
- decide permisos;
- guarda secretos de Drive/Supabase;
- actúa como backend de archivos.

## 4. Plugin `pedidos-medios`

TypeScript + Vite; PHP reducido para shell, assets, routing y configuración pública. `supabase-js` local en bundle. Config pública: Supabase URL, publishable key, environment, base path y contract version.

## 5. Supabase PostgreSQL

Fuente de verdad para:
- envíos;
- PED;
- secuencia global anual;
- catálogos;
- estados;
- responsables y asignaciones;
- usuarios de acceso;
- solicitudes de información;
- metadata/asociación de archivos;
- links externos;
- entregas;
- notas;
- eventos, comunicaciones y auditoría;
- idempotencia/concurrencia.

## 6. Supabase Auth

Identifica usuarios internos. `authenticated` es rol técnico; `administrador`, `equipo`, `observador` son roles de aplicación.

## 7. Google Drive

Almacena binarios bajo una carpeta dedicada controlada por la aplicación.

Principios:
- el ciudadano no ve Drive;
- no se publican carpetas `anyone`;
- OAuth y refresh token viven server-side;
- metadata autoritativa vive en Supabase;
- Drive `file_id` es referencia física;
- no usar n8n como proxy de upload.

La cuenta de Drive actual puede ser personal con capacidad disponible; esto es una decisión operativa válida para el desarrollo actual, pero la propiedad institucional/transferencia futura queda cubierta por `OPEN-003/OPEN-016`.

## 8. Upload seguro

Flujo preferido sujeto a spike `OPEN-016`:

```text
Browser
  ↓ upload-prepare
Edge Function
  ├─ valida sesión, tamaño, cantidad, MIME, contexto
  ├─ reserva metadata en PostgreSQL
  ├─ obtiene OAuth access token server-side
  └─ inicia resumable upload de Drive
         ↓
   URI temporal de sesión
         ↓
Browser envía binario a Google
         ↓
upload-complete
         ├─ verifica file_id/metadata
         └─ confirma asociaciones a PED
```

Google documenta resumable uploads como mecanismo recomendado para archivos >5 MB y útil también para pequeños; la sesión de Google no sustituye nuestros TTL/capacidades.

Si la prueba de navegador demuestra que el PUT directo no es viable por CORS/política, se implementará un relay server-side controlado, nunca n8n en la ruta crítica.

## 9. Download seguro

Drive no debe exponerse mediante enlaces públicos permanentes. Un endpoint controlado valida:
- token público o JWT interno;
- rol/estado;
- relación archivo↔PED;
- contexto autorizado.

Luego obtiene/streaming del binario mediante Drive API o entrega un mecanismo temporal equivalente aprobado en `OPEN-016`.

## 10. RPC y Edge

**RPC:** secuencia, creación transaccional, asignaciones, estados, archivo, auditoría.  
**Edge:** fronteras públicas, seguimiento, recuperación, Drive OAuth/upload/download, CORS, antiabuso, Queue/n8n.

## 11. n8n

```text
commit negocio
→ evento durable
→ Queue
→ n8n
→ proveedor email/integración
→ resultado
```

n8n no genera PED, no autoriza usuarios y no recibe uploads públicos como componente obligatorio.

## 12. Flujo de creación

```text
Browser
  ├─ prepara envío
  ├─ prepara/sube archivos
  └─ create-submission
          ↓
      RPC transaccional
          ├─ valida idempotencia
          ├─ crea envios_formulario
          ├─ reserva N números globales
          ├─ crea N pedidos
          ├─ asocia archivos/links
          ├─ crea tokens tracking
          ├─ audit
          └─ evento submission.created
                    ↓
                  Queue → n8n → 1 email inicial
```

## 13. Seguimiento

Cada PED tiene token independiente y DTO público independiente. La pertenencia a un mismo envío no autoriza a consultar automáticamente PED hermanos.

## 14. Rutas objetivo

- `/formulariomedios/`
- `/formulariomedios/solicitud-recibida`
- `/formulariomedios/seguimiento`
- `/formulariomedios/solicitud-informacion`
- `/formulariomedios/login`
- `/formulariomedios/solicitar-acceso`
- `/formulariomedios/gestion`
- `/formulariomedios/pedido/:id`
- `/formulariomedios/usuarios`
- `/formulariomedios/archivo`

## 15. Dependencias evitadas

- `wp_pedidos_*`;
- Auth doble;
- Supabase Storage para binarios v3;
- WordPress uploads para material PEDIDOS;
- n8n en ruta crítica;
- Drive como fuente de permisos;
- enlaces Drive públicos permanentes;
- Realtime obligatorio.

## 16. Desarrollo

- Supabase CLI/Docker local.
- Mock/fake Drive adapter en tests locales.
- Google Drive real en staging controlado.
- migrations, Edge Functions, plugin y workflows versionados.
- credenciales fuera de Git.

## 17. Compatibilidad receptor

Se conserva el baseline documentado de revisión 2.0:
WordPress 7.0.2, PHP 8.2.31, Betheme 28.5.7, Elementor 4.2.3, Elementor Pro 3.33.1, ElementsKit Lite, Wordfence y WP Super Cache. Debe reconfirmarse antes de release.

## 18. Cambio arquitectónico

`PEDIDOS-WSN-GD-v2` sustituye documentalmente `PEDIDOS-WSN-SC-v1` porque:
- cambia el agregado principal;
- se elimina `servicios_solicitados` como unidad operativa de nuevos PED;
- Google Drive reemplaza Supabase Storage para binarios;
- se amplía RBAC y catálogo de servicios.

No existe implementación verificada de esta arquitectura al emitir la revisión.
