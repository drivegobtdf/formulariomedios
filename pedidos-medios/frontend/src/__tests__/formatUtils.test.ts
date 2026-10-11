import { describe, it, expect } from 'vitest';
import { formatFileSize, formatLocalDate, formatArchivoEstado, getServicioSolicitadoTexto } from '../utils/formatUtils';

describe('formatUtils Unit Tests', () => {
  describe('formatFileSize', () => {
    it('debe manejar valores nulos, indefinidos y NaN', () => {
      expect(formatFileSize(null)).toBe('Tamaño no disponible');
      expect(formatFileSize(undefined)).toBe('Tamaño no disponible');
      expect(formatFileSize(NaN)).toBe('Tamaño no disponible');
    });

    it('debe diferenciar un tamaño igual a cero (0 Bytes)', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('debe formatear tamaños en Bytes (< 1024)', () => {
      expect(formatFileSize(70)).toBe('70 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('debe formatear tamaños en KB (< 1 MB)', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(67577)).toBe('66.0 KB');
      expect(formatFileSize(500 * 1024)).toBe('500.0 KB');
    });

    it('debe formatear tamaños en MB (< 1 GB)', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
      expect(formatFileSize(2312466)).toBe('2.21 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10.00 MB');
    });

    it('debe formatear tamaños en GB (>= 1 GB)', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });
  });

  describe('formatLocalDate', () => {
    it('debe formatear fechas YYYY-MM-DD sin corrimiento de día por UTC', () => {
      expect(formatLocalDate('2026-09-30')).toBe('30/09/2026');
      expect(formatLocalDate('2026-01-01')).toBe('01/01/2026');
      expect(formatLocalDate('2026-12-31')).toBe('31/12/2026');
    });

    it('debe manejar strings vacíos o nulos', () => {
      expect(formatLocalDate(null)).toBe('');
      expect(formatLocalDate(undefined)).toBe('');
      expect(formatLocalDate('')).toBe('');
    });
  });

  describe('formatArchivoEstado', () => {
    it('debe traducir estados técnicos a español legible', () => {
      expect(formatArchivoEstado('verified')).toBe('Verificado en almacenamiento');
      expect(formatArchivoEstado('reserved')).toBe('En proceso de subida');
      expect(formatArchivoEstado('failed')).toBe('Error en almacenamiento');
      expect(formatArchivoEstado('pending')).toBe('Pendiente');
      expect(formatArchivoEstado(null)).toBe('Desconocido');
    });
  });

  describe('getServicioSolicitadoTexto', () => {
    it('debe combinar categoria y tipo cuando ambos están presentes', () => {
      expect(getServicioSolicitadoTexto({
        categoria_nombre: 'Prensa',
        tipo_nombre: 'Gacetilla de Prensa',
      })).toBe('Prensa — Gacetilla de Prensa');
    });

    it('debe retornar solo categoria cuando tipo no está presente', () => {
      expect(getServicioSolicitadoTexto({
        categoria_nombre: 'Fotografía',
        tipo_nombre: '',
      })).toBe('Fotografía');
    });

    it('debe retornar solo tipo cuando categoria no está presente', () => {
      expect(getServicioSolicitadoTexto({
        categoria_nombre: '',
        tipo_nombre: 'Spot Publicitario',
      })).toBe('Spot Publicitario');
    });

    it('debe resolver título directo del pedido si categoria y tipo están ausentes', () => {
      expect(getServicioSolicitadoTexto({
        categoria_nombre: '',
        tipo_nombre: '',
        titulo: 'Campaña Invierno 2026',
      })).toBe('Campaña Invierno 2026');
    });

    it('debe resolver título o servicio en informacion_especifica si categoria y tipo están ausentes', () => {
      expect(getServicioSolicitadoTexto({
        categoria_nombre: '',
        tipo_nombre: '',
        informacion_especifica: {
          titulo: 'Cobertura Audiovisual Acto Central',
        },
      })).toBe('Cobertura Audiovisual Acto Central');

      expect(getServicioSolicitadoTexto({
        categoria_nombre: '',
        tipo_nombre: '',
        informacion_especifica: {
          nombre_servicio: 'Diseño de Afiche Promocional',
        },
      })).toBe('Diseño de Afiche Promocional');
    });

    it('debe resolver propiedad anidada en pedido (modelo DB / RPC)', () => {
      expect(getServicioSolicitadoTexto({
        pedido: {
          categoria_nombre: 'Diseño Gráfico',
          tipo_nombre: 'Folleto Tríptico',
        },
      })).toBe('Diseño Gráfico — Folleto Tríptico');
    });

    it('debe retornar "—" únicamente si ningún dato está disponible (nunca " — ")', () => {
      expect(getServicioSolicitadoTexto(null)).toBe('—');
      expect(getServicioSolicitadoTexto({})).toBe('—');
      expect(getServicioSolicitadoTexto({ categoria_nombre: '', tipo_nombre: '' })).toBe('—');
    });
  });
});

