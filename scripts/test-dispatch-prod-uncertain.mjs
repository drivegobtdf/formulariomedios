import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

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
  console.log(`[DISPATCH RESPONSE] HTTP ${res.status}:`, text);
  return text ? JSON.parse(text) : null;
}

async function run() {
  console.log('=== RECONCILIACIÓN Y DISPATCH CONTROLADO EN PROD ===');
  
  // 1. Reconciliar la comunicación de retrabajo de PED-2026-D000058 (3e2d78b2-50bb-4085-8578-eabbabb7aa35)
  const commId = '3e2d78b2-50bb-4085-8578-eabbabb7aa35';
  console.log(`Reconciliando comunicación uncertain: ${commId}...`);
  const recResult = await callRpc('comunicacion_reconcile_uncertain', {
    p_id: commId,
    p_resolution: 'reintentar',
    p_notes: 'Reconciliado tras actualizar allowedTypes en n8n',
  });
  console.log('Resultado de reconciliación:', recResult);

  // 2. Invocar el despachador Edge Function
  console.log('Invocando comunicaciones-dispatch Edge Function en PROD...');
  const dispatchResult = await triggerEdgeDispatcher();
  console.log('Resultado del despacho:', JSON.stringify(dispatchResult, null, 2));

  // 3. Consultar estado final de la comunicación en la BD de PROD
  const res = await fetch(`${SUPABASE_URL}/rest/v1/comunicaciones_pedido?id=eq.${commId}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const comm = await res.json();
  console.log('\nEstado final de la comunicación en BD:', {
    id: comm[0]?.id,
    tipo: comm[0]?.tipo_comunicacion,
    destinatario: comm[0]?.destinatario_email,
    estado: comm[0]?.estado,
    sent_at: comm[0]?.sent_at,
    provider_message_id: comm[0]?.provider_message_id,
    error_message: comm[0]?.error_message,
  });
}

run().catch((err) => {
  console.error('ERROR EN RECONCILIACIÓN/DESPACHO:', err);
  process.exit(1);
});
