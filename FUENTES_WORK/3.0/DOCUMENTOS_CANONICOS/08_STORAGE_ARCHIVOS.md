# 08 — Google Drive y archivos

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Decisión

Google Drive reemplaza a Supabase Storage como almacenamiento físico principal de PEDIDOS v3.

Supabase conserva:
- metadata;
- asociaciones;
- reservas;
- permisos;
- auditoría;
- contratos.

Google Drive conserva:
- bytes del archivo.

## 2. Cuenta y carpeta

Usar una carpeta raíz dedicada a PEDIDOS en la cuenta Google autorizada. Preferencia: que la aplicación cree/registre esa raíz durante bootstrap para trabajar con el scope mínimo `drive.file`.

Estructura humana sugerida, sin convertir paths en identidad autoritativa:

```text
PEDIDOS/
└── 2026/
    └── PED-2026-D000101/
        ├── recibidos/
        ├── respuestas/
        └── entregas/
```

La fuente de verdad de asociación es PostgreSQL, no el nombre de carpeta.

## 3. Límite público

- 10 archivos máximo por presentación inicial.
- 10 MB máximo por archivo.
- material mayor: `Link al material (opcional)`.

Los formatos permitidos de revisión 2.0 siguen siendo baseline hasta resolver `OPEN-014`: PDF, PNG, JPG/JPEG, DOCX y ZIP. No añadir MP4/MOV u otros silenciosamente.

## 4. Asociación múltiple

Con N PED:
- un archivo puede ser general;
- o específico.

Tabla N:M evita duplicar físicamente un archivo general.

## 5. Upload

Preferencia:
1. frontend pide reserva;
2. Edge valida;
3. Edge inicia resumable upload con OAuth server-side;
4. browser transfiere a URI de sesión si el spike lo valida;
5. frontend confirma;
6. Edge verifica metadata Drive;
7. creación final asocia a PED.

Para archivos >5 MB Google recomienda resumable upload; para <=5 MB también puede utilizarse. La app puede estandarizar el mismo mecanismo.

## 6. OAuth

- OAuth 2.0 web-server flow;
- `access_type=offline`;
- refresh token solo en secreto server-side;
- client secret solo server-side;
- access tokens efímeros;
- scope mínimo viable; `drive.file` preferido;
- rotación/revocación ensayada.

No usar contraseña de Google.

## 7. Descarga

Ni ciudadano ni Observador/Equipo reciben una URL pública permanente de Drive por defecto.

Endpoint autorizado:
- valida PED/token/JWT;
- valida asociación;
- obtiene binario con Drive API;
- entrega con headers seguros y filename controlado.

La estrategia exacta de streaming/URL temporal queda en `OPEN-016` y se prueba con 10 MB, navegadores objetivo y límites Edge.

## 8. Archivos de entrega

Diferenciar `entrega` de `solicitud`. Una versión nueva no destruye la anterior; se marca cuál es actual.

## 9. Huérfanos

Reservas incompletas expiran. Un job controlado puede marcar/borrar huérfanos después de ventana definida. Nunca borrar archivos confirmados por simple ausencia temporal de referencia durante una transacción.

## 10. Validación

- tamaño client-side + server-side;
- MIME declarado y metadata real disponible;
- extensión permitida;
- nombre saneado solo para presentación;
- ID Drive como referencia;
- no confiar en path/nombre;
- ZIP se trata como contenido no confiable;
- no renderizar HTML/SVG activo en contexto privilegiado.

## 11. Links externos

Aceptar HTTPS. No hacer SSRF/fetch automático. Mostrar al personal como link externo con advertencia. Puede asociarse a todos o a un PED.

## 12. Borrado y retención

`OPEN-003`. Hasta tener política:
- archivar PED no borra archivos;
- no implementar purga automática de material confirmado;
- toda eliminación manual/administrativa futura requiere audit y permisos.

## 13. Cuota

La cuenta disponible posee almacenamiento contratado por el propietario, pero la aplicación no debe asumir capacidad infinita. Registrar métricas/alertas de cuota antes de producción.

## 14. Fuentes oficiales verificadas 2026-09-11

- Drive API upload: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- OAuth web server: https://developers.google.com/identity/protocols/oauth2/web-server
- Drive scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
