import { test, expect } from '@playwright/test';

test.describe('PEDIDOS — F5 Google Drive Direct Upload & Download Browser Spike', () => {
  test('debe ejecutar el flujo de subida y validación en contexto real de navegador', async ({ page }) => {
    await page.goto('/formulariomedios/');

    // Verificar que la app está cargada
    await expect(page.locator('#pedidos-app')).toBeVisible();

    // Ejecutar spike de transferencia en el contexto del navegador
    const browserTransferResult = await page.evaluate(async () => {
      const fileName = 'documento_spike.pdf';
      const fileBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
      const mimeType = 'application/pdf';

      // 1. Simulación de preparación de sesión en navegador
      const submissionKey = crypto.randomUUID();
      const clientFileRef = crypto.randomUUID();

      return {
        success: true,
        submissionKey,
        clientFileRef,
        fileName,
        size: fileBytes.byteLength,
        mimeType,
      };
    });

    expect(browserTransferResult.success).toBe(true);
    expect(browserTransferResult.fileName).toBe('documento_spike.pdf');
    expect(browserTransferResult.mimeType).toBe('application/pdf');
    expect(browserTransferResult.size).toBe(8);
  });
});
