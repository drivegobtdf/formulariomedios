import { describe, it, expect } from 'vitest';
import { getSafeReturnTo } from '../utils/urlUtils';

describe('urlUtils — getSafeReturnTo Unit Tests', () => {
  it('1. Permite rutas internas exactas autorizadas', () => {
    expect(getSafeReturnTo('/gestion')).toBe('/gestion');
    expect(getSafeReturnTo('/usuarios')).toBe('/usuarios');
    expect(getSafeReturnTo('/mis-solicitudes')).toBe('/mis-solicitudes');
    expect(getSafeReturnTo('/solicitud-informacion')).toBe('/solicitud-informacion');
    expect(getSafeReturnTo('/nueva-solicitud')).toBe('/nueva-solicitud');
  });

  it('2. Permite rutas parametrizadas de pedidos (UUID, visible format, ids alfanuméricos)', () => {
    expect(getSafeReturnTo('/gestion/pedidos/ped-123')).toBe('/gestion/pedidos/ped-123');
    expect(getSafeReturnTo('/gestion/pedidos/p0000000-0000-0000-0000-000000000099')).toBe(
      '/gestion/pedidos/p0000000-0000-0000-0000-000000000099'
    );
    expect(getSafeReturnTo('/gestion/pedidos/PED-2026-D000155')).toBe(
      '/gestion/pedidos/PED-2026-D000155'
    );
    expect(getSafeReturnTo('/gestion/pedido/ped-123')).toBe('/gestion/pedido/ped-123');
    expect(getSafeReturnTo('/pedido/ped-123')).toBe('/pedido/ped-123');
  });

  it('3. Preserva query params y hashes en rutas autorizadas', () => {
    expect(getSafeReturnTo('/gestion/pedidos/ped-123?tab=archivos')).toBe(
      '/gestion/pedidos/ped-123?tab=archivos'
    );
    expect(getSafeReturnTo('/gestion/pedidos/ped-123#historial')).toBe(
      '/gestion/pedidos/ped-123#historial'
    );
    expect(getSafeReturnTo('/gestion/pedidos/ped-123?filter=all#notas')).toBe(
      '/gestion/pedidos/ped-123?filter=all#notas'
    );
    expect(getSafeReturnTo('/gestion?view=table&page=2')).toBe('/gestion?view=table&page=2');
  });

  it('4. Normaliza barras finales en rutas autorizadas', () => {
    expect(getSafeReturnTo('/gestion/')).toBe('/gestion');
    expect(getSafeReturnTo('/gestion/pedidos/ped-123/')).toBe('/gestion/pedidos/ped-123');
    expect(getSafeReturnTo('/gestion/pedidos/ped-123/?tab=archivos')).toBe(
      '/gestion/pedidos/ped-123?tab=archivos'
    );
  });

  it('5. Rechaza URLs externas y protocol-relative (Open Redirects) devolviendo /gestion', () => {
    expect(getSafeReturnTo('https://evil.example')).toBe('/gestion');
    expect(getSafeReturnTo('http://evil.example')).toBe('/gestion');
    expect(getSafeReturnTo('https://evil.example/gestion')).toBe('/gestion');
    expect(getSafeReturnTo('http://evil.example/gestion/pedidos/123')).toBe('/gestion');
    expect(getSafeReturnTo('//evil.example')).toBe('/gestion');
    expect(getSafeReturnTo('//evil.example/gestion')).toBe('/gestion');
    expect(getSafeReturnTo('/\\evil.example')).toBe('/gestion');
    expect(getSafeReturnTo('\\\\evil.example')).toBe('/gestion');
  });

  it('6. Rechaza esquemas maliciosos como javascript: y data:', () => {
    expect(getSafeReturnTo('javascript:alert(1)')).toBe('/gestion');
    expect(getSafeReturnTo('javascript:alert("XSS")')).toBe('/gestion');
    expect(getSafeReturnTo('data:text/html,<script>alert(1)</script>')).toBe('/gestion');
    expect(getSafeReturnTo('/javascript:alert(1)')).toBe('/gestion');
  });

  it('7. Rechaza valores vacíos, nulos, no strings o rutas no autorizadas', () => {
    expect(getSafeReturnTo('')).toBe('/gestion');
    expect(getSafeReturnTo('   ')).toBe('/gestion');
    expect(getSafeReturnTo(null)).toBe('/gestion');
    expect(getSafeReturnTo(undefined)).toBe('/gestion');
    expect(getSafeReturnTo('/login')).toBe('/gestion');
    expect(getSafeReturnTo('/')).toBe('/gestion'); // No debe permitir prefijo '/' genérico
    expect(getSafeReturnTo('/admin-desconocido')).toBe('/gestion');
    expect(getSafeReturnTo('/evil/path')).toBe('/gestion');
  });

  it('8. Respeta fallback personalizado cuando es provisto', () => {
    expect(getSafeReturnTo('https://evil.example', '/usuarios')).toBe('/usuarios');
    expect(getSafeReturnTo(null, '/mis-solicitudes')).toBe('/mis-solicitudes');
  });
});
