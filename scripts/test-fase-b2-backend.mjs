import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
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
  console.log('VALIDACIÓN RUNTIME BACKEND FASE B.2 (TEST: ' + TEST_PROJECT_REF + ')');
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
  let allPassed = true;

  try {
    // 1. Crear usuarios de prueba (1 equipo aprobado, 1 observador aprobado, 1 pendiente)
    const runId = crypto.randomUUID().slice(0, 8);
    const pwd = 'TestPass123!_' + runId;

    async function createUser(role, status, uname, nombre, apellido) {
      const email = `test_b2_${role}_${status}_${runId}@gob.ar`;
      const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
        user_metadata: { nombre, apellido, nombre_usuario: uname }
      });
      if (authErr) throw authErr;
      const uid = authUser.user.id;
      createdUserIds.push(uid);

      await serviceClient.from('usuarios_acceso').upsert({
        user_id: uid,
        nombre,
        apellido,
        nombre_usuario: uname,
        estado_acceso: status,
        app_role: role,
        aprobado_at: status === 'aprobado' ? new Date().toISOString() : null
      });

      const userClient = createClient(SUPABASE_URL, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: sess, error: signErr } = await userClient.auth.signInWithPassword({
        email,
        password: pwd
      });
      if (signErr) throw signErr;

      return { uid, email, userClient };
    }

    const teamUser = await createUser('equipo', 'aprobado', `u_eq_${runId}`, 'Juan', 'Perez');
    const obsUser = await createUser('observador', 'aprobado', `u_obs_${runId}`, 'Maria', 'Gomez');
    const pendUser = await createUser('equipo', 'pendiente', `u_pen_${runId}`, 'Carlos', 'Lopez');

    console.log('[SETUP] Usuarios de prueba creados.');

    // PRUEBA 1: Anon no puede ejecutar profile_update_self
    console.log('\n--- PRUEBA 1: Anon no puede invocar profile_update_self ---');
    const { data: p1Data, error: p1Err } = await anonClient.rpc('profile_update_self', {
      p_nombre: 'Hacker',
      p_apellido: 'Anon'
    });
    if (p1Err) {
      console.log('✅ PASS: Anon denegado correctamente:', p1Err.message);
    } else {
      console.error('❌ FAIL: Anon no fue denegado:', p1Data);
      allPassed = false;
    }

    // PRUEBA 2: Usuario pendiente no puede invocar profile_update_self
    console.log('\n--- PRUEBA 2: Usuario pendiente no puede invocar profile_update_self ---');
    const { data: p2Data, error: p2Err } = await pendUser.userClient.rpc('profile_update_self', {
      p_nombre: 'Nuevo',
      p_apellido: 'Nombre'
    });
    if (p2Err) {
      console.log('✅ PASS: Usuario pendiente denegado:', p2Err.message);
    } else {
      console.error('❌ FAIL: Usuario pendiente no fue denegado:', p2Data);
      allPassed = false;
    }

    // PRUEBA 3: Validación de parámetros (strings vacíos o trim vacíos)
    console.log('\n--- PRUEBA 3: Validación de longitud (nombre vacío / espacios) ---');
    const { data: p3Data, error: p3Err } = await teamUser.userClient.rpc('profile_update_self', {
      p_nombre: '   ',
      p_apellido: 'Valido'
    });
    if (p3Err && p3Err.message.includes('PARAM_INVALID')) {
      console.log('✅ PASS: Nombre vacío rechazado correctamente:', p3Err.message);
    } else {
      console.error('❌ FAIL: Nombre vacío no rechazado:', p3Err, p3Data);
      allPassed = false;
    }

    // PRUEBA 4: Actualización válida por usuario equipo
    console.log('\n--- PRUEBA 4: Actualización válida por usuario equipo ---');
    const { data: p4Data, error: p4Err } = await teamUser.userClient.rpc('profile_update_self', {
      p_nombre: '  Juan Carlos  ',
      p_apellido: '  Perez Martinez  '
    });
    if (p4Err) {
      console.error('❌ FAIL: Error actualizando perfil equipo:', p4Err);
      allPassed = false;
    } else if (p4Data.nombre === 'Juan Carlos' && p4Data.apellido === 'Perez Martinez') {
      console.log('✅ PASS: Perfil equipo actualizado exitosamente con trim:', p4Data);
    } else {
      console.error('❌ FAIL: Datos retornados inesperados:', p4Data);
      allPassed = false;
    }

    // Verificar en BD que rol y estado no fueron tocados
    const { data: dbUser } = await serviceClient.from('usuarios_acceso').select('*').eq('user_id', teamUser.uid).single();
    if (dbUser.nombre === 'Juan Carlos' && dbUser.apellido === 'Perez Martinez' && dbUser.app_role === 'equipo' && dbUser.estado_acceso === 'aprobado') {
      console.log('✅ PASS: Integridad de BD confirmada (app_role y estado_acceso inalterados).');
    } else {
      console.error('❌ FAIL: Integridad de BD violada:', dbUser);
      allPassed = false;
    }

    // PRUEBA 5: Actualización válida por observador
    console.log('\n--- PRUEBA 5: Actualización válida por usuario observador ---');
    const { data: p5Data, error: p5Err } = await obsUser.userClient.rpc('profile_update_self', {
      p_nombre: 'Maria Elena',
      p_apellido: 'Gomez Rossi'
    });
    if (p5Err) {
      console.error('❌ FAIL: Error actualizando perfil observador:', p5Err);
      allPassed = false;
    } else if (p5Data.nombre === 'Maria Elena' && p5Data.apellido === 'Gomez Rossi') {
      console.log('✅ PASS: Perfil observador actualizado exitosamente:', p5Data);
    } else {
      console.error('❌ FAIL: Datos retornados inesperados para observador:', p5Data);
      allPassed = false;
    }

    // PRUEBA 6: notification_unread_count para Observador retorna 0
    console.log('\n--- PRUEBA 6: notification_unread_count retorna 0 para Observador ---');
    const { data: p6Data, error: p6Err } = await obsUser.userClient.rpc('notification_unread_count');
    if (p6Err) {
      console.error('❌ FAIL: Error consultando unread count para observador:', p6Err);
      allPassed = false;
    } else if (p6Data === 0) {
      console.log('✅ PASS: Observador recibe 0 en notification_unread_count.');
    } else {
      console.error('❌ FAIL: Observador recibió valor distinto de 0:', p6Data);
      allPassed = false;
    }

    // PRUEBA 7: notification_unread_count y flujo de lectura para Equipo
    console.log('\n--- PRUEBA 7: notification_unread_count para Equipo ---');
    const { data: p7Initial } = await teamUser.userClient.rpc('notification_unread_count');
    console.log('Unread count inicial equipo:', p7Initial);

    // Consultar un pedido existente para la prueba de notificación
    const { data: existingPed, error: existPedErr } = await serviceClient
      .from('pedidos')
      .select('id, pedido_visible')
      .limit(1)
      .single();
    if (existPedErr) throw existPedErr;

    const { data: newNotif, error: notifErr } = await serviceClient.from('notificaciones_usuario').insert({
      user_id: teamUser.uid,
      pedido_id: existingPed.id,
      tipo: 'pedido_asignado',
      idempotency_key: 'test_b2_notif_' + runId,
      metadata: {
        pedido_visible: existingPed.pedido_visible,
        section: 'header',
        mensaje_resumen: 'Te asignaron ' + existingPed.pedido_visible
      }
    }).select().single();
    if (notifErr) throw notifErr;

    const { data: p7AfterInsert } = await teamUser.userClient.rpc('notification_unread_count');
    if (p7AfterInsert === (p7Initial + 1)) {
      console.log('✅ PASS: Conteo incrementado correctamente tras nueva notificación (valor:', p7AfterInsert, ')');
    } else {
      console.error('❌ FAIL: Conteo no se incrementó como se esperaba. Esperado:', p7Initial + 1, 'Obtenido:', p7AfterInsert);
      allPassed = false;
    }

    // Marcar como leída con notification_mark_read
    const { data: markRes, error: markErr } = await teamUser.userClient.rpc('notification_mark_read', {
      p_notification_id: newNotif.id
    });
    if (markErr) {
      console.error('❌ FAIL: Error al marcar notificación como leída:', markErr);
      allPassed = false;
    } else if (markRes.read === true) {
      console.log('✅ PASS: Notificación marcada como leída:', markRes);
    }

    const { data: p7AfterRead } = await teamUser.userClient.rpc('notification_unread_count');
    if (p7AfterRead === p7Initial) {
      console.log('✅ PASS: Conteo decrementado tras lectura (valor:', p7AfterRead, ')');
    } else {
      console.error('❌ FAIL: Conteo no volvió al estado previo:', p7AfterRead);
      allPassed = false;
    }

    console.log('\n================================================================');
    if (allPassed) {
      console.log('RESULTADO FINAL: TODAS LAS PRUEBAS BACKEND B.2 PASARON EXITOSAMENTE.');
    } else {
      console.log('RESULTADO FINAL: HUBO FALLAS EN LAS PRUEBAS.');
    }
    console.log('================================================================');

  } finally {
    // Cleanup
    console.log('\n[CLEANUP] Eliminando datos temporales de prueba...');
    for (const pid of createdPedidoIds) {
      await serviceClient.from('pedidos').delete().eq('id', pid);
    }
    for (const uid of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(uid);
    }
    console.log('[CLEANUP] Completado.');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error en test suite:', err);
  process.exit(1);
});
