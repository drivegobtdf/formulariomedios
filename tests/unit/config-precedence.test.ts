/**
 * Tests Automatizados — Precedencia de Configuración y Guarda de Seguridad
 * Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 *
 * Cobertura de verificación:
 * 1. Guarda de Seguridad Anti-Fuga: LOCAL/DEV jamás puede conectarse a Supabase Producción.
 * 2. Bloqueo de URL de Producción (uwzgyirilafgnbpmrkic) y fallback automático a TEST/LOCAL.
 * 3. Precedencia en Desarrollo Local: variables de entorno prevalecen sobre runtime de producción.
 * 4. Precedencia en Producción / Standalone: window.__PEDIDOS_CONFIG__ mantiene máxima prioridad.
 * 5. Resolución de basePath en Dev ('/') vs WordPress ('/formulariomedios').
 * 6. Verificación de valores efectivos de runtime sin exponer credenciales privadas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolvePublicConfig,
  getPublicConfig,
  PROD_SUPABASE_REF,
  TEST_SUPABASE_REF,
  DEFAULT_CONFIG,
  normalizeBasePath,
} from '../../pedidos-medios/frontend/src/services/config';

describe('PEDIDOS — Precedencia de Configuración y Guarda de Seguridad', () => {
  beforeEach(() => {
    delete (window as any).__PEDIDOS_CONFIG__;
    vi.restoreAllMocks();
  });

  describe('1. Guarda de Seguridad Anti-Fuga de Supabase PROD', () => {
    it('bloquea la URL de Producción (uwzgyirilafgnbpmrkic) en entorno de desarrollo local', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (window as any).__PEDIDOS_CONFIG__ = {
        supabaseUrl: `https://${PROD_SUPABASE_REF}.supabase.co`,
        supabaseAnonKey: 'prod-anon-key-mock',
        environment: 'production',
        uiMode: 'production-preview',
        basePath: '/',
      };

      const config = resolvePublicConfig({ isDev: true });

      // Debe haber interceptado y reemplazado la URL de Producción por TEST o LOCAL
      expect(config.supabaseUrl).not.toContain(PROD_SUPABASE_REF);
      expect(config.supabaseUrl).toBe(DEFAULT_CONFIG.supabaseUrl);
      expect(config.supabaseUrl).toContain(TEST_SUPABASE_REF);

      // El entorno no debe quedar en production
      expect(config.environment).toBe('development');

      // Debe haber emitido advertencia de seguridad
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PEDIDOS Config Guard] Intento de conexión bloqueado')
      );
    });

    it('bloquea intentos de forzar la URL de Producción vía variables de entorno en desarrollo', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = resolvePublicConfig({
        isDev: true,
        envOverrides: {
          VITE_SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
          VITE_SUPABASE_ANON_KEY: 'prod-key',
        },
      });

      expect(config.supabaseUrl).not.toContain(PROD_SUPABASE_REF);
      expect(config.supabaseUrl).toBe(DEFAULT_CONFIG.supabaseUrl);
      expect(config.environment).toBe('development');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('permite conectar a Supabase TEST o LOCAL en desarrollo local', () => {
      const configTest = resolvePublicConfig({
        isDev: true,
        envOverrides: {
          VITE_SUPABASE_URL: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
        },
      });
      expect(configTest.supabaseUrl).toBe('https://yqfkzgqvezarzhlwiilo.supabase.co');

      const configLocal = resolvePublicConfig({
        isDev: true,
        envOverrides: {
          VITE_SUPABASE_URL: 'http://127.0.0.1:54351',
        },
      });
      expect(configLocal.supabaseUrl).toBe('http://127.0.0.1:54351');
    });
  });

  describe('2. Precedencia en Desarrollo Local (isDev = true)', () => {
    it('las variables de entorno locales prevalecen sobre window.__PEDIDOS_CONFIG__', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        supabaseUrl: 'https://stale-runtime-config.supabase.co',
        basePath: '/ruta-obsoleta',
        uiMode: 'production-preview',
      };

      const config = resolvePublicConfig({
        isDev: true,
        envOverrides: {
          VITE_SUPABASE_URL: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
          VITE_BASE_PATH: '/',
          VITE_UI_MODE: 'development',
        },
      });

      expect(config.supabaseUrl).toBe('https://yqfkzgqvezarzhlwiilo.supabase.co');
      expect(config.basePath).toBe('/');
      expect(config.uiMode).toBe('development');
    });

    it('resuelve basePath = "/" por defecto en desarrollo local para permitir /gestion directa', () => {
      const config = resolvePublicConfig({ isDev: true });
      expect(config.basePath).toBe('/');
    });

    it('no permite que window.__PEDIDOS_CONFIG__ fuerce environment="production" en local', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        environment: 'production',
      };

      const config = resolvePublicConfig({ isDev: true });
      expect(config.environment).toBe('development');
    });
  });

  describe('3. Precedencia en Producción / Standalone Runtime (isDev = false)', () => {
    it('window.__PEDIDOS_CONFIG__ prevalece sobre variables compiladas en producción', () => {
      (window as any).__PEDIDOS_CONFIG__ = {
        supabaseUrl: 'https://custom-cloud.supabase.co',
        basePath: '/sitio-medios',
        environment: 'production',
        uiMode: 'production-preview',
      };

      const config = resolvePublicConfig({
        isDev: false,
        envOverrides: {
          VITE_SUPABASE_URL: 'https://compiled-default.supabase.co',
          VITE_BASE_PATH: '/formulariomedios',
        },
      });

      expect(config.supabaseUrl).toBe('https://custom-cloud.supabase.co');
      expect(config.basePath).toBe('/sitio-medios');
      expect(config.environment).toBe('production');
      expect(config.uiMode).toBe('production-preview');
    });

    it('retiene basePath = "/formulariomedios" por defecto para la variante WordPress', () => {
      const config = resolvePublicConfig({ isDev: false });
      expect(config.basePath).toBe('/formulariomedios');
    });
  });

  describe('4. Verificación de Integridad de Valores Efectivos (Sin Exposición de Secretos)', () => {
    it('el objeto de configuración contiene todos los campos canónicos con tipos válidos', () => {
      const config = getPublicConfig();

      expect(typeof config.supabaseUrl).toBe('string');
      expect(config.supabaseUrl.length).toBeGreaterThan(0);
      expect(typeof config.supabaseAnonKey).toBe('string');
      expect(config.supabaseAnonKey.length).toBeGreaterThan(0);
      expect(['development', 'staging', 'production']).toContain(config.environment);
      expect(['development', 'production-preview']).toContain(config.uiMode);
      expect(typeof config.basePath).toBe('string');
      expect(config.basePath.startsWith('/')).toBe(true);
      expect(typeof config.contractVersion).toBe('string');
      expect(typeof config.pluginVersion).toBe('string');
    });

    it('la configuración por defecto nunca apunta al ref de producción', () => {
      expect(DEFAULT_CONFIG.supabaseUrl).not.toContain(PROD_SUPABASE_REF);
      expect(DEFAULT_CONFIG.supabaseUrl).toContain(TEST_SUPABASE_REF);
      expect(DEFAULT_CONFIG.environment).toBe('development');
      expect(DEFAULT_CONFIG.uiMode).toBe('development');
    });
  });
});
