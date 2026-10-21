import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isStandalone = mode === 'standalone' || process.env.BUILD_TARGET === 'standalone';
  const isDev = mode === 'development' || command === 'serve';

  // En desarrollo local o modo standalone, el base path por defecto es '/'
  // para permitir acceso directo a rutas canónicas (/gestion, /login, etc.).
  // En compilación estándar de producción para WordPress/subdirectorio se mantiene '/formulariomedios/'.
  const defaultBase = (isStandalone || isDev) ? '/' : '/formulariomedios/';
  const rawBase = env.VITE_BASE_PATH || defaultBase;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  const outDir = isStandalone
    ? path.resolve(import.meta.dirname, '../../pedidos-standalone/web')
    : '../dist';

  return {
    plugins: [react()],
    base,
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: path.resolve(import.meta.dirname, 'index.html'),
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: true,
    },
    preview: {
      port: isStandalone ? 4174 : 4173,
      strictPort: true,
      host: true,
    },
  };
});
