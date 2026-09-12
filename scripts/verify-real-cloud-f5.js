import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const FUNCTIONS_URL = `${SUPABASE_PROJECT_URL}/functions/v1`;

/**
 * Obtiene las claves del proyecto Cloud en memoria de forma segura
 */
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

async function uploadBufferToGoogleResumableUrl(uploadUrl, buffer, mimeType) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': buffer.length.toString(),
    },
    body: buffer,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

async function run() {
  console.log('================================================================');
  console.log('  PEDIDOS — Verificación Gate F5 en Supabase Cloud + Google Real');
  console.log(`  Target: ${SUPABASE_PROJECT_URL}`);
  console.log('================================================================\n');

  console.log('Obteniendo credenciales de acceso a Supabase Cloud en memoria...');
  const { anonKey, serviceKey } = getCloudKeysInMemory();

  if (!anonKey || !serviceKey) {
    throw new Error('No se encontraron claves válidas anon/service_role para el proyecto Cloud');
  }
  console.log('✓ Credenciales Cloud cargadas en memoria (claves no expuestas en consola).\n');

  const serviceClient = createClient(SUPABASE_PROJECT_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  function assert(name, condition, extraInfo = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  ✓ PASS: ${name} ${extraInfo}`);
      results.details.push({ name, status: 'PASS', extraInfo });
    } else {
      results.failed++;
      console.error(`  ❌ FAIL: ${name} ${extraInfo}`);
      results.details.push({ name, status: 'FAIL', extraInfo });
    }
  }

  const createdSessionIds = [];
  const createdEnvioIds = [];
  const createdArchivoIds = [];
  let testUserId = null;

  try {
    // --------------------------------------------------------------------------
    // TEST 1: submission-session-prepare en Cloud
    // --------------------------------------------------------------------------
    console.log('[1/7] Probando submission-session-prepare en Cloud...');
    const submissionKey = crypto.randomUUID();
    const sessionRes = await fetch(`${FUNCTIONS_URL}/submission-session-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ submission_key: submissionKey }),
    });

    assert('session-prepare status 201', sessionRes.status === 201, `(status: ${sessionRes.status})`);
    const sessionData = await sessionRes.json();
    assert('session-prepare devuelve session_id', Boolean(sessionData.session_id));
    assert('session-prepare devuelve capability_token', Boolean(sessionData.capability_token));
    assert('session-prepare límites contractuales (10 archivos x 10 MB)', sessionData.max_files === 10 && sessionData.max_file_size_bytes === 10485760);

    const sessionId = sessionData.session_id;
    const capabilityToken = sessionData.capability_token;
    createdSessionIds.push(sessionId);

    // --------------------------------------------------------------------------
    // TEST 2: drive-upload-prepare con Google OAuth Server-Side Real
    // --------------------------------------------------------------------------
    console.log('\n[2/7] Probando drive-upload-prepare (OAuth Refresh + Creación carpetas Drive)...');
    const file1Content = Buffer.from('%PDF-1.4 Mock PDF Document for Google Drive Spike ' + crypto.randomBytes(32).toString('hex'));
    const uploadPrepRes = await fetch(`${FUNCTIONS_URL}/drive-upload-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        expected_name: 'documento_real_google.pdf',
        expected_size: file1Content.length,
        mime_type: 'application/pdf',
        targets: 'all',
      }),
    });

    assert('drive-upload-prepare status 201', uploadPrepRes.status === 201, `(status: ${uploadPrepRes.status})`);
    const uploadPrepData = await uploadPrepRes.json();
    if (uploadPrepRes.status !== 201) {
      console.error('DEBUG drive-upload-prepare error response:', uploadPrepData);
    }
    assert('drive-upload-prepare devuelve reservation_id', Boolean(uploadPrepData?.reservation_id));
    assert('drive-upload-prepare devuelve upload_url de Google Drive', Boolean(uploadPrepData?.upload_url && uploadPrepData.upload_url.includes('google')));

    const reservationId = uploadPrepData.reservation_id;
    const clientFileRef = uploadPrepData.client_file_ref;
    const uploadUrl = uploadPrepData.upload_url;
    const archivoId = uploadPrepData.archivo_id;
    createdArchivoIds.push(archivoId);

    // --------------------------------------------------------------------------
    // TEST 3: Subida directa resumable binaria a Google Drive API REAL
    // --------------------------------------------------------------------------
    console.log('\n[3/7] Ejecutando subida binaria directa a Google Drive API...');
    const driveUploadRes = await uploadBufferToGoogleResumableUrl(uploadUrl, file1Content, 'application/pdf');
    assert('Subida a Google Drive status 200/201', driveUploadRes.status === 200 || driveUploadRes.status === 201, `(status: ${driveUploadRes.status})`);
    assert('Google Drive devuelve drive_file_id real', Boolean(driveUploadRes.data?.id));

    const driveFileId = driveUploadRes.data?.id;

    // --------------------------------------------------------------------------
    // TEST 4: drive-upload-complete en Cloud contra Google Drive Real
    // --------------------------------------------------------------------------
    console.log('\n[4/7] Verificando metadata y estado en drive-upload-complete...');
    const completeRes = await fetch(`${FUNCTIONS_URL}/drive-upload-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        reservation_id: reservationId,
        client_file_ref: clientFileRef,
        drive_file_id: driveFileId,
      }),
    });

    assert('drive-upload-complete status 200', completeRes.status === 200, `(status: ${completeRes.status})`);
    const completeData = await completeRes.json();
    assert('drive-upload-complete verified true', completeData.verified === true);
    assert('drive-upload-complete archivo_id verificado', Boolean(completeData.archivo_id));

    // --------------------------------------------------------------------------
    // TEST 5: submission-create Multi-PED atómico con vinculación de archivo en Cloud DB
    // --------------------------------------------------------------------------
    console.log('\n[5/7] Confirmando envío multi-PED atómico (submission-create)...');
    const clientRequestRef1 = crypto.randomUUID();
    const clientRequestRef2 = crypto.randomUUID();

    const submissionPayload = {
      schema_version: 3,
      submission_key: submissionKey,
      contacto: {
        nombre_apellido: 'Verificación F5 Real',
        telefono: '+542901445566',
        correo: 'verificacion.f5@tierradelfuego.gob.ar',
        area_solicitante: 'Secretaría de Medios',
      },
      pedidos: [
        {
          client_request_ref: clientRequestRef1,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Flyer Campaña F5 Real' },
        },
        {
          client_request_ref: clientRequestRef2,
          categoria_slug: 'gacetilla',
          tipo_slug: 'gacetilla',
          informacion_especifica: { titulo: 'Gacetilla Difusión F5 Real' },
        },
      ],
      file_bindings: [
        {
          client_file_ref: clientFileRef,
          expected_name: 'documento_real_google.pdf',
          expected_size: file1Content.length,
          mime_type: 'application/pdf',
          targets: 'all',
        },
      ],
    };

    const submitRes = await fetch(`${FUNCTIONS_URL}/submission-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(submissionPayload),
    });

    assert('submission-create status 201', submitRes.status === 201, `(status: ${submitRes.status})`);
    const submitData = await submitRes.json();
    assert('submission-create devuelve envio_id', Boolean(submitData.envio_id));
    assert('submission-create devuelve 2 pedidos con secuencia global', submitData.pedidos?.length === 2);
    assert('submission-create archivo vinculado a ambos PEDs', submitData.archivos?.length === 1);

    const envioId = submitData.envio_id;
    createdEnvioIds.push(envioId);

    // Replay idempotente
    const replayRes = await fetch(`${FUNCTIONS_URL}/submission-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(submissionPayload),
    });
    assert('submission-create idempotente status 200', replayRes.status === 200);
    const replayData = await replayRes.json();
    assert('submission-create idempotent_replay true', replayData.idempotent_replay === true);
    assert('submission-create mismo envio_id', replayData.envio_id === submitData.envio_id);

    // --------------------------------------------------------------------------
    // TEST 6: Validación de límites de tamaño de archivo (>5 MB, 10 MB límite, >10 MB rechazo)
    // --------------------------------------------------------------------------
    console.log('\n[6/7] Probando límites contractuales de archivos en Cloud...');

    const session2Res = await fetch(`${FUNCTIONS_URL}/submission-session-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ submission_key: crypto.randomUUID() }),
    });
    const s2Data = await session2Res.json();
    const s2Id = s2Data.session_id;
    const s2Token = s2Data.capability_token;
    createdSessionIds.push(s2Id);

    // 6a: Archivo >5 MB (6 MB)
    const sixMbRes = await fetch(`${FUNCTIONS_URL}/drive-upload-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: s2Id,
        capability_token: s2Token,
        expected_name: 'archivo_6mb.zip',
        expected_size: 6 * 1024 * 1024,
        mime_type: 'application/zip',
        targets: 'all',
      }),
    });
    assert('Archivo 6 MB (>5 MB) aceptado status 201', sixMbRes.status === 201);
    const sixMbData = await sixMbRes.json();
    if (sixMbData.archivo_id) createdArchivoIds.push(sixMbData.archivo_id);

    // 6b: Archivo límite exacto 10 MB (10,485,760 bytes)
    const exactLimitRes = await fetch(`${FUNCTIONS_URL}/drive-upload-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: s2Id,
        capability_token: s2Token,
        expected_name: 'archivo_limite_exacto.pdf',
        expected_size: 10485760,
        mime_type: 'application/pdf',
        targets: 'all',
      }),
    });
    assert('Archivo límite exacto 10 MB (10,485,760 bytes) aceptado status 201', exactLimitRes.status === 201);
    const exactData = await exactLimitRes.json();
    if (exactData.archivo_id) createdArchivoIds.push(exactData.archivo_id);

    // 6c: Archivo límite + 1 byte (10,485,761 bytes -> rechazo 400)
    const overLimitRes = await fetch(`${FUNCTIONS_URL}/drive-upload-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: s2Id,
        capability_token: s2Token,
        expected_name: 'archivo_excedido.pdf',
        expected_size: 10485761,
        mime_type: 'application/pdf',
        targets: 'all',
      }),
    });
    assert('Archivo excedido (10,485,761 bytes) rechazado con 400', overLimitRes.status === 400);

    // 6d: Formato MIME no permitido
    const invalidMimeRes = await fetch(`${FUNCTIONS_URL}/drive-upload-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        session_id: s2Id,
        capability_token: s2Token,
        expected_name: 'audio.mp3',
        expected_size: 1000,
        mime_type: 'audio/mpeg',
        targets: 'all',
      }),
    });
    assert('Tipo MIME no permitido (audio/mpeg) rechazado con 400', invalidMimeRes.status === 400);

    // --------------------------------------------------------------------------
    // TEST 7: drive-download (verify_jwt = true en Cloud + RBAC streaming)
    // --------------------------------------------------------------------------
    console.log('\n[7/7] Probando drive-download en Cloud (verify_jwt=true + RBAC streaming)...');

    // 7a: Sin Authorization header -> 401 Unauthorized
    const noAuthRes = await fetch(`${FUNCTIONS_URL}/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
    });
    assert('drive-download sin JWT rechazado con 401 Unauthorized', noAuthRes.status === 401);

    // 7b: Con JWT inválido -> 401 Unauthorized
    const invalidJwtRes = await fetch(`${FUNCTIONS_URL}/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer invalid_jwt_token_12345',
      },
    });
    assert('drive-download con JWT falso rechazado con 401 Unauthorized', invalidJwtRes.status === 401);

    // 7c: Crear usuario admin de prueba en Auth Cloud y aprobar en usuarios_acceso
    const testEmail = `f5.real.tester.${Date.now()}@tierradelfuego.gob.ar`;
    const testPass = 'ComplexPasswordF5!2026';

    const { data: userData, error: userCreateErr } = await serviceClient.auth.admin.createUser({
      email: testEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: {
        nombre: 'Admin',
        apellido: 'F5 Real',
        nombre_usuario: `admin_f5_${Date.now()}`,
      },
    });

    if (userCreateErr || !userData.user) {
      throw new Error(`No se pudo crear usuario de test en Auth: ${userCreateErr?.message}`);
    }

    testUserId = userData.user.id;

    await serviceClient.from('usuarios_acceso').upsert({
      user_id: testUserId,
      nombre: 'Admin',
      apellido: 'F5 Real',
      nombre_usuario: `admin_f5_${Date.now()}`,
      estado_acceso: 'aprobado',
      app_role: 'administrador',
      aprobado_at: new Date().toISOString(),
    });

    // Iniciar sesión para obtener el JWT real del usuario
    const userSupabase = createClient(SUPABASE_PROJECT_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: signInErr } = await userSupabase.auth.signInWithPassword({
      email: testEmail,
      password: testPass,
    });

    if (signInErr || !authData.session?.access_token) {
      throw new Error(`Error en login de test user: ${signInErr?.message}`);
    }

    const userJwt = authData.session.access_token;

    // Descargar archivo real por streaming
    const downloadRes = await fetch(`${FUNCTIONS_URL}/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${userJwt}`,
      },
    });

    assert('drive-download con usuario Administrador aprobado status 200', downloadRes.status === 200, `(status: ${downloadRes.status})`);
    assert('drive-download cabecera Content-Type correcta', downloadRes.headers.get('content-type') === 'application/pdf');
    assert('drive-download cabecera Content-Disposition attachment', Boolean(downloadRes.headers.get('content-disposition')?.includes('attachment')));
    assert('drive-download cabeceras de seguridad (no-store, nosniff)', downloadRes.headers.get('cache-control')?.includes('no-store') && downloadRes.headers.get('x-content-type-options') === 'nosniff');

    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    assert('drive-download integridad binaria idéntica', downloadedBytes.equals(file1Content), `(longitud: ${downloadedBytes.length} bytes)`);

    // 7d: Probar usuario revocado -> 403 Forbidden
    await serviceClient.from('usuarios_acceso').update({ estado_acceso: 'revocado' }).eq('user_id', testUserId);
    const revokedRes = await fetch(`${FUNCTIONS_URL}/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${userJwt}`,
      },
    });
    assert('drive-download con usuario revocado rechazado con 403 Forbidden', revokedRes.status === 403);
  } finally {
    // Limpieza segura de datos sintéticos de test
    console.log('\nLimpiando datos sintéticos de prueba en Cloud DB...');
    if (testUserId) {
      try { await serviceClient.from('usuarios_acceso').delete().eq('user_id', testUserId); } catch { void 0; }
      try { await serviceClient.auth.admin.deleteUser(testUserId); } catch { void 0; }
    }
    for (const envioId of createdEnvioIds) {
      try {
        const { data: peds } = await serviceClient.from('pedidos').select('id').eq('envio_id', envioId);
        const pedIds = peds?.map((p) => p.id) || [];
        if (pedIds.length > 0) {
          await serviceClient.from('archivo_pedido').delete().in('pedido_id', pedIds);
          await serviceClient.from('enlace_pedido').delete().in('pedido_id', pedIds);
        }
        await serviceClient.from('upload_reservations').delete().eq('envio_id', envioId);
        await serviceClient.from('enlaces_material').delete().eq('envio_id', envioId);
        await serviceClient.from('pedidos').delete().eq('envio_id', envioId);
        await serviceClient.from('domain_events').delete().eq('aggregate_id', envioId);
        await serviceClient.from('audit_log').delete().eq('recurso_id', envioId);
        await serviceClient.from('envios_formulario').delete().eq('id', envioId);
      } catch {
        void 0;
      }
    }
    for (const sId of createdSessionIds) {
      try {
        await serviceClient.from('upload_reservations').delete().eq('session_id', sId);
        await serviceClient.from('submission_sessions').delete().eq('id', sId);
      } catch {
        void 0;
      }
    }
    if (createdArchivoIds.length > 0) {
      try {
        await serviceClient.from('archivo_pedido').delete().in('archivo_id', createdArchivoIds);
        await serviceClient.from('upload_reservations').delete().in('archivo_id', createdArchivoIds);
        await serviceClient.from('archivos').delete().in('id', createdArchivoIds);
      } catch {
        void 0;
      }
    }
    console.log('✓ Limpieza completada.');
  }

  console.log('\n================================================================');
  console.log(`RESUMEN GATE F5 REAL: ${results.passed}/${results.total} PRUEBAS SUPERADAS`);
  if (results.failed === 0) {
    console.log('🎉 GATE F5 EN SUPABASE CLOUD Y GOOGLE DRIVE REAL 100% CUMPLIDO');
  } else {
    console.error(`❌ ${results.failed} PRUEBAS FALLARON`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('ERROR FATAL EN EJECUCIÓN DE VERIFICACIÓN F5 REAL:', err);
  process.exit(1);
});
