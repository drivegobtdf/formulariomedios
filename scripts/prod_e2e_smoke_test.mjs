import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const prodSecrets = JSON.parse(fs.readFileSync(path.join(userProfile, '.pedidos', 'prod-secrets.json'), 'utf8'));

const configPath = path.join(process.cwd(), 'pedidos-medios', 'frontend', 'public', 'pedidos-config.js');
let ANON_KEY = '';
if (fs.existsSync(configPath)) {
  const cfgContent = fs.readFileSync(configPath, 'utf8');
  const match = cfgContent.match(/supabaseAnonKey:\s*'([^']+)'/);
  if (match) ANON_KEY = match[1];
}
const SERVICE_KEY = prodSecrets.SUPABASE_SERVICE_ROLE_KEY;
const DISPATCH_SECRET = prodSecrets.N8N_DISPATCH_SECRET;

const serviceClient = createClient(PROD_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('========================================================');
  console.log('   PEDIDOS — VALIDACIÓN CONTROLADA E2E EN PRODUCCIÓN    ');
  console.log('   Target: https://uwzgyirilafgnbpmrkic.supabase.co      ');
  console.log('========================================================\n');

  // Step 1: Create a test admin user for the validation
  console.log('1. Creando usuario temporal de prueba para QA...');
  const testAdminEmail = `qa_smoke_${Date.now()}@tdf.gob.ar`;
  const testAdminPassword = `Qa_${crypto.randomBytes(8).toString('hex')}!2026`;

  const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
    email: testAdminEmail,
    password: testAdminPassword,
    email_confirm: true,
  });
  if (authErr) throw authErr;
  const testAdminUserId = authUser.user.id;

  await serviceClient.from('usuarios_acceso').upsert({
    user_id: testAdminUserId,
    nombre: 'QA',
    apellido: 'SmokeTest',
    nombre_usuario: `qa_smoke_${Date.now()}`,
    app_role: 'administrador',
    estado_acceso: 'aprobado',
  });

  const adminClient = createClient(PROD_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: signInErr } = await adminClient.auth.signInWithPassword({
    email: testAdminEmail,
    password: testAdminPassword,
  });
  if (signInErr) throw signInErr;
  const adminJwt = sessionData.session.access_token;
  console.log(`✓ Admin temporal autenticado: ${testAdminEmail} (UID: ${testAdminUserId})`);

  // Step 2: Solicitante submits a new request
  console.log('\n2. Creando nueva solicitud de servicio (Submission Multi-PED)...');
  const solicitanteEmail = 'pablosaldiviainfo@gmail.com';
  const subPayload = {
    schema_version: 3,
    submission_key: crypto.randomUUID(),
    contacto: {
      nombre_apellido: 'Pablo Saldivia PROD Verification',
      telefono: '+542901998877',
      correo: solicitanteEmail,
      area_solicitante: 'Secretaría de Medios PROD Check',
    },
    pedidos: [
      {
        client_request_ref: crypto.randomUUID(),
        categoria_slug: 'diseno_grafico',
        tipo_slug: 'flyer_rrss',
        informacion_especifica: { titulo: 'Flyer Verificación Producción' },
      }
    ],
  };

  const { data: subData, error: subErr } = await serviceClient.rpc('submission_create_core', {
    p_payload: subPayload,
  });
  if (subErr) throw subErr;

  const ped = subData.pedidos[0];
  console.log(`✓ PED creado exitosamente: ${ped.pedido_visible} (ID: ${ped.id})`);
  console.log(`✓ Envio ID: ${subData.envio_id}`);

  // Step 3: Check initial outbox communication (pedido_ingresado)
  console.log('\n3. Verificando comunicación inicial en outbox y despachando...');
  const dispatchRes1 = await fetch(`${PROD_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': DISPATCH_SECRET,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ batch_size: 10, lease_seconds: 300 }),
  });
  const dispatchJson1 = await dispatchRes1.json();
  console.log('✓ Resultado de despacho 1 (pedido_ingresado):', JSON.stringify(dispatchJson1));

  // Step 4: Assign responsible operator
  console.log('\n4. Asignando responsable operativo al PED...');
  const { data: assignData, error: assignErr } = await adminClient.rpc('pedido_assign', {
    p_pedido_id: ped.id,
    p_responsable_user_id: testAdminUserId,
    p_expected_version: 1,
  });
  if (assignErr) throw assignErr;
  console.log(`✓ Responsable asignado. Versión: ${assignData.version}`);

  // Step 5: Transition Nuevo -> En revisión
  console.log('\n5. Transicionando Nuevo -> En revisión (sin notificación al solicitante)...');
  const { data: revData, error: revErr } = await adminClient.rpc('pedido_change_state', {
    p_pedido_id: ped.id,
    p_target_state: 'En revisión',
    p_expected_version: assignData.version,
  });
  if (revErr) throw revErr;
  console.log(`✓ Estado cambiado a: ${revData.estado} (Versión: ${revData.version})`);

  // Step 6: Transition En revisión -> En proceso
  console.log('\n6. Transicionando En revisión -> En proceso (Debe generar notificación "en_proceso")...');
  const { data: procData, error: procErr } = await adminClient.rpc('pedido_change_state', {
    p_pedido_id: ped.id,
    p_target_state: 'En proceso',
    p_expected_version: revData.version,
  });
  if (procErr) throw procErr;
  console.log(`✓ Estado cambiado a: ${procData.estado} (Versión: ${procData.version})`);

  // Step 7: Verify "en_proceso" notification and dispatch
  console.log('\n7. Verificando notificación "en_proceso" en outbox y despachando...');
  const { data: commsEnProc } = await serviceClient
    .from('comunicaciones_pedido')
    .select('*')
    .eq('pedido_id', ped.id)
    .eq('tipo_comunicacion', 'en_proceso');

  if (commsEnProc.length !== 1) {
    throw new Error(`Se esperaba 1 comunicación 'en_proceso', encontradas: ${commsEnProc.length}`);
  }
  console.log(`✓ Comunicación 'en_proceso' registrada: ID ${commsEnProc[0].id}`);

  const dispatchRes2 = await fetch(`${PROD_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': DISPATCH_SECRET,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ batch_size: 10 }),
  });
  console.log('✓ Resultado de despacho 2 (en_proceso):', await dispatchRes2.json());

  // Step 8: Solicitud de Información (48h) via Edge Function info-request-create
  console.log('\n8. Solicitando información complementaria (Plazo 48h) vía Edge Function info-request-create...');
  const infoReqRes = await fetch(`${PROD_URL}/functions/v1/info-request-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminJwt}`,
    },
    body: JSON.stringify({
      pedido_id: ped.id,
      mensaje: 'Por favor adjuntar referencias visuales en alta resolución para el flyer.',
      expected_version: procData.version,
    }),
  });
  const infoReqData = await infoReqRes.json();
  console.log('✓ Respuesta de info-request-create:', infoReqData);
  if (!infoReqRes.ok) throw new Error(`info-request-create error: ${JSON.stringify(infoReqData)}`);

  // Dispatch solicitud_info
  const dispatchRes3 = await fetch(`${PROD_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': DISPATCH_SECRET,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ batch_size: 10 }),
  });
  console.log('✓ Resultado de despacho 3 (solicitud_info):', await dispatchRes3.json());

  // Step 9: Solicitante Responds via info-response-submit Edge Function
  console.log('\n9. Solicitante responde a la solicitud de información vía info-response-submit...');
  const infoRespRes = await fetch(`${PROD_URL}/functions/v1/info-response-submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      token: infoReqData.raw_token,
      respuesta_texto: 'Se adjuntan especificaciones de diseño y enlaces requeridos.',
      enlaces: ['https://drive.google.com/test-ref-palette'],
    }),
  });
  const infoRespJson = await infoRespRes.json();
  console.log('✓ Respuesta de info-response-submit:', infoRespJson);
  if (!infoRespRes.ok) throw new Error(`info-response-submit error: ${JSON.stringify(infoRespJson)}`);

  // Dispatch info_respondida
  const dispatchRes4 = await fetch(`${PROD_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': DISPATCH_SECRET,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ batch_size: 10 }),
  });
  console.log('✓ Resultado de despacho 4 (info_respondida):', await dispatchRes4.json());

  // Step 10: Finalization via pedido_finalize
  console.log('\n10. Finalizando el pedido vía pedido_finalize...');
  const { data: currentPed } = await serviceClient
    .from('pedidos')
    .select('id, version, estado')
    .eq('id', ped.id)
    .single();

  console.log(`✓ Estado actual antes de finalizar: ${currentPed.estado} (Versión: ${currentPed.version})`);

  let finalizeVersion = currentPed.version;
  if (currentPed.estado !== 'En proceso') {
    const { data: reProcData, error: reProcErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: ped.id,
      p_target_state: 'En proceso',
      p_expected_version: currentPed.version,
    });
    if (reProcErr) throw reProcErr;
    finalizeVersion = reProcData.version;
    console.log(`✓ Re-transicionado a En proceso. Versión: ${finalizeVersion}`);
  }

  const { data: finData, error: finErr } = await adminClient.rpc('pedido_finalize', {
    p_pedido_id: ped.id,
    p_expected_version: finalizeVersion,
    p_nota_entrega: 'Entregado conforme vía canal oficial.',
    p_url_entrega: 'https://drive.google.com/prod-final-asset',
    p_archivos_entrega: [],
  });
  if (finErr) throw finErr;
  console.log(`✓ Pedido finalizado exitosamente. Estado: ${finData.estado} (Versión: ${finData.version})`);

  // Dispatch finalizado
  const dispatchRes5 = await fetch(`${PROD_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': DISPATCH_SECRET,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ batch_size: 10 }),
  });
  console.log('✓ Resultado de despacho 5 (finalizado):', await dispatchRes5.json());

  // Step 11: Solicitante access test (Mis Solicitudes magic link flow)
  console.log('\n11. Verificando flujo de acceso de solicitante a "Mis Solicitudes"...');
  const accessReqRes = await fetch(`${PROD_URL}/functions/v1/solicitante-access-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ correo: solicitanteEmail }),
  });
  const accessReqJson = await accessReqRes.json();
  console.log('✓ Solicitud de acceso enviada:', accessReqJson);

  // Summary of all communications
  const { data: finalComms } = await serviceClient
    .from('comunicaciones_pedido')
    .select('id, tipo_comunicacion, estado, attempts, provider_message_id, sent_at')
    .order('created_at', { ascending: true });

  console.log('\n=== HISTORIAL COMPLETO DE COMUNICACIONES EN PROD ===');
  console.table(finalComms);

  console.log('\n✓ TODAS LAS PRUEBAS E2E CONTROLADAS COMPLETADAS CON ÉXITO.');
}

main().catch(err => {
  console.error('\n❌ ERROR EN PRUEBA E2E:', err);
  process.exit(1);
});
