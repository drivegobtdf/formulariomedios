import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;

function getProdSecrets() {
  const prodSecretsPath = path.join(os.homedir(), '.pedidos', 'prod-secrets.json');
  if (fs.existsSync(prodSecretsPath)) {
    try {
      return JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
    } catch {}
  }
  return {};
}

const prodSecrets = getProdSecrets();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || prodSecrets.SUPABASE_SERVICE_ROLE_KEY;
const dispatchSecret = prodSecrets.N8N_DISPATCH_SECRET || process.env.N8N_DISPATCH_SECRET;

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
  return text ? JSON.parse(text) : null;
}

async function run() {
  console.log('=== VERIFICACIÓN Y RECONCILIACIÓN DE COMUNICACIONES UNCERTAIN EN PROD ===');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/comunicaciones_pedido?estado=eq.uncertain&order=created_at.desc`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const uncertainComms = await res.json();
  console.log(`Comunicaciones en estado uncertain encontradas: ${uncertainComms.length}`);

  for (const c of uncertainComms) {
    console.log(`Reconciliando ${c.id} (${c.tipo_comunicacion} -> ${c.destinatario_email})...`);
    await callRpc('comunicacion_reconcile_uncertain', {
      p_id: c.id,
      p_resolution: 'reintentar',
      p_notes: 'Reconciliado tras actualizar allowedTypes en n8n',
    });
  }

  if (uncertainComms.length > 0) {
    console.log('Invocando despachador...');
    const result = await triggerEdgeDispatcher();
    console.log('Resultado:', JSON.stringify(result, null, 2));
  }

  // Verificar estado final de todas las comunicaciones
  const finalRes = await fetch(`${SUPABASE_URL}/rest/v1/comunicaciones_pedido?order=created_at.desc&limit=10`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const finalComms = await finalRes.json();
  console.log('\nÚltimas 10 comunicaciones en PROD:');
  for (const c of finalComms) {
    console.log(`  - ID: ${c.id} | Tipo: ${c.tipo_comunicacion} | Dest: ${c.destinatario_email} | Estado: ${c.estado} | ProviderMsgId: ${c.provider_message_id} | SentAt: ${c.sent_at}`);
  }
}

run().catch(console.error);
