import { describe, it, expect } from 'vitest';
import { formatFileSize, formatLocalDate, formatArchivoEstado } from '../utils/formatUtils';

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
});
