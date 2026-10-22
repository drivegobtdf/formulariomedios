import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const standaloneDir = path.join(rootDir, 'pedidos-standalone');
const webDir = path.join(standaloneDir, 'web');
const serverDir = path.join(standaloneDir, 'server');

// Identificadores de proyecto Supabase
export const PROD_SUPABASE_REF = 'uwzgyirilafgnbpmrkic';
export const TEST_SUPABASE_REF = 'yqfkzgqvezarzhlwiilo';

// Configuración productiva canónica
export const PROD_CONFIG = {
  supabaseUrl: 'https://uwzgyirilafgnbpmrkic.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3emd5aXJpbGFmZ25icG1ya2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY0MjIsImV4cCI6MjEwNTMzMjQyMn0.CF9BcagNdprp7h24aAPrKpdD1SLg9i-LUiCxkdSSPA8',
  environment: 'production',
  uiMode: 'production-preview',
  basePath: '/',
  publicAppUrl: 'https://formulariomedios.pages.dev',
  contractVersion: '3.0',
};

// Configuración de prueba / preview canónica
export const TEST_CONFIG = {
  supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU',
  environment: 'staging',
  uiMode: 'production-preview',
  basePath: '/',
  contractVersion: '3.0',
};

/**
 * Decodifica el payload (claims) del token JWT de Supabase sin verificar la firma.
 * NOTA DE SEGURIDAD:
 * La decodificación del payload permite inspeccionar claims (ref, iss, role),
 * pero NO equivale a verificar criptográficamente la firma del token.
 */
export function parseJwtPayloadClaims(token) {
  if (typeof token !== 'string') {
    throw new Error('El token de Supabase debe ser una cadena de texto.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('El formato del token JWT de Supabase es inválido (debe constar de 3 segmentos).');
  }
  try {
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Error al decodificar claims del token JWT de Supabase: ${err.message}`);
  }
}

/**
 * Resuelve de forma determinista y estricta el perfil de standalone según las variables de entorno.
 */
export function resolveStandaloneProfile(env = process.env) {
  const isCloudflare = env.CF_PAGES === '1';
  const cfBranch = (env.CF_PAGES_BRANCH || '').trim();
  const rawStandaloneEnv = (env.STANDALONE_ENV || '').trim().toLowerCase();

  // 1. Validar STANDALONE_ENV si fue provisto
  if (rawStandaloneEnv && !['production', 'test', 'staging'].includes(rawStandaloneEnv)) {
    throw new Error(
      `[postbuild-standalone] Valor inválido para STANDALONE_ENV: "${env.STANDALONE_ENV}". Valores permitidos: "production", "test", "staging".`
    );
  }

  let profile;
  let publicAppUrl = PROD_CONFIG.publicAppUrl;

  if (isCloudflare) {
    // EN CLOUDFLARE PAGES:
    // Requiere obligatoriamente que CF_PAGES_BRANCH esté presente y no vacío
    if (!cfBranch) {
      throw new Error(
        '[postbuild-standalone] Configuración inválida en Cloudflare Pages: CF_PAGES_BRANCH está ausente o vacío.'
      );
    }

    if (cfBranch === 'cloudflare-pages-production') {
      // Rama productiva: ÚNICAMENTE PROD
      if (rawStandaloneEnv === 'test' || rawStandaloneEnv === 'staging') {
        throw new Error(
          '[postbuild-standalone] Conflicto de seguridad crítico: No se permite forzar STANDALONE_ENV=test/staging en la rama productiva (cloudflare-pages-production).'
        );
      }
      profile = 'production';
      publicAppUrl = PROD_CONFIG.publicAppUrl;
    } else {
      // Cualquier otra rama: es Preview -> ÚNICAMENTE TEST
      if (rawStandaloneEnv === 'production') {
        throw new Error(
          `[postbuild-standalone] Conflicto de seguridad crítico: No se permite forzar STANDALONE_ENV=production en una rama Preview (${cfBranch}).`
        );
      }
      profile = 'test';

      // Validar CF_PAGES_URL obligatoria para Preview
      const rawCfUrl = (env.CF_PAGES_URL || '').trim();
      if (!rawCfUrl) {
        throw new Error(
          `[postbuild-standalone] CF_PAGES_URL es requerida para el despliegue Preview en la rama "${cfBranch}".`
        );
      }
      try {
        const parsed = new URL(rawCfUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('Protocolo inválido');
        }
      } catch {
        throw new Error(
          `[postbuild-standalone] CF_PAGES_URL debe ser una URL HTTP/HTTPS válida. Recibido: "${rawCfUrl}".`
        );
      }
      if (rawCfUrl.includes('supabase.co')) {
        throw new Error(
          `[postbuild-standalone] CF_PAGES_URL no puede apuntar a Supabase. Recibido: "${rawCfUrl}".`
        );
      }
      publicAppUrl = rawCfUrl;
    }
  } else {
    // ENTORNO LOCAL / CI EXTERNO (fuera de Cloudflare Pages):
    if (rawStandaloneEnv === 'test' || rawStandaloneEnv === 'staging') {
      profile = 'test';
      const rawLocalUrl = (env.PUBLIC_APP_URL || env.CF_PAGES_URL || 'http://localhost:5173').trim();
      try {
        const parsed = new URL(rawLocalUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('Protocolo inválido');
        }
      } catch {
        throw new Error(
          `[postbuild-standalone] URL de aplicación preview inválida. Recibido: "${rawLocalUrl}".`
        );
      }
      if (rawLocalUrl.includes('supabase.co')) {
        throw new Error(
          `[postbuild-standalone] La URL de la aplicación no puede apuntar a Supabase. Recibido: "${rawLocalUrl}".`
        );
      }
      publicAppUrl = rawLocalUrl;
    } else {
      // Por defecto en local sin flags: producción intacta
      profile = 'production';
      publicAppUrl = PROD_CONFIG.publicAppUrl;
    }
  }

  const effectiveConfig =
    profile === 'production'
      ? { ...PROD_CONFIG, publicAppUrl }
      : { ...TEST_CONFIG, publicAppUrl };

  return { profile, effectiveConfig, isCloudflare, cfBranch };
}

/**
 * Valida formalmente la coherencia de la configuración generada para el perfil correspondiente.
 */
export function validateStandaloneConfig(config, profile) {
  const claims = parseJwtPayloadClaims(config.supabaseAnonKey);

  if (profile === 'production') {
    if (!config.supabaseUrl.includes(PROD_SUPABASE_REF)) {
      throw new Error(`[Validación PROD] URL de Supabase no coincide con PROD (${PROD_SUPABASE_REF}): ${config.supabaseUrl}`);
    }
    if (claims.ref !== PROD_SUPABASE_REF) {
      throw new Error(`[Validación PROD] Anon Key claim ref (${claims.ref}) no coincide con PROD (${PROD_SUPABASE_REF}).`);
    }
    if (config.environment !== 'production') {
      throw new Error(`[Validación PROD] environment debe ser "production". Recibido: ${config.environment}`);
    }
    if (config.basePath !== '/') {
      throw new Error(`[Validación PROD] basePath debe ser "/". Recibido: ${config.basePath}`);
    }
    if (config.publicAppUrl !== 'https://formulariomedios.pages.dev') {
      throw new Error(`[Validación PROD] publicAppUrl debe ser "https://formulariomedios.pages.dev". Recibido: ${config.publicAppUrl}`);
    }
  } else if (profile === 'test') {
    // 1. Debe apuntar a TEST
    if (!config.supabaseUrl.includes(TEST_SUPABASE_REF)) {
      throw new Error(`[Validación TEST] URL de Supabase no coincide con TEST (${TEST_SUPABASE_REF}): ${config.supabaseUrl}`);
    }
    // 2. Prohibición estricta de referencias PROD
    if (config.supabaseUrl.includes(PROD_SUPABASE_REF)) {
      throw new Error(`[Seguridad TEST] Violación: URL de Supabase contiene la referencia de PROD (${PROD_SUPABASE_REF}).`);
    }
    // 3. Claims de la clave anon deben coincidir con TEST
    if (claims.ref !== TEST_SUPABASE_REF) {
      throw new Error(`[Validación TEST] Anon Key claim ref (${claims.ref}) no coincide con TEST (${TEST_SUPABASE_REF}).`);
    }
    if (claims.ref === PROD_SUPABASE_REF) {
      throw new Error(`[Seguridad TEST] Violación: Anon Key pertenece a PROD (${PROD_SUPABASE_REF}).`);
    }
    // 4. Parámetros de entorno
    if (config.environment !== 'staging' && config.environment !== 'test') {
      throw new Error(`[Validación TEST] environment debe ser "staging" o "test". Recibido: ${config.environment}`);
    }
    if (config.basePath !== '/') {
      throw new Error(`[Validación TEST] basePath debe ser "/". Recibido: ${config.basePath}`);
    }
    // 5. publicAppUrl nunca debe ser Supabase
    if (config.publicAppUrl.includes('supabase.co')) {
      throw new Error(`[Seguridad TEST] Violación: publicAppUrl no puede apuntar a Supabase (${config.publicAppUrl}).`);
    }
  } else {
    throw new Error(`Perfil desconocido: ${profile}`);
  }
}

/**
 * Genera el contenido textual de pedidos-config.js.
 */
export function buildRuntimeConfigContent(config, version, profile) {
  if (profile === 'test') {
    return `/**
 * PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 * Configuración Pública en Tiempo de Ejecución (Standalone SPA - Preview / TEST)
 *
 * Este archivo permite al administrador modificar parámetros de conexión y URLs
 * sin necesidad de recompilar el bundle de la aplicación React.
 *
 * NOTA DE SEGURIDAD:
 * Este archivo se ejecuta directamente en el navegador del usuario.
 * NUNCA incluya credenciales privadas, service_role, contraseñas ni secretos aquí.
 */
window.__PEDIDOS_CONFIG__ = {
  // URL base de Supabase Cloud TEST
  supabaseUrl: '${config.supabaseUrl}',

  // Clave pública/anon de Supabase TEST (protegida por RLS en el backend)
  supabaseAnonKey: '${config.supabaseAnonKey}',

  // Entorno de ejecución: 'production' | 'staging' | 'development'
  environment: '${config.environment}',

  // Modo de interfaz: 'production-preview' (institucional limpia) o 'development' (con badges y nav dev)
  uiMode: '${config.uiMode}',

  // Ruta base de la aplicación dentro del dominio ('/' para raíz de subdominio)
  basePath: '${config.basePath}',

  // URL pública canónica completa de la aplicación Preview
  publicAppUrl: '${config.publicAppUrl}',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '${config.contractVersion}',

  // Versión del paquete
  pluginVersion: '${version}',
};
`;
  }

  // Perfil PROD: Formato idéntico carácter por carácter a la base original
  return `/**
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
  publicAppUrl: 'https://formulariomedios.pages.dev',

  // Versión de contrato con la base de datos y Edge Functions
  contractVersion: '3.0',

  // Versión del paquete
  pluginVersion: '${version}',
};
`;
}

/**
 * Función principal de preparación postbuild.
 */
export function runPostbuild(env = process.env) {
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

  // 3. Resolver perfil y validar configuración
  const { profile, effectiveConfig, isCloudflare, cfBranch } = resolveStandaloneProfile(env);
  validateStandaloneConfig(effectiveConfig, profile);

  if (isCloudflare) {
    console.log(`[postbuild-standalone] Build Cloudflare Pages detectado en rama "${cfBranch}" -> Perfil: ${profile.toUpperCase()}`);
  } else {
    console.log(`[postbuild-standalone] Build Local / CI detectado -> Perfil: ${profile.toUpperCase()}`);
  }

  // 4. Escribir web/pedidos-config.js sincronizado
  const runtimeConfigContent = buildRuntimeConfigContent(effectiveConfig, version, profile);
  fs.writeFileSync(path.join(webDir, 'pedidos-config.js'), runtimeConfigContent, 'utf8');

  // 5. Escribir web/_headers para seguridad y caché
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

  // 6. Escribir server/apache-htaccess.example
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

  // 7. Escribir server/nginx.conf.example
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

  // 8. Escribir README-INSTALACION.md
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
  supabaseUrl: 'https://uwzgyirilafgnbpmrkic.supabase.co',
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
`;
  fs.writeFileSync(path.join(standaloneDir, 'README-INSTALACION.md'), readmeContent, 'utf8');

  // 9. Escribir CONFIGURACION.md
  const configDocContent = `# REFERENCIA DE CONFIGURACIÓN — PEDIDOS STANDALONE
**Secretaría de Medios — Gobierno de Tierra del Fuego AIAS**

Este documento detalla los parámetros de configuración de la SPA Standalone y los requisitos de configuración externa para el despliegue productivo.

---

## 1. Parámetros en \`pedidos-config.js\`

| Parámetro | Tipo | Valor por Defecto | Descripción |
|---|---|---|---|
| \`supabaseUrl\` | \`string\` | \`https://uwzgyirilafgnbpmrkic.supabase.co\` | Endpoint del proyecto Supabase Cloud (API REST & Auth). |
| \`supabaseAnonKey\` | \`string\` | \`eyJhbGci...\` | Clave pública/anon de Supabase. El acceso a los datos está protegido por políticas RLS en PostgreSQL. |
| \`environment\` | \`'production' | 'staging' | 'development'\` | \`'production'\` | Identificador del entorno de ejecución. |
| \`uiMode\` | \`'production-preview' | 'development'\` | \`'production-preview'\` | \`'production-preview'\` activa la cabecera institucional limpia. \`'development'\` muestra herramientas de depuración y QA. |
| \`basePath\` | \`string\` | \`'/'\` | Ruta base de montaje en el dominio. En standalone en subdominio es siempre \`'/'\`. |
| \`publicAppUrl\` | \`string\` | \`'https://formulariomedios.tierradelfuego.gob.ar'\` | URL pública canónica utilizada para construir enlaces de retorno y notificaciones. |
| \`contractVersion\` | \`string\` | \`'3.0'\` | Versión del contrato de esquema con la base de datos y Edge Functions. |
| \`pluginVersion\` | \`string\` | \`'${version}'\` | Versión del release del sistema PEDIDOS. |
`;
  fs.writeFileSync(path.join(standaloneDir, 'CONFIGURACION.md'), configDocContent, 'utf8');

  // 10. Escribir VERSION.txt
  const versionContent = `PEDIDOS — Standalone Static SPA
Versión: ${version}
Perfil: ${profile.toUpperCase()}
Fecha de generación: ${new Date().toISOString()}
Target: Subdominio https://formulariomedios.tierradelfuego.gob.ar/
Arquitectura: React 19 + TypeScript + Vite Static Build
Contrato Schema DB: 3.0
`;
  fs.writeFileSync(path.join(standaloneDir, 'VERSION.txt'), versionContent, 'utf8');

  // 11. Calcular CHECKSUMS.txt
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
}

// Ejecutar si es llamado como script principal
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    runPostbuild();
  } catch (err) {
    console.error(`\n❌ ERROR CRÍTICO EN POSTBUILD STANDALONE: ${err.message}\n`);
    process.exit(1);
  }
}
