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
  console.log(`[SERVER] Preview server running on http://${HOST}:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 860 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

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
        { id: 'tip-112', nombre: 'Folleto Informativo', descripcion: 'Diseño editorial' }
      ]
    },
    {
      id: 'cat-12',
      nombre: 'Audiovisual',
      codigo_ped: 'A',
      tipos_servicio: [
        { id: 'tip-121', nombre: 'Cobertura Completa', descripcion: 'Video y foto' }
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
      tipo_servicio_id: null,
      tipo_nombre: null,
      estado: 'Nuevo',
      prioridad: 'alta',
      etiqueta_interna: 'INTER-2026',
      retrabajo_activo: false,
      responsable_user_id: null,
      responsable_nombre: null,
      informacion_especifica: {
        titulo: 'Mesa de Trabajo Interministerial de Medios',
        descripcion: 'Coordinación institucional y plan operativo de comunicación 2026',
        solicitante: {
          nombre: 'Lic. Luciana Torres',
          area: 'Secretaría de Coordinación de Gabinete',
          correo: 'ltorres@tierradelfuego.gob.ar',
          telefono: '2901456789'
        }
      },
      envio: null,
      created_at: new Date().toISOString(),
      version: 1,
      archivado: false,
    },
    {
      id: 'a2222222-2222-4222-a222-222222222222',
      pedido_visible: 'PED-2026-D000029',
      codigo_categoria: 'D',
      origen: 'interno',
      titulo: 'Campaña Provincial de Vacunación Antigripal',
      categoria_id: 'cat-11',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tip-111',
      tipo_nombre: 'Flyer Digital',
      estado: 'En proceso',
      prioridad: 'media',
      etiqueta_interna: 'SALUD',
      retrabajo_activo: false,
      responsable_user_id: 'usr-b3-admin-01',
      responsable_nombre: 'Pablo Saldivia',
      informacion_especifica: {
        titulo: 'Campaña Provincial de Vacunación Antigripal',
        descripcion: 'Diseño urgente de piezas gráficas para centros de salud',
        solicitante: {
          nombre: 'Dra. María Elena Gómez',
          area: 'Ministerio de Salud',
          correo: 'salud@tierradelfuego.gob.ar',
          telefono: '2901445566'
        }
      },
      envio: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      version: 2,
      archivado: false,
    },
    {
      id: 'a3333333-3333-4333-a333-333333333333',
      pedido_visible: 'PED-2026-D000015',
      codigo_categoria: 'D',
      origen: 'publico',
      titulo: null,
      categoria_id: 'cat-11',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tip-111',
      tipo_nombre: 'Flyer Digital',
      estado: 'En proceso',
      prioridad: 'media',
      etiqueta_interna: null,
      retrabajo_activo: false,
      responsable_user_id: 'usr-b3-admin-01',
      responsable_nombre: 'Pablo Saldivia',
      informacion_especifica: {
        formato: 'Cuadrado 1:1',
        texto: 'Promoción del taller de Robótica'
      },
      envio: {
        id: 'env-1',
        nombre_apellido: 'Carlos Ramos',
        area_solicitante: 'Secretaría de Ciencia y Tecnología',
        correo: 'cramos@tdf.gob.ar',
        telefono: '2964556677'
      },
      created_at: new Date(Date.now() - 86400000).toISOString(),
      version: 2,
      archivado: false,
    }
  ];

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
      body: JSON.stringify(0),
    });
  });

  await page.route('**/rest/v1/notificaciones_usuario*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/categorias_servicio*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCategorias),
    });
  });

  await page.route('**/rest/v1/tipos_servicio*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCategorias.flatMap(c => c.tipos_servicio.map(t => ({ ...t, categoria_id: c.id })))),
    });
  });

  await page.route('**/rest/v1/rpc/gestion_dashboard_stats*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 3,
        nuevos: 1,
        enRevision: 0,
        enProceso: 2,
        esperandoInfo: 0,
        finalizados: 0,
        cancelados: 0,
        sinAsignar: 1,
        archivados: 0,
      }),
    });
  });

  await page.route('**/rest/v1/historial_operativo_pedidos*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/pedidos*', (route) => {
    const url = route.request().url();
    if (url.includes('a1111111-1111-4111-a111-111111111111') || url.includes('PED-2026-X000028')) {
      const detail = {
        ...mockPedidos[0],
        solicitudes: [],
        asignaciones: [],
        notas: [],
        archivos: [],
        enlaces: [],
        entregas: []
      };
      const accept = route.request().headers()['accept'] || '';
      if (accept.includes('vnd.pgrst.object+json')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify(detail),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([detail]),
      });
    }

    let filtered = [...mockPedidos];
    if (url.includes('origen=eq.interno')) {
      filtered = filtered.filter(p => p.origen === 'interno');
    } else if (url.includes('origen=eq.publico')) {
      filtered = filtered.filter(p => p.origen === 'publico');
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${filtered.length - 1}/${filtered.length}` },
      body: JSON.stringify(filtered),
    });
  });

  await page.addInitScript(({ sess }) => {
    window.localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('pedidos:theme', 'light');
  }, { sess: mockSession });

  // -------------------------------------------------------------
  // A. Card Interno Light
  // -------------------------------------------------------------
  console.log('[QA] Capturando Card Interno Light...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: path.join(outputDir, 'b3_2_01_card_interno_light.png'),
    fullPage: false,
  });
  console.log(' -> Guardado b3_2_01_card_interno_light.png');

  // -------------------------------------------------------------
  // B. Card Interno Dark
  // -------------------------------------------------------------
  console.log('[QA] Capturando Card Interno Dark...');
  const darkBtn = page.locator('button:has-text("Modo Oscuro")').first();
  if (await darkBtn.isVisible()) {
    await darkBtn.click();
    await page.waitForTimeout(800);
  } else {
    await page.evaluate(() => {
      window.localStorage.setItem('pedidos:theme', 'dark');
      const appEl = document.querySelector('.pedidos-app');
      if (appEl) appEl.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(800);
  }
  await page.screenshot({
    path: path.join(outputDir, 'b3_2_02_card_interno_dark.png'),
    fullPage: false,
  });
  console.log(' -> Guardado b3_2_02_card_interno_dark.png');

  // -------------------------------------------------------------
  // C. Detalle Interno
  // -------------------------------------------------------------
  console.log('[QA] Capturando Detalle Interno...');
  await page.evaluate(() => {
    window.localStorage.setItem('pedidos:theme', 'light');
    const appEl = document.querySelector('.pedidos-app');
    if (appEl) appEl.setAttribute('data-theme', 'light');
  });
  await page.goto(`http://${HOST}:${PORT}/gestion/pedidos/a1111111-1111-4111-a111-111111111111`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(outputDir, 'b3_2_03_detalle_interno.png'),
    fullPage: false,
  });
  console.log(' -> Guardado b3_2_03_detalle_interno.png');

  // -------------------------------------------------------------
  // D. Tabla Interna
  // -------------------------------------------------------------
  console.log('[QA] Capturando Tabla Interna...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const tablaTabBtn = page.getByRole('button', { name: /Tabla/i }).or(page.locator('button', { hasText: 'Tabla' })).first();
  if (await tablaTabBtn.isVisible()) {
    await tablaTabBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({
    path: path.join(outputDir, 'b3_2_04_tabla_interna.png'),
    fullPage: false,
  });
  console.log(' -> Guardado b3_2_04_tabla_interna.png');

  await browser.close();
  server.close();
  console.log('[QA] Todas las 4 capturas solicitadas completadas con éxito.');
}

main().catch((err) => {
  console.error('[QA] Error:', err);
  server.close();
  process.exit(1);
});
