/**
 * Test de Integración: F7 Seguimiento Público y Solicitudes de Info (48h) + F8 Gestión Interna
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 *
 * Valida:
 * - DTO público de seguimiento y recuperación anti-enumeración.
 * - Ciclo de vida y vigencia estricta de 48 horas corridas para solicitudes de información faltante.
 * - Validación y respuesta de solicitudes con token seguro y actualización de estado.
 * - Transiciones de estado, asignación, notas, finalización con entrega, cancelación y reapertura.
 * - Control de concurrencia optimista por versión.
 * - Restricciones de acceso por rol (Admin, Equipo vs Observador).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Edge functions handlers
import trackingGetHandler from '../../supabase/functions/tracking-get/index.ts';
import trackingRecoverHandler from '../../supabase/functions/tracking-recover/index.ts';
import infoTokenValidateHandler from '../../supabase/functions/info-token-validate/index.ts';
import infoResponseSubmitHandler from '../../supabase/functions/info-response-submit/index.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('F7 Seguimiento Público & F8 Gestión Interna - Integration Tests', () => {
  let serviceClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let equipoClient: SupabaseClient;
  let observadorClient: SupabaseClient;

  let adminUserId: string;
  let equipoUserId: string;
  let _observadorUserId: string;

  const password = 'TestPassword123!';
  const testNum = Math.floor(Math.random() * 800000) + 100000;
  const pedidoVisibleStr = `PED-2026-D${testNum}`;
  const testEmail = `solicitante.f7.${testNum}@tdf.gob.ar`;

  beforeAll(async () => {
    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rolesConfig = [
      { roleKey: 'admin', appRole: 'administrador' as const, email: 'test.admin.f78@tierradelfuego.gob.ar', user_nombre: 'Admin F78' },
      { roleKey: 'equipo', appRole: 'equipo' as const, email: 'test.equipo.f78@tierradelfuego.gob.ar', user_nombre: 'Operador F78' },
      { roleKey: 'observador', appRole: 'observador' as const, email: 'test.observador.f78@tierradelfuego.gob.ar', user_nombre: 'Observador F78' },
    ];

    const clients: Record<string, SupabaseClient> = {};

    for (const item of rolesConfig) {
      let userId: string;

      const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
        email: item.email,
        password,
        email_confirm: true,
        user_metadata: {
          nombre: item.user_nombre,
          apellido: 'Test',
          nombre_usuario: `user_${item.roleKey}_f78`,
        },
      });

      if (createErr) {
        if (createErr.message.includes('already been registered')) {
          const { data: usersList } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
          const found = usersList?.users?.find((u) => u.email === item.email);
          if (!found) throw new Error(`User ${item.email} exists but could not be retrieved`);
          userId = found.id;
          await serviceClient.auth.admin.updateUserById(userId, { password });
        } else {
          throw new Error(`Error creating user ${item.email}: ${createErr.message}`);
        }
      } else {
        userId = createData.user!.id;
      }

      if (item.roleKey === 'admin') adminUserId = userId;
      if (item.roleKey === 'equipo') equipoUserId = userId;
      if (item.roleKey === 'observador') observadorUserId = userId;

      await serviceClient.from('usuarios_acceso').upsert({
        user_id: userId,
        nombre: item.user_nombre,
        apellido: 'Test',
        nombre_usuario: `user_${item.roleKey}_f78`,
        estado_acceso: 'aprobado',
        app_role: item.appRole,
        aprobado_at: new Date().toISOString(),
      });

      const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: item.email,
        password,
      });

      if (authError || !authData.session?.access_token) {
        throw new Error(`Error authenticating user ${item.email}: ${authError?.message}`);
      }

      const authClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
          },
        },
      });

      clients[item.roleKey] = authClient;
    }

    adminClient = clients.admin;
    equipoClient = clients.equipo;
    observadorClient = clients.observador;
  });

  it('Caso 1 (F7): Consulta de seguimiento público con token válido y rechazo con token inválido', async () => {
    const trackingTokenRaw = crypto.randomBytes(32).toString('hex');
    const trackingTokenHash = crypto.createHash('sha256').update(trackingTokenRaw).digest('hex');

    // 1. Create a test submission and order
    const { data: envio, error: envError } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-f7-test-${testNum}`).digest('hex'),
        correo: testEmail,
        nombre_apellido: 'Solicitante F7 Test',
        telefono: '+5492901999888',
        area_solicitante: 'Secretaría de Test',
      })
      .select('id')
      .single();

    expect(envError).toBeNull();

    const { data: categoria, error: catErr } = await serviceClient
      .from('categorias_servicio')
      .select('id, codigo_ped')
      .eq('codigo_ped', 'D')
      .single();

    expect(catErr).toBeNull();

    const { data: tipo, error: tipoErr } = await serviceClient
      .from('tipos_servicio')
      .select('id')
      .eq('categoria_id', categoria!.id)
      .limit(1)
      .single();

    expect(tipoErr).toBeNull();

    const { data: pedido, error: pedError } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envio!.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: pedidoVisibleStr,
        anio: 2026,
        numero: testNum,
        codigo_categoria: 'D',
        categoria_id: categoria!.id,
        tipo_servicio_id: tipo!.id,
        tracking_token_hash: trackingTokenHash,
        estado: 'Nuevo',
        informacion_especifica: { requerimiento: 'Diseño de flyer institucional' },
      })
      .select('*')
      .single();

    expect(pedError).toBeNull();
    const pedidoVisible = pedido!.pedido_visible;

    // 2. Call tracking-get Edge Function with valid credentials
    const reqValid = new Request('http://localhost/functions/v1/tracking-get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_visible: pedidoVisible,
        token: trackingTokenRaw,
      }),
    });

    const resValid = await trackingGetHandler(reqValid);
    expect(resValid.status).toBe(200);

    const bodyValid = await resValid.json();
    expect(bodyValid.pedido_visible).toBe(pedidoVisible);
    expect(bodyValid.estado).toBe('Nuevo');
    expect(bodyValid.categoria_nombre).toBeDefined();
    expect(bodyValid.entrega === null || typeof bodyValid.entrega === 'object').toBe(true);
    expect(Array.isArray(bodyValid.solicitudes_informacion)).toBe(true);

    // 3. Call tracking-get with invalid token
    const reqInvalid = new Request('http://localhost/functions/v1/tracking-get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_visible: pedidoVisible,
        token: 'wrong_token_value',
      }),
    });

    const resInvalid = await trackingGetHandler(reqInvalid);
    expect(resInvalid.status).toBe(404);
  });

  it('Caso 2 (F7): Recuperación de seguimiento anti-enumeración', async () => {
    const req = new Request('http://localhost/functions/v1/tracking-recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });

    const res = await trackingRecoverHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('Si el correo electrónico se encuentra registrado');

    // Check that a domain event was created
    const { data: events } = await serviceClient
      .from('domain_events')
      .select('*')
      .eq('event_name', 'tracking.recovery_requested');

    expect(events && events.length > 0).toBe(true);
  });

  it('Caso 3 (F7): Solicitud de Información Faltante con vigencia de 48 horas corridas y respuesta', async () => {
    // 1. Get test order
    const { data: pedido } = await serviceClient
      .from('pedidos')
      .select('id, pedido_visible, version')
      .eq('numero', testNum)
      .single();

    expect(pedido).toBeDefined();

    // 2. Call RPC info_request_create as authenticated Admin
    const { data: rpcRes, error: rpcError } = await adminClient.rpc('info_request_create', {
      p_pedido_id: pedido!.id,
      p_mensaje: 'Por favor adjuntar logotipo en formato vectorial SVG.',
      p_expected_version: pedido!.version,
    });

    expect(rpcError).toBeNull();
    expect(rpcRes.solicitud_id).toBeDefined();
    expect(rpcRes.raw_token).toBeDefined();

    const tokenRaw = rpcRes.raw_token;

    // Verify in DB that expires_at is set strictly to created_at + 48 hours
    const { data: solDb } = await serviceClient
      .from('solicitudes_informacion')
      .select('created_at, expires_at, estado')
      .eq('id', rpcRes.solicitud_id)
      .single();

    const createdAtMs = new Date(solDb!.created_at).getTime();
    const expiresAtMs = new Date(solDb!.expires_at).getTime();
    const diffHours = (expiresAtMs - createdAtMs) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(48);
    expect(solDb!.estado).toBe('pendiente');

    // 3. Validate token via Edge Function info-token-validate
    const reqVal = new Request('http://localhost/functions/v1/info-token-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenRaw }),
    });

    const resVal = await infoTokenValidateHandler(reqVal);
    expect(resVal.status).toBe(200);

    const bodyVal = await resVal.json();
    expect(bodyVal.valid).toBe(true);
    expect(bodyVal.responded).toBe(false);
    expect(bodyVal.solicitud.mensaje).toBe('Por favor adjuntar logotipo en formato vectorial SVG.');

    // 4. Submit response via Edge Function info-response-submit
    const reqSub = new Request('http://localhost/functions/v1/info-response-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenRaw,
        respuesta_texto: 'Adjunto enlace a Drive con SVG oficial.',
        enlaces: ['https://drive.google.com/drive/folders/logo-svg-test'],
      }),
    });

    const resSub = await infoResponseSubmitHandler(reqSub);
    expect(resSub.status).toBe(200);

    const bodySub = await resSub.json();
    expect(bodySub.success).toBe(true);

    // 5. Validate token again -> should now reflect responded: true
    const reqVal2 = new Request('http://localhost/functions/v1/info-token-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenRaw }),
    });

    const resVal2 = await infoTokenValidateHandler(reqVal2);
    const bodyVal2 = await resVal2.json();
    expect(bodyVal2.valid).toBe(true);
    expect(bodyVal2.responded).toBe(true);

    // 6. Test expired token validation (48 horas corridas)
    const expiredTokenRaw = 'expired_secret_token_1234567890abcdef123456';
    const expiredTokenHash = crypto.createHash('sha256').update(expiredTokenRaw).digest('hex');

    await serviceClient.from('solicitudes_informacion').insert({
      pedido_id: pedido!.id,
      solicitada_por: adminUserId,
      token_hash: expiredTokenHash,
      mensaje: 'Solicitud que ya venció',
      estado: 'pendiente',
      created_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    });

    const reqExpired = new Request('http://localhost/functions/v1/info-token-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: expiredTokenRaw }),
    });

    const resExpired = await infoTokenValidateHandler(reqExpired);
    expect(resExpired.status).toBe(410);
    const bodyExpired = await resExpired.json();
    expect(bodyExpired.valid).toBe(false);
    expect(bodyExpired.message).toContain('48 horas corridas');
  });

  it('Caso 4 (F8): Flujo completo de gestión interna (Asignación, Estados, Finalización con Entrega, Notas, Cancelación y Reapertura)', async () => {
    // 1. Get latest state and version of the order
    const { data: pedido } = await serviceClient
      .from('pedidos')
      .select('id, version, estado')
      .eq('numero', testNum)
      .single();

    let currentVersion = pedido!.version;

    // 2. Assign to operator as Admin
    const { data: asigRes, error: asigError } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedido!.id,
      p_responsable_user_id: equipoUserId,
      p_expected_version: currentVersion,
    });
    expect(asigError).toBeNull();
    expect(asigRes.version).toBe(currentVersion + 1);
    currentVersion = asigRes.version;

    // 3. Move state to 'En revisión' as Operator
    const { data: stRes1, error: stErr1 } = await equipoClient.rpc('pedido_change_state', {
      p_pedido_id: pedido!.id,
      p_target_state: 'En revisión',
      p_expected_version: currentVersion,
      p_motivo: 'Iniciando revisión técnica de requerimientos',
    });
    expect(stErr1).toBeNull();
    expect(stRes1.version).toBe(currentVersion + 1);
    currentVersion = stRes1.version;

    // 4. Move state to 'En proceso' as Operator
    const { data: stRes2, error: stErr2 } = await equipoClient.rpc('pedido_change_state', {
      p_pedido_id: pedido!.id,
      p_target_state: 'En proceso',
      p_expected_version: currentVersion,
    });
    expect(stErr2).toBeNull();
    expect(stRes2.version).toBe(currentVersion + 1);
    currentVersion = stRes2.version;

    // 5. Cancel order from 'En proceso' with motive
    const { data: cancRes, error: cancErr } = await equipoClient.rpc('pedido_cancel', {
      p_pedido_id: pedido!.id,
      p_motivo: 'Cancelado transitoriamente por solicitud del área requirente.',
      p_expected_version: currentVersion,
    });
    expect(cancErr).toBeNull();
    expect(cancRes.estado).toBe('Cancelado');
    currentVersion = cancRes.version;

    // 6. Reopen cancelled order -> transitions back to 'En revisión'
    const { data: reopRes, error: reopErr } = await equipoClient.rpc('pedido_reopen', {
      p_pedido_id: pedido!.id,
      p_motivo: 'El solicitante reactivó la solicitud con variantes aprobadas.',
      p_expected_version: currentVersion,
    });
    expect(reopErr).toBeNull();
    expect(reopRes.estado).toBe('En revisión');
    currentVersion = reopRes.version;

    // 7. Move back to 'En proceso'
    const { data: stRes3, error: stErr3 } = await equipoClient.rpc('pedido_change_state', {
      p_pedido_id: pedido!.id,
      p_target_state: 'En proceso',
      p_expected_version: currentVersion,
    });
    expect(stErr3).toBeNull();
    expect(stRes3.version).toBe(currentVersion + 1);
    currentVersion = stRes3.version;

    // 8. Add internal and public notes
    const { error: notaErr1 } = await equipoClient.rpc('nota_pedido_create', {
      p_pedido_id: pedido!.id,
      p_contenido: 'Nota interna de coordinación operativa.',
      p_visibilidad: 'interna',
    });
    expect(notaErr1).toBeNull();

    const { error: notaErr2 } = await equipoClient.rpc('nota_pedido_create', {
      p_pedido_id: pedido!.id,
      p_contenido: 'El diseño se encuentra en render final.',
      p_visibilidad: 'solicitante',
    });
    expect(notaErr2).toBeNull();

    // 9. Finalize order with delivery
    const { data: finRes, error: finErr } = await equipoClient.rpc('pedido_finalize', {
      p_pedido_id: pedido!.id,
      p_expected_version: currentVersion,
      p_url_entrega: 'https://drive.google.com/file/d/flyer-final-v1.png',
      p_nota_entrega: 'Diseño finalizado según requerimientos aprobados.',
    });
    expect(finErr).toBeNull();
    expect(finRes.estado).toBe('Finalizado');
    expect(finRes.entrega_version).toBe(1);
    currentVersion = finRes.version;

    // Verify delivery record exists
    const { data: entregas } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('pedido_id', pedido!.id);
    expect(entregas?.length).toBe(1);
    expect(entregas![0].es_vigente).toBe(true);

    // 10. Archive and Restore finalized order
    const { data: archRes, error: archErr } = await adminClient.rpc('pedido_archive', {
      p_pedido_id: pedido!.id,
      p_expected_version: currentVersion,
    });
    expect(archErr).toBeNull();
    expect(archRes.archivado).toBe(true);
    currentVersion = archRes.version;

    const { data: restRes, error: restErr } = await adminClient.rpc('pedido_restore', {
      p_pedido_id: pedido!.id,
      p_expected_version: currentVersion,
    });
    expect(restErr).toBeNull();
    expect(restRes.archivado).toBe(false);
  });

  it('Caso 5: Control de concurrencia optimista (OCC)', async () => {
    const { data: pedido } = await serviceClient
      .from('pedidos')
      .select('id, version')
      .eq('numero', testNum)
      .single();

    // Calling RPC with wrong expected version must fail with OCC error
    const { error: occError } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedido!.id,
      p_responsable_user_id: equipoUserId,
      p_expected_version: pedido!.version - 5,
    });

    expect(occError).toBeDefined();
    expect(occError!.message).toContain('VERSION_CONFLICT');
  });

  it('Caso 6: Restricción de permisos para rol Observador (Solo Lectura)', async () => {
    const { data: pedido } = await serviceClient
      .from('pedidos')
      .select('id, version')
      .eq('numero', testNum)
      .single();

    // Observador attempting to assign or change state must be rejected
    const { error: obsErr } = await observadorClient.rpc('pedido_assign', {
      p_pedido_id: pedido!.id,
      p_responsable_user_id: equipoUserId,
      p_expected_version: pedido!.version,
    });

    expect(obsErr).toBeDefined();
    expect(obsErr!.message).toContain('ROLE_FORBIDDEN');
  });
});
