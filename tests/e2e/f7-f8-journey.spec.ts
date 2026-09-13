import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — E2E Journey F7 Seguimiento Público (48h/Exchange) y F8 Gestión Interna', () => {
  test.beforeEach(async ({ page }) => {
    // Inject development configuration
    await page.addInitScript(() => {
      window.__PEDIDOS_CONFIG__ = {
        supabaseUrl: 'http://127.0.0.1:54351',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        environment: 'development',
        basePath: '/formulariomedios',
      };
    });
  });

  test('F7: Vista de Seguimiento Público, Modal de Recuperación y Canje de Token Temporal', async ({ page }) => {
    // Mock recovery edge function response
    await page.route('**/functions/v1/tracking-recover', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Si existen pedidos activos asociados a este correo, se enviaron los enlaces de seguimiento.',
        }),
      });
    });

    await page.goto('/formulariomedios/seguimiento');

    // 1. Verificar presencia de campos de consulta
    await expect(page.locator('#input-ped')).toBeVisible();
    await expect(page.locator('#input-token')).toBeVisible();

    // 2. Abrir Modal de Recuperación
    await page.click('text=¿Olvidó su token de seguimiento?');
    await expect(page.locator('text=Recuperar Acceso a Seguimiento')).toBeVisible();
    await expect(page.locator('#recovery-email')).toBeVisible();

    // 3. Probar envío de correo de recuperación anti-enumeración
    await page.fill('#recovery-email', 'solicitante.test@tdf.gob.ar');
    await page.click('button:has-text("Solicitar Enlace")');
    await expect(page.locator('body')).toContainText('Si existen pedidos activos asociados a este correo');

    // Cerrar modal
    await page.click('button:has-text("Cerrar")');

    // 4. Probar Modal de Canje de Token Temporal
    await page.click('button:has-text("Canjear enlace de recuperación")');
    await expect(page.locator('h3:has-text("Canjear Enlace de Recuperación")')).toBeVisible();
    await expect(page.locator('#exchange-token-input')).toBeVisible();
  });

  test('F7: Vista de Solicitud de Información Faltante con Aviso de Vigencia de 48 Horas Corridas', async ({ page }) => {
    // 1. Acceso sin token -> muestra aviso de token faltante
    await page.goto('/formulariomedios/solicitud-informacion');
    await expect(page.locator('body')).toContainText('No se proporcionó un token de solicitud de información');

    // 2. Mock valid info request token
    await page.route('**/functions/v1/info-token-validate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          responded: false,
          solicitud: {
            id: 's0000000-0000-0000-0000-000000000111',
            pedido_visible: 'PED-2026-D000999',
            categoria_nombre: 'Diseño Gráfico',
            tipo_nombre: 'Flyer RRSS',
            mensaje: 'Por favor adjuntar logo en formato PNG o SVG de alta resolución.',
            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          },
        }),
      });
    });

    await page.goto('/formulariomedios/solicitud-informacion?token=valid_test_token_123');
    await expect(page.locator('body')).toContainText('Información Faltante Requerida');
    await expect(page.locator('body')).toContainText('PED-2026-D000999');
    await expect(page.locator('body')).toContainText('REQUERIMIENTO DEL EQUIPO OPERATIVO:');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button:has-text("Enviar Respuesta")')).toBeVisible();
  });

  test('F8: Dashboard de Gestión Interna — Cambio de Vistas (Kanban / Tabla) y Filtros', async ({ page }) => {
    // Mock pedidos list response
    await page.route('**/rest/v1/pedidos*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'a0000000-0000-0000-0000-000000000999',
            pedido_visible: 'PED-2026-D000999',
            anio: 2026,
            numero: 999,
            codigo_categoria: 'D',
            estado: 'Nuevo',
            categoria_id: 'cat-1',
            tipo_servicio_id: 'tipo-1',
            responsable_user_id: null,
            informacion_especifica: {},
            version: 1,
            archivado: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            categorias_servicio: { nombre: 'Diseño Gráfico' },
            tipos_servicio: { nombre: 'Flyer RRSS' },
            usuarios_acceso: null,
          },
          {
            id: 'a0000000-0000-0000-0000-000000000998',
            pedido_visible: 'PED-2026-D000998',
            anio: 2026,
            numero: 998,
            codigo_categoria: 'D',
            estado: 'Esperando información',
            categoria_id: 'cat-1',
            tipo_servicio_id: 'tipo-1',
            responsable_user_id: 'u-1',
            informacion_especifica: {},
            version: 2,
            archivado: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            categorias_servicio: { nombre: 'Diseño Gráfico' },
            tipos_servicio: { nombre: 'Flyer RRSS' },
            usuarios_acceso: { nombre: 'Ana', apellido: 'Operadora' },
          },
        ]),
      });
    });

    await page.goto('/formulariomedios/gestion');

    // 1. Verificar cabecera principal y métricas
    await expect(page.locator('body')).toContainText('Gestión Interna de Pedidos');
    await expect(page.locator('text=Total Listados')).toBeVisible();

    // 2. Verificar que las columnas Kanban están presentes
    await expect(page.locator('text=PED-2026-D000999')).toBeVisible();

    // 3. Cambiar a Vista Tabla
    await page.click('button:has-text("Vista Tabla")');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Código PED")')).toBeVisible();
    await expect(page.locator('th:has-text("Categoría / Tipo")')).toBeVisible();
    await expect(page.locator('th:has-text("Estado")')).toBeVisible();
    await expect(page.locator('td:has-text("PED-2026-D000999")')).toBeVisible();

    // 4. Cambiar de nuevo a Tablero Kanban
    await page.click('button:has-text("Tablero Kanban")');

    // 5. Interactuar con las pestañas de filtrado
    await page.click('button:has-text("Requieren Atención")');
    await page.click('button:has-text("Sin Asignar")');
    await page.click('button:has-text("Archivados")');
    await page.click('button:has-text("Todos")');
  });
});
