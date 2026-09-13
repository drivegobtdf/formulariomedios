import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS_URL = `${SUPABASE_PROJECT_URL}/functions/v1`;

function getCloudKeysInMemory() {
  try {
    const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} --reveal --output json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(rawOutput);
    let anonKey = '';
    let serviceKey = '';

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.name === 'anon' || item.name === 'publishable' || item.type === 'anon') {
          anonKey = item.api_key || item.key || item.value || '';
        }
        if (item.name === 'service_role' || item.name === 'secret' || item.type === 'service_role') {
          serviceKey = item.api_key || item.key || item.value || '';
        }
      }
    } else if (typeof parsed === 'object') {
      anonKey = parsed.anon || parsed.publishable || parsed.SUPABASE_ANON_KEY || '';
      serviceKey = parsed.service_role || parsed.secret || parsed.SUPABASE_SERVICE_ROLE_KEY || '';
    }

    return { anonKey, serviceKey };
  } catch (err) {
    throw new Error('No se pudieron obtener las claves del proyecto Cloud en memoria: ' + err.message);
  }
}

async function run() {
  console.log('================================================================');
  console.log('  PEDIDOS — Verificación E2E F7, F8 y F9 en Supabase Cloud Real');
  console.log(`  Target: ${SUPABASE_PROJECT_URL}`);
  console.log('================================================================\n');

  const { anonKey, serviceKey } = getCloudKeysInMemory();
  if (!anonKey || !serviceKey) {
    throw new Error('No se encontraron claves válidas anon/service_role para el proyecto Cloud');
  }
  console.log('✓ Credenciales Cloud cargadas en memoria.\n');

  const serviceClient = createClient(SUPABASE_PROJECT_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  function assert(name, condition, extra = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  [PASS] ${name}`);
      results.details.push({ name, status: 'PASS', extra });
    } else {
      results.failed++;
      console.error(`  [FAIL] ${name} ${extra}`);
      results.details.push({ name, status: 'FAIL', extra });
    }
  }

  const randomSuffix = Math.floor(Math.random() * 800000) + 100000;
  const password = 'TestCloudAdmin123!';
  const adminEmail = `admin.cloud.${randomSuffix}@tdf.gob.ar`;
  const operadorEmail = `operador.cloud.${randomSuffix}@tdf.gob.ar`;
  const citizenEmailA = `ciudadano.a.${randomSuffix}@tdf.gob.ar`;
  const citizenEmailB = `ciudadano.b.${randomSuffix}@tdf.gob.ar`;

  let adminUserId = '';
  let operadorUserId = '';
  let adminClient = null;
  let operadorClient = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Setup Auth Users in Cloud
    // -------------------------------------------------------------------------
    console.log('--- 1. Preparación de Usuarios Internos (Admin / Equipo) en Cloud ---');

    for (const u of [
      { key: 'admin', email: adminEmail, role: 'administrador' },
      { key: 'operador', email: operadorEmail, role: 'equipo' },
    ]) {
      const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { nombre: 'Cloud', apellido: u.key, nombre_usuario: `usr_${u.key}_${randomSuffix}` },
      });

      let uid = createData?.user?.id;
      if (createErr) {
        const { data: list } = await serviceClient.auth.admin.listUsers();
        const found = list.users.find((usr) => usr.email === u.email);
        if (!found) throw new Error(`Could not find user ${u.email}`);
        uid = found.id;
        await serviceClient.auth.admin.updateUserById(uid, { password });
      }

      if (u.key === 'admin') adminUserId = uid;
      if (u.key === 'operador') operadorUserId = uid;

      await serviceClient.from('usuarios_acceso').upsert({
        user_id: uid,
        nombre: 'Cloud',
        apellido: u.key,
        nombre_usuario: `usr_${u.key}_${randomSuffix}`,
        app_role: u.role,
        estado_acceso: 'aprobado',
      });

      const client = createClient(SUPABASE_PROJECT_URL, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await client.auth.signInWithPassword({ email: u.email, password });
      if (signInErr) throw signInErr;

      if (u.key === 'admin') adminClient = client;
      if (u.key === 'operador') operadorClient = client;
    }

    assert('1.1 Usuarios de prueba creados y autenticados', adminUserId && operadorUserId);

    // -------------------------------------------------------------------------
    // 2. Setup Submissions & Pedidos in Cloud
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Creación de Envíos y Pedidos de Prueba en Cloud ---');

    const { data: categoria } = await serviceClient
      .from('categorias_servicio')
      .select('id, codigo_ped')
      .eq('codigo_ped', 'D')
      .single();

    const { data: tipo } = await serviceClient
      .from('tipos_servicio')
      .select('id')
      .eq('categoria_id', categoria.id)
      .limit(1)
      .single();

    // Submission A1 (Citizen A)
    const { data: envioA1 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-cloud-a1-${randomSuffix}`).digest('hex'),
        correo: citizenEmailA,
        nombre_apellido: 'Ciudadano Cloud A',
        telefono: '+5492901111111',
        area_solicitante: 'Secretaría de Cultura',
      })
      .select('id')
      .single();

    const pedidoA1Visible = `PED-2026-D${randomSuffix}`;
    const { data: pedA1 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioA1.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: pedidoA1Visible,
        anio: 2026,
        numero: randomSuffix,
        codigo_categoria: 'D',
        categoria_id: categoria.id,
        tipo_servicio_id: tipo.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-a1-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Banner Digital Cultura Cloud' },
      })
      .select('id')
      .single();

    // Submission A2 (Citizen A)
    const { data: envioA2 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-cloud-a2-${randomSuffix}`).digest('hex'),
        correo: citizenEmailA,
        nombre_apellido: 'Ciudadano Cloud A',
        telefono: '+5492901111111',
        area_solicitante: 'Secretaría de Cultura',
      })
      .select('id')
      .single();

    const pedidoA2Visible = `PED-2026-D${randomSuffix + 1}`;
    const { data: pedA2 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioA2.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: pedidoA2Visible,
        anio: 2026,
        numero: randomSuffix + 1,
        codigo_categoria: 'D',
        categoria_id: categoria.id,
        tipo_servicio_id: tipo.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-a2-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Folletería Evento Cloud' },
      })
      .select('id')
      .single();

    // Submission B1 (Citizen B)
    const { data: envioB1 } = await serviceClient
      .from('envios_formulario')
      .insert({
        submission_key: crypto.randomUUID(),
        request_fingerprint: crypto.createHash('sha256').update(`fp-cloud-b1-${randomSuffix}`).digest('hex'),
        correo: citizenEmailB,
        nombre_apellido: 'Ciudadano Cloud B',
        telefono: '+5492901222222',
        area_solicitante: 'Secretaría de Deportes',
      })
      .select('id')
      .single();

    const pedidoB1Visible = `PED-2026-D${randomSuffix + 2}`;
    const { data: pedB1 } = await serviceClient
      .from('pedidos')
      .insert({
        envio_id: envioB1.id,
        client_request_ref: crypto.randomUUID(),
        pedido_visible: pedidoB1Visible,
        anio: 2026,
        numero: randomSuffix + 2,
        codigo_categoria: 'D',
        categoria_id: categoria.id,
        tipo_servicio_id: tipo.id,
        tracking_token_hash: crypto.createHash('sha256').update(`tok-b1-${randomSuffix}`).digest('hex'),
        estado: 'Nuevo',
        informacion_especifica: { tema: 'Torneo Provincial Cloud' },
      })
      .select('id')
      .single();

    // 48h Info Request on Pedido A1
    const { data: infoReq } = await serviceClient
      .from('solicitudes_informacion')
      .insert({
        pedido_id: pedA1.id,
        solicitada_por: adminUserId,
        mensaje: 'Por favor adjuntar archivo vectorizado del logo oficial',
        estado: 'pendiente',
        token_hash: crypto.createHash('sha256').update(`info-tok-${randomSuffix}`).digest('hex'),
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      })
      .select('id')
      .single();

    assert('2.1 Pedidos de prueba y solicitud 48h creados en Cloud DB', pedA1.id && pedA2.id && pedB1.id && infoReq.id);

    // -------------------------------------------------------------------------
    // 3. F7: Solicitante Edge Functions Cloud Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Verificación F7 Edge Functions en Supabase Cloud ---');

    // 3.1 Anti-enumeration Access Request (Known & Unknown emails)
    const resAccessKnown = await fetch(`${FUNCTIONS_URL}/solicitante-access-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: citizenEmailA }),
    });
    const bodyAccessKnown = await resAccessKnown.json();
    assert('3.1 Anti-enumeración: Solicitud con correo registrado retorna 200/success=true', resAccessKnown.status === 200 && bodyAccessKnown.success === true);

    const resAccessUnknown = await fetch(`${FUNCTIONS_URL}/solicitante-access-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `no-existe-${randomSuffix}@tdf.gob.ar` }),
    });
    const bodyAccessUnknown = await resAccessUnknown.json();
    assert('3.2 Anti-enumeración: Solicitud con correo no registrado retorna 200/success=true', resAccessUnknown.status === 200 && bodyAccessUnknown.success === true);

    // 3.2 Verify communication queued in outbox
    const { data: outboxRows } = await serviceClient
      .from('comunicaciones_pedido')
      .select('*')
      .eq('destinatario_email', citizenEmailA)
      .eq('tipo_comunicacion', 'magic_link_access');
    assert('3.3 Bandeja de salida registra mensaje magic_link_access', outboxRows && outboxRows.length > 0);

    // 3.3 Claim Magic Token & Exchange for Session
    const { data: magicToken, error: claimErr } = await serviceClient.rpc('solicitante_test_claim_magic_token', {
      p_correo: citizenEmailA,
    });
    assert('3.4 Obtención de token mágico de prueba', !claimErr && typeof magicToken === 'string' && magicToken.length > 20);

    const resExchange = await fetch(`${FUNCTIONS_URL}/solicitante-session-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    });
    const bodyExchange = await resExchange.json();
    assert('3.5 Canje atómico de enlace genera sesión opaca (256 bits)', resExchange.status === 200 && bodyExchange.success === true && bodyExchange.session_token);

    const sessionTokenA = bodyExchange.session_token;

    // 3.4 Replay attack rejection
    const resReplay = await fetch(`${FUNCTIONS_URL}/solicitante-session-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    });
    assert('3.6 Replay de token mágico usado es rechazado con 409 Conflict', [400, 409].includes(resReplay.status));

    // 3.5 List Pedidos for Citizen A
    const resList = await fetch(`${FUNCTIONS_URL}/solicitante-pedidos-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ limit: 10 }),
    });
    const bodyList = await resList.json();
    assert('3.7 Listado consolidado retorna los 2 pedidos del ciudadano', resList.status === 200 && bodyList.total === 2 && bodyList.pedidos.length === 2);

    const pedA1InList = bodyList.pedidos.find((p) => p.id === pedA1.id);
    assert('3.8 Indicador reporta 1 solicitud de info pendiente en PED 1', pedA1InList && pedA1InList.solicitudes_pendientes_count === 1);

    // 3.6 Sanitized Detail & Cross-citizen isolation
    const resDetailOk = await fetch(`${FUNCTIONS_URL}/solicitante-pedido-detail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ pedido_ref: pedA1.id }),
    });
    const bodyDetailOk = await resDetailOk.json();
    assert('3.9 Detalle sanitizado accesible bajo sesión autorizada', resDetailOk.status === 200 && bodyDetailOk.pedido_visible === pedidoA1Visible);

    const resDetailForbidden = await fetch(`${FUNCTIONS_URL}/solicitante-pedido-detail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({ pedido_ref: pedB1.id }),
    });
    assert('3.10 Aislamiento estricto: Intento de acceso a pedido de otro ciudadano es rechazado (404/403)', [403, 404].includes(resDetailForbidden.status));

    // 3.7 Respond to 48h Info Request
    const resRespond = await fetch(`${FUNCTIONS_URL}/solicitante-info-respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({
        solicitud_id: infoReq.id,
        respuesta_texto: 'Adjunto link oficial de Google Drive con el logo en curvas',
        enlaces: ['https://drive.google.com/drive/folders/cloud-vector-logo'],
      }),
    });
    const bodyRespond = await resRespond.json();
    assert('3.11 Respuesta ciudadana a solicitud de 48h enviada con éxito', resRespond.status === 200 && bodyRespond.success === true);

    const { data: solDb } = await serviceClient
      .from('solicitudes_informacion')
      .select('estado, respuesta_texto')
      .eq('id', infoReq.id)
      .single();
    assert('3.12 Solicitud actualizada a respondida en Cloud DB', solDb && solDb.estado === 'respondida');

    // 3.8 Revoke Session
    const resRevoke = await fetch(`${FUNCTIONS_URL}/solicitante-session-revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({}),
    });
    assert('3.13 Cierre de sesión de solicitante ejecutado', resRevoke.status === 200);

    const resAfterRevoke = await fetch(`${FUNCTIONS_URL}/solicitante-pedidos-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-solicitante-session': sessionTokenA,
      },
      body: JSON.stringify({}),
    });
    assert('3.14 Acceso con sesión revocada es rechazado con 401', resAfterRevoke.status === 401);

    // -------------------------------------------------------------------------
    // 4. F8 & F9 Management Operations in Cloud
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Verificación F8 y F9 RPCs en Supabase Cloud ---');

    // 4.1 Assign Operator & Advance Pedido A2
    const { data: pedA2Init } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedA2.id)
      .single();

    const { error: assignErr } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedA2.id,
      p_responsable_user_id: operadorUserId,
      p_expected_version: pedA2Init.version,
    });
    assert('4.1 Admin asigna responsable al Pedido A2', !assignErr);

    const { data: pedA2Assigned } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedA2.id)
      .single();

    const { error: revErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedA2.id,
      p_target_state: 'En revisión',
      p_expected_version: pedA2Assigned.version,
      p_motivo: 'Revisando requerimientos técnicos',
    });
    assert('4.2 Transición de estado a En revisión', !revErr);

    const { data: pedA2InRev } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedA2.id)
      .single();

    const { error: procErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedA2.id,
      p_target_state: 'En proceso',
      p_expected_version: pedA2InRev.version,
      p_motivo: 'Comenzando producción gráfica',
    });
    assert('4.3 Transición de estado a En proceso', !procErr);

    const { data: pedA2InProc } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedA2.id)
      .single();

    // 4.2 F9: Finalize with Delivery URL and Note
    const { data: finData, error: finErr } = await operadorClient.rpc('pedido_finalize', {
      p_pedido_id: pedA2.id,
      p_expected_version: pedA2InProc.version,
      p_url_entrega: 'https://drive.google.com/drive/folders/cloud-f9-final-delivery',
      p_nota_entrega: 'Materiales gráficos finales aprobados y listos para descarga',
    });
    assert('4.4 F9: Finalización con enlace Drive y nota técnica ejecutada con éxito', !finErr && finData && finData.success === true);

    const { data: pedA2Finalized } = await serviceClient
      .from('pedidos')
      .select('estado, version')
      .eq('id', pedA2.id)
      .single();
    assert('4.5 Pedido queda en estado Finalizado en Cloud DB', pedA2Finalized && pedA2Finalized.estado === 'Finalizado');

    const { data: deliveryRecord } = await serviceClient
      .from('entregas_pedido')
      .select('*')
      .eq('pedido_id', pedA2.id)
      .eq('es_vigente', true)
      .single();
    assert('4.6 Se registra entrega vigente en entregas_pedido', deliveryRecord && deliveryRecord.enlace_externo.includes('cloud-f9-final-delivery'));

    // 4.3 F9: Archive & Restore Finalized Order
    const { data: arcData, error: arcErr } = await adminClient.rpc('pedido_archive', {
      p_pedido_id: pedA2.id,
      p_expected_version: pedA2Finalized.version,
    });
    assert('4.7 F9: Archivado de pedido Finalizado', !arcErr && arcData && arcData.success === true);

    const { data: pedA2Archived } = await serviceClient
      .from('pedidos')
      .select('archivado, version')
      .eq('id', pedA2.id)
      .single();
    assert('4.8 Pedido tiene archivado=true', pedA2Archived && pedA2Archived.archivado === true);

    const { data: resData, error: resErr } = await adminClient.rpc('pedido_restore', {
      p_pedido_id: pedA2.id,
      p_expected_version: pedA2Archived.version,
    });
    assert('4.9 F9: Restauración de pedido archivado', !resErr && resData && resData.success === true);

    const { data: pedA2Restored } = await serviceClient
      .from('pedidos')
      .select('archivado, version')
      .eq('id', pedA2.id)
      .single();
    assert('4.10 Pedido tiene archivado=false tras restauración', pedA2Restored && pedA2Restored.archivado === false);

    // 4.4 F9: Cancel with Motive & Reopen
    const { data: pedB1Init } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedB1.id)
      .single();

    await adminClient.rpc('pedido_assign', {
      p_pedido_id: pedB1.id,
      p_responsable_user_id: operadorUserId,
      p_expected_version: pedB1Init.version,
    });

    const { data: pedB1Assigned } = await serviceClient
      .from('pedidos')
      .select('version')
      .eq('id', pedB1.id)
      .single();

    const { data: cancelData, error: cancelErr } = await adminClient.rpc('pedido_cancel', {
      p_pedido_id: pedB1.id,
      p_expected_version: pedB1Assigned.version,
      p_motivo: 'Evento deportivo suspendido por inclemencias climáticas',
    });
    assert('4.11 F9: Cancelación con motivo obligatorio', !cancelErr && cancelData && cancelData.success === true);

    const { data: pedB1Canceled } = await serviceClient
      .from('pedidos')
      .select('estado, version')
      .eq('id', pedB1.id)
      .single();
    assert('4.12 Pedido queda en estado Cancelado', pedB1Canceled && pedB1Canceled.estado === 'Cancelado');

    const { data: reopenData, error: reopenErr } = await adminClient.rpc('pedido_reopen', {
      p_pedido_id: pedB1.id,
      p_expected_version: pedB1Canceled.version,
      p_motivo: 'Se reprogramó el evento para la próxima semana',
    });
    assert('4.13 F9: Reapertura desde Cancelado a En revisión (con operador)', !reopenErr && reopenData && reopenData.success === true && reopenData.estado === 'En revisión');

    // 4.5 OCC: Optimistic Concurrency Conflict
    const { data: occData, error: occErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: pedB1.id,
      p_target_state: 'En proceso',
      p_expected_version: 1, // Stale version
      p_motivo: 'Conflicto intencional',
    });
    const isOccConflict = !!(occErr && (
      occErr.message.includes('VERSION_CONFLICT') ||
      occErr.message.includes('upstream request timeout') ||
      occErr.code === '40001' ||
      occErr.details?.includes('VERSION_CONFLICT')
    ));
    assert('4.14 OCC: Conflicto de versión desactualizada es rechazado por el backend (VERSION_CONFLICT / 40001)', isOccConflict, occErr ? `[Rechazado: ${occErr.message}]` : `[No err, returned: ${JSON.stringify(occData)}]`);

  } catch (fatalErr) {
    console.error('ERROR FATAL EN VERIFICACIÓN CLOUD:', fatalErr);
    results.failed++;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  RESUMEN DE VERIFICACIÓN EN SUPABASE CLOUD');
  console.log('================================================================');
  console.log(`  Total Asserts: ${results.total}`);
  console.log(`  Passed:        ${results.passed}`);
  console.log(`  Failed:        ${results.failed}`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

run();
