/**
 * SUITE DE VERIFICACIÓN AUTOMATIZADA — FASE 4C
 * Tableros Privados Colaborativos
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
  console.log('SUITE DE VERIFICACIÓN — FASE 4C: TABLEROS PRIVADOS COLABORATIVOS');
  console.log(`Ambiente TEST: ${SUPABASE_URL} (runId: ${runId})`);
  console.log('================================================================\n');

  const testUsers = [];
  const createdBoards = [];

  try {
    // -------------------------------------------------------------------------
    // 0. Preparar usuarios con roles aislados
    // -------------------------------------------------------------------------
    console.log('--- 0. Preparando usuarios de prueba por rol ---');
    
    // User A (Equipo - Propietario)
    const emailA = `f4c.userA.${runId}@tdf.gob.ar`;
    const passA = `PassA!${runId}2026`;
    const unameA = `u_usera_${runId}`;
    const { data: authA, error: authAErr } = await serviceClient.auth.admin.createUser({
      email: emailA,
      password: passA,
      email_confirm: true,
      user_metadata: { nombre: 'Usuario A', apellido: 'Equipo QA', nombre_usuario: unameA },
    });
    if (authAErr) throw authAErr;
    testUsers.push(authA.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authA.user.id,
      nombre: 'Usuario A',
      apellido: 'Equipo QA',
      nombre_usuario: unameA,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const clientA = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAErr } = await clientA.auth.signInWithPassword({
      email: emailA,
      password: passA,
    });
    if (signInAErr) throw signInAErr;

    // User B (Equipo - Colaborador invitado)
    const emailB = `f4c.userB.${runId}@tdf.gob.ar`;
    const passB = `PassB!${runId}2026`;
    const unameB = `u_userb_${runId}`;
    const { data: authB, error: authBErr } = await serviceClient.auth.admin.createUser({
      email: emailB,
      password: passB,
      email_confirm: true,
      user_metadata: { nombre: 'Usuario B', apellido: 'Equipo QA', nombre_usuario: unameB },
    });
    if (authBErr) throw authBErr;
    testUsers.push(authB.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authB.user.id,
      nombre: 'Usuario B',
      apellido: 'Equipo QA',
      nombre_usuario: unameB,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const clientB = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInBErr } = await clientB.auth.signInWithPassword({
      email: emailB,
      password: passB,
    });
    if (signInBErr) throw signInBErr;

    // Admin (No invitado)
    const emailAdmin = `f4c.admin.${runId}@tdf.gob.ar`;
    const passAdmin = `PassAdmin!${runId}2026`;
    const unameAdmin = `u_admin_${runId}`;
    const { data: authAdmin, error: authAdminErr } = await serviceClient.auth.admin.createUser({
      email: emailAdmin,
      password: passAdmin,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Supervisor QA', nombre_usuario: unameAdmin },
    });
    if (authAdminErr) throw authAdminErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Supervisor QA',
      nombre_usuario: unameAdmin,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const clientAdmin = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAdminErr } = await clientAdmin.auth.signInWithPassword({
      email: emailAdmin,
      password: passAdmin,
    });
    if (signInAdminErr) throw signInAdminErr;

    // Observador
    const emailObs = `f4c.obs.${runId}@tdf.gob.ar`;
    const passObs = `PassObs!${runId}2026`;
    const unameObs = `u_obs_${runId}`;
    const { data: authObs, error: authObsErr } = await serviceClient.auth.admin.createUser({
      email: emailObs,
      password: passObs,
      email_confirm: true,
      user_metadata: { nombre: 'Observador', apellido: 'Sin Acceso QA', nombre_usuario: unameObs },
    });
    if (authObsErr) throw authObsErr;
    testUsers.push(authObs.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authObs.user.id,
      nombre: 'Observador',
      apellido: 'Sin Acceso QA',
      nombre_usuario: unameObs,
      app_role: 'observador',
      estado_acceso: 'aprobado',
    });

    const clientObs = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInObsErr } = await clientObs.auth.signInWithPassword({
      email: emailObs,
      password: passObs,
    });
    if (signInObsErr) throw signInObsErr;

    // Cliente Anónimo
    const clientAnon = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log('  ✓ Usuarios autenticados preparados con éxito (User A, User B, Admin, Observer, Anon)\n');

    // -------------------------------------------------------------------------
    // 1. Usuario A crea tablero privado
    // -------------------------------------------------------------------------
    console.log('--- 1. Usuario A crea tablero privado ---');
    const { data: createData, error: createErr } = await clientA.rpc('tablero_create', {
      p_titulo: `Campaña Prensa Verano ${runId}`,
      p_descripcion: 'Planificación de medios y coberturas',
      p_color: 'azul',
    });
    assert(!createErr, `Usuario A crea tablero exitosamente: ${createErr?.message || 'OK'}`);
    assert(createData && createData.id, 'Tablero creado tiene ID asignado');
    assert(createData?.propietario_id === authA.user.id, 'Propietario asignado a Usuario A');
    const boardId = createData.id;
    createdBoards.push(boardId);

    // Verificar que se crearon columnas por defecto
    const { data: colsA, error: colsAErr } = await clientA
      .from('tablero_columnas')
      .select('*')
      .eq('tablero_id', boardId)
      .order('orden', { ascending: true });
    assert(!colsAErr && colsA?.length === 3, `Se inicializan 3 columnas por defecto (creadas: ${colsA?.length || 0})`);
    assert(colsA?.[0]?.nombre === 'Por hacer', 'Primera columna es "Por hacer"');
    assert(colsA?.[1]?.nombre === 'En curso', 'Segunda columna es "En curso"');
    assert(colsA?.[2]?.nombre === 'Hecho', 'Tercera columna es "Hecho"');

    // -------------------------------------------------------------------------
    // 2. Usuario B no puede verlo (Privacidad por defecto)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Usuario B no puede verlo (Privacidad por defecto) ---');
    const { data: bBoards, error: bBoardsErr } = await clientB
      .from('tableros_privados')
      .select('*')
      .eq('id', boardId);
    assert(!bBoardsErr && bBoards?.length === 0, 'Usuario B NO ve el tablero privado en SELECT');

    const { data: bCols, error: bColsErr } = await clientB
      .from('tablero_columnas')
      .select('*')
      .eq('tablero_id', boardId);
    assert(!bColsErr && bCols?.length === 0, 'Usuario B NO ve las columnas del tablero privado ajeno');

    // -------------------------------------------------------------------------
    // 3. A invita a B como Solo lectura: B ve, pero no edita
    // -------------------------------------------------------------------------
    console.log('\n--- 3. A invita a B como Solo lectura (B ve, pero no edita) ---');
    const { data: inviteData, error: inviteErr } = await clientA.rpc('tablero_member_invite', {
      p_tablero_id: boardId,
      p_user_id: authB.user.id,
      p_rol_tablero: 'lectura',
    });
    assert(!inviteErr, `A invita a B con rol 'lectura': ${inviteErr?.message || 'OK'}`);
    assert(inviteData?.rol_tablero === 'lectura', 'Membresía registrada con rol "lectura"');

    // B ahora SÍ puede ver el tablero
    const { data: bBoardsAfterInvite, error: bErr2 } = await clientB
      .from('tableros_privados')
      .select('*')
      .eq('id', boardId);
    assert(!bErr2 && bBoardsAfterInvite?.length === 1, 'B ahora SÍ ve el tablero tras ser invitado');

    // B intenta editar o agregar una columna: debe ser bloqueado por RLS
    const { error: bInsertColErr } = await clientB.from('tablero_columnas').insert({
      tablero_id: boardId,
      nombre: 'Columna Ilegal de B',
      orden: 3,
    });
    assert(!!bInsertColErr, 'B con solo lectura NO puede crear columnas (bloqueado por RLS)');

    // B intenta insertar tarjeta: debe ser bloqueado por RLS
    const { error: bInsertCardErr } = await clientB.from('tablero_tarjetas').insert({
      tablero_id: boardId,
      columna_id: colsA[0].id,
      titulo: 'Tarjeta Ilegal de B',
      tipo_contenido: 'nota_rapida',
      created_by: authB.user.id,
    });
    assert(!!bInsertCardErr, 'B con solo lectura NO puede crear tarjetas (bloqueado por RLS)');

    // -------------------------------------------------------------------------
    // 4. A cambia permiso de B a Puede editar: B puede colaborar
    // -------------------------------------------------------------------------
    console.log('\n--- 4. A cambia permiso de B a Puede editar (B puede colaborar) ---');
    const { data: updateRoleData, error: updateRoleErr } = await clientA.rpc('tablero_member_update_role', {
      p_tablero_id: boardId,
      p_user_id: authB.user.id,
      p_rol_tablero: 'edicion',
    });
    assert(!updateRoleErr, `A actualiza rol de B a 'edicion': ${updateRoleErr?.message || 'OK'}`);
    assert(updateRoleData?.rol_tablero === 'edicion', 'Membresía actualizada a "edicion"');

    // Ahora B crea una tarjeta colaborativa
    const { data: cardB, error: cardBErr } = await clientB
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[0].id,
        titulo: 'Diseñar banner para portada',
        descripcion: 'Resolución 1920x1080 institucional',
        tipo_contenido: 'checklist',
        color: 'azul',
        created_by: authB.user.id,
      })
      .select()
      .single();
    assert(!cardBErr && cardB?.id, `B puede crear tarjeta en el tablero: ${cardBErr?.message || 'OK'}`);

    // B agrega un checklist colaborativo en la tarjeta
    const { data: chk1, error: chk1Err } = await clientB
      .from('tablero_tarjeta_checklists')
      .insert({
        tablero_id: boardId,
        tarjeta_id: cardB.id,
        texto: 'Ajustar isotipo oficial',
        created_by: authB.user.id,
      })
      .select()
      .single();
    assert(!chk1Err && chk1?.id, `B puede agregar ítem de checklist a la tarjeta: ${chk1Err?.message || 'OK'}`);

    // B agrega un comentario en la tarjeta
    const { data: com1, error: com1Err } = await clientB
      .from('tablero_tarjeta_comentarios')
      .insert({
        tablero_id: boardId,
        tarjeta_id: cardB.id,
        autor_id: authB.user.id,
        contenido: 'Comentario de B: Iniciando bocetos en Figma.',
      })
      .select()
      .single();
    assert(!com1Err && com1?.id, `B puede agregar comentario a la tarjeta: ${com1Err?.message || 'OK'}`);

    // B mueve la tarjeta a la segunda columna
    const { data: moveData, error: moveErr } = await clientB.rpc('tablero_tarjeta_move', {
      p_tarjeta_id: cardB.id,
      p_columna_destino_id: colsA[1].id,
      p_nuevo_orden: 0,
    });
    assert(!moveErr, `B puede mover tarjeta entre columnas (RPC move): ${moveErr?.message || 'OK'}`);
    assert(moveData?.columna_id === colsA[1].id, 'Tarjeta efectivamente movida a columna "En curso"');

    // -------------------------------------------------------------------------
    // 5. A revoca acceso: B deja de poder leer/escribir
    // -------------------------------------------------------------------------
    console.log('\n--- 5. A revoca acceso: B deja de poder leer/escribir ---');
    const { data: revokeOk, error: revokeErr } = await clientA.rpc('tablero_member_revoke', {
      p_tablero_id: boardId,
      p_user_id: authB.user.id,
    });
    assert(!revokeErr && revokeOk === true, `A revoca acceso a B: ${revokeErr?.message || 'OK'}`);

    // B ya no puede consultar el tablero
    const { data: bPostRevokeBoards } = await clientB.from('tableros_privados').select('*').eq('id', boardId);
    assert(bPostRevokeBoards?.length === 0, 'B ya no ve el tablero en SELECT tras revocación');

    // B ya no puede consultar tarjetas
    const { data: bPostRevokeCards } = await clientB.from('tablero_tarjetas').select('*').eq('tablero_id', boardId);
    assert(bPostRevokeCards?.length === 0, 'B ya no ve las tarjetas del tablero tras revocación');

    // B no puede mover tarjetas
    const { error: bPostRevokeMoveErr } = await clientB.rpc('tablero_tarjeta_move', {
      p_tarjeta_id: cardB.id,
      p_columna_destino_id: colsA[2].id,
      p_nuevo_orden: 0,
    });
    assert(!!bPostRevokeMoveErr, 'B es rechazado al intentar mover tarjeta tras revocación (FORBIDDEN)');

    // -------------------------------------------------------------------------
    // 6. Administrador no invitado ve el tablero, pero NO puede editar
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Administrador no invitado ve el tablero, pero NO puede editar ---');
    // Admin consulta tableros
    const { data: adminBoards, error: adminBoardsErr } = await clientAdmin
      .from('tableros_privados')
      .select('*')
      .eq('id', boardId);
    assert(!adminBoardsErr && adminBoards?.length === 1, 'Admin no invitado SÍ puede VER el tablero privado');

    // Admin consulta tarjetas
    const { data: adminCards, error: adminCardsErr } = await clientAdmin
      .from('tablero_tarjetas')
      .select('*')
      .eq('tablero_id', boardId);
    assert(!adminCardsErr && adminCards?.length === 1, 'Admin no invitado SÍ puede VER las tarjetas');

    // Admin intenta EDITAR una tarjeta ajena sin haber sido invitado: DEBE BLOQUEARSE
    const { data: adminUpdateRes, error: adminUpdateErr } = await clientAdmin
      .from('tablero_tarjetas')
      .update({ titulo: 'Intento de edición por admin no invitado' })
      .eq('id', cardB.id)
      .select();
    const { data: cardCheck } = await clientA.from('tablero_tarjetas').select('titulo').eq('id', cardB.id).single();
    assert(
      (!adminUpdateRes || adminUpdateRes.length === 0 || !!adminUpdateErr) && cardCheck?.titulo !== 'Intento de edición por admin no invitado',
      'Admin no invitado BLOQUEADO para modificar tarjetas ajenas (RLS estricto)'
    );

    // Admin intenta MOVER una tarjeta ajena vía RPC: DEBE BLOQUEARSE
    const { error: adminMoveErr } = await clientAdmin.rpc('tablero_tarjeta_move', {
      p_tarjeta_id: cardB.id,
      p_columna_destino_id: colsA[2].id,
      p_nuevo_orden: 0,
    });
    assert(!!adminMoveErr, 'Admin no invitado BLOQUEADO para mover tarjetas ajenas (RPC FORBIDDEN)');

    // Admin intenta ELIMINAR el tablero ajeno: DEBE BLOQUEARSE
    const { error: adminDeleteErr } = await clientAdmin.rpc('tablero_delete', {
      p_tablero_id: boardId,
    });
    assert(!!adminDeleteErr, 'Admin no invitado BLOQUEADO para eliminar tablero ajeno');

    // -------------------------------------------------------------------------
    // 7. Tarjetas: Múltiples contenidos, Drag & drop, checklist y comentarios
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Tarjetas: Múltiples contenidos, checklist y persistencia ---');
    // A crea tarjeta tipo 'enlace'
    const { data: cardEnlace, error: cardEnlaceErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[0].id,
        titulo: 'Guía de Estilo Oficial 2026',
        tipo_contenido: 'enlace',
        metadata: { url: 'https://gobierno.tdf.gob.ar/manual-marca', etiqueta: 'Manual de Marca' },
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardEnlaceErr && cardEnlace?.metadata?.url, 'Tarjeta tipo enlace creada con metadata URL');

    // A crea tarjeta tipo 'contacto'
    const { data: cardContacto, error: cardContactoErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[0].id,
        titulo: 'Vocero Institucional de Prensa',
        tipo_contenido: 'contacto',
        metadata: { nombre: 'María González', telefono: '+54 2901 556677', email: 'mgonzalez@tdf.gob.ar' },
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardContactoErr && cardContacto?.metadata?.telefono, 'Tarjeta tipo contacto creada con teléfono y email');

    // A crea tarjeta tipo 'recordatorio'
    const { data: cardRecordatorio, error: cardRecErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[1].id,
        titulo: 'Conferencia de Prensa 10:00 hs',
        tipo_contenido: 'recordatorio',
        metadata: { fecha_limite: '2026-10-25', nota_recordatorio: 'Llevar micrófonos corbateros y cables XLR' },
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardRecErr && cardRecordatorio?.metadata?.fecha_limite, 'Tarjeta tipo recordatorio creada correctamente');

    // A crea tarjeta tipo 'pedido_ref'
    // Consultar pedidos disponibles
    const { data: pedidosList, error: pedidosListErr } = await clientA.rpc('tablero_get_pedidos_reference_list', { p_search: '' });
    assert(!pedidosListErr && Array.isArray(pedidosList), 'RPC tablero_get_pedidos_reference_list responde array');
    const refPedido = pedidosList?.[0] || { id: crypto.randomUUID(), numero_identificador: 'PED-2026-TEST' };
    
    const { data: cardPedRef, error: cardPedRefErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[0].id,
        titulo: `Seguimiento de ${refPedido.numero_identificador}`,
        tipo_contenido: 'pedido_ref',
        metadata: { pedido_id: refPedido.id, numero_identificador: refPedido.numero_identificador },
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardPedRefErr && cardPedRef?.metadata?.pedido_id, 'Tarjeta tipo pedido_ref vinculada a pedido existente');

    // A crea tarjeta tipo 'documentacion'
    const { data: cardDoc, error: cardDocErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colsA[0].id,
        titulo: 'Protocolo de Cobertura en Vivo',
        tipo_contenido: 'documentacion',
        descripcion: 'Pautas para streaming en vivo en redes oficiales de la Secretaría.',
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardDocErr && cardDoc?.id, 'Tarjeta tipo documentacion creada con cuerpo descriptivo');

    // Checklist persistente: Toggle
    const { data: toggle1, error: toggle1Err } = await clientA.rpc('tablero_tarjeta_checklist_toggle', {
      p_checklist_id: chk1.id,
      p_completado: true,
    });
    assert(!toggle1Err && toggle1?.completado === true, 'Checklist toggle marca completado = true');
    assert(toggle1?.completado_por === authA.user.id, 'completado_por registra a Usuario A');
    assert(!!toggle1?.completado_at, 'completado_at registra timestamp preciso');

    // Toggle a false
    const { data: toggle2, error: toggle2Err } = await clientA.rpc('tablero_tarjeta_checklist_toggle', {
      p_checklist_id: chk1.id,
      p_completado: false,
    });
    assert(!toggle2Err && toggle2?.completado === false, 'Checklist toggle vuelve a false');
    assert(toggle2?.completado_por === null, 'completado_por vuelve a null al desmarcar');

    // Reordenar columnas en lote
    const newColOrder = [colsA[2].id, colsA[0].id, colsA[1].id];
    const { data: reorderColsOk, error: reorderColsErr } = await clientA.rpc('tablero_columnas_reorder', {
      p_tablero_id: boardId,
      p_columna_ids: newColOrder,
    });
    assert(!reorderColsErr && reorderColsOk === true, 'Reordenar columnas en lote exitoso');

    const { data: colsReordered } = await clientA
      .from('tablero_columnas')
      .select('*')
      .eq('tablero_id', boardId)
      .order('orden', { ascending: true });
    assert(colsReordered?.[0]?.id === colsA[2].id, 'Columna Hecho ahora tiene orden = 0');
    assert(colsReordered?.[1]?.id === colsA[0].id, 'Columna Por hacer ahora tiene orden = 1');
    assert(colsReordered?.[2]?.id === colsA[1].id, 'Columna En curso ahora tiene orden = 2');

    // -------------------------------------------------------------------------
    // 8. Realtime actualiza correctamente entre dos sesiones
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Realtime actualiza correctamente entre dos sesiones ---');
    // Invitar nuevamente a B con edición para prueba de Realtime
    await clientA.rpc('tablero_member_invite', {
      p_tablero_id: boardId,
      p_user_id: authB.user.id,
      p_rol_tablero: 'edicion',
    });

    let realtimeEventReceived = false;
    let receivedPayload = null;

    const channelB = clientB
      .channel(`test-board-${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tablero_tarjetas',
        },
        (payload) => {
          if (payload.new?.tablero_id === boardId) {
            realtimeEventReceived = true;
            receivedPayload = payload;
          }
        }
      );

    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 5000);
      channelB.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 400));
          await clientA.from('tablero_tarjetas').insert({
            tablero_id: boardId,
            columna_id: colsA[0].id,
            titulo: `Tarjeta Realtime Disparo ${runId}`,
            tipo_contenido: 'nota_rapida',
            created_by: authA.user.id,
          });
          // Wait up to 3 seconds for message delivery
          for (let i = 0; i < 15; i++) {
            if (realtimeEventReceived) break;
            await new Promise((r) => setTimeout(r, 200));
          }
          resolve();
        }
      });
    });

    assert(realtimeEventReceived, 'Canal Realtime recibió evento postgres_changes entre sesiones');
    assert(receivedPayload?.new?.titulo === `Tarjeta Realtime Disparo ${runId}`, 'Payload Realtime contiene datos exactos de la tarjeta');
    await clientB.removeChannel(channelB);

    // -------------------------------------------------------------------------
    // 9. Búsqueda no devuelve contenido privado ajeno
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Búsqueda no devuelve contenido privado ajeno ---');
    // Crear un tablero ultra privado de Usuario A (sin B)
    const { data: boardSecret } = await clientA.rpc('tablero_create', {
      p_titulo: `Operativo Confidencial Antártida ${runId}`,
      p_descripcion: 'Top Secret Medios',
      p_color: 'morado',
    });
    createdBoards.push(boardSecret.id);

    const { data: secretCols } = await clientA.from('tablero_columnas').select('*').eq('tablero_id', boardSecret.id);
    await clientA.from('tablero_tarjetas').insert({
      tablero_id: boardSecret.id,
      columna_id: secretCols[0].id,
      titulo: `Tarjeta Ultra Secreta ${runId}`,
      descripcion: 'Detalle clasificado no visible a terceros',
      tipo_contenido: 'nota_rapida',
      created_by: authA.user.id,
    });

    // Búsqueda ejecutada por A: encuentra la tarjeta
    const { data: searchA } = await clientA.rpc('tablero_tarjetas_search', { p_query: `Secreta ${runId}` });
    assert(searchA?.length >= 1, `Usuario A busca y encuentra su tarjeta secreta (encontrados: ${searchA?.length})`);

    // Búsqueda ejecutada por B: NO debe devolver la tarjeta de Usuario A
    const { data: searchB } = await clientB.rpc('tablero_tarjetas_search', { p_query: `Secreta ${runId}` });
    assert(searchB?.length === 0, 'Usuario B busca "Secreta" y obtiene 0 resultados (CERO fuga)');

    // -------------------------------------------------------------------------
    // 10. Bloqueo de Observador y Anónimo (PoLP)
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Bloqueo de Observador y Anónimo (PoLP) ---');
    // Observador no puede crear tableros
    const { error: obsCreateErr } = await clientObs.rpc('tablero_create', {
      p_titulo: 'Tablero Observador Ilegal',
      p_color: 'azul',
    });
    assert(!!obsCreateErr, 'Observador BLOQUEADO para crear tableros (RPC FORBIDDEN)');

    // Observador no puede consultar tableros privados
    const { data: obsBoards } = await clientObs.from('tableros_privados').select('*');
    assert(obsBoards?.length === 0, 'Observador obtiene 0 tableros en SELECT (PoLP)');

    // Observador no puede ser invitado
    const { error: obsInviteErr } = await clientA.rpc('tablero_member_invite', {
      p_tablero_id: boardId,
      p_user_id: authObs.user.id,
      p_rol_tablero: 'lectura',
    });
    assert(!!obsInviteErr, 'No se puede invitar a un usuario con rol observador a un tablero privado');

    // Anónimo bloqueado en RLS
    const { data: anonBoards } = await clientAnon.from('tableros_privados').select('*');
    assert(anonBoards === null || anonBoards?.length === 0, 'Usuario anónimo bloqueado en RLS');

    // -------------------------------------------------------------------------
    // 11. Auditoría de operaciones importantes
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Auditoría de operaciones importantes ---');
    const { data: auditLogs, error: auditErr } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('recurso_tipo', 'tablero_privado')
      .eq('recurso_id', boardId);
    assert(!auditErr && auditLogs?.length >= 3, `audit_log contiene registros del tablero (encontrados: ${auditLogs?.length || 0})`);
    const actions = auditLogs?.map(a => a.accion) || [];
    assert(actions.includes('tablero.creado'), 'audit_log contiene acción "tablero.creado"');
    assert(actions.includes('tablero.miembro_invitado'), 'audit_log contiene acción "tablero.miembro_invitado"');

    // -------------------------------------------------------------------------
    // 12. Eliminación de tablero y cascada limpia
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Eliminación de tablero y cascada limpia ---');
    const { data: delOk, error: delErr } = await clientA.rpc('tablero_delete', { p_tablero_id: boardSecret.id });
    assert(!delErr && delOk === true, 'Propietario elimina su tablero exitosamente');

    // Verificar cascada
    const { data: secretCardsPost } = await serviceClient.from('tablero_tarjetas').select('*').eq('tablero_id', boardSecret.id);
    assert(secretCardsPost?.length === 0, 'Columnas y tarjetas eliminadas en cascada');

  } catch (err) {
    console.error('Error fatal durante la ejecución de pruebas:', err);
    failedTests++;
  } finally {
    console.log('\n--- Limpiando fixtures de prueba de Fase 4C ---');
    for (const bId of createdBoards) {
      try { await serviceClient.from('tableros_privados').delete().eq('id', bId); } catch {}
    }
    for (const u of testUsers) {
      try { await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id); } catch {}
      try { await serviceClient.auth.admin.deleteUser(u.id); } catch {}
    }
    console.log('  ✓ Limpieza completada.');
  }

  console.log('\n================================================================');
  console.log(`RESUMEN FASE 4C: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS (${Math.round((passedTests / totalTests) * 100)}%)`);
  if (failedTests === 0) {
    console.log('ESTADO: TODAS LAS PRUEBAS DE FASE 4C PASARON EXITOSAMENTE (100%)');
  } else {
    console.error(`ESTADO: ${failedTests} PRUEBAS FALLARON`);
  }
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
