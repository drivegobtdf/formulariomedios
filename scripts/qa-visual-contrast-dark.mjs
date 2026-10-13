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

const PORT = 4228;
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

const mockNotifications = [
  {
    id: 'notif-1',
    user_id: 'usr-b3-admin-01',
    pedido_id: 'ped-1',
    tipo: 'pedido_asignado',
    actor_user_id: null,
    read_at: null,
    metadata: { pedido_visible: 'PED-2026-X000028', mensaje_resumen: 'Se te asignó el pedido PED-2026-X000028' },
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-2',
    user_id: 'usr-b3-admin-01',
    pedido_id: 'ped-2',
    tipo: 'nota_creada',
    actor_user_id: null,
    read_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    metadata: { pedido_visible: 'PED-2026-D000089', mensaje_resumen: 'Nueva nota interna agregada al pedido' },
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(1),
    });
  });

  await page.route('**/rest/v1/notificaciones_usuario*', (route) => {
    const url = route.request().url();
    if (url.includes('read_at=is.null')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify([mockNotifications[0]]),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/2' },
        body: JSON.stringify(mockNotifications),
      });
    }
  });

  await page.route('**/rest/v1/categorias_servicio*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/rest/v1/tipos_servicio*', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
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
      body: JSON.stringify([]),
    });
  });

  await page.route('**/realtime/**', (route) => {
    route.abort();
  });

  await page.addInitScript(({ sess }) => {
    window.localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('pedidos:theme', 'dark');
  }, { sess: mockSession });
}

async function run() {
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  console.log(`Server listening at http://${HOST}:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await setupPageMocks(page);

    console.log('[QA] 1. Navegando a /gestion en Modo Oscuro...');
    await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // 1. DESKTOP DARK - NOTIFICACIONES OPEN
    const bellBtn = page.locator('button[title="Centro de notificaciones"]').or(page.locator('button[aria-label*="Notificaciones"]'));
    await bellBtn.waitFor({ state: 'visible', timeout: 5000 });
    await bellBtn.click();
    await page.waitForTimeout(500);

    const shot1Path = path.join(outputDir, 'contrast_01_dark_notifications_open.png');
    await page.screenshot({ path: shot1Path, fullPage: false });
    console.log('[QA] ✓ Captura 1: dark notifications open ->', shot1Path);

    // Switch tab to "No leídas"
    const tabNoLeidas = page.locator('button:has-text("No leídas")');
    await tabNoLeidas.click();
    await page.waitForTimeout(300);

    const shot2Path = path.join(outputDir, 'contrast_02_dark_notifications_unread_tab.png');
    await page.screenshot({ path: shot2Path, fullPage: false });
    console.log('[QA] ✓ Captura 2: dark notifications unread tab ->', shot2Path);

    // Close notifications, open user profile menu
    await bellBtn.click();
    await page.waitForTimeout(300);

    const profileBtn = page.locator('button[title="Opciones de perfil y sesión"]').or(page.locator('button[aria-label*="Perfil de usuario"]'));
    await profileBtn.click();
    await page.waitForTimeout(500);

    const shot3Path = path.join(outputDir, 'contrast_03_dark_profile_menu_open.png');
    await page.screenshot({ path: shot3Path, fullPage: false });
    console.log('[QA] ✓ Captura 3: dark profile menu open ->', shot3Path);

    // Hover on global logout
    const globalLogoutBtn = page.locator('button:has-text("Cerrar sesión en todos los equipos")');
    await globalLogoutBtn.hover();
    await page.waitForTimeout(300);

    const shot4Path = path.join(outputDir, 'contrast_04_dark_profile_global_logout_hover.png');
    await page.screenshot({ path: shot4Path, fullPage: false });
    console.log('[QA] ✓ Captura 4: dark global logout hover ->', shot4Path);

    // Open Global Logout Modal
    await globalLogoutBtn.click();
    await page.waitForTimeout(500);

    const shot5Path = path.join(outputDir, 'contrast_05_dark_global_logout_modal.png');
    await page.screenshot({ path: shot5Path, fullPage: false });
    console.log('[QA] ✓ Captura 5: dark global logout modal ->', shot5Path);

    // Close modal
    const cancelLogoutModal = page.locator('button:has-text("Cancelar")');
    await cancelLogoutModal.click();
    await page.waitForTimeout(300);

    // Open User Profile Modal
    await profileBtn.click();
    await page.waitForTimeout(300);
    const myProfileBtn = page.locator('button:has-text("Mi perfil")');
    await myProfileBtn.click();
    await page.waitForTimeout(500);

    const shot6Path = path.join(outputDir, 'contrast_06_dark_user_profile_modal.png');
    await page.screenshot({ path: shot6Path, fullPage: false });
    console.log('[QA] ✓ Captura 6: dark user profile modal ->', shot6Path);

    const cancelProfileModal = page.locator('button:has-text("Cancelar")');
    await cancelProfileModal.click();
    await page.waitForTimeout(300);

    // =========================================================================
    // 2. DESKTOP LIGHT (SWITCH THEME)
    // =========================================================================
    console.log('[QA] 2. Alternando a Modo Claro...');
    const themeToggleBtn = page.locator('.pedidos-btn-theme-toggle');
    await themeToggleBtn.click();
    await page.waitForTimeout(500);

    // Open notifications in light
    await bellBtn.click();
    await page.waitForTimeout(500);

    const shot7Path = path.join(outputDir, 'contrast_07_light_notifications_open.png');
    await page.screenshot({ path: shot7Path, fullPage: false });
    console.log('[QA] ✓ Captura 7: light notifications open ->', shot7Path);

    await bellBtn.click();
    await page.waitForTimeout(300);

    // Open profile menu in light
    await profileBtn.click();
    await page.waitForTimeout(500);

    const shot8Path = path.join(outputDir, 'contrast_08_light_profile_menu_open.png');
    await page.screenshot({ path: shot8Path, fullPage: false });
    console.log('[QA] ✓ Captura 8: light profile menu open ->', shot8Path);

    // Open User Profile Modal in light
    const myProfileBtnLight = page.locator('button:has-text("Mi perfil")');
    await myProfileBtnLight.click();
    await page.waitForTimeout(500);

    const shot9Path = path.join(outputDir, 'contrast_09_light_user_profile_modal.png');
    await page.screenshot({ path: shot9Path, fullPage: false });
    console.log('[QA] ✓ Captura 9: light user profile modal ->', shot9Path);

    const cancelProfileModalLight = page.locator('button:has-text("Cancelar")');
    await cancelProfileModalLight.click();
    await page.waitForTimeout(300);

    // =========================================================================
    // 3. MOBILE DARK (~390px)
    // =========================================================================
    console.log('[QA] 3. Probando en Mobile Dark (390px)...');
    // Switch back to dark mode
    await themeToggleBtn.click();
    await page.waitForTimeout(300);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    // Notifications in mobile dark
    await bellBtn.click();
    await page.waitForTimeout(500);

    const shot10Path = path.join(outputDir, 'contrast_10_mobile_dark_notifications.png');
    await page.screenshot({ path: shot10Path, fullPage: false });
    console.log('[QA] ✓ Captura 10: mobile dark notifications ->', shot10Path);

    await bellBtn.click();
    await page.waitForTimeout(300);

    // Profile in mobile dark
    await profileBtn.click();
    await page.waitForTimeout(500);

    const shot11Path = path.join(outputDir, 'contrast_11_mobile_dark_profile.png');
    await page.screenshot({ path: shot11Path, fullPage: false });
    console.log('[QA] ✓ Captura 11: mobile dark profile ->', shot11Path);

    console.log('\n[QA] ¡Todas las capturas Playwright se completaron con éxito!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('QA visual error:', err);
  process.exit(1);
});
