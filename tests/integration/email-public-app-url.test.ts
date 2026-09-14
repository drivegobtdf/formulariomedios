/**
 * Tests de Resolucion y Validacion de URL Publica para Enlaces de Correo (Revision 3.0)
 * Proyecto: PEDIDOS - Secretaria de Medios
 *
 * Casos Verificados:
 * A. Base publica con /formulariomedios -> no pierde base path.
 * B. Preview Cloud -> nunca genera localhost:5173 cuando esta configurado.
 * C. CTA mantiene el mecanismo magic-link y token intactos.
 * D. Configuracion Cloud ausente/invalida -> error controlado (CONFIG_ERROR), sin fallback silencioso a dev.
 * E. URL final conduce exactamente a las rutas del router publico (/mis-solicitudes).
 */

import { describe, it, expect } from 'vitest';
import { resolvePublicAppUrl } from '../../supabase/functions/_shared/env.ts';
import {
  renderSubmissionCreatedEmail,
  renderMagicLinkEmail,
  renderInfoRequestedEmail,
  renderFinalizedEmail,
  renderCancelledEmail,
  renderEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';

describe('Resolucion de URL Publica y Enlaces de Correo (CTA / Magic Links)', () => {
  const previewCloudBaseUrl = 'http://localhost:4173/formulariomedios';
  const productionBaseUrl = 'https://pedidos.tierradelfuego.gob.ar/formulariomedios';

  describe('1. Funcion Canonica resolvePublicAppUrl', () => {
    it('A & B: Preserva el base path /formulariomedios y nunca genera localhost:5173 en Preview Cloud', () => {
      const resolved = resolvePublicAppUrl(previewCloudBaseUrl, false);
      expect(resolved).toBe('http://localhost:4173/formulariomedios');
      expect(resolved).not.toBe('http://localhost:5173');
      expect(resolved.endsWith('/formulariomedios')).toBe(true);
    });

    it('Elimina barras diagonales finales redundantes (trailing slashes)', () => {
      const resolvedWithTrailing = resolvePublicAppUrl('http://localhost:4173/formulariomedios///', false);
      expect(resolvedWithTrailing).toBe('http://localhost:4173/formulariomedios');

      const prodResolved = resolvePublicAppUrl(`${productionBaseUrl}/`, false);
      expect(prodResolved).toBe('https://pedidos.tierradelfuego.gob.ar/formulariomedios');
    });

    it('D: En entorno Cloud (isExplicitLocal = false), si falta configuracion debe fallar con CONFIG_ERROR', () => {
      expect(() => {
        resolvePublicAppUrl(undefined, false);
      }).toThrowError(/CONFIG_ERROR: PUBLIC_APP_URL no está configurado/);

      expect(() => {
        resolvePublicAppUrl('', false);
      }).toThrowError(/CONFIG_ERROR: PUBLIC_APP_URL no está configurado/);
    });

    it('D: Si la URL es sintacticamente invalida, arroja un error controlado', () => {
      expect(() => {
        resolvePublicAppUrl('not-a-valid-url', false);
      }).toThrowError(/CONFIG_ERROR: PUBLIC_APP_URL 'not-a-valid-url' no es una URL válida/);
    });

    it('En entorno local explicito (isExplicitLocal = true), permite localhost:5173 como fallback seguro', () => {
      const localResolved = resolvePublicAppUrl(undefined, true);
      expect(localResolved).toBe('http://localhost:5173');
    });
  });

  describe('2. Generacion de Enlaces de Correo con Base Path /formulariomedios', () => {
    it('A & E: Boton "Ver mis solicitudes" en email de confirmacion (pedido_ingresado)', () => {
      const rendered = renderSubmissionCreatedEmail(
        {
          nombre_apellido: 'Pablo Saldivia',
          pedidos: [
            { id: 'p1', pedido_visible: 'PED-2026-D000151', categoria: 'Diseño gráfico', tipo: 'Flyer' },
            { id: 'p2', pedido_visible: 'PED-2026-D000152', categoria: 'Diseño gráfico', tipo: 'Invitación' },
            { id: 'p3', pedido_visible: 'PED-2026-C000153', categoria: 'Cobertura', tipo: 'Eventos' },
          ],
        },
        previewCloudBaseUrl
      );

      const expectedPortalUrl = 'http://localhost:4173/formulariomedios/mis-solicitudes';
      expect(rendered.html).toContain(`href="${expectedPortalUrl}"`);
      expect(rendered.html).toContain('Ver mis solicitudes');
      expect(rendered.text).toContain(expectedPortalUrl);
      expect(rendered.html).not.toContain('http://localhost:5173/mis-solicitudes');
    });

    it('C & E: Magic Link con token criptografico preserva token y base path /formulariomedios', () => {
      const rawToken = '7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a';
      const rendered = renderMagicLinkEmail(
        {
          nombre_apellido: 'Pablo Saldivia',
          raw_token: rawToken,
        },
        previewCloudBaseUrl
      );

      const expectedAccessUrl = `http://localhost:4173/formulariomedios/mis-solicitudes#token=${rawToken}`;
      expect(rendered.html).toContain(`href="${expectedAccessUrl}"`);
      expect(rendered.html).toContain('Ingresar a Mis Solicitudes');
      expect(rendered.text).toContain(expectedAccessUrl);
      expect(rendered.html).not.toContain('http://localhost:5173/mis-solicitudes');
    });

    it('E: Email de Requerimiento de Informacion (48h) apunta al portal con base path', () => {
      const rendered = renderInfoRequestedEmail(
        {
          nombre_apellido: 'Pablo Saldivia',
          pedido_visible: 'PED-2026-D000151',
          mensaje: 'Adjuntar version en alta resolucion del logo',
          expires_at: '2026-09-16T18:00:00Z',
        },
        previewCloudBaseUrl
      );

      const expectedPortalUrl = 'http://localhost:4173/formulariomedios/mis-solicitudes';
      expect(rendered.html).toContain(`href="${expectedPortalUrl}"`);
      expect(rendered.html).toContain('Responder Requerimiento en el Portal');
      expect(rendered.text).toContain(expectedPortalUrl);
    });

    it('E: Email de Solicitud Finalizada apunta al portal con base path', () => {
      const rendered = renderFinalizedEmail(
        {
          nombre_apellido: 'Pablo Saldivia',
          pedido_visible: 'PED-2026-D000151',
          url_entrega: 'https://drive.google.com/drive/folders/sample_folder',
        },
        previewCloudBaseUrl
      );

      const expectedPortalUrl = 'http://localhost:4173/formulariomedios/mis-solicitudes';
      expect(rendered.html).toContain(`href="${expectedPortalUrl}"`);
      expect(rendered.html).toContain('Ver Detalle en Mis Solicitudes');
    });

    it('E: Email de Solicitud Cancelada apunta al portal con base path', () => {
      const rendered = renderCancelledEmail(
        {
          nombre_apellido: 'Pablo Saldivia',
          pedido_visible: 'PED-2026-D000151',
          motivo_cancelacion: 'Cancelado a solicitud del area requirente',
        },
        previewCloudBaseUrl
      );

      const expectedPortalUrl = 'http://localhost:4173/formulariomedios/mis-solicitudes';
      expect(rendered.html).toContain(`href="${expectedPortalUrl}"`);
      expect(rendered.html).toContain('Consultar en el Portal');
    });

    it('E: Email de Actualizacion de Estado (default) apunta al portal con base path', () => {
      const rendered = renderEmail(
        'cambio_estado',
        {
          nombre_apellido: 'Pablo Saldivia',
          pedido_visible: 'PED-2026-D000151',
          estado: 'En proceso',
        },
        previewCloudBaseUrl
      );

      const expectedPortalUrl = 'http://localhost:4173/formulariomedios/mis-solicitudes';
      expect(rendered.html).toContain(`href="${expectedPortalUrl}"`);
      expect(rendered.html).toContain('Ver en el Portal');
    });
  });
});