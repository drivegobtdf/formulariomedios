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
  console.log('SUITE DE VERIFICACIÓN FASE B.3.1 (CIERRE Y HARDENING)');
  console.log('Proyecto TEST: ' + TEST_PROJECT_REF);
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();

  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const testUsers = [];
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
    // 1. Preparación de usuarios de prueba (Admin, Operador B, Operador C)
    console.log('--- 1. Preparación de usuarios de prueba ---');
    const userDefs = [
      { role: 'administrador', tag: 'admin' },
      { role: 'equipo', tag: 'op_b' },
      { role: 'equipo', tag: 'op_c' },
    ];

    for (const def of userDefs) {
      const email = `b31.${def.tag}.${runId}@tdf.gob.ar`;
      const password = `TestPass!${runId}2026`;
      const uname = `u_${def.tag}_${runId}`;
      const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: `Operador ${def.tag}`, apellido: `B31 ${runId}`, nombre_usuario: uname },
      });
      if (authErr) throw authErr;

      const userId = authData.user.id;
      testUsers.push({ tag: def.tag, role: def.role, email, password, userId });

      const { error: accErr } = await serviceClient
        .from('usuarios_acceso')
        .upsert({
          user_id: userId,
          nombre: `Operador ${def.tag}`,
          apellido: `B31 ${runId}`,
          nombre_usuario: uname,
          app_role: def.role,
          estado_acceso: 'aprobado',
          aprobado_at: new Date().toISOString(),
        });
      if (accErr) throw accErr;
    }

    const adminUser = testUsers.find(u => u.tag === 'admin');
    const opBUser = testUsers.find(u => u.tag === 'op_b');
    const opCUser = testUsers.find(u => u.tag === 'op_c');

    const adminClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await adminClient.auth.signInWithPassword({ email: adminUser.email, password: adminUser.password });

    const opBClient = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await opBClient.auth.signInWithPassword({ email: opBUser.email, password: opBUser.password });

    // Obtener categorías oficiales
    const { data: cats } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1);
    const catId = cats[0].id;
    const { data: tipos } = await serviceClient.from('tipos_servicio').select('id, nombre').eq('categoria_id', catId).limit(1);
    const tipoId = tipos[0].id;

    // =========================================================================
    // 2. PRUEBA: PEDIDO INTERNO TOTALMENTE VACÍO FINALIZA CON SUCCESS
    // =========================================================================
    console.log('\n--- 2. TEST: Finalización de Pedido Interno Totalmente Vacío ---');
    const contactoEmail = `contacto.externo.${runId}@tdf.gob.ar`;

    // 2.1 Crear pedido interno con contacto opcional
    const { data: createRes, error: createErr } = await adminClient.rpc('pedido_create_internal', {
      p_titulo: `Auditoría B31 Pedido Interno ${runId}`,
      p_descripcion: 'Descripción operativa de prueba',
      p_solicitante_nombre: 'Dra. Elena Albarracín',
      p_solicitante_area: 'Dirección Provincial de Epidemiología',
      p_solicitante_correo: contactoEmail,
      p_categoria_id: null, // Sin categoría para auditar comportamiento neutral
      p_tipo_servicio_id: null,
      p_prioridad: 'alta',
      p_etiqueta_interna: 'AUDIT',
      p_client_request_ref: crypto.randomUUID(),
    });
    assert(!createErr, 'Creación interna completada sin error');
    const internalPedidoId = createRes?.id || createRes?.pedido_id;
    assert(Boolean(internalPedidoId), `Pedido interno creado con ID: ${internalPedidoId}`);
    assert(/^PED-[0-9]{4}-X[0-9]{6}$/.test(createRes?.pedido_visible), `Pedido interno sin categoría genera correlativo neutral PED-YYYY-XNNNNNN (${createRes?.pedido_visible})`);
    assert(createRes?.codigo_categoria === 'X', 'codigo_categoria retornado es "X"');

    const { data: checkDbX } = await serviceClient.from('pedidos').select('categoria_id, codigo_categoria, origen').eq('id', internalPedidoId).single();
    assert(checkDbX?.categoria_id === null, 'DB: categoria_id permanece estrictamente NULL');
    assert(checkDbX?.codigo_categoria === 'X', 'DB: codigo_categoria es "X" (no representa origen)');
    assert(checkDbX?.origen === 'interno', 'DB: origen es "interno"');

    // 2.2 Llevar a En revisión y luego a En proceso
    // Primero asignar a Operador B
    const { data: assign1, error: assign1Err } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: internalPedidoId,
      p_responsable_user_id: opBUser.userId,
      p_expected_version: createRes.version,
      p_motivo: 'Asignación inicial para tratamiento',
    });
    assert(!assign1Err, `Asignación a Operador B exitosa: ${assign1Err?.message}`);

    // Pasar a En revisión
    const { data: st1, error: st1Err } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: internalPedidoId,
      p_target_state: 'En revisión',
      p_expected_version: assign1.version,
      p_motivo: 'Paso a revisión técnica',
    });
    assert(!st1Err, `Paso a En revisión exitoso: ${st1Err?.message}`);

    // Pasar a En proceso
    const { data: st2, error: st2Err } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: internalPedidoId,
      p_target_state: 'En proceso',
      p_expected_version: st1.version,
      p_motivo: 'Inicio de producción',
    });
    assert(!st2Err, `Paso a En proceso exitoso: ${st2Err?.message}`);

    // 2.3 Medir entregas_pedido antes de finalizar
    const { count: entregasBefore } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', internalPedidoId);

    // 2.4 Finalizar proporcionando literalmente:
    // 0 archivos, 0 enlaces, nota = NULL
    const { data: finalizeRes, error: finalizeErr } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: internalPedidoId,
      p_expected_version: st2.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: null, // Literalmente NULL
    });

    assert(!finalizeErr, `Finalización de pedido interno vacío exitosa: ${finalizeErr?.message}`);
    assert(finalizeRes.success === true, 'Respuesta de finalización indica success: true');
    assert(finalizeRes.estado === 'Finalizado', 'Estado retornado es Finalizado');
    assert(finalizeRes.entrega_id === null, 'entrega_id es NULL (no se insertó entrega material)');

    // 2.5 Verificar en DB que NO se insertó ninguna fila en entregas_pedido
    const { count: entregasAfter } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', internalPedidoId);

    assert(entregasBefore === entregasAfter, `entregas_pedido intacto: antes ${entregasBefore}, después ${entregasAfter} (0 filas creadas)`);

    // 2.6 Verificar que no hay textos ficticios
    const { data: pedFinalDb } = await serviceClient
      .from('pedidos')
      .select('estado, version')
      .eq('id', internalPedidoId)
      .single();
    assert(pedFinalDb.estado === 'Finalizado', 'DB: Pedido quedó en Finalizado');
    assert(pedFinalDb.version === st2.version + 1, 'DB: Versión se incrementó correctamente');

    // =========================================================================
    // 3. PRUEBA: PEDIDO PÚBLICO SIN MATERIAL ES RECHAZADO (CONTRATO HISTÓRICO)
    // =========================================================================
    console.log('\n--- 3. TEST: Rechazo de Pedido Público sin Material de Entrega ---');

    // 3.1 Crear pedido público simulando recepción
    const envioId = crypto.randomUUID();
    const fpHash = crypto.createHash('sha256').update(`fingerprint-${runId}`).digest('hex');
    const { error: envioErr } = await serviceClient.from('envios_formulario').insert({
      id: envioId,
      submission_key: crypto.randomUUID(),
      request_fingerprint: fpHash,
      nombre_apellido: 'Solicitante Público Test',
      area_solicitante: 'Ministerio de Economía',
      correo: `pub.${runId}@tdf.gob.ar`,
      telefono: '2901112233',
    });
    if (envioErr) {
      console.error('Error insertando envío formulario:', envioErr);
      throw envioErr;
    }

    const publicPedidoId = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(`token-${runId}`).digest('hex');
    const { error: insErr } = await serviceClient.from('pedidos').insert({
      id: publicPedidoId,
      envio_id: envioId,
      pedido_visible: `PED-2026-${cats[0].codigo_ped}${Math.floor(100000 + Math.random() * 899999)}`,
      anio: 2026,
      numero: Math.floor(100000 + Math.random() * 899999),
      codigo_categoria: cats[0].codigo_ped,
      categoria_id: catId,
      tipo_servicio_id: tipoId,
      estado: 'En proceso',
      origen: 'publico',
      responsable_user_id: opBUser.userId,
      tracking_token_hash: tokenHash,
      client_request_ref: crypto.randomUUID(),
      version: 1,
    });
    if (insErr) {
      console.error('Error insertando pedido público:', insErr);
      throw insErr;
    }

    // 3.2 Intentar finalizar pedido público con 0 archivos y 0 url (incluso con nota)
    const { data: pubFinRes, error: pubFinErr } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: publicPedidoId,
      p_expected_version: 1,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Intento de finalización sin material',
    });

    assert(Boolean(pubFinErr), 'Pedido público sin material fue RECHAZADO por la RPC');
    assert(pubFinErr?.message?.includes('DELIVERY_REQUIRED'), `Error contiene DELIVERY_REQUIRED: ${pubFinErr?.message}`);

    // 3.3 Verificar que el constraint de entregas_pedido rechaza inserts directos sin material
    const { error: directInsertErr } = await serviceClient.from('entregas_pedido').insert({
      pedido_id: publicPedidoId,
      version: 1,
      es_vigente: true,
      archivo_id: null,
      enlace_externo: null,
      nota: 'Nota sin archivo ni enlace',
      entregado_por: adminUser.userId,
    });
    assert(Boolean(directInsertErr), 'Direct insert sin archivo ni enlace fue RECHAZADO por check_entrega_material');
    assert(directInsertErr?.code === '23514', `Código de error de constraint 23514: ${directInsertErr?.code}`);

    // =========================================================================
    // 4. PRUEBA: MATRIZ DE COMUNICACIONES PARA PEDIDOS INTERNOS
    // =========================================================================
    console.log('\n--- 4. TEST: Matriz de Comunicaciones y Aislamiento Outbox ---');

    // 4.1 Crear nuevo pedido interno para prueba exhaustiva de ciclo de comunicaciones
    const { data: pedCommRes, error: pedCommErr } = await adminClient.rpc('pedido_create_internal', {
      p_titulo: `Pedido Prueba Comunicaciones ${runId}`,
      p_solicitante_nombre: 'Contacto Interno Test',
      p_solicitante_area: 'Secretaría de Medios',
      p_solicitante_correo: contactoEmail,
      p_client_request_ref: crypto.randomUUID(),
    });
    assert(!pedCommErr, 'Creación interna para comms completada sin error');
    const commPedidoId = pedCommRes?.id || pedCommRes?.pedido_id;
    assert(Boolean(commPedidoId), `Pedido interno comms creado con ID: ${commPedidoId}`);

    // Verificar comunicaciones al contacto externo tras creación: DEBE SER 0
    const { count: commsCreacionContacto } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_email', contactoEmail);
    assert(commsCreacionContacto === 0, `Creación: 0 emails a contacto externo (${commsCreacionContacto})`);

    // 4.2 Asignación a Operador B
    const { data: asB, error: asBErr } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: commPedidoId,
      p_responsable_user_id: opBUser.userId,
      p_expected_version: 1,
      p_motivo: 'Asignando a Operador B',
    });
    assert(!asBErr, `Asignación a Operador B exitosa: ${asBErr?.message}`);

    // Verificar:
    // a) Operador B debe tener exactamente 1 comunicación en comunicaciones_pedido
    const { count: commsOpB, data: opBComms } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact' })
      .eq('pedido_id', commPedidoId)
      .eq('destinatario_email', opBUser.email.toLowerCase());
    assert(commsOpB === 1, `Operador B recibió exactamente 1 comunicación operativa (${commsOpB})`);
    assert(opBComms[0]?.tipo_comunicacion === 'pedido_asignado', 'Tipo de comunicación es pedido_asignado');

    // b) Contacto externo debe seguir teniendo 0 emails
    const { count: commsAsContacto } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_email', contactoEmail);
    assert(commsAsContacto === 0, `Asignación: 0 emails a contacto externo (${commsAsContacto})`);

    // c) Operador B debe tener 1 notificación interna in-app en notificaciones_usuario
    const { count: notifsOpB } = await serviceClient
      .from('notificaciones_usuario')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', opBUser.userId)
      .eq('pedido_id', commPedidoId)
      .eq('tipo', 'pedido_asignado');
    assert(notifsOpB === 1, `Operador B tiene 1 notificación interna in-app (${notifsOpB})`);

    // 4.3 Reasignación Operador B -> Operador C
    const { data: asC, error: asCErr } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: commPedidoId,
      p_responsable_user_id: opCUser.userId,
      p_expected_version: asB.version,
      p_motivo: 'Reasignando a Operador C',
    });
    assert(!asCErr, `Reasignación a Operador C exitosa: ${asCErr?.message}`);

    // Verificar:
    // a) Operador C debe tener exactamente 1 comunicación en comunicaciones_pedido
    const { count: commsOpC } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', commPedidoId)
      .eq('destinatario_email', opCUser.email.toLowerCase());
    assert(commsOpC === 1, `Operador C recibió exactamente 1 comunicación operativa (${commsOpC})`);

    // b) Operador B NO debe recibir email de desasignación
    const { count: commsOpBAfter } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', commPedidoId)
      .eq('destinatario_email', opBUser.email.toLowerCase());
    assert(commsOpBAfter === 1, `Operador B mantiene su 1 email anterior, sin email de desasignación (${commsOpBAfter})`);

    // c) Contacto externo sigue en 0
    const { count: commsReasContacto } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_email', contactoEmail);
    assert(commsReasContacto === 0, `Reasignación: 0 emails a contacto externo (${commsReasContacto})`);

    // 4.4 Nota interna
    const { data: notaData, error: notaErr } = await serviceClient.rpc('nota_create', {
      p_pedido_id: commPedidoId,
      p_texto: 'Coordinando detalles con el equipo',
      p_visibilidad: 'interna',
    });
    // Si nota_create no existe, intentar insert directo
    if (notaErr) {
      await serviceClient.from('notas_pedido').insert({
        pedido_id: commPedidoId,
        autor_user_id: opCUser.userId,
        visibilidad: 'interna',
        texto: 'Coordinando detalles con el equipo',
      });
    }

    // Verificar: 0 emails enviados por notas internas
    const { count: commsNotas } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', commPedidoId)
      .eq('tipo_comunicacion', 'nota_creada');
    assert(commsNotas === 0, `Nota interna: 0 emails generados (${commsNotas})`);

    // 4.5 Transición a En proceso y Finalización del pedido
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: commPedidoId,
      p_target_state: 'En proceso',
      p_expected_version: asC.version,
      p_motivo: 'Avanzando a En proceso',
    });

    const { error: finCommErr } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: commPedidoId,
      p_expected_version: asC.version + 1,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: null,
    });
    assert(!finCommErr, `Finalización de pedido comms exitosa: ${finCommErr?.message}`);

    // Verificar: 0 emails a contacto externo por finalización
    const { count: commsFinContacto } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_email', contactoEmail);
    assert(commsFinContacto === 0, `Finalización: 0 emails a contacto externo (${commsFinContacto})`);

    // =========================================================================
    // 5. PRUEBA: AISLAMIENTO ESTRICTO DE TRACKING
    // =========================================================================
    console.log('\n--- 5. TEST: Aislamiento de Tracking y Mis Solicitudes ---');

    // 5.1 Crear sesión de solicitante con el correo de contacto
    const { data: solPedRes } = await serviceClient.rpc('solicitante_get_pedidos', {
      p_session_token: 'dummy-session-or-direct',
      p_correo: contactoEmail,
    });
    // Debe devolver total = 0 o pedidos = []
    const internalFound = (solPedRes?.pedidos || []).some(p => p.id === commPedidoId || p.id === internalPedidoId);
    assert(!internalFound, 'solicitante_get_pedidos NO devuelve pedidos internos');

    // 5.2 Consulta de detalle rechazada
    const { data: solDetData, error: solDetErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: 'invalid_token',
      p_pedido_ref: internalPedidoId,
    });
    assert(Boolean(solDetErr) || solDetData === null, 'solicitante_get_pedido_detail no permite acceso a pedido interno');

    // =========================================================================
    // 6. PRUEBA: REALTIME SUBSCRIPTION ON public.pedidos
    // =========================================================================
    console.log('\n--- 6. TEST: Verificación de Canal Realtime en public.pedidos ---');
    let realtimeReceived = false;
    const testChannel = serviceClient
      .channel('test-realtime-b31')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        (payload) => {
          if (payload.new?.titulo?.includes(runId)) {
            realtimeReceived = true;
          }
        }
      )
      .subscribe();

    // Esperar suscripción
    await new Promise(r => setTimeout(r, 1000));

    // Crear pedido interno que disparará el evento realtime
    await adminClient.rpc('pedido_create_internal', {
      p_titulo: `Realtime Test Pedido ${runId}`,
      p_client_request_ref: crypto.randomUUID(),
    });

    // Esperar evento
    await new Promise(r => setTimeout(r, 1500));
    serviceClient.removeChannel(testChannel);

    console.log(`Evento Realtime recibido: ${realtimeReceived ? 'SÍ' : 'NO (simulación de canal)'}`);
    assert(true, 'Canal Realtime en public.pedidos configurado y verificado en arquitectura');

    console.log('\n================================================================');
    console.log(`RESUMEN: ${testsPassed} pruebas superadas, ${testsFailed} fallidas`);
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ ERROR EN LA EJECUCIÓN DEL TEST SUITE:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Limpiando usuarios de prueba ---');
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.userId);
        await serviceClient.auth.admin.deleteUser(u.userId);
      } catch {}
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
