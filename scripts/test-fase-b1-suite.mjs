import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
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
  console.log('SUITE DE PRUEBAS AUTOMATIZADAS — FASE B.1 (TEST: ' + TEST_PROJECT_REF + ')');
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
  const createdEnvioIds = [];
  let testSuccess = true;

  try {
    // --------------------------------------------------------------------------
    // 0. CREACIÓN DE USUARIOS DE TEST
    // --------------------------------------------------------------------------
    console.log('0. Creando usuarios de prueba...');
    const timestamp = Date.now();
    const password = 'Password123!Secure';

    // Admin
    const adminEmail = `qa-admin-b1-${timestamp}@tdf.gob.ar`;
    const { data: adminAuth, error: adminAuthErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (adminAuthErr) throw new Error('Error al crear admin: ' + adminAuthErr.message);
    const adminId = adminAuth.user.id;
    createdUserIds.push(adminId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: adminId,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
      nombre: 'Admin QA',
      apellido: 'B1',
      nombre_usuario: `qa_admin_${timestamp}`
    });

    const { data: adminSession } = await anonClient.auth.signInWithPassword({ email: adminEmail, password });
    const adminClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${adminSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Operador A (equipo)
    const opAEmail = `qa-opA-b1-${timestamp}@tdf.gob.ar`;
    const { data: opAAuth, error: opAErr } = await serviceClient.auth.admin.createUser({
      email: opAEmail,
      password,
      email_confirm: true,
    });
    if (opAErr) throw new Error('Error al crear opA: ' + opAErr.message);
    const opAId = opAAuth.user.id;
    createdUserIds.push(opAId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: opAId,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
      nombre: 'Operador A',
      apellido: 'B1',
      nombre_usuario: `qa_opa_${timestamp}`
    });

    const { data: opASession } = await anonClient.auth.signInWithPassword({ email: opAEmail, password });
    const opAClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opASession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Operador B (equipo)
    const opBEmail = `qa-opB-b1-${timestamp}@tdf.gob.ar`;
    const { data: opBAuth, error: opBErr } = await serviceClient.auth.admin.createUser({
      email: opBEmail,
      password,
      email_confirm: true,
    });
    if (opBErr) throw new Error('Error al crear opB: ' + opBErr.message);
    const opBId = opBAuth.user.id;
    createdUserIds.push(opBId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: opBId,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
      nombre: 'Operador B',
      apellido: 'B1',
      nombre_usuario: `qa_opb_${timestamp}`
    });

    const { data: opBSession } = await anonClient.auth.signInWithPassword({ email: opBEmail, password });
    const opBClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${opBSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Observador
    const obsEmail = `qa-obs-b1-${timestamp}@tdf.gob.ar`;
    const { data: obsAuth, error: obsErr } = await serviceClient.auth.admin.createUser({
      email: obsEmail,
      password,
      email_confirm: true,
    });
    if (obsErr) throw new Error('Error al crear obs: ' + obsErr.message);
    const obsId = obsAuth.user.id;
    createdUserIds.push(obsId);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: obsId,
      app_role: 'observador',
      estado_acceso: 'aprobado',
      nombre: 'Observador QA',
      apellido: 'B1',
      nombre_usuario: `qa_obs_${timestamp}`
    });

    const { data: obsSession } = await anonClient.auth.signInWithPassword({ email: obsEmail, password });
    const obsClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${obsSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    console.log('✓ Usuarios de prueba creados y autenticados (Admin, OpA, OpB, Observador)\n');

    // Fixture helper: Crear pedido de prueba
    const { data: cats } = await serviceClient.from('categorias_servicio').select('id').limit(1);
    const catId = cats[0].id;
    const { data: tipos } = await serviceClient.from('tipos_servicio').select('id').eq('categoria_id', catId).limit(1);
    const tipoId = tipos[0].id;

    async function createTestPedido(initialResponsable = null) {
      const envioId = crypto.randomUUID();
      createdEnvioIds.push(envioId);
      const insEnvio = await serviceClient.from('envios_formulario').insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.randomBytes(32).toString('hex'),
        nombre_apellido: 'QA Solicitante B1',
        telefono: '+5492964112233',
        correo: 'qa-b1@tdf.gob.ar',
        area_solicitante: 'Dirección Provincial de Prueba'
      });
      if (insEnvio.error) throw new Error('Error al insertar envio: ' + insEnvio.error.message);

      const pedidoId = crypto.randomUUID();
      createdPedidoIds.push(pedidoId);
      const randNum = Math.floor(Math.random() * 80000) + 10000;
      const pedidoVisible = `PED-2026-D0${randNum}`;

      const insPed = await serviceClient.from('pedidos').insert({
        id: pedidoId,
        envio_id: envioId,
        categoria_id: catId,
        tipo_servicio_id: tipoId,
        pedido_visible: pedidoVisible,
        tracking_token_hash: crypto.randomBytes(32).toString('hex'),
        client_request_ref: crypto.randomUUID(),
        anio: 2026,
        numero: randNum,
        codigo_categoria: 'D',
        estado: 'Nuevo',
        responsable_user_id: initialResponsable,
        version: 1,
        informacion_especifica: { motivo: 'QA Test B1' }
      });
      if (insPed.error) throw new Error('Error al insertar pedido: ' + insPed.error.message);

      return { pedidoId, pedidoVisible, envioId };
    }

    // ==========================================================================
    // PASO 40: ASIGNACIÓN Y REASIGNACIÓN
    // ==========================================================================
    console.log('--- PASO 40: PRUEBA DE ASIGNACIÓN (A -> B y B -> B) ---');
    const { pedidoId: ped1Id, pedidoVisible: ped1Vis } = await createTestPedido(opAId);

    // Asignar de Operador A a Operador B mediante RPC pedido_assign
    const assignRes1 = await adminClient.rpc('pedido_assign', {
      p_pedido_id: ped1Id,
      p_responsable_user_id: opBId,
      p_expected_version: 1,
      p_motivo: 'Asignando a Operador B para QA'
    });

    if (assignRes1.error || !assignRes1.data?.success) {
      throw new Error('Fallo en pedido_assign: ' + JSON.stringify(assignRes1));
    }

    // Verificar notificación generada para Operador B
    const { data: notifsB1, error: nBErr1 } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('user_id', opBId);

    if (nBErr1) throw new Error('Error consultando notificaciones B: ' + nBErr1.message);

    console.log(`[Paso 40] Notificaciones recibidas por Operador B: ${notifsB1.length}`);
    if (notifsB1.length !== 1) {
      throw new Error(`[FAIL] Se esperaba 1 notificación para Operador B, se obtuvieron ${notifsB1.length}`);
    }

    const n1 = notifsB1[0];
    if (n1.tipo !== 'pedido_asignado') throw new Error(`[FAIL] Tipo incorrecto: ${n1.tipo}`);
    if (n1.metadata.pedido_visible !== ped1Vis) throw new Error(`[FAIL] Visible no coincide: ${n1.metadata.pedido_visible}`);
    if (n1.metadata.section !== 'header') throw new Error(`[FAIL] Section no es header: ${n1.metadata.section}`);
    if (n1.read_at !== null) throw new Error(`[FAIL] read_at inicial debe ser null`);
    console.log('✓ Notificación de asignación creada correctamente con metadata sanitizada');

    // Reasignar B -> B (idempotencia de asignación)
    const { data: ped1Updated } = await serviceClient.from('pedidos').select('version').eq('id', ped1Id).single();
    const assignRes2 = await adminClient.rpc('pedido_assign', {
      p_pedido_id: ped1Id,
      p_responsable_user_id: opBId,
      p_expected_version: ped1Updated.version,
      p_motivo: 'Reasignando al mismo operador B'
    });

    const { data: notifsB2 } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('user_id', opBId);

    console.log(`[Paso 40] Notificaciones tras reasignar B -> B: ${notifsB2.length}`);
    if (notifsB2.length !== 1) {
      throw new Error(`[FAIL] Reasignación B -> B generó notificación duplicada! Total: ${notifsB2.length}`);
    }
    console.log('✓ Reasignación B -> B no duplicó notificaciones (PASS)\n');

    // ==========================================================================
    // PASO 41: RESPUESTA A PEDIDO DE INFORMACIÓN (48 H)
    // ==========================================================================
    console.log('--- PASO 41: RESPUESTA INFORMACIÓN 48 H (RESPONSABLE VIGENTE Y CASO SIN ASIGNAR) ---');
    // Caso 1: Con responsable asignado (B)
    const eventId48h = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: eventId48h,
      event_name: 'pedido.info_responded',
      aggregate_type: 'pedido',
      aggregate_id: ped1Id,
      payload: {
        pedido_id: ped1Id,
        solicitud_id: crypto.randomUUID(),
        responsable_user_id: opBId,
        is_tardia: false
      },
      actor_user_id: null
    });

    const { data: notifsInfoB } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('tipo', 'info_respondida');

    console.log(`[Paso 41] Notificaciones info_respondida: ${notifsInfoB.length}`);
    if (notifsInfoB.length !== 1 || notifsInfoB[0].user_id !== opBId) {
      throw new Error(`[FAIL] Notificación info_respondida no llegó a Operador B`);
    }
    console.log('✓ Notificación info_respondida recibida exclusivamente por el responsable vigente (B)');

    // Caso 2: Sin responsable asignado (responsable_user_id = NULL) -> debe notificar a todos los administradores aprobados
    const { pedidoId: pedUnassignedId, pedidoVisible: pedUnassignedVis } = await createTestPedido(null);
    const eventIdUnassigned = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: eventIdUnassigned,
      event_name: 'pedido.info_responded_unassigned',
      aggregate_type: 'pedido',
      aggregate_id: pedUnassignedId,
      payload: {
        pedido_id: pedUnassignedId,
        solicitud_id: crypto.randomUUID(),
        responsable_user_id: null,
        is_tardia: false
      },
      actor_user_id: null
    });

    const { data: notifsAdminUnassigned } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', pedUnassignedId)
      .eq('user_id', adminId);

    console.log(`[Paso 41] Notificaciones recibidas por Admin en pedido sin asignar: ${notifsAdminUnassigned.length}`);
    if (notifsAdminUnassigned.length !== 1) {
      throw new Error(`[FAIL] Admin no recibió la notificación de pedido sin asignar`);
    }
    // Verificar que Operador A no la recibió
    const { data: notifsOpAUnassigned } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', pedUnassignedId)
      .eq('user_id', opAId);
    if (notifsOpAUnassigned.length !== 0) {
      throw new Error(`[FAIL] Operador A no debería recibir notificación de pedido sin asignar`);
    }
    console.log('✓ Caso sin responsable notifica a administradores y excluye operadores (PASS)\n');

    // ==========================================================================
    // PASO 42: DEVOLUCIÓN / RETRABAJO
    // ==========================================================================
    console.log('--- PASO 42: DEVOLUCIÓN / RETRABAJO ---');
    const eventIdRework = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: eventIdRework,
      event_name: 'pedido.revision_solicitada',
      aggregate_type: 'pedido',
      aggregate_id: ped1Id,
      payload: {
        pedido_id: ped1Id,
        responsable_user_id: opBId,
        motivo: 'Falta corrección en logo'
      },
      actor_user_id: adminId
    });

    const { data: notifsRework } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('tipo', 'retrabajo_solicitado');

    console.log(`[Paso 42] Notificaciones retrabajo_solicitado: ${notifsRework.length}`);
    if (notifsRework.length !== 1 || notifsRework[0].user_id !== opBId) {
      throw new Error(`[FAIL] Notificación de retrabajo no llegó a responsable vigente B`);
    }
    if (notifsRework[0].metadata.section !== 'revision') {
      throw new Error(`[FAIL] Section esperada 'revision', obtenida: ${notifsRework[0].metadata.section}`);
    }
    console.log('✓ Notificación de retrabajo recibida correctamente por el responsable vigente (PASS)\n');

    // ==========================================================================
    // PASO 43: NOTA INTERNA (EXCLUSIÓN DE AUTOR Y SUPRESIÓN DE TEXTO)
    // ==========================================================================
    console.log('--- PASO 43: NOTA INTERNA (PRIVACIDAD Y SUPRESIÓN DE AUTO-NOTIFICACIÓN) ---');
    // Caso 1: Operador A escribe nota interna en pedido asignado a Operador B
    const noteTextSecret = 'Texto Confidencial Interno Que No Debe Exponerse En Notificación';
    const noteRes1 = await opAClient.rpc('nota_pedido_create', {
      p_pedido_id: ped1Id,
      p_contenido: noteTextSecret,
      p_visibilidad: 'interna'
    });

    if (noteRes1.error || !noteRes1.data?.success) {
      throw new Error('Fallo en nota_pedido_create: ' + JSON.stringify(noteRes1));
    }

    const { data: notifsNoteB } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('tipo', 'nota_creada');

    console.log(`[Paso 43] Notificaciones nota_creada para Operador B: ${notifsNoteB.length}`);
    if (notifsNoteB.length !== 1 || notifsNoteB[0].user_id !== opBId) {
      throw new Error(`[FAIL] Operador B no recibió notificación nota_creada`);
    }

    const noteNotif = notifsNoteB[0];
    const rawNotifJson = JSON.stringify(noteNotif);
    if (rawNotifJson.includes(noteTextSecret)) {
      throw new Error(`[SECURITY FAIL] El texto confidencial de la nota fue expuesto en la notificación!`);
    }
    if (noteNotif.metadata.section !== 'notas') {
      throw new Error(`[FAIL] Section esperada 'notas', obtenida: ${noteNotif.metadata.section}`);
    }
    console.log('✓ Texto confidencial no está presente en la notificación ni en sus metadatos');

    // Caso 2: Operador B (el mismo responsable) escribe una nota interna en su propio pedido
    const noteRes2 = await opBClient.rpc('nota_pedido_create', {
      p_pedido_id: ped1Id,
      p_contenido: 'Nota dejada por el propio responsable B',
      p_visibilidad: 'interna'
    });
    if (noteRes2.error || !noteRes2.data?.success) {
      throw new Error('Fallo en nota_pedido_create por B: ' + JSON.stringify(noteRes2));
    }

    const { data: notifsNoteBAfter } = await serviceClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id)
      .eq('tipo', 'nota_creada');

    console.log(`[Paso 43] Conteo de notificaciones nota_creada tras auto-nota: ${notifsNoteBAfter.length}`);
    if (notifsNoteBAfter.length !== 1) {
      throw new Error(`[FAIL] Auto-nota generó notificación innecesaria! Total: ${notifsNoteBAfter.length}`);
    }
    console.log('✓ Auto-notificación suprimida exitosamente (0 notificaciones al autor) (PASS)\n');

    // ==========================================================================
    // PASO 44: OBSERVADOR (BLOQUEO RLS Y RPCs)
    // ==========================================================================
    console.log('--- PASO 44: ROL OBSERVADOR (BLOQUEO COMPLETO) ---');
    // 1. Observador consulta notificaciones -> debe recibir 0 registros
    const { data: obsNotifs, error: obsQueryErr } = await obsClient
      .from('notificaciones_usuario')
      .select('*');

    if (obsQueryErr) {
      console.log('✓ Consulta de observador denegada por error de política:', obsQueryErr.message);
    } else {
      console.log(`[Paso 44] Filas retornadas a observador: ${obsNotifs.length}`);
      if (obsNotifs.length !== 0) {
        throw new Error(`[SECURITY FAIL] Observador pudo leer ${obsNotifs.length} notificaciones!`);
      }
      console.log('✓ Observador recibe 0 filas vía RLS');
    }

    // 2. Observador intenta ejecutar notification_mark_read
    const obsRpcRes = await obsClient.rpc('notification_mark_read', {
      p_notification_id: noteNotif.id
    });
    console.log('[Paso 44] Resultado RPC notification_mark_read como observador:', obsRpcRes.error?.message || obsRpcRes.data);
    if (!obsRpcRes.error || !obsRpcRes.error.message.includes('Observadores no tienen acceso')) {
      throw new Error('[SECURITY FAIL] Observador no fue bloqueado en notification_mark_read!');
    }

    // 3. Observador intenta ejecutar notification_mark_all_read
    const obsRpcAllRes = await obsClient.rpc('notification_mark_all_read');
    if (!obsRpcAllRes.error || !obsRpcAllRes.error.message.includes('Observadores no tienen acceso')) {
      throw new Error('[SECURITY FAIL] Observador no fue bloqueado en notification_mark_all_read!');
    }
    console.log('✓ Observador bloqueado en RLS y ambas RPCs con ROLE_FORBIDDEN (PASS)\n');

    // ==========================================================================
    // PASO 45: AISLAMIENTO / PoLP ENTRE USUARIOS
    // ==========================================================================
    console.log('--- PASO 45: AISLAMIENTO ENTRE USUARIOS Y BLOQUEO DE ESCRITURA DIRECTA ---');
    // 1. Operador A consulta notificaciones -> No puede ver notificaciones de Operador B
    const { data: opANotifs } = await opAClient
      .from('notificaciones_usuario')
      .select('*')
      .eq('pedido_id', ped1Id);

    console.log(`[Paso 45] Filas de ped1 vistas por Operador A: ${opANotifs.length}`);
    if (opANotifs.length !== 0) {
      throw new Error(`[SECURITY FAIL] Operador A pudo leer ${opANotifs.length} notificaciones de Operador B!`);
    }

    // 2. Operador A intenta marcar como leída una notificación de Operador B
    const opAMarkRes = await opAClient.rpc('notification_mark_read', {
      p_notification_id: noteNotif.id
    });
    console.log('[Paso 45] Intento de Operador A marcando notif de B:', opAMarkRes.error?.message);
    if (!opAMarkRes.error || !opAMarkRes.error.message.includes('NOTIFICATION_NOT_FOUND')) {
      throw new Error('[SECURITY FAIL] Operador A pudo marcar notificación de B o no arrojó NOTIFICATION_NOT_FOUND!');
    }

    // 3. Operador B intenta INSERT directo en notificaciones_usuario
    const opBDirectInsert = await opBClient.from('notificaciones_usuario').insert({
      user_id: opBId,
      pedido_id: ped1Id,
      tipo: 'pedido_asignado',
      idempotency_key: 'hacked_key_' + Date.now()
    });
    console.log('[Paso 45] Intento INSERT directo por OpB:', opBDirectInsert.error?.message);
    if (!opBDirectInsert.error) {
      throw new Error('[SECURITY FAIL] Operador B pudo hacer INSERT directo en notificaciones_usuario!');
    }

    // 4. Operador B intenta UPDATE directo sobre read_at
    const opBDirectUpdate = await opBClient
      .from('notificaciones_usuario')
      .update({ read_at: new Date().toISOString() })
      .eq('id', noteNotif.id);
    console.log('[Paso 45] Intento UPDATE directo por OpB:', opBDirectUpdate.error?.message);
    // Si no da error pero retorna 0 rows afectadas por no tener política UPDATE:
    const { data: checkDirectUpdate } = await serviceClient
      .from('notificaciones_usuario')
      .select('read_at')
      .eq('id', noteNotif.id)
      .single();
    if (checkDirectUpdate.read_at !== null) {
      throw new Error('[SECURITY FAIL] Operador B pudo mutar read_at por UPDATE directo!');
    }
    console.log('✓ Aislamiento completo y mutación directa no autorizada bloqueada (PASS)\n');

    // ==========================================================================
    // PASO 46: MULTI-SESIÓN / PERSISTENCIA DE ESTADO (RPCs LEÍDO)
    // ==========================================================================
    console.log('--- PASO 46: MULTI-SESIÓN Y PERSISTENCIA DE ESTADO (read_at) ---');
    // 1. Marcar individual como leída por Operador B
    const markRes1 = await opBClient.rpc('notification_mark_read', {
      p_notification_id: noteNotif.id
    });
    if (markRes1.error || !markRes1.data?.updated) {
      throw new Error('Fallo en mark_read: ' + JSON.stringify(markRes1));
    }

    const { data: verifiedNotif } = await serviceClient
      .from('notificaciones_usuario')
      .select('read_at')
      .eq('id', noteNotif.id)
      .single();

    if (!verifiedNotif.read_at) {
      throw new Error('[FAIL] read_at no fue persistido en base de datos');
    }
    console.log(`✓ read_at persistido con éxito: ${verifiedNotif.read_at}`);

    // 2. Re-marcar individual (idempotencia en RPC)
    const markRes2 = await opBClient.rpc('notification_mark_read', {
      p_notification_id: noteNotif.id
    });
    if (markRes2.error || markRes2.data?.updated !== false) {
      throw new Error('[FAIL] Segunda llamada a mark_read debería tener updated: false');
    }
    console.log('✓ notification_mark_read es idempotente (segunda llamada updated: false)');

    // 3. Marcar todas como leídas
    const markAllRes = await opBClient.rpc('notification_mark_all_read');
    if (markAllRes.error || typeof markAllRes.data?.marked_count !== 'number') {
      throw new Error('Fallo en mark_all_read: ' + JSON.stringify(markAllRes));
    }
    console.log(`✓ notification_mark_all_read ejecutado. Afectadas: ${markAllRes.data.marked_count}`);

    // Verificar que no queden no leídas para Operador B
    const { data: unreadB } = await serviceClient
      .from('notificaciones_usuario')
      .select('id')
      .eq('user_id', opBId)
      .is('read_at', null);

    if (unreadB.length !== 0) {
      throw new Error(`[FAIL] Aún quedan ${unreadB.length} notificaciones no leídas para B`);
    }
    console.log('✓ Todas las notificaciones de B quedaron marcadas como leídas (PASS)\n');

    // ==========================================================================
    // PASO 47: IDEMPOTENCIA EN GENERADOR CENTRAL
    // ==========================================================================
    console.log('--- PASO 47: IDEMPOTENCIA DEL DISPATCHER ---');
    const { count: countBefore } = await serviceClient
      .from('notificaciones_usuario')
      .select('*', { count: 'exact', head: true });

    // Re-despachar el evento eventIdRework directamente vía SQL helper
    await serviceClient.rpc('notification_dispatch_from_domain_event', {
      p_event_id: eventIdRework,
      p_event_name: 'pedido.revision_solicitada',
      p_aggregate_id: ped1Id,
      p_payload: {
        pedido_id: ped1Id,
        responsable_user_id: opBId,
        motivo: 'Falta corrección en logo'
      },
      p_actor_id: adminId
    });

    const { count: countAfter } = await serviceClient
      .from('notificaciones_usuario')
      .select('*', { count: 'exact', head: true });

    console.log(`[Paso 47] Conteo antes: ${countBefore}, después de re-dispatch: ${countAfter}`);
    if (countBefore !== countAfter) {
      throw new Error(`[FAIL] Idempotencia falló: se agregaron registros duplicados!`);
    }
    console.log('✓ Idempotency key previene cualquier duplicado (PASS)\n');

    // ==========================================================================
    // PASO 48: INTEGRACIÓN CON PURGA ADMINISTRATIVA
    // ==========================================================================
    console.log('--- PASO 48: PURGA ADMINISTRATIVA Y ELIMINACIÓN DE NOTIFICACIONES ---');
    const { pedidoId: pedPurgeId } = await createTestPedido(opBId);

    // Generar 2 notificaciones asociadas al pedido a purgar
    const evPurge1 = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: evPurge1,
      event_name: 'pedido.assigned',
      aggregate_type: 'pedido',
      aggregate_id: pedPurgeId,
      payload: { responsable_nuevo_id: opBId },
      actor_user_id: adminId
    });

    const evPurge2 = crypto.randomUUID();
    await serviceClient.from('domain_events').insert({
      id: evPurge2,
      event_name: 'pedido.revision_solicitada',
      aggregate_type: 'pedido',
      aggregate_id: pedPurgeId,
      payload: { responsable_user_id: opBId },
      actor_user_id: adminId
    });

    const { data: notifsPrePurge } = await serviceClient
      .from('notificaciones_usuario')
      .select('id')
      .eq('pedido_id', pedPurgeId);

    console.log(`[Paso 48] Notificaciones vinculadas al pedido de purga: ${notifsPrePurge.length}`);
    if (notifsPrePurge.length !== 2) {
      throw new Error(`[FAIL] Se esperaban 2 notificaciones pre-purga, se obtuvieron ${notifsPrePurge.length}`);
    }

    // Probar admin_pedidos_purge_preview
    const previewRes = await adminClient.rpc('admin_pedidos_purge_preview', {
      p_pedido_ids: [pedPurgeId],
      p_actor: 'QA Admin Purge'
    });

    if (previewRes.error) throw new Error('Error en purge_preview: ' + previewRes.error.message);
    console.log(`[Paso 48] Preview notificaciones_count reportado: ${previewRes.data.notificaciones_count}`);
    if (previewRes.data.notificaciones_count !== 2) {
      throw new Error(`[FAIL] Preview esperaba 2 notificaciones_count, reportó: ${previewRes.data.notificaciones_count}`);
    }
    console.log('✓ admin_pedidos_purge_preview reporta exactamente las notificaciones vinculadas');

    // Ejecutar purga vía saga oficial (service_role backend saga daemon)
    const initPurgeRes = await serviceClient.rpc('admin_purge_operation_init', {
      p_pedido_ids: [pedPurgeId],
      p_idempotency_key: 'qa_purge_notif_' + Date.now(),
      p_actor: 'QA Admin Purge'
    });

    if (initPurgeRes.error || !initPurgeRes.data?.operation_id) {
      throw new Error('Fallo en admin_purge_operation_init: ' + JSON.stringify(initPurgeRes));
    }

    const purgeOpId = initPurgeRes.data.operation_id;

    const purgeExecRes = await serviceClient.rpc('admin_pedidos_purge', {
      p_operation_id: purgeOpId,
      p_actor: 'QA Admin Purge'
    });

    if (purgeExecRes.error) {
      throw new Error('Error en admin_pedidos_purge: ' + purgeExecRes.error.message);
    }
    console.log('✓ Purga de base de datos ejecutada con éxito:', purgeExecRes.data);

    // Verificar que las notificaciones del pedido fueron eliminadas
    const { data: notifsPostPurge } = await serviceClient
      .from('notificaciones_usuario')
      .select('id')
      .eq('pedido_id', pedPurgeId);

    if (notifsPostPurge.length !== 0) {
      throw new Error(`[FAIL] Las notificaciones no fueron eliminadas durante la purga! Quedan: ${notifsPostPurge.length}`);
    }
    console.log('✓ Notificaciones purgadas limpiamente sin violación de FK (PASS)\n');

    // ==========================================================================
    // PASO 49: VERIFICACIÓN DE BACKUP LÓGICO
    // ==========================================================================
    console.log('--- PASO 49: COMPATIBILIDAD CON BACKUP LÓGICO ---');
    const backupScriptContent = fs.readFileSync(path.join(process.cwd(), 'scripts', 'backup-prod-database.mjs'), 'utf8');
    if (!backupScriptContent.includes("'notificaciones_usuario'")) {
      throw new Error("[FAIL] 'notificaciones_usuario' no está presente en TABLES de backup-prod-database.mjs");
    }
    console.log("✓ 'notificaciones_usuario' verificado en lista TABLES de scripts/backup-prod-database.mjs");

    // Verificar consulta directa simulando backup lógico
    const backupQueryRes = await serviceClient
      .from('notificaciones_usuario')
      .select('id, user_id, tipo, created_at')
      .limit(5);

    if (backupQueryRes.error) {
      throw new Error('Fallo al consultar notificaciones_usuario para backup: ' + backupQueryRes.error.message);
    }
    console.log(`✓ Simulación de export lógico exitosa (${backupQueryRes.data.length} filas leídas) (PASS)\n`);

    console.log('================================================================');
    console.log('¡TODAS LAS PRUEBAS FASE B.1 PASARON EXITOSAMENTE! (10/10 PASS)');
    console.log('================================================================\n');

  } catch (err) {
    testSuccess = false;
    console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS:', err);
  } finally {
    // --------------------------------------------------------------------------
    // LIMPIEZA DE FIXTURES DE TEST
    // --------------------------------------------------------------------------
    console.log('Limpiando fixtures de prueba en Supabase TEST...');
    try {
      if (createdPedidoIds.length > 0) {
        await serviceClient.from('notificaciones_usuario').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('domain_events').delete().in('aggregate_id', createdPedidoIds);
        await serviceClient.from('notas_pedido').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('pedido_asignaciones').delete().in('pedido_id', createdPedidoIds);
        await serviceClient.from('pedidos').delete().in('id', createdPedidoIds);
      }
      if (createdEnvioIds.length > 0) {
        await serviceClient.from('envios_formulario').delete().in('id', createdEnvioIds);
      }
      for (const uid of createdUserIds) {
        await serviceClient.from('notificaciones_usuario').delete().eq('user_id', uid);
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', uid);
        await serviceClient.auth.admin.deleteUser(uid);
      }
      console.log('✓ Fixtures limpiados correctamente.');
    } catch (cleanupErr) {
      console.error('Error durante la limpieza de fixtures:', cleanupErr);
    }

    if (!testSuccess) {
      process.exit(1);
    }
  }
}

main();
