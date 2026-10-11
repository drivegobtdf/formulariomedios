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

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ PASS: ${message}`);
}

async function runSecuritySuite() {
  console.log('================================================================');
  console.log('SUITE DE VERIFICACIÓN DE SEGURIDAD SERVER-SIDE: solicitante_get_pedido_detail');
  console.log(`Ambiente TEST: ${TEST_PROJECT_REF}`);
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const testUsers = [];

  try {
    // 1. Crear usuario admin/operador
    const adminEmail = `sec.admin.${runId}@tdf.gob.ar`;
    const adminPass = `SecPass!${runId}2026`;
    const adminUname = `u_sec_${runId}`;

    const { data: authAdmin, error: authErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Sec QA', nombre_usuario: adminUname },
    });
    if (authErr) throw authErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Sec QA',
      nombre_usuario: adminUname,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const adminClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass,
    });
    if (signInErr) throw signInErr;

    // -------------------------------------------------------------
    // ESCENARIO 1: PEDIDO PÚBLICO FINALIZADO SOLO CON NOTA ("todo ok")
    // -------------------------------------------------------------
    console.log('--- ESCENARIO 1: Pedido público finalizado solo con nota ---');
    const solEmail = `solicitante.sec.${runId}@tdf.gob.ar`;
    const envioId = crypto.randomUUID();
    const pedidoId = crypto.randomUUID();
    const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
    const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');

    await serviceClient.from('envios_formulario').insert({
      id: envioId,
      submission_key: crypto.randomUUID(),
      request_fingerprint: fpHash,
      correo: solEmail,
      nombre_apellido: 'Solicitante Auditoría Sec',
      area_solicitante: 'Dirección General de Comunicación',
      telefono: '2901-440000',
    });

    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id, nombre').limit(1).single();

    const { data: maxNumData } = await serviceClient
      .from('pedidos')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1);
    const nextNum = (maxNumData?.[0]?.numero || 0) + 1;
    const pedCode = `PED-2026-${cat.codigo_ped}${nextNum}`;

    await serviceClient.from('pedidos').insert({
      id: pedidoId,
      envio_id: envioId,
      pedido_visible: pedCode,
      anio: 2026,
      numero: nextNum,
      codigo_categoria: cat.codigo_ped,
      categoria_id: cat.id,
      tipo_servicio_id: tipo.id,
      estado: 'Nuevo',
      origen: 'publico',
      tracking_token_hash: tokenHash,
      client_request_ref: crypto.randomUUID(),
      version: 1,
      informacion_especifica: {
        titulo: 'Campaña Informativa de Seguridad',
        publico_objetivo: 'Comunidad general',
      },
    });

    // Registrar evento de creación
    await serviceClient.from('domain_events').insert({
      event_name: 'pedido.created',
      aggregate_type: 'pedido',
      aggregate_id: pedidoId,
      payload: {
        pedido_id: pedidoId,
        origen: 'publico',
        envio_id: envioId,
        version: 1,
      },
      actor_user_id: authAdmin.user.id,
    });

    // Asignar y En proceso
    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedidoId,
      p_responsable_user_id: authAdmin.user.id,
      p_expected_version: 1,
    });
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId,
      p_target_state: 'En proceso',
      p_expected_version: 2,
    });

    // Insertar nota confidencial interna
    const secretInternalNote = `SECRETO_INTERNO_CONFIDENCIAL_${runId}`;
    await serviceClient.from('notas_pedido').insert({
      id: crypto.randomUUID(),
      pedido_id: pedidoId,
      autor_user_id: authAdmin.user.id,
      visibilidad: 'interna',
      texto: secretInternalNote,
    });

    // Insertar nota pública informativa
    await serviceClient.from('notas_pedido').insert({
      id: crypto.randomUUID(),
      pedido_id: pedidoId,
      autor_user_id: authAdmin.user.id,
      visibilidad: 'solicitante',
      texto: 'Nota visible para el solicitante',
    });

    // Solicitud de información y respuesta
    const solInfoId = crypto.randomUUID();
    await serviceClient.from('solicitudes_informacion').insert({
      id: solInfoId,
      pedido_id: pedidoId,
      mensaje: '¿Podría confirmar el lugar del acto?',
      estado: 'respondida',
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      respuesta_texto: 'Sí, en el microestadio municipal.',
      responded_at: new Date().toISOString(),
    });

    await serviceClient.from('domain_events').insert({
      event_name: 'pedido.info_requested',
      aggregate_type: 'pedido',
      aggregate_id: pedidoId,
      payload: {
        actor_id: authAdmin.user.id,
        solicitud_id: solInfoId,
        pedido_id: pedidoId,
        motivo: 'Faltaba lugar del acto',
      },
      actor_user_id: authAdmin.user.id,
    });

    await serviceClient.from('domain_events').insert({
      event_name: 'pedido.info_responded',
      aggregate_type: 'pedido',
      aggregate_id: pedidoId,
      payload: {
        solicitud_id: solInfoId,
        pedido_id: pedidoId,
      },
      actor_user_id: authAdmin.user.id,
    });

    // Finalizar pedido con nota de entrega "todo ok"
    await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoId,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'todo ok',
    });

    // Crear sesión de solicitante
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    await serviceClient.from('solicitante_sesiones').insert({
      correo: solEmail,
      session_token_hash: sessionTokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    // Invocar el RPC solicitante_get_pedido_detail
    const { data: res1, error: err1 } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: rawSessionToken,
      p_pedido_ref: pedCode,
    });

    if (err1) throw err1;

    // VALIDACIONES DEL ESCENARIO 1:
    assert(res1.success === true, 'El RPC retorna success = true');
    assert(res1.pedido.pedido_visible === pedCode, 'Retorna el código de pedido visible correcto');
    assert(res1.pedido.estado === 'Finalizado', 'El pedido está en estado Finalizado');

    // Validación estricta de entrega y nota final
    assert(res1.entrega === null, 'entrega es NULL cuando no hubo archivos ni URL (no se inventa entrega sintética)');
    assert(res1.nota_final !== null, 'nota_final está presente');
    assert(res1.nota_final.texto === 'todo ok', 'nota_final.texto contiene exactamente "todo ok"');
    assert(typeof res1.nota_final.created_at === 'string', 'nota_final.created_at es un timestamp válido');

    // Validación de notas públicas vs internas
    assert(Array.isArray(res1.notas), 'notas es un array');
    const internalLeaked = res1.notas.some(n => n.texto.includes(secretInternalNote));
    assert(!internalLeaked, 'La nota interna confidencial NO fue expuesta en notas');

    // Validación estricta de historial amigable
    assert(Array.isArray(res1.historial), 'historial es un array');
    assert(res1.historial.length >= 4, 'historial contiene los eventos esperados');

    const rawJsonStr = JSON.stringify(res1);

    // Verificar ausencia de campos técnicos prohibidos en todo el JSON
    assert(!rawJsonStr.includes('actor_id'), 'No contiene ningún campo actor_id');
    assert(!rawJsonStr.includes('actor_user_id'), 'No contiene ningún campo actor_user_id');
    assert(!rawJsonStr.includes('has_enlace'), 'No contiene ningún campo has_enlace');
    assert(!rawJsonStr.includes('was_retrabajo'), 'No contiene ningún campo was_retrabajo');
    assert(!rawJsonStr.includes('archivos_count'), 'No contiene ningún campo archivos_count');
    assert(!rawJsonStr.includes(secretInternalNote), 'No contiene el texto del secreto interno confidencial');

    // Comprobar cada elemento del historial
    for (const h of res1.historial) {
      assert(typeof h.tipo === 'string' && h.tipo.length > 0, `historial item tiene campo tipo: ${h.tipo}`);
      assert(typeof h.titulo === 'string' && h.titulo.length > 0, `historial item tiene titulo amigable: ${h.titulo}`);
      assert(typeof h.descripcion === 'string' && h.descripcion.length > 0, `historial item tiene descripcion amigable`);
      assert(typeof h.created_at === 'string', `historial item tiene created_at`);
      assert(h.detalles === undefined, 'historial item NO contiene campo detalles');
      assert(h.payload === undefined, 'historial item NO contiene campo payload');
      assert(!h.titulo.startsWith('pedido.'), `titulo no contiene prefijo técnico pedido.*: ${h.titulo}`);
    }

    // -------------------------------------------------------------
    // ESCENARIO 2: PEDIDO PÚBLICO FINALIZADO CON ENLACE EXTERNO
    // -------------------------------------------------------------
    console.log('\n--- ESCENARIO 2: Pedido público finalizado con enlace externo ---');
    const envioId2 = crypto.randomUUID();
    const pedidoId2 = crypto.randomUUID();
    const fpHash2 = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
    const tokenHash2 = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');
    const nextNum2 = nextNum + 1;
    const pedCode2 = `PED-2026-${cat.codigo_ped}${nextNum2}`;

    await serviceClient.from('envios_formulario').insert({
      id: envioId2,
      submission_key: crypto.randomUUID(),
      request_fingerprint: fpHash2,
      correo: solEmail,
      nombre_apellido: 'Solicitante Auditoría Sec 2',
      area_solicitante: 'Dirección General de Comunicación',
      telefono: '2901-440000',
    });

    await serviceClient.from('pedidos').insert({
      id: pedidoId2,
      envio_id: envioId2,
      pedido_visible: pedCode2,
      anio: 2026,
      numero: nextNum2,
      codigo_categoria: cat.codigo_ped,
      categoria_id: cat.id,
      tipo_servicio_id: tipo.id,
      estado: 'Nuevo',
      origen: 'publico',
      tracking_token_hash: tokenHash2,
      client_request_ref: crypto.randomUUID(),
      version: 1,
      informacion_especifica: { titulo: 'Campaña con Entrega Externa' },
    });

    await serviceClient.from('domain_events').insert({
      event_name: 'pedido.created',
      aggregate_type: 'pedido',
      aggregate_id: pedidoId2,
      payload: { pedido_id: pedidoId2, origen: 'publico', version: 1 },
      actor_user_id: authAdmin.user.id,
    });

    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedidoId2,
      p_responsable_user_id: authAdmin.user.id,
      p_expected_version: 1,
    });
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedidoId2,
      p_target_state: 'En proceso',
      p_expected_version: 2,
    });

    await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoId2,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/test-entrega-material',
      p_nota_entrega: 'Descarga disponible en Drive',
    });

    const { data: res2, error: err2 } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: rawSessionToken,
      p_pedido_ref: pedCode2,
    });
    if (err2) throw err2;

    assert(res2.entrega !== null, 'entrega NO es null cuando existe material externo');
    assert(res2.entrega.enlace_externo === 'https://drive.google.com/test-entrega-material', 'enlace_externo correcto');
    assert(res2.entrega.nota === 'Descarga disponible en Drive', 'entrega.nota preservada');
    assert(res2.nota_final !== null, 'nota_final está presente');
    assert(res2.nota_final.texto === 'Descarga disponible en Drive', 'nota_final.texto coincide con la nota');

    console.log('\n================================================================');
    console.log(`TOTAL PRUEBAS: ${totalTests} | PASADAS: ${passedTests} | FALLIDAS: 0`);
    console.log('SEGURIDAD SERVER-SIDE VERIFICADA CON ÉXITO EN TEST');
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ ERROR EN LA SUITE DE SEGURIDAD:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Limpiando usuarios de prueba ---');
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      } catch {}
    }
  }
}

runSecuritySuite().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
