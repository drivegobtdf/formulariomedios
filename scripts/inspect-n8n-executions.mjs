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

  console.log('Consultando ejecuciones de workflow S5zEKvdsTHPmUQWm en n8n:', n8nBaseUrl);
  const res = await fetch(`${n8nBaseUrl}/api/v1/executions?workflowId=S5zEKvdsTHPmUQWm&limit=10&includeData=true`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const executions = data.data || [];
  console.log(`Ejecuciones obtenidas: ${executions.length}`);

  for (const exec of executions) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Execution ID: ${exec.id} | Status: ${exec.status} | Mode: ${exec.mode} | Started: ${exec.startedAt} | Finished: ${exec.stoppedAt}`);
    
    // Si hay data de ejecución detallada
    if (exec.data?.resultData?.error) {
      console.log('ERROR:', JSON.stringify(exec.data.resultData.error, null, 2));
    }
    
    if (exec.data?.resultData?.runData) {
      console.log('Run Data Nodes:', Object.keys(exec.data.resultData.runData));
      for (const nodeName of Object.keys(exec.data.resultData.runData)) {
        const nodeRun = exec.data.resultData.runData[nodeName];
        if (nodeRun[0]?.error) {
          console.log(`  * Error en nodo "${nodeName}":`, nodeRun[0].error);
        }
      }
    }
  }
}

run().catch(console.error);
