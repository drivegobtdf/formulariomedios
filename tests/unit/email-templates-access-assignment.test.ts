import { describe, it, expect } from 'vitest';
import {
  renderAccesoAprobadoEmail,
  renderPedidoAsignadoEmail,
  renderPedidoNuevoAdminEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';

describe('Email Templates — Acceso Aprobado, Asignación y Alerta a Administradores', () => {
  const appUrl = 'https://formulariomedios.netlify.app';

  it('1. renderAccesoAprobadoEmail genera correo con rol, nombre y enlace directo a /login', () => {
    const payload = {
      user_id: 'u0000000-0000-0000-0000-000000000001',
      nombre_apellido: 'María Laura Gómez',
      nombre: 'María Laura',
      apellido: 'Gómez',
      nombre_usuario: 'marialaura.gomez',
      app_role: 'equipo',
    };

    const rendered = renderAccesoAprobadoEmail(payload, appUrl);

    expect(rendered.subject).toBe('[PEDIDOS] Tu solicitud de acceso operativo ha sido aprobada');
    expect(rendered.n8nTipo).toBe('acceso_aprobado');
    expect(rendered.html).toContain('María Laura Gómez');
    expect(rendered.html).toContain('@marialaura.gomez');
    expect(rendered.html).toContain('Equipo Operativo');
    expect(rendered.html).toContain(`${appUrl}/login`);
    expect(rendered.text).toContain(`${appUrl}/login`);
  });

  it('2. renderPedidoAsignadoEmail genera correo al responsable con código PED, detalles y link a /gestion/pedidos/:id', () => {
    const payload = {
      pedido_id: 'p0000000-0000-0000-0000-000000000002',
      pedido_visible: 'PED-2026-D000188',
      categoria: 'Diseño Gráfico',
      tipo: 'Flyer Digital',
      area_solicitante: 'Secretaría de Deportes',
      solicitante_nombre: 'Martín Torres',
      fecha_limite: '2026-10-20',
      nombre_apellido: 'Lucas Diseñador',
      motivo: 'Asignado para armado urgente de piezas',
    };

    const rendered = renderPedidoAsignadoEmail(payload, appUrl);

    expect(rendered.subject).toBe('[PEDIDOS] Te fue asignado el pedido: PED-2026-D000188');
    expect(rendered.n8nTipo).toBe('pedido_asignado');
    expect(rendered.html).toContain('Lucas Diseñador');
    expect(rendered.html).toContain('PED-2026-D000188');
    expect(rendered.html).toContain('Diseño Gráfico — Flyer Digital');
    expect(rendered.html).toContain('Secretaría de Deportes (Martín Torres)');
    expect(rendered.html).toContain('2026-10-20');
    expect(rendered.html).toContain('Asignado para armado urgente de piezas');
    expect(rendered.html).toContain(`${appUrl}/gestion/pedidos/p0000000-0000-0000-0000-000000000002`);
    expect(rendered.text).toContain(`${appUrl}/gestion/pedidos/p0000000-0000-0000-0000-000000000002`);
  });

  it('3. renderPedidoNuevoAdminEmail genera correo de alerta a administradores con lista de PEDs y link a /gestion', () => {
    const payload = {
      envio_id: 'e0000000-0000-0000-0000-000000000003',
      nombre_apellido: 'Pablo Administrador',
      solicitante: 'Clara Solicitante',
      area_solicitante: 'Dirección de Prensa',
      correo: 'clara@tdf.gob.ar',
      pedidos: [
        {
          pedido_visible: 'PED-2026-D000190',
          categoria: 'Diseño Gráfico',
          tipo: 'Flyer RRSS',
          fecha_limite: '2026-10-25',
        },
        {
          pedido_visible: 'PED-2026-C000191',
          categoria: 'Cobertura de Eventos',
          tipo: 'Cobertura Institucional',
          fecha_limite: '2026-10-22',
        },
      ],
      pedidos_count: 2,
    };

    const rendered = renderPedidoNuevoAdminEmail(payload, appUrl);

    expect(rendered.subject).toContain('[PEDIDOS Admin] Nueva solicitud ingresada: PED-2026-D000190, PED-2026-C000191');
    expect(rendered.n8nTipo).toBe('pedido_nuevo_admin');
    expect(rendered.html).toContain('Pablo Administrador');
    expect(rendered.html).toContain('Clara Solicitante (clara@tdf.gob.ar)');
    expect(rendered.html).toContain('Dirección de Prensa');
    expect(rendered.html).toContain('PED-2026-D000190');
    expect(rendered.html).toContain('PED-2026-C000191');
    expect(rendered.html).toContain(`${appUrl}/gestion`);
    expect(rendered.text).toContain(`${appUrl}/gestion`);
  });
});
