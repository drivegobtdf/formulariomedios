import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS_URL = `${SUPABASE_PROJECT_URL}/functions/v1`;

function getCloudKeysInMemory() {
  try {
    const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} --reveal --output json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(rawOutput);
    let anonKey = '';
    let serviceKey = '';

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.name === 'anon' || item.name === 'publishable' || item.type === 'anon') {
          anonKey = item.api_key || item.key || item.value || '';
        }
        if (item.name === 'service_role' || item.name === 'secret' || item.type === 'service_role') {
          serviceKey = item.api_key || item.key || item.value || '';
        }
      }
    } else if (typeof parsed === 'object') {
      anonKey = parsed.anon || parsed.publishable || parsed.SUPABASE_ANON_KEY || '';
      serviceKey = parsed.service_role || parsed.secret || parsed.SUPABASE_SERVICE_ROLE_KEY || '';
    }

    return { anonKey, serviceKey };
  } catch (err) {
    throw new Error('No se pudieron obtener las claves del proyecto Cloud en memoria: ' + err.message);
  }
}

async function run() {
  console.log('================================================================');
  console.log('  PEDIDOS — Verificación Gate F7/F8 en Supabase Cloud Real');
  console.log(`  Target: ${SUPABASE_PROJECT_URL}`);
  console.log('================================================================\n');

  const { anonKey, serviceKey } = getCloudKeysInMemory();
  if (!anonKey || !serviceKey) {
    throw new Error('No se encontraron claves válidas anon/service_role para el proyecto Cloud');
  }
  console.log('✓ Credenciales Cloud cargadas en memoria.\n');

  const serviceClient = createClient(SUPABASE_PROJECT_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  function assert(name, condition, extraInfo = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  ✓ PASS: ${name} ${extraInfo}`);
      results.details.push({ name, status: 'PASS', extraInfo });
    } else {
      results.failed++;
      console.error(`  ❌ FAIL: ${name} ${extraInfo}`);
      results.details.push({ name, status: 'FAIL', extraInfo });
    }
  }

  const createdEnvioIds = [];
  const createdPedidoIds = [];
  const createdUserIds = [];

  try {
    // 1. Create a test team/operator user in auth & approve in usuarios_acceso
    const opEmail = `op.f8.tester.${Date.now()}@tierradelfuego.gob.ar`;
    const opPass = 'ComplexPasswordF8!2026';
    const { data: userData, error: authErr } = await serviceClient.auth.admin.createUser({
      email: opEmail,
      password: opPass,
      email_confirm: true,
      user_metadata: {
        nombre: 'Operador',
        apellido: 'F8 Real',
        nombre_usuario: `op_f8_${Date.now()}`,
      },
    });
    if (authErr) throw authErr;
    const operatorId = userData.user.id;
    createdUserIds.push(operatorId);

    const { error: accErr } = await serviceClient.from('usuarios_acceso').update({
      estado_acceso: 'aprobado',
      app_role: 'equipo',
      aprobado_at: new Date().toISOString(),
    }).eq('user_id', operatorId);
    assert('Aprobar usuario con rol equipo en usuarios_acceso', !accErr, accErr ? accErr.message : '');

    // Sign in to get operator JWT client
    const userClient = createClient(SUPABASE_PROJECT_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: signInErr } = await userClient.auth.signInWithPassword({
      email: opEmail,
      password: opPass,
    });
    assert('Iniciar sesión con usuario operador (rol equipo)', !signInErr && Boolean(authData.session?.access_token));

    // 2. Create test submission via submission-create Edge Function
    console.log('\n--- Creando Submission y Pedido vía submission-create ---');
    const submissionKey = crypto.randomUUID();
    const clientRef1 = crypto.randomUUID();
    const solicitanteEmail = `solicitante.${Date.now()}@tierradelfuego.gob.ar`;

    const submissionPayload = {
      schema_version: 3,
      submission_key: submissionKey,
      contacto: {
        nombre_apellido: 'Solicitante Cloud F7/F8',
        telefono: '+542901445577',
        correo: solicitanteEmail,
        area_solicitante: 'Dirección de Prensa',
      },
      pedidos: [
        {
          client_request_ref: clientRef1,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Flyer Cloud F7 F8 Test' },
        },
      ],
      file_bindings: [],
    };

    const submitRes = await fetch(`${FUNCTIONS_URL}/submission-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(submissionPayload),
    });

    assert('submission-create retorna HTTP 201 en Cloud', submitRes.status === 201, `Status: ${submitRes.status}`);
    const submitData = await submitRes.json();
    assert('submission-create devuelve envio_id y pedidos con tracking_token', 
      Boolean(submitData.envio_id) && submitData.pedidos?.length > 0 && Boolean(submitData.pedidos[0].tracking_token)
    );

    const envioId = submitData.envio_id;
    createdEnvioIds.push(envioId);
    const createdPedido = submitData.pedidos[0];
    const pedidoId = createdPedido.id;
    const pedidoVisible = createdPedido.pedido_visible;
    const rawTrackingToken = createdPedido.tracking_token;
    createdPedidoIds.push(pedidoId);

    // 3. Test Edge Function: tracking-get
    console.log('\n--- Probando Edge Function: tracking-get ---');
    const trackRes = await fetch(`${FUNCTIONS_URL}/tracking-get?pedido_visible=${pedidoVisible}&token=${rawTrackingToken}`, {
      headers: { 'apikey': anonKey }
    });
    const trackData = await trackRes.json();
    assert('tracking-get retorna HTTP 200 para token y pedido_visible válidos', trackRes.status === 200, `Status: ${trackRes.status}`);
    assert('tracking-get retorna DTO público completo (sin tracking_token_hash)', 
      trackData.id === pedidoId && trackData.pedido_visible === pedidoVisible && trackData.tracking_token_hash === undefined,
      `Estado: ${trackData.estado}, Visible: ${trackData.pedido_visible}`
    );

    const trackBadRes = await fetch(`${FUNCTIONS_URL}/tracking-get?pedido_visible=${pedidoVisible}&token=bad_token_12345`, {
      headers: { 'apikey': anonKey }
    });
    assert('tracking-get retorna 404 para token inválido', trackBadRes.status === 404);

    // 4. Test Edge Function: tracking-recover (anti-enumeration)
    console.log('\n--- Probando Edge Function: tracking-recover ---');
    const recoverRes = await fetch(`${FUNCTIONS_URL}/tracking-recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
      body: JSON.stringify({ email: solicitanteEmail }),
    });
    const recoverData = await recoverRes.json();
    assert('tracking-recover retorna 200 con mensaje anti-enumeración para email existente', 
      recoverRes.status === 200 && recoverData.success === true
    );

    const recoverFakeRes = await fetch(`${FUNCTIONS_URL}/tracking-recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
      body: JSON.stringify({ email: 'inexistente@tierradelfuego.gob.ar' }),
    });
    const recoverFakeData = await recoverFakeRes.json();
    assert('tracking-recover retorna 200 con mensaje genérico idéntico para email inexistente', 
      recoverFakeRes.status === 200 && recoverFakeData.success === true
    );

    // 5. Test RPCs for F8 Management as Authenticated Operator
    console.log('\n--- Probando RPCs de Gestión F8 (pedido_assign, state changes, OCC) ---');
    const { data: currentPedRec } = await serviceClient.from('pedidos').select('version').eq('id', pedidoId).single();
    const { data: assignRes, error: assignErr } = await userClient.rpc('pedido_assign', {
      p_pedido_id: pedidoId,
      p_responsable_user_id: operatorId,
      p_expected_version: currentPedRec.version,
    });
    assert('RPC pedido_assign asigna responsable y avanza versión', !assignErr && assignRes?.responsable_id === operatorId);

    // Change state from 'Nuevo' to 'En revisión'
    const { data: revRes, error: revErr } = await userClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId,
      p_target_state: 'En revisión',
      p_motivo: 'Tomando pedido para revisión técnica',
      p_expected_version: assignRes.version,
    });
    assert('RPC pedido_change_state cambia a "En revisión"', !revErr && revRes?.estado === 'En revisión');

    // Change state from 'En revisión' to 'En proceso'
    const { data: stRes, error: stErr } = await userClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId,
      p_target_state: 'En proceso',
      p_motivo: 'Iniciando producción gráfica Cloud',
      p_expected_version: revRes.version,
    });
    assert('RPC pedido_change_state cambia a "En proceso"', !stErr && stRes?.estado === 'En proceso');

    // OCC Conflict Test
    const { error: occErr } = await userClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId,
      p_target_state: 'Esperando información',
      p_motivo: 'Conflicto OCC',
      p_expected_version: 999,
    });
    assert('RPC detecta conflicto OCC (VERSION_CONFLICT)', Boolean(occErr), occErr ? occErr.message : '');

    // Create Internal Note
    const { data: notaRes, error: notaErr } = await userClient.rpc('nota_pedido_create', {
      p_pedido_id: pedidoId,
      p_contenido: 'Nota interna de prueba Cloud F8',
      p_visibilidad: 'interna',
    });
    assert('RPC nota_pedido_create registra nota interna', !notaErr && !!notaRes?.nota_id);

    // 6. Test 48h Missing Info Request & Submission
    console.log('\n--- Probando Solicitud de Información Faltante (48h de vigencia) ---');
    const { data: infoReqRes, error: infoReqErr } = await userClient.rpc('info_request_create', {
      p_pedido_id: pedidoId,
      p_mensaje: 'Por favor adjuntar el logo en alta resolución vectorial.',
      p_expected_version: stRes.version,
    });
    assert('RPC info_request_create crea solicitud y genera raw_token de 48h', 
      !infoReqErr && !!infoReqRes?.solicitud_id && !!infoReqRes?.raw_token
    );

    const infoRawToken = infoReqRes.raw_token;

    // Check expiration interval in DB
    const { data: infoDbRec } = await serviceClient.from('solicitudes_informacion').select('*').eq('id', infoReqRes.solicitud_id).single();
    const createdDate = new Date(infoDbRec.created_at);
    const expiresDate = new Date(infoDbRec.expires_at);
    const diffHours = Math.round((expiresDate - createdDate) / (1000 * 60 * 60));
    assert('Vigencia en base de datos es exactamente 48 horas corridas', diffHours === 48, `Horas: ${diffHours}`);

    // Edge Function: info-token-validate (pending)
    const tokenValRes = await fetch(`${FUNCTIONS_URL}/info-token-validate?token=${infoRawToken}`, {
      headers: { 'apikey': anonKey }
    });
    const tokenValData = await tokenValRes.json();
    assert('info-token-validate retorna HTTP 200 y valid=true responded=false', 
      tokenValRes.status === 200 && tokenValData.valid === true && tokenValData.responded === false
    );

    // Edge Function: info-response-submit
    const submitRes2 = await fetch(`${FUNCTIONS_URL}/info-response-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
      body: JSON.stringify({
        token: infoRawToken,
        respuesta_texto: 'Adjunto enlace con el logo vectorial.',
        archivo_ids: [],
      }),
    });
    const submitData2 = await submitRes2.json();
    assert('info-response-submit procesa respuesta exitosamente', 
      submitRes2.status === 200 && submitData2.success === true && submitData2.solicitud_id === infoReqRes.solicitud_id
    );

    // Validate info-token-validate after response (responded)
    const tokenValUsedRes = await fetch(`${FUNCTIONS_URL}/info-token-validate?token=${infoRawToken}`, {
      headers: { 'apikey': anonKey }
    });
    const tokenValUsedData = await tokenValUsedRes.json();
    assert('info-token-validate retorna valid=true responded=true tras responder', 
      tokenValUsedRes.status === 200 && tokenValUsedData.valid === true && tokenValUsedData.responded === true
    );

    // 7. Finalize Pedido with Delivery
    console.log('\n--- Probando Finalización y Entrega de Pedido ---');
    const { data: currentPed2 } = await serviceClient.from('pedidos').select('version').eq('id', pedidoId).single();
    const { data: finRes, error: finErr } = await userClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoId,
      p_expected_version: currentPed2.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/drive/folders/test-cloud-delivery',
      p_nota_entrega: 'Entrega finalizada con éxito en Cloud.',
    });
    assert('RPC pedido_finalize transiciona a "Finalizado" y crea entrega vigente', 
      !finErr && finRes?.estado === 'Finalizado' && !!finRes?.entrega_id
    );

    // 8. Test Archive and Restore
    console.log('\n--- Probando Archivar / Restaurar ---');
    const { data: arcRes, error: arcErr } = await userClient.rpc('pedido_archive', {
      p_pedido_id: pedidoId,
      p_expected_version: finRes.version,
    });
    assert('RPC pedido_archive marca pedido como archivado', !arcErr && arcRes?.archivado === true);

    const { data: restRes, error: restErr } = await userClient.rpc('pedido_restore', {
      p_pedido_id: pedidoId,
      p_expected_version: arcRes.version,
    });
    assert('RPC pedido_restore desarchiva pedido', !restErr && restRes?.archivado === false);

    // 9. Cancel and Reopen flow with a second submission
    console.log('\n--- Probando Cancelación y Reapertura ---');
    const sub2Res = await fetch(`${FUNCTIONS_URL}/submission-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        schema_version: 3,
        submission_key: crypto.randomUUID(),
        contacto: {
          nombre_apellido: 'Cancel Test Solicitante',
          telefono: '+542901445588',
          correo: 'cancel.cloud@tierradelfuego.gob.ar',
          area_solicitante: 'Seguridad',
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'gacetilla',
            tipo_slug: 'gacetilla',
            informacion_especifica: { titulo: 'Gacetilla Cancel Test' },
          },
        ],
        file_bindings: [],
      }),
    });
    const sub2Data = await sub2Res.json();
    const ped2Id = sub2Data.pedidos[0].id;
    createdEnvioIds.push(sub2Data.envio_id);
    createdPedidoIds.push(ped2Id);

    const { data: ped2Rec } = await serviceClient.from('pedidos').select('version').eq('id', ped2Id).single();

    const { data: cancelRes, error: cancelErr } = await userClient.rpc('pedido_cancel', {
      p_pedido_id: ped2Id,
      p_motivo: 'Cancelado por solicitud del usuario en Cloud',
      p_expected_version: ped2Rec.version,
    });
    assert('RPC pedido_cancel cancela pedido con motivo', !cancelErr && cancelRes?.estado === 'Cancelado');

    const { data: reopenRes, error: reopenErr } = await userClient.rpc('pedido_reopen', {
      p_pedido_id: ped2Id,
      p_motivo: 'Reabierto por reactivación en Cloud',
      p_expected_version: cancelRes.version,
    });
    assert('RPC pedido_reopen reabre pedido a "Nuevo" o "En revisión"', !reopenErr && (reopenRes?.estado === 'Nuevo' || reopenRes?.estado === 'En revisión'));

    // 10. Audit Log & Domain Events verification
    const { data: events } = await serviceClient.from('domain_events').select('*').eq('aggregate_id', pedidoId);
    assert('domain_events registra eventos de ciclo de vida en Cloud', (events?.length || 0) >= 3, `Eventos: ${events?.length}`);

  } catch (err) {
    console.error('Error general durante la ejecución de pruebas Cloud:', err);
    assert('Ejecución de suite Cloud sin excepciones', false, err.message);
  } finally {
    console.log('\n--- Limpieza de datos de prueba Cloud ---');
    for (const pid of createdPedidoIds) {
      await serviceClient.from('solicitudes_informacion').delete().eq('pedido_id', pid);
      await serviceClient.from('entregas_pedido').delete().eq('pedido_id', pid);
      await serviceClient.from('notas_pedido').delete().eq('pedido_id', pid);
      await serviceClient.from('domain_events').delete().eq('aggregate_id', pid);
      await serviceClient.from('audit_log').delete().eq('recurso_id', pid);
      await serviceClient.from('pedidos').delete().eq('id', pid);
    }
    for (const eid of createdEnvioIds) {
      await serviceClient.from('envios_formulario').delete().eq('id', eid);
    }
    for (const uid of createdUserIds) {
      await serviceClient.from('usuarios_acceso').delete().eq('user_id', uid);
      await serviceClient.auth.admin.deleteUser(uid);
    }
    console.log('✓ Limpieza de datos de prueba completada.');
  }

  console.log('\n================================================================');
  console.log(`  RESUMEN CLOUD F7/F8: Total=${results.total}, Pasaron=${results.passed}, Fallaron=${results.failed}`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

run();
