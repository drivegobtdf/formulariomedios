import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — Smoke Test E2E Local (Linear Redesign)', () => {
  test('1. Portada pública (/): renderiza portal ciudadano, wizard y footer', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    // Contenedor principal con layout público montado
    const root = page.locator('#pedidos-app');
    await expect(root).toBeVisible();

    const layout = root.locator('> .pedidos-app');
    await expect(layout).toBeVisible();
    await expect(layout).toHaveClass(/pedidos-app-public/);

    // Cabecera institucional y logo estándar (fondo claro en portal ciudadano)
    const brandLink = page.locator('.pedidos-header-brand-link');
    await expect(brandLink).toBeVisible();
    const logo = page.locator('.pedidos-header-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', /logo-gob-tdf/);

    // Formulario de nueva solicitud
    const formHeading = page.locator('h1, h2').first();
    await expect(formHeading).toBeVisible();

    // Footer institucional y política de privacidad
    const footer = page.locator('.pedidos-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Sistema PEDIDOS');
    await expect(footer).toContainText('Gobierno de Tierra del Fuego AIAS');
    const privacyLink = footer.locator('a[href="/privacidad"]');
    await expect(privacyLink).toBeVisible();
  });

  test('2. Acceso Interno / Login (/login): formulario institucional y navegación', async ({ page }) => {
    await page.goto('/login');

    // Layout interno
    const layout = page.locator('#pedidos-app > .pedidos-app');
    await expect(layout).toBeVisible();
    await expect(layout).toHaveClass(/pedidos-app-wide/);

    // Formulario de login
    const loginTitle = page.locator('h2').first();
    await expect(loginTitle).toContainText('Acceso de Personal Interno');

    // Campos de credenciales
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Botón de ingreso
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test('3. Mis Solicitudes (/mis-solicitudes): vista de seguimiento ciudadano', async ({ page }) => {
    await page.goto('/mis-solicitudes');

    // Layout específico de tracking
    const layout = page.locator('#pedidos-app > .pedidos-app');
    await expect(layout).toBeVisible();
    await expect(layout).toHaveClass(/pedidos-app-tracking/);
  });

  test('4. Acceso controlado a /gestion: barrera de autenticación no simulada', async ({ page }) => {
    await page.goto('/gestion');

    // Layout de gestión
    const layout = page.locator('#pedidos-app > .pedidos-app');
    await expect(layout).toBeVisible();
    await expect(layout).toHaveClass(/pedidos-app-wide/);

    // Barrera de seguridad estricta para usuarios sin autenticar
    await expect(page.locator('h2')).toContainText('Acceso restringido');
    await expect(page.locator('body')).toContainText('Iniciá sesión con una cuenta institucional autorizada.');

    // Botón de redirección hacia login
    const loginRedirectBtn = page.locator('button:has-text("Iniciar sesión")');
    await expect(loginRedirectBtn).toBeVisible();

    // Comprobar navegación segura al pulsar Iniciar sesión
    await loginRedirectBtn.click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h2').first()).toContainText('Acceso de Personal Interno');
  });

  test('5. Alternancia de Temas Linear (Dark Mode por defecto, Light Mode, logo y persistencia)', async ({ page }) => {
    await page.goto('/gestion');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const layout = page.locator('#pedidos-app > .pedidos-app');
    await expect(layout).toBeVisible();

    // 1. Por defecto en gestión el tema es Dark
    await expect(layout).toHaveAttribute('data-theme', 'dark');

    // Logo en modo oscuro: isotipo blanco institucional
    const darkLogo = page.locator('.pedidos-header-logo');
    await expect(darkLogo).toHaveAttribute('src', /GOB-TDF-BLANCO/);

    // Botón selector de tema en la cabecera
    const themeBtn = page.locator('.pedidos-btn-theme-toggle');
    await expect(themeBtn).toBeVisible();
    await expect(themeBtn).toContainText('Modo Claro');

    // 2. Conmutar a Modo Claro
    await themeBtn.click();
    await expect(layout).toHaveAttribute('data-theme', 'light');
    await expect(themeBtn).toContainText('Modo Oscuro');

    // Logo en modo claro: isotipo estándar
    await expect(page.locator('.pedidos-header-logo')).toHaveAttribute('src', /logo-gob-tdf/);

    // Validar clave localStorage 'pedidos:theme'
    const storedThemeLight = await page.evaluate(() => localStorage.getItem('pedidos:theme'));
    expect(storedThemeLight).toBe('light');

    // 3. Conmutar de regreso a Modo Oscuro
    await themeBtn.click();
    await expect(layout).toHaveAttribute('data-theme', 'dark');
    await expect(themeBtn).toContainText('Modo Claro');
    await expect(page.locator('.pedidos-header-logo')).toHaveAttribute('src', /GOB-TDF-BLANCO/);

    const storedThemeDark = await page.evaluate(() => localStorage.getItem('pedidos:theme'));
    expect(storedThemeDark).toBe('dark');

    // 4. Persistencia tras recargar la página (F5)
    await page.reload();
    await expect(layout).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.pedidos-header-logo')).toHaveAttribute('src', /GOB-TDF-BLANCO/);
    const persistedTheme = await page.evaluate(() => localStorage.getItem('pedidos:theme'));
    expect(persistedTheme).toBe('dark');
  });
});
