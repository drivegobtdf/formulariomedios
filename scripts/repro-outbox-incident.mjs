import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = 'https://' + PROJECT_REF + '.supabase.co';

function getApiKeys() {
  const out = execSync('npx.cmd supabase projects api-keys --project-ref ' + PROJECT_REF + ' --output json', { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  const keys = Array.isArray(parsed) ? parsed : (parsed.keys || []);
  const serviceKey = keys.find(k => k.id === 'service_role' || k.name === 'service_role')?.api_key?.trim();
  const anonKey = keys.find(k => k.id === 'anon' || k.name === 'anon')?.api_key?.trim();
  return { serviceKey, anonKey };
}

async function run() {
  const { serviceKey, anonKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey);
  const anonClient = createClient(SUPABASE_URL, anonKey);

  const runId = Date.now();
  const password = `TestPass!${runId}`;
  const opEmail = `repro_op_${runId}@tdf.gob.ar`;

  // 1. Crear usuario auth de prueba
  const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
    email: opEmail,
    password,
    email_confirm: true,
  });
  if (authErr) throw authErr;
  const operatorId = authUser.user.id;

  await serviceClient.from('usuarios_acceso').insert({
    user_id: operatorId,
    app_role: 'equipo',
    estado_acceso: 'aprobado',
    nombre: 'Operador',
    apellido: 'Repro',
    nombre_usuario: `op_repro_${runId}`
  });

  // Autenticar cliente del operador
  const { data: opSession, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: opEmail,
    password
  });
  if (loginErr) throw loginErr;

  const opClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${opSession.session.access_token}` } }
  });

  // 2. Obtener categoría y tipo
  const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped').limit(1).single();
  const { data: tipo } = await serviceClient.from('tipos_servicio').select('id').limit(1).single();

  // 3. Crear envío público de prueba
  const envioId = crypto.randomUUID();
  const { error: envErr } = await serviceClient
    .from('envios_formulario')
    .insert({
      id: envioId,
      submission_key: crypto.randomUUID(),
      request_fingerprint: crypto.createHash('sha256').update(String(runId)).digest('hex'),
      correo: `pub_repro_${runId}@tdf.gob.ar`,
      nombre_apellido: 'Solicitante Público Repro',
      area_solicitante: 'Secretaría de Medios',
      telefono: '2901123456'
    });
  if (envErr) throw envErr;

  // 4. Crear pedido público en estado 'Nuevo'
  const numSeq = Math.floor(100000 + Math.random() * 899999);
  const visible = `PED-2026-${cat.codigo_ped}${numSeq}`;
  const pedidoId = crypto.randomUUID();

  const { error: pedErr } = await serviceClient
    .from('pedidos')
    .insert({
      id: pedidoId,
      envio_id: envioId,
      categoria_id: cat.id,
      tipo_servicio_id: tipo.id,
      pedido_visible: visible,
      anio: 2026,
      numero: numSeq,
      codigo_categoria: cat.codigo_ped,
      estado: 'Nuevo',
      origen: 'publico',
      version: 1,
      client_request_ref: crypto.randomUUID(),
      responsable_user_id: operatorId
    });
  if (pedErr) throw pedErr;

  console.log(`[REPRO SETUP] Pedido público creado: ID=${pedidoId}, visible=${visible}, estado=Nuevo, version=1, origen=publico`);

  // 5. Intentar transicionar de 'Nuevo' a 'En proceso' llamando a pedido_change_state como el operador
  const t0 = Date.now();
  const { data: transitionRes, error: transitionErr } = await opClient.rpc('pedido_change_state', {
    p_pedido_id: pedidoId,
    p_target_state: 'En proceso',
    p_expected_version: 1,
    p_motivo: null
  });
  const latency = Date.now() - t0;

  console.log('\n========================================');
  console.log('[REPRO EXECUTION] Resultado transición:');
  console.log('Error capturado:', transitionErr ? {
    message: transitionErr.message,
    code: transitionErr.code,
    details: transitionErr.details,
    hint: transitionErr.hint
  } : 'NINGUNO (SUCCESS)');
  console.log('Latencia:', latency, 'ms');
  console.log('========================================\n');

  // 6. Verificar estado del pedido tras el error (comprobar rollback)
  const { data: pedAfter } = await serviceClient
    .from('pedidos')
    .select('id, estado, version, updated_at')
    .eq('id', pedidoId)
    .single();

  console.log('[REPRO ROLLBACK CHECK] Pedido post-fallo en BD:', pedAfter);
  const didRollback = pedAfter.estado === 'Nuevo' && pedAfter.version === 1;
  console.log('[REPRO CONCLUSION] Rollback atómico confirmado:', didRollback);

  // 7. Cleanup
  await serviceClient.from('pedidos').delete().eq('id', pedidoId);
  await serviceClient.from('envios_formulario').delete().eq('id', envioId);
  await serviceClient.from('usuarios_acceso').delete().eq('user_id', operatorId);
  await serviceClient.auth.admin.deleteUser(operatorId);
  console.log('[REPRO CLEANUP] Fixture y usuario eliminados de TEST.');
}

run().catch(e => {
  console.error('Fatal repro error:', e);
  process.exit(1);
});
