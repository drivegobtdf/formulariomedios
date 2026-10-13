import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'pedidos-standalone', 'web');
const outputDir = path.join('C:', 'Users', 'Pc', '.gemini', 'antigravity', 'brain', 'aa6aea92-dd32-41df-9768-a281a40a59c0', 'qa_screenshots');
fs.mkdirSync(outputDir, { recursive: true });

const PORT = 4220;
const HOST = 'localhost';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || HOST}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  let filePath = path.join(webDir, pathname);

  let stat = null;
  try {
    if (fs.existsSync(filePath)) stat = fs.statSync(filePath);
  } catch {}

  if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  else if (!stat) filePath = path.join(webDir, 'index.html');

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error: ' + err.message);
  }
});

function makeMockJwt(u) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: u.id,
    email: u.email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 7200,
    iat: Math.floor(Date.now() / 1000),
    user_metadata: u.user_metadata,
  })).toString('base64url');
  return `${header}.${payload}.dummy_signature`;
}

const mockUser = {
  id: 'usr-b3-admin-01',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'pablo.saldivia@tierradelfuego.gob.ar',
  user_metadata: {
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombre_usuario: 'psaldivia',
  },
};

const validJwt = makeMockJwt(mockUser);

const mockSession = {
  access_token: validJwt,
  token_type: 'bearer',
  expires_in: 7200,
  expires_at: Math.floor(Date.now() / 1000) + 7200,
  refresh_token: 'fake-refresh-token',
  user: mockUser,
};

const mockProfile = {
  user_id: 'usr-b3-admin-01',
  nombre: 'Pablo',
  apellido: 'Saldivia',
  nombre_usuario: 'psaldivia',
  estado_acceso: 'aprobado',
  app_role: 'administrador',
  solicitado_at: new Date().toISOString(),
  aprobado_at: new Date().toISOString(),
};

const mockCategorias = [
  {
    id: 'cat-11',
    nombre: 'Diseño Gráfico',
    codigo_ped: 'D',
    tipos_servicio: [
      { id: 'tip-111', nombre: 'Flyer Digital', descripcion: 'Piezas gráficas para redes sociales' },
    ]
  }
];

const mockPedidos = [
  {
    id: 'a1111111-1111-4111-a111-111111111111',
    pedido_visible: 'PED-2026-X000028',
    codigo_categoria: 'X',
    origen: 'interno',
    titulo: 'Mesa de Trabajo Interministerial de Medios',
    categoria_id: null,
    categoria_nombre: null,
    estado: 'Nuevo',
    prioridad: 'alta',
    etiqueta_interna: null,
    retrabajo_activo: false,
    responsable_user_id: null,
    responsable_nombre: null,
    informacion_especifica: {},
    envio: null,
    created_at: new Date().toISOString(),
    version: 1,
    archivado: false,
  }
];

async function setupPageMocks(page) {
  await page.route('**/auth/v1/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    });
  });

  await page.route('**/rest/v1/usuarios_acceso*', (route) => {
    const accept = route.request().headers()['accept'] || '';
    if (accept.includes('vnd.pgrst.object+json')) {
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify(mockProfile),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify([mockProfile]),
      });
    }
  });

  await page.route('**/rest/v1/rpc/notification_unread_count*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(0) });
  });

  await page.route('**/rest/v1/notificaciones_usuario*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: JSON.stringify([]) });
  });

  await page.route('**/rest/v1/categorias_servicio*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategorias) });
  });

  await page.route('**/rest/v1/tipos_servicio*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategorias.flatMap(c => c.tipos_servicio.map(t => ({ ...t, categoria_id: c.id })))) });
  });

  await page.route('**/rest/v1/rpc/gestion_dashboard_stats*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 1, nuevos: 1, enRevision: 0, enProceso: 0, esperandoInfo: 0, finalizados: 0, cancelados: 0, sinAsignar: 1, archivados: 0,
      }),
    });
  });

  await page.route('**/rest/v1/historial_operativo_pedidos*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/rest/v1/pedidos*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(mockPedidos),
    });
  });

  await page.addInitScript(({ sess }) => {
    window.localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('pedidos:theme', 'light');
  }, { sess: mockSession });
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[SERVER] Preview server running on http://${HOST}:${PORT}`);

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 860 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await setupPageMocks(page);

    console.log('[QA] Navegando a /gestion en Modo Claro...');
    await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Captura Light Mode Header
    const lightHeader = page.locator('.pedidos-header');
    await lightHeader.screenshot({ path: path.join(outputDir, 'logo_01_light_mode_1366px.png') });
    console.log('[QA] ✓ Screenshot capturado: logo_01_light_mode_1366px.png');

    // Cambiar a Dark Mode con el botón del header
    console.log('[QA] Cambiando a Modo Oscuro...');
    const themeBtn = page.locator('.pedidos-btn-theme-toggle');
    await themeBtn.click();
    await page.waitForTimeout(400);

    // Captura Dark Mode Header
    await lightHeader.screenshot({ path: path.join(outputDir, 'logo_02_dark_mode_1366px.png') });
    console.log('[QA] ✓ Screenshot capturado: logo_02_dark_mode_1366px.png');

    // 2. MODAL CARGA INTERNA TESTS
    console.log('[QA] Abriendo modal Carga Interna de Pedido...');
    const btnCargaInterna = page.locator('button:has-text("Carga interna")');
    await btnCargaInterna.waitFor({ state: 'visible', timeout: 10000 });
    await btnCargaInterna.click();
    await page.waitForTimeout(400);

    const modalDialog = page.locator('[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'modal_01_carga_interna_abierto.png') });
    console.log('[QA] ✓ Screenshot capturado: modal_01_carga_interna_abierto.png');

    // Completar datos en el formulario
    console.log('[QA] Completando datos en el modal...');
    await page.locator('input[placeholder*="Cobertura Acto"]').fill('Campaña Antártica 2026 - Difusión Oficial');
    await page.locator('textarea[placeholder*="Detalles sobre las necesidades"]').fill('Materiales gráficos y audiovisuales para medios provinciales.');
    await page.locator('input[placeholder*="Martín Rodríguez"]').fill('Lic. Juan Pablo Rossi');
    await page.locator('input[placeholder*="Transporte"]').fill('Secretaría de Comunicación');
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(outputDir, 'modal_02_datos_cargados.png') });
    console.log('[QA] ✓ Screenshot capturado: modal_02_datos_cargados.png');

    // Hacer click fuera del modal (en el backdrop) repetidamente
    console.log('[QA] Probando clics en el backdrop exterior (deben ser ignorados)...');
    await page.mouse.click(50, 50); // Clic en esquina superior izquierda (backdrop)
    await page.waitForTimeout(200);
    await page.mouse.click(50, 500); // Clic en margen lateral (backdrop)
    await page.waitForTimeout(200);

    // Verificar que el modal sigue abierto y el título intacto
    const tituloVal = await page.locator('input[placeholder*="Cobertura Acto"]').inputValue();
    console.log(`[QA] Título tras clics en backdrop: "${tituloVal}" (Modal permanece abierto)`);
    await page.screenshot({ path: path.join(outputDir, 'modal_03_backdrop_click_protegido.png') });
    console.log('[QA] ✓ Screenshot capturado: modal_03_backdrop_click_protegido.png');

    // Intentar cerrar con botón X (debe abrir diálogo de confirmación de descarte)
    console.log('[QA] Pulsando botón X con formulario modificado...');
    await page.locator('button[aria-label="Cerrar modal"]').click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(outputDir, 'modal_04_confirmacion_descarte.png') });
    console.log('[QA] ✓ Screenshot capturado: modal_04_confirmacion_descarte.png');

    // Pulsar "Seguir editando"
    console.log('[QA] Pulsando "Seguir editando"...');
    await page.locator('button:has-text("Seguir editando")').click();
    await page.waitForTimeout(300);

    const tituloPreservado = await page.locator('input[placeholder*="Cobertura Acto"]').inputValue();
    console.log(`[QA] Título tras "Seguir editando": "${tituloPreservado}"`);
    await page.screenshot({ path: path.join(outputDir, 'modal_05_seguir_editando.png') });
    console.log('[QA] ✓ Screenshot capturado: modal_05_seguir_editando.png');

    console.log('[QA] Validación visual completada exitosamente.');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[QA ERROR]', err);
  process.exit(1);
});
