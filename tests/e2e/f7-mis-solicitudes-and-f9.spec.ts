import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — E2E Journey F7 Mis Solicitudes por Correo y F9 Acciones de Gestión', () => {
  test.beforeEach(async ({ page }) => {
    // Inject local config
    await page.addInitScript(() => {
      window.__PEDIDOS_CONFIG__ = {
        supabaseUrl: 'http://127.0.0.1:54351',
        supabaseAnonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        environment: 'development',
        basePath: '/formulariomedios',
      };
    });
  });

  test('F7: Portal Ciudadano "Mis Solicitudes" — Solicitud de acceso anti-enumeración', async ({ page }) => {
    // Mock access request endpoint
    await page.route('**/functions/v1/solicitante-access-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Si existen solicitudes asociadas a este correo electrónico, recibirá un enlace seguro para acceder.',
        }),
      });
    });

    await page.goto('/formulariomedios/mis-solicitudes');

    // Verify title and input
    await expect(page.locator('h1:has-text("Mis Solicitudes")')).toBeVisible();
    await expect(page.locator('h2:has-text("Ingreso sin Contraseña")')).toBeVisible();
    await expect(page.locator('input#solicitante-email')).toBeVisible();

    // Fill email and request access
    await page.fill('input#solicitante-email', 'ciudadano.test@tdf.gob.ar');
    await page.click('button:has-text("Recibir Enlace Seguro de Acceso")');

    // Verify neutral feedback
    await expect(page.locator('body')).toContainText('Si existen solicitudes asociadas a este correo electrónico');
  });

  test('F7: Canje de Magic Link, Sesión Activa, Listado Multi-PED y Detalle Sanitizado', async ({ page }) => {
    // Mock token exchange
    await page.route('**/functions/v1/solicitante-session-exchange', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session_token: 'mock_session_token_xyz_1234567890',
          correo: 'ciudadano.verificado@tdf.gob.ar',
          expires_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        }),
      });
    });

    // Mock pedidos list
    await page.route('**/functions/v1/solicitante-pedidos-list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          correo: 'ciudadano.verificado@tdf.gob.ar',
          total: 2,
          pedidos: [
            {
              id: 'a0000000-0000-0000-0000-000000000901',
              pedido_visible: 'PED-2026-D000901',
              anio: 2026,
              numero: 901,
              codigo_categoria: 'D',
              categoria_nombre: 'Diseño Gráfico',
              tipo_nombre: 'Flyer Digital',
              estado: 'En proceso',
              created_at: new Date().toISOString(),
              solicitudes_pendientes_count: 1,
              tiene_entrega: false,
            },
            {
              id: 'a0000000-0000-0000-0000-000000000902',
              pedido_visible: 'PED-2026-D000902',
              anio: 2026,
              numero: 902,
              codigo_categoria: 'D',
              categoria_nombre: 'Diseño Gráfico',
              tipo_nombre: 'Folletería',
              estado: 'Finalizado',
              created_at: new Date().toISOString(),
              solicitudes_pendientes_count: 0,
              tiene_entrega: true,
            },
          ],
        }),
      });
    });

    // Mock pedido detail
    await page.route('**/functions/v1/solicitante-pedido-detail', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          id: 'a0000000-0000-0000-0000-000000000901',
          pedido_visible: 'PED-2026-D000901',
          anio: 2026,
          numero: 901,
          codigo_categoria: 'D',
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Flyer Digital',
          estado: 'En proceso',
          created_at: new Date().toISOString(),
          solicitante: {
            nombre_apellido: 'Ciudadano Verificado',
            area_solicitante: 'Secretaría de Cultura',
            correo: 'ciudadano.verificado@tdf.gob.ar',
            telefono: '+5492901445566',
          },
          solicitudes_informacion: [
            {
              id: 's0000000-0000-0000-0000-000000000901',
              mensaje: 'Adjuntar logo vectorial oficial',
              estado: 'pendiente',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            },
          ],
          comunicaciones: [],
          entrega: null,
          historial_publico: [
            { evento: 'pedido.created', descripcion: 'Pedido registrado en el sistema', created_at: new Date().toISOString() },
            { evento: 'pedido.assigned', descripcion: 'Pedido asignado al equipo técnico', created_at: new Date().toISOString() },
          ],
        }),
      });
    });

    // Land with magic token
    await page.goto('/formulariomedios/mis-solicitudes?token=mock_magic_token_123');

    // Verify authenticated state
    await expect(page.locator('body')).toContainText('Sesión Verificada');
    await expect(page.locator('body')).toContainText('ciudadano.verificado@tdf.gob.ar');

    // Verify PED list
    await expect(page.locator('body')).toContainText('PED-2026-D000901');
    await expect(page.locator('body')).toContainText('PED-2026-D000902');
    await expect(page.locator('body')).toContainText('En Proceso');

    // Click on PED-2026-D000901 to view details
    await page.click('button:has-text("Ver Detalle")');

    // Verify detail pane
    await expect(page.locator('h2:has-text("PED-2026-D000901")')).toBeVisible();
    await expect(page.locator('body')).toContainText('Adjuntar logo vectorial oficial');
    await expect(page.locator('body')).toContainText('48 Horas Corridas');
  });

  test('F9: Detalle Operativo — Acciones de Finalización, Cancelación y Reapertura', async ({ page }) => {
    // Mock user auth
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000101',
          email: 'admin@tdf.gob.ar',
          aud: 'authenticated',
          role: 'authenticated',
        }),
      });
    });

    // Mock usuario_acceso
    await page.route('**/rest/v1/usuarios_acceso*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: '00000000-0000-0000-0000-000000000101',
            nombre: 'Admin',
            apellido: 'Test',
            nombre_usuario: 'admin.test',
            app_role: 'administrador',
            estado_acceso: 'aprobado',
          },
        ]),
      });
    });

    // Mock pedido detail
    await page.route('**/rest/v1/pedidos*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'a0000000-0000-0000-0000-000000000999',
          pedido_visible: 'PED-2026-D000999',
          anio: 2026,
          numero: 999,
          codigo_categoria: 'D',
          estado: 'En proceso',
          version: 3,
          archivado: false,
          responsable_user_id: '00000000-0000-0000-0000-000000000101',
          informacion_especifica: { tema: 'Banner Digital' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          envios_formulario: {
            id: 'e0000000-0000-0000-0000-000000000999',
            correo: 'solicitante@tdf.gob.ar',
            nombre_apellido: 'Solicitante Test',
            telefono: '2901112233',
            area_solicitante: 'Cultura',
          },
          categorias_servicio: { nombre: 'Diseño Gráfico' },
          tipos_servicio: { nombre: 'Flyer Digital' },
          usuarios_acceso: { nombre: 'Admin', apellido: 'Test' },
        }),
      });
    });

    // Mock subqueries
    await page.route('**/rest/v1/pedido_asignaciones*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/notas_pedido*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/solicitudes_informacion*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/archivo_pedido*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/enlace_pedido*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/entregas_pedido*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/rpc/pedido_get_historial*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/formulariomedios/gestion/pedido/a0000000-0000-0000-0000-000000000999');

    // Verify F9 Action buttons exist on action bar
    await expect(page.locator('button:has-text("Finalizar Pedido")')).toBeVisible();
    await expect(page.locator('button:has-text("✕ Cancelar")')).toBeVisible();

    // 1. Test Finalize Modal
    await page.click('button:has-text("Finalizar Pedido")');
    await expect(page.locator('h3:has-text("Finalizar Pedido y Registrar Entrega")')).toBeVisible();
    await expect(page.locator('input[placeholder*="drive.google.com"]')).toBeVisible();

    // Close finalize modal by clicking its Cancel button inside the modal
    await page.click('form button:has-text("Cancelar")');
    await expect(page.locator('h3:has-text("Finalizar Pedido y Registrar Entrega")')).not.toBeVisible();

    // 2. Test Cancel Modal
    await page.click('button:has-text("✕ Cancelar")');
    await expect(page.locator('h3:has-text("Cancelar Pedido")')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="motivo"]')).toBeVisible();

    // Close cancel modal
    await page.click('form button:has-text("Cerrar")');
    await expect(page.locator('h3:has-text("Cancelar Pedido")')).not.toBeVisible();
  });
});
