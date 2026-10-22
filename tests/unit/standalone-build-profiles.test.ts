import { describe, it, expect } from 'vitest';
import {
  resolveStandaloneProfile,
  validateStandaloneConfig,
  parseJwtPayloadClaims,
  buildRuntimeConfigContent,
  PROD_CONFIG,
  TEST_CONFIG,
  PROD_SUPABASE_REF,
  TEST_SUPABASE_REF,
} from '../../scripts/postbuild-standalone.mjs';

describe('Standalone Build Profiles & Security Guards', () => {
  describe('1. Resolución de Perfiles en Local y CI', () => {
    it('por defecto en local sin variables selecciona el perfil PROD intacto', () => {
      const res = resolveStandaloneProfile({});
      expect(res.profile).toBe('production');
      expect(res.effectiveConfig.supabaseUrl).toContain(PROD_SUPABASE_REF);
      expect(res.effectiveConfig.environment).toBe('production');
      expect(res.effectiveConfig.publicAppUrl).toBe('https://formulariomedios.pages.dev');
    });

    it('en local con STANDALONE_ENV=test selecciona el perfil TEST con URL local válida', () => {
      const res = resolveStandaloneProfile({
        STANDALONE_ENV: 'test',
        PUBLIC_APP_URL: 'http://localhost:5173',
      });
      expect(res.profile).toBe('test');
      expect(res.effectiveConfig.supabaseUrl).toContain(TEST_SUPABASE_REF);
      expect(res.effectiveConfig.environment).toBe('staging');
      expect(res.effectiveConfig.publicAppUrl).toBe('http://localhost:5173');
    });

    it('falla si STANDALONE_ENV tiene un valor desconocido', () => {
      expect(() => {
        resolveStandaloneProfile({ STANDALONE_ENV: 'inseguro' });
      }).toThrow(/Valor inválido para STANDALONE_ENV/);
    });

    it('falla en local si la URL de la aplicación de prueba intenta apuntar a Supabase', () => {
      expect(() => {
        resolveStandaloneProfile({
          STANDALONE_ENV: 'test',
          PUBLIC_APP_URL: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
        });
      }).toThrow(/no puede apuntar a Supabase/);
    });
  });

  describe('2. Resolución Estricta en Cloudflare Pages', () => {
    it('rama productiva (cloudflare-pages-production) genera obligatoriamente PROD', () => {
      const res = resolveStandaloneProfile({
        CF_PAGES: '1',
        CF_PAGES_BRANCH: 'cloudflare-pages-production',
      });
      expect(res.profile).toBe('production');
      expect(res.effectiveConfig.supabaseUrl).toContain(PROD_SUPABASE_REF);
      expect(res.effectiveConfig.environment).toBe('production');
    });

    it('rama Preview reconocida genera obligatoriamente TEST con CF_PAGES_URL', () => {
      const previewUrl = 'https://preview-linear-stage6b.formulariomedios.pages.dev';
      const res = resolveStandaloneProfile({
        CF_PAGES: '1',
        CF_PAGES_BRANCH: 'feature/redisenio-linear-pedidos',
        CF_PAGES_URL: previewUrl,
      });
      expect(res.profile).toBe('test');
      expect(res.effectiveConfig.supabaseUrl).toContain(TEST_SUPABASE_REF);
      expect(res.effectiveConfig.environment).toBe('staging');
      expect(res.effectiveConfig.publicAppUrl).toBe(previewUrl);
    });

    it('aborta si CF_PAGES_BRANCH está ausente o vacío en Cloudflare Pages', () => {
      expect(() => {
        resolveStandaloneProfile({ CF_PAGES: '1', CF_PAGES_BRANCH: '' });
      }).toThrow(/CF_PAGES_BRANCH está ausente o vacío/);
    });

    it('aborta si en la rama productiva se intenta forzar STANDALONE_ENV=test (conflicto)', () => {
      expect(() => {
        resolveStandaloneProfile({
          CF_PAGES: '1',
          CF_PAGES_BRANCH: 'cloudflare-pages-production',
          STANDALONE_ENV: 'test',
        });
      }).toThrow(/No se permite forzar STANDALONE_ENV=test\/staging en la rama productiva/);
    });

    it('aborta si en una rama Preview se intenta forzar STANDALONE_ENV=production (conflicto)', () => {
      expect(() => {
        resolveStandaloneProfile({
          CF_PAGES: '1',
          CF_PAGES_BRANCH: 'preview/test-branch',
          STANDALONE_ENV: 'production',
          CF_PAGES_URL: 'https://preview.formulariomedios.pages.dev',
        });
      }).toThrow(/No se permite forzar STANDALONE_ENV=production en una rama Preview/);
    });

    it('aborta si en una rama Preview falta CF_PAGES_URL', () => {
      expect(() => {
        resolveStandaloneProfile({
          CF_PAGES: '1',
          CF_PAGES_BRANCH: 'feature/preview-test',
        });
      }).toThrow(/CF_PAGES_URL es requerida/);
    });

    it('aborta si CF_PAGES_URL no es una URL HTTP/HTTPS válida', () => {
      expect(() => {
        resolveStandaloneProfile({
          CF_PAGES: '1',
          CF_PAGES_BRANCH: 'feature/preview-test',
          CF_PAGES_URL: 'invalid-preview-url',
        });
      }).toThrow(/CF_PAGES_URL debe ser una URL HTTP\/HTTPS válida/);
    });

    it('aborta si CF_PAGES_URL apunta erróneamente a Supabase como fallback', () => {
      expect(() => {
        resolveStandaloneProfile({
          CF_PAGES: '1',
          CF_PAGES_BRANCH: 'feature/preview-test',
          CF_PAGES_URL: 'https://yqfkzgqvezarzhlwiilo.supabase.co',
        });
      }).toThrow(/CF_PAGES_URL no puede apuntar a Supabase/);
    });
  });

  describe('3. Validación Criptográfica y Guardas de Configuración', () => {
    it('decodifica correctamente los claims del token anon de TEST y PROD', () => {
      const prodClaims = parseJwtPayloadClaims(PROD_CONFIG.supabaseAnonKey);
      expect(prodClaims.ref).toBe(PROD_SUPABASE_REF);
      expect(prodClaims.role).toBe('anon');

      const testClaims = parseJwtPayloadClaims(TEST_CONFIG.supabaseAnonKey);
      expect(testClaims.ref).toBe(TEST_SUPABASE_REF);
      expect(testClaims.role).toBe('anon');
    });

    it('valida exitosamente la configuración de PROD legítima', () => {
      expect(() => {
        validateStandaloneConfig(PROD_CONFIG, 'production');
      }).not.toThrow();
    });

    it('valida exitosamente la configuración de TEST legítima', () => {
      const validTestConfig = {
        ...TEST_CONFIG,
        publicAppUrl: 'https://preview.formulariomedios.pages.dev',
      };
      expect(() => {
        validateStandaloneConfig(validTestConfig, 'test');
      }).not.toThrow();
    });

    it('rechaza una configuración TEST contaminada con la URL de PROD', () => {
      const contaminated = {
        ...TEST_CONFIG,
        supabaseUrl: PROD_CONFIG.supabaseUrl,
        publicAppUrl: 'https://preview.formulariomedios.pages.dev',
      };
      expect(() => {
        validateStandaloneConfig(contaminated, 'test');
      }).toThrow(/URL de Supabase no coincide con TEST/);
    });

    it('rechaza una configuración TEST contaminada con la Anon Key de PROD', () => {
      const contaminated = {
        ...TEST_CONFIG,
        supabaseAnonKey: PROD_CONFIG.supabaseAnonKey,
        publicAppUrl: 'https://preview.formulariomedios.pages.dev',
      };
      expect(() => {
        validateStandaloneConfig(contaminated, 'test');
      }).toThrow(/Anon Key claim ref \(uwzgyirilafgnbpmrkic\) no coincide con TEST/);
    });

    it('rechaza una configuración PROD si su clave no coincide con el proyecto', () => {
      const contaminated = {
        ...PROD_CONFIG,
        supabaseAnonKey: TEST_CONFIG.supabaseAnonKey,
      };
      expect(() => {
        validateStandaloneConfig(contaminated, 'production');
      }).toThrow(/Anon Key claim ref \(yqfkzgqvezarzhlwiilo\) no coincide con PROD/);
    });

    it('rechaza un token JWT malformado', () => {
      expect(() => {
        parseJwtPayloadClaims('invalid.token');
      }).toThrow(/debe constar de 3 segmentos/);
    });
  });

  describe('4. Inmutabilidad de Artefactos de Producción', () => {
    it('el contenido generado de pedidos-config.js para PROD coincide exactamente con la base original', () => {
      const content = buildRuntimeConfigContent(PROD_CONFIG, '0.1.0-beta2', 'production');
      expect(content).toContain("supabaseUrl: 'https://uwzgyirilafgnbpmrkic.supabase.co'");
      expect(content).toContain("environment: 'production'");
      expect(content).toContain("uiMode: 'production-preview'");
      expect(content).toContain("basePath: '/'");
      expect(content).toContain("publicAppUrl: 'https://formulariomedios.pages.dev'");
      expect(content).not.toContain(TEST_SUPABASE_REF);
    });

    it('el contenido generado de pedidos-config.js para TEST no contiene ninguna referencia a PROD', () => {
      const testConfigWithUrl = {
        ...TEST_CONFIG,
        publicAppUrl: 'https://preview-123.formulariomedios.pages.dev',
      };
      const content = buildRuntimeConfigContent(testConfigWithUrl, '0.1.0-beta2', 'test');
      expect(content).toContain("supabaseUrl: 'https://yqfkzgqvezarzhlwiilo.supabase.co'");
      expect(content).toContain("environment: 'staging'");
      expect(content).toContain("publicAppUrl: 'https://preview-123.formulariomedios.pages.dev'");
      expect(content).not.toContain(PROD_SUPABASE_REF);
      expect(content).not.toContain("publicAppUrl: 'https://formulariomedios.pages.dev'");
    });
  });
});
