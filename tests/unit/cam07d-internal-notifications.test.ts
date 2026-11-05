/** CAM-07D: contratos estáticos y simulación funcional de correos de pedidos internos. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderEmailForCommunication } from '../../supabase/functions/_shared/emailTemplates.ts';

const root = process.cwd();
const sql = readFileSync(join(root, 'supabase/migrations/20261105001000_cam07d_internal_notifications.sql'), 'utf8');
const templates = readFileSync(join(root, 'supabase/functions/_shared/emailTemplates.ts'), 'utf8');

describe('CAM-07D: correos de pedidos internos', () => {
  it('alta idempotente y misma plantilla de ingreso que públicos', () => {
    expect(sql).toContain('comunicacion_enqueue_internal_created');
    expect(sql).toContain("'pedido_ingresado_interno:' || v_ped.id::text");
    expect(sql).toContain("'pedido_ingresado'");
    expect(sql).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(sql).toContain("NEW.event_name = 'pedido.created_internal'");
  });
  it('resuelve contacto interno sin requerir envio_id', () => {
    expect(sql).toContain("p.informacion_especifica->'solicitante'->>'correo'");
    expect(sql).toContain('LEFT JOIN public.envios_formulario e ON p.envio_id = e.id');
    expect(sql).toContain("v_ped.origen = 'interno'");
  });
  it('preserva disparadores públicos y versiones', () => {
    expect(sql).toContain("NEW.event_name = 'submission.created'");
    expect(sql).toContain("NEW.event_name = 'pedido.finalized'");
    expect(sql).toContain("NEW.event_name = 'pedido.state_changed'");
    expect(sql).toContain('version_number');
    expect(sql).toContain('en_proceso_reopen:');
  });
  it('no envía notas privadas ni URL arbitraria del evento para internos', () => {
    expect(sql).toContain("'extra', CASE WHEN v_ped.origen='interno'");
    expect(templates).toContain("const isPedidoInterno = payload.origen === 'interno';");
    expect(templates).toContain("const urlEntrega = isPedidoInterno ? ''");
    expect(templates).toContain("const notaCierreRaw = isPedidoInterno ? ''");
    expect(templates).toContain("isPedidoInterno ? '' : `<a");
  });
  it('respeta aislación de TEST y usa magic links ya existentes', () => {
    const dispatcher = readFileSync(join(root, 'supabase/functions/comunicaciones-dispatch/index.ts'), 'utf8');
    expect(dispatcher).toContain("item.tipo_comunicacion === 'pedido_ingresado'");
    expect(dispatcher).toContain("item.tipo_comunicacion === 'finalizado'");
    expect(dispatcher).toContain("item.tipo_comunicacion === 'en_proceso'");
    expect(dispatcher).toContain('isAuthorizedTestEmail');
  });
});

describe('CAM-07D: Simulación de Renderizado de Correos y Seguridad de Plantillas', () => {
  const appUrl = 'https://sistemas.tierradelfuego.gob.ar/formulariomedios';

  it('pedido_ingresado interno: renderiza correctamente sin exigir envio_id', () => {
    const payload = {
      origen: 'interno',
      pedido_id: 'da000000-0000-0000-0000-000000000001',
      pedido_visible: 'PED-2026-D000101',
      nombre_apellido: 'Carlos Interno',
      area_solicitante: 'Secretaría General',
      pedidos: [{
        pedido_visible: 'PED-2026-D000101',
        categoria: 'Diseño Gráfico',
        tipo: 'Folleto Digital',
      }],
      raw_token: 'magic-token-123',
    };

    const rendered = renderEmailForCommunication('pedido_ingresado', payload, appUrl);
    expect(rendered.subject).toContain('Solicitud recibida');
    expect(rendered.html).toContain('Carlos Interno');
    expect(rendered.html).toContain('PED-2026-D000101');
    expect(rendered.html).toContain('Ver mis solicitudes');
    expect(rendered.html).toContain(`${appUrl}/mis-solicitudes#access_token=magic-token-123`);
  });

  it('en_proceso interno: renderiza notificación de inicio de trabajo', () => {
    const payload = {
      origen: 'interno',
      pedido_id: 'da000000-0000-0000-0000-000000000001',
      pedido_visible: 'PED-2026-D000101',
      nombre_apellido: 'Carlos Interno',
      categoria: 'Diseño Gráfico',
      tipo: 'Folleto Digital',
      raw_token: 'magic-token-123',
    };

    const rendered = renderEmailForCommunication('en_proceso', payload, appUrl);
    expect(rendered.subject).toContain('PED-2026-D000101');
    expect(rendered.html).toContain('PED-2026-D000101');
    expect(rendered.html).toContain('Ver mis solicitudes');
    expect(rendered.html).toContain(`${appUrl}/mis-solicitudes#access_token=magic-token-123&pedido=PED-2026-D000101`);
  });

  it('finalizado interno: oculta notas privadas de operador, oculta URL arbitraria y omite botón Solicitar Revisión', () => {
    const payload = {
      origen: 'interno',
      pedido_id: 'da000000-0000-0000-0000-000000000001',
      pedido_visible: 'PED-2026-D000101',
      nombre_apellido: 'Carlos Interno',
      categoria: 'Diseño Gráfico',
      tipo: 'Folleto Digital',
      nota_cierre: 'NOTA PRIVADA CONFIDENCIAL DEL OPERADOR',
      url_entrega: 'https://drive.google.com/raw-internal-folder',
      extra: {
        version_number: 1,
        nota_cierre: 'NOTA PRIVADA EN EXTRA',
        url_entrega: 'https://drive.google.com/raw-extra-folder',
      },
      raw_token: 'magic-token-123',
    };

    const rendered = renderEmailForCommunication('finalizado', payload, appUrl);

    // Verificación estricta de no divulgación
    expect(rendered.html).not.toContain('NOTA PRIVADA CONFIDENCIAL');
    expect(rendered.html).not.toContain('NOTA PRIVADA EN EXTRA');
    expect(rendered.html).not.toContain('raw-internal-folder');
    expect(rendered.html).not.toContain('raw-extra-folder');
    expect(rendered.text).not.toContain('NOTA PRIVADA');
    expect(rendered.text).not.toContain('raw-internal-folder');

    // Botón "Solicitar Revisión" no debe existir para pedidos internos
    expect(rendered.html).not.toContain('Solicitar Revisión');
    expect(rendered.text).not.toContain('solicitar revisión');
    expect(rendered.text).toContain('Puede consultar el historial en:');

    // Botón "VER MI PEDIDO" debe existir y apuntar a /mis-solicitudes
    expect(rendered.html).toContain('VER MI PEDIDO');
    expect(rendered.html).toContain(`${appUrl}/mis-solicitudes#access_token=magic-token-123&pedido=PED-2026-D000101`);
  });

  it('finalizado v2 interno: refleja nueva versión en asunto sin divulgar datos internos', () => {
    const payload = {
      origen: 'interno',
      pedido_visible: 'PED-2026-D000101',
      nombre_apellido: 'Carlos Interno',
      extra: { version_number: 2 },
      raw_token: 'magic-token-123',
    };

    const rendered = renderEmailForCommunication('finalizado', payload, appUrl);
    expect(rendered.subject).toContain('Nueva versión disponible');
    expect(rendered.subject).toContain('Versión 2');
    expect(rendered.html).not.toContain('Solicitar Revisión');
  });

  it('finalizado público (no regresión): conserva URL de entrega, nota pública y botón Solicitar Revisión', () => {
    const payload = {
      origen: 'publico',
      pedido_visible: 'PED-2026-D000099',
      nombre_apellido: 'Vecino Público',
      categoria: 'Audiovisual',
      tipo: 'Spot TV',
      nota_cierre: 'Material entregado conforme a lo solicitado.',
      url_entrega: 'https://drive.google.com/public-delivery-folder',
      raw_token: 'magic-token-pub',
    };

    const rendered = renderEmailForCommunication('finalizado', payload, appUrl);
    expect(rendered.html).toContain('VER MI PEDIDO');
    expect(rendered.html).toContain('Solicitar Revisión');
    expect(rendered.html).toContain('Material entregado conforme a lo solicitado.');
    expect(rendered.html).toContain('https://drive.google.com/public-delivery-folder');
    expect(rendered.text).toContain('Puede consultar el historial o solicitar revisión en:');
  });
});
