import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

function loadCredentials() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const envPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.substring(0, eq).trim()] = t.substring(eq + 1).trim();
  }
  return env;
}

function getCloudKeys() {
  const rawOutput = execSync('npx supabase projects api-keys --project-ref yqfkzgqvezarzhlwiilo --reveal --output json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(rawOutput);
  let serviceRoleKey = '';
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.name === 'service_role' || item.type === 'service_role') {
        serviceRoleKey = item.api_key || item.key || item.value || '';
      }
    }
  }
  return serviceRoleKey;
}

async function main() {
  const env = loadCredentials();
  const n8nBaseUrl = env.N8N_BASE_URL.replace(/\/+$/, '');
  const n8nApiKey = env.N8N_API_KEY;
  const serviceKey = getCloudKeys();

  const supabaseUrl = 'https://yqfkzgqvezarzhlwiilo.supabase.co';
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const randomSuffix = Math.floor(Math.random() * 800000) + 100000;
  const authorizedRecipient = 'pablosaldiviainfo@gmail.com';
  const submissionKey = crypto.randomUUID();

  console.log('================================================================');
  console.log('  PEDIDOS — PRUEBA OPERATIVA DE DESPACHO AUTOMÁTICO (F10)');
  console.log('  Sin despacho manual ni worker local');
  console.log(`  Destinatario: ${authorizedRecipient}`);
  console.log('================================================================\n');

  // 1. Generar comunicación pendiente vía submission_create_core
  console.log('[1/5] Generando nuevo envío mediante submission_create_core...');
  const payload = {
    schema_version: 3,
    submission_key: submissionKey,
    contacto: {
      nombre_apellido: `Test Scheduler Auto ${randomSuffix}`,
      telefono: '+542901445566',
      correo: authorizedRecipient,
      area_solicitante: 'Secretaría de Medios',
    },
    pedidos: [
      {
        client_request_ref: crypto.randomUUID(),
        categoria_slug: 'diseno_grafico',
        tipo_slug: 'flyer_rrss',
        informacion_especifica: {
          titulo: `Prueba Scheduler Automático ${randomSuffix}`,
          descripcion: 'Verificación de despacho 100% desatendido en infraestructura permanente.',
        },
      },
    ],
  };

  const { data: subData, error: subErr } = await supabase.rpc('submission_create_core', { p_payload: payload });
  if (subErr) throw subErr;

  const envioId = subData.envio_id;
  const pedidoVisible = subData.pedidos[0].pedido_visible;
  console.log(`[INFO] Envio ID: ${envioId}, Pedido: ${pedidoVisible}`);

  // Obtener la fila encolada en comunicaciones_pedido
  const { data: commRow, error: commErr } = await supabase
    .from('comunicaciones_pedido')
    .select('id, estado, tipo_comunicacion, created_at, attempts')
    .eq('envio_id', envioId)
    .single();

  if (commErr) throw commErr;
  const commId = commRow.id;
  const createdAt = commRow.created_at;
  console.log(`[INFO] Comunicación encolada: ID=${commId}, Estado=${commRow.estado}, Creada=${createdAt}`);

  // 2. Esperar al procesamiento automático por n8n Scheduler (máx 150s)
  console.log('\n[2/5] Esperando ciclo de ejecución del Scheduler de n8n (sin disparar nada manual)...');
  const startTime = Date.now();
  let finalRow = null;
  const maxWaitMs = 150000; // 2.5 min

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, 6000));
    const { data: checkRow } = await supabase
      .from('comunicaciones_pedido')
      .select('id, estado, provider_message_id, attempts, sent_at, error_message')
      .eq('id', commId)
      .single();

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r[WAIT] ${elapsedSec}s transcurridos... Estado actual: ${checkRow.estado}`);

    if (checkRow.estado === 'enviada' || checkRow.estado === 'uncertain' || checkRow.estado === 'fallida') {
      finalRow = checkRow;
      console.log('\n');
      break;
    }
  }

  if (!finalRow || finalRow.estado !== 'enviada') {
    throw new Error(`La comunicación no fue despachada automáticamente en el tiempo esperado. Estado final: ${finalRow?.estado || 'timeout'}`);
  }

  console.log('[3/5] ¡Comunicación procesada automáticamente por la infraestructura permanente!');
  console.log(`[INFO] Estado final en DB: ${finalRow.estado}`);
  console.log(`[INFO] Provider Message ID (Gmail): ${finalRow.provider_message_id}`);
  console.log(`[INFO] Sent At: ${finalRow.sent_at}`);

  // 4. Consultar ejecuciones de n8n
  console.log('\n[4/5] Consultando registro de ejecuciones en n8n...');
  const execsRes = await fetch(`${n8nBaseUrl}/api/v1/executions?workflowId=S5zEKvdsTHPmUQWm&limit=5`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });
  const execsData = await execsRes.json();
  const latestExec = execsData.data?.[0];

  const evidenceReport = {
    test_type: 'SCHEDULER_PERMANENT_AUTONOMOUS_DISPATCH',
    timestamp: new Date().toISOString(),
    communication_id: commId,
    envio_id: envioId,
    pedido_visible: pedidoVisible,
    created_at: createdAt,
    sent_at: finalRow.sent_at,
    recipient: authorizedRecipient,
    provider: 'Google Gmail OAuth2 via n8n (S5zEKvdsTHPmUQWm)',
    provider_message_id: finalRow.provider_message_id,
    gmail_acceptance_status: 'ACCEPTED (Message ID retornado por API de Gmail)',
    final_db_state: finalRow.estado,
    n8n_execution: {
      id: latestExec?.id,
      finished: latestExec?.finished,
      mode: latestExec?.mode,
      startedAt: latestExec?.startedAt,
      stoppedAt: latestExec?.stoppedAt,
      status: latestExec?.status,
    },
  };

  console.log('\n[5/5] Resumen de Evidencia Operativa:');
  console.log(JSON.stringify(evidenceReport, null, 2));

  const reportPath = path.join(process.cwd(), 'reports', 'scheduler-autonomous-proof.json');
  fs.writeFileSync(reportPath, JSON.stringify(evidenceReport, null, 2), 'utf8');
  console.log(`\n[INFO] Evidencia guardada en: ${reportPath}`);
}

main().catch(err => {
  console.error('\n[ERROR]', err);
  process.exit(1);
});
