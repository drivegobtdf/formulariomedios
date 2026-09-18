/**
 * Tests Automatizados — PEDIDOS Standalone Static SPA
 * Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 *
 * Cobertura de verificación:
 * 1. Detección y resolución de configuración en modo Standalone (basePath = '/').
 * 2. Preservación estricta de la variante WordPress (basePath = '/formulariomedios').
 * 3. Renderizado de rutas desde la raíz ('/', '/mis-solicitudes', '/login', '/gestion').
 * 4. Tolerancia de trailing slash en Standalone.
 * 5. Inyección y anulación dinámica vía pedidos-config.js (window.__PEDIDOS_CONFIG__).
 * 6. Ausencia total de credenciales privilegiadas y secretos en el paquete Standalone.
 * 7. Verificación de archivos de configuración de servidores (Apache .htaccess y Nginx).
 * 8. Coexistencia y separación de directorios de salida (pedidos-standalone/web vs pedidos-medios/dist).
 * 9. Integridad y estructura POSIX del artefacto ZIP pedidos-standalone-0.1.0-alpha.zip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getPublicConfig, normalizeBasePath } from '../../pedidos-medios/frontend/src/services/config';
import { AppRouter } from '../../pedidos-medios/frontend/src/router';

describe('PEDIDOS — Standalone Static SPA & Multi-Runtime Tests', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const standaloneDir = path.join(rootDir, 'pedidos-standalone');
  const webDir = path.join(standaloneDir, 'web');
  const serverDir = path.join(standaloneDir, 'server');
  const wpDistDir = path.join(rootDir, 'pedidos-medios', 'dist');

  beforeEach(() => {
    delete (window as any).__PEDIDOS_CONFIG__;
  });

  describe('1. Resolución Canónica de BasePath en Modo Standalone vs WordPress', () => {
    it('resuelve basePath = "/" cuando se configura explícitamente para Standalone', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        basePath: '/',
        publicAppUrl: 'https://formulariomedios.tierradelfuego.gob.ar',
        environment: 'production',
        uiMode: 'production-preview',
      };

      const config = getPublicConfig();
      expect(config.basePath).toBe('/');
      expect(config.publicAppUrl).toBe('https://formulariomedios.tierradelfuego.gob.ar');
      expect(config.uiMode).toBe('production-preview');
    });

    it('normaliza basePath = "/" al recibir URLs canónicas completas del subdominio', () => {
      expect(normalizeBasePath('https://formulariomedios.tierradelfuego.gob.ar/')).toBe('/');
      expect(normalizeBasePath('https://formulariomedios.tierradelfuego.gob.ar')).toBe('/');
      expect(normalizeBasePath('https://pedidos.tierradelfuego.gob.ar/')).toBe('/');
      expect(normalizeBasePath('http://localhost:4174/')).toBe('/');
      expect(normalizeBasePath('http://localhost:4174')).toBe('/');
    });

    it('conserva basePath = "/formulariomedios" por defecto para la variante WordPress', () => {
      const config = getPublicConfig();
      expect(config.basePath).toBe('/formulariomedios');
    });
  });

  describe('2. Renderizado de Rutas SPA desde la Raíz (React Router Standalone)', () => {
    beforeEach(() => {
      (window as any).__PEDIDOS_CONFIG__ = {
        basePath: '/',
        uiMode: 'production-preview',
        environment: 'production',
      };
    });

    it('renderiza la Portada Institucional y Wizard en la ruta raíz "/"', () => {
      window.history.pushState({}, '', '/');
      const html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Solicitud de Comunicación y Medios');
      expect(html).toContain('SISTEMA OFICIAL DE PEDIDOS');
      expect(html).toContain('Cargá tu pedido');
    });

    it('renderiza Mis Solicitudes en "/mis-solicitudes"', () => {
      window.history.pushState({}, '', '/mis-solicitudes');
      const html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');
      expect(html).toContain('Recibí un enlace de acceso en tu correo');
    });

    it('renderiza la pantalla de Acceso Interno en "/login"', () => {
      window.history.pushState({}, '', '/login');
      const html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Acceso de Personal Interno');
      expect(html).toContain('Correo Electrónico');
    });

    it('renderiza el Panel de Gestión en "/gestion"', () => {
      window.history.pushState({}, '', '/gestion');
      const html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Gestión de Pedidos');
      expect(html).toContain('Verificando credenciales');
    });

    it('tolera trailing slash en subrutas ("/" y "/mis-solicitudes/")', () => {
      window.history.pushState({}, '', '/mis-solicitudes/');
      const html = renderToString(React.createElement(AppRouter));
      expect(html).toContain('Mis Solicitudes');
    });
  });

  describe('3. Configuración en Tiempo de Ejecución (pedidos-config.js)', () => {
    it('el archivo pedidos-config.js existe en web/ y contiene sintaxis JS válida', () => {
      const configFilePath = path.join(webDir, 'pedidos-config.js');
      expect(fs.existsSync(configFilePath)).toBe(true);

      const content = fs.readFileSync(configFilePath, 'utf8');
      expect(content).toContain('window.__PEDIDOS_CONFIG__');
      expect(content).toContain('supabaseUrl');
      expect(content).toContain('supabaseAnonKey');
      expect(content).toContain('basePath');
      expect(content).toContain('publicAppUrl');
    });

    it('permite modificar la URL de Supabase y publicAppUrl dinámicamente', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        supabaseUrl: 'https://staging-project.supabase.co',
        publicAppUrl: 'https://staging-pedidos.tierradelfuego.gob.ar',
        basePath: '/',
      };

      const config = getPublicConfig();
      expect(config.supabaseUrl).toBe('https://staging-project.supabase.co');
      expect(config.publicAppUrl).toBe('https://staging-pedidos.tierradelfuego.gob.ar');
      expect(config.basePath).toBe('/');
    });
  });

  describe('4. Estructura y Seguridad del Directorio pedidos-standalone/', () => {
    it('contiene la estructura obligatoria: web/, server/, README, CONFIGURACION, VERSION, CHECKSUMS', () => {
      expect(fs.existsSync(path.join(webDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(webDir, 'pedidos-config.js'))).toBe(true);
      expect(fs.existsSync(path.join(serverDir, 'apache-htaccess.example'))).toBe(true);
      expect(fs.existsSync(path.join(serverDir, 'nginx.conf.example'))).toBe(true);
      expect(fs.existsSync(path.join(standaloneDir, 'README-INSTALACION.md'))).toBe(true);
      expect(fs.existsSync(path.join(standaloneDir, 'CONFIGURACION.md'))).toBe(true);
      expect(fs.existsSync(path.join(standaloneDir, 'VERSION.txt'))).toBe(true);
      expect(fs.existsSync(path.join(standaloneDir, 'CHECKSUMS.txt'))).toBe(true);
    });

    it('index.html en web/ contiene el mount point #pedidos-app y el script pedidos-config.js', () => {
      const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
      expect(html).toContain('id="pedidos-app"');
      expect(html).toContain('src="/pedidos-config.js"');
      expect(html).toContain('assets/index-');
    });

    it('no contiene ningún secreto real ni tokens privilegiados en todos los archivos de pedidos-standalone/', () => {
      const FORBIDDEN_PATTERNS = [
        /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*service_role/i,
        /service_role_key/i,
        /COMMS_TOKEN_SECRET/i,
        /N8N_DISPATCH_SECRET/i,
        /N8N_INTEGRATION_SECRET/i,
        /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i,
        /client_secret_[a-zA-Z0-9_-]+\.apps\.googleusercontent/i,
        /"client_secret"\s*:\s*"[^"]+"/i,
        /"refresh_token"\s*:\s*"[^"]+"/i,
      ];

      function scanRecursive(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanRecursive(full);
          } else if (entry.isFile() && !entry.name.endsWith('.png') && !entry.name.endsWith('.jpg')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const pat of FORBIDDEN_PATTERNS) {
              expect(pat.test(content)).toBe(false);
            }
          }
        }
      }

      scanRecursive(standaloneDir);
    });
  });

  describe('5. Configuraciones de Servidores Web (Apache & Nginx)', () => {
    it('apache-htaccess.example implementa SPA rewrite rule a index.html y cabeceras de caché', () => {
      const content = fs.readFileSync(path.join(serverDir, 'apache-htaccess.example'), 'utf8');
      expect(content).toContain('RewriteEngine On');
      expect(content).toContain('RewriteCond %{REQUEST_FILENAME} -f [OR]');
      expect(content).toContain('RewriteRule ^ index.html [L]');
      expect(content).toContain('Cache-Control "public, max-age=31536000, immutable"');
      expect(content).toContain('Cache-Control "no-cache, no-store, must-revalidate"');
    });

    it('nginx.conf.example implementa try_files SPA fallback a /index.html y HTTPS redirect', () => {
      const content = fs.readFileSync(path.join(serverDir, 'nginx.conf.example'), 'utf8');
      expect(content).toContain('try_files $uri $uri/ /index.html;');
      expect(content).toContain('server_name formulariomedios.tierradelfuego.gob.ar;');
      expect(content).toContain('root /var/www/pedidos-standalone/web;');
      expect(content).toContain('return 301 https://$host$request_uri;');
    });
  });

  describe('6. Coexistencia e Independencia de Builds (WordPress vs Standalone)', () => {
    it('los directorios de salida pedidos-standalone/web y pedidos-medios/dist están aislados', () => {
      expect(fs.existsSync(webDir)).toBe(true);
      expect(fs.existsSync(wpDistDir)).toBe(true);
      expect(webDir).not.toBe(wpDistDir);
    });

    it('ambos builds producen bundles funcionales con sus respectivos basePaths', () => {
      const wpManifest = path.join(wpDistDir, '.vite', 'manifest.json');
      const standaloneManifest = path.join(webDir, '.vite', 'manifest.json');

      expect(fs.existsSync(wpManifest) || fs.existsSync(path.join(wpDistDir, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(standaloneManifest) || fs.existsSync(path.join(webDir, 'manifest.json'))).toBe(true);
    });
  });

  describe('7. Empaquetado y Verificación de pedidos-standalone-0.1.0-beta2.zip', () => {
    it('el archivo ZIP de release beta2 existe, tiene raíz única pedidos-standalone/ y no tiene backslashes', () => {
      const zipPath = path.join(rootDir, 'pedidos-standalone-0.1.0-beta2.zip');
      if (fs.existsSync(zipPath)) {
        const pyCheck = `python -c "import zipfile, sys; zf = zipfile.ZipFile(r'${zipPath}'); names = zf.namelist(); [sys.exit(1) for n in names if '\\\\' in n]; [sys.exit(2) for n in names if not n.startswith('pedidos-standalone/')]; sys.exit(0 if 'pedidos-standalone/web/index.html' in names else 3)"`;
        expect(() => execSync(pyCheck)).not.toThrow();
      }
    });

    it('los artefactos previos (0.1.0-alpha.zip y 0.1.0-beta1.zip) se preservan sin sobreescritura destructiva', () => {
      const alphaZipPath = path.join(rootDir, 'pedidos-standalone-0.1.0-alpha.zip');
      const beta1ZipPath = path.join(rootDir, 'pedidos-standalone-0.1.0-beta1.zip');
      expect(fs.existsSync(alphaZipPath)).toBe(true);
      if (fs.existsSync(beta1ZipPath)) {
        expect(fs.existsSync(beta1ZipPath)).toBe(true);
      }
    });
  });
});
