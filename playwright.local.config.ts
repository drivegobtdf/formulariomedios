import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration para pruebas E2E en entorno LOCAL.
 * Diseñado para validar el rediseño Linear y flujos integrales de Sistema PEDIDOS en http://localhost:5173/
 * con base en '/', Chromium exclusivo y reutilización del servidor Vite activo.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['smoke-local.spec.ts', 'comprehensive-audit.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
