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
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ PASS: ${message}`);
}

async function main() {
  console.log('================================================================');
  console.log('SUITE DE VERIFICACIÓN — FASE 4A: REAPERTURA Y VERSIONADO CANÓNICO');
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

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP DE USUARIOS (ADMINISTRADOR, OPERADOR / EQUIPO, OBSERVADOR)
    // -------------------------------------------------------------------------
    console.log('--- 1. Preparando usuarios operativos y solicitante de prueba ---');

    // Admin
    const adminEmail = `f4a.admin.${runId}@tdf.gob.ar`;
    const adminPass = `AdminPass!${runId}2026`;
    const adminUname = `u_admin_${runId}`;
    const { data: authAdmin, error: authAdminErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Fase4A QA', nombre_usuario: adminUname },
    });
    if (authAdminErr) throw authAdminErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Fase4A QA',
      nombre_usuario: adminUname,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const adminClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAdminErr } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass,
    });
    if (signInAdminErr) throw signInAdminErr;

    // Team / Operador
    const teamEmail = `f4a.team.${runId}@tdf.gob.ar`;
    const teamPass = `TeamPass!${runId}2026`;
    const teamUname = `u_team_${runId}`;
    const { data: authTeam, error: authTeamErr } = await serviceClient.auth.admin.createUser({
      email: teamEmail,
      password: teamPass,
      email_confirm: true,
      user_metadata: { nombre: 'Operador', apellido: 'Fase4A QA', nombre_usuario: teamUname },
    });
    if (authTeamErr) throw authTeamErr;
    testUsers.push(authTeam.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authTeam.user.id,
      nombre: 'Operador',
      apellido: 'Fase4A QA',
      nombre_usuario: teamUname,
      app_role: 'equipo',
      estado_acceso: 'aprobado',
    });

    const teamClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInTeamErr } = await teamClient.auth.signInWithPassword({
      email: teamEmail,
      password: teamPass,
    });
    if (signInTeamErr) throw signInTeamErr;

    // Observador
    const obsEmail = `f4a.obs.${runId}@tdf.gob.ar`;
    const obsPass = `ObsPass!${runId}2026`;
    const obsUname = `u_obs_${runId}`;
    const { data: authObs, error: authObsErr } = await serviceClient.auth.admin.createUser({
      email: obsEmail,
      password: obsPass,
      email_confirm: true,
      user_metadata: { nombre: 'Observador', apellido: 'Fase4A QA', nombre_usuario: obsUname },
    });
    if (authObsErr) throw authObsErr;
    testUsers.push(authObs.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authObs.user.id,
      nombre: 'Observador',
      apellido: 'Fase4A QA',
      nombre_usuario: obsUname,
      app_role: 'observador',
      estado_acceso: 'aprobado',
    });

    const obsClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInObsErr } = await obsClient.auth.signInWithPassword({
      email: obsEmail,
      password: obsPass,
    });
    if (signInObsErr) throw signInObsErr;

    console.log('  ✓ Usuarios admin, team y observer listos');

    // Categoría y tipo para creación de pedidos
    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id, nombre').eq('categoria_id', cat.id).limit(1).single();

    // Helper para crear un pedido completo en estado 'En proceso' con responsable
    async function createTestPedido(customSolEmail) {
      const envioId = crypto.randomUUID();
      const pedidoId = crypto.randomUUID();
      const solEmail = customSolEmail || `solicitante.${runId}.${crypto.randomUUID().slice(0, 4)}@tdf.gob.ar`;
      const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
      const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');

      await serviceClient.from('envios_formulario').insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: fpHash,
        correo: solEmail,
        nombre_apellido: 'Solicitante QA F4A',
        area_solicitante: 'Dirección de Medios',
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
        informacion_especifica: {
          titulo: `Pedido QA Fase 4A - ${runId}`,
        },
      });
      createdPedidos.push(pedidoId);

      // Asignar al team user (version pasa a 2)
      const { error: assignErr } = await adminClient.rpc('pedido_assign', {
        p_pedido_id: pedidoId,
        p_responsable_user_id: authTeam.user.id,
        p_expected_version: 1,
      });
      if (assignErr) throw assignErr;

      // Cambiar a En proceso (version pasa a 3)
      const { error: stateErr } = await adminClient.rpc('pedido_change_state', {
        p_pedido_id: pedidoId,
        p_target_state: 'En proceso',
        p_expected_version: 2,
      });
      if (stateErr) throw stateErr;

      const { data: curPed } = await serviceClient.from('pedidos').select('version').eq('id', pedidoId).single();

      // Crear sesión para el solicitante
      const rawSessionToken = crypto.randomBytes(32).toString('hex');
      const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
      await serviceClient.from('solicitante_sesiones').insert({
        correo: solEmail,
        session_token_hash: sessionTokenHash,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      createdSessions.push(rawSessionToken);

      return {
        pedidoId,
        envioId,
        pedCode,
        solEmail,
        rawSessionToken,
        version: curPed?.version || 3,
      };
    }

    // -------------------------------------------------------------------------
    // CASO 1: FINALIZACIÓN INICIAL -> V1
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 1: Finalización inicial -> V1 ---');
    const ped1 = await createTestPedido();

    const { data: fin1Res, error: fin1Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/entrega-v1-test',
      p_nota_entrega: 'Material inicial V1 entregado',
    });
    if (fin1Err) throw fin1Err;

    assert(fin1Res?.success === true, 'Caso 1: pedido_finalize retornó success: true');
    assert(fin1Res?.estado === 'Finalizado', 'Caso 1: pedido pasó a Finalizado');

    const { data: v1Rows } = await serviceClient
      .from('pedido_versiones')
      .select('*')
      .eq('pedido_id', ped1.pedidoId);
    assert(v1Rows.length === 1, 'Caso 1: Se insertó exactamente 1 fila en pedido_versiones');
    assert(v1Rows[0].version_number === 1, 'Caso 1: version_number es 1');
    assert(v1Rows[0].finalizado_por === authAdmin.user.id, 'Caso 1: finalizado_por es el admin');
    assert(v1Rows[0].finalizado_at !== null, 'Caso 1: finalizado_at registrado');
    assert(v1Rows[0].entrega_id !== null, 'Caso 1: entrega_id registrado al incluir material');

    // -------------------------------------------------------------------------
    // CASO 2: V1 SOLO NOTA
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 2: V1 solo nota (sin material) ---');
    const ped2 = await createTestPedido();

    const { data: fin2Res, error: fin2Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped2.pedidoId,
      p_expected_version: ped2.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Coordinado telefónicamente, sin material adjunto',
    });
    if (fin2Err) throw fin2Err;

    assert(fin2Res?.success === true, 'Caso 2: Finalización solo nota exitosa');
    assert(fin2Res?.entrega_id === null, 'Caso 2: entrega_id retornado es null');

    const { data: v2Rows } = await serviceClient
      .from('pedido_versiones')
      .select('*')
      .eq('pedido_id', ped2.pedidoId);
    assert(v2Rows.length === 1, 'Caso 2: exactamente 1 fila en pedido_versiones');
    assert(v2Rows[0].version_number === 1, 'Caso 2: version_number es 1');
    assert(v2Rows[0].entrega_id === null, 'Caso 2: entrega_id en pedido_versiones es NULL');
    assert(v2Rows[0].nota_cierre === 'Coordinado telefónicamente, sin material adjunto', 'Caso 2: nota_cierre guardada en pedido_versiones');

    const { data: ent2Vigentes } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('pedido_id', ped2.pedidoId)
      .eq('es_vigente', true);
    assert(ent2Vigentes.length === 0, 'Caso 2: Cero entregas vigentes en entregas_pedido');

    // -------------------------------------------------------------------------
    // CASO 3: REAPERTURA -> En proceso
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 3: Reapertura -> En proceso ---');
    // ped1 está en Finalizado con version 4
    const { data: ped1PreReopen } = await serviceClient.from('pedidos').select('version, estado').eq('id', ped1.pedidoId).single();
    assert(ped1PreReopen.estado === 'Finalizado', 'Caso 3: pedido está Finalizado');

    const { data: reopenRes, error: reopenErr } = await adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1PreReopen.version,
      p_motivo: 'El área solicitó corregir los colores institucionales en el flyer',
    });
    if (reopenErr) throw reopenErr;

    assert(reopenRes?.success === true, 'Caso 3: pedido_reopen_finalized retornó success: true');
    assert(reopenRes?.estado === 'En proceso', 'Caso 3: pedido pasó a "En proceso"');
    assert(reopenRes?.version_reabierta === 1, 'Caso 3: version_reabierta es 1');

    // Verificar domain event
    const { data: devReopen } = await serviceClient
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', ped1.pedidoId)
      .eq('event_name', 'pedido.reopened')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    assert(devReopen !== null, 'Caso 3: Domain event pedido.reopened emitido');
    assert(devReopen.payload?.estado_anterior === 'Finalizado', 'Caso 3: payload.estado_anterior = Finalizado');
    assert(devReopen.payload?.motivo.includes('corregir los colores'), 'Caso 3: payload contiene motivo');

    // Verificar auditoría
    const { data: auditReopen } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('recurso_id', ped1.pedidoId)
      .eq('accion', 'reopen_finalized')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    assert(auditReopen !== null, 'Caso 3: Registro en audit_log creado');

    // -------------------------------------------------------------------------
    // CASO 4: RESPONSABLE PRESERVADO TRAS REAPERTURA
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 4: Responsable preservado tras reapertura ---');
    const { data: ped1PostReopen } = await serviceClient
      .from('pedidos')
      .select('responsable_user_id, retrabajo_activo')
      .eq('id', ped1.pedidoId)
      .single();
    assert(ped1PostReopen.responsable_user_id === authTeam.user.id, 'Caso 4: responsable_user_id preservado (authTeam)');
    assert(ped1PostReopen.retrabajo_activo === false, 'Caso 4: retrabajo_activo permanece false');

    // -------------------------------------------------------------------------
    // CASO 5: MOTIVO OBLIGATORIO
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 5: Motivo obligatorio en reapertura ---');
    // Volver a finalizar ped1 para probar reapertura con motivo vacío
    const { data: ped1Current } = await serviceClient.from('pedidos').select('version').eq('id', ped1.pedidoId).single();
    await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1Current.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Cierre temporal para test de motivo',
    });

    const { data: ped1FinParaTest } = await serviceClient.from('pedidos').select('version').eq('id', ped1.pedidoId).single();

    const { error: emptyMotivoErr } = await adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1FinParaTest.version,
      p_motivo: '   ',
    });
    assert(Boolean(emptyMotivoErr), 'Caso 5: Reapertura con motivo vacío fue rechazada');
    assert(
      emptyMotivoErr?.message.includes('MOTIVO_REQUIRED') || emptyMotivoErr?.message.includes('motivo'),
      `Caso 5: Mensaje de error indica motivo obligatorio: ${emptyMotivoErr?.message}`
    );

    // -------------------------------------------------------------------------
    // CASO 6: OBSERVADOR BLOQUEADO (FORBIDDEN)
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 6: Observador bloqueado (FORBIDDEN) ---');
    const { error: obsErr } = await obsClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1FinParaTest.version,
      p_motivo: 'Intento de reapertura por observador',
    });
    assert(Boolean(obsErr), 'Caso 6: Observador no pudo reabrir pedido finalizado');
    assert(
      obsErr?.message.includes('FORBIDDEN') || obsErr?.message.includes('permisos') || obsErr?.code === '42501',
      `Caso 6: Mensaje de error indica falta de permisos: ${obsErr?.message}`
    );

    // Team user (operador) SÍ puede reabrir
    const { data: teamReopenRes, error: teamReopenErr } = await teamClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped1.pedidoId,
      p_expected_version: ped1FinParaTest.version,
      p_motivo: 'Reapertura válida por operador del equipo',
    });
    if (teamReopenErr) throw teamReopenErr;
    assert(teamReopenRes?.success === true, 'Caso 6: Operador/equipo SÍ pudo reabrir');

    // -------------------------------------------------------------------------
    // CASO 7: DOBLE REAPERTURA -> PT409 (SOLO UNA GANA)
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 7: Doble reapertura (concurrencia optimista PT409) ---');
    const ped3 = await createTestPedido();
    const { error: finPed3Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped3.pedidoId,
      p_expected_version: ped3.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Cierre ped3 para concurrencia',
    });
    if (finPed3Err) throw finPed3Err;
    const { data: ped3Fin } = await serviceClient.from('pedidos').select('version').eq('id', ped3.pedidoId).single();

    // Ejecutar dos reaperturas en paralelo con la misma expected_version
    const p1 = adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped3.pedidoId,
      p_expected_version: ped3Fin.version,
      p_motivo: 'Reapertura paralela A',
    });
    const p2 = adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped3.pedidoId,
      p_expected_version: ped3Fin.version,
      p_motivo: 'Reapertura paralela B',
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    const successes = [r1, r2].filter(r => r.data?.success === true);
    const failures = [r1, r2].filter(r => r.error);

    assert(successes.length === 1, 'Caso 7: Exactamente una reapertura ganó');
    assert(failures.length === 1, 'Caso 7: La segunda reapertura fue rechazada');
    const rejReason = failures[0]?.error?.message || '';
    assert(
      rejReason.includes('VERSION_CONFLICT') || rejReason.includes('40001') || rejReason.includes('PT409') || rejReason.includes('Finalizado'),
      `Caso 7: Error de conflicto correcto: ${rejReason}`
    );

    // -------------------------------------------------------------------------
    // CASO 8: SEGUNDA FINALIZACIÓN -> V2
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 8: Segunda finalización -> V2 ---');
    // ped3 ahora está En proceso tras la reapertura
    const { data: ped3Current } = await serviceClient.from('pedidos').select('version, estado').eq('id', ped3.pedidoId).single();
    assert(ped3Current.estado === 'En proceso', 'Caso 8: ped3 está En proceso');

    const { data: finPed3V2, error: finPed3V2Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped3.pedidoId,
      p_expected_version: ped3Current.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/entrega-v2-final',
      p_nota_entrega: 'Segunda entrega V2 con cambios solicitados',
    });
    if (finPed3V2Err) throw finPed3V2Err;
    assert(finPed3V2?.success === true, 'Caso 8: Segunda finalización exitosa');

    const { data: ped3Versiones } = await serviceClient
      .from('pedido_versiones')
      .select('*')
      .eq('pedido_id', ped3.pedidoId)
      .order('version_number', { ascending: true });
    assert(ped3Versiones.length === 2, 'Caso 8: Hay exactamente 2 versiones en pedido_versiones');
    assert(ped3Versiones[1].version_number === 2, 'Caso 8: La segunda versión tiene version_number = 2');
    assert(ped3Versiones[1].entrega_id !== null, 'Caso 8: V2 tiene entrega_id asociado');

    // -------------------------------------------------------------------------
    // CASO 9: V1 PERMANECE INTACTA
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 9: V1 permanece intacta tras creación de V2 ---');
    const v1Saved = ped3Versiones[0];
    assert(v1Saved.version_number === 1, 'Caso 9: V1 conserva version_number = 1');
    assert(v1Saved.nota_cierre === 'Cierre ped3 para concurrencia', 'Caso 9: V1 conserva nota_cierre original');
    assert(v1Saved.entrega_id === null, 'Caso 9: V1 conserva entrega_id = null');

    // -------------------------------------------------------------------------
    // CASO 10: V1 SIN MATERIAL + V2 CON MATERIAL -> entrega.version = 2
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 10: V1 sin material + V2 con material -> entrega.version = 2 ---');
    // ped3 cumplió esta condición: V1 sin material, V2 con url_entrega
    const { data: entPed3V2 } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('id', ped3Versiones[1].entrega_id)
      .single();
    assert(entPed3V2.version === 2, 'Caso 10: entregas_pedido.version es 2');
    assert(entPed3V2.es_vigente === true, 'Caso 10: entregas_pedido.es_vigente es true');
    assert(entPed3V2.enlace_externo === 'https://drive.google.com/entrega-v2-final', 'Caso 10: enlace_externo coincide');

    // -------------------------------------------------------------------------
    // CASO 11: V1 CON MATERIAL + V2 SIN MATERIAL -> CERO ENTREGA VIGENTE
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 11: V1 con material + V2 sin material -> cero entrega vigente ---');
    const ped4 = await createTestPedido();
    // V1 con material
    const { error: finPed4Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped4.pedidoId,
      p_expected_version: ped4.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/v1-material-entregado',
      p_nota_entrega: 'V1 con archivo',
    });
    if (finPed4Err) throw finPed4Err;
    // Verificar que V1 tiene entrega vigente
    const { data: entV1Before } = await serviceClient
      .from('entregas_pedido')
      .select('es_vigente')
      .eq('pedido_id', ped4.pedidoId)
      .single();
    assert(entV1Before.es_vigente === true, 'Caso 11: Entrega V1 inicialmente es vigente');

    // Reabrir
    const { data: ped4Fin1 } = await serviceClient.from('pedidos').select('version').eq('id', ped4.pedidoId).single();
    await adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped4.pedidoId,
      p_expected_version: ped4Fin1.version,
      p_motivo: 'Se reabre para retirar entrega y cerrar solo con informe oral',
    });

    // Finalizar V2 SIN material (solo nota)
    const { data: ped4Reopened } = await serviceClient.from('pedidos').select('version').eq('id', ped4.pedidoId).single();
    await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped4.pedidoId,
      p_expected_version: ped4Reopened.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'V2 finalizado solo con informe verbal',
    });

    // Comprobar que NINGUNA entrega del pedido queda vigente
    const { data: entVigentesPed4 } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('pedido_id', ped4.pedidoId)
      .eq('es_vigente', true);
    assert(entVigentesPed4.length === 0, 'Caso 11: Invariante cumplido: Cero entregas vigentes cuando V2 finaliza sin material');

    // -------------------------------------------------------------------------
    // CASO 12: 48H INFO REQUEST SIGUE FUNCIONANDO TRAS REAPERTURA
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 12: 48h info request tras reapertura ---');
    const ped5 = await createTestPedido();
    const { error: finPed5Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped5.pedidoId,
      p_expected_version: ped5.version,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'Cierre inicial ped5',
    });
    if (finPed5Err) throw finPed5Err;
    const { data: ped5Fin } = await serviceClient.from('pedidos').select('version').eq('id', ped5.pedidoId).single();
    await adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped5.pedidoId,
      p_expected_version: ped5Fin.version,
      p_motivo: 'Reabierto para consultar datos faltantes al solicitante',
    });

    const { data: ped5Reopened } = await serviceClient.from('pedidos').select('version, estado').eq('id', ped5.pedidoId).single();
    assert(ped5Reopened.estado === 'En proceso', 'Caso 12: Pedido está En proceso tras reapertura');

    // Emitir solicitud de información de 48h
    const solInfoId = crypto.randomUUID();
    const rawBytes = new Uint8Array(32);
    crypto.getRandomValues(rawBytes);
    const rawToken = Array.from(rawBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const hashBuffer = crypto.createHash('sha256').update(rawToken).digest('hex');

    const fakeEnvelope = { ciphertext: 'aGVsbG8=', iv: 'MTIzNDU2Nzg5MDEy', tag: 'YWJjZGVmZ2hpamtsbW5vcA==' };

    const { data: infoReqRes, error: infoReqErr } = await serviceClient.rpc('info_request_create_atomic', {
      p_solicitud_id: solInfoId,
      p_pedido_id: ped5.pedidoId,
      p_actor_user_id: authAdmin.user.id,
      p_mensaje: 'Por favor indicar el horario de inicio y fin para la cobertura',
      p_token_hash: hashBuffer,
      p_encrypted_envelope: fakeEnvelope,
      p_expected_version: ped5Reopened.version,
    });
    if (infoReqErr) throw infoReqErr;
    assert(infoReqRes?.solicitud_id === solInfoId, 'Caso 12: Solicitud de info 48h creada exitosamente tras reapertura');

    const { data: siRow } = await serviceClient
      .from('solicitudes_informacion')
      .select('estado, expires_at')
      .eq('id', solInfoId)
      .single();
    assert(siRow.estado === 'pendiente', 'Caso 12: Solicitud está pendiente');
    const diffHours = (new Date(siRow.expires_at).getTime() - Date.now()) / (1000 * 60 * 60);
    assert(diffHours > 47 && diffHours <= 49, `Caso 12: Vigencia es de 48 horas (~${diffHours.toFixed(1)}h)`);

    // -------------------------------------------------------------------------
    // CASO 13: REVISIÓN SOLICITANTE DESPUÉS DE V2 -> PRÓXIMA FINALIZACIÓN V3
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 13: Revisión solicitante después de V2 -> próxima finalización V3 ---');
    // ped3 tiene V1 y V2, y actualmente está Finalizado
    const { data: ped3PreRev } = await serviceClient.from('pedidos').select('version, estado').eq('id', ped3.pedidoId).single();
    assert(ped3PreRev.estado === 'Finalizado', 'Caso 13: ped3 está Finalizado en V2');

    // Solicitante solicita revisión
    const { data: revSolRes, error: revSolErr } = await serviceClient.rpc('pedido_request_revision', {
      p_session_token: ped3.rawSessionToken,
      p_pedido_id: ped3.pedidoId,
      p_motivo: 'Se requiere una corrección en el texto final del banner',
      p_archivos_ids: [],
    });
    if (revSolErr) throw revSolErr;
    assert(revSolRes?.success === true, 'Caso 13: Solicitud de revisión del solicitante exitosa');
    assert(revSolRes?.retrabajo_activo === true, 'Caso 13: retrabajo_activo activado');

    // Verificar estado: 'Nuevo' según flujo de revisión
    const { data: ped3EnRetrabajo } = await serviceClient.from('pedidos').select('version, estado, responsable_user_id').eq('id', ped3.pedidoId).single();
    if (ped3EnRetrabajo.estado === 'Nuevo') {
      const { error: chErr } = await adminClient.rpc('pedido_change_state', {
        p_pedido_id: ped3.pedidoId,
        p_target_state: 'En proceso',
        p_expected_version: ped3EnRetrabajo.version,
      });
      if (chErr) throw chErr;
    }

    const { data: ped3ReadyToFin } = await serviceClient.from('pedidos').select('version').eq('id', ped3.pedidoId).single();

    // Finalizar nuevamente -> DEBE SER V3
    const { data: finPed3V3, error: finPed3V3Err } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped3.pedidoId,
      p_expected_version: ped3ReadyToFin.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/entrega-v3-corregida',
      p_nota_entrega: 'Tercera versión corregida tras revisión solicitante',
    });
    if (finPed3V3Err) throw finPed3V3Err;
    assert(finPed3V3?.success === true, 'Caso 13: Finalización V3 exitosa');

    const { data: ped3VersionesFinales } = await serviceClient
      .from('pedido_versiones')
      .select('*')
      .eq('pedido_id', ped3.pedidoId)
      .order('version_number', { ascending: true });
    assert(ped3VersionesFinales.length === 3, 'Caso 13: Existen exactamente 3 versiones canónicas');
    assert(ped3VersionesFinales[2].version_number === 3, 'Caso 13: La última versión tiene version_number = 3');

    // -------------------------------------------------------------------------
    // CASO 14: PORTAL SOLICITANTE MUESTRA HISTORIAL V1/V2/V3 SEGURO
    // -------------------------------------------------------------------------
    console.log('\n--- CASO 14: Portal solicitante muestra historial V1/V2/V3 seguro ---');
    // Insertar una nota interna confidencial en ped3 para confirmar que NO se expone
    await serviceClient.from('notas_pedido').insert({
      id: crypto.randomUUID(),
      pedido_id: ped3.pedidoId,
      autor_user_id: authAdmin.user.id,
      visibilidad: 'interna',
      texto: 'SECRETO_INTERNO_CONFIDENCIAL_QA — NUNCA exponer al solicitante',
    });

    const { data: solicitanteDetail, error: solDetailErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: ped3.rawSessionToken,
      p_pedido_ref: ped3.pedCode,
    });
    if (solDetailErr) throw solDetailErr;

    assert(solicitanteDetail !== null, 'Caso 14: solicitante_get_pedido_detail retornó datos');
    assert(Array.isArray(solicitanteDetail.versiones), 'Caso 14: solicitanteDetail.versiones es un Array');
    assert(solicitanteDetail.versiones.length === 3, `Caso 14: solicitanteDetail.versiones contiene 3 versiones (retornó ${solicitanteDetail.versiones.length})`);

    // Orden DESC: V3 primero, luego V2, luego V1
    assert(solicitanteDetail.versiones[0].version_number === 3, 'Caso 14: Primera versión en lista es V3');
    assert(solicitanteDetail.versiones[1].version_number === 2, 'Caso 14: Segunda versión en lista es V2');
    assert(solicitanteDetail.versiones[2].version_number === 1, 'Caso 14: Tercera versión en lista es V1');

    // Verificar que los datos de entrega de V3 y V2 están presentes
    assert(solicitanteDetail.versiones[0].enlace_externo === 'https://drive.google.com/entrega-v3-corregida', 'Caso 14: V3 contiene enlace_externo correcto');
    assert(solicitanteDetail.versiones[0].nota === 'Tercera versión corregida tras revisión solicitante', 'Caso 14: V3 contiene nota correcta');

    // Verificar no-filtrado de notas internas
    const jsonStr = JSON.stringify(solicitanteDetail);
    assert(!jsonStr.includes('SECRETO_INTERNO_CONFIDENCIAL_QA'), 'Caso 14: CERO fuga de notas internas en la respuesta del solicitante');

    // Verificar que los eventos de reapertura en el historial son amigables
    const historialReopen = (solicitanteDetail.historial || []).filter(h => h.evento === 'pedido.reopened');
    if (historialReopen.length > 0) {
      assert(
        historialReopen.every(h => h.descripcion.includes('reabrió') || h.descripcion.includes('actualización')),
        'Caso 14: Evento pedido.reopened tiene texto amigable en historial del solicitante'
      );
    }

    console.log('\n================================================================');
    console.log(`RESUMEN FINAL: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS CON ÉXITO (100%)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ ERROR EN SUITE DE VERIFICACIÓN:', err);
    process.exitCode = 1;
  } finally {
    console.log('--- Limpiando fixtures de prueba ---');
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      } catch {}
    }
    for (const pedId of createdPedidos) {
      try {
        await serviceClient.from('pedido_versiones').delete().eq('pedido_id', pedId);
        await serviceClient.from('entregas_pedido').delete().eq('pedido_id', pedId);
        await serviceClient.from('revision_pedidos').delete().eq('pedido_id', pedId);
        await serviceClient.from('solicitudes_informacion').delete().eq('pedido_id', pedId);
        await serviceClient.from('notas_pedido').delete().eq('pedido_id', pedId);
        await serviceClient.from('domain_events').delete().eq('aggregate_id', pedId);
        await serviceClient.from('pedido_auditoria').delete().eq('pedido_id', pedId);
        await serviceClient.from('pedidos').delete().eq('id', pedId);
      } catch {}
    }
    for (const envioId of createdEnvios) {
      try {
        await serviceClient.from('envios_formulario').delete().eq('id', envioId);
      } catch {}
    }
    for (const token of createdSessions) {
      try {
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        await serviceClient.from('solicitante_sesiones').delete().eq('session_token_hash', hash);
      } catch {}
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
