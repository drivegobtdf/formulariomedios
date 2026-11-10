import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatHistoryDate, formatIngresoDateTime } from '../../pedidos-medios/frontend/src/utils/formatUtils';

const root = process.cwd();
const appCss = readFileSync(join(root, 'pedidos-medios/frontend/src/styles/app.css'), 'utf8').replace(/\r\n/g, '\n');
const misSolicitudes = readFileSync(join(root, 'pedidos-medios/frontend/src/pages/MisSolicitudesPage.tsx'), 'utf8').replace(/\r\n/g, '\n');
const cargaInterna = readFileSync(join(root, 'pedidos-medios/frontend/src/components/CargaInternaModal.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Paquete 3 Post-QA: INC-01, INC-03 e INC-09 (UX, Accesibilidad, Fechas y Carga Interna)', () => {
  // ===========================================================================
  // INC-01: Accesibilidad y Contraste WCAG AA
  // ===========================================================================
  describe('INC-01: Contraste WCAG AA en selectores, opciones y botones secundarios', () => {
    it('1.1. Selectores nativos (.pedidos-linear-select) cumplen WCAG AA (borde >= 3:1, texto >= 4.5:1) en modo claro y oscuro', () => {
      // Modo claro: borde #64748b (4.76:1 >= 3:1), texto #0f172a (17.85:1 >= 4.5:1)
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-linear-select');
      expect(appCss).toContain('border: 1px solid #64748b;');
      expect(appCss).toContain('color: #0f172a;');
      expect(appCss).toContain('outline: 2px solid #0284c7;');

      // Modo oscuro: borde var(--color-ash, #62666d) (3.30:1 >= 3:1), texto var(--color-mist, #d0d6e0) (13.04:1 >= 4.5:1)
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .pedidos-linear-select');
      expect(appCss).toContain('border: 1px solid var(--color-ash, #62666d);');
      expect(appCss).toContain('color: var(--color-mist, #d0d6e0);');
      expect(appCss).toContain('outline: 2px solid #38bdf8;');
    });

    it('1.2. Opciones <option> tienen colores explícitos para Chromium/Windows en claro y oscuro', () => {
      expect(appCss).toContain('.pedidos-app:not([data-theme="dark"]) select option');
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-linear-select option');
      expect(appCss).toContain('background-color: #ffffff;\n  color: #0f172a;');

      expect(appCss).toContain('.pedidos-app[data-theme="dark"] select option');
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .pedidos-linear-select option');
      expect(appCss).toContain('background-color: #1e293b;\n  color: #f8fafc;');
    });

    it('1.3. Botones de filtro (.pedidos-linear-tag-btn) tienen bordes y textos WCAG AA', () => {
      // Modo claro
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-linear-tag-btn');
      expect(appCss).toContain('border: 1px solid #64748b;');
      expect(appCss).toContain('color: #0f172a;');
      expect(appCss).toContain('border-color: #334155;');

      // Modo oscuro
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .pedidos-linear-tag-btn');
      expect(appCss).toContain('border: 1px solid var(--color-ash, #62666d);');
      expect(appCss).toContain('border-color: var(--color-fog, #8a8f98);');
    });

    it('1.4. Prioridad "sin prioridad" garantiza contraste de texto >= 4.5:1 y borde >= 3:1', () => {
      // Modo claro: #334155 vs #f8fafc -> 9.90:1 (>= 4.5:1); border #64748b vs #f8fafc -> 4.55:1 (>= 3:1)
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .prioridad-sin-prioridad');
      expect(appCss).toContain('color: #334155 !important;');
      expect(appCss).toContain('border-color: #64748b !important;');

      // Modo oscuro: mist #d0d6e0 vs #0f1011 -> 13.04:1 (>= 4.5:1); border fog #8a8f98 vs #0f1011 -> 5.86:1 (>= 3:1)
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .prioridad-sin-prioridad');
      expect(appCss).toContain('color: var(--color-mist, #d0d6e0) !important;');
      expect(appCss).toContain('border-color: var(--color-fog, #8a8f98) !important;');
    });

    it('1.5. Botón secundario (.pedidos-btn-secondary) cumple WCAG AA en estados normal, hover, focus y disabled', () => {
      // Modo claro
      expect(appCss).toContain('.pedidos-app .pedidos-btn-secondary');
      expect(appCss).toContain('background-color: #f8fafc;\n  border: 1px solid #64748b;\n  color: #0f172a;');
      expect(appCss).toContain('.pedidos-app .pedidos-btn-secondary:hover:not(:disabled)');
      expect(appCss).toContain('border-color: #334155;');
      expect(appCss).toContain('.pedidos-app .pedidos-btn-secondary:focus-visible');
      expect(appCss).toContain('border-color: #0284c7;');
      expect(appCss).toContain('.pedidos-app .pedidos-btn-secondary:disabled');
      expect(appCss).toContain('color: #64748b;');

      // Modo oscuro
      expect(appCss).toContain('.pedidos-app[data-theme="dark"] .pedidos-btn-secondary');
      expect(appCss).toContain('border: 1px solid var(--color-ash, #62666d);');
      expect(appCss).toContain('color: var(--color-mist, #d0d6e0);');
      expect(appCss).toContain('border-color: var(--color-fog, #8a8f98);');
      expect(appCss).toContain('border-color: #38bdf8;');
    });

    it('1.6. Botones de paginación (.pedidos-pagination-btn) tienen bordes y textos reforzados', () => {
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-pagination-btn');
      expect(appCss).toContain('border-color: #64748b;\n  color: #0f172a;');
      expect(appCss).toContain('border-color: #334155;');
      expect(appCss).toContain('border-color: var(--color-ash, #62666d);');
    });

    it('1.7. Menú desplegable custom (.pedidos-linear-dropdown-menu) posee bordes contrastados >= 3:1', () => {
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-linear-dropdown-menu');
      expect(appCss).toContain('border: 1px solid #64748b;');
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .pedidos-linear-dropdown-menu');
      expect(appCss).toContain('border: 1px solid var(--color-ash, #62666d);');
    });
  });

  // ===========================================================================
  // INC-03: Unificación de Formato de Fechas en Portal Solicitante
  // ===========================================================================
  describe('INC-03: Unificación de fechas a DD/MM/AAAA HH:mm en zona horaria Ushuaia', () => {
    it('3.1. formatHistoryDate formatea fechas ISO a DD/MM/AAAA HH:mm delegando a formatIngresoDateTime', () => {
      // 2026-11-10T15:30:00Z en America/Argentina/Ushuaia (UTC-3) -> 10/11/2026 12:30
      const formatted = formatHistoryDate('2026-11-10T15:30:00Z');
      expect(formatted).toBe('10/11/2026 12:30');
    });

    it('3.2. formatHistoryDate maneja valores nulos, vacíos o fechas inválidas devolviendo fallback seguro', () => {
      expect(formatHistoryDate(null)).toBe('Fecha no disponible');
      expect(formatHistoryDate(undefined)).toBe('Fecha no disponible');
      expect(formatHistoryDate('')).toBe('Fecha no disponible');
      expect(formatHistoryDate('   ')).toBe('Fecha no disponible');
      expect(formatHistoryDate('fecha-invalida')).toBe('Fecha no disponible');
    });

    it('3.3. formatIngresoDateTime mantiene consistencia estricta en zona horaria America/Argentina/Ushuaia', () => {
      const dt = formatIngresoDateTime('2026-05-01T03:00:00Z');
      // UTC 03:00 del 1 de mayo -> Medianoche 00:00 del 1 de mayo en Ushuaia
      expect(dt).toBe('01/05/2026 00:00');
    });

    it('3.4. MisSolicitudesPage utiliza formatIngresoDateTime para revisiones, vencimientos y versiones finalizadas', () => {
      // Revisión activa
      expect(misSolicitudes).toContain('Solicitada: {formatIngresoDateTime(selectedPedido.revision_activa.requested_at)}');
      // Vencimiento de solicitud de información
      expect(misSolicitudes).toContain('const venceStr = formatIngresoDateTime(s.expires_at) || s.expires_at;');
      // Versión finalizada
      expect(misSolicitudes).toContain('Finalizado: {formatIngresoDateTime(v.finalizado_at)}');
      // No debe contener toLocaleDateString() sin hora para finalizado_at
      expect(misSolicitudes).not.toContain('v.finalizado_at).toLocaleDateString');
    });
  });

  // ===========================================================================
  // INC-09: Título y Aclaración en Modal de Carga Interna
  // ===========================================================================
  describe('INC-09: Carga Interna — Eliminación de (Opcional) y aclaración de obligatoriedad', () => {
    it('9.1. El encabezado de la Sección 2 en CargaInternaModal ya no incluye (Opcional)', () => {
      expect(cargaInterna).toContain('<h3 className="pedidos-modal-section-title">\n                2. Solicitante / Organismo\n              </h3>');
      expect(cargaInterna).not.toContain('2. Solicitante / Organismo (Opcional)');
    });

    it('9.2. CargaInternaModal incluye la aclaración explícita sobre correo obligatorio y demás campos opcionales', () => {
      expect(cargaInterna).toContain(
        'El correo electrónico es obligatorio para el seguimiento. Nombre, área y teléfono son opcionales.'
      );
      expect(cargaInterna).toContain('className="pedidos-modal-section-hint"');
    });

    it('9.3. El campo solicitanteCorreo conserva el atributo required y la marca visual obligatoria', () => {
      expect(cargaInterna).toContain('id="input-solicitante-correo"');
      expect(cargaInterna).toContain('value={solicitanteCorreo}');
      expect(cargaInterna).toContain('required');
      expect(cargaInterna).toContain('Correo electrónico del solicitante *');
    });

    it('9.4. app.css define la clase .pedidos-modal-section-hint con contraste y tipografía adecuada', () => {
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide .pedidos-modal-section-hint');
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide:not([data-theme="dark"]) .pedidos-modal-section-hint');
      expect(appCss).toContain('color: #475569;');
      expect(appCss).toContain('.pedidos-app.pedidos-app-wide[data-theme="dark"] .pedidos-modal-section-hint');
      expect(appCss).toContain('color: var(--color-fog, #8a8f98);');
    });
  });
});
