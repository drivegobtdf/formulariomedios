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
      contractVersion: '3.0',
      supabaseUrl: 'https://custom-project.supabase.co',
      supabaseAnonKey: 'custom-key',
    };

    const config = getPublicConfig();
    // basePath debe normalizarse sin trailing slash
    expect(config.basePath).toBe('/sitio-medios/pedidos');
    expect(config.environment).toBe('production');
    expect(config.supabaseUrl).toBe('https://custom-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('custom-key');
  });
});
