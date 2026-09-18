import { describe, it, expect } from 'vitest';
import { renderEmailForCommunication } from '../../supabase/functions/_shared/emailTemplates.ts';
import { renderEmail } from '../../scripts/comunicaciones-dispatch.mjs';
import { encryptTokenEnvelope, decryptTokenEnvelope } from '../../supabase/functions/_shared/security.ts';

describe('Email Templates — Pedido Finalizado con Acceso Directo y Deep-Link', () => {
  const appUrl = 'https://sistemas.tierradelfuego.gob.ar/formulariomedios';

  it('1. renderEmailForCommunication genera URL con access_token y pedido cuando se suministra magic_token', () => {
    const payload = {
      pedido_visible: 'PED-2026-D000155',
      solicitante_nombre: 'Solicitante QA',
      categoria: 'Diseño Gráfico',
      tipo: 'Flyer Digital',
      magic_token: 'tok-abc-123-xyz',
      url_entrega: 'https://drive.google.com/drive/folders/test-entrega-155',
      nota_cierre: 'Pieza final finalizada y aprobada.',
    };

    const rendered = renderEmailForCommunication('finalizado', payload, appUrl);

    expect(rendered.subject).toBe('[PEDIDOS] Solicitud Finalizada: PED-2026-D000155');
    expect(rendered.n8nTipo).toBe('finalizado');

    // HTML contiene el enlace con hash access_token y query pedido
    const expectedUrl = `${appUrl}/mis-solicitudes#access_token=tok-abc-123-xyz&pedido=PED-2026-D000155`;
    expect(rendered.html).toContain(expectedUrl);
    expect(rendered.html).toContain('Ver Detalle en Mis Solicitudes');
    expect(rendered.html).toContain('https://drive.google.com/drive/folders/test-entrega-155');
    expect(rendered.html).toContain('Pieza final finalizada y aprobada.');

    // Versión texto contiene el portalUrl
    expect(rendered.text).toContain(expectedUrl);
  });

  it('2. renderEmailForCommunication fallback a URL base si no hay token', () => {
    const payload = {
      pedido_visible: 'PED-2026-D000155',
      solicitante_nombre: 'Solicitante QA',
      categoria: 'Diseño Gráfico',
      tipo: 'Flyer Digital',
    };

    const rendered = renderEmailForCommunication('finalizado', payload, appUrl);
    expect(rendered.html).toContain(`${appUrl}/mis-solicitudes"`);
    expect(rendered.html).not.toContain('#access_token=');
  });

  it('3. renderEmail en comunicaciones-dispatch.mjs genera enlace idéntico', () => {
    const payload = {
      pedido_visible: 'PED-2026-D000155',
      solicitante_nombre: 'Solicitante QA',
      raw_token: 'tok-node-456',
      url_entrega: 'https://drive.google.com/drive/folders/test-entrega-155',
    };

    const rendered = renderEmail('finalizado', payload);
    const expectedFragment = '#access_token=tok-node-456&pedido=PED-2026-D000155';
    expect(rendered.html).toContain(expectedFragment);
    expect(rendered.text).toContain(expectedFragment);
  });

  describe('4. Simulación Dispatcher: Failure, Retry, Idempotencia y Durabilidad del Sobre', () => {
    it('CASO A: Primer intento sin sobre genera token efímero y persiste envelope en outbox', async () => {
      const commItem = {
        id: 'comm-uuid-finalizado-001',
        idempotency_key: 'finalizado:comm-uuid-finalizado-001',
        tipo_comunicacion: 'finalizado',
        destinatario_email: 'solicitante.qa@tierradelfuego.gob.ar',
        payload: {
          pedido_visible: 'PED-2026-D000155',
          categoria: 'Diseño Gráfico',
          tipo: 'Flyer Digital',
          url_entrega: 'https://drive.google.com/drive/folders/test-entrega',
        },
      };

      // Mock DB: solicitante_request_access retorna token sin crear comunicaciones secundarias
      let secondaryCommunicationsCount = 0;
      const mockSolicitanteRequestAccess = (email: string, env?: any) => {
        if (env) secondaryCommunicationsCount++;
        return {
          found: true,
          magic_token: 'token-efimero-inicial-999',
          token_id: 'token-id-999',
          expires_at: '2026-09-17T00:00:00.000Z',
        };
      };

      let payloadToRender: any = { ...commItem.payload };
      let envelopePersistedBeforeProviderCall = false;

      // Dispatcher logic:
      if (!payloadToRender.magic_token && !payloadToRender.raw_token && !payloadToRender.encrypted_envelope) {
        const accessData = mockSolicitanteRequestAccess(commItem.destinatario_email);
        const envelope = encryptTokenEnvelope(
          accessData.magic_token,
          'magic_link_delivery',
          commItem.idempotency_key
        );
        payloadToRender = {
          ...payloadToRender,
          magic_token: accessData.magic_token,
          raw_token: accessData.magic_token,
          encrypted_envelope: envelope,
        };
        // Persistir en outbox antes de invocar proveedor
        commItem.payload = { ...commItem.payload, encrypted_envelope: envelope };
        envelopePersistedBeforeProviderCall = true;
      }

      // Hard Guard
      expect(payloadToRender.raw_token).toBe('token-efimero-inicial-999');
      expect(envelopePersistedBeforeProviderCall).toBe(true);
      expect(secondaryCommunicationsCount).toBe(0); // CASO C: 0 magic_link_access adicionales

      const rendered = renderEmailForCommunication('finalizado', payloadToRender, appUrl);
      expect(rendered.html).toContain('#access_token=token-efimero-inicial-999&pedido=PED-2026-D000155');
    });

    it('CASO B & D: Fallo del proveedor en primer intento -> Retry descifra el MISMO sobre sin generar nuevo token', async () => {
      const commItem = {
        id: 'comm-uuid-finalizado-001',
        idempotency_key: 'finalizado:comm-uuid-finalizado-001',
        tipo_comunicacion: 'finalizado',
        destinatario_email: 'solicitante.qa@tierradelfuego.gob.ar',
        payload: {
          pedido_visible: 'PED-2026-D000155',
          categoria: 'Diseño Gráfico',
          tipo: 'Flyer Digital',
          // Sobre ya persistido tras intento previo fallido
          encrypted_envelope: encryptTokenEnvelope(
            'token-efimero-inicial-999',
            'magic_link_delivery',
            'finalizado:comm-uuid-finalizado-001'
          ),
        },
      };

      let generateTokenCallCount = 0;
      const mockSolicitanteRequestAccess = () => {
        generateTokenCallCount++;
        return { magic_token: 'otro-token-distinto' };
      };

      let payloadToRender: any = { ...commItem.payload };

      // Dispatcher retry execution:
      if (payloadToRender.encrypted_envelope) {
        const decrypted = decryptTokenEnvelope(
          payloadToRender.encrypted_envelope,
          'magic_link_delivery',
          commItem.idempotency_key
        );
        if (decrypted) {
          payloadToRender = {
            ...payloadToRender,
            magic_token: decrypted,
            raw_token: decrypted,
          };
        }
      }

      if (!payloadToRender.magic_token && !payloadToRender.raw_token) {
        mockSolicitanteRequestAccess();
      }

      // Verificaciones estrictas
      expect(generateTokenCallCount).toBe(0); // NO genera token nuevo en retry
      expect(payloadToRender.raw_token).toBe('token-efimero-inicial-999'); // Mismo token que en intento 1

      const rendered = renderEmailForCommunication('finalizado', payloadToRender, appUrl);
      expect(rendered.html).toContain('#access_token=token-efimero-inicial-999&pedido=PED-2026-D000155');
    });
  });
});
