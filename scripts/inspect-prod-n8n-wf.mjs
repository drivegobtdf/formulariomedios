import fs from 'node:fs';
import path from 'node:path';

function loadCredentials() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const envPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
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

async function run() {
  const env = loadCredentials();
  const n8nBaseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const n8nApiKey = env.N8N_API_KEY;

  const res = await fetch(`${n8nBaseUrl}/api/v1/workflows/dCi8cil1FBZdcJKL`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });

  const wf = await res.json();
  console.log('Workflow dCi8cil1FBZdcJKL nodes:');
  for (const node of wf.nodes) {
    console.log(`\nNode: "${node.name}" (${node.type})`);
    if (node.parameters?.jsCode) {
      console.log('JS Code:\n', node.parameters.jsCode);
    }
    if (node.parameters?.path) {
      console.log('Webhook Path:', node.parameters.path);
    }
  }
}

run().catch(console.error);
