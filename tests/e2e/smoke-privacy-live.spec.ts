import { test, expect } from '@playwright/test';

test.describe('Cloudflare Pages Production Live Smoke Test', () => {
  test('1. Carga https://formulariomedios.pages.dev/ y verifica enlace a Política de Privacidad', async ({ page }) => {
    const res = await page.goto('https://formulariomedios.pages.dev/', { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toHaveText('Solicitud de Comunicación y Medios');

    const privacyLink = page.locator('footer a[href="/privacidad"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveText('Política de Privacidad');
  });

  test('2. Navega a /privacidad desde el footer y valida contenido y secciones clave', async ({ page }) => {
    await page.goto('https://formulariomedios.pages.dev/', { waitUntil: 'networkidle' });
    await page.locator('footer a[href="/privacidad"]').click();

    await page.waitForURL('https://formulariomedios.pages.dev/privacidad');

    // Título y subtítulo
    await expect(page.locator('h1')).toHaveText('POLÍTICA DE PRIVACIDAD');
    await expect(page.locator('.pedidos-privacy-subtitle')).toContainText('Secretaría de Medios');
    await expect(page.locator('.pedidos-privacy-subtitle')).toContainText('Gobierno de Tierra del Fuego, Antártida e Islas del Atlántico Sur');

    // Document title
    await expect(page).toHaveTitle('Política de Privacidad | PEDIDOS — Secretaría de Medios');

    // Secciones requeridas
    const headings = page.locator('h2');
    await expect(headings).toHaveCount(11);

    // Google Drive section content
    const content = await page.locator('.pedidos-privacy-content').textContent();
    expect(content).toContain('drive.file');
    expect(content).toContain('Sin fines publicitarios');
    expect(content).toContain('No comercialización');
    expect(content).toContain('No uso para entrenamiento de IA');
    expect(content).toContain('Uso estrictamente operativo');
    expect(content).toContain('Supabase');
    expect(content).toContain('Cloudflare Pages');
    expect(content).toContain('n8n');
  });

  test('3. Recarga directa en https://formulariomedios.pages.dev/privacidad funciona (SPA Routing)', async ({ page }) => {
    const res = await page.goto('https://formulariomedios.pages.dev/privacidad', { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);

    await expect(page.locator('h1')).toHaveText('POLÍTICA DE PRIVACIDAD');
    await expect(page.locator('.pedidos-privacy-card')).toBeVisible();
  });

  test('4. Enlace de retorno vuelve a la portada principal', async ({ page }) => {
    await page.goto('https://formulariomedios.pages.dev/privacidad', { waitUntil: 'networkidle' });
    await page.locator('.pedidos-privacy-back-link').click();

    await page.waitForURL('https://formulariomedios.pages.dev/');
    await expect(page.locator('h1')).toHaveText('Solicitud de Comunicación y Medios');
  });

  test('5. Vista Mobile (390x844) renderiza responsive sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto('https://formulariomedios.pages.dev/privacidad', { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);

    await expect(page.locator('.pedidos-privacy-card')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  });
});
