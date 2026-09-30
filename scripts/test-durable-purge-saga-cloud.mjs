import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { execSync } from 'node:child_process';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function getTestServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const testSecretsPath = path.join(os.homedir(), '.pedidos', 'test-secrets.json');
  if (fs.existsSync(testSecretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(testSecretsPath, 'utf8'));
      if (parsed.SUPABASE_SERVICE_ROLE_KEY) return parsed.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch {}
  }
  try {
    const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

async function callRpc(rpcName, params, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(params),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(`RPC ${rpcName} failed (${res.status}): ${typeof json === 'object' ? json.message || JSON.stringify(json) : json}`);
  }
  return json;
}

async function insertRest(table, records, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(records),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insert into ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function queryRest(table, queryParams, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${queryParams}`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Query ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function deleteRest(table, queryParams, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${queryParams}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  return res.ok;
}

async function run() {
  const serviceKey = getTestServiceKey();
  if (!serviceKey) {
    console.error('No service key available for test');
    process.exit(1);
  }

  console.log('=== TEST: PROBANDO SAGA DURABLE EN SUPABASE TEST (' + TEST_PROJECT_REF + ') ===');

  // 1. Crear 3 PEDs de prueba en TEST
  console.log('1. Creando 3 pedidos de prueba (QA)...');
  const testEnvioId = crypto.randomUUID();
  await insertRest('envios_formulario', [{
    id: testEnvioId,
    submission_key: crypto.randomUUID(),
    request_fingerprint: crypto.randomBytes(32).toString('hex'),
    nombre_apellido: 'QA Test Saga User',
    telefono: '+5492964123456',
    correo: 'qa-saga@tdf.gob.ar',
    area_solicitante: 'Secretaría de Modernización',
  }], serviceKey);

  const ped1Id = crypto.randomUUID();
  const ped2Id = crypto.randomUUID();
  const ped3Id = crypto.randomUUID();

  // Obtener una categoría y tipo válidos
  const categorias = await queryRest('categorias_servicio', 'limit=1', serviceKey);
  const catId = categorias[0]?.id;
  const tipos = await queryRest('tipos_servicio', `categoria_id=eq.${catId}&limit=1`, serviceKey);
  const tipoId = tipos[0]?.id;

  const randNum = Math.floor(Math.random() * 80000) + 10000;
  const ped1Visible = `PED-2026-D0${randNum + 1}`;
  const ped2Visible = `PED-2026-D0${randNum + 2}`;
  const ped3Visible = `PED-2026-D0${randNum + 3}`;

  await insertRest('pedidos', [
    {
      id: ped1Id,
      envio_id: testEnvioId,
      categoria_id: catId,
      tipo_servicio_id: tipoId,
      pedido_visible: ped1Visible,
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      client_request_ref: crypto.randomUUID(),
      anio: 2026,
      numero: randNum + 1,
      codigo_categoria: 'D',
      estado: 'Nuevo',
      informacion_especifica: { motivo: 'QA Saga 1' },
    },
    {
      id: ped2Id,
      envio_id: testEnvioId,
      categoria_id: catId,
      tipo_servicio_id: tipoId,
      pedido_visible: ped2Visible,
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      client_request_ref: crypto.randomUUID(),
      anio: 2026,
      numero: randNum + 2,
      codigo_categoria: 'D',
      estado: 'Nuevo',
      informacion_especifica: { motivo: 'QA Saga 2' },
    },
    {
      id: ped3Id,
      envio_id: testEnvioId,
      categoria_id: catId,
      tipo_servicio_id: tipoId,
      pedido_visible: ped3Visible,
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      client_request_ref: crypto.randomUUID(),
      anio: 2026,
      numero: randNum + 3,
      codigo_categoria: 'D',
      estado: 'Nuevo',
      informacion_especifica: { motivo: 'QA Saga 3' },
    },
  ], serviceKey);

  // Insertar un archivo mock y folder mock vinculados a ped1 y ped2
  const arch1Id = crypto.randomUUID();
  const mockDriveFileId = 'mock_drive_file_qa_' + crypto.randomUUID();
  const mockDriveFolderId = 'mock_drive_folder_qa_' + crypto.randomUUID();

  await insertRest('archivos', [{
    id: arch1Id,
    nombre_original: 'mock_qa_file.png',
    size_bytes: 1024,
    mime_type: 'image/png',
    contexto: 'solicitud',
    drive_file_id: mockDriveFileId,
    estado: 'verified',
  }], serviceKey);

  await insertRest('archivo_pedido', [{
    pedido_id: ped1Id,
    archivo_id: arch1Id,
  }], serviceKey);

  await insertRest('pedido_drive_folders', [{
    pedido_id: ped2Id,
    drive_folder_id: mockDriveFolderId,
    folder_type: 'solicitud',
    folder_name: 'QA_FOLDER',
  }], serviceKey);

  console.log(`✓ 3 PEDs creados: ${ped1Visible}, ${ped2Visible}, ${ped3Visible}`);

  // 2. Probar admin_purge_operation_init con los 2 primeros PEDs
  console.log('2. Inicializando operación con PED 1 y PED 2 (Idempotency Key: test_idemp_qa_1)...');
  const idempKey = 'test_idemp_qa_' + Date.now();
  const initData = await callRpc('admin_purge_operation_init', {
    p_pedido_ids: [ped1Id, ped2Id],
    p_idempotency_key: idempKey,
    p_actor: 'QA Test Actor',
  }, serviceKey);

  console.log('✓ Operación inicializada:', initData);
  const opId = initData.operation_id;

  // 3. Probar Idempotencia: segunda llamada con misma clave debe retornar is_existing = true
  const idempData = await callRpc('admin_purge_operation_init', {
    p_pedido_ids: [ped1Id, ped2Id],
    p_idempotency_key: idempKey,
    p_actor: 'QA Test Actor',
  }, serviceKey);
  console.log('✓ Verificación de Idempotencia (doble llamada):', idempData.is_existing === true ? 'PASS' : 'FAIL');

  // 4. Verificar bloqueo de purga DB si Drive está pendiente
  console.log('4. Intentando purga DB antes de limpiar Drive (debe fallar con DRIVE_RESOURCES_PENDING)...');
  let blockedSuccess = false;
  try {
    await callRpc('admin_pedidos_purge', {
      p_operation_id: opId,
      p_actor: 'QA Test Actor',
    }, serviceKey);
  } catch (err) {
    if (err.message.includes('DRIVE_RESOURCES_PENDING')) {
      blockedSuccess = true;
      console.log('✓ Bloqueo DB preventivo verificado:', err.message);
    } else {
      console.log('Fallo inesperado:', err.message);
    }
  }
  if (!blockedSuccess) {
    console.error('FAIL: No se bloqueó la purga DB');
    process.exit(1);
  }

  // 5. Simular limpieza de items en Drive (marcar deleted)
  console.log('5. Marcando items Drive como deleted...');
  await callRpc('admin_purge_item_update', {
    p_operation_id: opId,
    p_item_type: 'drive_file',
    p_target_id: mockDriveFileId,
    p_status: 'deleted',
  }, serviceKey);

  await callRpc('admin_purge_item_update', {
    p_operation_id: opId,
    p_item_type: 'drive_folder',
    p_target_id: mockDriveFolderId,
    p_status: 'deleted',
  }, serviceKey);

  // 6. Avanzar estado a processing_db
  const stepData = await callRpc('admin_purge_operation_step_drive', {
    p_operation_id: opId,
  }, serviceKey);
  console.log('✓ Fase Drive completada. Estado:', stepData.status);

  // 7. Ejecutar purga DB ahora que Drive está limpio
  console.log('7. Ejecutando purga DB autorizada...');
  const purgeResult = await callRpc('admin_pedidos_purge', {
    p_operation_id: opId,
    p_actor: 'QA Test Actor',
  }, serviceKey);

  console.log('✓ Purga DB completada:', purgeResult);

  // 8. Verificar que PED 1 y PED 2 desaparecieron y PED 3 permanece
  const remainingPeds = await queryRest('pedidos', `id=in.(${ped1Id},${ped2Id},${ped3Id})&select=id,pedido_visible`, serviceKey);

  console.log('8. Pedidos restantes en base de datos:', remainingPeds.map(p => p.pedido_visible));
  if (remainingPeds.length === 1 && remainingPeds[0].id === ped3Id) {
    console.log('✓ Caso 1 (2 eliminados, 1 permanece): PASS');
  } else {
    console.error('FAIL en pedidos restantes');
    process.exit(1);
  }

  // 9. Verificar Audit Log
  const auditLogs = await queryRest('audit_log', 'accion=eq.ADMIN_BULK_DELETE_PEDIDOS&order=created_at.desc&limit=1', serviceKey);
  console.log('9. Audit Log registrado:', auditLogs?.[0]?.metadata);

  // Limpiar PED 3 de prueba
  await deleteRest('pedidos', `id=eq.${ped3Id}`, serviceKey);
  await deleteRest('envios_formulario', `id=eq.${testEnvioId}`, serviceKey);
  console.log('=== VERIFICACIÓN EN CLOUD TEST FINALIZADA CON ÉXITO ===');
}

run().catch(console.error);
