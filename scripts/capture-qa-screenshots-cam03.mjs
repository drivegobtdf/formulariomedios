import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'pedidos-standalone', 'web');
const outputDir = path.resolve('C:/Users/Pc/.gemini/antigravity/brain/a9cafa7e-593b-46d3-a927-7735dc895b26');
fs.mkdirSync(outputDir, { recursive: true });

const PORT = 4215;
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

  const syntheticPedidos = [
    {
      id: 'ped-f-01',
      pedido_visible: 'PED-2026-D000001',
      anio: 2026,
      numero: 1,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Campaña Invierno Ushuaia — Flyer y Afiches',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-flyer',
      tipo_nombre: 'Flyer Digital',
      responsable_user_id: '11111111-1111-4111-a111-111111111111',
      responsable_nombre: 'Valeria Gómez',
      solicitante_nombre: 'Martín Cabrera',
      area_solicitante: 'Secretaría de Turismo',
      informacion_especifica: {},
      version: 2,
      archivado: false,
      created_at: '2026-10-01T10:15:00.000Z',
      finalizado_at: '2026-10-05T14:30:00.000Z',
      updated_at: '2026-10-05T14:30:00.000Z',
      prioridad: 'alta',
      revision_count: 1,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Diseño Gráfico' },
      tipos_servicio: { nombre: 'Flyer Digital' },
      envios_formulario: { id: 'env-1', nombre_apellido: 'Martín Cabrera', area_solicitante: 'Secretaría de Turismo' },
      pedido_etiquetas: [{ id: 'tag-1', texto: 'Invierno', color: 'azul', created_at: '2026-10-01T11:00:00Z' }],
      pedido_versiones: [{ id: 'pv-1', version_number: 2, finalizado_at: '2026-10-05T14:30:00.000Z' }],
    },
    {
      id: 'ped-f-02',
      pedido_visible: 'PED-2026-P000002',
      anio: 2026,
      numero: 2,
      codigo_categoria: 'P',
      estado: 'Finalizado',
      origen: 'interno',
      titulo: 'Gacetilla Obras Viales Ruta 3',
      categoria_id: 'cat-prensa',
      categoria_nombre: 'Prensa',
      tipo_servicio_id: 'tipo-gacetilla',
      tipo_nombre: 'Gacetilla',
      responsable_user_id: '22222222-2222-4222-a222-222222222222',
      responsable_nombre: 'Santiago Morales',
      solicitante_nombre: 'Ana Gómez',
      area_solicitante: 'Ministerio de Obras Públicas',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-10T12:00:00.000Z',
      finalizado_at: '2026-10-15T18:00:00.000Z',
      updated_at: '2026-10-15T18:00:00.000Z',
      prioridad: 'baja',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Prensa' },
      tipos_servicio: { nombre: 'Gacetilla' },
      envios_formulario: { id: 'env-2', nombre_apellido: 'Ana Gómez', area_solicitante: 'Ministerio de Obras Públicas' },
      pedido_etiquetas: [{ id: 'tag-2', texto: 'Obras', color: 'verde', created_at: '2026-10-10T12:30:00Z' }],
      pedido_versiones: [{ id: 'pv-2', version_number: 1, finalizado_at: '2026-10-15T18:00:00.000Z' }],
    },
    {
      id: 'ped-f-03',
      pedido_visible: 'PED-2026-A000003',
      anio: 2026,
      numero: 3,
      codigo_categoria: 'A',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Spot Radial Campaña Vacunación',
      categoria_id: 'cat-audiovisual',
      categoria_nombre: 'Audiovisual',
      tipo_servicio_id: 'tipo-spot',
      tipo_nombre: 'Spot Radial',
      responsable_user_id: null,
      responsable_nombre: null,
      solicitante_nombre: 'Dra. Elena Rossi',
      area_solicitante: 'Ministerio de Salud',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-12T09:00:00.000Z',
      finalizado_at: null, // Fallback explícito a created_at
      updated_at: '2026-10-12T09:00:00.000Z',
      prioridad: null,
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Audiovisual' },
      tipos_servicio: { nombre: 'Spot Radial' },
      envios_formulario: { id: 'env-3', nombre_apellido: 'Dra. Elena Rossi', area_solicitante: 'Ministerio de Salud' },
      pedido_etiquetas: [],
      pedido_versiones: [],
    },
    {
      id: 'ped-f-04',
      pedido_visible: 'PED-2026-D000004',
      anio: 2026,
      numero: 4,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Portal Conmemorativo Malvinas 44 Años',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-banner',
      tipo_nombre: 'Banner Web',
      responsable_user_id: '11111111-1111-4111-a111-111111111111',
      responsable_nombre: 'Valeria Gómez',
      solicitante_nombre: 'Laura Benítez',
      area_solicitante: 'Secretaría de Malvinas',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-20T08:00:00.000Z',
      finalizado_at: '2026-10-25T11:00:00.000Z', // Más reciente
      updated_at: '2026-10-25T11:00:00.000Z',
      prioridad: 'media',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Diseño Gráfico' },
      tipos_servicio: { nombre: 'Banner Web' },
      envios_formulario: { id: 'env-4', nombre_apellido: 'Laura Benítez', area_solicitante: 'Secretaría de Malvinas' },
      pedido_etiquetas: [{ id: 'tag-3', texto: 'Malvinas', color: 'indigo', created_at: '2026-10-20T08:30:00Z' }],
      pedido_versiones: [{ id: 'pv-4', version_number: 1, finalizado_at: '2026-10-25T11:00:00.000Z' }],
    },
    {
      id: 'ped-f-05',
      pedido_visible: 'PED-2026-D000005',
      anio: 2026,
      numero: 5,
      codigo_categoria: 'D',
      estado: 'Finalizado',
      origen: 'publico',
      titulo: 'Infografía Balance Presupuesto Provincial',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-infografia',
      tipo_nombre: 'Infografía',
      responsable_user_id: '11111111-1111-4111-a111-111111111111',
      responsable_nombre: 'Valeria Gómez',
      solicitante_nombre: 'Esteban Quito',
      area_solicitante: 'Ministerio de Economía',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-02T11:00:00.000Z',
      finalizado_at: '2026-10-05T14:30:00.000Z', // Mismo timestamp que ped-f-01
      updated_at: '2026-10-05T14:30:00.000Z',
      prioridad: 'alta',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Diseño Gráfico' },
      tipos_servicio: { nombre: 'Infografía' },
      envios_formulario: { id: 'env-5', nombre_apellido: 'Esteban Quito', area_solicitante: 'Ministerio de Economía' },
      pedido_etiquetas: [{ id: 'tag-4', texto: 'Economía', color: 'verde', created_at: '2026-10-02T11:30:00Z' }],
      pedido_versiones: [{ id: 'pv-5', version_number: 1, finalizado_at: '2026-10-05T14:30:00.000Z' }],
    },
    {
      id: 'ped-f-06',
      pedido_visible: 'PED-2026-A000006',
      anio: 2026,
      numero: 6,
      codigo_categoria: 'A',
      estado: 'Finalizado',
      origen: 'interno',
      titulo: 'Video Resumen Acto Oficial Día de la Bandera',
      categoria_id: 'cat-audiovisual',
      categoria_nombre: 'Audiovisual',
      tipo_servicio_id: 'tipo-video',
      tipo_nombre: 'Video Institucional',
      responsable_user_id: '22222222-2222-4222-a222-222222222222',
      responsable_nombre: 'Santiago Morales',
      solicitante_nombre: 'Protocolo y Ceremonial',
      area_solicitante: 'Gobernación',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-22T14:00:00.000Z',
      finalizado_at: '2026-10-28T16:45:00.000Z',
      updated_at: '2026-10-28T16:45:00.000Z',
      prioridad: 'media',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Audiovisual' },
      tipos_servicio: { nombre: 'Video Institucional' },
      envios_formulario: null,
      pedido_etiquetas: [{ id: 'tag-5', texto: 'Institucional', color: 'morado', created_at: '2026-10-22T14:30:00Z' }],
      pedido_versiones: [{ id: 'pv-6', version_number: 1, finalizado_at: '2026-10-28T16:45:00.000Z' }],
    },
  ];

  async function mockSession(context) {
    const token = makeMockJwt(mockAdminUser);
    const mockUserPayload = {
      id: mockAdminUser.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: mockAdminUser.email,
      app_metadata: { role: mockAdminUser.role },
      user_metadata: { nombre: mockAdminUser.nombre, apellido: mockAdminUser.apellido },
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
        const profile = {
          user_id: mockAdminUser.id,
          nombre: 'Valeria',
          apellido: 'Gómez',
          nombre_usuario: 'vgomez',
          app_role: 'administrador',
          estado_acceso: 'aprobado',
          solicitado_at: '2026-01-01T00:00:00Z',
          aprobado_at: '2026-01-01T00:00:00Z',
        };
        const allUsers = [
          profile,
          {
            user_id: '22222222-2222-4222-a222-222222222222',
            nombre: 'Santiago',
            apellido: 'Morales',
            nombre_usuario: 'smorales',
            app_role: 'equipo',
            estado_acceso: 'aprobado',
            solicitado_at: '2026-01-01T00:00:00Z',
            aprobado_at: '2026-01-01T00:00:00Z',
          },
        ];

        if (accept.includes('vnd.pgrst.object+json')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/vnd.pgrst.object+json',
            body: JSON.stringify(profile),
          });
        }
        if (url.includes(`user_id=eq.${mockAdminUser.id}`)) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'content-range': '0-0/1' },
            body: JSON.stringify([profile]),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${allUsers.length - 1}/${allUsers.length}` },
          body: JSON.stringify(allUsers),
        });
      }

      if (url.includes('/rpc/my_access')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: mockAdminUser.id,
            email: mockAdminUser.email,
            nombre: mockAdminUser.nombre,
            apellido: mockAdminUser.apellido,
            appRole: 'administrador',
            estadoAcceso: 'aprobado',
          }),
        });
      }

      if (url.includes('/rpc/gestion_dashboard_stats')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total: 6,
            nuevos: 0,
            enRevision: 0,
            enProceso: 0,
            esperandoInfo: 0,
            finalizados: 6,
            cancelados: 0,
            sinAsignar: 0,
            archivados: 0,
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

      if (url.includes('/categorias_servicio')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'cat-diseno', nombre: 'Diseño Gráfico', codigo_ped: 'D', orden: 1 },
            { id: 'cat-prensa', nombre: 'Prensa', codigo_ped: 'P', orden: 2 },
            { id: 'cat-audiovisual', nombre: 'Audiovisual', codigo_ped: 'A', orden: 3 },
          ]),
        });
      }

      if (url.includes('/tipos_servicio')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'tipo-flyer', categoria_id: 'cat-diseno', nombre: 'Flyer Digital', orden: 1 },
            { id: 'tipo-banner', categoria_id: 'cat-diseno', nombre: 'Banner Web', orden: 2 },
            { id: 'tipo-infografia', categoria_id: 'cat-diseno', nombre: 'Infografía', orden: 3 },
            { id: 'tipo-gacetilla', categoria_id: 'cat-prensa', nombre: 'Gacetilla', orden: 4 },
            { id: 'tipo-spot', categoria_id: 'cat-audiovisual', nombre: 'Spot Radial', orden: 5 },
            { id: 'tipo-video', categoria_id: 'cat-audiovisual', nombre: 'Video Institucional', orden: 6 },
          ]),
        });
      }

      if (url.includes('/pedidos')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${syntheticPedidos.length - 1}/${syntheticPedidos.length}` },
          body: JSON.stringify(syntheticPedidos),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  }

  // =========================================================================
  // CAPTURA 1: Desktop 1440x900 - Vista Finalizados Predeterminada (Recientes)
  // =========================================================================
  console.log('[QA] Capturando 1: Desktop Finalizados Default (1440x900)...');
  const contextDesktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await mockSession(contextDesktop);
  const pageDesktop = await contextDesktop.newPage();
  pageDesktop.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
  pageDesktop.on('pageerror', (err) => console.log('[PAGE ERROR]', err.message));
  pageDesktop.on('requestfailed', (req) => console.log('[REQ FAILED]', req.url(), req.failure()?.errorText));

  await pageDesktop.goto(`http://${HOST}:${PORT}/gestion`);
  await pageDesktop.waitForTimeout(1500);
  console.log('[QA DEBUG] Current URL:', pageDesktop.url());
  const bodyText = await pageDesktop.innerText('body');
  console.log('[QA DEBUG] Body Text:', bodyText.substring(0, 300));
  await pageDesktop.waitForSelector('.pedidos-linear-filter-shelf');

  // Click pestaña Finalizados
  await pageDesktop.click('button:has-text("Finalizados")');
  await pageDesktop.waitForSelector('.pedidos-terminal-grid');
  await pageDesktop.waitForTimeout(600);

  const screenshot1 = path.join(outputDir, 'qa_cam03_01_finalizados_desktop_default_1440x900.png');
  await pageDesktop.screenshot({ path: screenshot1, fullPage: false });
  console.log(`[QA] Guardado: ${screenshot1}`);

  // =========================================================================
  // CAPTURA 2: Desktop 1440x900 - Filtros Combinados Aplicados y Limpiar Filtros
  // =========================================================================
  console.log('[QA] Capturando 2: Desktop Finalizados Filtros Combinados...');
  // Filtrar por categoría Diseño Gráfico
  await pageDesktop.selectOption('select[aria-label="Filtrar por categoría"]', 'cat-diseno');
  // Configurar rango de fechas
  await pageDesktop.fill('input[aria-label="Fecha desde"]', '2026-10-01');
  await pageDesktop.fill('input[aria-label="Fecha hasta"]', '2026-10-10');
  await pageDesktop.waitForTimeout(400);

  const screenshot2 = path.join(outputDir, 'qa_cam03_02_finalizados_desktop_filtered_1440x900.png');
  await pageDesktop.screenshot({ path: screenshot2, fullPage: false });
  console.log(`[QA] Guardado: ${screenshot2}`);

  // Restablecer filtros
  await pageDesktop.click('button:has-text("Limpiar filtros")');
  await pageDesktop.waitForTimeout(300);

  // =========================================================================
  // CAPTURA 3: Desktop 1440x900 - Vista Tabla en Finalizados
  // =========================================================================
  console.log('[QA] Capturando 3: Desktop Finalizados Vista Tabla...');
  await pageDesktop.click('button:has-text("Tabla")');
  await pageDesktop.waitForSelector('.pedidos-gestion-table');
  await pageDesktop.waitForTimeout(400);

  const screenshot3 = path.join(outputDir, 'qa_cam03_03_finalizados_desktop_table_1440x900.png');
  await pageDesktop.screenshot({ path: screenshot3, fullPage: false });
  console.log(`[QA] Guardado: ${screenshot3}`);

  await contextDesktop.close();

  // =========================================================================
  // CAPTURA 4: Mobile 390x844 - Vista Finalizados Responsive (Tarjetas)
  // =========================================================================
  console.log('[QA] Capturando 4: Mobile Finalizados Responsive (390x844)...');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await mockSession(contextMobile);
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto(`http://${HOST}:${PORT}/gestion`);
  await pageMobile.waitForSelector('.pedidos-linear-filter-shelf');

  // Click pestaña Finalizados
  await pageMobile.click('button:has-text("Finalizados")');
  await pageMobile.waitForSelector('.pedidos-terminal-grid');
  await pageMobile.waitForTimeout(600);

  const screenshot4 = path.join(outputDir, 'qa_cam03_04_finalizados_mobile_390x844.png');
  await pageMobile.screenshot({ path: screenshot4, fullPage: false });
  console.log(`[QA] Guardado: ${screenshot4}`);

  // =========================================================================
  // CAPTURA 5: Mobile 390x844 - Vista Tabla Responsive
  // =========================================================================
  console.log('[QA] Capturando 5: Mobile Finalizados Vista Tabla (390x844)...');
  await pageMobile.click('button:has-text("Tabla")');
  await pageMobile.waitForSelector('.pedidos-gestion-table');
  await pageMobile.waitForTimeout(400);

  const screenshot5 = path.join(outputDir, 'qa_cam03_05_finalizados_mobile_table_390x844.png');
  await pageMobile.screenshot({ path: screenshot5, fullPage: false });
  console.log(`[QA] Guardado: ${screenshot5}`);

  await contextMobile.close();
  await browser.close();
  server.close();
  console.log('[QA] Todas las capturas visuales fueron generadas con éxito.');
}

main().catch((err) => {
  console.error('[QA ERROR]', err);
  process.exit(1);
});
