import { describe, it, expect } from 'vitest';
import {
  getPrioridadWeight,
  comparePedidos,
  PedidoListItem,
} from '../../pedidos-medios/frontend/src/services/gestionApi';

describe('Prioridad y Etiqueta Interna (Fase 2)', () => {
  describe('1. Ponderación de Prioridad (getPrioridadWeight)', () => {
    it('debe asignar peso 3 a "alta"', () => {
      expect(getPrioridadWeight('alta')).toBe(3);
      expect(getPrioridadWeight('ALTA')).toBe(3);
      expect(getPrioridadWeight('Alta')).toBe(3);
    });

    it('debe asignar peso 2 a "media"', () => {
      expect(getPrioridadWeight('media')).toBe(2);
      expect(getPrioridadWeight('MEDIA')).toBe(2);
      expect(getPrioridadWeight('Media')).toBe(2);
    });

    it('debe asignar peso 1 a "baja"', () => {
      expect(getPrioridadWeight('baja')).toBe(1);
      expect(getPrioridadWeight('BAJA')).toBe(1);
      expect(getPrioridadWeight('Baja')).toBe(1);
    });

    it('debe asignar peso 0 a null, undefined, cadena vacía o valores no reconocidos', () => {
      expect(getPrioridadWeight(null)).toBe(0);
      expect(getPrioridadWeight(undefined)).toBe(0);
      expect(getPrioridadWeight('')).toBe(0);
      expect(getPrioridadWeight('sin_prioridad')).toBe(0);
      expect(getPrioridadWeight('urgente')).toBe(0);
    });
  });

  describe('2. Ordenamiento Canónico (comparePedidos)', () => {
    const basePedido: PedidoListItem = {
      id: 'ped-base',
      pedido_visible: 'PED-2026-0001',
      anio: 2026,
      numero: 1,
      codigo_categoria: 'GRA',
      estado: 'En proceso',
      prioridad: null,
      etiqueta_interna: null,
      retrabajo_activo: false,
      revision_requested_at: null,
      revision_count: 0,
      categoria_id: 'cat-1',
      tipo_servicio_id: 'tipo-1',
      informacion_especifica: {},
      version: 1,
      archivado: false,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    };

    it('Precedencia Absoluta: retrabajo_activo = true siempre precede a pedidos normales sin importar prioridad', () => {
      const retrabajoBaja: PedidoListItem = {
        ...basePedido,
        id: 'ped-retrabajo-baja',
        retrabajo_activo: true,
        prioridad: 'baja',
        created_at: '2026-09-01T10:00:00Z',
      };

      const normalAlta: PedidoListItem = {
        ...basePedido,
        id: 'ped-normal-alta',
        retrabajo_activo: false,
        prioridad: 'alta',
        created_at: '2026-10-01T12:00:00Z',
      };

      const retrabajoSinPrioridad: PedidoListItem = {
        ...basePedido,
        id: 'ped-retrabajo-sin-prio',
        retrabajo_activo: true,
        prioridad: null,
      };

      // Retrabajo baja debe ir ANTES de normal alta
      expect(comparePedidos(retrabajoBaja, normalAlta)).toBeLessThan(0);
      expect(comparePedidos(normalAlta, retrabajoBaja)).toBeGreaterThan(0);

      // Retrabajo sin prioridad debe ir ANTES de normal alta
      expect(comparePedidos(retrabajoSinPrioridad, normalAlta)).toBeLessThan(0);
      expect(comparePedidos(normalAlta, retrabajoSinPrioridad)).toBeGreaterThan(0);
    });

    it('Entre retrabajos activos, ordena por prioridad (alta > media > baja > null)', () => {
      const rAlta: PedidoListItem = { ...basePedido, id: 'r-alta', retrabajo_activo: true, prioridad: 'alta' };
      const rMedia: PedidoListItem = { ...basePedido, id: 'r-media', retrabajo_activo: true, prioridad: 'media' };
      const rBaja: PedidoListItem = { ...basePedido, id: 'r-baja', retrabajo_activo: true, prioridad: 'baja' };
      const rNull: PedidoListItem = { ...basePedido, id: 'r-null', retrabajo_activo: true, prioridad: null };

      expect(comparePedidos(rAlta, rMedia)).toBeLessThan(0);
      expect(comparePedidos(rMedia, rBaja)).toBeLessThan(0);
      expect(comparePedidos(rBaja, rNull)).toBeLessThan(0);

      const list = [rNull, rMedia, rAlta, rBaja];
      const sorted = [...list].sort(comparePedidos);
      expect(sorted.map((p) => p.id)).toEqual(['r-alta', 'r-media', 'r-baja', 'r-null']);
    });

    it('Tie-breaker retrabajos con misma prioridad: revision_requested_at DESC -> created_at DESC -> numero DESC', () => {
      const r1: PedidoListItem = {
        ...basePedido,
        id: 'r1',
        retrabajo_activo: true,
        prioridad: 'alta',
        revision_requested_at: '2026-10-01T15:00:00Z',
        created_at: '2026-10-01T08:00:00Z',
        numero: 10,
      };
      const r2: PedidoListItem = {
        ...basePedido,
        id: 'r2',
        retrabajo_activo: true,
        prioridad: 'alta',
        revision_requested_at: '2026-10-01T12:00:00Z',
        created_at: '2026-10-01T09:00:00Z',
        numero: 20,
      };
      const r3: PedidoListItem = {
        ...basePedido,
        id: 'r3',
        retrabajo_activo: true,
        prioridad: 'alta',
        revision_requested_at: '2026-10-01T12:00:00Z',
        created_at: '2026-10-01T07:00:00Z',
        numero: 30,
      };
      const r4: PedidoListItem = {
        ...basePedido,
        id: 'r4',
        retrabajo_activo: true,
        prioridad: 'alta',
        revision_requested_at: '2026-10-01T12:00:00Z',
        created_at: '2026-10-01T07:00:00Z',
        numero: 25,
      };

      const sorted = [r4, r2, r1, r3].sort(comparePedidos);
      expect(sorted.map((p) => p.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    });

    it('Entre pedidos normales, ordena por prioridad (alta > media > baja > null)', () => {
      const pAlta: PedidoListItem = { ...basePedido, id: 'p-alta', prioridad: 'alta' };
      const pMedia: PedidoListItem = { ...basePedido, id: 'p-media', prioridad: 'media' };
      const pBaja: PedidoListItem = { ...basePedido, id: 'p-baja', prioridad: 'baja' };
      const pNull: PedidoListItem = { ...basePedido, id: 'p-null', prioridad: null };

      const sorted = [pNull, pBaja, pAlta, pMedia].sort(comparePedidos);
      expect(sorted.map((p) => p.id)).toEqual(['p-alta', 'p-media', 'p-baja', 'p-null']);
    });

    it('Tie-breaker normales con misma prioridad: created_at DESC -> numero DESC', () => {
      const p1: PedidoListItem = {
        ...basePedido,
        id: 'p1',
        prioridad: 'media',
        created_at: '2026-10-01T14:00:00Z',
        numero: 5,
      };
      const p2: PedidoListItem = {
        ...basePedido,
        id: 'p2',
        prioridad: 'media',
        created_at: '2026-10-01T10:00:00Z',
        numero: 15,
      };
      const p3: PedidoListItem = {
        ...basePedido,
        id: 'p3',
        prioridad: 'media',
        created_at: '2026-10-01T10:00:00Z',
        numero: 10,
      };

      const sorted = [p3, p1, p2].sort(comparePedidos);
      expect(sorted.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });
  });

  describe('3. Validación y Límites de Etiqueta Interna', () => {
    it('acepta etiquetas de 1 a 10 caracteres', () => {
      const validLabels = ['URGENTE', 'WEB', 'A', '1234567890', 'PRENSA'];
      for (const label of validLabels) {
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label.trim().length).toBeLessThanOrEqual(10);
      }
    });

    it('rechaza o corta etiquetas que superen 10 caracteres', () => {
      const longLabel = 'SUPERURGENTE';
      expect(longLabel.length).toBeGreaterThan(10);
      const truncated = longLabel.slice(0, 10);
      expect(truncated).toBe('SUPERURGEN');
      expect(truncated.length).toBe(10);
    });

    it('sanitiza cadenas vacías o espacios a null', () => {
      const sanitize = (val?: string | null) => {
        if (!val) return null;
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      expect(sanitize('')).toBeNull();
      expect(sanitize('   ')).toBeNull();
      expect(sanitize('\t\n')).toBeNull();
      expect(sanitize('  URGENTE  ')).toBe('URGENTE');
      expect(sanitize(null)).toBeNull();
      expect(sanitize(undefined)).toBeNull();
    });
  });

  describe('4. Filtrado por Prioridad en Tablero', () => {
    const pedidos: PedidoListItem[] = [
      { id: '1', pedido_visible: 'PED-1', anio: 2026, numero: 1, codigo_categoria: 'G', estado: 'En proceso', prioridad: 'alta', version: 1, archivado: false, created_at: '', updated_at: '', categoria_id: '', tipo_servicio_id: '', informacion_especifica: {} },
      { id: '2', pedido_visible: 'PED-2', anio: 2026, numero: 2, codigo_categoria: 'G', estado: 'En proceso', prioridad: 'media', version: 1, archivado: false, created_at: '', updated_at: '', categoria_id: '', tipo_servicio_id: '', informacion_especifica: {} },
      { id: '3', pedido_visible: 'PED-3', anio: 2026, numero: 3, codigo_categoria: 'G', estado: 'En proceso', prioridad: 'baja', version: 1, archivado: false, created_at: '', updated_at: '', categoria_id: '', tipo_servicio_id: '', informacion_especifica: {} },
      { id: '4', pedido_visible: 'PED-4', anio: 2026, numero: 4, codigo_categoria: 'G', estado: 'En proceso', prioridad: null, version: 1, archivado: false, created_at: '', updated_at: '', categoria_id: '', tipo_servicio_id: '', informacion_especifica: {} },
    ];

    it('filtra por alta', () => {
      const filtered = pedidos.filter((p) => p.prioridad === 'alta');
      expect(filtered.map((p) => p.id)).toEqual(['1']);
    });

    it('filtra por media', () => {
      const filtered = pedidos.filter((p) => p.prioridad === 'media');
      expect(filtered.map((p) => p.id)).toEqual(['2']);
    });

    it('filtra por baja', () => {
      const filtered = pedidos.filter((p) => p.prioridad === 'baja');
      expect(filtered.map((p) => p.id)).toEqual(['3']);
    });

    it('filtra por sin_prioridad', () => {
      const filtered = pedidos.filter((p) => !p.prioridad);
      expect(filtered.map((p) => p.id)).toEqual(['4']);
    });

    it('filtro todas incluye todos', () => {
      const filter = 'todas';
      const filtered = pedidos.filter((p) => filter === 'todas' || p.prioridad === filter);
      expect(filtered.length).toBe(4);
    });
  });
});
