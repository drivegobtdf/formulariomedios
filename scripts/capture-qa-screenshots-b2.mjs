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

const PORT = 4188;
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
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERR:', err));

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
    id: 'usr-b2-test-01',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'agustin.perez@tierradelfuego.gob.ar',
    user_metadata: {
      nombre: 'Agustín',
      apellido: 'Pérez',
      nombre_usuario: 'aperez',
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
    user_id: 'usr-b2-test-01',
    nombre: 'Agustín',
    apellido: 'Pérez',
    nombre_usuario: 'aperez',
    estado_acceso: 'aprobado',
    app_role: 'equipo',
    solicitado_at: new Date().toISOString(),
    aprobado_at: new Date().toISOString(),
  };

  const mockNotifications = [
    {
      id: 'notif-1',
      user_id: 'usr-b2-test-01',
      pedido_id: 'ped-101',
      tipo: 'pedido_asignado',
      actor_user_id: 'usr-admin-01',
      read_at: null,
      metadata: {
        pedido_visible: 'PED-2026-0042',
        section: 'header',
        mensaje_resumen: 'Te asignaron el pedido PED-2026-0042',
      },
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-2',
      user_id: 'usr-b2-test-01',
      pedido_id: 'ped-102',
      tipo: 'nota_creada',
      actor_user_id: 'usr-team-02',
      read_at: null,
      metadata: {
        pedido_visible: 'PED-2026-0039',
        section: 'notas',
        actor_nombre: 'Mariana López',
        mensaje_resumen: 'Mariana López dejó una nota interna en PED-2026-0039',
      },
      created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-3',
      user_id: 'usr-b2-test-01',
      pedido_id: 'ped-103',
      tipo: 'retrabajo_solicitado',
      actor_user_id: null,
      read_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      metadata: {
        pedido_visible: 'PED-2026-0035',
        section: 'revision',
        revision_number: 1,
        mensaje_resumen: 'PED-2026-0035 fue devuelto para retrabajar · Rev #1',
      },
      created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    },
  ];

  const mockPedidos = [
    {
      id: 'ped-101',
      pedido_visible: 'PED-2026-0042',
      titulo: 'Campaña Invierno 2026',
      categoria_nombre: 'Diseño Gráfico',
      tipo_nombre: 'Flyer Digital',
      estado: 'Nuevo',
      prioridad: 'alta',
      etiqueta_interna: 'URGENTE',
      retrabajo_activo: false,
      responsable_nombre: 'Agustín Pérez',
      solicitante_nombre: 'Clara Domínguez',
      area_solicitante: 'Ministerio de Turismo',
      created_at: new Date().toISOString(),
      version: 1,
      archivado: false,
    },
    {
      id: 'ped-102',
      pedido_visible: 'PED-2026-0039',
      titulo: 'Spot Radial Anuncio Oficial',
      categoria_nombre: 'Prensa',
      tipo_nombre: 'Comunicado Radial',
      estado: 'En proceso',
      prioridad: 'media',
      etiqueta_interna: null,
      retrabajo_activo: false,
      responsable_nombre: 'Agustín Pérez',
      solicitante_nombre: 'Esteban Morales',
      area_solicitante: 'Secretaría de Gobierno',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      version: 1,
      archivado: false,
    },
    {
      id: 'ped-103',
      pedido_visible: 'PED-2026-0035',
      titulo: 'Cobertura Audiovisual Malvinas',
      categoria_nombre: 'Audiovisual',
      tipo_nombre: 'Cobertura Completa',
      estado: 'En proceso',
      prioridad: 'alta',
      etiqueta_interna: 'EVENTO',
      retrabajo_activo: true,
      revision_count: 1,
      responsable_nombre: 'Agustín Pérez',
      solicitante_nombre: 'Lucía Benítez',
      area_solicitante: 'Secretaría de Malvinas',
      created_at: new Date(Date.now() - 172800000).toISOString(),
      version: 2,
      archivado: false,
    },
  ];

  // Rutas mock de Supabase
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
      body: JSON.stringify(2),
    });
  });

  await page.route('**/rest/v1/notificaciones_usuario*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${mockNotifications.length - 1}/${mockNotifications.length}` },
      body: JSON.stringify(mockNotifications),
    });
  });

  await page.route('**/rest/v1/pedidos*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${mockPedidos.length - 1}/${mockPedidos.length}` },
      body: JSON.stringify(mockPedidos),
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
        sinAsignar: 0,
        archivados: 0,
      }),
    });
  });

  // Inject session into all potential localStorage keys
  await page.addInitScript(({ session, profile }) => {
    localStorage.setItem('pedidos:theme', 'light');
    const serializedSession = JSON.stringify(session);
    localStorage.setItem('sb-uwzgyirilafgnbpmrkic-auth-token', serializedSession);
    localStorage.setItem('sb-yqfkzgqvezarzhlwiilo-auth-token', serializedSession);
    localStorage.setItem('supabase.auth.token', serializedSession);
  }, { session: mockSession, profile: mockProfile });

  console.log('[PLAYWRIGHT] Navegando a /gestion...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // 1. CAPTURA: Header con Campana (badge 2) y Perfil de Usuario (Light)
  console.log('[PLAYWRIGHT] Capturando 01: Header con campana y perfil (Light)...');
  await page.screenshot({
    path: path.join(outputDir, 'b2_audit_01_header_light.png'),
    fullPage: false,
  });

  // 2. CAPTURA: Dropdown de notificaciones abierto
  console.log('[PLAYWRIGHT] Buscando botón de campana...');
  const bellButton = page.locator('button[title="Centro de notificaciones"]');
  const bellCount = await bellButton.count();
  if (bellCount > 0) {
    await bellButton.click();
    await page.waitForTimeout(500);
    console.log('[PLAYWRIGHT] Capturando 03: Dropdown de notificaciones...');
    await page.screenshot({
      path: path.join(outputDir, 'b2_audit_03_notifications_dropdown.png'),
    });
    await bellButton.click();
    await page.waitForTimeout(300);
  }

  // 3. CAPTURA: Menú de usuario y Modal de Mi Perfil
  console.log('[PLAYWRIGHT] Buscando botón de perfil...');
  const profileButton = page.locator('button[title="Opciones de perfil y sesión"]');
  const profileCount = await profileButton.count();
  if (profileCount > 0) {
    await profileButton.click();
    await page.waitForTimeout(300);

    const miPerfilOption = page.locator('button:has-text("Mi perfil")');
    if (await miPerfilOption.count() > 0) {
      await miPerfilOption.click();
      await page.waitForTimeout(500);
      console.log('[PLAYWRIGHT] Capturando 04: Modal de Mi Perfil...');
      await page.screenshot({
        path: path.join(outputDir, 'b2_audit_04_user_profile_modal.png'),
      });

      const closeBtn = page.locator('button[aria-label="Cerrar modal"]');
      if (await closeBtn.count() > 0) await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // Modal de Logout Global
    await profileButton.click();
    await page.waitForTimeout(300);
    const globalLogoutOption = page.locator('button:has-text("Cerrar sesión en todos los equipos")');
    if (await globalLogoutOption.count() > 0) {
      await globalLogoutOption.click();
      await page.waitForTimeout(500);
      console.log('[PLAYWRIGHT] Capturando 05: Modal de Logout Global...');
      await page.screenshot({
        path: path.join(outputDir, 'b2_audit_05_global_logout_modal.png'),
      });

      const cancelLogoutBtn = page.locator('button:has-text("Cancelar")');
      if (await cancelLogoutBtn.count() > 0) await cancelLogoutBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 4. CAPTURA: Página completa de notificaciones /gestion/notificaciones
  console.log('[PLAYWRIGHT] Navegando a /gestion/notificaciones...');
  await page.goto(`http://${HOST}:${PORT}/gestion/notificaciones`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('[PLAYWRIGHT] Capturando 06: Página completa de notificaciones...');
  await page.screenshot({
    path: path.join(outputDir, 'b2_audit_06_notificaciones_completas.png'),
  });

  // 5. CAPTURA: Dark Mode (Header Dark)
  console.log('[PLAYWRIGHT] Activando modo oscuro...');
  const themeToggle = page.locator('.pedidos-btn-theme-toggle');
  if (await themeToggle.count() > 0) {
    await themeToggle.click();
    await page.waitForTimeout(400);

    console.log('[PLAYWRIGHT] Capturando 02: Header en Dark Mode...');
    await page.screenshot({
      path: path.join(outputDir, 'b2_audit_02_header_dark.png'),
    });

    // Volver a Light Mode
    await themeToggle.click();
    await page.waitForTimeout(400);
  }

  // 6. CAPTURA: Kanban Cards con select de prioridad interactivo
  console.log('[PLAYWRIGHT] Navegando a /gestion para capturar Kanban Cards...');
  await page.goto(`http://${HOST}:${PORT}/gestion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('[PLAYWRIGHT] Capturando 07: Tablero Kanban y controles aislados de prioridad...');
  await page.screenshot({
    path: path.join(outputDir, 'b2_audit_07_card_prioridad_interactiva.png'),
  });

  // 7. CAPTURA: Responsive Tablet (768px)
  console.log('[PLAYWRIGHT] Cambiando viewport a 768px...');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(500);
  console.log('[PLAYWRIGHT] Capturando 08: Responsive Tablet (768px)...');
  await page.screenshot({
    path: path.join(outputDir, 'b2_audit_08_responsive_768px.png'),
  });

  // 8. CAPTURA: Responsive Mobile (~390px)
  console.log('[PLAYWRIGHT] Cambiando viewport a 390px...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  console.log('[PLAYWRIGHT] Capturando 09: Responsive Mobile (~390px)...');
  await page.screenshot({
    path: path.join(outputDir, 'b2_audit_09_responsive_mobile_390px.png'),
  });

  await browser.close();
  server.close();
  console.log('\n[SUCCESS] Todas las capturas de QA se guardaron exitosamente en:');
  console.log(outputDir);
}

main().catch((err) => {
  console.error('[ERROR]', err);
  server.close();
  process.exit(1);
});
