import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  formatReworkHistoricalText,
  renderWorkflowStateBadge,
  renderReworkConditionBadge,
  renderPedidoStatusBundle,
} from '../../pedidos-medios/frontend/src/utils/statusBadges';

describe('statusBadges Helper Unit Tests', () => {
  describe('formatReworkHistoricalText', () => {
    it('formatea singular correctamente (1 -> 1 vez)', () => {
      expect(formatReworkHistoricalText(1)).toBe('1 vez');
    });

    it('formatea plural correctamente (2 -> 2 veces, 3 -> 3 veces)', () => {
      expect(formatReworkHistoricalText(2)).toBe('2 veces');
      expect(formatReworkHistoricalText(3)).toBe('3 veces');
      expect(formatReworkHistoricalText(10)).toBe('10 veces');
    });
  });

  describe('renderWorkflowStateBadge', () => {
    it('renderiza estados conocidos con estilo', () => {
      const { rerender } = render(renderWorkflowStateBadge('Nuevo'));
      expect(screen.getByText('Nuevo')).toBeInTheDocument();

      rerender(renderWorkflowStateBadge('En proceso'));
      expect(screen.getByText('En Proceso')).toBeInTheDocument();

      rerender(renderWorkflowStateBadge('Finalizado'));
      expect(screen.getByText('Finalizado')).toBeInTheDocument();
    });
  });

  describe('renderReworkConditionBadge', () => {
    it('retrabajo activo: renderiza DEVUELTO - RETRABAJAR · Rev #N', () => {
      render(renderReworkConditionBadge(true, 'En proceso', 2) || <div />);
      expect(screen.getByText(/DEVUELTO - RETRABAJAR · Rev #2/i)).toBeInTheDocument();
    });

    it('finalizado con historial (revision_count = 1): renderiza RETRABAJADO · 1 vez', () => {
      render(renderReworkConditionBadge(false, 'Finalizado', 1) || <div />);
      expect(screen.getByText('RETRABAJADO · 1 vez')).toBeInTheDocument();
    });

    it('finalizado con historial (revision_count = 3): renderiza RETRABAJADO · 3 veces', () => {
      render(renderReworkConditionBadge(false, 'Finalizado', 3) || <div />);
      expect(screen.getByText('RETRABAJADO · 3 veces')).toBeInTheDocument();
    });

    it('finalizado sin revisiones (revision_count = 0): retorna null', () => {
      const result = renderReworkConditionBadge(false, 'Finalizado', 0);
      expect(result).toBeNull();
    });

    it('en proceso sin retrabajo activo: retorna null', () => {
      const result = renderReworkConditionBadge(false, 'En proceso', 2);
      expect(result).toBeNull();
    });
  });

  describe('renderPedidoStatusBundle (Sección A & B)', () => {
    it('1. estado=Nuevo, retrabajo_activo=true, revision_count=1 -> muestra Nuevo Y DEVUELTO - RETRABAJAR', () => {
      render(renderPedidoStatusBundle('Nuevo', true, 1));
      expect(screen.getByText('Nuevo')).toBeInTheDocument();
      expect(screen.getByText(/DEVUELTO - RETRABAJAR · Rev #1/i)).toBeInTheDocument();
    });

    it('2. estado=En proceso, retrabajo_activo=true, revision_count=1 -> muestra En Proceso Y DEVUELTO - RETRABAJAR', () => {
      render(renderPedidoStatusBundle('En proceso', true, 1));
      expect(screen.getByText('En Proceso')).toBeInTheDocument();
      expect(screen.getByText(/DEVUELTO - RETRABAJAR · Rev #1/i)).toBeInTheDocument();
    });

    it('3. estado=Esperando información, retrabajo_activo=true -> muestra Esperando Información Y DEVUELTO - RETRABAJAR', () => {
      render(renderPedidoStatusBundle('Esperando información', true, 2));
      expect(screen.getByText('Esperando Información')).toBeInTheDocument();
      expect(screen.getByText(/DEVUELTO - RETRABAJAR · Rev #2/i)).toBeInTheDocument();
    });

    it('4. estado=Finalizado, retrabajo_activo=false, revision_count=0 -> solo Finalizado', () => {
      render(renderPedidoStatusBundle('Finalizado', false, 0));
      expect(screen.getByText('Finalizado')).toBeInTheDocument();
      expect(screen.queryByText(/RETRABAJ/i)).not.toBeInTheDocument();
    });

    it('5. estado=Finalizado, retrabajo_activo=false, revision_count=1 -> Finalizado Y RETRABAJADO · 1 vez', () => {
      render(renderPedidoStatusBundle('Finalizado', false, 1));
      expect(screen.getByText('Finalizado')).toBeInTheDocument();
      expect(screen.getByText('RETRABAJADO · 1 vez')).toBeInTheDocument();
    });

    it('6. estado=Finalizado, retrabajo_activo=false, revision_count=3 -> Finalizado Y RETRABAJADO · 3 veces', () => {
      render(renderPedidoStatusBundle('Finalizado', false, 3));
      expect(screen.getByText('Finalizado')).toBeInTheDocument();
      expect(screen.getByText('RETRABAJADO · 3 veces')).toBeInTheDocument();
    });
  });
});
