import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatLocalDate } from '../../pedidos-medios/frontend/src/utils/formatUtils';
import { getHistorialEventInfo } from '../../pedidos-medios/frontend/src/pages/PedidoDetallePage';

const root = process.cwd();

describe('Cierre Integral Post-UAT: Verificaciones de Regresión y Nuevas Salvaguardas', () => {
  // ===========================================================================
  // 1. UAT-02: Solapamiento visual del resumen público
  // ===========================================================================
  describe('1. UAT-02: Jerarquía visual y contención en resumen público', () => {
    it('Step4Resumen.tsx separa el título del pedido en una fila dedicada sin colisionar con el header flex', () => {
      const step4 = fs.readFileSync(
        path.join(root, 'pedidos-medios/frontend/src/components/form/Step4Resumen.tsx'),
        'utf8'
      );
      expect(step4).toContain('pedidos-summary-piece-meta');
      expect(step4).toContain('pedidos-summary-piece-title-row');
      expect(step4).toContain('pedidos-summary-piece-title-label');
      expect(step4).toContain('pedidos-summary-piece-title-text');
      expect(step4).toContain('p.titulo_pedido');
    });

    it('app.css define flex column y contención word-break/overflow-wrap en títulos, correo y área de resumen', () => {
      const css = fs.readFileSync(
        path.join(root, 'pedidos-medios/frontend/src/styles/app.css'),
        'utf8'
      );
      expect(css).toContain('.pedidos-app .pedidos-summary-piece-header');
      expect(css).toContain('flex-direction: column;');
      expect(css).toContain('.pedidos-app .pedidos-summary-piece-title-row');
      expect(css).toContain('overflow-wrap: anywhere;');
      expect(css).toContain('.pedidos-app .pedidos-summary-item');
      expect(css).toContain('min-width: 0;');
      expect(css).toContain('.pedidos-app .pedidos-summary-item strong');
      expect(css).toContain('word-break: break-word;');
      expect(css).toContain('@media (max-width: 640px)');
    });
  });

  // ===========================================================================
  // 2. Zona Horaria Ushuaia (America/Argentina/Ushuaia)
  // ===========================================================================
  describe('2. Zona horaria unificada America/Argentina/Ushuaia', () => {
    it('formatLocalDate aplica estrictamente America/Argentina/Ushuaia a timestamps ISO con hora', () => {
      // 2026-11-10T01:30:00Z en UTC -> en Ushuaia (UTC-3) corresponde a las 22:30 del 09/11/2026
      const local = formatLocalDate('2026-11-10T01:30:00Z');
      expect(local).toBe('09/11/2026');
    });

    it('formatLocalDate preserva strings de sólo fecha YYYY-MM-DD sin desplazamiento', () => {
      expect(formatLocalDate('2026-11-10')).toBe('10/11/2026');
    });

    it('formatUtils.ts contiene explícitamente timeZone: America/Argentina/Ushuaia en formatLocalDate', () => {
      const fu = fs.readFileSync(
        path.join(root, 'pedidos-medios/frontend/src/utils/formatUtils.ts'),
        'utf8'
      );
      expect(fu).toContain("timeZone: 'America/Argentina/Ushuaia'");
    });

    it('PedidoDetallePage y componentes de gestión utilizan formateo seguro y unificado', () => {
      const detalle = fs.readFileSync(
        path.join(root, 'pedidos-medios/frontend/src/pages/PedidoDetallePage.tsx'),
        'utf8'
      );
      // No debe haber llamadas a toLocaleDateString('es-AR') sin timeZone
      const unescapedLocaleDate = /toLocaleDateString\('es-AR'\)/g;
      expect(detalle.match(unescapedLocaleDate)).toBeNull();
    });
  });

  // ===========================================================================
  // 3. Duplicados de asignación en historial
  // ===========================================================================
  describe('3. Deduplicación y proyección limpia de asignaciones', () => {
    it('getHistorialEventInfo formatea responsable_nuevo, responsable_anterior y motivo de forma legible', () => {
      const info = getHistorialEventInfo('pedido.assigned', {
        responsable_nuevo: 'Laura Pérez',
        responsable_anterior: 'Juan Gómez',
        motivo: 'Especialista en flyer',
      });
      expect(info.title).toBe('Asignación de Responsable');
      expect(info.desc).toContain('Laura Pérez');
      expect(info.desc).toContain('anterior: Juan Gómez');
      expect(info.desc).toContain('Especialista en flyer');
    });

    it('migración 20261112000004 excluye pedido.assigned de domain_events para evitar doble conteo', () => {
      const mig = fs.readFileSync(
        path.join(root, 'supabase/migrations/20261112000004_fix_pedido_get_historial_assignment_duplicates.sql'),
        'utf8'
      );
      expect(mig).toContain("de.event_name != 'pedido.assigned'");
      expect(mig).toContain("FROM public.pedido_asignaciones pa");
      expect(mig).toContain("GRANT EXECUTE ON FUNCTION public.pedido_get_historial(uuid) TO authenticated, service_role;");
    });
  });

  // ===========================================================================
  // 4. Configuración de Edge Functions y verify_jwt
  // ===========================================================================
  describe('4. Declaración en config.toml de Edge Functions', () => {
    it('config.toml declara explícitamente todas las funciones con verify_jwt = false excepto drive-download', () => {
      const toml = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8').replace(/\r\n/g, '\n');
      expect(toml).toContain('[functions.solicitante-delivery-download]\nverify_jwt = false');
      expect(toml).toContain('[functions.solicitante-revision-request]\nverify_jwt = false');
      expect(toml).toContain('[functions.solicitante-revision-envio]\nverify_jwt = false');
      expect(toml).toContain('[functions.admin-pedidos-purge]\nverify_jwt = false');
      expect(toml).toContain('[functions.drive-download]\nverify_jwt = true');
    });
  });
});
