import fs from 'fs';
import path from 'path';

function loadCredentials() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const envPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Credential file not found at ${envPath}`);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
    }
  }
  return env;
}

async function main() {
  const env = loadCredentials();
  const n8nBaseUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '');
  const n8nApiKey = env.N8N_API_KEY;

  if (!n8nBaseUrl || !n8nApiKey) {
    throw new Error('N8N_BASE_URL and N8N_API_KEY are required');
  }

  console.log('[INFO] Connecting to n8n API...');

  // 1. Fetch current workflow S5zEKvdsTHPmUQWm
  const getRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/S5zEKvdsTHPmUQWm`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });

  if (!getRes.ok) {
    throw new Error(`Failed to get workflow S5zEKvdsTHPmUQWm: ${getRes.status} ${await getRes.text()}`);
  }

  const currentWf = await getRes.json();
  console.log(`[INFO] Loaded workflow: "${currentWf.name}" (active: ${currentWf.active})`);

  // Update the 'Validar payload' node to support all types
  const validateNode = currentWf.nodes.find(n => n.name === 'Validar payload');
  if (validateNode) {
    validateNode.parameters.jsCode = `const p = $input.first().json;

const required = ['communication_id', 'tipo', 'to', 'subject', 'html'];
const missing = required.filter((key) => {
  const value = p[key];
  return value === undefined || value === null || String(value).trim() === '';
});

if (missing.length) {
  throw new Error(\`Faltan campos obligatorios: \${missing.join(', ')}\`);
}

const to = String(p.to).trim();
const basicEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

if (!basicEmail.test(to)) {
  throw new Error('El destinatario no tiene un formato de email válido.');
}

const allowedTypes = [
  'pedido_ingresado',
  'cambio_estado',
  'informacion_faltante',
  'informacion_respondida',
  'finalizado',
  'cancelado',
  'magic_link_access'
];

if (!allowedTypes.includes(String(p.tipo))) {
  throw new Error(\`Tipo de comunicación no permitido: \${p.tipo}\`);
}

return [{
  json: {
    communication_id: String(p.communication_id),
    pedido_id: p.pedido_id ? String(p.pedido_id) : '',
    servicio_id: p.servicio_id ? String(p.servicio_id) : '',
    tipo: String(p.tipo),
    to,
    subject: String(p.subject).trim(),
    html: String(p.html),
    text: p.text ? String(p.text) : ''
  }
}];`;
    console.log('[INFO] Updated "Validar payload" code node with full types coverage');
  }

  // Update workflow on n8n server
  const updatePayload = {
    name: currentWf.name,
    nodes: currentWf.nodes,
    connections: currentWf.connections,
    settings: {
      executionOrder: currentWf.settings?.executionOrder || 'v1',
    },
  };

  const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/S5zEKvdsTHPmUQWm`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': n8nApiKey,
    },
    body: JSON.stringify(updatePayload),
  });

  if (!putRes.ok) {
    throw new Error(`Failed to update workflow: ${putRes.status} ${await putRes.text()}`);
  }

  const updatedWf = await putRes.json();
  console.log('[INFO] Workflow S5zEKvdsTHPmUQWm updated successfully on n8n server.');

  // Activate workflow if not active
  if (!updatedWf.active) {
    const actRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/S5zEKvdsTHPmUQWm/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': n8nApiKey },
    });
    console.log(`[INFO] Workflow activation status: ${actRes.status}`);
  }

  // Export sanitized version to repository
  const sanitized = {
    name: updatedWf.name,
    nodes: updatedWf.nodes.map(n => {
      const copy = { ...n };
      if (copy.credentials) {
        const creds = {};
        for (const [k, v] of Object.entries(copy.credentials)) {
          creds[k] = { id: 'CREDENTIAL_ID_PLACEHOLDER', name: v.name || k };
        }
        copy.credentials = creds;
      }
      return copy;
    }),
    connections: updatedWf.connections,
    settings: updatedWf.settings,
  };

  const exportPath = path.join(process.cwd(), 'n8n', 'workflows', 'pedidos-enviar-comunicacion.json');
  fs.writeFileSync(exportPath, JSON.stringify(sanitized, null, 2), 'utf8');
  console.log(`[INFO] Sanitized workflow exported to ${exportPath}`);
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
