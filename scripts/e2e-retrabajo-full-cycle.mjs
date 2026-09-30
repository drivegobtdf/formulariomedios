import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

function loadEnv() {
  const env = { ...process.env };
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const pedidosEnvPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  if (fs.existsSync(pedidosEnvPath)) {
    const raw = fs.readFileSync(pedidosEnvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
      }
    }
  }
  return env;
}

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
const envCreds = loadEnv();
const dispatchSecret = envCreds.N8N_DISPATCH_SECRET;

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

async function triggerEdgeDispatcher() {
  const url = `${SUPABASE_URL}/functions/v1/comunicaciones-dispatch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pedidos-dispatch-secret': dispatchSecret,
    },
    body: JSON.stringify({ batch_size: 10 }),
  });
  const text = await res.text();
  console.log(`[DISPATCH RESPONSE] HTTP ${res.status}:`, text);
  return text ? JSON.parse(text) : null;
}

async function run() {
  console.log('=== PRUEBA E2E CONTROLADA DE RETRABAJO Y DESPACHO REAL (GMAIL) ===');

  // 1. Obtener usuario admin operativo con email real
  const adminUsers = await queryRest('usuarios_acceso?select=user_id,nombre,apellido,app_role,estado_acceso&estado_acceso=eq.aprobado&app_role=eq.administrador&limit=1');
  const userFinalizador = adminUsers[0];
  console.log('Finalizador Operativo:', userFinalizador);

  // 2. Crear sesión de solicitante
  const testSolicitanteEmail = `pablosaldiviainfo@gmail.com`; // Usar email autorizado para recibir correo
  const sessionToken = `test_token_${crypto.randomBytes(16).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

  await queryRest('solicitante_sesiones', {
    method: 'POST',
    body: JSON.stringify({
      correo: testSolicitanteEmail,
      session_token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
  });

  const categorias = await queryRest('categorias_servicio?limit=1');
  const categoriaId = categorias[0]?.id;
  const tipos = await queryRest(`tipos_servicio?categoria_id=eq.${categoriaId}&limit=1`);
  const tipoId = tipos[0]?.id;

  // 3. Crear envío y pedido finalizado
  const envioId = crypto.randomUUID();
  const submissionKey = crypto.randomUUID();
  await queryRest('envios_formulario', {
    method: 'POST',
    body: JSON.stringify({
      id: envioId,
      submission_key: submissionKey,
      request_fingerprint: crypto.randomBytes(32).toString('hex'),
      correo: testSolicitanteEmail,
      nombre_apellido: 'Solicitante E2E Test',
      area_solicitante: 'Secretaría de Prueba',
      telefono: '2901400000',
    }),
  });

  const pedidoId = crypto.randomUUID();
  const num = Math.floor(Math.random() * 80000) + 10000;
  const pedVisible = `PED-2026-D${String(num).padStart(6, '0')}`;
  await queryRest('pedidos', {
    method: 'POST',
    body: JSON.stringify({
      id: pedidoId,
      envio_id: envioId,
      pedido_visible: pedVisible,
      codigo_categoria: 'D',
      anio: 2026,
      numero: num,
      client_request_ref: crypto.randomUUID(),
      tracking_token_hash: crypto.randomBytes(32).toString('hex'),
      categoria_id: categoriaId,
      tipo_servicio_id: tipoId,
      estado: 'Finalizado',
      responsable_user_id: userFinalizador.user_id,
      retrabajo_activo: false,
      version: 1,
    }),
  });

  const entregaId = crypto.randomUUID();
  await queryRest('entregas_pedido', {
    method: 'POST',
    body: JSON.stringify({
      id: entregaId,
      pedido_id: pedidoId,
      version: 1,
      es_vigente: true,
      entregado_por: userFinalizador.user_id,
      enlace_externo: 'https://ejemplo.tdf.gob.ar/entrega-e2e',
    }),
  });

  // 4. El solicitante pide retrabajo
  console.log('\n--- Invocando pedido_request_revision como solicitante ---');
  const revResult = await callRpc('pedido_request_revision', {
    p_session_token: sessionToken,
    p_pedido_id: pedidoId,
    p_motivo: 'Solicitud de retrabajo E2E: ajustar colores y formato final de entrega.',
    p_archivos_ids: [],
  });
  console.log('Resultado de revisión:', revResult);

  // 5. Verificar comunicaciones generadas en outbox
  const comms = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedidoId}&order=created_at.asc`);
  console.log(`\nComunicaciones encoladas en outbox (${comms.length}):`);
  for (const c of comms) {
    console.log(`  - ID: ${c.id} | Tipo: ${c.tipo_comunicacion} | Destinatario: ${c.destinatario_email} | Estado: ${c.estado}`);
  }

  // 6. Invocar el despachador de comunicaciones Edge Function
  console.log('\n--- Ejecutando comunicaciones-dispatch en TEST ---');
  const dispatchRes = await triggerEdgeDispatcher();
  console.log('Resultado Dispatcher:', JSON.stringify(dispatchRes, null, 2));

  // 7. Verificar estado final de las comunicaciones
  const finalComms = await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedidoId}&order=created_at.asc`);
  console.log(`\nComunicaciones tras despacho (${finalComms.length}):`);
  let allSent = true;
  for (const c of finalComms) {
    console.log(`  - Tipo: ${c.tipo_comunicacion} | Dest: ${c.destinatario_email} | Estado: ${c.estado} | ProviderMsgId: ${c.provider_message_id} | SentAt: ${c.sent_at}`);
    if (c.estado !== 'enviada' || !c.provider_message_id || !c.sent_at) {
      allSent = false;
    }
  }

  // 8. Limpieza de fixtures
  console.log('\n--- Limpieza de fixtures de prueba ---');
  await queryRest(`comunicaciones_pedido?pedido_id=eq.${pedidoId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`revision_pedidos?pedido_id=eq.${pedidoId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`revision_solicitudes?envio_id=eq.${envioId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`entregas_pedido?pedido_id=eq.${pedidoId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`pedidos?id=eq.${pedidoId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`envios_formulario?id=eq.${envioId}`, { method: 'DELETE' }).catch(() => {});
  await queryRest(`solicitante_sesiones?session_token_hash=eq.${tokenHash}`, { method: 'DELETE' }).catch(() => {});

  if (!allSent) {
    throw new Error('E2E FALLÓ: Al menos una comunicación no alcanzó el estado enviada con provider_message_id.');
  }

  console.log('\n✓ PRUEBA E2E COMPLETADA CON ÉXITO ABSOLUTO: Notificación de retrabajo generada, despachada por n8n y entregada a Gmail.');
}

run().catch((err) => {
  console.error('ERROR EN PRUEBA E2E:', err);
  process.exit(1);
});
