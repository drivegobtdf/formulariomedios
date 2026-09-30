import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

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

function getAnonKey() {
  try {
    const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'anon' || k.name === 'anon');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

async function testDirectPostgrest() {
  const serviceKey = getTestServiceKey();
  const anonKey = getAnonKey();

  const serviceClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonClient = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('=== TEST DIRECTO CONTRA POSTGREST RPCs ===\n');

  // 1. Crear usuario rol 'equipo'
  const teamEmail = `qa-audit-team-${Date.now()}@tdf.gob.ar`;
  const password = 'Password123!Audit';
  const { data: teamAuth } = await serviceClient.auth.admin.createUser({
    email: teamEmail,
    password: password,
    email_confirm: true,
  });
  await serviceClient.from('usuarios_acceso').upsert({
    user_id: teamAuth.user.id,
    app_role: 'equipo',
    estado_acceso: 'aprobado',
    nombre: 'Team User',
    apellido: 'Audit',
    nombre_usuario: 'team_audit',
  });
  const { data: teamSession } = await anonClient.auth.signInWithPassword({
    email: teamEmail,
    password: password,
  });
  const teamJwt = teamSession.session.access_token;

  // 2. Test anon llamando directamente RPCs
  console.log('--- 1. ANON -> RPC admin_pedidos_purge_preview ---');
  const resAnonPreview = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_pedidos_purge_preview`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pedido_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] }),
  });
  console.log(`HTTP ${resAnonPreview.status}:`, await resAnonPreview.text());

  console.log('\n--- 2. AUTHENTICATED (EQUIPO) -> RPC admin_pedidos_purge_preview ---');
  const resTeamPreview = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_pedidos_purge_preview`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${teamJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pedido_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] }),
  });
  console.log(`HTTP ${resTeamPreview.status}:`, await resTeamPreview.text());

  console.log('\n--- 3. AUTHENTICATED (EQUIPO) -> RPC admin_purge_operation_init ---');
  const resTeamInit = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_purge_operation_init`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${teamJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_pedido_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
      p_idempotency_key: `audit_key_${Date.now()}`,
    }),
  });
  console.log(`HTTP ${resTeamInit.status}:`, await resTeamInit.text());

  console.log('\n--- 4. SERVICE_ROLE -> RPC admin_pedidos_purge_preview ---');
  const resServicePreview = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_pedidos_purge_preview`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pedido_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] }),
  });
  console.log(`HTTP ${resServicePreview.status}:`, await resServicePreview.text());

  // Limpieza
  await serviceClient.from('usuarios_acceso').delete().eq('user_id', teamAuth.user.id);
  await serviceClient.auth.admin.deleteUser(teamAuth.user.id);
}

testDirectPostgrest().catch(console.error);
