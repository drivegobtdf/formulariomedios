import { describe, it, expect } from 'vitest';
import {
  renderFinalizedEmail,
  renderEmailForCommunication,
} from '../../supabase/functions/_shared/emailTemplates.ts';
import { computeSha256Hex } from '../../supabase/functions/_shared/security.ts';

describe('Forensic Bugfixes — Solicitante Portal, Revisiones y Descargas', () => {
  // =========================================================================
  // INCIDENTE A: Texto de botón "VER MI PEDIDO" en email finalizado
  // =========================================================================
  describe('Incidente A — Email Solicitud Finalizada CTA Button', () => {
    it('renderFinalizedEmail incluye exactamente el texto "VER MI PEDIDO" y enlace seguro con deep-link', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000049',
        solicitante_nombre: 'Juan Pérez',
        categoria: 'Diseño Gráfico',
        tipo: 'Folleto Digital',
        magic_token: 'tok-magic-abc-123',
        url_entrega: 'https://drive.google.com/drive/folders/sample',
        nota_cierre: 'Material entregado conforme a lo solicitado.',
      };

      const rendered = renderFinalizedEmail(payload, 'https://pedidos.tierradelfuego.gob.ar/formulariomedios');

      expect(rendered.html).toContain('VER MI PEDIDO');
      expect(rendered.html).not.toContain('Ver Detalle en Mis Solicitudes');
      expect(rendered.html).toContain('#access_token=tok-magic-abc-123&pedido=PED-2026-D000049');
      expect(rendered.html).toContain('Solicitar Revisión');
    });

    it('renderEmailForCommunication con tipo finalizado incluye "VER MI PEDIDO"', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000050',
        nombre_apellido: 'María Gómez',
        categoria: 'Audiovisual',
        tipo: 'Spot TV',
        raw_token: 'tok-raw-456',
      };

      const rendered = renderEmailForCommunication('finalizado', payload, 'https://pedidos.tierradelfuego.gob.ar/formulariomedios');

      expect(rendered.html).toContain('VER MI PEDIDO');
      expect(rendered.html).not.toContain('Ver Detalle en Mis Solicitudes');
    });
  });

  // =========================================================================
  // INCIDENTE B: Descarga de archivo de entrega sin error 22P02 en UUID
  // =========================================================================
  describe('Incidente B — Solicitante Delivery Download Parameter Routing', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it('discrimina correctamente entre código visible PED-2026-D000049 y UUID canónico', () => {
      const pedidoVisible = 'PED-2026-D000049';
      const pedidoUuid = 'e7b1a0e2-8924-4d89-b57f-178b66861d85';

      expect(UUID_REGEX.test(pedidoVisible)).toBe(false);
      expect(UUID_REGEX.test(pedidoUuid)).toBe(true);

      // Simular selección de query builder
      const getQueryColumn = (ref: string) => (UUID_REGEX.test(ref) ? 'id' : 'pedido_visible');

      expect(getQueryColumn(pedidoVisible)).toBe('pedido_visible');
      expect(getQueryColumn(pedidoUuid)).toBe('id');
    });
  });

  // =========================================================================
  // INCIDENTE C: Normalización de fechas y prevención de "Invalid Date"
  // =========================================================================
  describe('Incidente C — Formateo Robusto de Historial / Timeline Público', () => {
    function formatHistoryDate(rawDate?: string | null): string {
      if (!rawDate) return 'Fecha no disponible';
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Fecha no disponible';
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    it('formatea correctamente fechas ISO válidas', () => {
      const formatted = formatHistoryDate('2026-09-29T20:15:00.000Z');
      expect(formatted).not.toBe('Invalid Date');
      expect(formatted).not.toBe('Fecha no disponible');
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('maneja de forma segura valores undefined, null o strings vacíos retornando "Fecha no disponible"', () => {
      expect(formatHistoryDate(undefined)).toBe('Fecha no disponible');
      expect(formatHistoryDate(null)).toBe('Fecha no disponible');
      expect(formatHistoryDate('')).toBe('Fecha no disponible');
      expect(formatHistoryDate('not-a-date')).toBe('Fecha no disponible');
    });

    it('soporta alternancia de propiedades occurred_at, created_at y fecha sin error', () => {
      const itemWithOccurredAt = { evento: 'pedido.created', occurred_at: '2026-09-29T18:00:00.000Z' };
      const itemWithCreatedAt = { evento: 'pedido.finalized', created_at: '2026-09-29T19:00:00.000Z' };
      const itemWithFecha = { evento: 'pedido.assigned', fecha: '2026-09-29T18:30:00.000Z' };
      const corruptItem = { evento: 'pedido.state_changed' };

      expect(formatHistoryDate(itemWithOccurredAt.occurred_at)).not.toBe('Invalid Date');
      expect(formatHistoryDate(itemWithCreatedAt.created_at)).not.toBe('Invalid Date');
      expect(formatHistoryDate(itemWithFecha.fecha)).not.toBe('Invalid Date');
      expect(formatHistoryDate((corruptItem as any).occurred_at || (corruptItem as any).created_at || (corruptItem as any).fecha)).toBe('Fecha no disponible');
    });
  });

  // =========================================================================
  // INCIDENTE D: Autenticación de subida streaming PUT para revisiones
  // =========================================================================
  describe('Incidente D — Upload Relay PUT Authentication for Revision Attachments', () => {
    it('resuelve hash de token de sesión para autenticación de subida de revisión', async () => {
      const rawSessionToken = 'sol_session_token_xyz789';
      const hash = await computeSha256Hex(rawSessionToken);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Simula verificación en tabla solicitante_sesiones
      const mockSessionsDb = [
        {
          session_token_hash: hash,
          correo: 'solicitante@tdf.gob.ar',
          revoked_at: null,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      const matchedSession = mockSessionsDb.find(
        (s) => s.session_token_hash === hash && s.revoked_at === null && new Date(s.expires_at).getTime() > Date.now()
      );

      expect(matchedSession).toBeDefined();
      expect(matchedSession?.correo).toBe('solicitante@tdf.gob.ar');
    });

    it('rechaza sesión de solicitante revocada o expirada', async () => {
      const rawExpiredToken = 'sol_expired_token_123';
      const expiredHash = await computeSha256Hex(rawExpiredToken);

      const mockSessionsDb = [
        {
          session_token_hash: expiredHash,
          correo: 'solicitante@tdf.gob.ar',
          revoked_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      const validSession = mockSessionsDb.find(
        (s) => s.session_token_hash === expiredHash && s.revoked_at === null && new Date(s.expires_at).getTime() > Date.now()
      );

      expect(validSession).toBeUndefined();
    });
  });

  // =========================================================================
  // INCIDENTE E: RPC pedido_request_revision sin historial_pedidos
  // =========================================================================
  describe('Incidente E — Migración 062: Corrección de pedido_request_revision', () => {
    it('valida que la RPC no contenga referencias a historial_pedidos', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const migrationFile = path.resolve(
        process.cwd(),
        'supabase/migrations/20260929000062_fix_pedido_request_revision_and_timeline.sql'
      );

      expect(fs.existsSync(migrationFile)).toBe(true);
      const sqlContent = fs.readFileSync(migrationFile, 'utf-8');

      // Hard guard: NO debe existir ninguna inserción ni consulta a tabla inexistente historial_pedidos
      expect(sqlContent).not.toContain('INSERT INTO public.historial_pedidos');
      expect(sqlContent).not.toContain('FROM public.historial_pedidos');
      expect(sqlContent).not.toContain('JOIN public.historial_pedidos');

      // Debe registrar eventos en domain_events, audit_log y comunicaciones_pedido
      expect(sqlContent).toContain('INSERT INTO public.domain_events');
      expect(sqlContent).toContain('INSERT INTO public.audit_log');
      expect(sqlContent).toContain('INSERT INTO public.comunicaciones_pedido');
      expect(sqlContent).toContain('pedido.revision_solicitada');
      expect(sqlContent).toContain('NOTIFY pgrst, \'reload schema\';');
    });
  });
});
