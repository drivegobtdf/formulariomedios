import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderEmail } from '../../supabase/functions/_shared/emailTemplates';
import { renderEmail as renderEmailDispatch } from '../../scripts/comunicaciones-dispatch.mjs';

describe('F10 Email de Notificación de Retrabajo al Integrante del Equipo (Sección C e I)', () => {
  const payload = {
    pedido_id: '88888888-8888-8888-8888-888888888888',
    pedido_visible: 'PED-2026-D000188',
    categoria: 'Diseño Gráfico',
    tipo: 'Flyer Digital',
    solicitante_nombre: 'María Gómez',
    area_solicitante: 'Secretaría de Cultura',
    revision_number: 2,
    motivo: 'Se requiere actualizar la tipografía y modificar las fechas de apertura.',
    archivos_count: 2,
    nombre_apellido: 'Carlos Diseñador',
    responsable_id: '11111111-1111-1111-1111-111111111111',
  };

  it('1. Renderiza plantilla en emailTemplates.ts con asunto, motivo, revisión, archivos y deep-link', () => {
    const rendered = renderEmail('pedido_retrabajo_solicitado', payload, 'https://formulariomedios.pages.dev');

    expect(rendered.n8nTipo).toBe('pedido_retrabajo_solicitado');
    expect(rendered.subject).toContain('Revisión solicitada · PED-2026-D000188');
    expect(rendered.html).toContain('Hola <strong>Carlos Diseñador</strong>');
    expect(rendered.html).toContain('PED-2026-D000188');
    expect(rendered.html).toContain('Diseño Gráfico');
    expect(rendered.html).toContain('Flyer Digital');
    expect(rendered.html).toContain('María Gómez');
    expect(rendered.html).toContain('Secretaría de Cultura');
    expect(rendered.html).toContain('#2');
    expect(rendered.html).toContain('Se requiere actualizar la tipografía y modificar las fechas de apertura.');
    expect(rendered.html).toContain('2 adjunto(s)');
    expect(rendered.html).toContain('https://formulariomedios.pages.dev/gestion/pedidos/88888888-8888-8888-8888-888888888888');
    expect(rendered.text).toContain('REVISIÓN SOLICITADA');
    expect(rendered.text).toContain('https://formulariomedios.pages.dev/gestion/pedidos/88888888-8888-8888-8888-888888888888');
  });

  it('2. Renderiza plantilla en comunicaciones-dispatch.mjs de manera idéntica y consistente', () => {
    const rendered = renderEmailDispatch('pedido_retrabajo_solicitado', payload, 'https://formulariomedios.pages.dev');

    expect(rendered.n8nTipo).toBe('pedido_retrabajo_solicitado');
    expect(rendered.subject).toContain('Revisión solicitada · PED-2026-D000188');
    expect(rendered.html).toContain('Hola <strong>Carlos Diseñador</strong>');
    expect(rendered.html).toContain('PED-2026-D000188');
    expect(rendered.html).toContain('#2');
    expect(rendered.html).toContain('https://formulariomedios.pages.dev/gestion/pedidos/88888888-8888-8888-8888-888888888888');
  });

  it('3. Migración 069: Contiene lógica SQL de selección de entregador/responsable, validación de estado_acceso e idempotencia', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260930000069_notify_team_on_revision_request.sql'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Selección de entregador primero, fallback responsable
    expect(sqlContent).toContain('COALESCE(v_entrega.entregado_por, v_pedido.responsable_user_id)');

    // Validación de estado aprobado y email válido
    expect(sqlContent).toContain("ua.estado_acceso = 'aprobado'");
    expect(sqlContent).toContain('au.email IS NOT NULL');

    // Idempotencia compuesta
    expect(sqlContent).toContain("'pedido_retrabajo_solicitado:' || v_pedido.id::text || ':' || v_rev_num::text || ':' || v_team_recipient.user_id::text");
    expect(sqlContent).toContain('ON CONFLICT (idempotency_key) DO NOTHING');

    // Mantiene confirmación al solicitante
    expect(sqlContent).toContain("'revision_solicitada:' || v_pedido.id::text || ':' || v_rev_num::text");

    // Grants service_role
    expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.pedido_request_revision(text, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated');
    expect(sqlContent).toContain('GRANT EXECUTE ON FUNCTION public.pedido_request_revision(text, uuid, text, uuid[]) TO service_role');
  });
});
