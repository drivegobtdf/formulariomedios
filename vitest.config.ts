import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./pedidos-medios/frontend/src/__tests__/setup.ts'],
    include: [
      'pedidos-medios/frontend/src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/server-side-date-validation.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './pedidos-medios/frontend/src'),
      'npm:@supabase/supabase-js@2.116.0': '@supabase/supabase-js',
    },
  },
});
