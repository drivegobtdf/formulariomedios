import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { URL } from 'node:url';

const DEFAULT_PORT = 8085;
const REDIRECT_PATH = '/oauth2callback';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Busca y carga las credenciales OAuth (Client ID y Client Secret)
 */
function loadCredentials(cliCredentialsPath) {
  const possiblePaths = [];

  if (cliCredentialsPath) {
    possiblePaths.push(path.resolve(cliCredentialsPath));
  }

  // Rutas estándar seguras
  possiblePaths.push(
    path.join(os.homedir(), '.pedidos', 'google-credentials.json'),
    path.join(process.cwd(), '.credentials', 'google-credentials.json'),
    path.join(process.cwd(), 'google-credentials.json')
  );

  for (const credPath of possiblePaths) {
    if (fs.existsSync(credPath)) {
      try {
        const raw = fs.readFileSync(credPath, 'utf8');
        const parsed = JSON.parse(raw);

        // Soporta formatos estándar de Google Cloud Console ("web" o "installed") o plano
        const clientObj = parsed.web || parsed.installed || parsed;
        const clientId = clientObj.client_id || parsed.GOOGLE_CLIENT_ID;
        const clientSecret = clientObj.client_secret || parsed.GOOGLE_CLIENT_SECRET;

        if (clientId && clientSecret) {
          return {
            source: credPath,
            clientId: String(clientId).trim(),
            clientSecret: String(clientSecret).trim(),
          };
        }
      } catch (err) {
        console.warn(`[WARN] No se pudo leer el archivo en ${credPath}: ${err.message}`);
      }
    }
  }

  // Fallback a variables de entorno si están presentes
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      source: 'Variables de entorno (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    };
  }

  return null;
}

/**
 * Abre la URL en el navegador predeterminado del sistema operativo
 */
function openBrowser(url) {
  const platform = process.platform;
  let command = '';

  if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      // No es fatal, el usuario puede abrir el enlace manualmente
      console.log('\n(No se pudo abrir automáticamente el navegador. Por favor copiá y pegá el enlace en tu navegador).');
    }
  });
}

/**
 * Realiza una petición POST segura a Google OAuth Token Endpoint
 */
function exchangeCodeForTokens(clientId, clientSecret, redirectUri, code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Error al parsear respuesta JSON de Google: ${e.message}`));
          }
        } else {
          try {
            const errObj = JSON.parse(data);
            reject(new Error(`Google OAuth API Error (${res.statusCode}): ${errObj.error_description || errObj.error || data}`));
          } catch {
            reject(new Error(`Google OAuth API Error (${res.statusCode}): ${data}`));
          }
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Error de red al conectar con Google OAuth: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  let cliCredentialsPath = null;
  let cliPort = DEFAULT_PORT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--credentials' || args[i] === '-c') {
      cliCredentialsPath = args[i + 1];
      i++;
    } else if (args[i] === '--port' || args[i] === '-p') {
      cliPort = parseInt(args[i + 1], 10) || DEFAULT_PORT;
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Uso: npm run google:bootstrap [-- [opciones]]

Opciones:
  -c, --credentials <ruta>   Ruta al archivo JSON de credenciales de Google OAuth Client
  -p, --port <puerto>        Puerto HTTP local para el callback (por defecto: 8085)
  -h, --help                 Muestra esta ayuda
`);
      process.exit(0);
    }
  }

  console.log('================================================================');
  console.log('  PEDIDOS — Secretaría de Medios (Gobierno de TDF AIAS)');
  console.log('  Herramienta de Bootstrap Google Drive OAuth 2.0');
  console.log('================================================================\n');

  const credentials = loadCredentials(cliCredentialsPath);

  if (!credentials) {
    const defaultExpectedPath = path.join(os.homedir(), '.pedidos', 'google-credentials.json');
    console.error('❌ NO SE ENCONTRARON CREDENCIALES DEL CLIENTE OAUTH DE GOOGLE.\n');
    console.error('Pasos para configurar:');
    console.error('1. Creá el archivo de credenciales en tu carpeta personal:');
    console.error(`   ${defaultExpectedPath}`);
    console.error('2. Pegá en ese archivo el JSON descargado desde Google Cloud Console');
    console.error('   o el formato: { "client_id": "...", "client_secret": "..." }');
    console.error('3. Asegurate de haber agregado como URI de redireccionamiento autorizada en Google Cloud:');
    console.error(`   http://127.0.0.1:${cliPort}${REDIRECT_PATH}`);
    console.error('4. Volvé a ejecutar: npm run google:bootstrap\n');
    process.exit(1);
  }

  console.log(`✓ Credenciales cargadas desde: ${credentials.source}`);
  console.log(`✓ Client ID: ${credentials.clientId.substring(0, 12)}...${credentials.clientId.slice(-8)}`);
  console.log('✓ Client Secret: [OCULTO]');

  const redirectUri = `http://127.0.0.1:${cliPort}${REDIRECT_PATH}`;
  const state = crypto.randomBytes(32).toString('hex');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', credentials.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${cliPort}`);

      if (reqUrl.pathname !== REDIRECT_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Ruta no encontrada');
        return;
      }

      const receivedState = reqUrl.searchParams.get('state');
      const receivedCode = reqUrl.searchParams.get('code');
      const receivedError = reqUrl.searchParams.get('error');

      if (receivedError) {
        console.error(`\n❌ Error recibido desde Google OAuth: ${receivedError}`);
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html lang="es">
          <head><meta charset="utf-8"><title>Error de Autorización</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #fff1f2; color: #9f1239;">
            <h1>Error de Autorización</h1>
            <p>Google denegó la autorización: <strong>${receivedError}</strong></p>
            <p>Podés cerrar esta ventana y revisar la terminal.</p>
          </body>
          </html>
        `);
        server.close();
        process.exit(1);
        return;
      }

      // Verificación estricta de State criptográfico (protección CSRF)
      if (!receivedState || receivedState !== state) {
        console.error('\n❌ ERROR DE SEGURIDAD: El parámetro "state" recibido no coincide con el generado.');
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html lang="es">
          <head><meta charset="utf-8"><title>Error de Seguridad</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #fff1f2; color: #9f1239;">
            <h1>Error de Validación CSRF</h1>
            <p>El token de seguridad 'state' no coincide. Por seguridad se canceló la operación.</p>
          </body>
          </html>
        `);
        server.close();
        process.exit(1);
        return;
      }

      if (!receivedCode) {
        console.error('\n❌ Error: No se recibió ningún código de autorización.');
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('No se recibió código de autorización.');
        server.close();
        process.exit(1);
        return;
      }

      console.log('\n✓ Código de autorización recibido. Intercambiando por tokens con Google OAuth...');

      // Intercambio de código por tokens
      const tokenResponse = await exchangeCodeForTokens(
        credentials.clientId,
        credentials.clientSecret,
        redirectUri,
        receivedCode
      );

      if (!tokenResponse.refresh_token) {
        console.warn('\n⚠️ ADVERTENCIA: Google no devolvió un refresh_token.');
        console.warn('Esto suele ocurrir si la aplicación ya fue autorizada anteriormente.');
        console.warn('Para forzar la emisión de un nuevo refresh_token, revocá el acceso en:');
        console.warn('https://myaccount.google.com/permissions y volvé a ejecutar este comando.\n');
      }

      // Guardar tokens de forma segura fuera del repositorio
      const secureDir = path.join(os.homedir(), '.pedidos');
      if (!fs.existsSync(secureDir)) {
        fs.mkdirSync(secureDir, { recursive: true, mode: 0o700 });
      }

      const tokensFilePath = path.join(secureDir, 'google-tokens.json');
      const tokenPayload = {
        client_id: credentials.clientId,
        scope: tokenResponse.scope || SCOPE,
        token_type: tokenResponse.token_type || 'Bearer',
        refresh_token: tokenResponse.refresh_token || null,
        created_at: new Date().toISOString(),
      };

      fs.writeFileSync(tokensFilePath, JSON.stringify(tokenPayload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      // Responder al navegador de forma segura y clara
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Autorización Exitosa — PEDIDOS</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); padding: 32px; max-width: 480px; text-align: center; border: 1px solid #e2e8f0; }
            .badge { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #dcfce7; color: #15803d; border-radius: 50%; font-size: 24px; margin-bottom: 16px; }
            h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a; }
            p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0 0 20px 0; }
            .notice { font-size: 12px; color: #94a3b8; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓</div>
            <h1>¡Autorización completada con éxito!</h1>
            <p>La cuenta de Google Drive para el sistema <strong>PEDIDOS</strong> fue vinculada correctamente.</p>
            <div class="notice">Ya podés cerrar esta pestaña del navegador y volver a la terminal.</div>
          </div>
        </body>
        </html>
      `);

      console.log('\n================================================================');
      console.log('🎉 ¡AUTORIZACIÓN COMPLETADA CON ÉXITO!');
      console.log('================================================================');
      console.log(`✓ Tokens guardados de forma segura en:`);
      console.log(`  ${tokensFilePath}`);
      if (tokenResponse.refresh_token) {
        console.log('✓ Refresh Token: Obtenido y guardado correctamente (no expuesto en consola).');
      } else {
        console.log('⚠️ No se obtuvo un nuevo refresh_token en esta sesión.');
      }

      console.log('\nPróximo paso para configurar los secretos en Supabase (si usás Supabase alojado/local):');
      console.log('npx supabase secrets set \\');
      console.log(`  GOOGLE_CLIENT_ID="${credentials.clientId}" \\`);
      console.log('  GOOGLE_CLIENT_SECRET="<tu_client_secret>" \\');
      console.log('  GOOGLE_REFRESH_TOKEN="<refresh_token_del_archivo_de_tokens>"');
      console.log('================================================================\n');

      setTimeout(() => {
        server.close(() => {
          process.exit(0);
        });
      }, 1000);
    } catch (err) {
      console.error(`\n❌ Error durante el procesamiento del callback: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error interno del servidor.');
      server.close();
      process.exit(1);
    }
  });

  server.listen(cliPort, '127.0.0.1', () => {
    console.log(`✓ Servidor de callback escuchando localmente en: http://127.0.0.1:${cliPort}`);
    console.log(`✓ Scope solicitado: ${SCOPE}`);
    console.log(`✓ Redirección autorizada: ${redirectUri}\n`);
    console.log('Abriendo navegador para iniciar sesión en Google...');
    console.log('Si el navegador no se abre automáticamente, hacé clic o copiá este enlace:\n');
    console.log(authUrl.toString());
    console.log('\nEsperando autorización...');

    openBrowser(authUrl.toString());
  });

  // Manejo de señales de interrupción
  process.on('SIGINT', () => {
    console.log('\nOperación cancelada por el usuario.');
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`\n❌ Error inesperado: ${err.message}`);
  process.exit(1);
});
