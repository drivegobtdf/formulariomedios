import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';

function getCloudServiceKey(projectRef) {
  const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${projectRef} --reveal --output json`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(rawOutput);
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.name === 'service_role' || item.name === 'secret' || item.type === 'service_role') {
        return item.api_key || item.key || item.value || '';
      }
    }
  }
  throw new Error(`Service role key no encontrada para ${projectRef}`);
}

function getCloudAnonKey(projectRef) {
  const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${projectRef} --reveal --output json`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(rawOutput);
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.name === 'anon' || item.type === 'anon' || item.name === 'publishable') {
        return item.api_key || item.key || item.value || '';
      }
    }
  }
  throw new Error(`Anon key no encontrada para ${projectRef}`);
}

async function runE2EQA() {
  console.log('========================================================');
  console.log(' QA REAL END-TO-END: GESTIÓN DE ARCHIVOS Y GOOGLE DRIVE ');
  console.log(` Entorno: Supabase PROD (${PROD_REF})                  `);
  console.log('========================================================\n');

  const serviceKey = getCloudServiceKey(PROD_REF);
  const anonKey = getCloudAnonKey(PROD_REF);
  const supabaseUrl = `https://${PROD_REF}.supabase.co`;

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Obtener usuario administrador / equipo para pruebas
  const { data: adminUser } = await adminClient
    .from('usuarios_acceso')
    .select('user_id, nombre, apellido, nombre_usuario, app_role')
    .eq('estado_acceso', 'aprobado')
    .in('app_role', ['administrador', 'equipo'])
    .limit(1)
    .single();

  if (!adminUser) {
    throw new Error('No se encontró un usuario aprobado con rol administrador o equipo en PROD.');
  }

  // Obtener correo del usuario desde auth.users
  const { data: authUserData, error: authUserErr } = await adminClient.auth.admin.getUserById(adminUser.user_id);
  if (authUserErr || !authUserData.user?.email) {
    throw new Error(`No se pudo obtener correo para el usuario ${adminUser.nombre_usuario}: ${authUserErr?.message}`);
  }
  const adminEmail = authUserData.user.email;

  console.log(`[QA] Operador de prueba: ${adminUser.nombre_usuario} (ID: ${adminUser.user_id}, Rol: ${adminUser.app_role})`);

  // Generar sesión JWT real para el operador
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
  });
  if (linkErr) throw new Error(`Error generando enlace de autenticación: ${linkErr.message}`);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: otpData, error: otpErr } = await authClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !otpData.session?.access_token) {
    throw new Error(`Error obteniendo sesión JWT: ${otpErr?.message}`);
  }
  const operatorJwt = otpData.session.access_token;
  console.log('  ✓ Sesión JWT de operador interno generada exitosamente');

  const operatorClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${operatorJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // =========================================================================
  // CASO 1: Solicitud con 2 archivos -> Carpeta SOLICITUD {PED} en Google Drive
  // =========================================================================
  console.log('\n--- CASO 1: Creación de Solicitud con 2 Archivos ---');

  // A. Preparar sesión de envío
  const prepRes = await fetch(`${supabaseUrl}/functions/v1/submission-session-prepare`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { test: true } }),
  });
  if (!prepRes.ok) throw new Error(`Fallo en submission-session-prepare: ${prepRes.status}`);
  const { session_id, capability_token, submission_key } = await prepRes.json();
  console.log(`  ✓ Sesión de envío preparada: ${session_id} (Key: ${submission_key})`);

  // B. Subir archivo 1
  const clientRef1 = crypto.randomUUID();
  const file1Content = Buffer.from('%PDF-1.4 Mock PDF Content 1 for QA Testing');
  const upPrep1 = await fetch(`${supabaseUrl}/functions/v1/drive-upload-prepare`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      capability_token,
      expected_name: 'prueba-qa-solicitud-1.pdf',
      expected_size: file1Content.length,
      mime_type: 'application/pdf',
      client_file_ref: clientRef1,
    }),
  });
  if (!upPrep1.ok) throw new Error(`Fallo en drive-upload-prepare 1: ${await upPrep1.text()}`);
  const prepData1 = await upPrep1.json();

  const upPut1 = await fetch(prepData1.relay_url || prepData1.relay_upload_url, {
    method: 'PUT',
    headers: {
      'x-reservation-id': prepData1.reservation_id,
      'x-capability-token': capability_token,
      'Content-Type': 'application/pdf',
    },
    body: file1Content,
  });
  if (!upPut1.ok) throw new Error(`Fallo en PUT relay 1: ${await upPut1.text()}`);

  const upComp1 = await fetch(`${supabaseUrl}/functions/v1/drive-upload-complete`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      capability_token,
      reservation_id: prepData1.reservation_id,
      client_file_ref: clientRef1,
    }),
  });
  if (!upComp1.ok) throw new Error(`Fallo en drive-upload-complete 1: ${await upComp1.text()}`);
  console.log(`  ✓ Archivo 1 subido y verificado: ${prepData1.archivo_id}`);

  // C. Subir archivo 2
  const clientRef2 = crypto.randomUUID();
  const file2Content = Buffer.from('%PDF-1.4 Mock PDF Content 2 for QA Testing');
  const upPrep2 = await fetch(`${supabaseUrl}/functions/v1/drive-upload-prepare`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      capability_token,
      expected_name: 'prueba-qa-solicitud-2.pdf',
      expected_size: file2Content.length,
      mime_type: 'application/pdf',
      client_file_ref: clientRef2,
    }),
  });
  if (!upPrep2.ok) throw new Error(`Fallo en drive-upload-prepare 2: ${await upPrep2.text()}`);
  const prepData2 = await upPrep2.json();

  const upPut2 = await fetch(prepData2.relay_url || prepData2.relay_upload_url, {
    method: 'PUT',
    headers: {
      'x-reservation-id': prepData2.reservation_id,
      'x-capability-token': capability_token,
      'Content-Type': 'application/pdf',
    },
    body: file2Content,
  });
  if (!upPut2.ok) throw new Error(`Fallo en PUT relay 2: ${await upPut2.text()}`);

  const upComp2 = await fetch(`${supabaseUrl}/functions/v1/drive-upload-complete`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id,
      capability_token,
      reservation_id: prepData2.reservation_id,
      client_file_ref: clientRef2,
    }),
  });
  if (!upComp2.ok) throw new Error(`Fallo en drive-upload-complete 2: ${await upComp2.text()}`);
  console.log(`  ✓ Archivo 2 subido y verificado: ${prepData2.archivo_id}`);

  // D. Obtener categorías y tipos válidos
  const { data: cat } = await adminClient.from('categorias_servicio').select('id, slug, nombre').limit(1).single();
  const { data: tipo } = await adminClient.from('tipos_servicio').select('id, slug, nombre').eq('categoria_id', cat.id).limit(1).single();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const fechaEvento = tomorrow.toISOString().split('T')[0];

  const testEmail = `qa.test.${Date.now()}@tierradelfuego.gob.ar`;

  // E. Crear envío de formulario con los 2 archivos
  const submitPayload = {
    schema_version: 3,
    submission_key,
    session_id,
    capability_token,
    contacto: {
      nombre_apellido: 'QA Tester Automatizado',
      area_solicitante: 'Secretaría de Medios QA',
      correo: testEmail,
      telefono: '2901123456',
    },
    pedidos: [
      {
        client_request_ref: crypto.randomUUID(),
        categoria_slug: cat.slug,
        tipo_slug: tipo.slug,
        informacion_especifica: {
          descripcion: 'Prueba E2E de organización de carpetas Drive - Pedido 1',
          fecha_limite: fechaEvento,
        },
        archivos: [clientRef1, clientRef2],
      },
      {
        client_request_ref: crypto.randomUUID(),
        categoria_slug: cat.slug,
        tipo_slug: tipo.slug,
        informacion_especifica: {
          descripcion: 'Prueba E2E de finalización con enlace externo - Pedido 2',
          fecha_limite: fechaEvento,
        },
        archivos: [],
      },
    ],
    file_bindings: [
      {
        client_file_ref: clientRef1,
        expected_name: 'prueba-qa-solicitud-1.pdf',
        expected_size: file1Content.length,
        mime_type: 'application/pdf',
        targets: 'all',
      },
      {
        client_file_ref: clientRef2,
        expected_name: 'prueba-qa-solicitud-2.pdf',
        expected_size: file2Content.length,
        mime_type: 'application/pdf',
        targets: 'all',
      },
    ],
  };

  const createRes = await fetch(`${supabaseUrl}/functions/v1/submission-create`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(submitPayload),
  });

  if (!createRes.ok) {
    throw new Error(`Fallo en submission-create: ${await createRes.text()}`);
  }

  const createResult = await createRes.json();
  const createdPed1 = createResult.pedidos[0];
  const createdPed2 = createResult.pedidos[1];
  console.log(`  ✓ Pedido 1 creado: ${createdPed1.pedido_visible} (ID: ${createdPed1.id})`);
  console.log(`  ✓ Pedido 2 creado: ${createdPed2.pedido_visible} (ID: ${createdPed2.id})`);

  // F. Validar persistencia de carpeta en PostgreSQL para Pedido 1
  const { data: folderRec, error: fErr } = await adminClient
    .from('pedido_drive_folders')
    .select('*')
    .eq('pedido_id', createdPed1.id)
    .eq('folder_type', 'solicitud')
    .maybeSingle();

  if (fErr || !folderRec) {
    console.warn(`  ⚠️ Nota: pedido_drive_folders aún no poblado:`, fErr?.message);
  } else {
    console.log(`  ✓ Carpeta registrada en PostgreSQL: ${folderRec.folder_name} -> Drive ID: ${folderRec.drive_folder_id} (Estado: ${folderRec.organization_status})`);
  }

  // =========================================================================
  // CASO 2: Finalizar Pedido 1 con 2 Archivos Entregados y SIN URL
  // =========================================================================
  console.log('\n--- CASO 2: Finalización con 2 Archivos de Entrega (sin URL) ---');

  // A. Asignar Pedido 1 al usuario de prueba y mover a 'En revisión' -> 'En proceso'
  const { error: assignErr1 } = await operatorClient.rpc('pedido_assign', {
    p_pedido_id: createdPed1.id,
    p_responsable_user_id: adminUser.user_id,
    p_expected_version: 1,
    p_motivo: 'Asignación automática para prueba QA de entrega',
  });
  if (assignErr1) throw new Error(`Error en pedido_assign (Pedido 1): ${assignErr1.message}`);

  const { data: p1v1 } = await adminClient.from('pedidos').select('version').eq('id', createdPed1.id).single();
  const { error: revErr1 } = await operatorClient.rpc('pedido_change_state', {
    p_pedido_id: createdPed1.id,
    p_target_state: 'En revisión',
    p_expected_version: p1v1.version,
    p_motivo: 'Paso a En revisión para preparación',
  });
  if (revErr1) throw new Error(`Error en paso a En revisión (Pedido 1): ${revErr1.message}`);

  const { data: p1v2 } = await adminClient.from('pedidos').select('version').eq('id', createdPed1.id).single();
  const { error: procErr1 } = await operatorClient.rpc('pedido_change_state', {
    p_pedido_id: createdPed1.id,
    p_target_state: 'En proceso',
    p_expected_version: p1v2.version,
    p_motivo: 'Paso a En proceso para preparar entrega',
  });
  if (procErr1) throw new Error(`Error en paso a En proceso (Pedido 1): ${procErr1.message}`);

  console.log('  ✓ Pedido 1 asignado y en estado "En proceso"');

  // B. Subir 2 archivos de entrega mediante delivery-upload-prepare & delivery-upload-complete
  // Archivo de entrega 1
  const delivery1Bytes = Buffer.from('%PDF-1.4 Mock Deliverable PDF 1 Content');
  const dPrep1 = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-prepare`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${operatorJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: createdPed1.id,
      expected_name: 'entrega-final-1.pdf',
      expected_size: delivery1Bytes.length,
      mime_type: 'application/pdf',
    }),
  });
  if (!dPrep1.ok) throw new Error(`Fallo en delivery-upload-prepare 1: ${await dPrep1.text()}`);
  const dPrepData1 = await dPrep1.json();

  const dPut1 = await fetch(dPrepData1.relay_upload_url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${operatorJwt}`,
      'x-reservation-id': dPrepData1.reservation_id,
      'Content-Type': 'application/pdf',
    },
    body: delivery1Bytes,
  });
  if (!dPut1.ok) throw new Error(`Fallo en PUT delivery relay 1: ${await dPut1.text()}`);

  const dComp1 = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-complete`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${operatorJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: createdPed1.id,
      reservation_id: dPrepData1.reservation_id,
      drive_file_id: dPrepData1.drive_file_id,
    }),
  });
  if (!dComp1.ok) throw new Error(`Fallo en delivery-upload-complete 1: ${await dComp1.text()}`);
  console.log(`  ✓ Archivo de entrega 1 completado y verificado: ${dPrepData1.archivo_id}`);

  // Archivo de entrega 2
  const delivery2Bytes = Buffer.from('%PDF-1.4 Mock Deliverable PDF 2 Content');
  const dPrep2 = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-prepare`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${operatorJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: createdPed1.id,
      expected_name: 'entrega-final-2.pdf',
      expected_size: delivery2Bytes.length,
      mime_type: 'application/pdf',
    }),
  });
  if (!dPrep2.ok) throw new Error(`Fallo en delivery-upload-prepare 2: ${await dPrep2.text()}`);
  const dPrepData2 = await dPrep2.json();

  const dPut2 = await fetch(dPrepData2.relay_upload_url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${operatorJwt}`,
      'x-reservation-id': dPrepData2.reservation_id,
      'Content-Type': 'application/pdf',
    },
    body: delivery2Bytes,
  });
  if (!dPut2.ok) throw new Error(`Fallo en PUT delivery relay 2: ${await dPut2.text()}`);

  const dComp2 = await fetch(`${supabaseUrl}/functions/v1/delivery-upload-complete`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${operatorJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pedido_id: createdPed1.id,
      reservation_id: dPrepData2.reservation_id,
      drive_file_id: dPrepData2.drive_file_id,
    }),
  });
  if (!dComp2.ok) throw new Error(`Fallo en delivery-upload-complete 2: ${await dComp2.text()}`);
  console.log(`  ✓ Archivo de entrega 2 completado y verificado: ${dPrepData2.archivo_id}`);

  // C. Finalizar pedido con los 2 archivos y SIN URL
  const { data: currentPedState } = await adminClient.from('pedidos').select('version').eq('id', createdPed1.id).single();

  const { data: finalizeRes, error: finErr } = await operatorClient.rpc('pedido_finalize', {
    p_pedido_id: createdPed1.id,
    p_expected_version: currentPedState.version,
    p_archivos_entrega: [dPrepData1.archivo_id, dPrepData2.archivo_id],
    p_url_entrega: null,
    p_nota_entrega: 'Entrega finalizada exclusivamente con archivos adjuntos',
  });

  if (finErr) {
    throw new Error(`Error en pedido_finalize: ${finErr.message}`);
  }

  console.log(`  ✓ Pedido 1 finalizado exitosamente: Estado = ${finalizeRes.estado}, Entrega ID = ${finalizeRes.entrega_id}, Archivos = ${finalizeRes.archivos_count}`);

  // D. Validar normalización en entrega_archivos
  const { data: eaList } = await adminClient
    .from('entrega_archivos')
    .select('archivo_id')
    .eq('entrega_id', finalizeRes.entrega_id);

  if (!eaList || eaList.length !== 2) {
    throw new Error(`Se esperaban 2 archivos en entrega_archivos, pero se encontraron: ${eaList?.length}`);
  }
  console.log(`  ✓ Tabla entrega_archivos normalizada con ${eaList.length} archivos vinculados`);

  // E. Validar consulta de detalle del solicitante
  const rawSessionToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawSessionToken, 'utf8').digest('hex');

  const { error: sessInsErr } = await adminClient.from('solicitante_sesiones').insert({
    id: crypto.randomUUID(),
    correo: testEmail,
    session_token_hash: tokenHash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
  });

  if (sessInsErr) {
    throw new Error(`Error insertando sesión de solicitante: ${sessInsErr.message}`);
  }

  const detailRes = await fetch(`${supabaseUrl}/functions/v1/solicitante-pedido-detail`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'x-solicitante-session': rawSessionToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pedido_ref: createdPed1.pedido_visible }),
  });

  if (!detailRes.ok) throw new Error(`Fallo en solicitante-pedido-detail: ${await detailRes.text()}`);
  const detailData = await detailRes.json();

  if (!detailData.entrega || !detailData.entrega.archivos || detailData.entrega.archivos.length !== 2) {
    throw new Error(`Detalle del solicitante no proyecta los 2 archivos de entrega: ${JSON.stringify(detailData.entrega)}`);
  }
  console.log(`  ✓ Solicitante ve la entrega vigente con ${detailData.entrega.archivos.length} archivos disponibles`);

  // F. Descargar archivo 1 mediante solicitante-delivery-download
  const downloadRes1 = await fetch(
    `${supabaseUrl}/functions/v1/solicitante-delivery-download?pedido_id=${createdPed1.id}&archivo_id=${dPrepData1.archivo_id}`,
    {
      headers: {
        'apikey': anonKey,
        'x-solicitante-session': rawSessionToken,
      },
    }
  );

  if (!downloadRes1.ok) {
    throw new Error(`Fallo en solicitante-delivery-download 1: ${downloadRes1.status} ${await downloadRes1.text()}`);
  }
  const downloadedBytes1 = Buffer.from(await downloadRes1.arrayBuffer());
  if (downloadedBytes1.length !== delivery1Bytes.length) {
    throw new Error(`Tamaño descargado (${downloadedBytes1.length}) no coincide con subido (${delivery1Bytes.length})`);
  }
  console.log(`  ✓ Descarga de solicitante exitosa y con integridad binaria verificada (${downloadedBytes1.length} bytes)`);

  // =========================================================================
  // CASO 3: Validación de Reglas de Rechazo y Finalización con URL únicamente
  // =========================================================================
  console.log('\n--- CASO 3: Validación de Reglas de Rechazo y Entrega con Solo URL ---');

  // A. Preparar Pedido 2 en estado 'En proceso'
  await operatorClient.rpc('pedido_assign', {
    p_pedido_id: createdPed2.id,
    p_responsable_user_id: adminUser.user_id,
    p_expected_version: 1,
    p_motivo: 'Asignación de Pedido 2 para prueba de validación',
  });

  const { data: p2v1 } = await adminClient.from('pedidos').select('version').eq('id', createdPed2.id).single();
  await operatorClient.rpc('pedido_change_state', {
    p_pedido_id: createdPed2.id,
    p_target_state: 'En revisión',
    p_expected_version: p2v1.version,
    p_motivo: 'Paso a En revisión para prueba de validación',
  });

  const { data: p2v2 } = await adminClient.from('pedidos').select('version').eq('id', createdPed2.id).single();
  await operatorClient.rpc('pedido_change_state', {
    p_pedido_id: createdPed2.id,
    p_target_state: 'En proceso',
    p_expected_version: p2v2.version,
    p_motivo: 'Paso a En proceso para prueba de validación',
  });

  const { data: ped2EnProceso } = await adminClient.from('pedidos').select('version').eq('id', createdPed2.id).single();

  // B. Intentar finalizar SIN archivos y SIN URL -> Debe ser RECHAZADO con DELIVERY_REQUIRED
  const { error: rejectErr } = await operatorClient.rpc('pedido_finalize', {
    p_pedido_id: createdPed2.id,
    p_expected_version: ped2EnProceso.version,
    p_archivos_entrega: null,
    p_url_entrega: null,
  });

  if (!rejectErr || !rejectErr.message.includes('DELIVERY_REQUIRED')) {
    throw new Error(`Se esperaba error DELIVERY_REQUIRED, pero se obtuvo: ${rejectErr?.message}`);
  }
  console.log(`  ✓ Regla DELIVERY_REQUIRED validada correctamente (Rechazado cuando no hay ni archivo ni URL)`);

  // C. Finalizar Pedido 2 con SOLO URL (sin archivos)
  const { data: finPed2Res, error: finPed2Err } = await operatorClient.rpc('pedido_finalize', {
    p_pedido_id: createdPed2.id,
    p_expected_version: ped2EnProceso.version,
    p_archivos_entrega: null,
    p_url_entrega: 'https://drive.google.com/drive/folders/test-external-link',
    p_nota_entrega: 'Entrega finalizada exclusivamente con enlace externo',
  });

  if (finPed2Err) {
    throw new Error(`Error en pedido_finalize con solo URL: ${finPed2Err.message}`);
  }
  console.log(`  ✓ Pedido 2 finalizado con éxito con SOLO URL externa (Estado = ${finPed2Res.estado}, URL = ${finPed2Res.producto_final_url})`);

  console.log('\n========================================================');
  console.log(' TODOS LOS CASOS DE PRUEBA E2E EN PROD COMPLETADOS CON ÉXITO ');
  console.log('========================================================\n');
}

runE2EQA().catch((err) => {
  console.error('\n❌ ERROR EN QA E2E:', err.message);
  process.exit(1);
});
