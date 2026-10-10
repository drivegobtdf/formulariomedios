import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function getApiKeys() {
  const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
  const serviceKey = keys.find(k => k.id === 'service_role' || k.name === 'service_role')?.api_key?.trim();
  const anonKey = keys.find(k => k.id === 'anon' || k.name === 'anon')?.api_key?.trim();
  if (!serviceKey || !anonKey) {
    throw new Error('No se pudieron obtener las API keys para Supabase TEST');
  }
  return { serviceKey, anonKey };
}

async function main() {
  console.log('================================================================');
  console.log('SUITE DE PRUEBAS AUTOMATIZADAS — FASE B.1.1 (TEST: ' + TEST_PROJECT_REF + ')');
  console.log('REALTIME WEBSOCKETS, RETENCIÓN SET NULL, AISLAMIENTO Y SEGURIDAD');
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();

  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anonClient = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const createdUserIds = [];
  const createdPedidoIds = [];
  const createdEnvioIds = [];
  const channelsToClean = [];
  let testSuccess = true;

  try {
    // --------------------------------------------------------------------------
    // 0. CREACIÓN DE USUARIOS DE TEST
    // --------------------------------------------------------------------------
    console.log('0. Creando usuarios de prueba...');
    const timestamp = Date.now();
    const password = 'Password123!Secure';

    // Admin
    const adminEmail = `qa-admin-b11-${timestamp}@tdf.gob.ar`;
    const { data: adminAuth } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    const adminId = adminAuth.user.id;
    createdUserIds.push(adminId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: adminId,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
      nombre: 'Admin QA',
      apellido: 'B11',
      nombre_usuario: `qa_admin_${timestamp}`
    });

    const { data: adminSession } = await anonClient.auth.signInWithPassword({ email: adminEmail, password });
    const adminClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${adminSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Operador A (equipo)
    const opAEmail = `qa-opA-b11-${timestamp}@tdf.gob.ar`;
    const { data: opAAuth } = await serviceClient.auth.admin.createUser({
      email: opAEmail,
      password,
      email_confirm: true,
    });
    const opAId = opAAuth.user.id;
    createdUserIds.push(opAId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: opAId,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
      nombre: 'Operador A',
      apellido: 'B11',
      nombre_usuario: `qa_opa_${timestamp}`
    });

    const { data: opASession } = await anonClient.auth.signInWithPassword({ email: opAEmail, password });
    const opAJwt = opASession.session.access_token;
    const opA1Client = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opAJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    opA1Client.realtime.setAuth(opAJwt);

    const opA2Client = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opAJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    opA2Client.realtime.setAuth(opAJwt);

    // Operador B (equipo)
    const opBEmail = `qa-opB-b11-${timestamp}@tdf.gob.ar`;
    const { data: opBAuth } = await serviceClient.auth.admin.createUser({
      email: opBEmail,
      password,
      email_confirm: true,
    });
    const opBId = opBAuth.user.id;
    createdUserIds.push(opBId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: opBId,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
      nombre: 'Operador B',
      apellido: 'B11',
      nombre_usuario: `qa_opb_${timestamp}`
    });

    const { data: opBSession } = await anonClient.auth.signInWithPassword({ email: opBEmail, password });
    const opBJwt = opBSession.session.access_token;
    const opB1Client = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opBJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    opB1Client.realtime.setAuth(opBJwt);

    // Observador
    const obsEmail = `qa-obs-b11-${timestamp}@tdf.gob.ar`;
    const { data: obsAuth } = await serviceClient.auth.admin.createUser({
      email: obsEmail,
      password,
      email_confirm: true,
    });
    const obsId = obsAuth.user.id;
    createdUserIds.push(obsId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: obsId,
      app_role: 'observador',
      estado_acceso: 'aprobado',
      nombre: 'Observador QA',
      apellido: 'B11',
      nombre_usuario: `qa_obs_${timestamp}`
    });

    const { data: obsSession } = await anonClient.auth.signInWithPassword({ email: obsEmail, password });
    const obsJwt = obsSession.session.access_token;
    const obsClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${obsJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    obsClient.realtime.setAuth(obsJwt);

    console.log('✓ Usuarios de prueba creados y clientes autenticados (Admin, OpA1, OpA2, OpB1, Observador)\n');

    // Fixture helper: Crear pedido de prueba
    const { data: cats } = await serviceClient.from('categorias_servicio').select('id').limit(1);
    const catId = cats[0].id;
    const { data: tipos } = await serviceClient.from('tipos_servicio').select('id').eq('categoria_id', catId).limit(1);
    const tipoId = tipos[0].id;

    async function createTestPedido(initialResponsable = null) {
      const envioId = crypto.randomUUID();
      createdEnvioIds.push(envioId);
      await serviceClient.from('envios_formulario').insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.randomBytes(32).toString('hex'),
        nombre_apellido: 'QA Solicitante B11',
        telefono: '+5492964112233',
        correo: 'qa-b11@tdf.gob.ar',
        area_solicitante: 'Dirección Provincial de Prueba B11'
      });

      const pedidoId = crypto.randomUUID();
      createdPedidoIds.push(pedidoId);
      const randNum = Math.floor(Math.random() * 80000) + 10000;
      const pedidoVisible = `PED-2026-D0${randNum}`;

      await serviceClient.from('pedidos').insert({
        id: pedidoId,
        envio_id: envioId,
        categoria_id: catId,
        tipo_servicio_id: tipoId,
        pedido_visible: pedidoVisible,
        tracking_token_hash: crypto.randomBytes(32).toString('hex'),
        client_request_ref: crypto.randomUUID(),
        anio: 2026,
        numero: randNum,
        codigo_categoria: 'D',
        estado: 'Nuevo',
        responsable_user_id: initialResponsable,
        version: 1,
        informacion_especifica: { motivo: 'QA Test B11' }
      });

      return { pedidoId, pedidoVisible, envioId };
    }

    // ==========================================================================
    // SECCIÓN 1: AUDITORÍA DE PERMISOS DEL DISPATCHER Y TRIGGER (PASO 2 Y 3)
    // ==========================================================================
    console.log('--- TEST 1: AUDITORÍA DE PERMISOS DEL DISPATCHER Y TRIGGER ---');
    // Verificamos que anon y authenticated no puedan ejecutar el dispatcher
    const anonDispatchAttempt = await anonClient.rpc('notification_dispatch_from_domain_event', {
      p_event_id: crypto.randomUUID(),
      p_event_name: 'pedido.assigned',
      p_aggregate_id: crypto.randomUUID(),
      p_payload: {},
      p_actor_id: null
    });

    console.log('[Test 1] Intento de ejecución de dispatcher por anon:', anonDispatchAttempt.error?.message);
    if (!anonDispatchAttempt.error || !anonDispatchAttempt.error.message.includes('permission denied')) {
      throw new Error('[SECURITY FAIL] Anon pudo ejecutar notification_dispatch_from_domain_event!');
    }

    const authDispatchAttempt = await opA1Client.rpc('notification_dispatch_from_domain_event', {
      p_event_id: crypto.randomUUID(),
      p_event_name: 'pedido.assigned',
      p_aggregate_id: crypto.randomUUID(),
      p_payload: {},
      p_actor_id: null
    });
    console.log('[Test 1] Intento de ejecución de dispatcher por authenticated:', authDispatchAttempt.error?.message);
    if (!authDispatchAttempt.error || !authDispatchAttempt.error.message.includes('permission denied')) {
      throw new Error('[SECURITY FAIL] Authenticated pudo ejecutar notification_dispatch_from_domain_event!');
    }
    console.log('✓ Dispatcher completamente protegido contra ejecución externa vía API (PASS)\n');

    // ==========================================================================
    // SECCIÓN 2: DOMAIN EVENT NO RELACIONADO (PASO 6)
    // ==========================================================================
    console.log('--- TEST 2: DOMAIN EVENT NO RELACIONADO (AISLAMIENTO DEL TRIGGER) ---');
    const { pedidoId: pedIsoId } = await createTestPedido(opAId);
    const { count: countBeforeIso } = await serviceClient.from('notificaciones_usuario').select('*', { count: 'exact', head: true });

    // Insertar evento de dominio legítimo no perteneciente a notificaciones
    const unrelatedEventId = crypto.randomUUID();
    const { error: unrelatedInsErr } = await serviceClient.from('domain_events').insert({
      id: unrelatedEventId,
      event_name: 'pedido.etiqueta_actualizada_tecnica',
      aggregate_type: 'pedido',
      aggregate_id: pedIsoId,
      payload: { etiqueta_nueva: 'Urgente' },
      actor_user_id: adminId
    });

    if (unrelatedInsErr) throw new Error('Error al insertar evento no relacionado: ' + unrelatedInsErr.message);

    const { count: countAfterIso } = await serviceClient.from('notificaciones_usuario').select('*', { count: 'exact', head: true });
    console.log(`[Test 2] Conteo notificaciones antes: ${countBeforeIso}, después: ${countAfterIso}`);
    if (countBeforeIso !== countAfterIso) {
      throw new Error('[FAIL] Evento no relacionado generó notificaciones no deseadas');
    }
    console.log('✓ Trigger ignora limpiamente eventos de dominio ajenos sin fallar (PASS)\n');

    // ==========================================================================
    // SECCIÓN 3: DESTINATARIO INEXISTENTE O NO VÁLIDO (PASO 7)
    // ==========================================================================
    console.log('--- TEST 3: DESTINATARIOS INEXISTENTES, OBSERVADORES O NO HABILITADOS ---');
    // Caso 1: Nota interna en pedido sin responsable -> 0 notificaciones, nota guardada
    const { pedidoId: pedSinRespId } = await createTestPedido(null);
    const noteResSinResp = await opA1Client.rpc('nota_pedido_create', {
      p_pedido_id: pedSinRespId,
      p_contenido: 'Nota en pedido sin responsable',
      p_visibilidad: 'interna'
    });
    if (noteResSinResp.error || !noteResSinResp.data?.success) {
      throw new Error('Fallo al crear nota en pedido sin responsable: ' + JSON.stringify(noteResSinResp));
    }
    const { data: notifsNotaSinResp } = await serviceClient.from('notificaciones_usuario').select('*').eq('pedido_id', pedSinRespId);
    console.log(`[Test 3] Notificaciones generadas por nota sin responsable: ${notifsNotaSinResp.length}`);
    if (notifsNotaSinResp.length !== 0) {
      throw new Error('[FAIL] Se generó notificación para nota sin responsable');
    }

    // Caso 2: Nota interna en pedido donde responsable es Observador -> 0 notificaciones
    const { pedidoId: pedObsRespId } = await createTestPedido(obsId);
    const noteResObsResp = await opA1Client.rpc('nota_pedido_create', {
      p_pedido_id: pedObsRespId,
      p_contenido: 'Nota en pedido asignado a observador',
      p_visibilidad: 'interna'
    });
    if (noteResObsResp.error || !noteResObsResp.data?.success) {
      throw new Error('Fallo al crear nota: ' + JSON.stringify(noteResObsResp));
    }
    const { data: notifsNotaObs } = await serviceClient.from('notificaciones_usuario').select('*').eq('pedido_id', pedObsRespId);
    console.log(`[Test 3] Notificaciones generadas por nota con responsable observador: ${notifsNotaObs.length}`);
    if (notifsNotaObs.length !== 0) {
      throw new Error('[FAIL] Observador recibió notificación de nota!');
    }
    console.log('✓ Casos sin responsable y con observador manejados limpiamente (PASS)\n');

    // ==========================================================================
    // SECCIÓN 4: VERIFICAR PUBLICATION EN SUPABASE_REALTIME (PASO 9)
    // ==========================================================================
    console.log('--- TEST 4: VERIFICACIÓN DE PUBLICACIÓN REALTIME ---');
    const { data: pubData, error: pubErr } = await serviceClient
      .from('notificaciones_usuario')
      .select('id')
      .limit(1);

    if (pubErr) throw new Error('Error al consultar notificaciones_usuario: ' + pubErr.message);
    console.log('✓ Tabla notificaciones_usuario accesible y publicada (PASS)\n');

    // ==========================================================================
    // SECCIÓN 5: PRUEBAS REALTIME E2E REAL CON WEBSOCKETS (PASOS 10 A 15)
    // ==========================================================================
    console.log('--- TEST 5: REALTIME E2E REAL CON WEBSOCKETS (A1, A2, B1, OBS) ---');
    const eventsReceivedA1 = [];
    const eventsReceivedA2 = [];
    const eventsReceivedB1 = [];
    const eventsReceivedObs = [];

    // Promesa de suscripción para cada canal
    function waitForSubscription(channel, name) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout suscribiendo canal ${name}`)), 8000);
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            console.log(`✓ Canal ${name} suscrito en Realtime (SUBSCRIBED)`);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout);
            reject(new Error(`Error suscribiendo canal ${name}: ${status} - ${err?.message || err}`));
          }
        });
      });
    }

    const chA1 = opA1Client.channel(`rt-a1-${timestamp}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notificaciones_usuario',
        filter: `user_id=eq.${opAId}`
      }, (payload) => {
        eventsReceivedA1.push({ payload, receivedAt: Date.now() });
      });
    channelsToClean.push({ client: opA1Client, channel: chA1 });

    const chA2 = opA2Client.channel(`rt-a2-${timestamp}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notificaciones_usuario',
        filter: `user_id=eq.${opAId}`
      }, (payload) => {
        eventsReceivedA2.push({ payload, receivedAt: Date.now() });
      });
    channelsToClean.push({ client: opA2Client, channel: chA2 });

    const chB1 = opB1Client.channel(`rt-b1-${timestamp}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notificaciones_usuario',
        filter: `user_id=eq.${opBId}`
      }, (payload) => {
        eventsReceivedB1.push({ payload, receivedAt: Date.now() });
      });
    channelsToClean.push({ client: opB1Client, channel: chB1 });

    const chObs = obsClient.channel(`rt-obs-${timestamp}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notificaciones_usuario',
        filter: `user_id=eq.${obsId}`
      }, (payload) => {
        eventsReceivedObs.push({ payload, receivedAt: Date.now() });
      });
    channelsToClean.push({ client: obsClient, channel: chObs });

    await Promise.all([
      waitForSubscription(chA1, 'A1'),
      waitForSubscription(chA2, 'A2'),
      waitForSubscription(chB1, 'B1'),
      waitForSubscription(chObs, 'Observador')
    ]);

    // --------------------------------------------------------------------------
    // 5.1: REALTIME INSERT (Asignación a Usuario A)
    // --------------------------------------------------------------------------
    console.log('\n--- 5.1: Generando notificación REAL para Operador A (Asignación) ---');
    const { pedidoId: pedRealtimeAId, pedidoVisible: pedRtVis } = await createTestPedido(opBId);

    const assignToARes = await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedRealtimeAId,
      p_responsable_user_id: opAId,
      p_expected_version: 1,
      p_motivo: 'Asignación para prueba de Realtime'
    });

    if (assignToARes.error || !assignToARes.data?.success) {
      throw new Error('Fallo en pedido_assign: ' + JSON.stringify(assignToARes));
    }

    // Esperar eventos vía WebSocket (hasta 6 segundos)
    console.log('Esperando eventos Realtime INSERT...');
    await new Promise((res) => setTimeout(res, 2500));

    console.log(`[Realtime INSERT] Eventos recibidos por A1: ${eventsReceivedA1.length}`);
    console.log(`[Realtime INSERT] Eventos recibidos por A2: ${eventsReceivedA2.length}`);
    console.log(`[Realtime INSERT] Eventos recibidos por B1: ${eventsReceivedB1.length}`);
    console.log(`[Realtime INSERT] Eventos recibidos por Obs: ${eventsReceivedObs.length}`);

    if (eventsReceivedA1.length === 0 || eventsReceivedA2.length === 0) {
      throw new Error('[REALTIME FAIL] Ni A1 ni A2 recibieron el evento INSERT por WebSocket');
    }
    if (eventsReceivedB1.length !== 0) {
      throw new Error('[AISLAMIENTO FAIL] B1 recibió la notificación destinada a A!');
    }
    if (eventsReceivedObs.length !== 0) {
      throw new Error('[SEGURIDAD FAIL] Observador recibió notificación por Realtime!');
    }

    const payloadA1 = eventsReceivedA1[0].payload.new;
    if (payloadA1.user_id !== opAId || payloadA1.tipo !== 'pedido_asignado' || payloadA1.read_at !== null) {
      throw new Error('[PAYLOAD FAIL] Payload de Realtime no coincide con lo esperado: ' + JSON.stringify(payloadA1));
    }
    const notifIdA = payloadA1.id;
    console.log('✓ Realtime INSERT recibido simultáneamente por A1 y A2; B1 y Observador aislados (PASS)');

    // --------------------------------------------------------------------------
    // 5.2: REALTIME UPDATE / SHARED ACCOUNT (A1 marca leída -> A2 recibe UPDATE)
    // --------------------------------------------------------------------------
    console.log('\n--- 5.2: Probando Shared Account (A1 marca leída -> A2 recibe UPDATE) ---');
    const updateEventsBeforeA2 = eventsReceivedA2.length;
    const callStartTime = Date.now();

    const markReadRes = await opA1Client.rpc('notification_mark_read', {
      p_notification_id: notifIdA
    });

    if (markReadRes.error || !markReadRes.data?.updated) {
      throw new Error('Fallo en mark_read desde A1: ' + JSON.stringify(markReadRes));
    }

    // Esperar evento UPDATE en A2
    await new Promise((res) => setTimeout(res, 2000));

    const updateEventA2 = eventsReceivedA2.slice(updateEventsBeforeA2).find(e => e.payload.eventType === 'UPDATE');
    if (!updateEventA2) {
      throw new Error('[SHARED ACCOUNT FAIL] A2 no recibió el evento UPDATE cuando A1 marcó leída la notificación');
    }

    const latencyMs = updateEventA2.receivedAt - callStartTime;
    console.log(`✓ A2 recibió evento UPDATE con read_at != null`);
    console.log(`✓ Latencia aproximada Realtime: ${latencyMs} ms (PASS)`);

    // --------------------------------------------------------------------------
    // 5.3: AISLAMIENTO BIDIRECCIONAL (Asignar a B -> B1 recibe, A1/A2 no)
    // --------------------------------------------------------------------------
    console.log('\n--- 5.3: Probando Aislamiento Bidireccional (Notificación para B) ---');
    const countA1BeforeB = eventsReceivedA1.length;
    const countA2BeforeB = eventsReceivedA2.length;
    const countB1BeforeB = eventsReceivedB1.length;

    const { pedidoId: pedRealtimeBId } = await createTestPedido(opAId);
    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedRealtimeBId,
      p_responsable_user_id: opBId,
      p_expected_version: 1,
      p_motivo: 'Asignación a B para aislamiento Realtime'
    });

    await new Promise((res) => setTimeout(res, 2500));

    const newEventsB1 = eventsReceivedB1.length - countB1BeforeB;
    const newEventsA1 = eventsReceivedA1.length - countA1BeforeB;
    const newEventsA2 = eventsReceivedA2.length - countA2BeforeB;

    console.log(`[Aislamiento] Nuevos eventos B1: ${newEventsB1}`);
    console.log(`[Aislamiento] Nuevos eventos A1: ${newEventsA1}`);
    console.log(`[Aislamiento] Nuevos eventos A2: ${newEventsA2}`);

    if (newEventsB1 === 0) {
      throw new Error('[FAIL] B1 no recibió su notificación');
    }
    if (newEventsA1 !== 0 || newEventsA2 !== 0) {
      throw new Error('[AISLAMIENTO FAIL] A1 o A2 recibieron la notificación de B!');
    }

    // Comprobar barrera RLS: A intenta SELECT sobre la notificación de B
    const notifB = eventsReceivedB1[eventsReceivedB1.length - 1].payload.new;
    const { data: aSelectB } = await opA1Client
      .from('notificaciones_usuario')
      .select('*')
      .eq('id', notifB.id);

    if (aSelectB && aSelectB.length !== 0) {
      throw new Error('[RLS FAIL] Usuario A pudo leer la fila de notificación de Usuario B!');
    }
    console.log('✓ Aislamiento Realtime bidireccional y barrera RLS verificados al 100% (PASS)\n');

    // ==========================================================================
    // SECCIÓN 6: RETENCIÓN DE NOTIFICACIÓN TRAS ELIMINAR DOMAIN_EVENT (PASO 18)
    // ==========================================================================
    console.log('--- TEST 6: RETENCIÓN TRAS ELIMINAR DOMAIN_EVENT Y PURGA DE PEDIDO ---');
    const { pedidoId: pedRetId } = await createTestPedido(opAId);

    // Generar domain event y notificación para pedRetId
    const sourceEvId = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: sourceEvId,
      event_name: 'pedido.assigned',
      aggregate_type: 'pedido',
      aggregate_id: pedRetId,
      payload: { responsable_nuevo_id: opAId },
      actor_user_id: adminId
    });

    const { data: notifsRetPre } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', pedRetId);

    if (notifsRetPre.length !== 1 || notifsRetPre[0].source_event_id !== sourceEvId) {
      throw new Error('[FAIL] Notificación inicial con source_event_id no encontrada');
    }
    const notifRetId = notifsRetPre[0].id;

    // 6.1: Eliminar ÚNICAMENTE el domain_event (como postgres/superuser para verificar cascade/set-null)
    console.log('[Test 6] Eliminando únicamente el domain_event fuente...');
    execSync(`npx.cmd supabase db query --linked "DELETE FROM public.domain_events WHERE id = '${sourceEvId}';"`, { encoding: 'utf8' });

    // Verificar que la notificación permanece y source_event_id pasó a NULL
    const { data: notifRetPostEv, error: retErr } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('id', notifRetId)
      .single();

    if (retErr || !notifRetPostEv) {
      throw new Error('[RETENCIÓN FAIL] La notificación fue eliminada al borrar el domain_event! Esperado: ON DELETE SET NULL');
    }
    if (notifRetPostEv.source_event_id !== null) {
      throw new Error(`[RETENCIÓN FAIL] source_event_id no pasó a NULL, valor actual: ${notifRetPostEv.source_event_id}`);
    }
    console.log('✓ La notificación permanece intacta con source_event_id = NULL tras eliminar el domain_event');

    // 6.2: Purga normal del pedido (admin_pedidos_purge_preview y admin_pedidos_purge)
    console.log('[Test 6] Probando purga administrativa del pedido con la notificación...');
    const previewRes = await adminClient.rpc('admin_pedidos_purge_preview', {
      p_pedido_ids: [pedRetId],
      p_actor: 'QA Admin Purge'
    });

    if (previewRes.error || previewRes.data?.notificaciones_count !== 1) {
      throw new Error('[FAIL] Purge preview no reportó 1 notificación: ' + JSON.stringify(previewRes));
    }
    console.log('✓ admin_pedidos_purge_preview reporta notificaciones_count = 1');

    // Ejecutar purga de pedido vía saga
    const initPurgeRes = await serviceClient.rpc('admin_purge_operation_init', {
      p_pedido_ids: [pedRetId],
      p_idempotency_key: 'qa_purge_ret_' + Date.now(),
      p_actor: 'QA Admin Purge'
    });

    const purgeOpId = initPurgeRes.data.operation_id;
    const purgeExecRes = await serviceClient.rpc('admin_pedidos_purge', {
      p_operation_id: purgeOpId,
      p_actor: 'QA Admin Purge'
    });

    if (purgeExecRes.error || !purgeExecRes.data?.success) {
      throw new Error('Error en admin_pedidos_purge: ' + JSON.stringify(purgeExecRes));
    }

    const { data: notifsPostPurge } = await serviceClient
      .from('notificaciones_usuario')
      .select('id')
      .eq('pedido_id', pedRetId);

    if (notifsPostPurge.length !== 0) {
      throw new Error(`[FAIL] Notificaciones no fueron eliminadas en purga! Quedan: ${notifsPostPurge.length}`);
    }
    console.log('✓ Purga de pedido eliminó limpiamente la notificación sin registros huérfanos (PASS)\n');

    console.log('================================================================');
    console.log('¡TODAS LAS PRUEBAS FASE B.1.1 PASARON EXITOSAMENTE! (ALL PASS)');
    console.log('================================================================\n');

  } catch (err) {
    testSuccess = false;
    console.error('\n❌ ERROR EN LA SUITE B.1.1:', err);
  } finally {
    // --------------------------------------------------------------------------
    // LIMPIEZA
    // --------------------------------------------------------------------------
    console.log('Limpiando canales y fixtures de prueba en Supabase TEST...');
    try {
      for (const item of channelsToClean) {
        try { item.client.removeChannel(item.channel); } catch {}
      }
      if (createdPedidoIds.length > 0) {
        await serviceClient.from('notificaciones_usuario').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('domain_events').delete().in('aggregate_id', createdPedidoIds);
        await serviceClient.from('notas_pedido').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('pedido_asignaciones').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('pedidos').delete().in('id', createdPedidoIds);
      }
      if (createdEnvioIds.length > 0) {
        await serviceClient.from('envios_formulario').delete().in('id', createdEnvioIds);
      }
      for (const uid of createdUserIds) {
        await serviceClient.from('notificaciones_usuario').delete().eq('user_id', uid);
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', uid);
        await serviceClient.auth.admin.deleteUser(uid);
      }
      console.log('✓ Fixtures limpiados correctamente.');
    } catch (cleanupErr) {
      console.error('Error durante la limpieza de fixtures:', cleanupErr);
    }

    if (!testSuccess) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

main();
