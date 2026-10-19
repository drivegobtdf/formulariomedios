/**
 * Test de Verificación en TEST — HOTFIX TABLEROS PRIVADOS
 * Valida que las consultas de tablerosApi.ts no generen el error:
 * "Could not find a relationship between 'tableros_privados' and 'usuarios_acceso' in the schema cache"
 * 
 * Entorno: Supabase TEST (yqfkzgqvezarzhlwiilo)
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function getApiKeys() {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'npx.cmd' : 'npx';
  const out = execSync(`${cmd} supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
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

// Emulador idéntico de las funciones corregidas de tablerosApi.ts ejecutadas contra cliente autenticado
async function clientFetchTableros(supabase, user, isAdmin) {
  const { data: boards, error } = await supabase
    .from('tableros_privados')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error al cargar tableros privados:', error);
    throw error;
  }
  if (!boards || boards.length === 0) return [];

  const { data: miembros } = await supabase
    .from('tablero_miembros')
    .select('tablero_id, rol_tablero')
    .eq('user_id', user.id);

  const miembroMap = new Map();
  miembros?.forEach((m) => miembroMap.set(m.tablero_id, m.rol_tablero));

  const ownerIds = Array.from(new Set(boards.map((b) => b.propietario_id).filter(Boolean)));
  const ownerMap = new Map();

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('usuarios_acceso')
      .select('user_id, nombre, apellido, nombre_usuario')
      .in('user_id', ownerIds);

    owners?.forEach((o) => {
      ownerMap.set(o.user_id, {
        nombre: o.nombre,
        apellido: o.apellido,
        nombre_usuario: o.nombre_usuario,
      });
    });
  }

  return boards.map((b) => {
    let miRol = 'lectura';
    if (b.propietario_id === user.id) {
      miRol = 'propietario';
    } else if (miembroMap.has(b.id)) {
      miRol = miembroMap.get(b.id);
    } else if (isAdmin) {
      miRol = 'admin_global';
    }

    return {
      ...b,
      propietario: ownerMap.get(b.propietario_id) || undefined,
      mi_rol: miRol,
    };
  });
}

async function clientFetchTableroDetail(supabase, user, tableroId) {
  const [boardRes, miembrosRes, colsRes, cardsRes] = await Promise.all([
    supabase
      .from('tableros_privados')
      .select('*')
      .eq('id', tableroId)
      .single(),
    supabase
      .from('tablero_miembros')
      .select('*')
      .eq('tablero_id', tableroId),
    supabase
      .from('tablero_columnas')
      .select('*')
      .eq('tablero_id', tableroId)
      .order('orden', { ascending: true }),
    supabase
      .from('tablero_tarjetas')
      .select(`
        *,
        checklists:tablero_tarjeta_checklists(*),
        comentarios:tablero_tarjeta_comentarios(*)
      `)
      .eq('tablero_id', tableroId)
      .order('orden', { ascending: true }),
  ]);

  if (boardRes.error) throw boardRes.error;
  if (miembrosRes.error) throw miembrosRes.error;
  if (colsRes.error) throw colsRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const board = boardRes.data;
  const rawMiembros = miembrosRes.data || [];
  const columnas = colsRes.data || [];
  const rawCards = cardsRes.data || [];

  const userIds = new Set();
  if (board.propietario_id) userIds.add(board.propietario_id);
  rawMiembros.forEach((m) => {
    if (m.user_id) userIds.add(m.user_id);
  });
  rawCards.forEach((c) => {
    (c.comentarios || []).forEach((com) => {
      if (com.autor_id) userIds.add(com.autor_id);
    });
  });

  const userIdsArray = Array.from(userIds);
  const userProfileMap = new Map();

  if (userIdsArray.length > 0) {
    const { data: profiles } = await supabase
      .from('usuarios_acceso')
      .select('user_id, nombre, apellido, nombre_usuario, app_role')
      .in('user_id', userIdsArray);

    profiles?.forEach((p) => userProfileMap.set(p.user_id, p));
  }

  const propietarioData = userProfileMap.get(board.propietario_id);
  if (propietarioData) {
    board.propietario = {
      nombre: propietarioData.nombre,
      apellido: propietarioData.apellido,
      nombre_usuario: propietarioData.nombre_usuario,
    };
  }

  const miembros = rawMiembros.map((m) => {
    const u = userProfileMap.get(m.user_id);
    return {
      ...m,
      usuario: u
        ? {
            nombre: u.nombre,
            apellido: u.apellido,
            nombre_usuario: u.nombre_usuario,
            app_role: u.app_role || '',
          }
        : undefined,
    };
  });

  const tarjetas = rawCards.map((card) => ({
    ...card,
    checklists: (card.checklists || []).sort((a, b) => a.orden - b.orden),
    comentarios: (card.comentarios || [])
      .map((com) => {
        const autorData = userProfileMap.get(com.autor_id);
        return {
          ...com,
          autor: autorData
            ? {
                nombre: autorData.nombre,
                apellido: autorData.apellido,
                nombre_usuario: autorData.nombre_usuario,
              }
            : undefined,
        };
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  }));

  let canEdit = false;
  let isOwner = false;
  if (user) {
    if (board.propietario_id === user.id) {
      canEdit = true;
      isOwner = true;
    } else {
      const miembro = miembros.find((m) => m.user_id === user.id);
      if (miembro && miembro.rol_tablero === 'edicion') {
        canEdit = true;
      }
    }
  }

  return {
    board,
    miembros,
    columnas,
    tarjetas,
    canEdit,
    isOwner,
  };
}

async function clientAddComentario(supabase, user, tableroId, tarjetaId, contenido) {
  const { data, error } = await supabase
    .from('tablero_tarjeta_comentarios')
    .insert({
      tablero_id: tableroId,
      tarjeta_id: tarjetaId,
      autor_id: user.id,
      contenido: contenido.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;

  let autorInfo = undefined;
  if (data?.autor_id) {
    const { data: u } = await supabase
      .from('usuarios_acceso')
      .select('nombre, apellido, nombre_usuario')
      .eq('user_id', data.autor_id)
      .maybeSingle();
    if (u) {
      autorInfo = {
        nombre: u.nombre,
        apellido: u.apellido,
        nombre_usuario: u.nombre_usuario,
      };
    }
  }

  return {
    ...data,
    autor: autorInfo,
  };
}

async function runHotfixTest() {
  const runId = crypto.randomBytes(4).toString('hex');
  console.log('================================================================');
  console.log('HOTFIX TEST — TABLEROS PRIVADOS (SUPABASE TEST)');
  console.log(`URL: ${SUPABASE_URL} (runId: ${runId})`);
  console.log('================================================================\n');

  const testUsers = [];
  const createdBoardIds = [];

  try {
    // 1. Crear usuarios de prueba User A y User B (rol equipo)
    console.log('--- 1. Preparando usuarios de prueba en TEST ---');
    const emailA = `hotfix.userA.${runId}@tdf.gob.ar`;
    const passA = `PassA!${runId}2026`;
    const unameA = `u_hotfix_a_${runId}`;
    const { data: authA, error: authAErr } = await serviceClient.auth.admin.createUser({
      email: emailA,
      password: passA,
      email_confirm: true,
      user_metadata: { nombre: 'Pablo', apellido: 'Hotfix', nombre_usuario: unameA },
    });
    if (authAErr) throw authAErr;
    testUsers.push(authA.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authA.user.id,
      nombre: 'Pablo',
      apellido: 'Hotfix',
      nombre_usuario: unameA,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const clientA = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAErr } = await clientA.auth.signInWithPassword({ email: emailA, password: passA });
    if (signInAErr) throw signInAErr;
    assert(true, 'Usuario A (equipo) autenticado en TEST');

    // User B
    const emailB = `hotfix.userB.${runId}@tdf.gob.ar`;
    const passB = `PassB!${runId}2026`;
    const unameB = `u_hotfix_b_${runId}`;
    const { data: authB, error: authBErr } = await serviceClient.auth.admin.createUser({
      email: emailB,
      password: passB,
      email_confirm: true,
      user_metadata: { nombre: 'Lucas', apellido: 'Colaborador', nombre_usuario: unameB },
    });
    if (authBErr) throw authBErr;
    testUsers.push(authB.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authB.user.id,
      nombre: 'Lucas',
      apellido: 'Colaborador',
      nombre_usuario: unameB,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const clientB = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: emailB, password: passB });
    if (signInBErr) throw signInBErr;
    assert(true, 'Usuario B (equipo) autenticado en TEST');

    // 2. Comprobar fetchTableros cuando el usuario no tiene tableros
    console.log('\n--- 2. Comprobar carga y estado inicial sin tableros del usuario ---');
    const initialListA = await clientFetchTableros(clientA, authA.user, false);
    assert(Array.isArray(initialListA), 'fetchTableros retorna array sin error');
    assert(initialListA.length === 0, 'Usuario nuevo no ve tableros ajenos (privacidad por defecto)');

    // 3. Crear tablero nuevo
    console.log('\n--- 3. Crear nuevo tablero privado (tablero_create) ---');
    const { data: createData, error: createErr } = await clientA.rpc('tablero_create', {
      p_titulo: `Tablero Campaña Invierno ${runId}`,
      p_descripcion: 'Planificación de medios y difusión institucional',
      p_color: 'azul',
    });
    assert(!createErr && createData && createData.id, `Tablero creado con éxito (ID: ${createData?.id})`);
    const boardId = createData.id;
    createdBoardIds.push(boardId);

    // 4. Recargar y comprobar que aparece en fetchTableros con propietario resuelto
    console.log('\n--- 4. Recargar lista con fetchTableros() (comprobando que no haya error de schema cache) ---');
    let listAfterCreate = [];
    let listError = null;
    try {
      listAfterCreate = await clientFetchTableros(clientA, authA.user, false);
    } catch (e) {
      listError = e;
    }
    assert(listError === null, 'fetchTableros NO genera error de schema cache ni relación inexistente');
    assert(listAfterCreate.length === 1 && listAfterCreate[0].id === boardId, 'El nuevo tablero aparece en la lista');
    assert(listAfterCreate[0].propietario?.nombre === 'Pablo', 'Metadatos del propietario resueltos correctamente (nombre: Pablo)');
    assert(listAfterCreate[0].mi_rol === 'propietario', 'Rol resuelto como propietario');

    // 5. Abrir tablero con fetchTableroDetail()
    console.log('\n--- 5. Cargar detalle con fetchTableroDetail() (validando columnas predeterminadas) ---');
    let detail = null;
    let detailError = null;
    try {
      detail = await clientFetchTableroDetail(clientA, authA.user, boardId);
    } catch (e) {
      detailError = e;
    }
    assert(detailError === null, 'fetchTableroDetail NO genera error de schema cache');
    assert(detail && detail.board.id === boardId, 'Detalle de tablero cargado correctamente');
    assert(detail.columnas.length === 3, `Columnas predeterminadas creadas (3 columnas: ${detail.columnas.map(c => c.nombre).join(', ')})`);
    assert(detail.canEdit === true && detail.isOwner === true, 'Permisos: canEdit = true, isOwner = true para propietario');

    // 6. Editar columnas y crear tarjeta
    console.log('\n--- 6. Editar columnas y crear tarjetas ---');
    const colPorHacer = detail.columnas.find(c => c.nombre === 'Por hacer');
    assert(!!colPorHacer, 'Columna "Por hacer" encontrada');

    // Crear tarjeta en "Por hacer"
    const { data: cardData, error: cardErr } = await clientA
      .from('tablero_tarjetas')
      .insert({
        tablero_id: boardId,
        columna_id: colPorHacer.id,
        titulo: 'Diseñar flyer promocional',
        descripcion: 'Formato 1080x1080 para redes',
        tipo_contenido: 'checklist',
        orden: 0,
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!cardErr && cardData, 'Tarjeta creada con éxito en la columna');

    // Agregar ítem de checklist
    const { data: chkData, error: chkErr } = await clientA
      .from('tablero_tarjeta_checklists')
      .insert({
        tablero_id: boardId,
        tarjeta_id: cardData.id,
        texto: 'Aprobar texto con Prensa',
        orden: 0,
        created_by: authA.user.id,
      })
      .select()
      .single();
    assert(!chkErr && chkData, 'Ítem de checklist creado');

    // Toggle checklist
    const { data: toggleData, error: toggleErr } = await clientA.rpc('tablero_tarjeta_checklist_toggle', {
      p_checklist_id: chkData.id,
      p_completado: true,
    });
    assert(!toggleErr && toggleData.completado === true, 'Checklist completado mediante RPC');

    // Agregar comentario con la función corregida clientAddComentario
    console.log('\n--- 7. Agregar comentario a tarjeta (verificando autor poblado sin JOIN inválido) ---');
    let commentRes = null;
    let commentErr = null;
    try {
      commentRes = await clientAddComentario(clientA, authA.user, boardId, cardData.id, 'Primer avance entregado.');
    } catch (e) {
      commentErr = e;
    }
    assert(commentErr === null, 'addTarjetaComentario NO arroja error de schema cache');
    assert(commentRes && commentRes.autor?.nombre === 'Pablo', 'Autor del comentario correctamente resuelto');

    // 8. Re-consultar fetchTableroDetail con tarjeta y comentario
    console.log('\n--- 8. Re-consultar detalle de tablero con tarjeta, checklist y comentarios ---');
    const updatedDetail = await clientFetchTableroDetail(clientA, authA.user, boardId);
    assert(updatedDetail.tarjetas.length === 1, 'Tarjeta listada en fetchTableroDetail');
    assert(updatedDetail.tarjetas[0].checklists.length === 1, 'Checklist listado en tarjeta');
    assert(updatedDetail.tarjetas[0].comentarios.length === 1, 'Comentario listado en tarjeta');
    assert(updatedDetail.tarjetas[0].comentarios[0].autor?.nombre === 'Pablo', 'Autor de comentario en fetchTableroDetail resuelto');

    // 9. Comprobar permisos y privacidad con Usuario B
    console.log('\n--- 9. Comprobar privacidad y permisos (Usuario B no invitado) ---');
    const listBBeforeInvite = await clientFetchTableros(clientB, authB.user, false);
    assert(!listBBeforeInvite.some(t => t.id === boardId), 'Usuario B NO ve el tablero privado en su lista');

    let detailBError = null;
    try {
      await clientFetchTableroDetail(clientB, authB.user, boardId);
    } catch (e) {
      detailBError = e;
    }
    assert(detailBError !== null, 'Usuario B bloqueado por RLS al intentar consultar detalle de tablero no autorizado');

    // 10. Invitar a Usuario B con rol edicion
    console.log('\n--- 10. Invitar a Usuario B con rol edición y verificar acceso ---');
    const { data: inviteData, error: inviteErr } = await clientA.rpc('tablero_member_invite', {
      p_tablero_id: boardId,
      p_user_id: authB.user.id,
      p_rol_tablero: 'edicion',
    });
    assert(!inviteErr && inviteData, 'Usuario B invitado como editor por el propietario');

    const listBAfterInvite = await clientFetchTableros(clientB, authB.user, false);
    assert(listBAfterInvite.some(t => t.id === boardId), 'Usuario B ahora ve el tablero en su lista');
    assert(listBAfterInvite.find(t => t.id === boardId).mi_rol === 'edicion', 'Usuario B tiene rol de edición');

    const detailB = await clientFetchTableroDetail(clientB, authB.user, boardId);
    assert(detailB.board.id === boardId, 'Usuario B puede abrir el tablero autorizado');
    assert(detailB.canEdit === true && detailB.isOwner === false, 'Permisos de Usuario B: canEdit = true, isOwner = false');
    assert(detailB.miembros.length === 1 && detailB.miembros[0].usuario?.nombre === 'Lucas', 'Miembro B correctamente resuelto con su perfil');

    // 11. Eliminar tablero y comprobar que no quedan duplicados
    console.log('\n--- 11. Eliminar tablero y validar limpieza ---');
    const { data: delData, error: delErr } = await clientA.rpc('tablero_delete', {
      p_tablero_id: boardId,
    });
    assert(!delErr && delData === true, 'Tablero eliminado con éxito mediante RPC tablero_delete');

    const listFinalA = await clientFetchTableros(clientA, authA.user, false);
    assert(!listFinalA.some(t => t.id === boardId), 'El tablero ya no figura en la lista');

    // Comprobar que en tableros_privados no quedó rastro del tablero creado
    const { data: orphanCheck } = await serviceClient.from('tableros_privados').select('id').eq('id', boardId);
    assert((orphanCheck || []).length === 0, 'Cero registros residuales en tableros_privados');

  } finally {
    // Limpieza de usuarios y tableros
    console.log('\n--- Limpieza final de recursos de prueba en TEST ---');
    for (const bId of createdBoardIds) {
      await serviceClient.from('tableros_privados').delete().eq('id', bId);
    }
    for (const u of testUsers) {
      await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
      await serviceClient.auth.admin.deleteUser(u.id);
    }
    console.log('  Recursos de prueba eliminados correctamente.');
  }

  console.log('\n================================================================');
  console.log(`RESUMEN HOTFIX TEST: ${passedTests}/${totalTests} PRUEBAS SUPERADAS (${Math.round((passedTests / totalTests) * 100)}%)`);
  if (failedTests === 0) {
    console.log('ESTADO: HOTFIX VERIFICADO EN TEST SATISFACTORIAMENTE');
  } else {
    console.error(`ESTADO: HUBO ${failedTests} FALLOS`);
  }
  console.log('================================================================\n');

  process.exit(failedTests === 0 ? 0 : 1);
}

runHotfixTest();
