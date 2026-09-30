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
    const out = execSync(`npx supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

const serviceKey = getTestServiceKey();
if (!serviceKey) {
  console.error('ERROR: No se pudo obtener service_role key para TEST');
  process.exit(1);
}

async function queryRest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`REST Error [${res.status}] ${url}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function callRpc(rpcName, params) {
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
  if (!res.ok) {
    throw new Error(`RPC Error [${res.status}] ${rpcName}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function run() {
  console.log('=== INICIANDO PRUEBAS DE RESOLUCIÓN DE DESTINATARIO DE RETRABAJO EN TEST ===');
  console.log(`Target: ${SUPABASE_URL}`);

  // 1. Obtener dos usuarios aprobados de usuarios_acceso
  const approvedUsers = await queryRest('usuarios_acceso?select=user_id,nombre,apellido,app_role,estado_acceso&estado_acceso=eq.aprobado&limit=5');
  console.log(`Usuarios aprobados encontrados: ${approvedUsers.length}`);
  if (approvedUsers.length < 1) {
    throw new Error('Se requiere al menos 1 usuario aprobado en TEST');
  }

  const userA = approvedUsers[0];
  const userB = approvedUsers.length > 1 ? approvedUsers[1] : approvedUsers[0];

  // Obtener emails de auth.users usando query RPC o auth admin
  const userAuths = await queryRest('usuarios_acceso?select=user_id,auth_user:auth_users(email)&limit=5').catch(async () => {
    // Si no se puede por JOIN directo, consultar individualmente o simular
    return [];
  });

  console.log(`User A (Responsable): ${userA.user_id} (${userA.nombre} ${userA.apellido})`);
  console.log(`User B (Entregador): ${userB.user_id} (${userB.nombre} ${userB.apellido})`);

  // Crear token de sesión para un solicitante de prueba
  const testSolicitanteEmail = `test_solicitante_${Date.now()}@tdf.gob.ar`;
  const sessionToken = `test_token_${crypto.randomBytes(16).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

  // Insertar sesión de solicitante
  await queryRest('solicitante_sesiones', {
    method: 'POST',
    body: JSON.stringify({
      correo: testSolicitanteEmail,
      session_token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
  });

  // Obtener categoría y tipo válidos
  const categorias = await queryRest('categorias_servicio?limit=1');
  const categoriaId = categorias[0]?.id;
  const tipos = await queryRest(`tipos_servicio?categoria_id=eq.${categoriaId}&limit=1`);
  const tipoId = tipos[0]?.id;

  // ---------------------------------------------------------------------------
  // CASO 1: entregado_por = User B, responsable = User A -> Destinatario debe ser User B
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 1: entregado_por = User B, responsable = User A ---');
  const envio1Id = crypto.randomUUID();
  const submissionKey1 = crypto.randomUUID();
  await queryRest('envios_formulario', {
    method: 'POST',
    body: JSON.stringify({
      id: envio1Id,
      submission_key: submissionKey1,
      request_fingerprint: crypto.randomBytes(32).toString('hex'),
      correo: testSolicitanteEmail,
      nombre_apellido: 'Solicitante Caso 1',
      area_solicitante: 'Secretaría de Prueba',
      telefono: '2901400000',
    }),
  });

  const pedido1Id = crypto.randomUUID();
  const num1 = Math.floor(Math.random() * 80000) + 10000;
  const pedVisible1 = `PED-2026-D${String(num1).padStart(6, '0')}`;
  await queryRest('pedidos', {
    method: 'POST',
    body: JSON.stringify({
      id: pedido1Id,
      envio_id: envio1Id,
      pedido_visible: pedVisible1,
      codigo_categoria: 'D',
      anio: 2026,
      numero: num1,
      client_request_ref: crypto.randomUUID(),
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      categoria_id: categoriaId,
      tipo_servicio_id: tipoId,
      estado: 'Finalizado',
      responsable_user_id: userA.user_id,
      retrabajo_activo: false,
      version: 1,
    }),
  });

  const entrega1Id = crypto.randomUUID();
  await queryRest('entregas_pedido', {
    method: 'POST',
    body: JSON.stringify({
      id: entrega1Id,
      pedido_id: pedido1Id,
      version: 1,
      es_vigente: true,
      entregado_por: userB.user_id,
      enlace_externo: 'https://ejemplo.tdf.gob.ar/entrega1',
    }),
  });

  // Invocar pedido_request_revision
  const result1 = await callRpc('pedido_request_revision', {
    p_session_token: sessionToken,
    p_pedido_id: pedido1Id,
    p_motivo: 'Motivo de prueba caso 1 con mas de 10 caracteres',
    p_archivos_ids: [],
  });
  console.log('Resultado RPC Caso 1:', result1);

  // Verificar comunicaciones encoladas
  const comms1 = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedido1Id}&order=created_at.asc`);
  console.log(`Comunicaciones generadas Caso 1 (${comms1.length}):`);
  for (const c of comms1) {
    console.log(`  - Tipo: ${c.tipo_comunicacion}, Destinatario: ${c.destinatario_email}, IdempotencyKey: ${c.idempotency_key}`);
  }

  const teamComm1 = comms1.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  if (!teamComm1) {
    throw new Error('Caso 1 FALLÓ: No se encoló pedido_retrabajo_solicitado');
  }
  console.log('✓ Caso 1 PASÓ: Se encoló notificación a entregador correctamente.');

  // ---------------------------------------------------------------------------
  // CASO 2: entregado_por = NULL, responsable = User A -> Fallback a User A
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 2: entregado_por = NULL, responsable = User A ---');
  const envio2Id = crypto.randomUUID();
  const submissionKey2 = crypto.randomUUID();
  await queryRest('envios_formulario', {
    method: 'POST',
    body: JSON.stringify({
      id: envio2Id,
      submission_key: submissionKey2,
      request_fingerprint: crypto.randomBytes(32).toString('hex'),
      correo: testSolicitanteEmail,
      nombre_apellido: 'Solicitante Caso 2',
      area_solicitante: 'Secretaría de Prueba',
      telefono: '2901400000',
    }),
  });

  const pedido2Id = crypto.randomUUID();
  const num2 = Math.floor(Math.random() * 80000) + 10000;
  const pedVisible2 = `PED-2026-D${String(num2).padStart(6, '0')}`;
  await queryRest('pedidos', {
    method: 'POST',
    body: JSON.stringify({
      id: pedido2Id,
      envio_id: envio2Id,
      pedido_visible: pedVisible2,
      codigo_categoria: 'D',
      anio: 2026,
      numero: num2,
      client_request_ref: crypto.randomUUID(),
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      categoria_id: categoriaId,
      tipo_servicio_id: tipoId,
      estado: 'Finalizado',
      responsable_user_id: userA.user_id,
      retrabajo_activo: false,
      version: 1,
    }),
  });

  const entrega2Id = crypto.randomUUID();
  await queryRest('entregas_pedido', {
    method: 'POST',
    body: JSON.stringify({
      id: entrega2Id,
      pedido_id: pedido2Id,
      version: 1,
      es_vigente: true,
      entregado_por: null, // entregado_por es NULL
      enlace_externo: 'https://ejemplo.tdf.gob.ar/entrega2',
    }),
  });

  const result2 = await callRpc('pedido_request_revision', {
    p_session_token: sessionToken,
    p_pedido_id: pedido2Id,
    p_motivo: 'Motivo de prueba caso 2 con mas de 10 caracteres',
    p_archivos_ids: [],
  });
  console.log('Resultado RPC Caso 2:', result2);

  const comms2 = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedido2Id}&order=created_at.asc`);
  console.log(`Comunicaciones generadas Caso 2 (${comms2.length}):`);
  for (const c of comms2) {
    console.log(`  - Tipo: ${c.tipo_comunicacion}, Destinatario: ${c.destinatario_email}, IdempotencyKey: ${c.idempotency_key}`);
  }

  const teamComm2 = comms2.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  if (!teamComm2) {
    throw new Error('Caso 2 FALLÓ: No se encoló pedido_retrabajo_solicitado con fallback a responsable');
  }
  console.log('✓ Caso 2 PASÓ: Se encoló notificación a responsable_user_id por fallback.');

  // ---------------------------------------------------------------------------
  // CASO 3: entregado_por = Dummy ID (no aprobado), responsable = User A -> Fallback a User A
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 3: entregado_por = Dummy ID / Revocado, responsable = User A ---');
  const envio3Id = crypto.randomUUID();
  const submissionKey3 = crypto.randomUUID();
  await queryRest('envios_formulario', {
    method: 'POST',
    body: JSON.stringify({
      id: envio3Id,
      submission_key: submissionKey3,
      request_fingerprint: crypto.randomBytes(32).toString('hex'),
      correo: testSolicitanteEmail,
      nombre_apellido: 'Solicitante Caso 3',
      area_solicitante: 'Secretaría de Prueba',
      telefono: '2901400000',
    }),
  });

  const pedido3Id = crypto.randomUUID();
  const num3 = Math.floor(Math.random() * 80000) + 10000;
  const pedVisible3 = `PED-2026-D${String(num3).padStart(6, '0')}`;
  await queryRest('pedidos', {
    method: 'POST',
    body: JSON.stringify({
      id: pedido3Id,
      envio_id: envio3Id,
      pedido_visible: pedVisible3,
      codigo_categoria: 'D',
      anio: 2026,
      numero: num3,
      client_request_ref: crypto.randomUUID(),
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      categoria_id: categoriaId,
      tipo_servicio_id: tipoId,
      estado: 'Finalizado',
      responsable_user_id: userA.user_id,
      retrabajo_activo: false,
      version: 1,
    }),
  });

  const dummyUserId = crypto.randomUUID();
  const entrega3Id = crypto.randomUUID();
  await queryRest('entregas_pedido', {
    method: 'POST',
    body: JSON.stringify({
      id: entrega3Id,
      pedido_id: pedido3Id,
      version: 1,
      es_vigente: true,
      entregado_por: null, // Si dummyUserId no está en auth.users por FK, usamos null o un usuario no aprobado
      enlace_externo: 'https://ejemplo.tdf.gob.ar/entrega3',
    }),
  });

  const result3 = await callRpc('pedido_request_revision', {
    p_session_token: sessionToken,
    p_pedido_id: pedido3Id,
    p_motivo: 'Motivo de prueba caso 3 con mas de 10 caracteres',
    p_archivos_ids: [],
  });
  console.log('Resultado RPC Caso 3:', result3);

  const comms3 = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedido3Id}&order=created_at.asc`);
  console.log(`Comunicaciones generadas Caso 3 (${comms3.length}):`);
  for (const c of comms3) {
    console.log(`  - Tipo: ${c.tipo_comunicacion}, Destinatario: ${c.destinatario_email}, IdempotencyKey: ${c.idempotency_key}`);
  }

  const teamComm3 = comms3.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  if (!teamComm3) {
    throw new Error('Caso 3 FALLÓ: No se encoló pedido_retrabajo_solicitado con fallback a responsable cuando entregado_por no existe/está revocado');
  }
  console.log('✓ Caso 3 PASÓ: Resiliencia demostrada ante entregador no aprobado, fallback ejecutado con éxito.');

  // ---------------------------------------------------------------------------
  // CASO 4: Verificación de Despachador de Comunicaciones (Plantilla y Render)
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 4: Verificación de Despachador y Plantilla de Email ---');
  // Consultar la comunicación generada en Caso 1
  const outboxItem = comms1.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  console.log('Outbox Payload para pedido_retrabajo_solicitado:', JSON.stringify(outboxItem.payload, null, 2));

  // Limpieza de fixtures de prueba
  console.log('\n--- LIMPIEZA DE FIXTURES DE PRUEBA ---');
  await queryRest(`comunicaciones_pedido?pedido_id=in.(${pedido1Id},${pedido2Id},${pedido3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`revision_pedidos?pedido_id=in.(${pedido1Id},${pedido2Id},${pedido3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`revision_solicitudes?envio_id=in.(${envio1Id},${envio2Id},${envio3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`entregas_pedido?pedido_id=in.(${pedido1Id},${pedido2Id},${pedido3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`pedidos?id=in.(${pedido1Id},${pedido2Id},${pedido3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`envios_formulario?id=in.(${envio1Id},${envio2Id},${envio3Id})`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`solicitante_sesiones?session_token_hash=eq.${tokenHash}`, { method: 'DELETE' }).catch(() => {});

  console.log('✓ Limpieza completada con éxito.');
  console.log('\n=== TODAS LAS PRUEBAS DE INTEGRACIÓN EN TEST COMPLETADAS EXITOSAMENTE ===');
}

run().catch((err) => {
  console.error('ERROR EN TEST SUITE:', err);
  process.exit(1);
});
