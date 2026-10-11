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
  console.log('AUDITORÍA DE RESPUESTA ACTUAL DE solicitante_get_pedido_detail');
  console.log('Proyecto TEST: ' + TEST_PROJECT_REF);
  console.log('================================================================\n');

  const { serviceKey, anonKey } = getApiKeys();
  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const testUsers = [];

  try {
    // 1. Crear usuario admin/operador
    const adminEmail = `audit.admin.${runId}@tdf.gob.ar`;
    const adminPass = `AuditPass!${runId}2026`;
    const adminUname = `u_audit_${runId}`;

    const { data: authAdmin, error: authErr } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Audit QA', nombre_usuario: adminUname },
    });
    if (authErr) throw authErr;
    testUsers.push(authAdmin.user);

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Audit QA',
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

    // 2. Crear envío público y pedido público
    const solEmail = `solicitante.audit.${runId}@tdf.gob.ar`;
    const envioId = crypto.randomUUID();
    const pedidoId = crypto.randomUUID();
    const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');
    const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');

    const { error: envioErr } = await serviceClient.from('envios_formulario').insert({
      id: envioId,
      submission_key: crypto.randomUUID(),
      request_fingerprint: fpHash,
      correo: solEmail,
      nombre_apellido: 'Solicitante Auditoría',
      area_solicitante: 'Dirección General de Comunicación',
      telefono: '2901-440000',
    });
    if (envioErr) throw envioErr;

    const { data: cat } = await serviceClient.from('categorias_servicio').select('id, codigo_ped, nombre').limit(1).single();
    const { data: tipo } = await serviceClient.from('tipos_servicio').select('id, nombre').limit(1).single();

    const { data: maxNumData } = await serviceClient
      .from('pedidos')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1);
    const nextNum = (maxNumData?.[0]?.numero || 0) + 1;
    const pedCode = `PED-2026-${cat.codigo_ped}${nextNum}`;

    const { error: pedErr } = await serviceClient.from('pedidos').insert({
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
        titulo: 'Campaña Informativa de Vacunación',
        publico_objetivo: 'Comunidad general',
      },
    });
    if (pedErr) throw pedErr;

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

    // 3. Asignar y cambiar a En proceso
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

    // 4. Insertar nota interna ("SECRETO_INTERNO_QA_NO_EXPONER")
    await serviceClient.from('notas_pedido').insert({
      id: crypto.randomUUID(),
      pedido_id: pedidoId,
      autor_user_id: authAdmin.user.id,
      visibilidad: 'interna',
      texto: 'SECRETO_INTERNO_QA_NO_EXPONER — Nota confidencial interna del equipo',
    });

    // 5. Insertar nota pública ("Nota informativa previa para solicitante")
    await serviceClient.from('notas_pedido').insert({
      id: crypto.randomUUID(),
      pedido_id: pedidoId,
      autor_user_id: authAdmin.user.id,
      visibilidad: 'solicitante',
      texto: 'Nota informativa previa para el solicitante',
    });

    // 6. Solicitud de información y respuesta
    const solInfoId = crypto.randomUUID();
    await serviceClient.from('solicitudes_informacion').insert({
      id: solInfoId,
      pedido_id: pedidoId,
      mensaje: '¿Podría confirmar la fecha exacta del evento?',
      estado: 'respondida',
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      respuesta_texto: 'Sí, el evento se realizará el 25 de Octubre.',
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
        motivo: 'Faltaba fecha en la solicitud',
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

    // 7. Finalizar con nota sola ("todo ok")
    const { data: finRes, error: finErr } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: pedidoId,
      p_expected_version: 3,
      p_archivos_entrega: null,
      p_url_entrega: null,
      p_nota_entrega: 'todo ok',
    });
    if (finErr) throw finErr;
    console.log('Pedido finalizado con éxito:', finRes);

    // 8. Crear sesión de solicitante
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    await serviceClient.from('solicitante_sesiones').insert({
      correo: solEmail,
      session_token_hash: sessionTokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    // 9. Ejecutar solicitante_get_pedido_detail
    const { data: detailData, error: detailErr } = await serviceClient.rpc('solicitante_get_pedido_detail', {
      p_session_token: rawSessionToken,
      p_pedido_ref: pedCode,
    });

    if (detailErr) throw detailErr;

    console.log('\n================================================================');
    console.log('ESTRUCTURA JSON COMPLETA ACTUALMENTE RETORNADA POR EL RPC:');
    console.log('================================================================\n');
    console.log(JSON.stringify(detailData, null, 2));

  } catch (err) {
    console.error('Error durante la auditoría:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Limpiando usuarios de auditoría ---');
    for (const u of testUsers) {
      try {
        await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
        await serviceClient.auth.admin.deleteUser(u.id);
      } catch {}
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
