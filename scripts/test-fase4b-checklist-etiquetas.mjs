/**
 * SUITE DE VERIFICACIÓN AUTOMATIZADA — FASE 4B
 * Checklist interno por pedido + Etiquetas múltiples con colores + Título Kanban + No bloqueo
 * 
 * Ambiente: Supabase TEST (yqfkzgqvezarzhlwiilo)
 */

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

const { serviceKey, anonKey } = getApiKeys();
const serviceClient = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function main() {
  const runId = crypto.randomBytes(4).toString('hex');
  console.log('================================================================');
  console.log('SUITE DE VERIFICACIÓN — FASE 4B: CHECKLIST Y ETIQUETAS MÚLTIPLES');
  console.log(`Ambiente TEST: ${SUPABASE_URL} (runId: ${runId})`);
  console.log('================================================================\n');

  const testUsers = [];
  const createdPedidos = [];

  try {
    // -------------------------------------------------------------------------
    // 0. Preparar usuarios con roles aislados
    // -------------------------------------------------------------------------
    console.log('--- 0. Preparando usuarios de prueba por rol ---');
    // Admin
    const adminEmail = `f4b.admin.${runId}@tdf.gob.ar`;
    const adminPass = `AdminPass!${runId}2026`;
    const adminUname = `u_admin_${runId}`;
    const { data: authAdmin, error: authAdminErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Fase4B QA', nombre_usuario: adminUname },
    });
    if (authAdminErr) throw authAdminErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Fase4B QA',
      nombre_usuario: adminUname,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const clientAdmin = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAdminErr } = await clientAdmin.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass,
    });
    if (signInAdminErr) throw signInAdminErr;

    // Team / Operador
    const teamEmail = `f4b.team.${runId}@tdf.gob.ar`;
    const teamPass = `TeamPass!${runId}2026`;
    const teamUname = `u_team_${runId}`;
    const { data: authTeam, error: authTeamErr } = await serviceClient.auth.admin.createUser({
      email: teamEmail,
      password: teamPass,
      email_confirm: true,
      user_metadata: { nombre: 'Operador', apellido: 'Fase4B QA', nombre_usuario: teamUname },
    });
    if (authTeamErr) throw authTeamErr;
    testUsers.push(authTeam.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authTeam.user.id,
      nombre: 'Operador',
      apellido: 'Fase4B QA',
      nombre_usuario: teamUname,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const clientTeam = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInTeamErr } = await clientTeam.auth.signInWithPassword({
      email: teamEmail,
      password: teamPass,
    });
    if (signInTeamErr) throw signInTeamErr;

    // Observador
    const obsEmail = `f4b.obs.${runId}@tdf.gob.ar`;
    const obsPass = `ObsPass!${runId}2026`;
    const obsUname = `u_obs_${runId}`;
    const { data: authObs, error: authObsErr } = await serviceClient.auth.admin.createUser({
      email: obsEmail,
      password: obsPass,
      email_confirm: true,
      user_metadata: { nombre: 'Observador', apellido: 'Fase4B QA', nombre_usuario: obsUname },
    });
    if (authObsErr) throw authObsErr;
    testUsers.push(authObs.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authObs.user.id,
      nombre: 'Observador',
      apellido: 'Fase4B QA',
      nombre_usuario: obsUname,
      app_role: 'observador',
      estado_acceso: 'aprobado',
    });

    const clientObserver = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInObsErr } = await clientObserver.auth.signInWithPassword({
      email: obsEmail,
      password: obsPass,
    });
    if (signInObsErr) throw signInObsErr;

    // Anon Client
    const clientAnon = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log('  ✓ Usuarios y clientes autenticados listos: Admin, Team, Observer, Anon\n');

    // -------------------------------------------------------------------------
    // 1. Crear Pedido de prueba
    // -------------------------------------------------------------------------
    console.log('--- 1. Creación de pedido de prueba para Fase 4B ---');
    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id, nombre').eq('categoria_id', cat.id).limit(1).single();

    const { data: createData, error: createErr } = await clientAdmin.rpc('pedido_create_internal', {
      p_titulo: 'Campaña Sanitaria Provincial 2026',
      p_descripcion: 'Pedido para verificación automatizada integral de Fase 4B',
      p_solicitante_nombre: 'Ministerio de Salud',
      p_solicitante_area: 'Epidemiología',
      p_categoria_id: cat?.id || null,
      p_tipo_servicio_id: tipo?.id || null,
      p_prioridad: 'alta',
      p_etiqueta_interna: null,
      p_fecha_limite: null,
      p_enlaces: null,
      p_client_request_ref: crypto.randomUUID(),
    });
    if (createErr) console.error('  createErr details:', createErr);

    assert(!createErr && createData?.id, `Pedido creado exitosamente (${createData?.pedido_visible})`);
    const testPedidoId = createData?.id;
    if (testPedidoId) createdPedidos.push(testPedidoId);

    // Asignar responsable equipo
    await serviceClient
      .from('pedidos')
      .update({ responsable_user_id: authTeam.user.id })
      .eq('id', testPedidoId);

    // -------------------------------------------------------------------------
    // 2. CHECKLIST: Creación de tareas
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Checklist: Crear tareas personalizadas ---');
    // Admin crea t1
    const { data: t1, error: t1Err } = await clientAdmin.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Revisar paleta cromática sanitaria',
    });
    assert(!t1Err && t1?.id, 'Admin puede crear ítem de checklist');
    assert(t1?.texto === 'Revisar paleta cromática sanitaria', 'Texto de tarea 1 guardado correctamente');
    assert(t1?.completado === false, 'Tarea 1 inicia con completado = false');
    assert(t1?.orden === 0, 'Tarea 1 asignada con orden = 0');
    assert(t1?.created_by === authAdmin.user.id, 'created_by registrado con ID del admin');

    // Team crea t2
    const { data: t2, error: t2Err } = await clientTeam.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Adaptar formatos a historias de Instagram (9:16)',
    });
    assert(!t2Err && t2?.id, 'Operador/Equipo puede crear ítem de checklist');
    assert(t2?.orden === 1, 'Tarea 2 asignada con orden = 1');
    assert(t2?.created_by === authTeam.user.id, 'created_by registrado con ID del team');

    // Team crea t3
    const { data: t3, error: t3Err } = await clientTeam.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Enviar prueba de impresión en plotter',
    });
    assert(!t3Err && t3?.id, 'Tarea 3 creada exitosamente');
    assert(t3?.orden === 2, 'Tarea 3 asignada con orden = 2');

    // Rechazo de texto vacío
    const { error: emptyErr } = await clientAdmin.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: '   ',
    });
    assert(Boolean(emptyErr), 'Crear ítem con texto vacío o en blanco es rechazado');

    // -------------------------------------------------------------------------
    // 3. CHECKLIST: Marcar y desmarcar (Toggle) con auditoría
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Checklist: Marcar y desmarcar (Toggle) con auditoría ---');
    // Team completa t1
    const { data: toggle1, error: toggle1Err } = await clientTeam.rpc('pedido_checklist_item_toggle', {
      p_item_id: t1.id,
      p_completado: true,
    });
    assert(!toggle1Err && toggle1?.completado === true, 'Team puede marcar ítem como completado');
    assert(toggle1?.completado_por === authTeam.user.id, 'completado_por registra al usuario del equipo');
    assert(Boolean(toggle1?.completado_at), 'completado_at registra timestamp preciso');

    // Team desmarca t1
    const { data: toggle1Off, error: toggle1OffErr } = await clientTeam.rpc('pedido_checklist_item_toggle', {
      p_item_id: t1.id,
      p_completado: false,
    });
    assert(!toggle1OffErr && toggle1Off?.completado === false, 'Team puede desmarcar ítem');
    assert(toggle1Off?.completado_por === null, 'Al desmarcar, completado_por vuelve a NULL');
    assert(toggle1Off?.completado_at === null, 'Al desmarcar, completado_at vuelve a NULL');

    // Admin completa t2
    const { data: toggle2, error: toggle2Err } = await clientAdmin.rpc('pedido_checklist_item_toggle', {
      p_item_id: t2.id,
      p_completado: true,
    });
    assert(!toggle2Err && toggle2?.completado === true, 'Admin marca ítem 2 como completado');
    assert(toggle2?.completado_por === authAdmin.user.id, 'completado_por registra al Admin');

    // -------------------------------------------------------------------------
    // 4. CHECKLIST: Editar y eliminar tareas
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Checklist: Editar y Eliminar ítems ---');
    // Team edita t1
    const { data: edit1, error: edit1Err } = await clientTeam.rpc('pedido_checklist_item_update', {
      p_item_id: t1.id,
      p_texto: 'Revisar paleta cromática sanitaria v2 (Aprobada)',
    });
    assert(!edit1Err && edit1?.texto === 'Revisar paleta cromática sanitaria v2 (Aprobada)', 'Team puede editar texto de la tarea');

    // Admin crea ítem temporal y lo elimina
    const { data: tempItem } = await clientAdmin.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Tarea descartable',
    });
    const { data: delRes, error: delErr } = await clientAdmin.rpc('pedido_checklist_item_delete', {
      p_item_id: tempItem.id,
    });
    assert(!delErr && delRes === true, 'Admin puede eliminar ítem de checklist');

    const { data: listAfterDel } = await clientAdmin.rpc('pedido_checklist_list', {
      p_pedido_id: testPedidoId,
    });
    assert(!listAfterDel.some((i) => i.id === tempItem.id), 'Ítem eliminado ya no figura en el checklist');
    assert(listAfterDel.length === 3, 'Permanecen exactamente 3 ítems válidos');

    // -------------------------------------------------------------------------
    // 5. CHECKLIST: Reordenamiento
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Checklist: Reordenar ítems ---');
    // Actuales: t1 (orden 0), t2 (orden 1), t3 (orden 2)
    // Reordenamos: [t3.id, t1.id, t2.id]
    const { data: reorderRes, error: reorderErr } = await clientAdmin.rpc('pedido_checklist_reorder', {
      p_pedido_id: testPedidoId,
      p_item_ids: [t3.id, t1.id, t2.id],
    });
    assert(!reorderErr && reorderRes === true, 'Admin puede reordenar ítems');

    const { data: listReordered } = await clientAdmin.rpc('pedido_checklist_list', {
      p_pedido_id: testPedidoId,
    });
    assert(listReordered[0].id === t3.id && listReordered[0].orden === 0, 't3 ahora tiene orden = 0');
    assert(listReordered[1].id === t1.id && listReordered[1].orden === 1, 't1 ahora tiene orden = 1');
    assert(listReordered[2].id === t2.id && listReordered[2].orden === 2, 't2 ahora tiene orden = 2');

    // -------------------------------------------------------------------------
    // 6. CHECKLIST: Permisos PoLP (Observador y Anon bloqueados)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Checklist: Permisos y PoLP (Observador y Anon bloqueados) ---');
    const { error: obsCreateErr } = await clientObserver.rpc('pedido_checklist_item_create', {
      p_pedido_id: testPedidoId,
      p_texto: 'Tarea Observador Bloqueada',
    });
    assert(Boolean(obsCreateErr), 'Observador BLOQUEADO para crear ítems (FORBIDDEN)');

    const { error: obsToggleErr } = await clientObserver.rpc('pedido_checklist_item_toggle', {
      p_item_id: t1.id,
      p_completado: true,
    });
    assert(Boolean(obsToggleErr), 'Observador BLOQUEADO para togglear ítems (FORBIDDEN)');

    const { error: obsDelErr } = await clientObserver.rpc('pedido_checklist_item_delete', {
      p_item_id: t1.id,
    });
    assert(Boolean(obsDelErr), 'Observador BLOQUEADO para eliminar ítems (FORBIDDEN)');

    const { error: obsReorderErr } = await clientObserver.rpc('pedido_checklist_reorder', {
      p_pedido_id: testPedidoId,
      p_item_ids: [t1.id, t2.id, t3.id],
    });
    assert(Boolean(obsReorderErr), 'Observador BLOQUEADO para reordenar ítems (FORBIDDEN)');

    // Observador SÍ puede ver
    const { data: obsList, error: obsListErr } = await clientObserver.rpc('pedido_checklist_list', {
      p_pedido_id: testPedidoId,
    });
    assert(!obsListErr && Array.isArray(obsList) && obsList.length === 3, 'Observador SÍ puede consultar el checklist (solo lectura)');

    // Anon bloqueado por RLS directo
    const { data: anonChecklist, error: anonChecklistErr } = await clientAnon
      .from('pedido_checklist_items')
      .select('*')
      .eq('pedido_id', testPedidoId);
    assert(anonChecklistErr || !anonChecklist || anonChecklist.length === 0, 'Anon / Solicitante bloqueado por RLS en pedido_checklist_items');

    // -------------------------------------------------------------------------
    // 7. ETIQUETAS MÚLTIPLES: Agregar y colores de la paleta
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Etiquetas múltiples: Agregar y colores válidos ---');
    // Admin agrega URGENTE (rojo)
    const { data: e1, error: e1Err } = await clientAdmin.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'URGENTE',
      p_color: 'rojo',
    });
    assert(!e1Err && e1?.id, 'Admin puede agregar etiqueta con color rojo');
    assert(e1?.texto === 'URGENTE', 'Texto es URGENTE');
    assert(e1?.color === 'rojo', 'Color es rojo');

    // Team agrega WEB (azul)
    const { data: e2, error: e2Err } = await clientTeam.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'WEB',
      p_color: 'azul',
    });
    assert(!e2Err && e2?.id, 'Team puede agregar etiqueta con color azul');

    // Team agrega PRENSA (verde)
    const { data: e3, error: e3Err } = await clientTeam.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'PRENSA',
      p_color: 'verde',
    });
    assert(!e3Err && e3?.id, 'Team puede agregar etiqueta con color verde');

    // Team agrega REDES (ambar)
    const { data: e4, error: e4Err } = await clientTeam.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'REDES',
      p_color: 'ambar',
    });
    assert(!e4Err && e4?.id, 'Team puede agregar 4ta etiqueta (color ambar)');

    // -------------------------------------------------------------------------
    // 8. ETIQUETAS: Validación de colores y duplicados
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Etiquetas: Validación de colores y duplicados ---');
    const { data: fallbackTag, error: fallbackTagErr } = await clientAdmin.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'TEST_FALLBACK',
      p_color: 'color_invalido',
    });
    assert(!fallbackTagErr && fallbackTag?.color === 'azul', 'Color fuera de la paleta de 8 colores hace fallback seguro a "azul"');
    // Eliminar la etiqueta de prueba de fallback
    await clientAdmin.rpc('pedido_etiquetas_remove', { p_etiqueta_id: fallbackTag.id });

    const { error: dupErr } = await clientAdmin.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: '  urgente  ',
      p_color: 'morado',
    });
    assert(Boolean(dupErr), 'Etiqueta duplicada (case-insensitive & trimmed) es rechazada');

    // -------------------------------------------------------------------------
    // 9. ETIQUETAS: Sincronización automática de etiqueta_interna histórica
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Etiquetas: Sincronización automática de pedidos.etiqueta_interna ---');
    const { data: pedTag1 } = await serviceClient
      .from('pedidos')
      .select('etiqueta_interna')
      .eq('id', testPedidoId)
      .single();
    assert(pedTag1?.etiqueta_interna === 'URGENTE', `pedidos.etiqueta_interna sincronizada con primera etiqueta: "${pedTag1?.etiqueta_interna}"`);

    // -------------------------------------------------------------------------
    // 10. ETIQUETAS: Eliminar y resincronización
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Etiquetas: Eliminar etiqueta y resincronización ---');
    const { data: remRes, error: remErr } = await clientAdmin.rpc('pedido_etiquetas_remove', {
      p_etiqueta_id: e1.id,
    });
    assert(!remErr && remRes === true, 'Admin puede eliminar etiqueta');

    const { data: pedTag2 } = await serviceClient
      .from('pedidos')
      .select('etiqueta_interna')
      .eq('id', testPedidoId)
      .single();
    assert(pedTag2?.etiqueta_interna === 'WEB', `Al eliminar URGENTE, etiqueta_interna se actualizó a la siguiente vigente: "${pedTag2?.etiqueta_interna}"`);

    // -------------------------------------------------------------------------
    // 11. ETIQUETAS: Reemplazo atómico vía pedido_etiquetas_set
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Etiquetas: Reemplazo atómico vía pedido_etiquetas_set ---');
    const { data: setRes, error: setErr } = await clientAdmin.rpc('pedido_etiquetas_set', {
      p_pedido_id: testPedidoId,
      p_etiquetas: [
        { texto: 'AUDIOVISUAL', color: 'morado' },
        { texto: 'VIP', color: 'rojo' },
      ],
    });
    if (setErr) console.error('  setErr details:', setErr);
    assert(!setErr && Array.isArray(setRes) && setRes.length === 2, 'pedido_etiquetas_set ejecuta reemplazo atómico y retorna 2 etiquetas');

    const { data: currentTags, error: curTagsErr } = await clientAdmin.rpc('pedido_etiquetas_list', {
      p_pedido_id: testPedidoId,
    });
    if (curTagsErr) console.error('  curTagsErr details:', curTagsErr);
    assert(currentTags?.length === 2, 'Existen exactamente 2 etiquetas tras reemplazo');
    assert(currentTags?.some((e) => e.texto === 'AUDIOVISUAL' && e.color === 'morado'), 'Contiene AUDIOVISUAL (morado)');
    assert(currentTags?.some((e) => e.texto === 'VIP' && e.color === 'rojo'), 'Contiene VIP (rojo)');

    const { data: pedTag3 } = await serviceClient
      .from('pedidos')
      .select('etiqueta_interna')
      .eq('id', testPedidoId)
      .single();
    assert(pedTag3?.etiqueta_interna === 'AUDIOVISUAL', `pedidos.etiqueta_interna sincronizada a "${pedTag3?.etiqueta_interna}"`);

    // -------------------------------------------------------------------------
    // 12. ETIQUETAS: Permisos PoLP (Observador y Anon)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Etiquetas: Permisos PoLP (Observador y Anon) ---');
    const { error: obsAddTagErr } = await clientObserver.rpc('pedido_etiquetas_add', {
      p_pedido_id: testPedidoId,
      p_texto: 'OBS_NO_PERMITIDO',
      p_color: 'azul',
    });
    assert(Boolean(obsAddTagErr), 'Observador BLOQUEADO para agregar etiquetas (FORBIDDEN)');

    const { error: obsSetTagErr } = await clientObserver.rpc('pedido_etiquetas_set', {
      p_pedido_id: testPedidoId,
      p_etiquetas: [{ texto: 'HACK', color: 'azul' }],
    });
    assert(Boolean(obsSetTagErr), 'Observador BLOQUEADO para pedido_etiquetas_set (FORBIDDEN)');

    // Observador SÍ puede ver
    const { data: obsTagsList, error: obsTagsErr } = await clientObserver.rpc('pedido_etiquetas_list', {
      p_pedido_id: testPedidoId,
    });
    if (obsTagsErr) console.error('  obsTagsErr details:', obsTagsErr);
    assert(!obsTagsErr && Array.isArray(obsTagsList) && obsTagsList.length === 2, 'Observador SÍ puede consultar etiquetas');

    // Anon bloqueado por RLS
    const { data: anonTags, error: anonTagsErr } = await clientAnon
      .from('pedido_etiquetas')
      .select('*')
      .eq('pedido_id', testPedidoId);
    assert(anonTagsErr || !anonTags || anonTags.length === 0, 'Anon / Solicitante bloqueado por RLS en pedido_etiquetas');

    // -------------------------------------------------------------------------
    // 13. INVARIANTE CRÍTICO: Tareas incompletas NO bloquean transiciones ni finalización
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Invariante: Tareas incompletas NO bloquean cambios de estado ni finalización ---');
    const { data: checkPending } = await clientAdmin.rpc('pedido_checklist_list', {
      p_pedido_id: testPedidoId,
    });
    const pendingCount = checkPending.filter((i) => !i.completado).length;
    assert(pendingCount > 0, `El pedido tiene ${pendingCount} tareas de checklist incompletas`);

    // Transición a En proceso
    const { error: transitErr } = await serviceClient
      .from('pedidos')
      .update({ estado: 'En proceso' })
      .eq('id', testPedidoId);
    assert(!transitErr, 'Transición a "En proceso" exitosa a pesar de tareas pendientes');

    // Obtener versión actual del pedido para concurrencia optimista de finalización
    const { data: curPed } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', testPedidoId)
      .single();

    // Finalización canónica
    const { data: finRes, error: finErr } = await clientAdmin.rpc('pedido_finalize', {
      p_pedido_id: testPedidoId,
      p_expected_version: curPed.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Cierre con tareas pendientes no bloqueantes verificado',
    });
    if (finErr) console.error('  finErr details:', finErr);
    assert(!finErr && finRes?.success === true, 'Finalización exitosa a pesar de tareas de checklist pendientes');

    const { data: finalizedPed } = await serviceClient
      .from('pedidos')
      .select('estado')
      .eq('id', testPedidoId)
      .single();
    assert(finalizedPed?.estado === 'Finalizado', 'El pedido alcanzó estado Finalizado sin impedimentos');

    // -------------------------------------------------------------------------
    // 14. TÍTULOS EN TARJETAS KANBAN (Lógica de Fallback)
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Tarjetas Kanban: Lógica de Título y Fallbacks ---');
    // Función auxiliar idéntica a kanbanCardUtils.ts
    function getCardTitle(ped) {
      if (ped.titulo && ped.titulo.trim().length > 0) return ped.titulo.trim();
      const infoTitle = ped.informacion_especifica?.titulo;
      if (infoTitle && typeof infoTitle === 'string' && infoTitle.trim().length > 0) return infoTitle.trim();
      if (ped.categoria_nombre && ped.tipo_nombre) return `${ped.categoria_nombre} · ${ped.tipo_nombre}`;
      if (ped.categoria_nombre) return ped.categoria_nombre;
      if (ped.tipo_nombre) return ped.tipo_nombre;
      return ped.origen === 'interno' ? 'Pedido interno' : 'Solicitud de servicio';
    }

    assert(
      getCardTitle({ titulo: 'Flyer para Redes Sociales' }) === 'Flyer para Redes Sociales',
      'Título explícito ped.titulo tiene máxima precedencia'
    );
    assert(
      getCardTitle({ titulo: null, informacion_especifica: { titulo: 'Flyer desde Info Específica' } }) === 'Flyer desde Info Específica',
      'Título en informacion_especifica.titulo tomado cuando no hay ped.titulo'
    );
    assert(
      getCardTitle({ titulo: null, categoria_nombre: 'Diseño Gráfico', tipo_nombre: 'Flyer' }) === 'Diseño Gráfico · Flyer',
      'Fallback a "Categoría · Tipo" cuando no hay título directo'
    );
    assert(
      getCardTitle({ titulo: null, categoria_nombre: 'Prensa', tipo_nombre: null }) === 'Prensa',
      'Fallback a "Categoría" cuando no hay tipo'
    );
    assert(
      getCardTitle({ titulo: null, origen: 'interno' }) === 'Pedido interno',
      'Fallback a "Pedido interno" para pedidos internos sin categoría'
    );
    assert(
      getCardTitle({ titulo: null, origen: 'publico' }) === 'Solicitud de servicio',
      'Fallback a "Solicitud de servicio" para pedidos públicos sin categoría'
    );

    // =========================================================================
    // RESUMEN FINAL
    // =========================================================================
    console.log('\n================================================================');
    console.log(`RESUMEN FASE 4B: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS (${Math.round((passedTests/totalTests)*100)}%)`);
    if (failedTests === 0) {
      console.log('ESTADO: TODAS LAS PRUEBAS DE FASE 4B PASARON EXITOSAMENTE (100%)');
    } else {
      console.error(`ESTADO: ${failedTests} PRUEBAS FALLARON`);
    }
    console.log('================================================================');

  } catch (err) {
    console.error('\nERROR INESPERADO EN LA SUITE:', err);
    failedTests++;
  } finally {
    console.log('\n--- Limpiando fixtures de prueba de Fase 4B ---');
    for (const pedId of createdPedidos) {
      try {
        await serviceClient.from('pedido_checklist_items').delete().eq('pedido_id', pedId);
        await serviceClient.from('pedido_etiquetas').delete().eq('pedido_id', pedId);
        await serviceClient.from('pedido_versiones').delete().eq('pedido_id', pedId);
        await serviceClient.from('pedidos').delete().eq('id', pedId);
      } catch (e) {
        console.error('Error al limpiar pedido:', e.message);
      }
    }
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      } catch (e) {
        console.error('Error al limpiar usuario:', e.message);
      }
    }
    console.log('  ✓ Limpieza completada.');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
