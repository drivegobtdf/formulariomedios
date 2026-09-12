import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — Smoke Tests F1 Toolchain & App Shell', () => {
  test('debe cargar la aplicación en la ruta base y renderizar el shell', async ({ page }) => {
    await page.goto('/formulariomedios/');

    // Verificar contenedor principal
    const appContainer = page.locator('#pedidos-app');
    await expect(appContainer).toBeVisible();

    // Verificar título principal
    const headerTitle = page.locator('h1');
    await expect(headerTitle).toContainText('PEDIDOS — Secretaría de Medios');

    // Verificar vista inicial de formulario
    const cardTitle = page.locator('h2');
    await expect(cardTitle).toContainText('1. Datos de Contacto y Servicios Requeridos');
  });

  test('debe navegar correctamente a las diferentes vistas placeholder', async ({ page }) => {
    await page.goto('/formulariomedios/');

    // Navegar a Gestión
    await page.click('text=Gestión');
    await expect(page).toHaveURL(/\/formulariomedios\/gestion/);
    await expect(page.locator('h2')).toContainText('Panel de Gestión y Tablero de Pedidos');

    // Navegar a Seguimiento
    await page.click('text=Seguimiento');
    await expect(page).toHaveURL(/\/formulariomedios\/seguimiento/);
    await expect(page.locator('h2')).toContainText('Seguimiento Público de Pedidos');

    // Navegar a Login
    await page.click('text=Login');
    await expect(page).toHaveURL(/\/formulariomedios\/login/);
    await expect(page.locator('h2')).toContainText('Acceso de Personal Interno');
  });
});
