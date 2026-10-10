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

const PORT = 4192;
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
  console.log(`[SERVER] Servidor preview listo en http://${HOST}:${PORT}`);

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
      pedido_visible: 'PED-2026-I000022',
      origen: 'interno',
      titulo: 'Campaña Provincial de Vacunación Antigripal',
      categoria_id: 'cat-11',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tip-111',
      tipo_nombre: 'Flyer Digital',
      estado: 'Nuevo',
      prioridad: 'alta',
      etiqueta_interna: 'SALUD-2026',
      retrabajo_activo: false,
      responsable_user_id: null,
      responsable_nombre: null,
      informacion_especifica: {
        titulo: 'Campaña Provincial de Vacunación Antigripal',
        descripcion: 'Diseño urgente de 4 flyers institucionales para centros de salud',
        solicitante: {
          nombre: 'Dra. María Elena Gómez',
          area: 'Ministerio de Salud',
          correo: 'salud@tierradelfuego.gob.ar',
          telefono: '2901445566'
        }
      },
      envio: null,
      created_at: new Date().toISOString(),
      version: 1,
      archivado: false,
    },
    {
      id: 'a2222222-2222-4222-a222-222222222222',
      pedido_visible: 'PED-2026-D000015',
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
    },
    {
      id: 'a3333333-3333-4333-a333-333333333333',
      pedido_visible: 'PED-2026-I000025',
      origen: 'interno',
      titulo: 'Cobertura Apertura Sesiones Legislativas',
      categoria_id: 'cat-12',
      categoria_nombre: 'Audiovisual',
      tipo_servicio_id: 'tip-121',
      tipo_nombre: 'Cobertura Completa',
      estado: 'En proceso',
      prioridad: 'alta',
      etiqueta_interna: 'EVENTO-OFICIAL',
      retrabajo_activo: false,
      responsable_user_id: 'usr-b3-admin-01',
      responsable_nombre: 'Pablo Saldivia',
      informacion_especifica: {
        titulo: 'Cobertura Apertura Sesiones Legislativas',
        descripcion: 'Transmisión y fotografía oficial del discurso del Gobernador'
      },
      envio: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      version: 2,
      archivado: false,
    }
  ];

  // Interceptar rutas Supabase
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

  await page.route('**/rest/v1/pedidos*', (route) => {
    const url = route.request().url();
    if (url.includes('a1111111-1111-4111-a111-111111111111') || url.includes('PED-2026-I000022')) {
      const detail = {
        ...mockPedidos[0],
        solicitudes: [],
        asignaciones: [],
        notas: [],
        archivos: [],
        enlaces: [
          { id: 'enl-1', url: 'https://drive.google.com/drive/folders/carpeta-salud', titulo: 'Material preliminar y logos de Salud' }
        ],
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

    if (url.includes('a3333333-3333-4333-a333-333333333333') || url.includes('PED-2026-I000025')) {
      const detail = {
        ...mockPedidos[2],
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

    // Filtrado por origen si existe
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
      body: JSON.stringify([
        {
          id: 'hist-1',
          pedido_id: 'ped-int-01',
          actor_user_id: 'usr-b3-admin-01',
          evento: 'creacion_interna',
          descripcion: 'Pedido creado internamente por el equipo',
          created_at: new Date().toISOString()
        }
      ]),
    });
  });

  // Inject token in localStorage
  await page.addInitScript(({ token, sess, prof }) => {
    window.localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', JSON.stringify(sess));
    window.localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', JSON.stringify(sess));
  }, { token: validJwt, sess: mockSession, prof: mockProfile });

  console.log('[PLAYWRIGHT] Navegando a /gestion...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Kanban View Screenshot
  const shot1 = path.join(outputDir, 'b3_01_kanban_carga_interna_and_badge.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log(`[QA EVIDENCE 1] Guardada: ${shot1}`);

  // 2. Open Carga Interna Modal
  console.log('[PLAYWRIGHT] Abriendo modal de Carga Interna...');
  const btnCargaInterna = page.locator('button:has-text("Carga interna")');
  await btnCargaInterna.click();
  await page.waitForTimeout(600);

  // Llenar datos de demostración en el modal
  await page.fill('#input-titulo', 'Campaña Provincial de Concientización Vial 2026');
  await page.fill('#input-descripcion', 'Elaboración de 3 spots y folletos con recomendaciones de seguridad vial invernal.');
  await page.fill('#input-solicitante-nombre', 'Comisario Inspector Jorge Martínez');
  await page.fill('#input-solicitante-area', 'Policía Provincial - Seguridad Vial');

  const shot2 = path.join(outputDir, 'b3_02_modal_carga_interna_form.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log(`[QA EVIDENCE 2] Guardada: ${shot2}`);

  // Cerrar modal con Cancelar o Esc
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 3. Navigate to Pedido Detalle de pedido interno
  console.log('[PLAYWRIGHT] Navegando a detalle de pedido interno...');
  await page.goto(`http://${HOST}:${PORT}/gestion/pedidos/a1111111-1111-4111-a111-111111111111`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const shot3 = path.join(outputDir, 'b3_03_pedido_detalle_interno.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log(`[QA EVIDENCE 3] Guardada: ${shot3}`);

  // 4. Navigate to Pedido Detalle en proceso para finalización flexible
  console.log('[PLAYWRIGHT] Navegando a pedido interno en proceso...');
  await page.goto(`http://${HOST}:${PORT}/gestion/pedidos/a3333333-3333-4333-a333-333333333333`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const btnFinalizar = page.locator('button:has-text("Finalizar pedido")').first();
  await btnFinalizar.waitFor({ state: 'visible', timeout: 5000 });
  await btnFinalizar.click();
  await page.waitForTimeout(600);
  const shot4 = path.join(outputDir, 'b3_04_modal_finalizar_interno_flexible.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log(`[QA EVIDENCE 4] Guardada: ${shot4}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 5. Tabla de Pedidos con Filtro Origen
  console.log('[PLAYWRIGHT] Navegando a tabla de pedidos...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Click en vista Tabla
  const btnTabla = page.locator('button:has-text("Tabla")');
  if (await btnTabla.count() > 0) {
    await btnTabla.click();
    await page.waitForTimeout(400);

    // Cambiar filtro origen a "Internos"
    const origenSelect = page.locator('select').filter({ hasText: 'Todos los orígenes' });
    if (await origenSelect.count() > 0) {
      await origenSelect.selectOption('interno');
      await page.waitForTimeout(500);
    }

    const shot5 = path.join(outputDir, 'b3_05_tabla_pedidos_filtro_interno.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log(`[QA EVIDENCE 5] Guardada: ${shot5}`);
  }

  await browser.close();
  server.close();
  console.log('[PLAYWRIGHT] Todas las capturas de QA completadas exitosamente.');
}

main().catch((err) => {
  console.error('[PLAYWRIGHT ERR]', err);
  process.exit(1);
});
