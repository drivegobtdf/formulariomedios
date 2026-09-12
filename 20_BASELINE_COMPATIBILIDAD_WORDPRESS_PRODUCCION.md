# 20 — Baseline de compatibilidad WordPress de producción

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Propósito

Conservar el baseline del receptor auditado y actualizar sus implicancias para v3.

## 2. Baseline documentado

- WordPress 7.0.2.
- PHP 8.2.31.
- Betheme 28.5.7.
- Elementor 4.2.3.
- Elementor Pro 3.33.1.
- ElementsKit Lite.
- Wordfence Security.
- WP Super Cache.
- No Multisite.
- URL institucional `https://www.tierradelfuego.gob.ar`.
- objetivo `/formulariomedios`.

Es evidencia DOCUMENTADA de revisión previa; debe reconfirmarse antes de release.

## 3. Consecuencias plugin

### Elementor
Montaje idempotente, deep links, preview sin side effects.

### Betheme/ElementsKit
CSS namespaced, overlays/foco/z-index probados.

### WP Super Cache
No cachear contenido autenticado/tokens/respuestas privadas. Assets versionados.

### Wordfence
No pedir desactivación permanente. Ajustar reglas solo con evidencia y mínimo alcance.

### Supabase
HTTPS/CORS y endpoints permitidos.

### Google Drive
El navegador puede necesitar comunicarse con endpoints Google únicamente mediante el flujo temporal aprobado en `OPEN-016`. Las credenciales OAuth jamás forman parte de WordPress. Probar CSP/Wordfence/CORS y fallback.

## 4. Rutas

Probar:
- raíz;
- solicitud-recibida;
- seguimiento;
- información;
- login;
- registro;
- gestión;
- detalle;
- usuarios;
- archivo.

## 5. QA compatibilidad

- mount una vez;
- back/forward;
- trailing slash;
- query/fragment seguro;
- mobile;
- cache release;
- login;
- logout;
- role UI;
- 10MB upload;
- download;
- Wordfence;
- editor Elementor.

## 6. OPEN-004

Cerrado documentalmente para desarrollo; reconfirmación obligatoria para release.

## 7. No bloqueantes de arquitectura

No requiere:
- cambio de theme;
- desactivar plugins;
- guardar PED en MySQL;
- roles WP;
- WP uploads para PEDIDOS.

## 8. Evidencia

No se ha ejecutado QA v3 sobre el receptor como parte de esta revisión.
