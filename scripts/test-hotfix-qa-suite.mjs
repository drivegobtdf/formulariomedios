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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION_FAILED] ${message}`);
  }
}

async function run() {
  console.log('=== INICIANDO QA COMPLETO DEL HOTFIX (TEST: yqfkzgqvezarzhlwiilo) ===\n');
  const { serviceKey, anonKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey);
  const anonClient = createClient(SUPABASE_URL, anonKey);

  const runId = Date.now();
  const password = `TestPass!${runId}`;
  const opEmail = `qa_hotfix_op_${runId}@tdf.gob.ar`;

  const cleanupItems = {
    users: [],
    pedidos: [],
    envios: [],
    solicitudes: [],
    comunicaciones: []
  };

  try {
    // 0. Crear operador auth con rol equipo aprobado
    console.log('[SETUP] Creando operador de prueba...');
    const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
      email: opEmail,
      password,
      email_confirm: true,
    });
    if (authErr) throw authErr;
    const operatorId = authUser.user.id;
    cleanupItems.users.push(operatorId);

    await serviceClient.from('usuarios_acceso').insert({
      user_id: operatorId,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
      nombre: 'Operador',
      apellido: 'QA Hotfix',
      nombre_usuario: `op_hotfix_${runId}`
    });

    const { data: opSession, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: opEmail,
      password
    });
    if (loginErr) throw loginErr;

    const opClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opSession.session.access_token}` } }
    });

    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id').limit(1).single();

    // =========================================================================
    // ESCENARIO 1: PEDIDO PÚBLICO - CICLO COMPLETO CON SOLICITUD 48H Y FINALIZACIÓN
    // Flujo: Nuevo -> Asignado -> En revisión -> En proceso -> Esperando información -> respondida (En proceso) -> Finalizado
    // =========================================================================
    console.log('\n--- ESCENARIO 1: Pedido Público - Ciclo Completo con 48h y Finalización ---');
    const envioId1 = crypto.randomUUID();
    const citizenEmail1 = `ciudadano_qa_${runId}@tdf.gob.ar`;
    await serviceClient.from('envios_formulario').insert({
      id: envioId1,
      submission_key: crypto.randomUUID(),
      request_fingerprint: crypto.createHash('sha256').update(`pub1_${runId}`).digest('hex'),
      correo: citizenEmail1,
      nombre_apellido: 'Ciudadano QA 1',
      area_solicitante: 'Secretaría de Cultura',
      telefono: '2901999111'
    });
    cleanupItems.envios.push(envioId1);

    const seq1 = Math.floor(100000 + Math.random() * 899999);
    const visible1 = `PED-2026-${cat.codigo_ped}${seq1}`;
    const pedidoId1 = crypto.randomUUID();

    await serviceClient.from('pedidos').insert({
      id: pedidoId1,
      envio_id: envioId1,
      categoria_id: cat.id,
      tipo_servicio_id: tipo.id,
      pedido_visible: visible1,
      anio: 2026,
      numero: seq1,
      codigo_categoria: cat.codigo_ped,
      estado: 'Nuevo',
      origen: 'publico',
      version: 1,
      client_request_ref: crypto.randomUUID(),
      responsable_user_id: null
    });
    cleanupItems.pedidos.push(pedidoId1);

    // 1.1 Asignar responsable (Nuevo -> Asignado)
    console.log('1.1 Asignando responsable al pedido...');
    const { error: assignErr1 } = await opClient.rpc('pedido_assign', {
      p_pedido_id: pedidoId1,
      p_responsable_user_id: operatorId,
      p_expected_version: 1,
      p_motivo: 'Asignación QA'
    });
    if (assignErr1) throw assignErr1;

    const { data: pedAssigned1 } = await serviceClient.from('pedidos').select('estado, version, responsable_user_id').eq('id', pedidoId1).single();
    assert(pedAssigned1.responsable_user_id === operatorId, 'Responsable asignado correctamente');
    assert(pedAssigned1.version === 2, `Versión incrementada a 2 (actual: ${pedAssigned1.version})`);

    // Verificar comunicación de asignación al operador
    const { data: commsAssign1 } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoId1)
      .eq('tipo_comunicacion', 'pedido_asignado');
    assert(commsAssign1.length === 1, 'Comunicación pedido_asignado creada para el operador');
    assert(commsAssign1[0].destinatario_email === opEmail.toLowerCase(), 'Destinatario es el email del operador');

    // 1.2 Transición: Nuevo -> En revisión
    console.log('1.2 Transición: Nuevo -> En revisión...');
    const { error: revErr1 } = await opClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId1,
      p_target_state: 'En revisión',
      p_expected_version: 2,
      p_motivo: null
    });
    if (revErr1) throw revErr1;

    const { data: pedRev1 } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId1).single();
    assert(pedRev1.estado === 'En revisión', 'Estado es En revisión');
    assert(pedRev1.version === 3, 'Versión es 3');

    // 1.3 Transición: En revisión -> En proceso (Aquí fallaba el incidente original)
    console.log('1.3 Transición: En revisión -> En proceso...');
    const { error: procErr1 } = await opClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId1,
      p_target_state: 'En proceso',
      p_expected_version: 3,
      p_motivo: null
    });
    if (procErr1) throw procErr1;

    const { data: pedProc1 } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId1).single();
    assert(pedProc1.estado === 'En proceso', 'Estado es En proceso');
    assert(pedProc1.version === 4, 'Versión es 4');

    // Verificar comunicación encolada para el ciudadano en comunicaciones_pedido
    const { data: commsProc1 } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoId1)
      .eq('tipo_comunicacion', 'en_proceso');
    assert(commsProc1.length === 1, 'Comunicación en_proceso encolada exactamente 1 vez en comunicaciones_pedido');
    assert(commsProc1[0].destinatario_email === citizenEmail1.toLowerCase(), 'Destinatario es el correo del ciudadano');
    assert(commsProc1[0].payload.intent_type === 'en_proceso', 'Payload contiene intent_type=en_proceso');

    // 1.4 Transición: En proceso -> Esperando información (info_request_create_atomic)
    console.log('1.4 Solicitud de Información 48h (En proceso -> Esperando información)...');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const solicitudId1 = crypto.randomUUID();
    const fakeEnvelope = { ciphertext: 'aGVsbG8=', iv: 'MTIzNDU2Nzg5MDEy', tag: 'YWJjZGVmZ2hpamtsbW5vcA==' };

    const { data: reqInfoRes, error: reqInfoErr } = await serviceClient.rpc('info_request_create_atomic', {
      p_solicitud_id: solicitudId1,
      p_pedido_id: pedidoId1,
      p_actor_user_id: operatorId,
      p_mensaje: 'Por favor adjuntar resolución de designación completa.',
      p_token_hash: tokenHash,
      p_encrypted_envelope: fakeEnvelope,
      p_expected_version: 4
    });
    if (reqInfoErr) throw reqInfoErr;
    cleanupItems.solicitudes.push(solicitudId1);

    const { data: pedWait1 } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId1).single();
    assert(pedWait1.estado === 'Esperando información', 'Estado es Esperando información');
    assert(pedWait1.version === 5, 'Versión es 5');

    const { data: sol1 } = await serviceClient.from('solicitudes_informacion').select('*').eq('id', solicitudId1).single();
    assert(sol1.estado === 'pendiente', 'Solicitud en estado pendiente');
    assert(sol1.estado_previo === 'En proceso', 'Solicitud guardó estado_previo=En proceso');

    const { data: commsInfo1 } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoId1)
      .eq('tipo_comunicacion', 'informacion_faltante');
    assert(commsInfo1.length === 1, 'Comunicación informacion_faltante encolada para el ciudadano');

    // 1.5 Respuesta ciudadana y restauración del estado previo (En proceso)
    console.log('1.5 Respuesta ciudadana (info_response_submit_core) -> Restauración de En proceso...');
    const { data: respRes, error: respErr } = await serviceClient.rpc('info_response_submit_core', {
      p_token_hash: tokenHash,
      p_respuesta_texto: 'Adjunto se encuentra la documentación solicitada.',
      p_archivo_ids: [],
      p_enlaces: []
    });
    if (respErr) throw respErr;
    assert(respRes.success === true, 'Respuesta ciudadana procesada con éxito');

    const { data: pedRestored1 } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId1).single();
    assert(pedRestored1.estado === 'En proceso', `Estado restaurado exactamente a En proceso (actual: ${pedRestored1.estado})`);
    assert(pedRestored1.version === 6, 'Versión incrementada a 6');

    // 1.6 Finalización pública válida con URL de entrega
    console.log('1.6 Finalización pública con URL de entrega...');
    const { data: finRes1, error: finErr1 } = await opClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoId1,
      p_expected_version: 6,
      p_archivos_entrega: null,
      p_url_entrega: 'https://descargas.tdf.gob.ar/entregas/diseño_final.pdf',
      p_nota_entrega: 'Trabajo concluido según requerimientos.'
    });
    if (finErr1) throw finErr1;
    assert(finRes1.success === true, 'Finalización exitosa');

    const { data: pedFinal1 } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId1).single();
    assert(pedFinal1.estado === 'Finalizado', 'Estado es Finalizado');
    assert(pedFinal1.version === 7, 'Versión es 7');

    const { data: entregas1 } = await serviceClient.from('entregas_pedido').select('*').eq('pedido_id', pedidoId1);
    assert(entregas1.length === 1, 'Registro en entregas_pedido creado para pedido público con URL');

    const { data: commsFinal1 } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoId1)
      .eq('tipo_comunicacion', 'finalizado');
    assert(commsFinal1.length === 1, 'Comunicación de finalización encolada para el ciudadano');

    console.log('✔ Escenario 1 completado con éxito total.');

    // =========================================================================
    // ESCENARIO 2: DIRECTO NUEVO -> EN PROCESO (PEDIDO PÚBLICO)
    // =========================================================================
    console.log('\n--- ESCENARIO 2: Transición Directa Nuevo -> En proceso ---');
    const envioId2 = crypto.randomUUID();
    const citizenEmail2 = `ciudadano2_qa_${runId}@tdf.gob.ar`;
    await serviceClient.from('envios_formulario').insert({
      id: envioId2,
      submission_key: crypto.randomUUID(),
      request_fingerprint: crypto.createHash('sha256').update(`pub2_${runId}`).digest('hex'),
      correo: citizenEmail2,
      nombre_apellido: 'Ciudadano QA 2',
      area_solicitante: 'Ministerio de Economía',
      telefono: '2901999222'
    });
    cleanupItems.envios.push(envioId2);

    const seq2 = Math.floor(100000 + Math.random() * 899999);
    const visible2 = `PED-2026-${cat.codigo_ped}${seq2}`;
    const pedidoId2 = crypto.randomUUID();

    await serviceClient.from('pedidos').insert({
      id: pedidoId2,
      envio_id: envioId2,
      categoria_id: cat.id,
      tipo_servicio_id: tipo.id,
      pedido_visible: visible2,
      anio: 2026,
      numero: seq2,
      codigo_categoria: cat.codigo_ped,
      estado: 'Nuevo',
      origen: 'publico',
      version: 1,
      client_request_ref: crypto.randomUUID(),
      responsable_user_id: null
    });
    cleanupItems.pedidos.push(pedidoId2);

    await opClient.rpc('pedido_assign', {
      p_pedido_id: pedidoId2,
      p_responsable_user_id: operatorId,
      p_expected_version: 1,
      p_motivo: 'Asignación directa'
    });

    const { error: directErr } = await opClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId2,
      p_target_state: 'En proceso',
      p_expected_version: 2,
      p_motivo: null
    });
    if (directErr) throw directErr;

    const { data: pedDirect } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoId2).single();
    assert(pedDirect.estado === 'En proceso', 'Estado es En proceso');
    assert(pedDirect.version === 3, 'Versión es 3');

    const { data: commsDirect } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoId2)
      .eq('tipo_comunicacion', 'en_proceso');
    assert(commsDirect.length === 1, 'Comunicación en_proceso generada correctamente');
    console.log('✔ Escenario 2 completado con éxito total.');

    // =========================================================================
    // ESCENARIO 3: CANCELACIÓN DE PEDIDO PÚBLICO
    // =========================================================================
    console.log('\n--- ESCENARIO 3: Cancelación de Pedido Público ---');
    const { error: cancelErr } = await opClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId2,
      p_target_state: 'Cancelado',
      p_expected_version: 3,
      p_motivo: 'Solicitud dada de baja por duplicación administrativa'
    });
    if (cancelErr) throw cancelErr;

    const { data: pedCancel } = await serviceClient.from('pedidos').select('estado, version, motivo_cancelacion').eq('id', pedidoId2).single();
    assert(pedCancel.estado === 'Cancelado', 'Estado es Cancelado');
    assert(pedCancel.version === 4, 'Versión es 4');
    assert(pedCancel.motivo_cancelacion.includes('duplicación'), 'Motivo de cancelación registrado');

    const { data: eventsCancel } = await serviceClient
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', pedidoId2)
      .eq('event_name', 'pedido.state_changed')
      .order('created_at', { ascending: false })
      .limit(1);
    assert(eventsCancel.length === 1 && eventsCancel[0].payload.estado_nuevo === 'Cancelado', 'Domain event registrado para Cancelado');

    const { data: auditCancel } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('recurso_id', pedidoId2)
      .eq('accion', 'state_change')
      .order('created_at', { ascending: false })
      .limit(1);
    assert(auditCancel.length === 1 && auditCancel[0].metadata.estado_nuevo === 'Cancelado', 'Audit log registrado para Cancelado');
    console.log('✔ Escenario 3 completado con éxito total.');

    // =========================================================================
    // ESCENARIO 4: PEDIDO INTERNO COMPLETO (B.3 + B.3.1 + B.3.2)
    // - Creación interna sin categoría (código X)
    // - Asignación preserva email operativo al operador
    // - Prohibición estricta de Solicitud de Información (48h)
    // - Transición a En proceso NO genera comunicación externa
    // - Finalización flexible con 0 archivos, 0 enlaces, nota vacía/null -> 0 entregas_pedido, NO comunicación externa
    // =========================================================================
    console.log('\n--- ESCENARIO 4: Pedido Interno Completo ---');
    const clientRefInt = crypto.randomUUID();
    const { data: intRes, error: intErr } = await opClient.rpc('pedido_create_internal', {
      p_titulo: 'Relevamiento Interno de Medios QA ' + runId,
      p_client_request_ref: clientRefInt
    });
    if (intErr) throw intErr;
    assert(intRes.success === true, 'Creación de pedido interno exitosa');
    const pedidoIdInt = intRes.id;
    cleanupItems.pedidos.push(pedidoIdInt);

    const { data: pedIntDb } = await serviceClient.from('pedidos').select('*').eq('id', pedidoIdInt).single();
    assert(pedIntDb.origen === 'interno', 'Origen del pedido es interno');
    assert(pedIntDb.codigo_categoria === 'X', `Código de categoría es X neutral (actual: ${pedIntDb.codigo_categoria})`);
    assert(pedIntDb.pedido_visible.includes('-X'), `Formato visible neutral PED-YYYY-X... (actual: ${pedIntDb.pedido_visible})`);

    // 4.1 Asignación a operador
    console.log('4.1 Asignando responsable al pedido interno...');
    const { error: intAssignErr } = await opClient.rpc('pedido_assign', {
      p_pedido_id: pedidoIdInt,
      p_responsable_user_id: operatorId,
      p_expected_version: 1,
      p_motivo: 'Asignación interna'
    });
    if (intAssignErr) throw intAssignErr;

    // Verificar que el operador SÍ recibió su comunicación operativa
    const { data: intCommsAssign } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoIdInt)
      .eq('tipo_comunicacion', 'pedido_asignado');
    assert(intCommsAssign.length === 1, 'Operador recibe email operativo de asignación en pedido interno');
    assert(intCommsAssign[0].destinatario_email === opEmail.toLowerCase(), 'Destinatario es el operador');

    // 4.2 Prohibición estricta de solicitud de información (48h) en interno
    console.log('4.2 Comprobando rechazo estricto de Solicitud de Información 48h...');
    const fakeTokenHashInt = crypto.createHash('sha256').update('internal_test').digest('hex');
    const { error: intInfoReqErr } = await serviceClient.rpc('info_request_create_atomic', {
      p_solicitud_id: crypto.randomUUID(),
      p_pedido_id: pedidoIdInt,
      p_actor_user_id: operatorId,
      p_mensaje: 'Intento indebido de solicitud de información en pedido interno',
      p_token_hash: fakeTokenHashInt,
      p_encrypted_envelope: fakeEnvelope,
      p_expected_version: 2
    });
    assert(Boolean(intInfoReqErr), 'Solicitud de información en interno fue rechazada por la RPC');
    assert(intInfoReqErr?.message?.includes('INFO_REQUEST_NOT_ALLOWED_FOR_INTERNAL'), `Error explícito: ${intInfoReqErr?.message}`);

    // 4.3 Transición a En proceso en pedido interno
    console.log('4.3 Transición de pedido interno a En proceso...');
    const { error: intProcErr } = await opClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoIdInt,
      p_target_state: 'En proceso',
      p_expected_version: 2,
      p_motivo: null
    });
    if (intProcErr) throw intProcErr;

    const { data: pedIntProc } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoIdInt).single();
    assert(pedIntProc.estado === 'En proceso', 'Estado es En proceso');
    assert(pedIntProc.version === 3, 'Versión es 3');

    // Comprobar que NO se emitió comunicación hacia público/solicitante
    const { data: intCommsProc } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoIdInt)
      .eq('tipo_comunicacion', 'en_proceso');
    assert(intCommsProc.length === 0, 'Pedido interno NO genera comunicación externa al pasar a En proceso');

    // 4.4 Finalización interna flexible sin archivos ni URLs ni notas
    console.log('4.4 Finalización flexible de pedido interno (0 archivos, 0 URL, nota=null)...');
    const { data: intFinRes, error: intFinErr } = await opClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoIdInt,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: null
    });
    if (intFinErr) throw intFinErr;
    assert(intFinRes.success === true, 'Finalización flexible de pedido interno fue exitosa');

    const { data: pedIntFinal } = await serviceClient.from('pedidos').select('estado, version').eq('id', pedidoIdInt).single();
    assert(pedIntFinal.estado === 'Finalizado', 'Estado es Finalizado');
    assert(pedIntFinal.version === 4, 'Versión es 4');

    // Verificar que NO se crearon registros artificiales en entregas_pedido
    const { data: intEntregas } = await serviceClient.from('entregas_pedido').select('*').eq('pedido_id', pedidoIdInt);
    assert(intEntregas.length === 0, '0 registros en entregas_pedido para finalización interna flexible');

    // Verificar que NO se generaron comunicaciones externas de finalización
    const { data: intCommsFin } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('pedido_id', pedidoIdInt)
      .eq('tipo_comunicacion', 'finalizado');
    assert(intCommsFin.length === 0, 'Pedido interno NO genera comunicación externa de finalización');

    console.log('✔ Escenario 4 completado con éxito total.');

    // =========================================================================
    // AUDITORÍA DE COMUNICACIONES: CERO DUPLICADOS
    // =========================================================================
    console.log('\n--- AUDITORÍA: Cero duplicados en comunicaciones_pedido ---');
    const { data: allComms } = await serviceClient
      .from('comunicaciones_pedido')
      .select('idempotency_key');
    const keyCounts = {};
    for (const c of allComms) {
      if (c.idempotency_key) {
        keyCounts[c.idempotency_key] = (keyCounts[c.idempotency_key] || 0) + 1;
        assert(keyCounts[c.idempotency_key] <= 1, `Clave de idempotencia duplicada: ${c.idempotency_key}`);
      }
    }
    console.log(`✔ Verificadas ${allComms.length} comunicaciones encoladas sin ningún duplicado.`);

    // =========================================================================
    // AUDITORÍA DE RUNTIME DATABASE: CERO REFERENCIAS A comunicaciones_outbox
    // =========================================================================
    console.log('\n--- AUDITORÍA: Cero referencias runtime a comunicaciones_outbox ---');
    const outboxProcCheck = execSync('npx.cmd supabase db query --linked "SELECT proname FROM pg_proc WHERE prosrc ILIKE \'%comunicaciones_outbox%\';" --output json', { encoding: 'utf8' });
    const parsedProc = JSON.parse(outboxProcCheck);
    const procRows = Array.isArray(parsedProc) ? parsedProc : (parsedProc.rows || []);
    assert(procRows.length === 0, `pg_proc contiene referencias a comunicaciones_outbox: ${JSON.stringify(procRows)}`);
    console.log('✔ Confirmado: 0 funciones en pg_proc referencian comunicaciones_outbox.');

    console.log('\n======================================================');
    console.log('🎉 TODOS LOS ESCENARIOS DE QA PASARON SATISFACTORIAMENTE');
    console.log('======================================================\n');
  } finally {
    console.log('[CLEANUP] Limpiando fixtures de prueba en TEST...');
    for (const pid of cleanupItems.pedidos) {
      await serviceClient.from('comunicaciones_pedido').delete().eq('pedido_id', pid);
      await serviceClient.from('domain_events').delete().eq('aggregate_id', pid);
      await serviceClient.from('audit_log').delete().eq('recurso_id', pid);
      await serviceClient.from('solicitudes_informacion').delete().eq('pedido_id', pid);
      await serviceClient.from('entregas_pedido').delete().eq('pedido_id', pid);
      await serviceClient.from('pedidos').delete().eq('id', pid);
    }
    for (const eid of cleanupItems.envios) {
      await serviceClient.from('envios_formulario').delete().eq('id', eid);
    }
    for (const uid of cleanupItems.users) {
      await serviceClient.from('user_notifications').delete().eq('user_id', uid);
      await serviceClient.from('usuarios_acceso').delete().eq('user_id', uid);
      await serviceClient.auth.admin.deleteUser(uid);
    }
    console.log('[CLEANUP] Fixtures eliminados.');
  }
}

run().catch(e => {
  console.error('\n❌ ERROR EN QA SUITE:', e);
  process.exit(1);
});
