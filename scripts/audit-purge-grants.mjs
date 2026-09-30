import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'yqfkzgqvezarzhlwiilo';
const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';

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

function getProdServiceKey() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const prodSecretsPath = path.join(userProfile, '.pedidos', 'prod-secrets.json');
  if (fs.existsSync(prodSecretsPath)) {
    try {
      const prodSecrets = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
      if (prodSecrets.SUPABASE_SERVICE_ROLE_KEY) return prodSecrets.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch {}
  }
  return null;
}

function getTestAnonKey() {
  try {
    const out = execSync(`npx.cmd supabase projects api-keys --project-ref ${TEST_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'anon' || k.name === 'anon');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

async function auditEnvironment(name, projectRef, serviceKey) {
  console.log(`\n========================================================`);
  console.log(`  AUDITORÍA DE GRANTS EN ${name} (${projectRef})`);
  console.log(`========================================================\n`);

  const supabaseUrl = `https://${projectRef}.supabase.co`;

  // Consultar privileges directamente via SQL usando npx supabase db query
  const checkSql = `
    SELECT 
        p.proname AS function_name,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
        p.prosecdef AS is_security_definer,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'admin_pedidos_purge_preview',
          'admin_purge_operation_init',
          'admin_purge_item_update',
          'admin_purge_operation_step_drive',
          'admin_pedidos_purge'
      )
    ORDER BY p.proname;
  `;

  try {
    const jsonOut = execSync(`npx.cmd supabase db query --project-ref ${projectRef} --linked --output json "${checkSql.replace(/\r?\n/g, ' ')}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log(jsonOut);
  } catch (err) {
    // Si no está linked o falla por flags, intentamos via REST RPC o analizamos
    console.log('Fallo db query directo:', err.message);
  }
}

async function main() {
  const testServiceKey = getTestServiceKey();
  const prodServiceKey = getProdServiceKey();

  if (testServiceKey) {
    await auditEnvironment('SUPABASE TEST', TEST_PROJECT_REF, testServiceKey);
  }
}

main().catch(console.error);
