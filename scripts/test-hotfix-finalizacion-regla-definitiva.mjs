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
  console.log('SUITE DE VERIFICACIÓN BACKEND — REGLA DEFINITIVA DE FINALIZACIÓN');
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
    // 1. Preparar usuario administrador y operador para pruebas
    console.log('--- 1. Preparación de usuarios de prueba ---');
    const adminEmail = `fin.admin.${runId}@tdf.gob.ar`;
    const adminPass = `AdminPass!${runId}2026`;
    const adminUname = `u_admin_${runId}`;

    const { data: authAdmin, error: authErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Finalize QA', nombre_usuario: adminUname },
    });
    if (authErr) throw authErr;
    testUsers.push({ id: authAdmin.user.id, email: adminEmail });

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Finalize QA',
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
    assert(true, 'Usuario administrador autenticado para RPCs');

    // Obtener categoría y tipo válidos
    const { data: cats } = await serviceClient.from('categorias_servicio').select('id, codigo_ped').limit(1);
    const { data: tipos } = await serviceClient.from('tipos_servicio').select('id').eq('categoria_id', cats[0].id).limit(1);
    const catId = cats[0].id;
    const tipoId = tipos[0].id;

    // Helper para crear pedido público en 'En proceso'
    async function createPublicPedidoEnProceso() {
      const envioId = crypto.randomUUID();
      const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
      await serviceClient.from('envios_formulario').insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: fpHash,
        nombre_apellido: 'Solicitante Público QA',
        area_solicitante: 'Secretaría de Medios',
        correo: `solicitante.${runId}@tdf.gob.ar`,
        telefono: '2901998877',
      });

      const pedidoId = crypto.randomUUID();
      const num = Math.floor(100000 + Math.random() * 899999);
      const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');
      const { data: ped, error: pedErr } = await serviceClient.from('pedidos').insert({
        id: pedidoId,
        envio_id: envioId,
        pedido_visible: `PED-2026-${cats[0].codigo_ped}${num}`,
        anio: 2026,
        numero: num,
        codigo_categoria: cats[0].codigo_ped,
        categoria_id: catId,
        tipo_servicio_id: tipoId,
        estado: 'En proceso',
        origen: 'publico',
        responsable_user_id: authAdmin.user.id,
        tracking_token_hash: tokenHash,
        client_request_ref: crypto.randomUUID(),
        version: 1,
      }).select().single();
      if (pedErr) throw pedErr;
      return { pedido: ped, envioId };
    }

    // Helper para crear archivo verified
    async function createVerifiedArchivo(pedidoId) {
      const archId = crypto.randomUUID();
      const { data: arch, error: archErr } = await serviceClient.from('archivos').insert({
        id: archId,
        nombre_original: 'entregable_test.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        drive_file_id: `drv-${archId}`,
        contexto: 'entrega',
        estado: 'verified',
      }).select().single();
      if (archErr) throw archErr;
      await serviceClient.from('archivo_pedido').insert({ archivo_id: archId, pedido_id: pedidoId });
      return arch;
    }

    // =========================================================================
    // SECTION 15: TEST BACKEND — PÚBLICO (CASOS 1, 2, 3)
    // =========================================================================
    console.log('\n--- 2. TEST: Pedido Público sin nota -> Rechazo obligatorio ---');

    // Caso 1: 0 archivos, 0 URL, nota NULL
    const { pedido: p1 } = await createPublicPedidoEnProceso();
    const { error: err1 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p1.id,
      p_expected_version: p1.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: null,
    });
    assert(Boolean(err1), 'Público sin nota (NULL) fue RECHAZADO');
    assert(err1?.message?.includes('DELIVERY_NOTE_REQUIRED'), `Error contiene DELIVERY_NOTE_REQUIRED: ${err1?.message}`);

    // Caso 2: 0 archivos, 0 URL, nota = '' o espacios
    const { pedido: p2 } = await createPublicPedidoEnProceso();
    const { error: err2 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p2.id,
      p_expected_version: p2.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: '   ',
    });
    assert(Boolean(err2), 'Público con nota en blanco ("   ") fue RECHAZADO');
    assert(err2?.message?.includes('DELIVERY_NOTE_REQUIRED'), `Error contiene DELIVERY_NOTE_REQUIRED: ${err2?.message}`);

    // Caso 3: 0 archivos, 0 URL, nota = 'Trabajo finalizado según lo solicitado'
    console.log('\n--- 3. TEST: Pedido Público sin material pero con nota -> SUCCESS ---');
    const { pedido: p3 } = await createPublicPedidoEnProceso();
    const { count: countEntregasBefore } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', p3.id);

    const { count: countCommsBefore } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', p3.id)
      .eq('tipo_comunicacion', 'finalizado');

    const { data: res3, error: err3 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p3.id,
      p_expected_version: p3.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Trabajo finalizado según lo solicitado',
    });

    assert(!err3, `Finalización pública con nota sola exitosa: ${err3?.message}`);
    assert(res3?.success === true, 'Respuesta indica success: true');
    assert(res3?.estado === 'Finalizado', 'Respuesta indica estado: Finalizado');
    assert(res3?.version === p3.version + 1, 'Versión incrementada en +1');
    assert(res3?.entrega_id === null, 'entrega_id es NULL (sin fila en entregas_pedido)');

    // DB: Verificar que no se insertó nada en entregas_pedido
    const { count: countEntregasAfter } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', p3.id);
    assert(countEntregasBefore === countEntregasAfter, `0 filas creadas en entregas_pedido (antes: ${countEntregasBefore}, después: ${countEntregasAfter})`);

    // DB: Verificar que la nota fue persistida en notas_pedido con visibilidad solicitante
    const { data: notaGuardada } = await serviceClient
      .from('notas_pedido')
      .select('*')
      .eq('pedido_id', p3.id)
      .single();
    assert(Boolean(notaGuardada), 'Nota de entrega persistida en notas_pedido');
    assert(notaGuardada?.visibilidad === 'solicitante', `Nota tiene visibilidad "solicitante": ${notaGuardada?.visibilidad}`);
    assert(notaGuardada?.texto === 'Trabajo finalizado según lo solicitado', `Texto de la nota correcto: ${notaGuardada?.texto}`);

    // DB: Verificar domain_event y audit_log
    const { data: evFinalized } = await serviceClient
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', p3.id)
      .eq('event_name', 'pedido.finalized')
      .single();
    assert(Boolean(evFinalized), 'domain_events registra pedido.finalized');
    assert(evFinalized?.payload?.nota === 'Trabajo finalizado según lo solicitado', 'Payload de domain_events contiene la nota');

    // DB: Verificar que se generó la comunicación de finalización
    const { count: countCommsAfter } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', p3.id)
      .eq('tipo_comunicacion', 'finalizado');
    assert(countCommsAfter === countCommsBefore + 1, `Comunicación de finalizado encolada exactamente 1 vez (antes: ${countCommsBefore}, después: ${countCommsAfter})`);

    // =========================================================================
    // SECTION 16: TEST BACKEND — PÚBLICO CON MATERIAL (ARCHIVO / URL)
    // =========================================================================
    console.log('\n--- 4. TEST: Pedido Público con material exige igualmente nota ---');

    // 4.1 Archivo válido + nota vacía -> FAIL
    const { pedido: p4 } = await createPublicPedidoEnProceso();
    const arch4 = await createVerifiedArchivo(p4.id);
    const { error: err4 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p4.id,
      p_expected_version: p4.version,
      p_archivos_entrega: [arch4.id],
      p_url_entrega: null,
      p_nota_entrega: null,
    });
    assert(Boolean(err4), 'Público con archivo pero sin nota fue RECHAZADO');
    assert(err4?.message?.includes('DELIVERY_NOTE_REQUIRED'), `Error contiene DELIVERY_NOTE_REQUIRED: ${err4?.message}`);

    // 4.2 URL válida + nota vacía -> FAIL
    const { pedido: p5 } = await createPublicPedidoEnProceso();
    const { error: err5 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p5.id,
      p_expected_version: p5.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/drive/folders/test123',
      p_nota_entrega: '',
    });
    assert(Boolean(err5), 'Público con URL pero sin nota fue RECHAZADO');
    assert(err5?.message?.includes('DELIVERY_NOTE_REQUIRED'), `Error contiene DELIVERY_NOTE_REQUIRED: ${err5?.message}`);

    // 4.3 Archivo válido + nota válida -> SUCCESS (genera fila en entregas_pedido)
    const { pedido: p6 } = await createPublicPedidoEnProceso();
    const arch6 = await createVerifiedArchivo(p6.id);
    const { data: res6, error: err6 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p6.id,
      p_expected_version: p6.version,
      p_archivos_entrega: [arch6.id],
      p_url_entrega: null,
      p_nota_entrega: 'Entregable en archivo PDF adjunto',
    });
    assert(!err6, `Público con archivo + nota exitoso: ${err6?.message}`);
    assert(Boolean(res6?.entrega_id), `entrega_id generado correctamente: ${res6?.entrega_id}`);

    const { data: entregaDb6 } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('id', res6.entrega_id)
      .single();
    assert(Boolean(entregaDb6), 'Fila insertada en entregas_pedido');
    assert(entregaDb6?.nota === 'Entregable en archivo PDF adjunto', 'Nota persistida en entregas_pedido');
    assert(entregaDb6?.archivo_id === arch6.id, 'archivo_id correcto en entregas_pedido');

    // 4.4 URL válida + nota válida -> SUCCESS
    const { pedido: p7 } = await createPublicPedidoEnProceso();
    const { data: res7, error: err7 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: p7.id,
      p_expected_version: p7.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/drive/folders/carpeta-entrega-final',
      p_nota_entrega: 'Material disponible en carpeta Drive institucional',
    });
    assert(!err7, `Público con URL + nota exitoso: ${err7?.message}`);
    assert(Boolean(res7?.entrega_id), `entrega_id generado con URL: ${res7?.entrega_id}`);

    // =========================================================================
    // SECTION 17: TEST BACKEND — INTERNO FLEXIBLE
    // =========================================================================
    console.log('\n--- 5. TEST: Pedido Interno flexible (0 archivos, 0 URL, 0 nota) -> SUCCESS ---');
    const { data: createIntRes, error: createIntErr } = await adminClient.rpc('pedido_create_internal', {
      p_titulo: `Pedido Interno Test Regla Definitiva ${runId}`,
      p_client_request_ref: crypto.randomUUID(),
    });
    if (createIntErr) throw createIntErr;
    const internalPedId = createIntRes?.id;

    // Asignar y llevar a En proceso
    await adminClient.rpc('pedido_assign', {
      p_pedido_id: internalPedId,
      p_responsable_user_id: authAdmin.user.id,
      p_expected_version: 1,
    });
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: internalPedId,
      p_target_state: 'En revisión',
      p_expected_version: 2,
    });
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: internalPedId,
      p_target_state: 'En proceso',
      p_expected_version: 3,
    });

    const { count: countEntregasIntBefore } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', internalPedId);

    // Finalizar con 0 archivos, 0 URL, 0 nota
    const { data: resInt, error: errInt } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: internalPedId,
      p_expected_version: 4,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: null,
    });

    assert(!errInt, `Finalización de pedido interno vacío exitosa: ${errInt?.message}`);
    assert(resInt?.success === true, 'Respuesta interna indica success: true');
    assert(resInt?.estado === 'Finalizado', 'Respuesta interna indica estado: Finalizado');
    assert(resInt?.version === 5, 'Versión de pedido interno incrementada a 5');
    assert(resInt?.entrega_id === null, 'entrega_id es NULL');

    const { count: countEntregasIntAfter } = await serviceClient
      .from('entregas_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', internalPedId);
    assert(countEntregasIntBefore === countEntregasIntAfter, '0 filas creadas en entregas_pedido para interno');

    // =========================================================================
    // SECTION 8: TRACKING PÚBLICO — solicitante_get_pedido_detail
    // =========================================================================
    console.log('\n--- 6. TEST: Tracking Público con pedido finalizado con nota sin material ---');
    // Generar sesión de solicitante para p3
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    const { error: sessErr } = await serviceClient.from('solicitante_sesiones').insert({
      correo: `solicitante.${runId}@tdf.gob.ar`,
      session_token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    if (sessErr) throw sessErr;

    const { data: detailData, error: detailErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: rawSessionToken,
      p_pedido_ref: p3.pedido_visible,
    });

    assert(!detailErr, `solicitante_get_pedido_detail ejecutado sin error: ${detailErr?.message}`);
    assert(detailData?.success === true, 'Tracking retorna success: true');
    assert(detailData?.pedido?.estado === 'Finalizado', 'Tracking muestra estado Finalizado');
    assert(detailData?.entrega === null, 'Tracking muestra entrega === null (sin material ficticio)');
    assert(Array.isArray(detailData?.notas) && detailData?.notas?.length >= 1, 'Tracking incluye la nota de entrega');
    assert(detailData?.notas[0]?.texto === 'Trabajo finalizado según lo solicitado', `Texto de la nota en tracking correcto: ${detailData?.notas[0]?.texto}`);

    console.log('\n================================================================');
    console.log(`RESUMEN: ${testsPassed} pruebas superadas, ${testsFailed} fallidas`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ ERROR EN LA EJECUCIÓN DEL TEST SUITE:', err);
    process.exitCode = 1;
  } finally {
    console.log('--- Limpiando usuarios de prueba ---');
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      } catch {}
    }
    process.exit(process.exitCode || 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
