import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'pedidos-standalone', 'web');

const PORT = 4174;
const HOST = 'localhost';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

if (!fs.existsSync(path.join(webDir, 'index.html'))) {
  console.error('ERROR: No se encontró pedidos-standalone/web/index.html. Ejecute npm run build:standalone primero.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || HOST}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Intentar servir el archivo estático solicitado
  let filePath = path.join(webDir, pathname);

  // Prevenir directory traversal
  if (!filePath.startsWith(webDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  // Si apunta a un directorio o no existe, aplicar SPA fallback a index.html
  let stat = null;
  try {
    if (fs.existsSync(filePath)) {
      stat = fs.statSync(filePath);
    }
  } catch {
    stat = null;
  }

  if (stat && stat.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      filePath = indexPath;
    } else {
      filePath = path.join(webDir, 'index.html');
    }
  } else if (!stat || !stat.isFile()) {
    // Si la ruta tiene extensión (ej: .js, .css, .png faltante) devolver 404
    const ext = path.extname(pathname);
    if (ext && ext !== '.html') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    // SPA Fallback
    filePath = path.join(webDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' || (ext === '.js' && filePath.endsWith('pedidos-config.js'))
        ? 'no-cache'
        : 'public, max-age=31536000',
    });
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.end(`Internal Server Error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`  PEDIDOS — STANDALONE PREVIEW SERVER (SPA)`);
  console.log(`======================================================`);
  console.log(`  Local URL:        http://${HOST}:${PORT}/`);
  console.log(`  Document Root:    ${webDir}`);
  console.log(`  SPA Fallback:     Activado (/ -> index.html)`);
  console.log(`  Rutas de prueba:`);
  console.log(`    - http://${HOST}:${PORT}/`);
  console.log(`    - http://${HOST}:${PORT}/mis-solicitudes`);
  console.log(`    - http://${HOST}:${PORT}/login`);
  console.log(`    - http://${HOST}:${PORT}/gestion`);
  console.log(`======================================================\n`);
});
