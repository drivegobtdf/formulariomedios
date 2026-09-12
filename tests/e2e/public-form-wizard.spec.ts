import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — Formulario Público de 8 Categorías & Multi-PED Wizard (F6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/formulariomedios/');
    await expect(page.locator('#pedidos-app')).toBeVisible();
  });

  test('Caso 1: Validación de campos obligatorios en Paso 1 (Contacto y Categorías)', async ({ page }) => {
    // Intentar avanzar sin completar campos
    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // Verificar banners y mensajes de error
    await expect(page.locator('text=Ingresá tu nombre y apellido')).toBeVisible();
    await expect(page.locator('text=Ingresá un número de teléfono')).toBeVisible();
    await expect(page.locator('text=Ingresá una dirección de correo')).toBeVisible();
    await expect(page.locator('text=Ingresá el área, dirección o dependencia')).toBeVisible();
    await expect(page.locator('text=Seleccioná al menos un servicio o categoría')).toBeVisible();
  });

  test('Caso 2: Solicitud Multi-PED de Diseño Gráfico (2 piezas: Flyer + Invitación)', async ({ page }) => {
    // Paso 1: Completar contacto
    await page.fill('#contacto_nombre', 'Mariana Solís');
    await page.fill('#contacto_telefono', '+54 2901 448899');
    await page.fill('#contacto_correo', 'mariana.solis@tierradelfuego.gob.ar');
    await page.fill('#contacto_area', 'Subsecretaría de Comunicación Institucional');

    // Seleccionar categoría Diseño Gráfico
    await page.check('input[aria-label="Diseño gráfico"]');

    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // Paso 2: Debe estar en Detalle de Solicitudes
    await expect(page.locator('h2')).toContainText('2. Detalle y Especificación de Servicios');
    await expect(page.locator('h3')).toContainText('Diseño Gráfico');

    // Seleccionar 2 piezas: Flyer e Invitación
    await page.check('input[type="checkbox"] >> xpath=..//strong[contains(text(), "Flyer")]/ancestor::label/input');
    await page.check('input[type="checkbox"] >> xpath=..//strong[contains(text(), "Invitación digital")]/ancestor::label/input');

    // Completar datos del Flyer
    await page.selectOption('#flyer_formato', 'Cuadrado 1:1 (Feed Instagram/Facebook)');
    await page.fill('#flyer_fecha_limite', '2026-11-20');
    await page.fill('#flyer_texto', 'Taller Abierto de Robótica en el Polo Creativo Norte.');

    // Completar datos de la Invitación
    await page.fill('#inv_nombre_evento', 'Inauguración de Espacio Comunitario');
    await page.fill('#inv_fecha', '2026-11-25');
    await page.fill('#inv_hora', '11:00');
    await page.selectOption('#inv_modalidad', 'Presencial');
    await page.fill('#inv_lugar', 'Gimnasio Conscripto Bernardi, Río Grande');
    await page.fill('#inv_programa', '11:00 Recepción, 11:30 Palabras de autoridades, 12:00 Recorrida.');

    // Continuar al Paso 3 (Adjuntos)
    await page.click('button:has-text("Continuar a Adjuntos y Enlaces")');
    await expect(page.locator('h2')).toContainText('3. Archivos Adjuntos y Enlaces de Referencia');

    // Continuar al Paso 4 (Resumen)
    await page.click('button:has-text("Continuar al Resumen y Confirmación")');
    await expect(page.locator('h2')).toContainText('4. Resumen y Confirmación Final');

    // Verificar que el resumen liste las 2 solicitudes
    await expect(page.locator('text=Solicitudes a Generar (2 PEDs)')).toBeVisible();
    await expect(page.locator('text=Flyer para redes sociales')).toBeVisible();
    await expect(page.locator('text=Invitación digital')).toBeVisible();

    // Confirmar checkbox y enviar
    const confirmCheckbox = page.locator('input[type="checkbox"] >> xpath=..//strong[contains(text(), "Confirmo que revisé los datos")]/ancestor::label/input');
    await confirmCheckbox.check();

    const submitBtn = page.locator('button:has-text("Enviar solicitudes")');
    await expect(submitBtn).toBeEnabled();
  });

  test('Caso 3: Flujo de Asesoramiento en Producción Audiovisual y Web', async ({ page }) => {
    // Paso 1: Completar contacto
    await page.fill('#contacto_nombre', 'Martín Rodríguez');
    await page.fill('#contacto_telefono', '+54 2901 556677');
    await page.fill('#contacto_correo', 'martin.rodriguez@tierradelfuego.gob.ar');
    await page.fill('#contacto_area', 'Dirección de Juventudes');

    // Seleccionar Producción Audiovisual y Sitios Web
    await page.check('input[aria-label="Producción audiovisual"]');
    await page.check('input[aria-label="Sitios y contenidos web"]');

    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // Paso 2: Producción Audiovisual con Asesoramiento
    const radioAsesoramientoAV = page.locator('input[name="asesoramiento_Producción audiovisual"]').nth(1);
    await radioAsesoramientoAV.check();

    await expect(page.locator('text=¡No te preocupes! Completá brevemente qué querés comunicar')).toBeVisible();
    await page.fill('#obj_Producción\\ audiovisual', 'Queremos hacer una serie de videos cortos para promocionar los talleres juveniles.');

    // Sitios Web con especificación técnica directa (sin asesoramiento)
    await page.selectOption('#web_tipo', 'Landing page / Campaña');
    await page.fill('#web_desc', 'Página de aterrizaje para el registro del Mes de las Juventudes.');
    await page.fill('#web_cambios', 'Formulario de preinscripción, listado de bandas y cronograma de talleres.');
    await page.fill('#web_fecha', '2026-10-30');

    // Avanzar a Paso 3 y luego a Paso 4
    await page.click('button:has-text("Continuar a Adjuntos y Enlaces")');
    await page.click('button:has-text("Continuar al Resumen y Confirmación")');

    // Verificar en Resumen que se muestre "Requiere asesoramiento"
    await expect(page.locator('text=Requiere asesoramiento')).toBeVisible();
    await expect(page.locator('text=Página de aterrizaje para el registro del Mes de las Juventudes')).toBeVisible();
  });

  test('Caso 4: Cobertura de Eventos, Gacetilla y Redes Sociales', async ({ page }) => {
    // Paso 1: Completar contacto
    await page.fill('#contacto_nombre', 'Valeria Ramos');
    await page.fill('#contacto_telefono', '+54 2901 123456');
    await page.fill('#contacto_correo', 'valeria.ramos@tierradelfuego.gob.ar');
    await page.fill('#contacto_area', 'Secretaría de Cultura');

    // Seleccionar Cobertura, Gacetilla y Redes
    await page.check('input[aria-label="Cobertura de eventos"]');
    await page.check('input[aria-label="Gacetilla de prensa"]');
    await page.check('input[aria-label="Publicaciones en redes sociales"]');

    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // Cobertura
    await page.fill('#cob_fecha', '2026-10-12');
    await page.fill('#cob_hora_inicio', '10:00');
    await page.fill('#cob_lugar', 'Casa de la Cultura Ushuaia');
    await page.selectOption('#cob_ciudad', 'Ushuaia');
    await page.fill('#cob_autoridades', 'Secretario de Cultura, Artistas locales');
    await page.fill('#cob_requerimientos', 'Fotografía de la muestra y video resumen para redes.');

    // Gacetilla
    await page.fill('#gac_referente', 'Lic. Valeria Ramos');
    await page.fill('#gac_tel', '+54 2901 123456');
    await page.fill('#gac_info', 'Inauguración de la exposición provincial de artes visuales 2026.');

    // Redes Sociales
    await page.fill('#redes_fecha', '2026-10-10');
    await page.fill('#redes_copy', '¡Este fin de semana te esperamos en la Casa de la Cultura! Entrada libre y gratuita.');

    // Avanzar a Adjuntos y agregar un link externo
    await page.click('button:has-text("Continuar a Adjuntos y Enlaces")');
    await page.click('button:has-text("+ Agregar enlace")');
    await page.fill('input[placeholder*="https://drive.google.com"]', 'https://drive.google.com/drive/folders/ejemplo-cultura-2026');
    await page.fill('input[placeholder*="Descripción breve"]', 'Fotos de obras en alta calidad');

    // Avanzar a Resumen
    await page.click('button:has-text("Continuar al Resumen y Confirmación")');

    await expect(page.locator('text=Solicitudes a Generar (3 PEDs)')).toBeVisible();
    await expect(page.locator('text=Cobertura de eventos')).toBeVisible();
    await expect(page.locator('text=Gacetilla de prensa')).toBeVisible();
    await expect(page.locator('text=Publicaciones en redes sociales')).toBeVisible();
    await expect(page.locator('text=https://drive.google.com/drive/folders/ejemplo-cultura-2026')).toBeVisible();
  });

  test('Caso 5: Navegación libre hacia atrás y edición de bloques', async ({ page }) => {
    // Paso 1
    await page.fill('#contacto_nombre', 'Carlos Bianchi');
    await page.fill('#contacto_telefono', '+54 2901 778899');
    await page.fill('#contacto_correo', 'carlos.bianchi@tierradelfuego.gob.ar');
    await page.fill('#contacto_area', 'Ministerio de Economía');
    await page.check('input[aria-label="Gacetilla de prensa"]');

    await page.click('button:has-text("Continuar al Detalle de Solicitudes")');

    // Paso 2
    await page.fill('#gac_referente', 'Carlos Bianchi');
    await page.fill('#gac_tel', '+54 2901 778899');
    await page.fill('#gac_info', 'Anuncio de cronograma de pagos correspondiente al mes en curso.');

    await page.click('button:has-text("Continuar a Adjuntos y Enlaces")');
    await page.click('button:has-text("Continuar al Resumen y Confirmación")');

    // Desde Resumen, hacer clic en "Editar contacto"
    await page.click('button:has-text("Editar contacto")');
    await expect(page.locator('h2')).toContainText('1. Datos de Contacto y Servicios Requeridos');

    // Verificar que los datos se conservaron intactos
    await expect(page.locator('#contacto_nombre')).toHaveValue('Carlos Bianchi');
    await expect(page.locator('#contacto_correo')).toHaveValue('carlos.bianchi@tierradelfuego.gob.ar');
  });
});
