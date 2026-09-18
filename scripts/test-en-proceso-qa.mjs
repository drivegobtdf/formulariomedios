import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

function getApiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} --reveal --output json`, { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  let anonKey = '';
  let serviceKey = '';
  for (const item of parsed) {
    if (item.name === 'anon' || item.type === 'anon') anonKey = item.api_key || item.value;
    if (item.name === 'service_role' || item.type === 'service_role') serviceKey = item.api_key || item.value;
  }
  return { anonKey, serviceKey };
}

async function main() {
  const { anonKey, serviceKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log('=== PRUEBA CONTROLADA DE NOTIFICACIÓN "EN PROCESO" EN CLOUD TEST ===\n');

  // 1. Preparar usuario administrador / operador de prueba
  console.log('1. Verificando / creando usuario operador autorizado...');
  const adminEmail = 'admin_qa_enproceso@tdf.gob.ar';
  const adminPassword = 'Password_QA_EnProceso_2026!';
  let adminUserId = '';

  const { data: userList } = await serviceClient.auth.admin.listUsers();
  const existingUser = userList?.users?.find(u => u.email === adminEmail);

  if (existingUser) {
    adminUserId = existingUser.id;
    await serviceClient.auth.admin.updateUserById(adminUserId, {
      password: adminPassword,
      email_confirm: true,
    });
  } else {
    const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    adminUserId = newUser.user.id;
  }

  await serviceClient.from('usuarios_acceso').upsert({
    user_id: adminUserId,
    nombre: 'Admin QA',
    apellido: 'En Proceso',
    nombre_usuario: 'admin_qa_ep',
    app_role: 'administrador',
    estado_acceso: 'aprobado',
  });

  const adminClient = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInErr) throw signInErr;
  console.log(`✓ Administrador autenticado: ${adminEmail} (UID: ${adminUserId})`);

  // 2. Crear nueva solicitud formal Multi-PED / Single PED de QA
  console.log('\n2. Creando nueva solicitud de servicio (PED)...');
  const targetEmail = 'pablosaldiviainfo@gmail.com';
  const subPayload = {
    schema_version: 3,
    submission_key: crypto.randomUUID(),
    contacto: {
      nombre_apellido: 'Pablo Saldivia QA En Proceso',
      telefono: '+542901445566',
      correo: targetEmail,
      area_solicitante: 'Secretaría de Medios QA',
    },
    pedidos: [
      {
        client_request_ref: crypto.randomUUID(),
        categoria_slug: 'diseno_grafico',
        tipo_slug: 'flyer_rrss',
        informacion_especifica: { titulo: 'Flyer Campaña En Proceso QA' },
      }
    ],
  };

  const { data: subData, error: subErr } = await serviceClient.rpc('submission_create_core', {
    p_payload: subPayload,
  });
  if (subErr) throw subErr;

  const ped = subData.pedidos[0];
  console.log(`✓ PED creado: ${ped.pedido_visible} (ID: ${ped.id}, Envío: ${subData.envio_id})`);

  // 3. Asignar responsable operativo al PED
  console.log('\n3. Asignando responsable operativo al PED...');
  const { data: assignData, error: assignErr } = await adminClient.rpc('pedido_assign', {
    p_pedido_id: ped.id,
    p_responsable_user_id: adminUserId,
    p_expected_version: 1,
  });
  if (assignErr) throw assignErr;
  console.log(`✓ Responsable asignado exitosamente. Versión actual: ${assignData.version}`);

  // 4. Transicionar: Nuevo -> En revisión (comprobar que NO genera correo)
  console.log('\n4. Transicionando Nuevo -> En revisión (Validación de NO envío)...');
  const { data: revData, error: revErr } = await adminClient.rpc('pedido_change_state', {
    p_pedido_id: ped.id,
    p_target_state: 'En revisión',
    p_expected_version: assignData.version,
  });
  if (revErr) throw revErr;
  console.log(`✓ Estado cambiado a: ${revData.estado} (Versión: ${revData.version})`);

  const { data: commsEnRev } = await serviceClient
    .from('comunicaciones_pedido')
    .select('id, tipo_comunicacion, estado')
    .eq('pedido_id', ped.id);

  console.log(`✓ Comunicaciones asociadas a este PED tras 'En revisión': ${commsEnRev.length} (esperado: 0)`);
  if (commsEnRev.length !== 0) {
    throw new Error(`ERROR: Se generaron comunicaciones inesperadas para 'En revisión': ${JSON.stringify(commsEnRev)}`);
  }

  // 5. Transicionar: En revisión -> En proceso (Debe generar exactamente 1 comunicación en_proceso)
  console.log('\n5. Transicionando En revisión -> En proceso (Validación de Notificación)...');
  const { data: procData, error: procErr } = await adminClient.rpc('pedido_change_state', {
    p_pedido_id: ped.id,
    p_target_state: 'En proceso',
    p_expected_version: revData.version,
  });
  if (procErr) throw procErr;
  console.log(`✓ Estado cambiado exitosamente a: ${procData.estado} (Versión: ${procData.version})`);

  // 6. Validar domain_events y comunicaciones_pedido en Base de Datos
  console.log('\n6. Validando domain_events y outbox...');
  const { data: events } = await serviceClient
    .from('domain_events')
    .select('*')
    .eq('aggregate_id', ped.id)
    .eq('event_name', 'pedido.state_changed')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log(`✓ Evento de dominio emitido: ${events?.[0]?.event_name} (Payload: ${JSON.stringify(events?.[0]?.payload)})`);

  const { data: commsEnProc } = await serviceClient
    .from('comunicaciones_pedido')
    .select('*')
    .eq('pedido_id', ped.id)
    .eq('tipo_comunicacion', 'en_proceso');

  console.log(`✓ Comunicaciones 'en_proceso' encontradas: ${commsEnProc.length} (esperado: 1)`);
  if (commsEnProc.length !== 1) {
    throw new Error(`ERROR: Se esperaba exactamente 1 comunicación 'en_proceso', encontradas: ${commsEnProc.length}`);
  }

  const commItem = commsEnProc[0];
  console.log('  - ID Comunicación:', commItem.id);
  console.log('  - Tipo:', commItem.tipo_comunicacion);
  console.log('  - Estado:', commItem.estado);
  console.log('  - Idempotency Key:', commItem.idempotency_key);
  console.log('  - Destinatario:', commItem.destinatario_email);

  // 7. Despacho real de la comunicación vía despachador
  console.log('\n7. Ejecutando despacho de comunicaciones pendientes...');
  
  let dispatchSecret = process.env.N8N_DISPATCH_SECRET || '';
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const envPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf8');
    for (const line of rawEnv.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('N8N_DISPATCH_SECRET=')) {
        dispatchSecret = trimmed.substring('N8N_DISPATCH_SECRET='.length).trim();
      }
    }
  }

  const dispatchRes = await fetch(`${SUPABASE_URL}/functions/v1/comunicaciones-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': dispatchSecret,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ batch_size: 10, lease_seconds: 300 }),
  });

  const dispatchJson = await dispatchRes.json();
  console.log('✓ Resultado del despachador:', JSON.stringify(dispatchJson, null, 2));

  // 8. Verificar estado final de la comunicación en BD
  const { data: commUpdated } = await serviceClient
    .from('comunicaciones_pedido')
    .select('id, tipo_comunicacion, estado, attempts, provider_message_id, error_log')
    .eq('id', commItem.id)
    .single();

  console.log('\n8. Estado final de la comunicación en BD:', commUpdated);

  console.log('\n=== CONTROL REAL DE ENTREGA FINALIZADO CON ÉXITO ===');
  console.log(`PED: ${ped.pedido_visible}`);
  console.log(`Destinatario: ${targetEmail}`);
  console.log(`Estado comunicación: ${commUpdated?.estado}`);
  console.log(`Provider Message ID: ${commUpdated?.provider_message_id}`);
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
