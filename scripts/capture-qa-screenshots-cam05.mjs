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

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[SERVER] Standalone listo en http://${HOST}:${PORT}`);

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

  const syntheticActivePedidos = [
    {
      id: 'ped-act-01',
      pedido_visible: 'PED-2026-D000010',
      anio: 2026,
      numero: 10,
      codigo_categoria: 'D',
      estado: 'Nuevo',
      origen: 'publico',
      titulo: 'Campaña Invierno Ushuaia — Banner Digital',
      categoria_id: 'cat-diseno',
      categoria_nombre: 'Diseño Gráfico',
      tipo_servicio_id: 'tipo-flyer',
      tipo_nombre: 'Flyer Digital',
      responsable_user_id: '11111111-1111-4111-a111-111111111111',
      responsable_nombre: 'Valeria Gómez',
      solicitante_nombre: 'Martín Cabrera',
      area_solicitante: 'Secretaría de Turismo',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-11-03T10:00:00.000Z',
      finalizado_at: null,
      updated_at: '2026-11-03T10:00:00.000Z',
      prioridad: 'alta',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Diseño Gráfico' },
      tipos_servicio: { nombre: 'Flyer Digital' },
      envios_formulario: { id: 'env-10', nombre_apellido: 'Martín Cabrera', area_solicitante: 'Secretaría de Turismo' },
      pedido_etiquetas: [{ id: 'tag-1', texto: 'Urgente', color: 'rojo', created_at: '2026-11-03T10:05:00Z' }],
      pedido_versiones: [],
    },
    {
      id: 'ped-act-02',
      pedido_visible: 'PED-2026-P000011',
      anio: 2026,
      numero: 11,
      codigo_categoria: 'P',
      estado: 'En proceso',
      origen: 'interno',
      titulo: 'Gacetilla Obras Viales Puente Río Grande',
      categoria_id: 'cat-prensa',
      categoria_nombre: 'Prensa',
      tipo_servicio_id: 'tipo-gacetilla',
      tipo_nombre: 'Gacetilla',
      responsable_user_id: '11111111-1111-4111-a111-111111111111',
      responsable_nombre: 'Valeria Gómez',
      solicitante_nombre: 'Santiago Morales',
      area_solicitante: 'Ministerio de Obras Públicas',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-11-03T09:30:00.000Z',
      finalizado_at: null,
      updated_at: '2026-11-03T10:15:00.000Z',
      prioridad: 'media',
      revision_count: 0,
      retrabajo_activo: false,
      categorias_servicio: { nombre: 'Prensa' },
      tipos_servicio: { nombre: 'Gacetilla' },
      envios_formulario: { id: 'env-11', nombre_apellido: 'Santiago Morales', area_solicitante: 'Ministerio de Obras Públicas' },
      pedido_etiquetas: [],
      pedido_versiones: [],
    },
  ];

  // 45 synthetic pedidos finalizados to test pagination preservation across page 2
  const syntheticFinalizados = Array.from({ length: 45 }, (_, idx) => ({
    id: `ped-fin-${idx + 1}`,
    pedido_visible: `PED-2026-F${String(idx + 1).padStart(5, '0')}`,
    anio: 2026,
    numero: idx + 1,
    codigo_categoria: 'F',
    estado: 'Finalizado',
    origen: 'publico',
    titulo: `Entrega Finalizada de Servicio Nº ${idx + 1}`,
    categoria_id: 'cat-diseno',
    categoria_nombre: 'Diseño Gráfico',
    tipo_servicio_id: 'tipo-flyer',
    tipo_nombre: 'Flyer Digital',
    responsable_user_id: '11111111-1111-4111-a111-111111111111',
    responsable_nombre: 'Valeria Gómez',
    solicitante_nombre: 'Solicitante Provincial',
    area_solicitante: 'Gobierno TDF',
    informacion_especifica: {},
    version: 1,
    archivado: false,
    created_at: new Date(Date.now() - (idx + 1) * 3600000).toISOString(),
    finalizado_at: new Date(Date.now() - (idx + 1) * 1800000).toISOString(),
    updated_at: new Date(Date.now() - (idx + 1) * 1800000).toISOString(),
    prioridad: 'normal',
    revision_count: 1,
    retrabajo_activo: false,
    categorias_servicio: { nombre: 'Diseño Gráfico' },
    tipos_servicio: { nombre: 'Flyer Digital' },
    envios_formulario: { id: `env-f-${idx + 1}`, nombre_apellido: 'Solicitante Provincial', area_solicitante: 'Gobierno TDF' },
    pedido_etiquetas: [],
    pedido_versiones: [{ id: `pv-f-${idx + 1}`, version_number: 1, finalizado_at: new Date(Date.now() - (idx + 1) * 1800000).toISOString() }],
  }));

  let currentActivePedidos = [...syntheticActivePedidos];
  let delayNextFetchMs = 0;
  let failNextFetch = false;

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
            total: currentActivePedidos.length + syntheticFinalizados.length,
            nuevos: currentActivePedidos.filter(p => p.estado === 'Nuevo').length,
            enRevision: 0,
            enProceso: currentActivePedidos.filter(p => p.estado === 'En proceso').length,
            esperandoInfo: 0,
            finalizados: syntheticFinalizados.length,
            cancelados: 0,
            sinAsignar: 0,
            archivados: 0,
          }),
        });
      }

      if (url.includes('/usuarios_internos')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'ui-1', user_id: mockAdminUser.id, nombre: 'Valeria', apellido: 'Gómez', email: mockAdminUser.email, rol: 'administrador', activo: true },
            { id: 'ui-2', user_id: '22222222-2222-4222-a222-222222222222', nombre: 'Santiago', apellido: 'Morales', email: 'smorales@tdf.gob.ar', rol: 'equipo', activo: true },
          ]),
        });
      }

      if (url.includes('/categorias_servicio')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'cat-diseno', nombre: 'Diseño Gráfico', codigo_ped: 'D', orden: 1 },
            { id: 'cat-prensa', nombre: 'Prensa', codigo_ped: 'P', orden: 2 },
          ]),
        });
      }

      if (url.includes('/tipos_servicio')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'tipo-flyer', categoria_id: 'cat-diseno', nombre: 'Flyer Digital', orden: 1 },
            { id: 'tipo-gacetilla', categoria_id: 'cat-prensa', nombre: 'Gacetilla', orden: 2 },
          ]),
        });
      }

      if (url.includes('/pedidos')) {
        if (delayNextFetchMs > 0) {
          await new Promise((r) => setTimeout(r, delayNextFetchMs));
        }
        if (failNextFetch) {
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Error de conexión simulado' }),
          });
        }

        if (url.includes('estado=eq.Finalizado')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'content-range': `0-${syntheticFinalizados.length - 1}/${syntheticFinalizados.length}` },
            body: JSON.stringify(syntheticFinalizados),
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${currentActivePedidos.length - 1}/${currentActivePedidos.length}` },
          body: JSON.stringify(currentActivePedidos),
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
  // TEST SUITE: DESKTOP (1440x900)
  // =========================================================================
  console.log('[QA] Iniciando suite Desktop 1440x900...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await mockSession(desktopContext);
  const desktopPage = await desktopContext.newPage();

  // 1. Carga inicial
  await desktopPage.goto(`http://${HOST}:${PORT}/gestion`);
  await desktopPage.waitForSelector('.pedidos-linear-filter-shelf');
  await desktopPage.waitForSelector('text=PED-2026-D000010');
  console.log('[QA] Desktop: Tablero Kanban inicial cargado exitosamente.');
  await desktopPage.screenshot({
    path: path.join(outputDir, 'qa_cam05_01_desktop_tablero_kanban_1440x900.png'),
    fullPage: false,
  });

  // 2. Refresco en segundo plano en vuelo (latencia de red 1.5s):
  // Comprobar que mientras el fetch corre, las tarjetas NO desaparecen ni se muestra spinner
  delayNextFetchMs = 1500;
  console.log('[QA] Desktop: Disparando evento focus con latencia de 1.5s para capturar estado en vuelo...');
  await desktopPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  // Esperar 200ms para asegurar que el fetch ya arrancó
  await desktopPage.waitForTimeout(200);

  // Aserciones en vivo durante el refresco:
  const isSpinnerVisible = await desktopPage.evaluate(() => {
    return document.body.innerText.includes('🔄') || document.body.innerText.includes('Cargando pedidos...');
  });
  const areCardsVisible = await desktopPage.evaluate(() => {
    return document.body.innerText.includes('PED-2026-D000010') && document.body.innerText.includes('PED-2026-P000011');
  });

  console.log(`[QA] Desktop en vuelo -> Spinner visible: ${isSpinnerVisible} (esperado: false), Tarjetas visibles: ${areCardsVisible} (esperado: true)`);
  if (isSpinnerVisible || !areCardsVisible) {
    throw new Error('Fallo crítico de CAM-05: Se detectó parpadeo o desmontaje de tarjetas durante el refresco');
  }

  await desktopPage.screenshot({
    path: path.join(outputDir, 'qa_cam05_02_desktop_silent_refresh_in_flight_1440x900.png'),
    fullPage: false,
  });

  // Esperar que termine el fetch diferido
  await desktopPage.waitForTimeout(1600);
  delayNextFetchMs = 0;

  // 3. Simulación de nuevo pedido entrante por Realtime / Online sin parpadeo
  const newIncomingPedido = {
    id: 'ped-act-03',
    pedido_visible: 'PED-2026-D000012',
    anio: 2026,
    numero: 12,
    codigo_categoria: 'D',
    estado: 'Nuevo',
    origen: 'publico',
    titulo: 'Nueva Solicitud Entrante Realtime — Folleto Digital',
    categoria_id: 'cat-diseno',
    categoria_nombre: 'Diseño Gráfico',
    tipo_servicio_id: 'tipo-flyer',
    tipo_nombre: 'Flyer Digital',
    responsable_user_id: '11111111-1111-4111-a111-111111111111',
    responsable_nombre: 'Valeria Gómez',
    solicitante_nombre: 'Clara Fernández',
    area_solicitante: 'Secretaría de Cultura',
    informacion_especifica: {},
    version: 1,
    archivado: false,
    created_at: new Date().toISOString(),
    finalizado_at: null,
    updated_at: new Date().toISOString(),
    prioridad: 'alta',
    revision_count: 0,
    retrabajo_activo: false,
    categorias_servicio: { nombre: 'Diseño Gráfico' },
    tipos_servicio: { nombre: 'Flyer Digital' },
    envios_formulario: { id: 'env-12', nombre_apellido: 'Clara Fernández', area_solicitante: 'Secretaría de Cultura' },
    pedido_etiquetas: [{ id: 'tag-new', texto: 'Nuevo', color: 'verde', created_at: new Date().toISOString() }],
    pedido_versiones: [],
  };
  currentActivePedidos = [newIncomingPedido, ...currentActivePedidos];

  console.log('[QA] Desktop: Disparando evento online / realtime...');
  await desktopPage.evaluate(() => window.dispatchEvent(new Event('online')));
  await desktopPage.waitForSelector('text=PED-2026-D000012', { timeout: 3000 });
  console.log('[QA] Desktop: Nuevo pedido incorporado silenciosamente al tablero sin parpadeo.');
  await desktopPage.screenshot({
    path: path.join(outputDir, 'qa_cam05_03_desktop_focus_and_realtime_updated_1440x900.png'),
    fullPage: false,
  });

  // 4. Vista Finalizados: navegar a página 2 y comprobar conservación de paginación tras refresco silencioso
  console.log('[QA] Desktop: Navegando a pestaña Finalizados...');
  const finalizadosBtn = desktopPage.locator('button:has-text("Finalizados")');
  await finalizadosBtn.click();
  await desktopPage.waitForSelector('text=PED-2026-F00001');

  // Navegar a página 2
  const nextBtn = desktopPage.locator('button:has-text("Siguiente")');
  await nextBtn.click();
  await desktopPage.waitForSelector('text=Página 2 de');
  console.log('[QA] Desktop: En página 2 de Finalizados.');

  // Disparar refresco por foco silencioso:
  await desktopPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await desktopPage.waitForTimeout(500);

  const pageTextAfterRefresh = await desktopPage.locator('.pedidos-table-pagination-info').first().innerText();
  console.log(`[QA] Desktop: Indicador de paginación tras refresco silencioso: "${pageTextAfterRefresh}"`);
  if (!pageTextAfterRefresh.includes('Página 2')) {
    throw new Error(`Fallo en CAM-05: El refresco silencioso reinició la paginación a la página 1! Obtenido: ${pageTextAfterRefresh}`);
  }

  await desktopPage.screenshot({
    path: path.join(outputDir, 'qa_cam05_04_desktop_finalizados_page2_preserved_1440x900.png'),
    fullPage: false,
  });

  // 5. Resiliencia ante error de red en segundo plano
  console.log('[QA] Desktop: Simulando error 500 en refresco silencioso...');
  failNextFetch = true;
  await desktopPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await desktopPage.waitForTimeout(600);
  failNextFetch = false;

  // Comprobar que la tabla/grilla sigue visible y no hay cartel de error invasivo
  const hasErrorBanner = await desktopPage.locator('text=No se pudieron cargar las solicitudes del sistema').isVisible();
  const tableStillVisible = await desktopPage.locator('.pedidos-terminal-grid, .pedidos-table-wrapper, table').first().isVisible();
  console.log(`[QA] Desktop tras fallo de red silencioso -> Banner de error visible: ${hasErrorBanner} (esperado: false), Tabla visible: ${tableStillVisible} (esperado: true)`);
  if (hasErrorBanner || !tableStillVisible) {
    throw new Error('Fallo en CAM-05: Un error de red silencioso reemplazó la interfaz visible');
  }

  await desktopPage.screenshot({
    path: path.join(outputDir, 'qa_cam05_05_desktop_network_error_resilience_1440x900.png'),
    fullPage: false,
  });

  await desktopContext.close();

  // =========================================================================
  // TEST SUITE: MOBILE (390x844 - iPhone 14 / Viewport oficial)
  // =========================================================================
  console.log('[QA] Iniciando suite Móvil 390x844...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await mockSession(mobileContext);
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto(`http://${HOST}:${PORT}/gestion`);
  await mobilePage.waitForSelector('.pedidos-linear-filter-shelf');
  await mobilePage.waitForSelector('text=PED-2026-D000010');
  console.log('[QA] Móvil: Tablero Kanban inicial cargado.');
  await mobilePage.screenshot({
    path: path.join(outputDir, 'qa_cam05_06_mobile_tablero_kanban_390x844.png'),
    fullPage: false,
  });

  // Disparar refresco silencioso en móvil con latencia
  delayNextFetchMs = 800;
  await mobilePage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await mobilePage.waitForTimeout(200);

  const mobileSpinnerVisible = await mobilePage.evaluate(() => {
    return document.body.innerText.includes('🔄') || document.body.innerText.includes('Cargando pedidos...');
  });
  const mobileCardsVisible = await mobilePage.evaluate(() => {
    return document.body.innerText.includes('PED-2026-D000010');
  });

  console.log(`[QA] Móvil en vuelo -> Spinner: ${mobileSpinnerVisible} (esperado: false), Tarjetas: ${mobileCardsVisible} (esperado: true)`);
  if (mobileSpinnerVisible || !mobileCardsVisible) {
    throw new Error('Fallo crítico en móvil CAM-05: Se detectó parpadeo');
  }

  await mobilePage.waitForTimeout(800);
  delayNextFetchMs = 0;

  await mobilePage.screenshot({
    path: path.join(outputDir, 'qa_cam05_07_mobile_silent_refresh_preserved_390x844.png'),
    fullPage: false,
  });

  await mobileContext.close();
  await browser.close();
  server.close();
  console.log('[QA] ¡Suite Playwright de CAM-05 completada con éxito rotundo!');
}

main().catch((err) => {
  console.error('[QA] Error crítico en prueba Playwright CAM-05:', err);
  process.exit(1);
});
