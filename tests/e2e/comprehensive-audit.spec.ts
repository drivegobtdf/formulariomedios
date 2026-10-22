import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — Auditoría Funcional E2E (Portal Público y Seguimiento)', () => {
  let createdPedCode = '';

  test('1. Portal ciudadano: portada y transición al formulario wizard', async ({ page }) => {
    await page.goto('/');

    // 1. Validar contenedor principal público
    const app = page.locator('#pedidos-app > .pedidos-app-public');
    await expect(app).toBeVisible();

    // 2. Pulsar botón para iniciar nueva solicitud
    const startBtn = page.locator('button:has-text("Iniciar Nueva Solicitud"), a:has-text("Iniciar Nueva Solicitud"), a[href*="nueva-solicitud"]').first();
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 3. Debe mostrar el Paso 1 del Wizard
    await expect(page.locator('h2')).toContainText('1. Datos de Contacto y Servicios Requeridos');
  });

  test('2. Wizard Paso 1: validaciones de campos requeridos', async ({ page }) => {
    await page.goto('/nueva-solicitud');

    const nextBtn = page.locator('button:has-text("Continuar")');
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Comprobar mensajes de error de validación
    await expect(page.locator('text=Ingresá tu nombre y apellido')).toBeVisible();
    await expect(page.locator('text=Ingresá tu número de WhatsApp')).toBeVisible();
    await expect(page.locator('text=Ingresá una dirección de correo')).toBeVisible();
    await expect(page.locator('text=Ingresá el área, dirección o dependencia')).toBeVisible();
    await expect(page.locator('text=Seleccioná al menos un servicio o categoría')).toBeVisible();
  });

  test('3. Flujo completo: Envío de solicitud pública a Supabase TEST', async ({ page }) => {
    await page.goto('/nueva-solicitud');

    // Paso 1: Completar datos de contacto
    await page.fill('#contacto_nombre', 'Mariana Solís');
    await page.fill('#contacto_telefono', '2964477578');
    await page.fill('#contacto_correo', 'mariana.solis@tierradelfuego.gob.ar');
    await page.fill('#contacto_area', 'Subsecretaría de Comunicación Institucional');

    // Seleccionar categoría Gacetilla de Prensa
    const gacetillaCheckbox = page.locator('input[type="checkbox"][aria-label="Gacetilla de prensa"]');
    await gacetillaCheckbox.check();

    // Continuar al Paso 2
    await page.click('button:has-text("Continuar")');
    await expect(page.locator('h2')).toContainText('2. Detalle de la solicitud');

    // Paso 2: Especificar requerimiento de Gacetilla
    await page.fill('#gac_referente', 'Mariana Solís - Subsecretaria');
    await page.fill('#gac_tel', '2964477578');
    await page.fill('#gac_info', 'Convocatoria abierta para el programa de formación audiovisual 2026 en Tierra del Fuego.');

    // Continuar al Paso 3 (Adjuntos y Enlaces)
    await page.click('button:has-text("Continuar")');
    await expect(page.locator('h2')).toContainText('3. Archivos y enlaces');

    // Continuar al Paso 4 (Resumen) sin adjuntos obligatorios
    await page.click('button:has-text("Continuar")');
    await expect(page.locator('h2')).toContainText('4. Revisá y enviá');

    // Aceptar confirmación
    const confirmCheckbox = page.locator('.pedidos-confirm-card input[type="checkbox"]');
    await confirmCheckbox.check();

    // Enviar solicitud real a Supabase TEST
    const submitBtn = page.locator('button:has-text("Enviar solicitud")');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Paso 5: Resultado exitoso con código PED
    await expect(page.locator('h2')).toContainText('Solicitud recibida');
    const pedCodeBadge = page.locator('.code-value, .pedidos-ped-code-box, [class*="badge"]').filter({ hasText: /PED-2026-/ }).first();
    await expect(pedCodeBadge).toBeVisible();

    const pedText = await pedCodeBadge.innerText();
    expect(pedText).toMatch(/PED-2026-[A-Z0-9]+/);
    createdPedCode = pedText.trim();
    console.log(`[AUDITORÍA E2E] Solicitud creada con éxito en TEST: ${createdPedCode}`);
  });

  test('4. Seguimiento Ciudadano (/mis-solicitudes): formulario de acceso por Magic Link y validaciones', async ({ page }) => {
    await page.goto('/mis-solicitudes');

    // Validar contenedor específico de tracking
    const app = page.locator('#pedidos-app > .pedidos-app-tracking');
    await expect(app).toBeVisible();

    // Validar encabezado y descripción de acceso seguro
    await expect(page.locator('h2')).toContainText('Mis Solicitudes');
    await expect(page.locator('body')).toContainText('Recibí un enlace de acceso en tu correo.');

    // Validar campo de correo electrónico del solicitante
    const emailInput = page.locator('#solicitante-email');
    await expect(emailInput).toBeVisible();

    // Intentar solicitar acceso con correo inválido (sin @)
    // El input tiene type="email", por lo que usamos evaluación de form submit o un input que pase la validación HTML5 pero no contenga @
    await emailInput.fill('correo-sin-arroba');
    // Para probar la validación interna JS si pasa o el comportamiento del form
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });
    await page.click('button:has-text("Enviar enlace")');
    await expect(page.locator('body')).toContainText('Ingrese un correo electrónico válido');

    // Ingresar correo válido y enviar solicitud de magic link a TEST
    await emailInput.fill('mariana.solis@tierradelfuego.gob.ar');
    await page.click('button:has-text("Enviar enlace")');

    // Confirmación de envío de enlace
    await expect(page.locator('body')).toContainText('Enlace enviado');
  });

  test('5. Gestión Interna (/gestion): barrera de seguridad no autenticada y redirección', async ({ page }) => {
    await page.goto('/gestion');

    // Layout interno con tema oscuro por defecto
    const layout = page.locator('#pedidos-app > .pedidos-app-wide');
    await expect(layout).toBeVisible();
    await expect(layout).toHaveAttribute('data-theme', 'dark');

    // Barrera de acceso restringido
    await expect(page.locator('h2')).toContainText('Acceso restringido');
    await expect(page.locator('body')).toContainText('Iniciá sesión con una cuenta institucional autorizada.');

    // Botón Iniciar sesión redirige a /login
    await page.click('button:has-text("Iniciar sesión")');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h2').first()).toContainText('Acceso de Personal Interno');
  });
});
