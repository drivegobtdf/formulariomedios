import { describe, it, expect } from 'vitest';
import { renderEmail as renderDispatchEmail } from '../../scripts/comunicaciones-dispatch.mjs';
import {
  renderEmail as renderSharedEmail,
  renderInfoRequestedEmail,
  renderInfoRespondedEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';

describe('INC-10: Plazos en comunicaciones y sincronización de plantillas (72h / 48h)', () => {
  const customAppUrl = 'https://formulariomedios.pages.dev';

  describe('1. scripts/comunicaciones-dispatch.mjs — renderEmail', () => {
    it('1.1. solicitud_info con plazo explícito de 72h genera asunto, banner HTML y texto plano sincronizados', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000100',
        nombre_apellido: 'Laura Solicitante',
        plazo_horas: 72,
        categoria: 'Diseño Gráfico',
        tipo: 'Folleto',
        mensaje: 'Se solicita adjuntar manual de marca actualizado',
        expires_at: '2026-11-13T15:00:00.000Z',
      };

      const result = renderDispatchEmail('solicitud_info', payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Requerimiento de Información (72h): PED-2026-D000100');
      expect(result.html).toContain('Dispone de 72 HORAS CORRIDAS para responder este requerimiento');
      expect(result.html).not.toContain('48 HORAS CORRIDAS');
      expect(result.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (72 HORAS CORRIDAS)');
      expect(result.text).toContain('Dispone de 72 horas corridas');
      expect(result.text).not.toContain('(48 HORAS CORRIDAS)');
      expect(result.n8nTipo).toBe('informacion_faltante');
    });

    it('1.2. solicitud_info histórica con plazo explícito de 48h respeta 48h en asunto, HTML y texto plano', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000005',
        nombre_apellido: 'Juan Histórico',
        plazo_horas: 48,
        categoria: 'Audiovisual',
        tipo: 'Spot',
        mensaje: 'Adjuntar locución previa',
        expires_at: '2026-10-05T12:00:00.000Z',
      };

      const result = renderDispatchEmail('informacion_faltante', payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Requerimiento de Información (48h): PED-2026-D000005');
      expect(result.html).toContain('Dispone de 48 HORAS CORRIDAS para responder este requerimiento');
      expect(result.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (48 HORAS CORRIDAS)');
      expect(result.text).toContain('Dispone de 48 horas corridas');
    });

    it('1.3. solicitud_info sin plazo_horas explícito calcula dinámicamente las horas a partir de expires_at y created_at', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000101',
        nombre_apellido: 'Carla Solicitante',
        created_at: '2026-11-10T10:00:00.000Z',
        expires_at: '2026-11-13T10:00:00.000Z', // 72 horas después
        mensaje: 'Aclarar destinatario de la pieza',
      };

      const result = renderDispatchEmail('solicitud_info', payload, customAppUrl);

      expect(result.subject).toContain('(72h)');
      expect(result.html).toContain('Dispone de 72 HORAS CORRIDAS');
      expect(result.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (72 HORAS CORRIDAS)');
    });

    it('1.4. solicitud_info sin ningún dato de plazo ni fechas genera asunto y banner neutros fail-safe', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000102',
        nombre_apellido: 'Esteban Solicitante',
        mensaje: 'Aclaración general',
      };

      const result = renderDispatchEmail('solicitud_info', payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Requerimiento de Información: PED-2026-D000102');
      expect(result.subject).not.toContain('(48h)');
      expect(result.subject).not.toContain('(72h)');
      expect(result.html).toContain('Debe responder este requerimiento antes de su vencimiento');
      expect(result.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA\n');
      expect(result.text).toContain('Debe responder este requerimiento antes de su vencimiento');
    });

    it('1.5. informacion_respondida con plazo de 72h genera encabezado HTML y texto plano de 72 h', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000100',
        pedido_id: 'p0000000-0000-0000-0000-000000000100',
        nombre_apellido: 'Responsable Diseñador',
        solicitante_nombre: 'Laura Solicitante',
        area_solicitante: 'Turismo',
        plazo_horas: 72,
      };

      const result = renderDispatchEmail('informacion_respondida', payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Información respondida: PED-2026-D000100');
      expect(result.html).toContain('Respuesta a Solicitud de Información (72 h)');
      expect(result.html).not.toContain('(48 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (72 H)');
      expect(result.text).not.toContain('(48 H)');
      expect(result.n8nTipo).toBe('informacion_respondida');
    });

    it('1.6. informacion_respondida histórica de 48h conserva 48 h en HTML y texto', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000005',
        pedido_id: 'p0000000-0000-0000-0000-000000000005',
        nombre_apellido: 'Responsable Histórico',
        plazo_horas: 48,
      };

      const result = renderDispatchEmail('informacion_respondida', payload, customAppUrl);

      expect(result.html).toContain('Respuesta a Solicitud de Información (48 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (48 H)');
    });

    it('1.7. informacion_respondida sin plazo_horas pero con expires_at y created_at deriva plazo dinámicamente', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000103',
        pedido_id: 'p0000000-0000-0000-0000-000000000103',
        nombre_apellido: 'Responsable Operador',
        created_at: '2026-11-01T12:00:00.000Z',
        expires_at: '2026-11-04T12:00:00.000Z', // 72 horas
      };

      const result = renderDispatchEmail('informacion_respondida', payload, customAppUrl);

      expect(result.html).toContain('Respuesta a Solicitud de Información (72 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (72 H)');
    });
  });

  describe('2. supabase/functions/_shared/emailTemplates.ts — renderSharedEmail / renderInfoRequestedEmail / renderInfoRespondedEmail', () => {
    it('2.1. renderInfoRequestedEmail aplica 72h en asunto, banner y texto plano', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000200',
        nombre_apellido: 'Elena Solicitante',
        plazo_horas: 72,
        mensaje: 'Aportar fotos en alta definición',
        expires_at: '2026-11-15T18:00:00.000Z',
      };

      const result = renderInfoRequestedEmail(payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Requerimiento de Información (72h): PED-2026-D000200');
      expect(result.html).toContain('Dispone de 72 HORAS CORRIDAS para responder este requerimiento');
      expect(result.text).toContain('REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (72 HORAS CORRIDAS)');
      expect(result.text).toContain('Dispone de 72 horas corridas');
    });

    it('2.2. renderInfoRespondedEmail con 72h sincroniza título de encabezado HTML y texto plano', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000200',
        pedido_id: 'p0000000-0000-0000-0000-000000000200',
        nombre_apellido: 'Pedro Responsable',
        solicitante_nombre: 'Elena Solicitante',
        area_solicitante: 'Educación',
        plazo_horas: 72,
      };

      const result = renderInfoRespondedEmail(payload, customAppUrl);

      expect(result.subject).toBe('[PEDIDOS] Información respondida: PED-2026-D000200');
      expect(result.html).toContain('Respuesta a Solicitud de Información (72 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (72 H)');
      expect(result.html).not.toContain('48 h');
      expect(result.text).not.toContain('48 H');
    });

    it('2.3. renderInfoRespondedEmail histórica de 48h conserva 48 h en HTML y texto', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000008',
        pedido_id: 'p0000000-0000-0000-0000-000000000008',
        nombre_apellido: 'Pedro Responsable',
        solicitante_nombre: 'Mariana Histórica',
        area_solicitante: 'Salud',
        plazo_horas: 48,
      };

      const result = renderInfoRespondedEmail(payload, customAppUrl);

      expect(result.html).toContain('Respuesta a Solicitud de Información (48 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (48 H)');
    });

    it('2.4. renderInfoRespondedEmail calcula dinámicamente horas si faltan en payload pero existen expires_at y created_at', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000205',
        pedido_id: 'p0000000-0000-0000-0000-000000000205',
        nombre_apellido: 'Pedro Responsable',
        created_at: '2026-11-05T09:00:00.000Z',
        expires_at: '2026-11-08T09:00:00.000Z', // 72h
      };

      const result = renderInfoRespondedEmail(payload, customAppUrl);

      expect(result.html).toContain('Respuesta a Solicitud de Información (72 h)');
      expect(result.text).toContain('RESPUESTA A SOLICITUD DE INFORMACIÓN (72 H)');
    });

    it('2.5. renderInfoRespondedEmail sin plazo emite encabezado neutro sin horas fijas', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000206',
        pedido_id: 'p0000000-0000-0000-0000-000000000206',
        nombre_apellido: 'Pedro Responsable',
      };

      const result = renderInfoRespondedEmail(payload, customAppUrl);

      expect(result.html).toContain('Respuesta a Solicitud de Información');
      expect(result.html).not.toContain('(48 h)');
      expect(result.html).not.toContain('(72 h)');
      expect(result.text).toContain('INFORMACIÓN RESPONDIDA');
    });

    it('2.6. renderSharedEmail despacha tipos canónicos y alias transparentemente', () => {
      const payload = {
        pedido_visible: 'PED-2026-D000210',
        pedido_id: 'p0000000-0000-0000-0000-000000000210',
        nombre_apellido: 'Pedro Responsable',
        plazo_horas: 72,
      };

      const resAlias = renderSharedEmail('info_responded', payload, customAppUrl);
      const resCanonical = renderSharedEmail('informacion_respondida', payload, customAppUrl);

      expect(resAlias.subject).toBe(resCanonical.subject);
      expect(resAlias.html).toBe(resCanonical.html);
      expect(resAlias.text).toBe(resCanonical.text);
    });
  });
});
