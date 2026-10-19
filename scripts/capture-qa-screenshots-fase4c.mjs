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

const PORT = 4198;
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

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[SERVER] Preview listo en http://${HOST}:${PORT}`);

  const browser = await chromium.launch({ headless: true });

  function makeMockJwt(u) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: u.id,
      email: u.email,
      role: 'authenticated',
      app_metadata: { role: u.role },
      user_metadata: { nombre: u.nombre, apellido: u.apellido },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    return `${header}.${payload}.mockSignature`;
  }

  const mockAdminUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'admin.prensa@tdf.gob.ar',
    nombre: 'Valeria',
    apellido: 'Gómez',
    role: 'administrador',
  };

  const mockObserverUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'observador@tdf.gob.ar',
    nombre: 'Lucas',
    apellido: 'Observador',
    role: 'observador',
  };

  const mockBoardId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const mockCol1 = 'cccccccc-1111-4ccc-accc-cccccccccccc';
  const mockCol2 = 'cccccccc-2222-4ccc-accc-cccccccccccc';
  const mockCol3 = 'cccccccc-3333-4ccc-accc-cccccccccccc';

  const mockBoard = {
    id: mockBoardId,
    titulo: 'Campaña Prensa Verano 2026',
    descripcion: 'Planificación integral de medios, conferencias y coberturas audiovisuales',
    color: 'azul',
    propietario_id: mockAdminUser.id,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    propietario: {
      nombre: 'Valeria',
      apellido: 'Gómez',
      nombre_usuario: 'vgomez',
    },
    mi_rol: 'propietario',
  };

  const mockMembers = [
    {
      id: 'mm1',
      tablero_id: mockBoardId,
      user_id: 'uuuu1',
      rol_tablero: 'edicion',
      usuario: { nombre: 'Martín', apellido: 'Pérez', nombre_usuario: 'mperez', app_role: 'equipo' },
    },
    {
      id: 'mm2',
      tablero_id: mockBoardId,
      user_id: 'uuuu2',
      rol_tablero: 'lectura',
      usuario: { nombre: 'Carla', apellido: 'Soto', nombre_usuario: 'csoto', app_role: 'equipo' },
    },
  ];

  const mockCols = [
    { id: mockCol1, tablero_id: mockBoardId, nombre: 'Por hacer', orden: 0, color: 'gris' },
    { id: mockCol2, tablero_id: mockBoardId, nombre: 'En curso', orden: 1, color: 'azul' },
    { id: mockCol3, tablero_id: mockBoardId, nombre: 'Completado', orden: 2, color: 'verde' },
  ];

  const mockCards = [
    {
      id: 'card-1',
      tablero_id: mockBoardId,
      columna_id: mockCol1,
      titulo: 'Diseñar placas institucionales para redes',
      descripcion: 'Formato 1080x1350 y stories para Instagram oficial',
      tipo_contenido: 'checklist',
      color: 'azul',
      orden: 0,
      checklists: [
        { id: 'chk-1', texto: 'Ajustar logos de ministerios', completado: true },
        { id: 'chk-2', texto: 'Revisión tipográfica de marca', completado: false },
      ],
      comentarios: [
        { id: 'com-1', contenido: 'Bocetos enviados a revisión', created_at: '2026-10-19T10:30:00Z', autor: { nombre: 'Martín', apellido: 'Pérez' } },
      ],
    },
    {
      id: 'card-2',
      tablero_id: mockBoardId,
      columna_id: mockCol1,
      titulo: 'Manual de Marca y Recursos Oficiales',
      tipo_contenido: 'enlace',
      metadata: { url: 'https://gobierno.tdf.gob.ar/identidad', etiqueta: 'Portal de Identidad Gráfica' },
      color: 'cyan',
      orden: 1,
    },
    {
      id: 'card-3',
      tablero_id: mockBoardId,
      columna_id: mockCol2,
      titulo: 'Contacto Productor Móvil Canal 11',
      tipo_contenido: 'contacto',
      metadata: { nombre: 'Roberto Benítez', telefono: '+54 2901 445566', email: 'rbenitez@canal11.tdf.gob.ar' },
      color: 'morado',
      orden: 0,
    },
    {
      id: 'card-4',
      tablero_id: mockBoardId,
      columna_id: mockCol2,
      titulo: 'Conferencia de Prensa Lanzamiento Verano',
      tipo_contenido: 'recordatorio',
      metadata: { fecha_limite: '2026-10-25', nota_recordatorio: '10:00 hs en Salón Malvinas' },
      color: 'ambar',
      orden: 1,
    },
    {
      id: 'card-5',
      tablero_id: mockBoardId,
      columna_id: mockCol3,
      titulo: 'Seguimiento Pedido PED-2026-D000087',
      tipo_contenido: 'pedido_ref',
      metadata: { pedido_id: 'ped-87', numero_identificador: 'PED-2026-D000087', titulo_pedido: 'Folletería Institucional' },
      color: 'verde',
      orden: 0,
    },
  ];

  async function mockSession(context, user) {
    const token = makeMockJwt(user);
    const mockUserPayload = {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: { role: user.role },
      user_metadata: { nombre: user.nombre, apellido: user.apellido },
    };
    const authData = {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'mock-refresh-token',
      user: mockUserPayload,
    };

    await context.addInitScript(({ sess }) => {
      window.localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', JSON.stringify(sess));
      window.localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', JSON.stringify(sess));
      window.localStorage.setItem('pedidos:theme', 'light');
    }, { sess: authData });

    await context.route('**/auth/v1/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUserPayload),
      });
    });

    await context.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      const accept = route.request().headers()['accept'] || '';

      if (url.includes('/usuarios_acceso')) {
        const profile = user.role === 'observador'
          ? { user_id: user.id, app_role: 'observador', estado_acceso: 'aprobado', nombre: user.nombre, apellido: user.apellido }
          : { user_id: user.id, app_role: user.role, estado_acceso: 'aprobado', nombre: user.nombre, apellido: user.apellido };
        if (accept.includes('vnd.pgrst.object+json')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/vnd.pgrst.object+json',
            body: JSON.stringify(profile),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/1' },
          body: JSON.stringify([profile]),
        });
      }
      if (url.includes('/rpc/my_access')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            nombre: user.nombre,
            apellido: user.apellido,
            appRole: user.role,
            estadoAcceso: 'aprobado',
          }),
        });
      }
      if (url.includes('/rpc/notification_unread_count')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(0),
        });
      }
      if (url.includes('/notificaciones_usuario')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0' },
          body: JSON.stringify([]),
        });
      }
      if (url.includes('/tableros_privados')) {
        const isSingle = accept.includes('vnd.pgrst.object+json') || url.includes('id=eq.');
        if (isSingle) {
          return route.fulfill({
            status: 200,
            contentType: 'application/vnd.pgrst.object+json',
            body: JSON.stringify(mockBoard),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/1' },
          body: JSON.stringify([mockBoard]),
        });
      }
      if (url.includes('/tablero_miembros')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${mockMembers.length - 1}/${mockMembers.length}` },
          body: JSON.stringify(mockMembers),
        });
      }
      if (url.includes('/tablero_columnas')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${mockCols.length - 1}/${mockCols.length}` },
          body: JSON.stringify(mockCols),
        });
      }
      if (url.includes('/tablero_tarjetas')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${mockCards.length - 1}/${mockCards.length}` },
          body: JSON.stringify(mockCards),
        });
      }
      if (url.includes('/rpc/tablero_get_collaborators')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { user_id: 'col1', nombre: 'Gonzalo', apellido: 'Fernández', nombre_usuario: 'gfernandez', app_role: 'equipo' },
            { user_id: 'col2', nombre: 'Florencia', apellido: 'López', nombre_usuario: 'flopez', app_role: 'administrador' },
          ]),
        });
      }
      return route.continue();
    });
  }

  // 1. Desktop Kanban Tableros Privados
  console.log('[QA] 1. Desktop Kanban Tableros Privados');
  const ctxDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mockSession(ctxDesktop, mockAdminUser);
  const pageDesktop = await ctxDesktop.newPage();
  await pageDesktop.goto(`http://${HOST}:${PORT}/gestion/tableros`, { waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(1000);
  await pageDesktop.screenshot({ path: path.join(outputDir, 'fase4c_01_tableros_desktop_kanban.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_01_tableros_desktop_kanban.png');

  // 2. Mobile Responsive Tableros
  console.log('[QA] 2. Mobile Responsive Tableros');
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mockSession(ctxMobile, mockAdminUser);
  const pageMobile = await ctxMobile.newPage();
  await pageMobile.goto(`http://${HOST}:${PORT}/gestion/tableros`, { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(1000);
  await pageMobile.screenshot({ path: path.join(outputDir, 'fase4c_02_tablero_mobile.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_02_tablero_mobile.png');

  // 3. Modal Tarjeta con Checklist y Comentarios
  console.log('[QA] 3. Modal Tarjeta con Checklist y Comentarios');
  await pageDesktop.waitForSelector('.tablero-card', { timeout: 10000 });
  await pageDesktop.locator('.tablero-card').first().click();
  await pageDesktop.waitForSelector('.pedidos-modal-container', { timeout: 5000 });
  await pageDesktop.waitForTimeout(500);
  await pageDesktop.screenshot({ path: path.join(outputDir, 'fase4c_03_modal_tarjeta_checklist.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_03_modal_tarjeta_checklist.png');
  await pageDesktop.locator('.pedidos-modal-close').first().click();
  await pageDesktop.waitForSelector('.pedidos-modal-container', { state: 'detached', timeout: 5000 });
  await pageDesktop.waitForTimeout(300);

  // 4. Modal Compartir y Permisos
  console.log('[QA] 4. Modal Compartir y Permisos');
  await pageDesktop.click('button:has-text("👥 Compartir")');
  await pageDesktop.waitForSelector('.pedidos-modal-container', { timeout: 5000 });
  await pageDesktop.waitForTimeout(500);
  await pageDesktop.screenshot({ path: path.join(outputDir, 'fase4c_04_modal_compartir_permisos.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_04_modal_compartir_permisos.png');
  await pageDesktop.locator('.pedidos-modal-close').first().click();
  await pageDesktop.waitForSelector('.pedidos-modal-container', { state: 'detached', timeout: 5000 });
  await pageDesktop.waitForTimeout(300);

  // 5. Modo Oscuro Tableros
  console.log('[QA] 5. Modo Oscuro Tableros');
  const themeBtn = pageDesktop.locator('button:has-text("Modo Oscuro")');
  if (await themeBtn.isVisible()) {
    await themeBtn.click();
  } else {
    await pageDesktop.evaluate(() => {
      localStorage.setItem('pedidos:theme', 'dark');
      const container = document.querySelector('.pedidos-app');
      if (container) container.setAttribute('data-theme', 'dark');
    });
  }
  await pageDesktop.waitForTimeout(600);
  await pageDesktop.screenshot({ path: path.join(outputDir, 'fase4c_05_modo_oscuro_tablero.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_05_modo_oscuro_tablero.png');

  // 6. Observador Bloqueado (PoLP)
  console.log('[QA] 6. Observador Bloqueado');
  const ctxObs = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await mockSession(ctxObs, mockObserverUser);
  const pageObs = await ctxObs.newPage();
  await pageObs.goto(`http://${HOST}:${PORT}/gestion/tableros`, { waitUntil: 'networkidle' });
  await pageObs.waitForTimeout(800);
  await pageObs.screenshot({ path: path.join(outputDir, 'fase4c_06_observador_bloqueado.png'), fullPage: false });
  console.log('  ✓ Guardado fase4c_06_observador_bloqueado.png');

  await browser.close();
  server.close();
  console.log('[QA] Todas las capturas generadas exitosamente.');
}

main().catch((err) => {
  console.error('Error generando capturas:', err);
  server.close();
  process.exit(1);
});
