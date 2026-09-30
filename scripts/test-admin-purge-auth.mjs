import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function getTestServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const testSecretsPath = path.join(os.homedir(), '.pedidos', 'test-secrets.json');
  if (fs.existsSync(testSecretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(testSecretsPath, 'utf8'));
      if (parsed.SUPABASE_SERVICE_ROLE_KEY) return parsed.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch {}
  }
  try {
    const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

function getAnonKey() {
  try {
    const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'anon' || k.name === 'anon');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

async function run() {
  const serviceKey = getTestServiceKey();
  const anonKey = getAnonKey();
  if (!serviceKey || !anonKey) {
    console.error('No service key or anon key available for test');
    process.exit(1);
  }

  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const anonClient = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log('=== TEST: PROBANDO AUTH EN ADMIN-PEDIDOS-PURGE (TEST: ' + TEST_PROJECT_REF + ') ===\n');

  // 1. Crear un usuario admin de prueba y obtener su JWT
  const testAdminEmail = `qa-admin-purge-${Date.now()}@tdf.gob.ar`;
  const testPassword = 'Password123!Secure';

  console.log(`1. Creando usuario Admin de prueba: ${testAdminEmail}...`);
  const { data: adminUser, error: adminErr } = await serviceClient.auth.admin.createUser({
    email: testAdminEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (adminErr || !adminUser.user) {
    throw new Error(`Error al crear admin user: ${adminErr?.message}`);
  }

  const adminUserId = adminUser.user.id;

  // Asignar rol de administrador aprobado en usuarios_acceso
  await serviceClient.from('usuarios_acceso').upsert({
    user_id: adminUserId,
    app_role: 'administrador',
    estado_acceso: 'aprobado',
    nombre: 'QA Admin',
    apellido: 'Purge Tester',
    nombre_usuario: 'qa_admin_purge',
  });

  // Iniciar sesión como admin para obtener JWT de sesión real
  const { data: adminSession, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: testAdminEmail,
    password: testPassword,
  });

  if (loginErr || !adminSession.session) {
    throw new Error(`Error en login de admin: ${loginErr?.message}`);
  }

  const adminJwt = adminSession.session.access_token;
  console.log('✓ Admin autenticado con éxito (JWT generado)');

  // 2. Crear un usuario no-admin (rol equipo)
  const testTeamEmail = `qa-team-purge-${Date.now()}@tdf.gob.ar`;
  const { data: teamUser } = await serviceClient.auth.admin.createUser({
    email: testTeamEmail,
    password: testPassword,
    email_confirm: true,
  });
  const teamUserId = teamUser.user.id;

  await serviceClient.from('usuarios_acceso').upsert({
    user_id: teamUserId,
    app_role: 'equipo',
    estado_acceso: 'aprobado',
    nombre: 'QA Team',
    apellido: 'User',
    nombre_usuario: 'qa_team_user',
  });

  const { data: teamSession } = await anonClient.auth.signInWithPassword({
    email: testTeamEmail,
    password: testPassword,
  });
  const teamJwt = teamSession.session.access_token;

  // 3. Crear 1 PED QA para probar preview
  const testEnvioId = crypto.randomUUID();
  await serviceClient.from('envios_formulario').insert([{
    id: testEnvioId,
    submission_key: crypto.randomUUID(),
    request_fingerprint: crypto.randomBytes(32).toString('hex'),
    nombre_apellido: 'QA Envio Tester',
    telefono: '+5492964123456',
    correo: 'qa@tdf.gob.ar',
    area_solicitante: 'Secretaría de Medios',
  }]);

  const { data: categorias } = await serviceClient.from('categorias_servicio').select('id').limit(1);
  const { data: tipos } = await serviceClient.from('tipos_servicio').select('id').eq('categoria_id', categorias[0].id).limit(1);

  const pedId = crypto.randomUUID();
  const randNum = Math.floor(Math.random() * 80000) + 10000;
  const pedVisible = `PED-2026-D0${randNum}`;

  await serviceClient.from('pedidos').insert([{
    id: pedId,
    envio_id: testEnvioId,
    categoria_id: categorias[0].id,
    tipo_servicio_id: tipos[0].id,
    pedido_visible: pedVisible,
    tracking_token_hash: crypto.randomBytes(32).toString('hex'),
    client_request_ref: crypto.randomUUID(),
    anio: 2026,
    numero: randNum,
    codigo_categoria: 'D',
    estado: 'Nuevo',
    informacion_especifica: { motivo: 'QA Auth Preview Test' },
  }]);

  console.log(`✓ Pedido creado: ${pedVisible} (${pedId})\n`);

  // ==========================================
  // TEST CASE 1: Sin Authorization header -> 401 AUTH_REQUIRED
  // ==========================================
  console.log('--- TEST 1: Llamada sin header Authorization ---');
  const res1 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ action: 'preview', pedido_ids: [pedId] }),
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}, Error: ${data1.error}, Mensaje: ${data1.message}`);
  if (res1.status === 401 && data1.error === 'AUTH_REQUIRED') {
    console.log('✓ PASS: Rechazado con 401 AUTH_REQUIRED\n');
  } else {
    console.error('FAIL en Test 1');
    process.exit(1);
  }

  // ==========================================
  // TEST CASE 2: Token inválido / expirado -> 401 AUTH_INVALID
  // ==========================================
  console.log('--- TEST 2: Llamada con JWT inválido ---');
  const res2 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: 'Bearer invalid_jwt_token_sample',
    },
    body: JSON.stringify({ action: 'preview', pedido_ids: [pedId] }),
  });
  const data2 = await res2.json();
  console.log(`Status: ${res2.status}, Error: ${data2.error}, Mensaje: ${data2.message}`);
  if (res2.status === 401 && data2.error === 'AUTH_INVALID') {
    console.log('✓ PASS: Rechazado con 401 AUTH_INVALID\n');
  } else {
    console.error('FAIL en Test 2');
    process.exit(1);
  }

  // ==========================================
  // TEST CASE 3: Usuario no-admin (equipo) -> 403 FORBIDDEN
  // ==========================================
  console.log('--- TEST 3: Llamada con usuario no-administrador (rol: equipo) ---');
  const res3 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${teamJwt}`,
    },
    body: JSON.stringify({ action: 'preview', pedido_ids: [pedId] }),
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}, Error: ${data3.error}, Mensaje: ${data3.message}`);
  if (res3.status === 403 && data3.error === 'FORBIDDEN') {
    console.log('✓ PASS: Rechazado con 403 FORBIDDEN\n');
  } else {
    console.error('FAIL en Test 3');
    process.exit(1);
  }

  // ==========================================
  // TEST CASE 4: Admin autenticado + action=preview -> 200 OK
  // ==========================================
  console.log('--- TEST 4: Admin autenticado ejecutando PREVIEW ---');
  const res4 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${adminJwt}`,
    },
    body: JSON.stringify({ action: 'preview', pedido_ids: [pedId] }),
  });
  const data4 = await res4.json();
  console.log(`Status: ${res4.status}`);
  console.log('Preview Result:', JSON.stringify(data4, null, 2));
  if (res4.status === 200 && data4.pedidos_count === 1 && data4.pedidos_visibles.includes(pedVisible)) {
    console.log('✓ PASS: Preview retornado exitosamente con 200 OK\n');
  } else {
    console.error('FAIL en Test 4');
    process.exit(1);
  }

  // ==========================================
  // TEST CASE 5: Admin autenticado + action=execute -> 200 OK (Saga Completa)
  // ==========================================
  console.log('--- TEST 5: Admin autenticado ejecutando EXECUTE (Saga) ---');
  const idempKey = `test_idemp_auth_${Date.now()}`;
  const res5 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${adminJwt}`,
    },
    body: JSON.stringify({
      action: 'execute',
      pedido_ids: [pedId],
      idempotency_key: idempKey,
    }),
  });
  const data5 = await res5.json();
  console.log(`Status: ${res5.status}`);
  console.log('Execute Result:', JSON.stringify(data5, null, 2));
  if (res5.status === 200 && data5.success === true && data5.deleted_count === 1) {
    console.log('✓ PASS: Purga ejecutada exitosamente con 200 OK\n');
  } else {
    console.error('FAIL en Test 5');
    process.exit(1);
  }

  // ==========================================
  // TEST CASE 6: Admin autenticado + action=status -> 200 OK
  // ==========================================
  console.log('--- TEST 6: Admin autenticado consultando STATUS por idempotency_key ---');
  const res6 = await fetch(`${SUPABASE_URL}/functions/v1/admin-pedidos-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${adminJwt}`,
    },
    body: JSON.stringify({
      action: 'status',
      idempotency_key: idempKey,
    }),
  });
  const data6 = await res6.json();
  console.log(`Status: ${res6.status}, Status Operación: ${data6.status}, Pedidos Count: ${data6.pedidos_count}`);
  if (res6.status === 200 && data6.status === 'completed') {
    console.log('✓ PASS: Status consultado exitosamente con 200 OK\n');
  } else {
    console.error('FAIL en Test 6');
    process.exit(1);
  }

  // Limpieza de fixtures
  console.log('--- Limpieza de datos de prueba ---');
  await serviceClient.from('usuarios_acceso').delete().in('user_id', [adminUserId, teamUserId]);
  await serviceClient.auth.admin.deleteUser(adminUserId);
  await serviceClient.auth.admin.deleteUser(teamUserId);
  await serviceClient.from('envios_formulario').delete().eq('id', testEnvioId);

  console.log('=== TODOS LOS TESTS DE AUTH Y RBAC COMPLETADOS CON ÉXITO ===');
}

run().catch((err) => {
  console.error('Error durante ejecución:', err);
  process.exit(1);
});
