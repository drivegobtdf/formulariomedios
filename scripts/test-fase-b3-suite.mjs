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
  console.log('SUITE DE INTEGRACIÓN Y VERIFICACIÓN FASE B.3 (CARGA INTERNA)');
  console.log('Proyecto TEST: ' + TEST_PROJECT_REF);
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();

  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const testUsers = [];
  const createdPedidos = [];
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testsPassed++;
    }
  }

  try {
    // 1. Obtener o crear usuarios de prueba con distintos roles
    console.log('--- 1. Preparación de usuarios de prueba ---');
    const roles = ['administrador', 'equipo', 'observador'];
    for (const role of roles) {
      const email = `b3.test.${role}.${runId}@tdf.gob.ar`;
      const password = `TestPass!${runId}2026`;
      const uname = `u_${role}_${runId}`;
      const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: `Usuario ${role}`, apellido: `B3 ${runId}`, nombre_usuario: uname },
      });
      if (authErr) throw authErr;

      const userId = authData.user.id;
      testUsers.push({ role, email, password, userId });

      // Upsert en usuarios_acceso
      const { error: accErr } = await serviceClient
        .from('usuarios_acceso')
        .upsert({
          user_id: userId,
          nombre: `Usuario ${role}`,
          apellido: `B3 ${runId}`,
          nombre_usuario: uname,
          app_role: role,
          estado_acceso: 'aprobado',
          aprobado_at: new Date().toISOString(),
        });
      if (accErr) throw accErr;
    }

    const adminUser = testUsers.find(u => u.role === 'administrador');
    const equipoUser = testUsers.find(u => u.role === 'equipo');
    const observadorUser = testUsers.find(u => u.role === 'observador');

    // Clientes autenticados
    const adminClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await adminClient.auth.signInWithPassword({ email: adminUser.email, password: adminUser.password });

    const equipoClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await equipoClient.auth.signInWithPassword({ email: equipoUser.email, password: equipoUser.password });

    const observadorClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await observadorClient.auth.signInWithPassword({ email: observadorUser.email, password: observadorUser.password });

    const unauthClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });

    // Obtener catálogo de categoría y tipo para pruebas
    const { data: cats } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1);
    const testCat = cats && cats[0];
    const { data: tipos } = await serviceClient.from('tipos_servicio').select('id, nombre').eq('categoria_id', testCat.id).limit(1);
    const testTipo = tipos && tipos[0];

    // =========================================================================
    // TEST 1: Creación mínima (solo título)
    // =========================================================================
    console.log('\n--- 2. TEST: Creación mínima de pedido interno (solo título) ---');
    const clientRef1 = crypto.randomUUID();
    const { data: resMin, error: errMin } = await adminClient.rpc('pedido_create_internal', {
      p_titulo: 'Pedido Interno Mínimo ' + runId,
      p_client_request_ref: clientRef1,
    });
    assert(!errMin, 'Creación mínima sin errores: ' + (errMin?.message || 'OK'));
    assert(resMin?.success === true, 'Respuesta indica success=true');
    assert(Boolean(resMin?.id), 'Retorna ID de pedido');
    assert(resMin?.origen === 'interno', 'Origen retornado es interno');
    assert(/^PED-[0-9]{4}-X[0-9]{6}$/.test(resMin?.pedido_visible), `Correlativo tiene formato canónico neutral PED-YYYY-XNNNNNN (${resMin?.pedido_visible})`);
    createdPedidos.push(resMin.id);

    // Verificar en BD directamente
    const { data: dbMin } = await serviceClient.from('pedidos').select('*').eq('id', resMin.id).single();
    assert(dbMin?.titulo === 'Pedido Interno Mínimo ' + runId, 'Columna titulo almacenada correctamente');
    assert(dbMin?.origen === 'interno', 'Columna origen es "interno" en DB');
    assert(dbMin?.envio_id === null, 'envio_id es NULL (sin envío público asociado)');
    assert(dbMin?.categoria_id === null, 'categoria_id es NULL por defecto');
    assert(dbMin?.tipo_servicio_id === null, 'tipo_servicio_id es NULL por defecto');
    assert(dbMin?.codigo_categoria === 'X', 'codigo_categoria es "X" (Sin clasificar / neutral)');
    assert(dbMin?.estado === 'Nuevo', 'Estado inicial es "Nuevo"');
    assert(dbMin?.created_by_user_id === adminUser.userId, 'created_by_user_id coincide con el actor');

    // Verificar domain_events y audit_log
    const { data: eventMin } = await serviceClient
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', resMin.id)
      .eq('event_name', 'pedido.created_internal')
      .single();
    assert(Boolean(eventMin), 'Domain event pedido.created_internal registrado');

    const { data: auditMin } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('recurso_id', resMin.id)
      .eq('accion', 'create_internal')
      .single();
    assert(Boolean(auditMin), 'Audit log create_internal registrado');

    // =========================================================================
    // TEST 2: Creación completa (todos los campos opcionales)
    // =========================================================================
    console.log('\n--- 3. TEST: Creación completa de pedido interno (todos los campos opcionales) ---');
    const clientRef2 = crypto.randomUUID();
    const { data: resFull, error: errFull } = await equipoClient.rpc('pedido_create_internal', {
      p_titulo: 'Campaña Vial Invierno 2026 ' + runId,
      p_descripcion: 'Materiales gráficos para redes y vía pública sobre precauciones de escarcha.',
      p_solicitante_nombre: 'Martín Rodríguez',
      p_solicitante_area: 'Subsecretaría de Transporte',
      p_solicitante_correo: 'transporte@tdf.gob.ar',
      p_solicitante_telefono: '+54 2901 445566',
      p_categoria_id: testCat.id,
      p_tipo_servicio_id: testTipo.id,
      p_prioridad: 'alta',
      p_etiqueta_interna: 'VIAL-2026',
      p_fecha_limite: '2026-11-15',
      p_enlaces: ['https://drive.google.com/test-assets-1', 'https://figma.com/file/test-mockup'],
      p_client_request_ref: clientRef2,
    });
    assert(!errFull, 'Creación completa por usuario equipo sin errores: ' + (errFull?.message || 'OK'));
    assert(resFull?.success === true, 'Respuesta completa exitosa');
    assert(new RegExp(`^PED-[0-9]{4}-${testCat.codigo_ped}[0-9]{6}$`).test(resFull?.pedido_visible),
      `Correlativo con categoría asignada utiliza código de categoría ${testCat.codigo_ped} (${resFull?.pedido_visible})`);
    createdPedidos.push(resFull.id);

    const { data: dbFull } = await serviceClient.from('pedidos').select('*').eq('id', resFull.id).single();
    assert(dbFull?.prioridad === 'alta', 'Prioridad guardada como "alta"');
    assert(dbFull?.etiqueta_interna === 'VIAL-2026', 'Etiqueta interna guardada como "VIAL-2026"');
    assert(dbFull?.fecha_limite === '2026-11-15', 'Fecha límite guardada');
    assert(dbFull?.categoria_id === testCat.id, 'categoria_id guardada');
    assert(dbFull?.tipo_servicio_id === testTipo.id, 'tipo_servicio_id guardada');
    assert(dbFull?.informacion_especifica?.contacto_nombre === 'Martín Rodríguez', 'Información específica contiene solicitante');

    // Verificar enlaces creados en enlaces_material y enlace_pedido
    const { data: enlacesDb } = await serviceClient
      .from('enlace_pedido')
      .select('enlace_id, enlaces_material(url)')
      .eq('pedido_id', resFull.id);
    assert(enlacesDb?.length === 2, '2 enlaces asociados en enlace_pedido');

    // =========================================================================
    // TEST 2.1: Concurrencia de dos creaciones internas sin categoría (X)
    // =========================================================================
    console.log('\n--- 3. TEST: Concurrencia de dos creaciones internas sin categoría en paralelo ---');
    const [conc1, conc2] = await Promise.all([
      adminClient.rpc('pedido_create_internal', {
        p_titulo: 'Pedido Concurrente A ' + runId,
        p_client_request_ref: crypto.randomUUID(),
      }),
      adminClient.rpc('pedido_create_internal', {
        p_titulo: 'Pedido Concurrente B ' + runId,
        p_client_request_ref: crypto.randomUUID(),
      })
    ]);
    assert(!conc1.error, 'Creación concurrente 1 exitosa: ' + (conc1.error?.message || 'OK'));
    assert(!conc2.error, 'Creación concurrente 2 exitosa: ' + (conc2.error?.message || 'OK'));
    assert(conc1.data?.pedido_visible !== conc2.data?.pedido_visible, `Correlativos concurrentes son distintos (${conc1.data?.pedido_visible} !== ${conc2.data?.pedido_visible})`);
    assert(/^PED-[0-9]{4}-X[0-9]{6}$/.test(conc1.data?.pedido_visible), 'Correlativo 1 es PED-YYYY-XNNNNNN');
    assert(/^PED-[0-9]{4}-X[0-9]{6}$/.test(conc2.data?.pedido_visible), 'Correlativo 2 es PED-YYYY-XNNNNNN');
    createdPedidos.push(conc1.data.id, conc2.data.id);

    // =========================================================================
    // TEST 3: Idempotencia con client_request_ref
    // =========================================================================
    console.log('\n--- 4. TEST: Idempotencia por client_request_ref ---');
    const { data: resIdem, error: errIdem } = await equipoClient.rpc('pedido_create_internal', {
      p_titulo: 'Intento duplicado con mismo client_ref',
      p_client_request_ref: clientRef2,
    });
    assert(!errIdem, 'Llamada idempotente sin error');
    assert(resIdem?.idempotent === true, 'Retorna idempotent: true');
    assert(resIdem?.id === resFull.id, 'Retorna el mismo pedido ID ya existente');

    // =========================================================================
    // TEST 4: Restricciones de roles (RBAC PoLP)
    // =========================================================================
    console.log('\n--- 5. TEST: Restricciones de roles RBAC ---');
    // Observador debe ser rechazado
    const { error: errObs } = await observadorClient.rpc('pedido_create_internal', {
      p_titulo: 'Pedido no autorizado por observador',
    });
    assert(Boolean(errObs), 'Observador es rechazado para crear pedido interno');
    assert(errObs?.message?.includes('FORBIDDEN') || errObs?.code === '42501', 'Error FORBIDDEN / 42501 para observador');

    // Anónimo/Sin sesión debe ser rechazado
    const { error: errAnon } = await unauthClient.rpc('pedido_create_internal', {
      p_titulo: 'Pedido no autorizado anónimo',
    });
    assert(Boolean(errAnon), 'Anónimo es rechazado para crear pedido interno');

    // =========================================================================
    // TEST 5: Prohibición estricta de Solicitud de Información (48h) en Pedidos Internos
    // =========================================================================
    console.log('\n--- 6. TEST: Prohibición de solicitudes de información (48h) en pedidos internos ---');
    const fakeTokenHash = crypto.createHash('sha256').update('test_fake_token_' + runId).digest('hex');
    const fakeEnvelope = { ciphertext: 'fake', iv: 'fake', tag: 'fake' };
    const { error: errInfoReq } = await serviceClient.rpc('info_request_create_atomic', {
      p_solicitud_id: crypto.randomUUID(),
      p_pedido_id: resFull.id,
      p_actor_user_id: adminUser.userId,
      p_mensaje: 'Mensaje de solicitud de información indebido en pedido interno',
      p_token_hash: fakeTokenHash,
      p_encrypted_envelope: fakeEnvelope,
      p_expected_version: dbFull.version,
    });
    assert(Boolean(errInfoReq), 'Solicitud de información en pedido interno fue rechazada por la RPC');
    assert(errInfoReq?.message?.includes('INFO_REQUEST_NOT_ALLOWED_FOR_INTERNAL'),
      'Mensaje de error explícito: ' + errInfoReq?.message);

    // =========================================================================
    // TEST 6: Flujo de Estados y Finalización sin entregas obligatorias
    // =========================================================================
    console.log('\n--- 7. TEST: Flujo de estados y Finalización flexible de pedidos internos ---');
    // 1. Asignar responsable
    const { data: resAssign, error: errAssign } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: resMin.id,
      p_responsable_user_id: equipoUser.userId,
      p_expected_version: 1,
    });
    assert(!errAssign, 'Asignación de responsable exitosa: ' + (errAssign?.message || 'OK'));

    // 2. Transicionar a En revisión (versión 2)
    const { data: resRev, error: errRev } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: resMin.id,
      p_target_state: 'En revisión',
      p_expected_version: 2,
    });
    assert(!errRev, 'Transición a En revisión exitosa: ' + (errRev?.message || 'OK'));

    // 3. Transicionar a En proceso (versión 3)
    const { data: resProc, error: errProc } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: resMin.id,
      p_target_state: 'En proceso',
      p_expected_version: 3,
    });
    assert(!errProc, 'Transición a En proceso exitosa: ' + (errProc?.message || 'OK'));

    // 4. Finalizar SIN archivos ni URL (permitido para pedidos internos)
    const { data: resFinMin, error: errFinMin } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: resMin.id,
      p_expected_version: 4,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Finalizado internamente sin entregables externos requeridos',
    });
    assert(!errFinMin, 'Finalización de pedido interno sin archivos/links fue exitosa: ' + (errFinMin?.message || 'OK'));
    assert(resFinMin?.estado === 'Finalizado', 'Estado resultante es Finalizado');

    const { data: dbFin } = await serviceClient.from('pedidos').select('estado, version').eq('id', resMin.id).single();
    assert(dbFin?.estado === 'Finalizado', 'Pedido en base de datos quedó en Finalizado');
    assert(dbFin?.version === 5, 'Versión se incrementó a 5');

    // =========================================================================
    // TEST 7: Aislamiento de Tracking y "Mis Solicitudes"
    // =========================================================================
    console.log('\n--- 8. TEST: Aislamiento estricto de tracking y Mis Solicitudes ---');
    // Generar sesión de solicitante para el correo del pedido interno
    const testSessionToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(testSessionToken).digest('hex');
    await serviceClient.from('solicitante_sesiones').insert({
      correo: 'transporte@tdf.gob.ar',
      session_token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const { data: trackingList, error: trackingErr } = await serviceClient.rpc('solicitante_get_pedidos', {
      p_session_token: testSessionToken,
    });
    assert(!trackingErr, 'Consulta solicitante_get_pedidos ejecutada sin error: ' + (trackingErr?.message || 'OK'));
    const foundInternal = (trackingList?.pedidos || []).some(p => p.id === resFull.id);
    assert(!foundInternal, 'solicitante_get_pedidos NO retorna el pedido interno');

    const { error: detailErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: testSessionToken,
      p_pedido_ref: resFull.id,
    });
    assert(Boolean(detailErr), 'solicitante_get_pedido_detail rechaza ver el pedido interno');
    assert(detailErr?.message?.includes('PEDIDO_NOT_FOUND'), 'Retorna PEDIDO_NOT_FOUND para el solicitante');

    // =========================================================================
    // TEST 8: Purga de pedidos internos (Admin Purge Preview & Purge)
    // =========================================================================
    console.log('\n--- 9. TEST: Compatibilidad de Purga administrativa con pedidos internos ---');
    const { data: purgePreview, error: purgePreviewErr } = await adminClient.rpc('admin_pedidos_purge_preview', {
      p_pedido_ids: [resMin.id, resFull.id],
    });
    assert(!purgePreviewErr, 'admin_pedidos_purge_preview exitosa: ' + (purgePreviewErr?.message || 'OK'));
    assert(purgePreview?.pedidos_count === 2, 'Detecta exactamente 2 pedidos para purga');

    console.log('\n================================================================');
    console.log(`RESUMEN: ${testsPassed} pruebas superadas, ${testsFailed} fallidas`);
    console.log('================================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error fatal durante la suite de pruebas:', error);
    process.exit(1);
  } finally {
    // Limpieza de usuarios de prueba
    console.log('--- Limpiando usuarios de prueba ---');
    for (const u of testUsers) {
      await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.userId);
      await serviceClient.auth.admin.deleteUser(u.userId);
    }
  }
}

main().catch((err) => {
  console.error('Error de ejecución no capturado:', err);
  process.exit(1);
});
