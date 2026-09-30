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

  const targetWfId = 'dCi8cil1FBZdcJKL';
  console.log(`[INFO] Fetching PROD workflow ${targetWfId}...`);

  const res = await fetch(`${n8nBaseUrl}/api/v1/workflows/${targetWfId}`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch workflow: ${res.status} ${await res.text()}`);
  }

  const wf = await res.json();
  console.log(`[INFO] Loaded "${wf.name}"`);

  // Update Validar payload node
  const validateNode = wf.nodes.find((n) => n.name === 'Validar payload');
  if (!validateNode) {
    throw new Error('Node "Validar payload" not found');
  }

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
  'magic_link_access',
  'en_proceso',
  'acceso_aprobado',
  'pedido_asignado',
  'pedido_nuevo_admin',
  'pedido_retrabajo_solicitado',
  'revision_solicitada'
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

  console.log('[INFO] Updating PROD workflow in n8n...');
  const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${targetWfId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': n8nApiKey,
    },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: {
        executionOrder: wf.settings?.executionOrder || 'v1',
      },
    }),
  });

  if (!putRes.ok) {
    throw new Error(`Failed to update workflow: ${putRes.status} ${await putRes.text()}`);
  }

  const updatedWf = await putRes.json();
  console.log(`[SUCCESS] Workflow "${updatedWf.name}" updated successfully on n8n server.`);

  if (!updatedWf.active) {
    await fetch(`${n8nBaseUrl}/api/v1/workflows/${targetWfId}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': n8nApiKey },
    });
    console.log('[INFO] Workflow activated.');
  }
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
