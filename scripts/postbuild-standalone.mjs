import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const standaloneDir = path.join(rootDir, 'pedidos-standalone');
const webDir = path.join(standaloneDir, 'web');
const serverDir = path.join(standaloneDir, 'server');

// 1. Validar que web/index.html exista
if (!fs.existsSync(path.join(webDir, 'index.html'))) {
  console.error('ERROR: No se encontró pedidos-standalone/web/index.html. Ejecute el build de Vite primero.');
  process.exit(1);
}

// 2. Crear carpetas server si no existen
fs.mkdirSync(serverDir, { recursive: true });

// Obtener versión actual del package.json
const versionMatch = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8').match(/"version":\s*"([^"]+)"/);
const version = versionMatch ? versionMatch[1] : '0.1.0-beta2';

// 3. Escribir web/pedidos-config.js sincronizado
const runtimeConfigContent = `/**
 * PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 * Configuración Pública en Tiempo de Ejecución (Standalone SPA)
 *
 * Este archivo permite al administrador modificar parámetros de conexión y URLs
 * sin necesidad de recompilar el bundle de la aplicación React.
 *
 * NOTA DE SEGURIDAD:
 * Este archivo se ejecuta directamente en el navegador del usuario.
 * NUNCA incluya credenciales privadas, service_role, contraseñas ni secretos aquí.
 */
window.__PEDIDOS_CONFIG__ = {
  // URL base de Supabase Cloud Producción
  supabaseUrl: 'https://uwzgyirilafgnbpmrkic.supabase.co',

  // Clave pública/anon de Supabase Producción (protegida por RLS en el backend)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3emd5aXJpbGFmZ25icG1ya2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY0MjIsImV4cCI6MjEwNTMzMjQyMn0.CF9BcagNdprp7h24aAPrKpdD1SLg9i-LUiCxkdSSPA8',

  // Entorno de ejecución: 'production' | 'staging' | 'development'
  environment: 'production',

  // Modo de interfaz: 'production-preview' (institucional limpia) o 'development' (con badges y nav dev)
  uiMode: 'production-preview',

  // Ruta base de la aplicación dentro del dominio ('/' para raíz de subdominio)
  basePath: '/',

  // URL pública canónica completa de la aplicación
  publicAppUrl: 'https://formulariomedios.netlify.app',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '3.0',

  // Versión del paquete
  pluginVersion: '${version}',
};
`;
fs.writeFileSync(path.join(webDir, 'pedidos-config.js'), runtimeConfigContent, 'utf8');

// 3b. Escribir web/_redirects y web/_headers para Netlify y Cloudflare Pages
const redirectsContent = `/*    /index.html   200\n`;
fs.writeFileSync(path.join(webDir, '_redirects'), redirectsContent, 'utf8');

const headersContent = `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache, no-store, must-revalidate
/pedidos-config.js
  Cache-Control: no-cache, no-store, must-revalidate
`;
fs.writeFileSync(path.join(webDir, '_headers'), headersContent, 'utf8');

// 4. Escribir server/apache-htaccess.example
const htaccessContent = `# PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
# Configuración Apache (.htaccess) para Standalone Single Page Application (SPA)
#
# Copiar este archivo como .htaccess en la raíz de publicación (web/)

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Seguridad: Prevenir listado de directorios
  Options -Indexes

  # Si el archivo o directorio solicitado existe físicamente, servirlo directamente
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Cualquier otra ruta (ej: /mis-solicitudes, /login, /gestion) redirige a index.html
  RewriteRule ^ index.html [L]
</IfModule>

# Cabeceras de Seguridad y Control de Caché
<IfModule mod_headers.c>
  # Assets con hash único: Cache inmutable por 1 año
  <FilesMatch "\\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>

  # index.html y pedidos-config.js: Sin caché para permitir actualizaciones inmediatas
  <FilesMatch "^(index\\.html|pedidos-config\\.js)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>

  # Cabeceras de Seguridad Básica
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Compresión GZIP / Deflate
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json application/xml
</IfModule>
`;
fs.writeFileSync(path.join(serverDir, 'apache-htaccess.example'), htaccessContent, 'utf8');

// 5. Escribir server/nginx.conf.example
const nginxContent = `# PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
# Configuración Nginx Server Block para Standalone SPA en Subdominio
#
# Dominio objetivo: formulariomedios.tierradelfuego.gob.ar
# Document Root: /var/www/pedidos-standalone/web

server {
    listen 80;
    listen [::]:80;
    server_name formulariomedios.tierradelfuego.gob.ar;

    # Redirección obligatoria a HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name formulariomedios.tierradelfuego.gob.ar;

    # Directorio raíz donde se alojan los archivos de web/
    root /var/www/pedidos-standalone/web;
    index index.html;

    # Certificados SSL (Configurar según Let's Encrypt / Certificado Provincial)
    # ssl_certificate /etc/letsencrypt/live/formulariomedios.tierradelfuego.gob.ar/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/formulariomedios.tierradelfuego.gob.ar/privkey.pem;
    # ssl_protocols TLSv1.2 TLSv1.3;
    # ssl_ciphers HIGH:!aNULL:!MD5;

    # Cabeceras de Seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Compresión Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    # SPA Fallback: Todas las rutas no físicas resuelven a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Assets hasheados: Cache inmutable por 1 año
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # index.html y pedidos-config.js: Sin caché para permitir despliegues inmediatos
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /pedidos-config.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Denegar acceso a archivos ocultos (.git, .env, etc.)
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
`;
fs.writeFileSync(path.join(serverDir, 'nginx.conf.example'), nginxContent, 'utf8');

// 6. Escribir README-INSTALACION.md
const readmeContent = `# GUÍA DE INSTALACIÓN — PEDIDOS STANDALONE STATIC SPA
**Secretaría de Medios — Gobierno de Tierra del Fuego AIAS**

Esta guía contiene las instrucciones precisas para desplegar la aplicación web **PEDIDOS** en la raíz del subdominio oficial:
👉 \`https://formulariomedios.tierradelfuego.gob.ar/\`

---

## ⚠️ AVISO CRÍTICO PREVIO
1. **ESTE PAQUETE NO ES UN PLUGIN WORDPRESS**: No contiene archivos PHP ni debe instalarse a través del panel de WordPress (Plugins > Añadir nuevo) ni en la carpeta \`wp-content/plugins/\`.
2. **SUBDOMINIO AUTÓNOMO E INDEPENDIENTE**: Esta es una Single Page Application (SPA) estática compilada (HTML/JS/CSS) diseñada para ejecutarse de forma 100% independiente en la raíz del subdominio provincial.
3. **NO TOCAR SUPABASE NI BACKEND**: El responsable de la publicación en el servidor web no debe modificar bases de datos ni configurar servicios en Supabase o n8n.

---

## 1. ¿Qué contiene este paquete?

\`\`\`text
pedidos-standalone/
├── web/                             <-- CONTENIDO WEB A PUBLICAR
│   ├── index.html                   <-- Punto de entrada HTML
│   ├── pedidos-config.js            <-- Configuración pública editable (URLs, entorno)
│   ├── GRIS_LOGO Gob_TDF_AEIAS.png  <-- Isologotipo institucional
│   ├── .vite/manifest.json          <-- Manifiesto de assets compilados
│   └── assets/                      <-- Bundle compilado JS, CSS y recursos gráficos
│
├── server/                          <-- Ejemplos de configuración para el servidor web
│   ├── apache-htaccess.example      (para Apache / LiteSpeed)
│   └── nginx.conf.example           (para Nginx)
│
├── README-INSTALACION.md            <-- Esta guía de instalación
├── CONFIGURACION.md                 <-- Referencia de parámetros y checklist de backend
├── VERSION.txt                      <-- Versión y fecha del release
└── CHECKSUMS.txt                    <-- Verificación de integridad SHA-256 archivo por archivo
\`\`\`

---

## 2. ¿Qué debo publicar y exactamente dónde?

> 📌 **REGLA FUNDAMENTAL DE PUBLICACIÓN:**
> **Copie ÚNICAMENTE el contenido interno de la carpeta \`web/\`** en el directorio raíz (*DocumentRoot*) asignado al subdominio \`formulariomedios.tierradelfuego.gob.ar\` en su servidor web (por ejemplo, \`/var/www/formulariomedios/web\` o \`/var/www/html\`).
>
> ❌ **NUNCA copie la carpeta contenedora \`pedidos-standalone/\` ni la carpeta \`web/\` como subcarpetas** dentro del DocumentRoot. De hacerlo, el sitio quedaría publicado incorrectamente en \`https://formulariomedios.tierradelfuego.gob.ar/pedidos-standalone/web/\`.

Asegúrese de que el servidor web (usuario \`www-data\`, \`nginx\` o similar) tenga permisos de lectura sobre todos los archivos publicados.

---

## 3. Configuración del Servidor Web (SPA Fallback y HTTPS)

Dado que se trata de una aplicación SPA (*Single Page Application*), el servidor web debe devolver \`index.html\` para cualquier ruta virtual interna (como \`/mis-solicitudes\`, \`/login\` o \`/gestion\`).

### Opción A: Servidor Apache (.htaccess)
1. Copie el archivo \`server/apache-htaccess.example\` dentro de la carpeta publicada \`web/\` y renómbrelo a \`.htaccess\`.
2. Asegúrese de que el módulo \`mod_rewrite\` esté activo en Apache y que la directiva \`AllowOverride All\` esté habilitada para el DocumentRoot.

### Opción B: Servidor Nginx
1. Utilice como referencia el archivo \`server/nginx.conf.example\`.
2. Dentro del bloque \`server\` de HTTPS, la directiva indispensable es:
   \`\`\`nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   \`\`\`
3. Recargue la configuración de Nginx (\`nginx -t && systemctl reload nginx\`).

### HTTPS Obligatorio
El subdominio debe contar con certificado SSL/TLS válido (Let's Encrypt o certificado provincial) y redirección obligatoria de HTTP (puerto 80) a HTTPS (puerto 443).

---

## 4. Modificar Configuración sin Recompilar (\`pedidos-config.js\`)

En la raíz de los archivos publicados se encuentra \`pedidos-config.js\`.
Si en el futuro cambia el dominio, la URL del backend o el entorno, **solamente edite este archivo de texto**:

\`\`\`javascript
window.__PEDIDOS_CONFIG__ = {
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1Ni...',
  environment: 'production',
  uiMode: 'production-preview',
  basePath: '/',
  publicAppUrl: 'https://formulariomedios.tierradelfuego.gob.ar',
  contractVersion: '3.0',
  pluginVersion: '${version}'
};
\`\`\`

> ⚠️ **IMPORTANTE DE SEGURIDAD**: Este archivo se carga en el navegador del usuario. **NUNCA** coloque claves privadas, contraseñas de base de datos ni tokens de servicio (\`service_role\`).

---

## 5. Verificación de Funcionamiento (Prueba de las 4 Rutas)

Abra un navegador y verifique el acceso directo a las siguientes URLs canónicas:
1. **Portada y Solicitud:** \`https://formulariomedios.tierradelfuego.gob.ar/\` -> Portada institucional y formulario de 4 pasos.
2. **Portal Solicitantes:** \`https://formulariomedios.tierradelfuego.gob.ar/mis-solicitudes\` -> Portal de seguimiento para solicitantes.
3. **Acceso Interno:** \`https://formulariomedios.tierradelfuego.gob.ar/login\` -> Pantalla de acceso para operadores.
4. **Panel de Gestión:** \`https://formulariomedios.tierradelfuego.gob.ar/gestion\` -> Panel de gestión operativa.

> ✅ **Prueba de SPA Fallback:** Al pulsar **F5 (refrescar)** en cualquiera de las 4 páginas anteriores, el navegador debe recargar la pantalla correspondiente sin arrojar error 404.

---

## 6. Notificación al Equipo de Desarrollo
Una vez que el subdominio esté publicado y responda correctamente con HTTPS, **avise al equipo de desarrollo/backend** para que registren las URLs permitidas en Supabase Auth y habiliten el CORS en las Edge Functions.

---

## 7. Procedimiento de Rollback Rápido
En caso de requerir volver a la versión anterior:
1. Mantenga siempre un respaldo de la carpeta web previa antes de sobrescribir (ej: \`web_backup_YYYYMMDD/\`).
2. Si la nueva versión presenta alguna anomalía, reemplace el contenido activo con la carpeta de respaldo.
3. La restauración es inmediata y no requiere reinicios de servicios ni de base de datos.
`;
fs.writeFileSync(path.join(standaloneDir, 'README-INSTALACION.md'), readmeContent, 'utf8');

// 7. Escribir CONFIGURACION.md
const configDocContent = `# REFERENCIA DE CONFIGURACIÓN — PEDIDOS STANDALONE
**Secretaría de Medios — Gobierno de Tierra del Fuego AIAS**

Este documento detalla los parámetros de configuración de la SPA Standalone y los requisitos de configuración externa para el despliegue productivo.

---

## 1. Parámetros en \`pedidos-config.js\`

| Parámetro | Tipo | Valor por Defecto | Descripción |
|---|---|---|---|
| \`supabaseUrl\` | \`string\` | \`https://yqfkzgqvezarzhlwiilo.supabase.co\` | Endpoint del proyecto Supabase Cloud (API REST & Auth). |
| \`supabaseAnonKey\` | \`string\` | \`eyJhbGci...\` | Clave pública/anon de Supabase. El acceso a los datos está protegido por políticas RLS en PostgreSQL. |
| \`environment\` | \`'production' | 'staging' | 'development'\` | \`'production'\` | Identificador del entorno de ejecución. |
| \`uiMode\` | \`'production-preview' | 'development'\` | \`'production-preview'\` | \`'production-preview'\` activa la cabecera institucional limpia. \`'development'\` muestra herramientas de depuración y QA. |
| \`basePath\` | \`string\` | \`'/'\` | Ruta base de montaje en el dominio. En standalone en subdominio es siempre \`'/'\`. |
| \`publicAppUrl\` | \`string\` | \`'https://formulariomedios.tierradelfuego.gob.ar'\` | URL pública canónica utilizada para construir enlaces de retorno y notificaciones. |
| \`contractVersion\` | \`string\` | \`'3.0'\` | Versión del contrato de esquema con la base de datos y Edge Functions. |
| \`pluginVersion\` | \`string\` | \`'${version}'\` | Versión del release del sistema PEDIDOS. |

---

## 2. Checklist de Configuraciones Externas Pendientes (Para Administradores de Backend)

Al estar activo y online el subdominio \`https://formulariomedios.tierradelfuego.gob.ar/\`, el equipo de backend / Supabase debe registrar las siguientes configuraciones remotas:

1. **Supabase Auth — Redirect URLs:**
   - Agregar \`https://formulariomedios.tierradelfuego.gob.ar/**\`
   - Agregar \`https://formulariomedios.tierradelfuego.gob.ar/confirmar-email\`
   - Agregar \`https://formulariomedios.tierradelfuego.gob.ar/mis-solicitudes\`
   a la lista de *Redirect URLs* permitidas en el panel de Supabase Auth (Authentication > URL Configuration).

2. **CORS / Allowed Origins en Edge Functions:**
   - Añadir \`https://formulariomedios.tierradelfuego.gob.ar\` a la lista blanca (\`ALLOWED_ORIGINS\`).

3. **Parámetro \`PUBLIC_APP_URL\` en Backend y n8n:**
   - Actualizar el valor del secreto \`PUBLIC_APP_URL\` en Supabase Cloud y n8n a \`https://formulariomedios.tierradelfuego.gob.ar\` para que las notificaciones por correo y magic links remitan directamente al subdominio standalone.

4. **Certificados TLS / HTTPS:**
   - Garantizar certificado SSL/TLS válido para \`formulariomedios.tierradelfuego.gob.ar\` mediante Let's Encrypt o certificado provincial.
`;
fs.writeFileSync(path.join(standaloneDir, 'CONFIGURACION.md'), configDocContent, 'utf8');

// 8. Escribir VERSION.txt
const versionContent = `PEDIDOS — Standalone Static SPA
Versión: ${version}
Fecha de generación: ${new Date().toISOString()}
Target: Subdominio https://formulariomedios.tierradelfuego.gob.ar/
Arquitectura: React 19 + TypeScript + Vite Static Build
Contrato Schema DB: 3.0
`;
fs.writeFileSync(path.join(standaloneDir, 'VERSION.txt'), versionContent, 'utf8');

// 9. Calcular CHECKSUMS.txt
function getChecksums(dir, baseRel = '') {
  const lines = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.join(baseRel, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      lines.push(...getChecksums(full, rel));
    } else if (entry.isFile() && entry.name !== 'CHECKSUMS.txt') {
      const buf = fs.readFileSync(full);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      lines.push(`${sha}  ${rel}`);
    }
  }
  return lines;
}

const allChecksumLines = getChecksums(standaloneDir);
fs.writeFileSync(path.join(standaloneDir, 'CHECKSUMS.txt'), allChecksumLines.join('\n') + '\n', 'utf8');

console.log('[postbuild-standalone] pedidos-standalone/ preparado con éxito.');
console.log(`[postbuild-standalone] Archivos generados y validados: ${allChecksumLines.length}`);

