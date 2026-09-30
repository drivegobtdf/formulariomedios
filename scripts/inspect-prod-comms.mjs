import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;

function getProdServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const prodSecretsPath = path.join(os.homedir(), '.pedidos', 'prod-secrets.json');
  if (fs.existsSync(prodSecretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
      if (parsed.SUPABASE_SERVICE_ROLE_KEY) return parsed.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch {}
  }
  try {
    const out = execSync(`npx supabase projects api-keys --project-ref ${PROD_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

const serviceKey = getProdServiceKey();

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

function redactEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const redactedName = name.length <= 2 ? `${name[0]}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return `${redactedName}@${domain}`;
}

async function run() {
  console.log('=== VERIFICACIÓN EXHAUSTIVA DE ESTADO EN PROD ===');

  // 1. Verificar usuario 29a14dc3-6be4-47fa-8451-f7cd894b04a1
  const ua = await queryRest('usuarios_acceso?user_id=eq.29a14dc3-6be4-47fa-8451-f7cd894b04a1');
  console.log('Usuario finalizador en usuarios_acceso:', ua);

  // 2. Verificar todas las comunicaciones recientes de tipo pedido_retrabajo_solicitado en PROD
  const retrabajoComms = await queryRest('comunicaciones_pedido?tipo_comunicacion=eq.pedido_retrabajo_solicitado&order=created_at.desc');
  console.log(`\nComunicaciones de tipo pedido_retrabajo_solicitado en PROD: ${retrabajoComms.length}`);
  for (const c of retrabajoComms) {
    console.log(`  - ID: ${c.id} | Pedido: ${c.pedido_id} | Dest: ${redactEmail(c.destinatario_email)} | Estado: ${c.estado} | CreatedAt: ${c.created_at}`);
  }

  // 3. Verificar todas las comunicaciones en estado uncertain o fallida
  const failedComms = await queryRest('comunicaciones_pedido?estado=in.(uncertain,fallida,retry_wait)&order=created_at.desc&limit=10');
  console.log(`\nComunicaciones fallidas o uncertain en PROD: ${failedComms.length}`);
  for (const c of failedComms) {
    console.log(`  - ID: ${c.id} | Tipo: ${c.tipo_comunicacion} | Pedido: ${c.pedido_id} | Dest: ${redactEmail(c.destinatario_email)} | Estado: ${c.estado} | Error: ${c.error_message} | CreatedAt: ${c.created_at}`);
  }

  // 4. Verificar revision_pedidos y revision_solicitudes en PROD
  const allRevs = await queryRest('revision_pedidos?order=requested_at.desc&limit=10');
  console.log(`\nRevisiones registradas en PROD: ${allRevs.length}`);
  for (const r of allRevs) {
    console.log(`  - ID: ${r.id} | PedidoID: ${r.pedido_id} | EntregaID: ${r.entrega_id} | RevNum: ${r.revision_number} | Estado: ${r.estado} | RequestedAt: ${r.requested_at}`);
  }

  // 5. Verificar entregas de PED-2026-C000059
  const entregas = await queryRest('entregas_pedido?pedido_id=eq.d83d75fe-2d0e-4110-bb3a-dfe459f25d96&order=version.asc');
  console.log(`\nEntregas de PED-2026-C000059:`);
  for (const e of entregas) {
    console.log(`  - ID: ${e.id} | Version: ${e.version} | EsVigente: ${e.es_vigente} | EntregadoPor: ${e.entregado_por} | CreatedAt: ${e.created_at}`);
  }
}

run().catch(console.error);
