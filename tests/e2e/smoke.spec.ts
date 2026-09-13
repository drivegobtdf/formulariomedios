import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — Smoke Tests F1 Toolchain & App Shell', () => {
  test('debe cargar la aplicación en la ruta base y renderizar el shell', async ({ page }) => {
    await page.goto('/formulariomedios/');

    // Verificar contenedor principal
    const appContainer = page.locator('#pedidos-app');
    await expect(appContainer).toBeVisible();

    // Verificar título principal
    const headerTitle = page.locator('h1').first();
    await expect(headerTitle).toContainText('PEDIDOS — Secretaría de Medios');

    // Verificar vista inicial de formulario
    const cardTitle = page.locator('h2').first();
    await expect(cardTitle).toContainText('1. Datos de Contacto y Servicios Requeridos');
  });

  test('debe navegar correctamente a las diferentes vistas', async ({ page }) => {
    await page.goto('/formulariomedios/');

    // Navegar a Gestión
    await page.click('text=Gestión');
    await expect(page).toHaveURL(/\/formulariomedios\/gestion/);
    await expect(page.locator('body')).toContainText('Gestión Interna de Pedidos');

    // Navegar a Mis Solicitudes
    await page.click('text=Mis Solicitudes');
    await expect(page).toHaveURL(/\/formulariomedios\/mis-solicitudes/);
    await expect(page.locator('body')).toContainText('Mis Solicitudes');

    // Navegar a Acceso Interno (Login)
    await page.click('text=Acceso Interno');
    await expect(page).toHaveURL(/\/formulariomedios\/login/);
    await expect(page.locator('h2').first()).toContainText('Acceso de Personal Interno');
  });
});
