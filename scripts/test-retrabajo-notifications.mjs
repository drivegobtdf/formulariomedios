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
  console.log('=== VERIFICACIÓN DE REGLAS DE ROLES OPERATIVOS PARA RETRABAJO EN TEST ===');
  console.log(`Target: ${SUPABASE_URL}`);

  // 1. Obtener usuarios con roles específicos
  const adminUsers = await queryRest('usuarios_acceso?select=user_id,nombre,apellido,app_role,estado_acceso&estado_acceso=eq.aprobado&app_role=eq.administrador&limit=1');
  const observadorUsers = await queryRest('usuarios_acceso?select=user_id,nombre,apellido,app_role,estado_acceso&estado_acceso=eq.aprobado&app_role=eq.observador&limit=1');

  if (adminUsers.length === 0 || observadorUsers.length === 0) {
    throw new Error('Se requiere al menos 1 usuario administrador y 1 usuario observador en TEST');
  }

  const userAdmin = adminUsers[0];
  const userObservador = observadorUsers[0];

  console.log(`Usuario Admin (Operativo): ${userAdmin.user_id} (${userAdmin.nombre} ${userAdmin.apellido}, rol: ${userAdmin.app_role})`);
  console.log(`Usuario Observador (Solo Lectura): ${userObservador.user_id} (${userObservador.nombre} ${userObservador.apellido}, rol: ${userObservador.app_role})`);

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
  // CASO 1: entregado_por = User Admin, responsable = User Observador
  // Regla 1: entregado_por es admin aprobado -> Notificación va a User Admin
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 1: entregado_por = Admin, responsable = Observador ---');
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
      responsable_user_id: userObservador.user_id,
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
      entregado_por: userAdmin.user_id,
      enlace_externo: 'https://ejemplo.tdf.gob.ar/entrega1',
    }),
  });

  const result1 = await callRpc('pedido_request_revision', {
    p_session_token: sessionToken,
    p_pedido_id: pedido1Id,
    p_motivo: 'Motivo de prueba caso 1 con mas de 10 caracteres',
    p_archivos_ids: [],
  });
  console.log('Resultado RPC Caso 1:', result1);

  const comms1 = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedido1Id}&order=created_at.asc`);
  console.log(`Comunicaciones generadas Caso 1 (${comms1.length}):`);
  for (const c of comms1) {
    console.log(`  - Tipo: ${c.tipo_comunicacion}, Destinatario: ${c.destinatario_email}, IdempotencyKey: ${c.idempotency_key}`);
  }

  const teamComm1 = comms1.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  if (!teamComm1) {
    throw new Error('Caso 1 FALLÓ: No se encoló pedido_retrabajo_solicitado para el entregador admin');
  }
  console.log('✓ Caso 1 PASÓ: Notificación enviada correctamente al entregador operativo (admin).');

  // ---------------------------------------------------------------------------
  // CASO 2: entregado_por = Observador (no operativo), responsable = Admin (operativo)
  // Regla 2: entregado_por es observador -> se ignora -> fallback a responsable admin
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 2: entregado_por = Observador, responsable = Admin ---');
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
      responsable_user_id: userAdmin.user_id,
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
      entregado_por: userObservador.user_id, // Observador!
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
    throw new Error('Caso 2 FALLÓ: No se encoló pedido_retrabajo_solicitado con fallback al responsable admin');
  }
  if (teamComm2.payload.responsable_id === userObservador.user_id) {
    throw new Error('Caso 2 FALLÓ: La notificación se envió erróneamente al observador en vez del admin');
  }
  console.log('✓ Caso 2 PASÓ: Observador ignorado exitosamente; fallback ejecutado hacia el responsable admin.');

  // ---------------------------------------------------------------------------
  // CASO 3: entregado_por = Observador, responsable = Observador (Sin destinatario operativo)
  // Regla 3: No bloquear revisión, no enviar correo interno, registrar en auditoría
  // ---------------------------------------------------------------------------
  console.log('\n--- CASO 3: entregado_por = Observador, responsable = Observador (Sin Operativo) ---');
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
      responsable_user_id: userObservador.user_id, // Observador!
      retrabajo_activo: false,
      version: 1,
    }),
  });

  const entrega3Id = crypto.randomUUID();
  await queryRest('entregas_pedido', {
    method: 'POST',
    body: JSON.stringify({
      id: entrega3Id,
      pedido_id: pedido3Id,
      version: 1,
      es_vigente: true,
      entregado_por: userObservador.user_id, // Observador!
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
  if (!result3.success) {
    throw new Error('Caso 3 FALLÓ: La revisión fue bloqueada indebidamente');
  }

  const comms3 = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedido3Id}&order=created_at.asc`);
  console.log(`Comunicaciones generadas Caso 3 (${comms3.length}):`);
  for (const c of comms3) {
    console.log(`  - Tipo: ${c.tipo_comunicacion}, Destinatario: ${c.destinatario_email}, IdempotencyKey: ${c.idempotency_key}`);
  }

  const teamComm3 = comms3.find((c) => c.tipo_comunicacion === 'pedido_retrabajo_solicitado');
  if (teamComm3) {
    throw new Error('Caso 3 FALLÓ: Se generó erróneamente un correo de equipo a pesar de no haber destinatario operativo');
  }

  const solComm3 = comms3.find((c) => c.tipo_comunicacion === 'revision_solicitada');
  if (!solComm3) {
    throw new Error('Caso 3 FALLÓ: No se generó la confirmación para el solicitante');
  }

  // Verificar que se registró en audit_log
  const auditEntries = await queryRest(`audit_log?recurso_id=eq.${pedido3Id}&accion=eq.revision_team_notification_skipped`);
  console.log(`Entradas de auditoría registradas (${auditEntries.length}):`, auditEntries[0]?.metadata);
  if (auditEntries.length === 0) {
    throw new Error('Caso 3 FALLÓ: No se registró el evento revision_team_notification_skipped en audit_log');
  }
  console.log('✓ Caso 3 PASÓ: Revisión procesada exitosamente sin bloquear, sin correo a observadores y con auditoría registrada.');

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
  console.log('\n=== TODAS LAS PRUEBAS DE RESOLUCIÓN DE ROLES COMPLETADAS EXITOSAMENTE ===');
}

run().catch((err) => {
  console.error('ERROR EN TEST SUITE:', err);
  process.exit(1);
});
