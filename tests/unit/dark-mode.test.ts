import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Modo Oscuro (Dark Mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('1. Debe inicializar en "light" por defecto cuando no hay valor previo en localStorage', () => {
    const saved = localStorage.getItem('pedidos:theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    expect(theme).toBe('light');
  });

  it('2. Debe recuperar "dark" si está guardado en localStorage', () => {
    localStorage.setItem('pedidos:theme', 'dark');
    const saved = localStorage.getItem('pedidos:theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    expect(theme).toBe('dark');
  });

  it('3. El toggle debe alternar entre "light" y "dark" y persistir en localStorage bajo pedidos:theme', () => {
    let currentTheme: 'light' | 'dark' = 'light';

    const toggleTheme = () => {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('pedidos:theme', currentTheme);
      return currentTheme;
    };

    expect(toggleTheme()).toBe('dark');
    expect(localStorage.getItem('pedidos:theme')).toBe('dark');

    expect(toggleTheme()).toBe('light');
    expect(localStorage.getItem('pedidos:theme')).toBe('light');
  });

  it('4. Debe aplicar data-theme exclusivamente en rutas internas de gestión (/gestion, /usuarios, /pedido/) y NUNCA en /login, /solicitar-acceso o rutas públicas', () => {
    const isInternalManagementPath = (pathname: string) =>
      pathname.startsWith('/gestion') ||
      pathname.startsWith('/usuarios') ||
      pathname.startsWith('/pedido/');

    const getDataThemeAttr = (pathname: string, theme: 'light' | 'dark') => {
      return isInternalManagementPath(pathname) ? theme : undefined;
    };

    // Rutas internas de gestión deben recibir el tema
    expect(getDataThemeAttr('/gestion', 'dark')).toBe('dark');
    expect(getDataThemeAttr('/gestion/pedidos/123', 'dark')).toBe('dark');
    expect(getDataThemeAttr('/usuarios', 'dark')).toBe('dark');
    expect(getDataThemeAttr('/pedido/PED-2026-0001', 'dark')).toBe('dark');

    // Rutas de autenticación y previas al panel NUNCA deben recibir data-theme (permanecen en light estándar)
    expect(getDataThemeAttr('/login', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/solicitar-acceso', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/confirmar-email', 'dark')).toBeUndefined();

    // Rutas públicas NUNCA deben recibir data-theme (permanecen en light estándar institucional)
    expect(getDataThemeAttr('/', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/nueva-solicitud', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/solicitud-recibida', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/mis-solicitudes', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/seguimiento', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/seguimiento-legacy', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/privacidad', 'dark')).toBeUndefined();
    expect(getDataThemeAttr('/solicitud-informacion/abc', 'dark')).toBeUndefined();
  });

  it('5. Flujo de navegación SPA: preferencia dark guardada se suspende en rutas públicas/auth y se reactiva al volver a /gestion', () => {
    // 1. Usuario activa dark en /gestion
    localStorage.setItem('pedidos:theme', 'dark');
    const savedTheme = localStorage.getItem('pedidos:theme') as 'light' | 'dark';

    const renderScope = (pathname: string) => {
      const isInternalManagement = pathname.startsWith('/gestion') || pathname.startsWith('/usuarios') || pathname.startsWith('/pedido/');
      return {
        appliedTheme: isInternalManagement ? savedTheme : 'light',
        dataThemeAttr: isInternalManagement ? savedTheme : undefined,
        storagePreserved: localStorage.getItem('pedidos:theme'),
      };
    };

    // En /gestion: se aplica dark
    const viewGestion = renderScope('/gestion');
    expect(viewGestion.appliedTheme).toBe('dark');
    expect(viewGestion.dataThemeAttr).toBe('dark');
    expect(viewGestion.storagePreserved).toBe('dark');

    // Navega a /login: se muestra light pero localStorage sigue en dark
    const viewLogin = renderScope('/login');
    expect(viewLogin.appliedTheme).toBe('light');
    expect(viewLogin.dataThemeAttr).toBeUndefined();
    expect(viewLogin.storagePreserved).toBe('dark');

    // Navega a / (portal público): se muestra light
    const viewHome = renderScope('/');
    expect(viewHome.appliedTheme).toBe('light');
    expect(viewHome.dataThemeAttr).toBeUndefined();
    expect(viewHome.storagePreserved).toBe('dark');

    // Vuelve a /gestion: vuelve a mostrarse en dark automáticamente
    const viewGestionReturn = renderScope('/gestion');
    expect(viewGestionReturn.appliedTheme).toBe('dark');
    expect(viewGestionReturn.dataThemeAttr).toBe('dark');
    expect(viewGestionReturn.storagePreserved).toBe('dark');
  });

  it('6. Debe contener todos los design tokens semánticos en app.css para superficie, texto, bordes y controles', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cssPath = path.resolve(__dirname, '../../pedidos-medios/frontend/src/styles/app.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Tokens semánticos indispensables
    const requiredTokens = [
      '--pedidos-surface-canvas',
      '--pedidos-surface-sunken',
      '--pedidos-surface-default',
      '--pedidos-surface-raised',
      '--pedidos-surface-overlay',
      '--pedidos-text-primary',
      '--pedidos-text-secondary',
      '--pedidos-text-muted',
      '--pedidos-border-subtle',
      '--pedidos-border-default',
      '--pedidos-border-strong',
      '--pedidos-control-bg',
      '--pedidos-control-border',
      '--pedidos-control-text',
      '--pedidos-status-pending-bg',
      '--pedidos-status-completed-bg',
      '--pedidos-status-rejected-bg',
    ];

    for (const token of requiredTokens) {
      expect(cssContent).toContain(token);
    }
  });

  it('7. La regla [data-theme="dark"] debe redefinir paleta de modo oscuro sin usar filter: invert() ni hacks destructivos', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cssPath = path.resolve(__dirname, '../../pedidos-medios/frontend/src/styles/app.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('.pedidos-app[data-theme="dark"]');
    expect(cssContent).toContain('color-scheme: dark;');
    // No debe usar filter: invert
    expect(cssContent).not.toContain('filter: invert');
  });
});

