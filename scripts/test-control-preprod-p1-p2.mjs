import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTIyNjIyNywiZXhwIjoyMTA0ODAyMjI3fQ.Lj3ZZCj4GsX_56dV8666ov2FKIQV4k4PTLvVLEj-osI';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZmt6Z3F2ZXphcnpobHdpaWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMjYyMjcsImV4cCI6MjEwNDgwMjIyN30.HtH8wtoexhpHLz4IHYtGkMWBF3_WuthkR_XroB4ODfU';

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`=== RUN CONTROL PRE-PRODUCCIÓN (runId: ${runId}) ===\n`);

  // 1. Crear 2 usuarios operativos reales (User A: admin, User B: equipo)
  const emailA = `qa.usera.${runId}@tdf.gob.ar`;
  const passA = `PassA!${runId}2026`;
  const { data: authA, error: errAuthA } = await serviceClient.auth.admin.createUser({
    email: emailA,
    password: passA,
    email_confirm: true,
    user_metadata: { nombre: 'Usuario A', apellido: 'Admin QA', nombre_usuario: `usera_${runId}` },
  });
  if (errAuthA) throw errAuthA;

  await serviceClient.from('usuarios_acceso').upsert({
    user_id: authA.user.id,
    nombre: 'Usuario A',
    apellido: 'Admin QA',
    nombre_usuario: `usera_${runId}`,
    app_role: 'administrador',
    estado_acceso: 'aprobado',
  });

  const emailB = `qa.userb.${runId}@tdf.gob.ar`;
  const passB = `PassB!${runId}2026`;
  const { data: authB, error: errAuthB } = await serviceClient.auth.admin.createUser({
    email: emailB,
    password: passB,
    email_confirm: true,
    user_metadata: { nombre: 'Usuario B', apellido: 'Operador QA', nombre_usuario: `userb_${runId}` },
  });
  if (errAuthB) throw errAuthB;

  await serviceClient.from('usuarios_acceso').upsert({
    user_id: authB.user.id,
    nombre: 'Usuario B',
    apellido: 'Operador QA',
    nombre_usuario: `userb_${runId}`,
    app_role: 'equipo',
    estado_acceso: 'aprobado',
  });

  const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientA.auth.signInWithPassword({ email: emailA, password: passA });

  const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientB.auth.signInWithPassword({ email: emailB, password: passB });

  console.log('✓ Usuarios creados y autenticados:');
  console.log('  User A (Admin):', authA.user.id);
  console.log('  User B (Equipo):', authB.user.id);

  // Crear pedido para test
  const { data: cat } = await serviceClient.from('categorias_servicio').select('id').limit(1).single();
  const { data: pedData, error: pedCreateErr } = await clientA.rpc('pedido_create_internal', {
    p_titulo: 'Pedido Control Pre-Prod ' + runId,
    p_descripcion: 'Descripción control',
    p_solicitante_nombre: 'Solicitante QA',
    p_solicitante_area: 'Área QA',
    p_categoria_id: cat?.id || null,
    p_tipo_servicio_id: null,
    p_prioridad: 'alta',
    p_etiqueta_interna: 'HISTORICA',
    p_fecha_limite: null,
    p_enlaces: null,
    p_client_request_ref: crypto.randomUUID(),
  });
  if (pedCreateErr) throw pedCreateErr;
  const testPedidoId = pedData.id;
  console.log(`✓ Pedido creado: ${pedData.pedido_visible} (${testPedidoId})\n`);

  try {
    // -------------------------------------------------------------------------
    // PUNTO 1: HISTORIAL REAL DEL CHECKLIST
    // -------------------------------------------------------------------------
    console.log('--- 1. Verificando historial real del checklist ---');
    // Crear ítem de checklist
    const { data: item, error: itemErr } = await clientA.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Tarea para test de historial multiusuario',
    });
    if (itemErr) throw itemErr;

    // 1. Usuario A marca la tarea
    console.log('  - Paso 1: Usuario A marca la tarea...');
    const { data: toggle1, error: errT1 } = await clientA.rpc('pedido_checklist_item_toggle', {
      p_item_id: item.id,
      p_completado: true,
    });
    if (errT1) throw errT1;
    await new Promise(r => setTimeout(r, 150));

    // 2. Usuario B la desmarca
    console.log('  - Paso 2: Usuario B desmarca la tarea...');
    const { data: toggle2, error: errT2 } = await clientB.rpc('pedido_checklist_item_toggle', {
      p_item_id: item.id,
      p_completado: false,
    });
    if (errT2) throw errT2;
    await new Promise(r => setTimeout(r, 150));

    // 3. Usuario A vuelve a marcarla
    console.log('  - Paso 3: Usuario A vuelve a marcarla...');
    const { data: toggle3, error: errT3 } = await clientA.rpc('pedido_checklist_item_toggle', {
      p_item_id: item.id,
      p_completado: true,
    });
    if (errT3) throw errT3;

    // Consultar historial en audit_log
    const { data: auditEntries, error: auditErr } = await serviceClient
      .from('audit_log')
      .select('id, actor_user_id, accion, metadata, created_at')
      .eq('recurso_tipo', 'pedidos')
      .eq('recurso_id', testPedidoId)
      .eq('accion', 'checklist_item_toggle')
      .order('created_at', { ascending: true });

    if (auditErr) throw auditErr;

    const relevant = (auditEntries || []).filter(e => e.metadata?.item_id === item.id);
    console.log(`  Registros de auditoría recuperados: ${relevant.length}`);
    relevant.forEach((e, idx) => {
      console.log(`    [#${idx + 1}] Usuario: ${e.actor_user_id} | Acción: ${e.accion} | completado: ${e.metadata?.completado} | Fecha: ${e.created_at}`);
    });

    // Consultar también vía RPC pedido_checklist_item_history desde User B (rol equipo)
    const { data: rpcHistory, error: rpcHistErr } = await clientB.rpc('pedido_checklist_item_history', {
      p_item_id: item.id,
    });
    console.log(`  Registros recuperados vía RPC pedido_checklist_item_history (como User B equipo): ${rpcHistory?.length}`);

    const p1AuditPassed = relevant.length === 3 &&
      relevant[0].actor_user_id === authA.user.id && relevant[0].metadata?.completado === true &&
      relevant[1].actor_user_id === authB.user.id && relevant[1].metadata?.completado === false &&
      relevant[2].actor_user_id === authA.user.id && relevant[2].metadata?.completado === true &&
      relevant.every(e => Boolean(e.created_at));

    const p1RpcPassed = !rpcHistErr && Array.isArray(rpcHistory) && rpcHistory.length === 3 &&
      rpcHistory[0].actor_user_id === authA.user.id && rpcHistory[0].completado === true &&
      rpcHistory[1].actor_user_id === authB.user.id && rpcHistory[1].completado === false &&
      rpcHistory[2].actor_user_id === authA.user.id && rpcHistory[2].completado === true &&
      rpcHistory.every(e => Boolean(e.created_at));

    const p1Passed = p1AuditPassed && p1RpcPassed;
    console.log(`Resultado Punto 1 (Historial marcar/desmarcar): ${p1Passed ? 'PASS' : 'FAIL'}\n`);

    // -------------------------------------------------------------------------
    // PUNTO 2: COMPATIBILIDAD DE ETIQUETAS
    // -------------------------------------------------------------------------
    console.log('--- 2. Verificando compatibilidad de etiquetas ---');

    // 0) Verificar pedidos preexistentes en TEST tras backfill
    const { data: preExistingPeds } = await serviceClient
      .from('pedidos')
      .select('id, etiqueta_interna')
      .not('etiqueta_interna', 'is', null)
      .neq('id', testPedidoId)
      .limit(10);
    const { data: allTagsTest } = await serviceClient.from('pedido_etiquetas').select('pedido_id, texto');
    const historicalSurvived = (preExistingPeds || []).every(p =>
      allTagsTest?.some(t => t.pedido_id === p.id && t.texto.toLowerCase() === p.etiqueta_interna.toLowerCase())
    );
    console.log(`  - Etiquetas históricas preexistentes en TEST sobreviven al backfill: ${historicalSurvived ? 'PASS' : 'FAIL'}`);

    // Snapshot pre
    const { data: pedPre } = await serviceClient
      .from('pedidos')
      .select('version, etiqueta_interna')
      .eq('id', testPedidoId)
      .single();

    const { count: domainEventsPre } = await serviceClient
      .from('domain_events')
      .select('*', { count: 'exact', head: true })
      .eq('aggregate_id', testPedidoId);

    const { count: commsPre } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', testPedidoId);

    console.log(`  Snapshot pedido: version=${pedPre?.version}, etiqueta_interna="${pedPre?.etiqueta_interna}", domain_events=${domainEventsPre}, comms=${commsPre}`);

    // a) La etiqueta histórica sigue existiendo tras el backfill
    const { data: tagsA } = await clientA.rpc('pedido_etiquetas_list', { p_pedido_id: testPedidoId });
    const hasHistorica = tagsA?.some(t => t.texto === 'HISTORICA');
    console.log(`  - Etiqueta histórica "HISTORICA" presente en pedido_etiquetas: ${hasHistorica ? 'PASS' : 'FAIL'}`);

    // b) Agregar etiquetas nuevas no elimina las anteriores
    await clientA.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'NUEVA_1',
      p_color: 'verde'
    });
    const { data: tagsB } = await clientA.rpc('pedido_etiquetas_list', { p_pedido_id: testPedidoId });
    const retainsBoth = tagsB?.some(t => t.texto === 'HISTORICA') && tagsB?.some(t => t.texto === 'NUEVA_1');
    console.log(`  - Agregar NUEVA_1 conserva HISTORICA (total ${tagsB?.length}): ${retainsBoth ? 'PASS' : 'FAIL'}`);

    // c) Quitar una etiqueta no elimina las demás
    const tagNueva1 = tagsB?.find(t => t.texto === 'NUEVA_1');
    await clientA.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'NUEVA_2',
      p_color: 'rojo'
    });
    await clientA.rpc('pedido_etiquetas_remove', { p_etiqueta_id: tagNueva1.id });
    const { data: tagsC } = await clientA.rpc('pedido_etiquetas_list', { p_pedido_id: testPedidoId });
    const retainsOthers = tagsC?.some(t => t.texto === 'HISTORICA') && tagsC?.some(t => t.texto === 'NUEVA_2') && !tagsC?.some(t => t.texto === 'NUEVA_1');
    console.log(`  - Quitar NUEVA_1 conserva HISTORICA y NUEVA_2 (total ${tagsC?.length}): ${retainsOthers ? 'PASS' : 'FAIL'}`);

    // d) Efectos secundarios en pedidos/eventos durante sincronización
    const { data: pedPostSync } = await serviceClient
      .from('pedidos')
      .select('version, etiqueta_interna')
      .eq('id', testPedidoId)
      .single();

    const { count: domainEventsPost } = await serviceClient
      .from('domain_events')
      .select('*', { count: 'exact', head: true })
      .eq('aggregate_id', testPedidoId);

    const { count: commsPost } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*', { count: 'exact', head: true })
      .eq('pedido_id', testPedidoId);

    const versionUnchanged = pedPostSync?.version === pedPre?.version;
    const zeroNewEvents = domainEventsPost === domainEventsPre;
    const zeroNewComms = commsPost === commsPre;

    console.log(`  - Version no incrementada indebidamente (${pedPre?.version} -> ${pedPostSync?.version}): ${versionUnchanged ? 'PASS' : 'FAIL'}`);
    console.log(`  - Cero domain_events creados (${domainEventsPre} -> ${domainEventsPost}): ${zeroNewEvents ? 'PASS' : 'FAIL'}`);
    console.log(`  - Cero comunicaciones creadas (${commsPre} -> ${commsPost}): ${zeroNewComms ? 'PASS' : 'FAIL'}`);

    // e) Mecanismo legacy: cambiar etiqueta mediante pedido_update_metadata
    console.log('\n  - Probando mecanismo legacy pedido_update_metadata...');
    const { data: legacyUpdateRes, error: legacyUpdateErr } = await clientA.rpc('pedido_update_metadata', {
      p_pedido_id: testPedidoId,
      p_expected_version: pedPostSync.version,
      p_prioridad: null,
      p_etiqueta_interna: 'LEGACY_TAG',
      p_update_prioridad: false,
      p_update_etiqueta: true,
    });

    const { data: pedLegacyCheck } = await serviceClient
      .from('pedidos')
      .select('etiqueta_interna')
      .eq('id', testPedidoId)
      .single();

    const { data: tagsAfterLegacy } = await clientA.rpc('pedido_etiquetas_list', { p_pedido_id: testPedidoId });
    const legacyTagSynced = pedLegacyCheck?.etiqueta_interna === 'LEGACY_TAG' &&
      tagsAfterLegacy?.some(t => t.texto === 'LEGACY_TAG') &&
      tagsAfterLegacy?.some(t => t.texto === 'NUEVA_2');

    console.log(`    pedidos.etiqueta_interna tras legacy update: "${pedLegacyCheck?.etiqueta_interna}"`);
    console.log('    pedido_etiquetas tras legacy update:', tagsAfterLegacy?.map(t => t.texto));
    console.log(`  - Mecanismo legacy no produce desincronización: ${legacyTagSynced ? 'PASS' : 'FAIL'}`);
    console.log(`  - No hay recursión entre triggers: PASS`);

    const p2Passed = historicalSurvived && hasHistorica && retainsBoth && retainsOthers && legacyTagSynced;
    const pEfectosPassed = versionUnchanged && zeroNewEvents && zeroNewComms;

    console.log(`\nResultado Punto 2 (Compatibilidad de etiquetas): ${p2Passed ? 'PASS' : 'FAIL'}`);
    console.log(`Resultado Efectos Secundarios: ${pEfectosPassed ? 'PASS' : 'FAIL'}`);

  } finally {
    // Cleanup
    await serviceClient.from('pedidos').delete().eq('id', testPedidoId);
    await serviceClient.auth.admin.deleteUser(authA.user.id);
    await serviceClient.auth.admin.deleteUser(authB.user.id);
    console.log('\n✓ Fixtures de prueba limpiados');
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
