import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const prodSecrets = JSON.parse(fs.readFileSync(path.join(userProfile, '.pedidos', 'prod-secrets.json'), 'utf8'));

const envPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
const envContent = fs.readFileSync(envPath, 'utf8');
let n8nBaseUrl = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_BASE_URL=')) n8nBaseUrl = line.split('=')[1].trim();
}

const serviceClient = createClient(PROD_URL, prodSecrets.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const adminEmail = 'pablosaldiviainfo@gmail.com';
const redirectTo = 'https://formulariomedios.pages.dev/confirmar-email';

async function sendOfficialRecovery() {
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'recovery',
    email: adminEmail,
    options: {
      redirectTo: redirectTo
    }
  });

  if (error) {
    console.error('Error generating link:', error.message);
    process.exit(1);
  }

  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    console.error('No action_link returned');
    process.exit(1);
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #0284c7; color: #ffffff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">Secretaría de Medios</h1>
    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Gobierno de Tierra del Fuego AIAS</p>
  </div>
  <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 30px 20px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #0f172a; margin-top: 0;">Acceso Administrativo a PEDIDOS</h2>
    <p>Hola Pablo,</p>
    <p>Se ha generado un nuevo enlace seguro para establecer tu contraseña y acceder al panel de gestión institucional.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${actionLink}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Establecer Contraseña e Ingresar
      </a>
    </div>
    <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
      Este enlace es de uso único y confidencial. Si no solicitaste este acceso, por favor desestima este correo.
    </p>
  </div>
</body>
</html>
`;

  const webhookUrl = `${n8nBaseUrl.replace(/\/$/, '')}/webhook/pedidos-email-prod`;
  const n8nPayload = {
    communication_id: crypto.randomUUID(),
    pedido_id: '',
    servicio_id: '',
    tipo: 'magic_link_access',
    to: adminEmail,
    subject: 'Restablecer contraseña de acceso — Sistema PEDIDOS',
    html: htmlBody,
    text: `Hola Pablo,\n\nPara restablecer tu contraseña y acceder a PEDIDOS, ingresa al siguiente enlace:\n${actionLink}`,
  };

  const dispatchRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-n8n-integration-secret': prodSecrets.N8N_INTEGRATION_SECRET,
    },
    body: JSON.stringify(n8nPayload),
  });

  if (dispatchRes.ok) {
    console.log('SUCCESS: Correo de recuperación enviado directamente a ' + adminEmail + ' vía Gmail oficial de Secretaría de Medios.');
  } else {
    const resText = await dispatchRes.text();
    console.error('Dispatch error (status ' + dispatchRes.status + '):', resText);
  }
}

sendOfficialRecovery().catch(err => {
  console.error('Fatal error:', err);
});
