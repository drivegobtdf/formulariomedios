/**
 * Test de Integración: F7 "Mis Solicitudes por Correo + Enlace Seguro" & F9 Cierre Operativo
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Edge Functions Handlers
import solicitanteAccessRequestHandler from '../../supabase/functions/solicitante-access-request/index.ts';
import solicitanteSessionExchangeHandler from '../../supabase/functions/solicitante-session-exchange/index.ts';
import solicitantePedidosListHandler from '../../supabase/functions/solicitante-pedidos-list/index.ts';
import solicitantePedidoDetailHandler from '../../supabase/functions/solicitante-pedido-detail/index.ts';
import solicitanteInfoRespondHandler from '../../supabase/functions/solicitante-info-respond/index.ts';
import solicitanteSessionRevokeHandler from '../../supabase/functions/solicitante-session-revoke/index.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('F7 Mis Solicitudes por Correo & F9 Cierre Operativo - Integration Tests', () => {
  let serviceClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let operadorClient: SupabaseClient;

  let adminUserId: string;
  let operadorUserId: string;

  const password = 'TestPassword123!';
  const randomSuffix = Math.floor(Math.random() * 800000) + 100000;
  const citizenEmailA = `ciudadano.a.${randomSuffix}@tdf.gob.ar`;
  const citizenEmailB = `ciudadano.b.${randomSuffix}@tdf.gob.ar`;

  let pedidoA1Id: string;
  let pedidoA1Visible: string;
  let pedidoA2Id: string;
  let pedidoB1Id: string;
  let infoRequestIdA1: string;

  let sessionTokenA: string;

  beforeAll(async () => {
    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Configure Operator and Admin users
    const users = [
      { key: 'admin', email: `admin.int.${randomSuffix}@tdf.gob.ar`, role: 'administrador' as const },
      { key: 'operador', email: `operador.int.${randomSuffix}@tdf.gob.ar`, role: 'equipo' as const },
    ];

    const clients: Record<string, SupabaseClient> = {};

    for (const u of users) {
      const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { nombre: 'User', apellido: u.key, nombre_usuario: `usr_${u.key}_${randomSuffix}` },
      });

      let uid = createData?.user?.id;
      if (createErr) {
        const { data: list } = await serviceClient.auth.admin.listUsers();
        const found = list.users.find((usr) => usr.email === u.email);
        if (!found) throw new Error(`Could not find user ${u.email}`);
        uid = found.id;
        await serviceClient.auth.admin.updateUserById(uid, { password });
      }

      if (u.key === 'admin') adminUserId = uid!;
      if (u.key === 'operador') operadorUserId = uid!;

      await serviceClient.from('usuarios_acceso').upsert({
        user_id: uid,
        nombre: 'User',
        apellido: u.key,
        nombre_usuario: `usr_${u.key}_${randomSuffix}`,
        app_role: u.role,
        estado_acceso: 'aprobado',
      });

      const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await client.auth.signInWithPassword({ email: u.email, password });
      if (signInErr) throw signInErr;

      clients[u.key] = client;
    }

    adminClient = clients.admin;
    operadorClient = clients.operador;

    // 2. Setup Category and Service Type
    const { data: categoria } = await serviceClient
      .from('categorias_servicio')
      .select('id, codigo_ped')
      .eq('codigo_ped', 'D')
      .single();

    const { data: tipo } = await serviceClient
      .from('tipos_servicio')
      .select('id')
      .eq('categoria_id', categoria!.id)
      .limit(1)
      .single();

    // 3. Create submissions for Citizen A (2 submissions)
    const { data: envioA1 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-a1-${randomSuffix}`).digest('hex'),
        correo: citizenEmailA,
        nombre_apellido: 'Ciudadano A',
        telefono: '+5492901111111',
        area_solicitante: 'Secretaría de Cultura',
      })
      .select('id')
      .single();

    pedidoA1Visible = `PED-2026-D${randomSuffix}`;
    const { data: pedA1 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioA1!.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: pedidoA1Visible,
        anio: 2026,
        numero: randomSuffix,
        codigo_categoria: 'D',
        categoria_id: categoria!.id,
        tipo_servicio_id: tipo!.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-a1-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Banner Digital Cultura' },
      })
      .select('id')
      .single();

    pedidoA1Id = pedA1!.id;

    const { data: envioA2 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-a2-${randomSuffix}`).digest('hex'),
        correo: citizenEmailA,
        nombre_apellido: 'Ciudadano A',
        telefono: '+5492901111111',
        area_solicitante: 'Secretaría de Cultura',
      })
      .select('id')
      .single();

    const { data: pedA2 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioA2!.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: `PED-2026-D${randomSuffix + 1}`,
        anio: 2026,
        numero: randomSuffix + 1,
        codigo_categoria: 'D',
        categoria_id: categoria!.id,
        tipo_servicio_id: tipo!.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-a2-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Folletería Evento' },
      })
      .select('id')
      .single();

    pedidoA2Id = pedA2!.id;

    // 4. Create submission for Citizen B (1 submission)
    const { data: envioB1 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-b1-${randomSuffix}`).digest('hex'),
        correo: citizenEmailB,
        nombre_apellido: 'Ciudadano B',
        telefono: '+5492901222222',
        area_solicitante: 'Secretaría de Deportes',
      })
      .select('id')
      .single();

    const { data: pedB1 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioB1!.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: `PED-2026-D${randomSuffix + 2}`,
        anio: 2026,
        numero: randomSuffix + 2,
        codigo_categoria: 'D',
        categoria_id: categoria!.id,
        tipo_servicio_id: tipo!.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-b1-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Torneo Provincial' },
      })
      .select('id')
      .single();

    pedidoB1Id = pedB1!.id;

    // 5. Create 48h Info Request on Pedido A1
    const { data: infoReq } = await serviceClient
      .from('solicitudes_informacion')
      .insert({
        pedido_id: pedidoA1Id,
        solicitada_por: adminUserId,
        mensaje: 'Por favor adjuntar archivo vectorizado del logo',
        estado: 'pendiente',
        token_hash: crypto.createHash('sha256').update(`info-tok-${randomSuffix}`).digest('hex'),
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      })
      .select('id')
      .single();

    infoRequestIdA1 = infoReq!.id;
  });

  // =========================================================================
  // F7 SUITE: Solicitante Magic Link & Multi-PED Session
  // =========================================================================

  it('1. solicitante-access-request aplica anti-enumeración tanto para correos registrados como desconocidos', async () => {
    // Registered email
    const reqKnown = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: citizenEmailA }),
    });
    const resKnown = await solicitanteAccessRequestHandler(reqKnown);
    expect(resKnown.status).toBe(200);
    const bodyKnown = await resKnown.json();
    expect(bodyKnown.success).toBe(true);

    // Unregistered email
    const reqUnknown = new Request('http://localhost/functions/v1/solicitante-access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `no-existe-${randomSuffix}@tdf.gob.ar` }),
    });
    const resUnknown = await solicitanteAccessRequestHandler(reqUnknown);
    expect(resUnknown.status).toBe(200);
    const bodyUnknown = await resUnknown.json();
    expect(bodyUnknown.success).toBe(true);

    // Verify communication was queued only for registered email
    const { count } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_email', citizenEmailA)
      .eq('tipo_comunicacion', 'magic_link_access');

    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('2. solicitante-session-exchange canjea el token seguro, crea sesión y rechaza Replay', async () => {
    // Obtain the magic token using test claim helper
    const { data: magicToken, error: claimErr } = await serviceClient.rpc('solicitante_test_claim_magic_token', {
      p_correo: citizenEmailA,
    });
    expect(claimErr).toBeNull();
    expect(typeof magicToken).toBe('string');
    expect(magicToken.length).toBeGreaterThan(20);

    // Exchange token via Edge Function
    const reqExchange = new Request('http://localhost/functions/v1/solicitante-session-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    });
    const resExchange = await solicitanteSessionExchangeHandler(reqExchange);
    expect(resExchange.status).toBe(200);
    const bodyExchange = await resExchange.json();

    expect(bodyExchange.success).toBe(true);
    expect(bodyExchange.session_token).toBeDefined();
    expect(bodyExchange.correo).toBe(citizenEmailA);
    sessionTokenA = bodyExchange.session_token;

    // Test Replay: Attempting to use the same magic token again fails with 409
    const reqReplay = new Request('http://localhost/functions/v1/solicitante-session-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    });
    const resReplay = await solicitanteSessionExchangeHandler(reqReplay);
    expect([400, 409]).toContain(resReplay.status);
    const bodyReplay = await resReplay.json();
    expect(bodyReplay.error).toBeDefined();
  });

  it('3. solicitante-pedidos-list retorna los 2 pedidos consolidados del Ciudadano A con indicador de info pendiente', async () => {
    const reqList = new Request('http://localhost/functions/v1/solicitante-pedidos-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ limit: 10 }),
    });

    const resList = await solicitantePedidosListHandler(reqList);
    expect(resList.status).toBe(200);
    const bodyList = await resList.json();

    expect(bodyList.success).toBe(true);
    expect(bodyList.total).toBe(2);
    expect(bodyList.pedidos.length).toBe(2);

    const pedA1InList = bodyList.pedidos.find((p: any) => p.id === pedidoA1Id);
    expect(pedA1InList).toBeDefined();
    expect(pedA1InList.solicitudes_pendientes_count).toBe(1);
  });

  it('4. solicitante-pedido-detail retorna detalle sanitizado y previene acceso cruzado entre ciudadanos', async () => {
    // 1. Authorized detail request
    const reqDetailOk = new Request('http://localhost/functions/v1/solicitante-pedido-detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ pedido_ref: pedidoA1Id }),
    });

    const resDetailOk = await solicitantePedidoDetailHandler(reqDetailOk);
    expect(resDetailOk.status).toBe(200);
    const bodyDetailOk = await resDetailOk.json();

    expect(bodyDetailOk.success).toBe(true);
    expect(bodyDetailOk.pedido_visible).toBe(pedidoA1Visible);
    expect(bodyDetailOk.solicitudes_informacion.length).toBe(1);
    expect(bodyDetailOk.solicitudes_informacion[0].mensaje).toBe('Por favor adjuntar archivo vectorizado del logo');

    // 2. Unauthorized cross-citizen detail request (Citizen A requesting Citizen B's pedido)
    const reqDetailForbidden = new Request('http://localhost/functions/v1/solicitante-pedido-detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ pedido_ref: pedidoB1Id }),
    });

    const resDetailForbidden = await solicitantePedidoDetailHandler(reqDetailForbidden);
    expect(resDetailForbidden.status).toBe(404);
  });

  it('5. solicitante-info-respond permite al ciudadano responder solicitud de 48h con texto y enlaces', async () => {
    const reqRespond = new Request('http://localhost/functions/v1/solicitante-info-respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({
        solicitud_id: infoRequestIdA1,
        respuesta_texto: 'Adjunto link de Google Drive con el archivo vectorial .ai',
        enlaces: ['https://drive.google.com/drive/folders/test-vector-logo'],
      }),
    });

    const resRespond = await solicitanteInfoRespondHandler(reqRespond);
    expect(resRespond.status).toBe(200);
    const bodyRespond = await resRespond.json();
    expect(bodyRespond.success).toBe(true);

    // Verify in DB that solicitud is respondida
    const { data: solDb } = await serviceClient
      .from('solicitudes_informacion')
      .select('estado, respuesta_texto')
      .eq('id', infoRequestIdA1)
      .single();

    expect(solDb?.estado).toBe('respondida');
    expect(solDb?.respuesta_texto).toContain('Google Drive');

    // Test idempotency with fresh Request
    const reqRespond2 = new Request('http://localhost/functions/v1/solicitante-info-respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({
        solicitud_id: infoRequestIdA1,
        respuesta_texto: 'Adjunto link de Google Drive con el archivo vectorial .ai',
        enlaces: ['https://drive.google.com/drive/folders/test-vector-logo'],
      }),
    });
    const resIdempotent = await solicitanteInfoRespondHandler(reqRespond2);
    expect(resIdempotent.status).toBe(200);
    const bodyIdempotent = await resIdempotent.json();
    expect(bodyIdempotent.idempotent).toBe(true);
  });

  it('6. solicitante-session-revoke cierra la sesión y rechaza peticiones posteriores', async () => {
    const reqRevoke = new Request('http://localhost/functions/v1/solicitante-session-revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({}),
    });

    const resRevoke = await solicitanteSessionRevokeHandler(reqRevoke);
    expect(resRevoke.status).toBe(200);

    // Subsequent call with revoked session fails
    const reqAfterRevoke = new Request('http://localhost/functions/v1/solicitante-pedidos-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({}),
    });

    const resAfterRevoke = await solicitantePedidosListHandler(reqAfterRevoke);
    expect(resAfterRevoke.status).toBe(401);
  });

  // =========================================================================
  // F9 SUITE: Operaciones de Finalización, Cancelación, Reapertura y Archivo
  // =========================================================================

  it('7. F9: Finalización con entrega (Drive URL + nota) y protección contra estados inválidos', async () => {
    // 1. Assign and advance Pedido A2: Nuevo -> En revisión -> En proceso
    const { data: pedA2Init } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoA2Id)
      .single();

    const { error: assignErr } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedidoA2Id,
      p_responsable_user_id: operadorUserId,
      p_expected_version: pedA2Init!.version,
    });
    expect(assignErr).toBeNull();

    const { data: pedA2Assigned } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoA2Id)
      .single();

    // Transition Nuevo -> En revisión
    const { error: revErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoA2Id,
      p_target_state: 'En revisión',
      p_expected_version: pedA2Assigned!.version,
      p_motivo: 'Revisando requerimientos técnicos',
    });
    expect(revErr).toBeNull();

    const { data: pedA2InRev } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoA2Id)
      .single();

    // Transition En revisión -> En proceso
    const { error: stateErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoA2Id,
      p_target_state: 'En proceso',
      p_expected_version: pedA2InRev!.version,
      p_motivo: 'Comenzando producción gráfica',
    });
    expect(stateErr).toBeNull();

    const { data: pedA2InProcess } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoA2Id)
      .single();

    // 2. Finalize requires URL or files
    const { error: finReqErr } = await operadorClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoA2Id,
      p_expected_version: pedA2InProcess!.version,
      p_url_entrega: '',
      p_nota_entrega: 'Nota sin link',
    });
    expect(finReqErr).toBeDefined();

    // 3. Finalize with valid Google Drive link and note
    const { data: finData, error: finErr } = await operadorClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoA2Id,
      p_expected_version: pedA2InProcess!.version,
      p_url_entrega: 'https://drive.google.com/drive/folders/f9-final-delivery-assets',
      p_nota_entrega: 'Archivos finales listos para imprenta y redes',
    });
    expect(finErr).toBeNull();
    expect(finData.success).toBe(true);
    expect(finData.estado).toBe('Finalizado');

    // 4. Verify delivery is active in entregas_pedido
    const { data: deliveryRecord } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('pedido_id', pedidoA2Id)
      .eq('es_vigente', true)
      .single();

    expect(deliveryRecord).toBeDefined();
    expect(deliveryRecord?.enlace_externo).toBe('https://drive.google.com/drive/folders/f9-final-delivery-assets');
  });

  it('8. F9: Archivado y Restauración de pedido Finalizado', async () => {
    const { data: pedA2 } = await serviceClient
      .from('pedidos')
      .select('version, estado')
      .eq('id', pedidoA2Id)
      .single();

    expect(pedA2?.estado).toBe('Finalizado');

    // Archive
    const { data: arcData, error: arcErr } = await adminClient.rpc('pedido_archive', {
      p_pedido_id: pedidoA2Id,
      p_expected_version: pedA2!.version,
    });
    expect(arcErr).toBeNull();
    expect(arcData.success).toBe(true);

    const { data: pedA2Archived } = await serviceClient
      .from('pedidos')
      .select('archivado, version')
      .eq('id', pedidoA2Id)
      .single();
    expect(pedA2Archived?.archivado).toBe(true);

    // Restore
    const { data: resData, error: resErr } = await adminClient.rpc('pedido_restore', {
      p_pedido_id: pedidoA2Id,
      p_expected_version: pedA2Archived!.version,
    });
    expect(resErr).toBeNull();
    expect(resData.success).toBe(true);

    const { data: pedA2Restored } = await serviceClient
      .from('pedidos')
      .select('archivado')
      .eq('id', pedidoA2Id)
      .single();
    expect(pedA2Restored?.archivado).toBe(false);
  });

  it('9. F9: Cancelación con motivo obligatorio y Reapertura a En revisión', async () => {
    // Prepare Pedido B1
    const { data: pedB1Init } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoB1Id)
      .single();

    // Assign operator
    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedidoB1Id,
      p_responsable_user_id: operadorUserId,
      p_expected_version: pedB1Init!.version,
    });

    const { data: pedB1Assigned } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoB1Id)
      .single();

    // 1. Cancel without motive fails
    const { error: cancelNoMotiveErr } = await adminClient.rpc('pedido_cancel', {
      p_pedido_id: pedidoB1Id,
      p_expected_version: pedB1Assigned!.version,
      p_motivo: '',
    });
    expect(cancelNoMotiveErr).toBeDefined();

    // 2. Cancel with motive succeeds
    const { data: cancelData, error: cancelErr } = await adminClient.rpc('pedido_cancel', {
      p_pedido_id: pedidoB1Id,
      p_expected_version: pedB1Assigned!.version,
      p_motivo: 'Actividad deportiva postergada para el próximo año',
    });
    expect(cancelErr).toBeNull();
    expect(cancelData.success).toBe(true);

    const { data: pedB1Canceled } = await serviceClient
      .from('pedidos')
      .select('estado, version')
      .eq('id', pedidoB1Id)
      .single();
    expect(pedB1Canceled?.estado).toBe('Cancelado');

    // 3. Reopen from Cancelled -> Transitions to 'En revisión' (has assigned operator)
    const { data: reopenData, error: reopenErr } = await adminClient.rpc('pedido_reopen', {
      p_pedido_id: pedidoB1Id,
      p_expected_version: pedB1Canceled!.version,
      p_motivo: 'Se reactivó el cronograma de actividades deportivas',
    });
    expect(reopenErr).toBeNull();
    expect(reopenData.success).toBe(true);
    expect(reopenData.estado).toBe('En revisión');

    // 4. Reopen cannot be called on non-cancelled order
    const { data: pedB1Reopened } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoB1Id)
      .single();

    const { error: reopenActiveErr } = await adminClient.rpc('pedido_reopen', {
      p_pedido_id: pedidoB1Id,
      p_expected_version: pedB1Reopened!.version,
      p_motivo: 'Intento de reapertura sobre pedido activo',
    });
    expect(reopenActiveErr).toBeDefined();
  });

  it('10. F9 & OCC: Conflicto de versión optimista (40001 VERSION_CONFLICT)', async () => {
    const { data: pedB1 } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedidoB1Id)
      .single();

    const currentVersion = pedB1!.version;
    const staleVersion = currentVersion - 1;

    const { error: occErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoB1Id,
      p_target_state: 'En proceso',
      p_expected_version: staleVersion,
      p_motivo: 'Intento con versión vieja',
    });

    expect(occErr).toBeDefined();
    expect(occErr?.message).toContain('VERSION_CONFLICT');
  });
});
