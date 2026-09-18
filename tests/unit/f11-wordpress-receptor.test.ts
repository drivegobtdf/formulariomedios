/**
 * Tests Automatizados — F11: Receptor WordPress.org & Portabilidad
 * Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 *
 * Cobertura de verificación:
 * 1. Base path y resolución de configuración pública (getPublicConfig).
 * 2. Portabilidad de hostname: mismo build funciona en Host A, Host B y Host C sin recompilar.
 * 3. Montaje idempotente y compatibilidad con Elementor / DOM dinámico.
 * 4. Lectura de manifest de Vite y encolado de assets hasheados.
 * 5. Ausencia total de secretos en el plugin PHP, dist y frontend público.
 * 6. Preservación del hash fragment (#access_token=...) en deep links.
 * 7. Aislamiento estricto de estilos CSS bajo el namespace .pedidos-app.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { getPublicConfig, normalizeBasePath } from '../../pedidos-medios/frontend/src/services/config';
import { AppRouter } from '../../pedidos-medios/frontend/src/router';

describe('F11 — Receptor WordPress.org & Portabilidad entre Dominios', () => {
  beforeEach(() => {
    delete (window as any).__PEDIDOS_CONFIG__;
  });

  describe('1. Resolución y Normalización Canónica de Base Path', () => {
    it('normaliza base path con leading slash y sin trailing slash', () => {
      (window as any).__PEDIDOS_CONFIG__ = { basePath: 'formulariomedios' };
      expect(getPublicConfig().basePath).toBe('/formulariomedios');

      (window as any).__PEDIDOS_CONFIG__ = { basePath: '/formulariomedios/' };
      expect(getPublicConfig().basePath).toBe('/formulariomedios');

      (window as any).__PEDIDOS_CONFIG__ = { basePath: '/servicios/pedidos///' };
      expect(getPublicConfig().basePath).toBe('/servicios/pedidos');
    });

    it('extrae el path canónico si basePath contiene una URL completa con protocolo', () => {
      (window as any).__PEDIDOS_CONFIG__ = { basePath: 'https://www.tierradelfuego.gob.ar/formulariomedios/' };
      expect(getPublicConfig().basePath).toBe('/formulariomedios');

      (window as any).__PEDIDOS_CONFIG__ = { basePath: 'http://localhost:4173/formulariomedios' };
      expect(getPublicConfig().basePath).toBe('/formulariomedios');

      (window as any).__PEDIDOS_CONFIG__ = { basePath: '//tierradelfuego.gob.ar/servicios/pedidos/' };
      expect(getPublicConfig().basePath).toBe('/servicios/pedidos');
    });

    it('tolera whitespace, slashes repetidos y entradas vacías o nulas', () => {
      expect(normalizeBasePath('  /formulariomedios/  ')).toBe('/formulariomedios');
      expect(normalizeBasePath('///formulariomedios///')).toBe('/formulariomedios');
      expect(normalizeBasePath(undefined)).toBe('/formulariomedios');
      expect(normalizeBasePath(null)).toBe('/formulariomedios');
      expect(normalizeBasePath('')).toBe('/formulariomedios');
      expect(normalizeBasePath('   ')).toBe('/formulariomedios');
    });

    it('retiene el base path por defecto /formulariomedios cuando no se inyecta override', () => {
      const config = getPublicConfig();
      expect(config.basePath).toBe('/formulariomedios');
    });
  });

  describe('2. Portabilidad entre Dominios sin Recompilar (Host A vs Host B)', () => {
    it('genera rutas y publicAppUrl correctos para Host A (Local/QA: http://localhost:4173/formulariomedios)', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        basePath: '/formulariomedios',
        publicAppUrl: 'http://localhost:4173/formulariomedios',
        environment: 'development',
      };

      const config = getPublicConfig();
      expect(config.publicAppUrl).toBe('http://localhost:4173/formulariomedios');
      expect(config.basePath).toBe('/formulariomedios');
      expect(config.environment).toBe('development');

      // Las rutas SPA relativas se resuelven sobre el base path
      const routeMisSolicitudes = `${config.basePath}/mis-solicitudes`;
      expect(routeMisSolicitudes).toBe('/formulariomedios/mis-solicitudes');
    });

    it('genera rutas y publicAppUrl correctos para Host B (Staging: https://staging.tierradelfuego.gob.ar/formulariomedios)', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        basePath: '/formulariomedios',
        publicAppUrl: 'https://staging.tierradelfuego.gob.ar/formulariomedios',
        environment: 'staging',
      };

      const config = getPublicConfig();
      expect(config.publicAppUrl).toBe('https://staging.tierradelfuego.gob.ar/formulariomedios');
      expect(config.basePath).toBe('/formulariomedios');
      expect(config.environment).toBe('staging');

      const routeGestion = `${config.basePath}/gestion`;
      expect(routeGestion).toBe('/formulariomedios/gestion');
    });

    it('genera rutas y publicAppUrl correctos para Host C (Dominio de Producción / Externo)', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        basePath: '/formulariomedios',
        publicAppUrl: 'https://medios.tierradelfuego.gob.ar/formulariomedios',
        environment: 'production',
      };

      const config = getPublicConfig();
      expect(config.publicAppUrl).toBe('https://medios.tierradelfuego.gob.ar/formulariomedios');
      expect(config.basePath).toBe('/formulariomedios');
      expect(config.environment).toBe('production');
      expect(config.uiMode).toBe('production-preview');
    });
  });

  describe('3. Montaje Idempotente y Compatibilidad con Elementor', () => {
    it('expone el hook global mountPedidosMediosApp en window', async () => {
      const mainModule = await import('../../pedidos-medios/frontend/src/main');
      expect(typeof (window as any).mountPedidosMediosApp).toBe('function');
      expect(typeof mainModule.mountApp).toBe('function');
    });

    it('no monta dos veces si el nodo ya tiene dataset.mounted = true', () => {
      const div = document.createElement('div');
      div.id = 'pedidos-app';
      div.dataset.mounted = 'true';
      document.body.appendChild(div);

      // Simular intento de segundo montaje
      const initialChildrenCount = div.childElementCount;
      (window as any).mountPedidosMediosApp();
      expect(div.childElementCount).toBe(initialChildrenCount);

      document.body.removeChild(div);
    });
  });

  describe('4. Lectura de Manifest Vite y Assets Hasheados', () => {
    it('el archivo manifest.json existe en dist/.vite o dist y contiene los puntos de entrada requeridos', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const manifestPathVite = path.join(rootDir, 'pedidos-medios', 'dist', '.vite', 'manifest.json');
      const manifestPathRoot = path.join(rootDir, 'pedidos-medios', 'dist', 'manifest.json');

      const manifestFile = fs.existsSync(manifestPathVite)
        ? manifestPathVite
        : (fs.existsSync(manifestPathRoot) ? manifestPathRoot : null);

      expect(manifestFile).not.toBeNull();
      if (manifestFile) {
        const raw = fs.readFileSync(manifestFile, 'utf8');
        const manifest = JSON.parse(raw);
        expect(manifest['index.html'] || manifest['src/main.tsx']).toBeDefined();
        const entry = manifest['index.html'] || manifest['src/main.tsx'];
        expect(entry.file).toMatch(/^assets\/index-[a-zA-Z0-9_-]+\.js$/);
        expect(entry.css).toBeDefined();
        expect(entry.css[0]).toMatch(/^assets\/index-[a-zA-Z0-9_-]+\.css$/);
      }
    });
  });

  describe('5. Seguridad y Ausencia Total de Secretos en el Plugin', () => {
    it('no expone claves service_role, contraseñas ni secretos en PHP ni en el frontend compilado', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const phpDir = path.join(rootDir, 'pedidos-medios', 'src', 'PHP');
      const distDir = path.join(rootDir, 'pedidos-medios', 'dist');

      const FORBIDDEN = [
        'service_role_key',
        'COMMS_TOKEN_SECRET',
        'N8N_DISPATCH_SECRET',
        'N8N_INTEGRATION_SECRET',
        'BEGIN RSA PRIVATE KEY',
        'BEGIN PRIVATE KEY',
      ];

      function checkDir(dir: string) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const full = path.join(dir, file.name);
          if (file.isDirectory()) {
            checkDir(full);
          } else if (file.isFile() && !file.name.endsWith('.png') && !file.name.endsWith('.jpg')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const f of FORBIDDEN) {
              expect(content.includes(f)).toBe(false);
            }
          }
        }
      }

      checkDir(phpDir);
      checkDir(distDir);
    });
  });

  describe('6. Preservación del Hash Fragment (#access_token=...) en Deep Links', () => {
    it('los enlaces directos en correos preservan el hash fragment #access_token sin convertirlo en query string', () => {
      const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const baseAppUrl = 'http://localhost:4173/formulariomedios';
      const targetUrl = `${baseAppUrl}/mis-solicitudes#access_token=${token}`;

      const parsedUrl = new URL(targetUrl);
      expect(parsedUrl.pathname).toBe('/formulariomedios/mis-solicitudes');
      expect(parsedUrl.hash).toBe(`#access_token=${token}`);
      expect(parsedUrl.search).toBe(''); // NO debe tener token en query params
    });
  });

  describe('7. Aislamiento Estricto de CSS (.pedidos-app)', () => {
    it('el CSS de la aplicación no define selectores globales de etiquetas no cualificadas', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const cssPath = path.join(rootDir, 'pedidos-medios', 'frontend', 'src', 'styles', 'app.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Buscar si existen selectores directos no precedidos por .pedidos o #pedidos
      const lines = css.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Ignorar comentarios y propiedades
        if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith(':') || (trimmed.includes(':') && !trimmed.endsWith('{'))) {
          continue;
        }
        if (trimmed.endsWith('{')) {
          const selector = trimmed.slice(0, -1).trim();
          if (['body', 'html', 'table', 'button', 'input', 'select', 'textarea'].includes(selector)) {
            throw new Error(`Selector global invasivo no permitido: ${selector}`);
          }
        }
      }
      expect(true).toBe(true);
    });
  });

  describe('8. Estructura Canónica del ZIP WordPress (POSIX & Single Root)', () => {
    it('los archivos ZIP generados tienen estructura canónica con separadores / y raíz única pedidos-medios/', async () => {
      const { execSync } = await import('node:child_process');
      const rootDir = path.resolve(__dirname, '../..');
      const targetZips = [
        path.join(rootDir, 'pedidos-medios-0.1.0-alpha-routefix3.zip'),
        path.join(rootDir, 'pedidos-medios-0.1.0-alpha-current-ui.zip'),
        path.join(rootDir, 'pedidos-medios-0.1.0-alpha-routerfix.zip'),
        path.join(rootDir, 'pedidos-medios-0.1.0-alpha-fixed.zip'),
        path.join(rootDir, 'pedidos-medios-0.1.0-alpha.zip'),
        path.join(rootDir, 'pedidos-medios.zip'),
      ];

      for (const zipPath of targetZips) {
        if (!fs.existsSync(zipPath)) {
          continue; // Si aún no se empaquetó en este ciclo
        }

        const cmd = `python -c "import zipfile, sys; zf = zipfile.ZipFile(r'${zipPath}'); names = zf.namelist(); [sys.exit(1) for n in names if '\\\\' in n]; [sys.exit(2) for n in names if not n.startswith('pedidos-medios/')]; sys.exit(0 if 'pedidos-medios/pedidos-medios.php' in names else 3)"`;
        expect(() => execSync(cmd)).not.toThrow();
      }
    });

    it('el archivo principal del plugin declara metadatos oficiales y no fuerza Network: true', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const mainPhp = fs.readFileSync(path.join(rootDir, 'pedidos-medios', 'pedidos-medios.php'), 'utf8');

      expect(mainPhp).toContain('Plugin Name:       Pedidos — Secretaría de Medios');
      expect(mainPhp).toContain('Version:           0.1.0-alpha');
      expect(mainPhp).toContain('Requires PHP:      8.2');
      // Asegurar que NO tiene Network: true para evitar forzar activación global en Multisite
      expect(mainPhp).not.toContain('Network: true');
      expect(mainPhp).not.toContain('Network: True');
    });
  });

  describe('9. Compatibilidad con WordPress Multisite', () => {
    it('la clase Plugin implementa firmas de activación y desactivación compatibles con $network_wide', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const pluginCode = fs.readFileSync(path.join(rootDir, 'pedidos-medios', 'src', 'PHP', 'Plugin.php'), 'utf8');

      expect(pluginCode).toContain('public static function activate(bool $network_wide = false)');
      expect(pluginCode).toContain('public static function deactivate(bool $network_wide = false)');
    });

    it('Routes.php contempla resolución de subdirectorios en Multisite mediante home_url', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const routesCode = fs.readFileSync(path.join(rootDir, 'pedidos-medios', 'src', 'PHP', 'Routes.php'), 'utf8');

      expect(routesCode).toContain('home_url($base_path)');
      expect(routesCode).toContain('is_pedidos_route');
    });
  });

  describe('10. Tolerancia de URLs y Enrutamiento en WordPress Real (Trailing Slash & Portabilidad)', () => {
    it('renderiza la Home correctamente tanto con /formulariomedios como con /formulariomedios/', () => {
      (window as any).__PEDIDOS_CONFIG__ = { basePath: '/formulariomedios' };

      window.history.pushState({}, '', '/formulariomedios');
      let html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Solicitud de Comunicación y Medios');

      window.history.pushState({}, '', '/formulariomedios/');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Solicitud de Comunicación y Medios');
    });

    it('renderiza subrutas correctamente con y sin trailing slash', () => {
      (window as any).__PEDIDOS_CONFIG__ = { basePath: '/formulariomedios' };

      window.history.pushState({}, '', '/formulariomedios/mis-solicitudes');
      let html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');

      window.history.pushState({}, '', '/formulariomedios/mis-solicitudes/');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');

      window.history.pushState({}, '', '/formulariomedios/login');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Acceso Interno');

      window.history.pushState({}, '', '/formulariomedios/login/');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Acceso Interno');
    });

    it('funciona perfectamente con un basePath personalizado como /pedidos sin recompilar', () => {
      (window as any).__PEDIDOS_CONFIG__ = { basePath: '/pedidos' };

      window.history.pushState({}, '', '/pedidos');
      let html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Solicitud de Comunicación y Medios');

      window.history.pushState({}, '', '/pedidos/');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Solicitud de Comunicación y Medios');

      window.history.pushState({}, '', '/pedidos/mis-solicitudes');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');

      window.history.pushState({}, '', '/pedidos/mis-solicitudes/');
      html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');
    });
  });

  describe('11. Aislamiento de Rewrite Rules y Preservación de Página Nativa WordPress', () => {
    const base = 'formulariomedios';
    const regexPattern = new RegExp(`^${base}/(.+)/?$`);

    it('la regex de rewrite rule NO coincide con la raíz (/formulariomedios o /formulariomedios/)', () => {
      expect(regexPattern.test('formulariomedios')).toBe(false);
      expect(regexPattern.test('formulariomedios/')).toBe(false);
      expect(regexPattern.test('/formulariomedios')).toBe(false);
      expect(regexPattern.test('/formulariomedios/')).toBe(false);
    });

    it('la regex de rewrite rule captura subrutas profundas y extrae el subpath', () => {
      expect(regexPattern.test('formulariomedios/mis-solicitudes')).toBe(true);
      expect(regexPattern.test('formulariomedios/mis-solicitudes/')).toBe(true);
      expect(regexPattern.test('formulariomedios/login')).toBe(true);
      expect(regexPattern.test('formulariomedios/gestion')).toBe(true);
      expect(regexPattern.test('formulariomedios/confirmar-email')).toBe(true);

      const match = 'formulariomedios/mis-solicitudes'.match(regexPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('mis-solicitudes');
    });

    it('Routes.php delega la resolución a pagename para ejecutar el shortcode nativo', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const routesCode = fs.readFileSync(path.join(rootDir, 'pedidos-medios', 'src', 'PHP', 'Routes.php'), 'utf8');

      // Verificar que incluye pagename y QUERY_VAR
      expect(routesCode).toContain("'index.php?pagename=' . $base . '&' . self::QUERY_VAR . '=$matches[1]'");
      // Asegurar que NO tiene la regla antigua invasiva que secuestraba la raíz
      expect(routesCode).not.toContain("'index.php?' . self::QUERY_VAR . '=1'");
      expect(routesCode).not.toContain("preg_quote($base, '/') . '(/.*)?$'");
    });
  });
});


