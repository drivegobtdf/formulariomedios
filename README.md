# PEDIDOS — Documentación de desarrollo · revisión 3.0

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** FASE F1 COMPLETADA (Skeleton del repositorio y toolchain reproducible).  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  

---

## Invariante funcional v3

```text
1 envío = 1..N PED
1 pieza/servicio = 1 PED
```

Ejemplo:
```text
PED-2026-D000101 — Flyer
PED-2026-D000102 — Invitación
PED-2026-C000103 — Cobertura
```

---

## Stack Tecnológico

- **WordPress.org**: UI / integración institucional / app shell (`pedidos-medios`).
- **Frontend SPA**: React 19 + TypeScript + Vite + React Router (scoping en `.pedidos-app`).
- **Supabase**: PostgreSQL, Auth, RLS, RPC, Edge, Queue, auditoría y metadata.
- **Google Drive**: Almacenamiento físico de binarios.
- **n8n**: Comunicaciones y automatizaciones asíncronas.
- **Testing**: Vitest (Unit) + Playwright (E2E) + ESLint + Prettier.

---

## Guía de Desarrollo Local (Toolchain F1)

### Requisitos previos
- **Node.js**: 24 LTS (o compatible `>= 20.x`).
- **npm**: `>= 10.x`.
- **Git**.
- **Supabase CLI**: Incluido como devDependency del monorepo (`npx supabase`).
- **Docker**: Requerido para levantar el stack local de Supabase (Fase F2 en adelante).

### Instalación
```bash
# Clonar repositorio
git clone https://github.com/drivegobtdf/formulariomedios.git
cd formulariomedios

# Instalar dependencias del monorepo y workspace frontend
npm install

# Copiar variables de entorno de ejemplo si es necesario
cp .env.example .env
```

### Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor de desarrollo Vite del frontend en `http://localhost:5173/formulariomedios/` |
| `npm run build` | Compila el bundle frontend TypeScript + React hacia `pedidos-medios/dist/` con manifest |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos |
| `npm run lint` | Ejecuta ESLint en todo el proyecto |
| `npm run lint:fix` | Corrige problemas automáticos de ESLint |
| `npm run format` | Formatea el código con Prettier |
| `npm run test:unit` | Ejecuta pruebas unitarias con Vitest |
| `npm run test:e2e` | Ejecuta pruebas de humo E2E con Playwright |
| `npm run test` | Ejecuta suite completa (Unit + E2E) |
| `npm run supabase:status` | Consulta el estado del stack local de Supabase |

### Integración en WordPress (Plugin `pedidos-medios`)

1. El código PHP del plugin reside en `pedidos-medios/`.
2. Para generar los assets de producción de la SPA, ejecutar:
   ```bash
   npm run build
   ```
3. Los assets compilados se depositan automáticamente en `pedidos-medios/dist/` junto con su `manifest.json`.
4. En WordPress, insertar el shortcode:
   ```text
   [pedidos_medios_app]
   ```
   en la página con slug `/formulariomedios`.

---

## Estado de Implementación por Fases

| Fase | Alcance | Estado |
|---|---|---|
| **F0** | Congelar revisión 3.0 y OPENs | COMPLETADO |
| **F1** | Skeleton del repositorio y toolchain reproducible | **COMPLETADO** |
| **F2** | Supabase schema v3 (tablas, restricciones, índices) | Pendiente |
| **F3** | Auth / RBAC / RLS | Pendiente |
| **F4** | Secuencia + creación multi-PED | Pendiente |
| **F5** | Google OAuth / Drive spike | Pendiente |
| **F6** | Formulario público 8 categorías | Pendiente |
| **F7** | Tracking + información faltante | Pendiente |
| **F8** | Gestión Dashboard / Board / Table / Detalle | Pendiente |
| **F9** | Entregas / cancelación / reapertura / archivo | Pendiente |
| **F10** | Queue + n8n + emails | Pendiente |
| **F11** | Integración WordPress receptor | Pendiente |
| **F12** | Migración / Staging / UAT | Pendiente |
| **F13** | Release / Cutover | Pendiente |

> [!NOTE]
> En la Fase F1 actual, todas las páginas y rutas del frontend (`/formulariomedios/*`) contienen vistas **placeholder** preparadas para conectar con los módulos de negocio a partir de F2. No se han implementado tablas de base de datos ni lógica de negocio del dominio.

---

## Índice Documental Canónico (Revisión 3.0)

| # | Archivo |
|---|---|
| 00 | `00_PRD.md` |
| 00A | `00A_SRS.md` |
| 01 | `01_ARQUITECTURA_OFICIAL.md` |
| 02 | `02_REQUISITOS_FUNCIONALES.md` |
| 03 | `03_FLUJOS_USUARIO.md` |
| 04 | `04_UI_UX_Y_PANTALLAS.md` |
| 05 | `05_MODELO_DATOS_SUPABASE.md` |
| 06 | `06_AUTENTICACION_RBAC_RLS.md` |
| 07 | `07_RPC_EDGE_FUNCTIONS.md` |
| 08 | `08_STORAGE_ARCHIVOS.md` |
| 09 | `09_EVENTOS_QUEUES_N8N.md` |
| 10 | `10_PLUGIN_WORDPRESS.md` |
| 11 | `11_API_Y_CONTRATOS.md` |
| 12 | `12_SEGURIDAD.md` |
| 13 | `13_ENTORNOS_SECRETOS_DESPLIEGUE.md` |
| 14 | `14_PRUEBAS_QA_ACEPTACION.md` |
| 15 | `15_PLAN_IMPLEMENTACION.md` |
| 16 | `16_MIGRACION_WEWEB.md` |
| 17 | `17_DECISIONES_ARQUITECTURA_ADR.md` |
| 18 | `18_TRAZABILIDAD.md` |
| 19 | `19_ESPECIFICACION_FORMULARIO_SERVICIOS.md` |
| 20 | `20_BASELINE_COMPATIBILIDAD_WORDPRESS_PRODUCCION.md` |
| — | `CAMBIOS_REVISION_3_0.md` |

---

## Jerarquía de autoridad

1. Instrucciones/decisiones expresas del propietario;
2. ADR aceptados;
3. SRS/PRD/requisitos v3;
4. Arquitectura/documentación vigente;
5. Código real;
6. Pruebas verificables;
7. Informes;
8. Conversaciones anteriores.

El código demuestra implementación; no puede cambiar un requisito aprobado por sí solo.

---

## Reglas para agentes de código

Antes de modificar código:
- Leer PRD, SRS, Arquitectura y documento específico;
- Inspeccionar implementación real;
- Cambios mínimos;
- No reintroducir modelo v2 (`servicios_solicitados` como agregado v3);
- No secretos en frontend ni repositorio;
- No n8n en ruta crítica;
- No Google Drive público;
- Ejecutar suite de pruebas;
- Reportar archivos modificados.

---

## Fuentes técnicas oficiales

- https://developer.wordpress.org/
- https://supabase.com/docs/
- https://developers.google.com/workspace/drive/api/
- https://developers.google.com/identity/protocols/oauth2/
