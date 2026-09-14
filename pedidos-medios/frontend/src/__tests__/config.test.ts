import { describe, it, expect, beforeEach } from 'vitest';
import { getPublicConfig } from '../services/config';

describe('getPublicConfig', () => {
  beforeEach(() => {
    delete window.__PEDIDOS_CONFIG__;
  });

  it('debe retornar la configuración por defecto cuando window.__PEDIDOS_CONFIG__ no está definido', () => {
    const config = getPublicConfig();
    expect(config.basePath).toBe('/formulariomedios');
    expect(config.contractVersion).toBe('3.0');
    expect(config.environment).toBe('development');
    expect(config.supabaseUrl).toContain('supabase.co');
  });

  it('debe priorizar los valores inyectados por WordPress en window.__PEDIDOS_CONFIG__', () => {
    window.__PEDIDOS_CONFIG__ = {
      basePath: '/sitio-medios/pedidos/',
      environment: 'production',
      uiMode: 'production-preview',
      contractVersion: '3.0',
      supabaseUrl: 'https://custom-project.supabase.co',
      supabaseAnonKey: 'custom-key',
    };

    const config = getPublicConfig();
    // basePath debe normalizarse sin trailing slash
    expect(config.basePath).toBe('/sitio-medios/pedidos');
    expect(config.environment).toBe('production');
    expect(config.uiMode).toBe('production-preview');
    expect(config.supabaseUrl).toBe('https://custom-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('custom-key');
  });

  it('debe resolver uiMode = production-preview cuando environment es production o uiMode es production-preview', () => {
    window.__PEDIDOS_CONFIG__ = {
      environment: 'production',
    };
    expect(getPublicConfig().uiMode).toBe('production-preview');

    window.__PEDIDOS_CONFIG__ = {
      uiMode: 'production-preview',
    };
    expect(getPublicConfig().uiMode).toBe('production-preview');
  });

  it('debe resolver uiMode = development cuando uiMode es development o por defecto', () => {
    window.__PEDIDOS_CONFIG__ = {
      uiMode: 'development',
      environment: 'development',
    };
    expect(getPublicConfig().uiMode).toBe('development');
  });
});
