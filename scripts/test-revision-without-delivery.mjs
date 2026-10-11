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

async function main() {
  console.log('================================================================');
  console.log('SUITE DE VERIFICACIÓN — REVISIÓN DE PEDIDO SIN ENTREGA MATERIAL');
  console.log(`Ambiente TEST: ${TEST_PROJECT_REF}`);
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const testUsers = [];
  const createdPedidos = [];
  const createdEnvios = [];
  const createdSessions = [];
  const createdFiles = [];

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP DE USUARIOS OPERATIVOS (ADMINISTRADOR Y OPERADOR RESPONSABLE)
    // -------------------------------------------------------------------------
    console.log('--- 1. Preparando usuarios de prueba y roles operativos ---');
    const adminEmail = `rev.admin.${runId}@tdf.gob.ar`;
    const adminPass = `RevPass!${runId}2026`;
    const adminUname = `u_admin_${runId}`;

    const { data: authAdmin, error: authErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Rev QA', nombre_usuario: adminUname },
    });
    if (authErr) throw authErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Rev QA',
      nombre_usuario: adminUname,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const operatorEmail = `rev.op.${runId}@tdf.gob.ar`;
    const operatorPass = `OpPass!${runId}2026`;
    const operatorUname = `u_op_${runId}`;

    const { data: authOp, error: opErr } = await serviceClient.auth.admin.createUser({
      email: operatorEmail,
      password: operatorPass,
      email_confirm: true,
      user_metadata: { nombre: 'Operador', apellido: 'Equipo QA', nombre_usuario: operatorUname },
    });
    if (opErr) throw opErr;
    testUsers.push(authOp.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authOp.user.id,
      nombre: 'Operador',
      apellido: 'Equipo QA',
      nombre_usuario: operatorUname,
      app_role: 'equipo',
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

    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id, nombre').limit(1).single();

    // Helper para crear un pedido público con sesión
    async function createTestPublicPedido(customEmailPrefix = 'sol') {
      const solEmail = `${customEmailPrefix}.${runId}@tdf.gob.ar`;
      const envioId = crypto.randomUUID();
      const pedidoId = crypto.randomUUID();
      const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
      const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');

      await serviceClient.from('envios_formulario').insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: fpHash,
        correo: solEmail,
        nombre_apellido: 'Solicitante QA',
        area_solicitante: 'Secretaría de Modernización',
        telefono: '2901-555555',
      });
      createdEnvios.push(envioId);

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
        informacion_especifica: { titulo: 'Pedido para prueba de revisión' },
      });
      createdPedidos.push(pedidoId);

      // Crear sesión del solicitante
      const rawSessionToken = crypto.randomBytes(32).toString('hex');
      const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
      await serviceClient.from('solicitante_sesiones').insert({
        correo: solEmail,
        session_token_hash: sessionTokenHash,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      createdSessions.push(sessionTokenHash);

      return { pedidoId, envioId, pedCode, solEmail, rawSessionToken };
    }

    // -------------------------------------------------------------------------
    // ESCENARIO A: SOLICITAR REVISIÓN DE PEDIDO FINALIZADO SIN ENTREGA MATERIAL
    // (Caso exacto del incidente PED-2026-D000089)
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO A: Pedido público finalizado solo con nota (entrega = NULL) -> Solicitar revisión ---');
    const pedA = await createTestPublicPedido('sol.a');

    // Asignar al operador QA
    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedA.pedidoId,
      p_responsable_user_id: authOp.user.id,
      p_expected_version: 1,
    });
    // Cambiar a En proceso
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedA.pedidoId,
      p_target_state: 'En proceso',
      p_expected_version: 2,
    });
    // Finalizar solo con nota de entrega
    const { data: finalizeResA, error: finalizeErrA } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedA.pedidoId,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Se coordinó el servicio presencialmente',
    });
    if (finalizeErrA) throw finalizeErrA;
    assert(finalizeResA?.success === true, 'Finalización sin material exitosa');
    assert(finalizeResA?.entrega_id === null, 'Finalización sin material no crea fila en entregas_pedido');

    // Verificar que efectivamente NO hay entregas en la DB para este pedido
    const { data: entregasA } = await serviceClient
      .from('entregas_pedido')
      .select('id')
      .eq('pedido_id', pedA.pedidoId);
    assert(entregasA.length === 0, 'Confirmado: entregas_pedido tiene 0 filas');

    // Solicitante solicita revisión
    console.log('  Ejecutando pedido_request_revision sin entregas registradas...');
    const { data: revResA, error: revErrA } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedA.rawSessionToken,
      p_pedido_id: pedA.pedidoId,
      p_motivo: 'Faltan detalles en la cobertura acordada',
      p_archivos_ids: [],
    });

    assert(!revErrA, `pedido_request_revision ejecutó sin error (error: ${revErrA?.message})`);
    assert(revResA?.success === true, 'pedido_request_revision retornó success: true');
    assert(revResA?.estado === 'Nuevo', 'pedido_request_revision retornó estado Nuevo');
    assert(revResA?.retrabajo_activo === true, 'pedido_request_revision retornó retrabajo_activo true');
    assert(revResA?.revision_number === 1, 'pedido_request_revision retornó revision_number 1');

    // Verificar estado del pedido en la tabla pedidos
    const { data: pedDataA } = await serviceClient
      .from('pedidos')
      .select('estado, retrabajo_activo, revision_count, responsable_user_id')
      .eq('id', pedA.pedidoId)
      .single();
    assert(pedDataA.estado === 'Nuevo', 'pedidos.estado volvió a "Nuevo"');
    assert(pedDataA.retrabajo_activo === true, 'pedidos.retrabajo_activo está en true');
    assert(pedDataA.revision_count === 1, 'pedidos.revision_count es 1');
    assert(pedDataA.responsable_user_id === authOp.user.id, 'pedidos.responsable_user_id fue preservado intacto');

    // Verificar fila en revision_pedidos: entrega_id DEBE ser NULL
    const { data: revPedDataA } = await serviceClient
      .from('revision_pedidos')
      .select('id, entrega_id, revision_number, estado')
      .eq('pedido_id', pedA.pedidoId)
      .single();
    assert(revPedDataA.entrega_id === null, 'revision_pedidos.entrega_id es NULL (REGLA CUMPLIDA: NO entregas ficticias)');
    assert(revPedDataA.revision_number === 1, 'revision_pedidos.revision_number es 1');
    assert(revPedDataA.estado === 'abierta', 'revision_pedidos.estado es abierta');

    // Verificar domain_events
    const { data: devEventsA } = await serviceClient
      .from('domain_events')
      .select('event_name, payload')
      .eq('aggregate_id', pedA.pedidoId)
      .eq('event_name', 'pedido.revision_solicitada')
      .single();
    assert(devEventsA !== null, 'domain_events registró pedido.revision_solicitada');
    assert(devEventsA.payload.entrega_cuestionada_id === null, 'domain_events.payload.entrega_cuestionada_id es null');
    assert(devEventsA.payload.responsable_user_id === authOp.user.id, 'domain_events.payload.responsable_user_id presente');

    // Verificar outbox de comunicaciones: confirmación al solicitante y notificación al equipo
    const { data: commsA } = await serviceClient
      .from('comunicaciones_pedido')
      .select('tipo_comunicacion, destinatario_email')
      .eq('pedido_id', pedA.pedidoId);
    const hasSolComm = commsA.some(c => c.tipo_comunicacion === 'revision_solicitada' && c.destinatario_email.toLowerCase() === pedA.solEmail.toLowerCase());
    const hasTeamComm = commsA.some(c => c.tipo_comunicacion === 'pedido_retrabajo_solicitado' && c.destinatario_email.toLowerCase() === operatorEmail.toLowerCase());
    assert(hasSolComm, 'Comunicaciones outbox: encolada confirmación al solicitante');
    assert(hasTeamComm, 'Comunicaciones outbox: encolada notificación al responsable del equipo vía fallback');

    // -------------------------------------------------------------------------
    // ESCENARIO B: INTENTO DE SOLICITAR REVISIÓN CUANDO YA HAY REVISIÓN ACTIVA
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO B: Rechazo de revisión duplicada (REVISION_ALREADY_OPEN) ---');
    const { data: revResDup, error: revErrDup } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedA.rawSessionToken,
      p_pedido_id: pedA.pedidoId,
      p_motivo: 'Intento de segunda revisión consecutiva',
    });
    assert(revErrDup !== null, 'Segunda solicitud de revisión es rechazada');
    assert(revErrDup.message.includes('INVALID_STATE') || revErrDup.message.includes('REVISION_ALREADY_OPEN'), 
      `Error de rechazo correcto: ${revErrDup.message}`);

    // -------------------------------------------------------------------------
    // ESCENARIO C: CICLO DE RE-FINALIZACIÓN Y SEGUNDA REVISIÓN (Rev #2)
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO C: Re-finalización en retrabajo y posterior segunda revisión ---');
    // El operador avanza a En proceso y vuelve a finalizar (sin material, solo nota)
    const { data: pedDataA2 } = await serviceClient.from('pedidos').select('version').eq('id', pedA.pedidoId).single();
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedA.pedidoId,
      p_target_state: 'En proceso',
      p_expected_version: pedDataA2.version,
    });
    const { data: pedDataA3 } = await serviceClient.from('pedidos').select('version').eq('id', pedA.pedidoId).single();
    const { data: refinalizeRes, error: refinalizeErr } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedA.pedidoId,
      p_expected_version: pedDataA3.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Se completaron los datos requeridos por el solicitante',
    });
    if (refinalizeErr) throw refinalizeErr;
    assert(refinalizeRes.success === true, 'Re-finalización completada exitosamente');
    assert(refinalizeRes.retrabajo_resuelto === true, 'pedido_finalize resolvió el retrabajo previo');

    // Verificar que la revisión 1 quedó en estado resuelta
    const { data: rev1Data } = await serviceClient
      .from('revision_pedidos')
      .select('estado, resolucion_notas')
      .eq('id', revPedDataA.id)
      .single();
    assert(rev1Data.estado === 'resuelta', 'Revisión #1 marcada como resuelta');
    assert(rev1Data.resolucion_notas === 'Se completaron los datos requeridos por el solicitante', 'Notas de resolución registradas en la revisión #1');

    // Ahora el solicitante pide una segunda revisión (Rev #2)
    const { data: rev2Res, error: rev2Err } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedA.rawSessionToken,
      p_pedido_id: pedA.pedidoId,
      p_motivo: 'Aún falta un ajuste adicional específico en el informe',
    });
    assert(!rev2Err, `Segunda revisión procesada sin error: ${rev2Err?.message}`);
    assert(rev2Res.revision_number === 2, 'Segunda revisión incrementó a revision_number 2');

    // Verificar en base de datos
    const { data: pedDataA4 } = await serviceClient
      .from('pedidos')
      .select('estado, retrabajo_activo, revision_count')
      .eq('id', pedA.pedidoId)
      .single();
    assert(pedDataA4.estado === 'Nuevo', 'Pedido nuevamente en estado Nuevo');
    assert(pedDataA4.retrabajo_activo === true, 'retrabajo_activo nuevamente en true');
    assert(pedDataA4.revision_count === 2, 'revision_count incrementado a 2');

    // -------------------------------------------------------------------------
    // ESCENARIO D: PEDIDO FINALIZADO CON MATERIAL (ENTREGA EXISTE)
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO D: Pedido público finalizado CON material (entrega != NULL) -> Solicitar revisión ---');
    const pedD = await createTestPublicPedido('sol.d');

    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedD.pedidoId,
      p_responsable_user_id: authOp.user.id,
      p_expected_version: 1,
    });
    await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedD.pedidoId,
      p_target_state: 'En proceso',
      p_expected_version: 2,
    });

    // Finalizar con URL de entrega externa
    const { data: finResD, error: finErrD } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedD.pedidoId,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: 'https://prensa.tdf.gob.ar/comunicados/2026/04/material-final.pdf',
      p_nota_entrega: 'Entrega formal con material disponible',
    });
    if (finErrD) throw finErrD;
    assert(finResD.entrega_id !== null, 'Finalización con material generó entrega_id');

    // Solicitar revisión sobre pedido con entrega existente
    const { data: revResD, error: revErrD } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedD.rawSessionToken,
      p_pedido_id: pedD.pedidoId,
      p_motivo: 'El enlace proporcionado no contiene la versión final',
    });
    assert(!revErrD, `Revisión sobre pedido con material ejecutó con éxito: ${revErrD?.message}`);

    const { data: revPedDataD } = await serviceClient
      .from('revision_pedidos')
      .select('entrega_id, revision_number')
      .eq('pedido_id', pedD.pedidoId)
      .single();
    assert(revPedDataD.entrega_id === finResD.entrega_id, 'revision_pedidos.entrega_id apunta a la entrega vigente');

    // -------------------------------------------------------------------------
    // ESCENARIO E: REVISIÓN CON ARCHIVO ADJUNTO (ANÁLISIS DE ARCHIVOS HUÉRFANOS)
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO E: Solicitud de revisión con archivos adjuntos ---');
    const pedE = await createTestPublicPedido('sol.e');
    await adminClient.rpc('pedido_assign', { p_pedido_id: pedE.pedidoId, p_responsable_user_id: authOp.user.id, p_expected_version: 1 });
    await adminClient.rpc('pedido_change_state', { p_pedido_id: pedE.pedidoId, p_target_state: 'En proceso', p_expected_version: 2 });
    await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedE.pedidoId,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Finalizado sin entrega para prueba de adjunto',
    });

    // Crear un archivo simulado en public.archivos
    const testFileId = crypto.randomUUID();
    createdFiles.push(testFileId);
    const { error: insArchErr } = await serviceClient.from('archivos').insert({
      id: testFileId,
      drive_file_id: `fake-drive-${runId}`,
      nombre_original: 'correccion_solicitada.png',
      mime_type: 'image/png',
      size_bytes: 12345,
      sha256: crypto.createHash('sha256').update('testfile').digest('hex'),
      contexto: 'solicitud',
      estado: 'uploaded',
    });
    if (insArchErr) throw insArchErr;

    const { data: revResE, error: revErrE } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedE.rawSessionToken,
      p_pedido_id: pedE.pedidoId,
      p_motivo: 'Adjunto captura con las correcciones requeridas',
      p_archivos_ids: [testFileId],
    });
    assert(!revErrE, `Revisión con adjunto ejecutó sin error: ${revErrE?.message}`);

    // Verificar que el archivo se vinculó a revision_archivos y archivo_pedido
    const { data: revArchData } = await serviceClient
      .from('revision_archivos')
      .select('archivo_id')
      .eq('archivo_id', testFileId);
    assert(revArchData.length === 1, 'Archivo correctamente asociado a revision_archivos');

    const { data: archPedData } = await serviceClient
      .from('archivo_pedido')
      .select('archivo_id')
      .eq('archivo_id', testFileId)
      .eq('pedido_id', pedE.pedidoId);
    assert(archPedData.length === 1, 'Archivo correctamente asociado a archivo_pedido');

    const { data: archData } = await serviceClient
      .from('archivos')
      .select('contexto')
      .eq('id', testFileId)
      .single();
    assert(archData.contexto === 'revision', 'public.archivos.contexto actualizado a "revision"');

    // -------------------------------------------------------------------------
    // ESCENARIO F: VALIDACIONES DEFENSIVAS DE ENTRADA
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO F: Validaciones de seguridad y guards defensivos ---');
    // Motivo corto (< 10 caracteres)
    const { error: errShortMotivo } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedE.rawSessionToken,
      p_pedido_id: pedE.pedidoId,
      p_motivo: 'corto',
    });
    assert(errShortMotivo && errShortMotivo.message.includes('VALIDATION_ERROR'), 'Rechaza motivo menor a 10 caracteres');

    // Token vacío
    const { error: errNoToken } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: '',
      p_pedido_id: pedE.pedidoId,
      p_motivo: 'Motivo con longitud válida pero sin token',
    });
    assert(errNoToken && errNoToken.message.includes('UNAUTHORIZED'), 'Rechaza sesión inválida o vacía');

    // Archivo inexistente
    const { error: errFakeFile } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedD.rawSessionToken,
      p_pedido_id: pedD.pedidoId,
      p_motivo: 'Motivo con longitud válida y archivo fantasma',
      p_archivos_ids: [crypto.randomUUID()],
    });
    assert(errFakeFile && errFakeFile.message.includes('FILE_NOT_FOUND'), 'Rechaza archivo adjunto inexistente');

    // Más de 5 archivos
    const { error: errManyFiles } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: pedD.rawSessionToken,
      p_pedido_id: pedD.pedidoId,
      p_motivo: 'Motivo con longitud válida pero demasiados archivos',
      p_archivos_ids: [
        crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(),
        crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()
      ],
    });
    assert(errManyFiles && errManyFiles.message.includes('LIMIT_EXCEEDED'), 'Rechaza más de 5 archivos adjuntos');

    // -------------------------------------------------------------------------
    // ESCENARIO G: VERIFICACIÓN DEL RPC SANITIZADO solicitante_get_pedido_detail
    // -------------------------------------------------------------------------
    console.log('\n--- ESCENARIO G: Verificación del detalle público del solicitante durante retrabajo ---');
    const { data: detailData, error: detailErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: pedA.rawSessionToken,
      p_pedido_ref: pedA.pedidoId,
    });
    assert(!detailErr, `solicitante_get_pedido_detail ejecutó sin error: ${detailErr?.message}`);
    assert(detailData?.pedido?.estado === 'Nuevo', 'Detalle público refleja estado Nuevo');
    assert(detailData?.pedido?.retrabajo_activo === true, 'Detalle público refleja retrabajo_activo true');
    assert(detailData?.revision_activa !== null, 'Detalle público contiene nodo revision_activa');
    assert(detailData?.revision_activa?.revision_number === 2, 'revision_activa contiene revision_number 2');
    assert(Array.isArray(detailData?.revisiones_historial) && detailData.revisiones_historial.length === 1,
      'revisiones_historial contiene la revisión previa #1 resuelta');
    assert(detailData?.historial.some(h => h.tipo === 'revision_requested'),
      'Historial amigable contiene entrada humana para la solicitud de revisión');

    console.log('\n================================================================');
    console.log(`RESULTADO DE LA SUITE: ${passedTests}/${totalTests} PRUEBAS EXITOSAS`);
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ ERROR EN LA EJECUCIÓN DE PRUEBAS:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Limpieza de datos temporales de prueba en TEST ---');
    try {
      if (createdSessions.length > 0) {
        await serviceClient.from('solicitante_sesiones').delete().in('session_token_hash', createdSessions);
      }
      if (createdPedidos.length > 0) {
        // Limpiar revisiones, entregas, eventos, pedidos
        await serviceClient.from('revision_archivos').delete().neq('revision_solicitud_id', '00000000-0000-0000-0000-000000000000');
        await serviceClient.from('revision_pedidos').delete().in('pedido_id', createdPedidos);
        await serviceClient.from('comunicaciones_pedido').delete().in('pedido_id', createdPedidos);
        await serviceClient.from('domain_events').delete().in('aggregate_id', createdPedidos);
        await serviceClient.from('audit_log').delete().in('recurso_id', createdPedidos.map(String));
        await serviceClient.from('archivo_pedido').delete().in('pedido_id', createdPedidos);
        await serviceClient.from('entregas_pedido').delete().in('pedido_id', createdPedidos);
        await serviceClient.from('notas_pedido').delete().in('pedido_id', createdPedidos);
        await serviceClient.from('pedidos').delete().in('id', createdPedidos);
      }
      if (createdEnvios.length > 0) {
        await serviceClient.from('revision_solicitudes').delete().in('envio_id', createdEnvios);
        await serviceClient.from('envios_formulario').delete().in('id', createdEnvios);
      }
      if (createdFiles.length > 0) {
        await serviceClient.from('archivos').delete().in('id', createdFiles);
      }
      for (const u of testUsers) {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      }
      console.log('  ✓ Limpieza completada con éxito');
    } catch (cleanErr) {
      console.warn('  ⚠️ Advertencia en limpieza:', cleanErr.message);
    }
  }
}

main();
