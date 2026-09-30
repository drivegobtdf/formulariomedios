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

  const res = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });

  const data = await res.json();
  console.log('Workflows en n8n:');
  for (const wf of data.data) {
    console.log(`  - ID: ${wf.id} | Name: "${wf.name}" | Active: ${wf.active}`);
  }
}

run().catch(console.error);
