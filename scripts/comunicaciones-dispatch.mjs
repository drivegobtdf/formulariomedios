import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// 1. Resolve environment variables
function loadEnv() {
  const env = { ...process.env };
  
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const pedidosEnvPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  if (fs.existsSync(pedidosEnvPath)) {
    const raw = fs.readFileSync(pedidosEnvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }

  const localEnvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(localEnvPath)) {
    const raw = fs.readFileSync(localEnvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }

  return env;
}

import { execSync } from 'node:child_process';

const PROJECT_REF = 'yqfkzgqvezarzhlwiilo';

function getCloudServiceKey() {
  try {
    const rawOutput = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} --reveal --output json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(rawOutput);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.name === 'service_role' || item.name === 'secret' || item.type === 'service_role') {
          return item.api_key || item.key || item.value || '';
        }
      }
    } else if (typeof parsed === 'object') {
      return parsed.service_role || parsed.secret || parsed.SUPABASE_SERVICE_ROLE_KEY || '';
    }
  } catch {
    return '';
  }
  return '';
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || getCloudServiceKey();

if (!serviceRoleKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required to dispatch communications');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const n8nUrl = (env.N8N_BASE_URL || env.N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const n8nApiKey = env.N8N_API_KEY || '';
const integrationSecret = env.N8N_INTEGRATION_SECRET || (n8nApiKey ? crypto.createHash('sha256').update(n8nApiKey + ':pedidos-integration-salt').digest('hex') : '');
export function resolvePublicAppUrl(
  publicAppUrl = env.PUBLIC_APP_URL || env.APP_URL,
  isExplicitLocal = Boolean(
    env.ENVIRONMENT === 'local' ||
    env.APP_ENV === 'local' ||
    env.LOCAL_DEV === 'true' ||
    (env.SUPABASE_URL || '').includes('127.0.0.1') ||
    (env.SUPABASE_URL || '').includes('localhost')
  )
) {
  if (publicAppUrl && typeof publicAppUrl === 'string' && publicAppUrl.trim().length > 0) {
    try {
      const trimmed = publicAppUrl.trim();
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return trimmed.replace(/\/+$/, '');
      }
    } catch {
      throw new Error(`CONFIG_ERROR: PUBLIC_APP_URL '${publicAppUrl}' no es una URL válida`);
    }
  }

  if (isExplicitLocal) {
    return 'http://localhost:4173/formulariomedios';
  }

  throw new Error('CONFIG_ERROR: PUBLIC_APP_URL no está configurado en el servidor para el entorno Cloud.');
}

export function getEncryptionKey(customKey) {
  const rawSecret = customKey || env.MAGIC_LINK_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || 'pedidos-default-envelope-secret-key-32-bytes!';
  return crypto.createHash('sha256').update(rawSecret + ':pedidos-magic-envelope-key-v1').digest();
}

export function decryptTokenEnvelope(envelope, purpose, communicationId, customKey) {
  if (!envelope || envelope.algo !== 'aes-256-gcm' || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    return null;
  }
  const key = getEncryptionKey(customKey);
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  const aad = Buffer.from(`purpose:${purpose}|comm:${communicationId}`, 'utf8');
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function encryptTokenEnvelope(plaintext, purpose, communicationId, customKey) {
  const key = getEncryptionKey(customKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const aad = Buffer.from(`purpose:${purpose}|comm:${communicationId}`, 'utf8');
  cipher.setAAD(aad);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    version: '1.0',
    algo: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag,
    ciphertext,
    purpose,
    created_at: new Date().toISOString()
  };
}

// Brand styles and HTML Escaper
const BRAND_PRIMARY = '#0B2746';
const BRAND_BG = '#F4F7FA';
const BRAND_CARD = '#FFFFFF';
const BRAND_TEXT = '#1F2937';
const BRAND_MUTED = '#6B7280';
const BRAND_WARNING = '#D97706';

function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function extractDateFromItem(item) {
  if (!item || typeof item !== 'object') return null;
  const direct =
    item.fecha_operativa ||
    item.fecha ||
    item.fecha_limite ||
    item.fecha_sugerida ||
    item.grabacion_fecha;
  if (direct && typeof direct === 'string' && direct.trim().length > 0 && direct.trim() !== '-') {
    return direct.trim();
  }
  const info = item.informacion_especifica;
  if (info && typeof info === 'object') {
    const infoDate =
      info.fecha ||
      info.fecha_limite ||
      info.fecha_sugerida ||
      info.grabacion_fecha ||
      info.fecha_publicacion ||
      info.fecha_evento;
    if (infoDate && typeof infoDate === 'string' && infoDate.trim().length > 0 && infoDate.trim() !== '-') {
      return infoDate.trim();
    }
  }
  return null;
}

function wrapHtmlLayout(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND_TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_BG}; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: ${BRAND_CARD}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color: ${BRAND_PRIMARY}; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                GOBIERNO DE TIERRA DEL FUEGO AIAS
              </h1>
              <p style="margin: 4px 0 0 0; color: #93C5FD; font-size: 13px; font-weight: 500; text-transform: uppercase;">
                Secretaría de Medios — Sistema PEDIDOS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color: #F9FAFB; padding: 20px 24px; border-top: 1px solid #E5E7EB; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: ${BRAND_MUTED};">
                Este es un mensaje automático de notificación del Sistema de Solicitud de Servicios.
              </p>
              <p style="margin: 0; font-size: 11px; color: ${BRAND_MUTED};">
                Secretaría de Medios · San Martín 450, Ushuaia, Tierra del Fuego AIAS
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderEmail(tipo, payload, customAppUrl) {
  const resolvedUrl = customAppUrl || (env.PUBLIC_APP_URL ? resolvePublicAppUrl(env.PUBLIC_APP_URL) : resolvePublicAppUrl(undefined, true));
  const cleanAppUrl = resolvedUrl.replace(/\/$/, '');
  const rawNombre = (payload?.solicitante_nombre || payload?.nombre_solicitante || payload?.nombre || payload?.destinatario_nombre || 'Solicitante').trim();
  const nombreSafe = escapeHtml(rawNombre);

  switch (tipo) {
    case 'submission_created':
    case 'pedido_ingresado': {
      const pedidos = Array.isArray(payload?.pedidos) ? payload.pedidos : [];
      const totalPedidos = pedidos.length || 1;
      const codes = pedidos.map(p => p.pedido_visible).filter(Boolean).join(', ');
      const subject = `[PEDIDOS] Solicitud recibida: ${codes || 'Nuevos Requerimientos'}`;

      let rowsHtml = '';
      let rowsText = '';

      for (const p of pedidos) {
        const pedVis = escapeHtml(p.pedido_visible || 'N/D');
        const cat = escapeHtml(p.categoria || p.categoria_nombre || 'Servicio');
        const tip = escapeHtml(p.tipo || p.tipo_nombre || 'General');

        rowsHtml += `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 10px; font-weight: bold; color: ${BRAND_PRIMARY};">${pedVis}</td>
            <td style="padding: 12px 10px;">${cat}</td>
            <td style="padding: 12px 10px;">${tip}</td>
          </tr>`;
        rowsText += `* ${p.pedido_visible || 'N/D'} | ${cat} - ${tip}\n`;
      }

      const rawToken = (payload?.magic_token || payload?.raw_token || payload?.token || '').trim();
      const portalUrl = rawToken
        ? `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}`
        : `${cleanAppUrl}/mis-solicitudes`;
      const areaSafe = escapeHtml(payload?.area_solicitante || 'Gobierno');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Confirmación de Solicitud Ingresada
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
          Hemos recibido su solicitud formal con <strong>${totalPedidos} requerimiento(s) de servicio</strong> para el área <strong>${areaSafe}</strong>.
        </p>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
          <thead>
            <tr style="background-color: #F3F4F6; text-align: left;">
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Código PED</th>
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Categoría</th>
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Tipo</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ver mis solicitudes
          </a>
        </div>
      `;

      const text = `CONFIRMACIÓN DE INGRESO DE SOLICITUD\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\n\nRequerimientos:\n${rowsText}\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Confirmación de Solicitud', contentHtml),
        text,
        n8nTipo: 'pedido_ingresado'
      };
    }

    case 'solicitud_info':
    case 'info_requested':
    case 'informacion_faltante': {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Requerimiento de Información (48h): ${payload?.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const rawMensaje = payload?.mensaje || payload?.motivo || 'Se requiere información complementaria para avanzar con el pedido.';
      const mensajeSafe = escapeHtml(rawMensaje);
      const catSafe = escapeHtml(payload?.categoria || '');
      const tipSafe = escapeHtml(payload?.tipo || '');
      const expiresAt = payload?.expires_at ? new Date(payload.expires_at).toLocaleString('es-AR') : '48 horas corridas desde la emisión';

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Requerimiento de Información Complementaria
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          El equipo de producción requiere información adicional para dar curso a su pedido <strong>${pedVisible}</strong> (${catSafe}${tipSafe ? ' - ' + tipSafe : ''}):
        </p>
        <div style="background-color: #FEF3C7; border-left: 4px solid ${BRAND_WARNING}; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #92400E; font-size: 13px; text-transform: uppercase;">
            Mensaje del Operador:
          </p>
          <p style="margin: 0; font-size: 14px; color: #78350F; line-height: 1.4;">
            "${mensajeSafe}"
          </p>
        </div>
        <div style="background-color: #FEE2E2; border-left: 4px solid #DC2626; padding: 14px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-weight: 700; color: #991B1B; font-size: 13px;">
            ⚠️ PLAZO CONTRACTUAL: Dispone de 48 HORAS CORRIDAS para responder este requerimiento (Vence: ${escapeHtml(expiresAt)}).
          </p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Responder Requerimiento en el Portal
          </a>
        </div>
      `;

      const text = `REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (48 HORAS CORRIDAS)\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSe requiere información adicional para su pedido ${payload?.pedido_visible || 'PED'}:\n\n"${rawMensaje}"\n\nATENCIÓN: Dispone de 48 horas corridas (Vence: ${expiresAt}) para responder.\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Requerimiento de Información', contentHtml),
        text,
        n8nTipo: 'informacion_faltante'
      };
    }

    case 'informacion_respondida':
    case 'info_responded': {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Información Recibida: ${payload?.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">
          ✓ Información Complementaria Recibida
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Confirmamos que su respuesta para el pedido <strong>${pedVisible}</strong> ha sido recibida correctamente por el equipo de la Secretaría de Medios.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Consultar en Mis Solicitudes
          </a>
        </div>
      `;

      const text = `INFORMACIÓN COMPLEMENTARIA RECIBIDA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nConfirmamos la recepción de la información para su pedido ${payload?.pedido_visible || 'PED'}.\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Información Recibida', contentHtml),
        text,
        n8nTipo: 'informacion_respondida'
      };
    }

    case 'finalizado':
    case 'pedido_finalized': {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const rawPedVisible = (payload?.pedido_visible || '').trim();
      const subject = `[PEDIDOS] Solicitud Finalizada: ${payload?.pedido_visible || 'PED'}`;
      const rawToken = (payload?.magic_token || payload?.raw_token || payload?.token || '').trim();
      const portalUrl = rawToken
        ? `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}${rawPedVisible ? `&pedido=${encodeURIComponent(rawPedVisible)}` : ''}`
        : `${cleanAppUrl}/mis-solicitudes`;
      const urlEntrega = payload?.url_entrega || payload?.extra?.url_entrega || '';
      const notaCierreSafe = escapeHtml(payload?.nota_cierre || payload?.nota || '');

      let entregaBlockHtml = '';
      if (urlEntrega) {
        entregaBlockHtml = `
          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; padding: 16px; margin: 20px 0; border-radius: 6px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-weight: 700; color: #065F46; font-size: 14px;">
              Enlace de Entrega de Material:
            </p>
            <a href="${escapeHtml(urlEntrega)}" style="display: inline-block; background-color: #059669; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 600; font-size: 13px;">
              Abrir Material Entregado
            </a>
          </div>`;
      }

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">
          ✓ Solicitud Finalizada Exitosamente
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que el pedido <strong>${pedVisible}</strong> ha sido completado y finalizado.
        </p>
        ${entregaBlockHtml}
        ${notaCierreSafe ? `
          <div style="background-color: #F0FDF4; border-left: 4px solid #059669; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #166534;"><strong>Nota de entrega:</strong> ${notaCierreSafe}</p>
          </div>
        ` : ''}
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ver Detalle en Mis Solicitudes
          </a>
        </div>
      `;

      const text = `PEDIDO FINALIZADO Y ENTREGADO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSu pedido ${payload?.pedido_visible || 'PED'} ha sido completado.\n${urlEntrega ? `Material: ${urlEntrega}\n` : ''}Portal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout(`Pedido Finalizado — ${pedVisible}`, contentHtml),
        text,
        n8nTipo: 'finalizado'
      };
    }

    case 'cancelado':
    case 'pedido_cancelled': {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Solicitud Cancelada: ${payload?.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const motivoSafe = escapeHtml(payload?.motivo_cancelacion || payload?.motivo || 'Cancelado por el operador.');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #DC2626; font-size: 18px;">
          Solicitud Cancelada
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que su pedido <strong>${pedVisible}</strong> ha sido cancelado.
        </p>
        <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 14px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 6px 0; font-weight: 700; color: #991B1B; font-size: 13px;">
            Motivo de Cancelación:
          </p>
          <p style="margin: 0; font-size: 14px; color: #7F1D1D;">
            "${motivoSafe}"
          </p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Consultar en el Portal
          </a>
        </div>
      `;

      const text = `PEDIDO CANCELADO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSu pedido ${payload?.pedido_visible || 'PED'} ha sido cancelado.\nMotivo: ${payload?.motivo_cancelacion || ''}\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout(`Pedido Cancelado — ${pedVisible}`, contentHtml),
        text,
        n8nTipo: 'cancelado'
      };
    }

    case 'magic_link_access':
    case 'access_requested': {
      const subject = `[PEDIDOS] Acceso a Mis Solicitudes`;
      const rawToken = payload?.magic_token || payload?.raw_token || '';
      const accessUrl = `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Acceso a Mis Solicitudes
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
          Usá el siguiente botón para acceder a tus solicitudes en el portal de la Secretaría de Medios:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${accessUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 15px;">
            Ver mis solicitudes
          </a>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 12px; color: ${BRAND_MUTED}; text-align: center;">
          Este enlace estará disponible mientras se encuentre vigente.
        </p>
      `;

      const text = `ACCESO A MIS SOLICITUDES\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nUsá el siguiente enlace para acceder a tus solicitudes:\n${accessUrl}\n\n(Este enlace estará disponible mientras se encuentre vigente)\n`;

      return {
        subject,
        html: wrapHtmlLayout('Acceso a Mis Solicitudes', contentHtml),
        text,
        n8nTipo: 'magic_link_access'
      };
    }

    case 'en_proceso':
    case 'pedido_en_proceso': {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const rawPedVisible = (payload?.pedido_visible || '').trim();
      const subject = `[PEDIDOS] Tu solicitud ${payload?.pedido_visible || 'PED'} está en proceso`;
      const rawToken = (payload?.magic_token || payload?.raw_token || payload?.token || '').trim();
      const portalUrl = rawToken
        ? `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}${rawPedVisible ? `&pedido=${encodeURIComponent(rawPedVisible)}` : ''}`
        : `${cleanAppUrl}/mis-solicitudes`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Tu solicitud está en proceso
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Tu solicitud <strong>${pedVisible}</strong> ingresó a la etapa &ldquo;En proceso&rdquo;.
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          El equipo de la Secretaría de Medios comenzó a trabajar en tu requerimiento.
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: ${BRAND_MUTED}; line-height: 1.5;">
          Podés consultar el estado actualizado desde el portal de Mis solicitudes.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ver mis solicitudes
          </a>
        </div>
      `;

      const text = `TU SOLICITUD ESTÁ EN PROCESO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nTu solicitud ${payload?.pedido_visible || 'PED'} ingresó a la etapa "En proceso".\nEl equipo de la Secretaría de Medios comenzó a trabajar en tu requerimiento.\nPodés consultar el estado actualizado desde el portal de Mis solicitudes en:\n${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Tu solicitud está en proceso', contentHtml),
        text,
        n8nTipo: 'en_proceso'
      };
    }

    case 'pedido_nuevo_admin':
    case 'admin_submission_alert': {
      const pedidos =
        Array.isArray(payload?.pedidos) && payload.pedidos.length > 0
          ? payload.pedidos
          : payload?.pedido_visible
          ? [
              {
                id: payload.pedido_id,
                pedido_visible: payload.pedido_visible,
                categoria: payload.categoria,
                tipo: payload.tipo,
                fecha_limite: payload.fecha_limite,
                fecha: payload.fecha,
                fecha_operativa: payload.fecha_operativa,
                informacion_especifica: payload.informacion_especifica,
              },
            ]
          : [];
      const count = pedidos.length || 1;
      const codes = pedidos.map((p) => p.pedido_visible).filter(Boolean).join(', ');
      const singlePedidoId = payload?.pedido_id || (pedidos.length === 1 ? pedidos[0].id : null);
      const gestionUrl = singlePedidoId
        ? `${cleanAppUrl}/gestion/pedidos/${singlePedidoId}`
        : `${cleanAppUrl}/gestion`;
      const subject = `[PEDIDOS Admin] Nueva solicitud ingresada: ${codes || 'Nuevos Requerimientos'}`;
      const solicitante = escapeHtml(
        payload?.solicitante ||
          payload?.solicitante_nombre ||
          payload?.nombre_solicitante ||
          payload?.nombre_apellido ||
          'Solicitante'
      );
      const area = escapeHtml(payload?.area_solicitante || 'Gobierno');
      const correo = escapeHtml(payload?.correo || '');

      let rowsHtml = '';
      let rowsText = '';

      for (const p of pedidos) {
        const pedVis = escapeHtml(p.pedido_visible || 'N/D');
        const cat = escapeHtml(p.categoria || 'Servicio');
        const tip = escapeHtml(p.tipo || 'General');
        const rawDate = extractDateFromItem(p) || extractDateFromItem(payload);
        const fechaDisplay = rawDate ? escapeHtml(String(rawDate)) : '-';

        rowsHtml += `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 10px 10px; font-weight: bold; color: ${BRAND_PRIMARY};">${pedVis}</td>
            <td style="padding: 10px 10px;">${cat}</td>
            <td style="padding: 10px 10px;">${tip}</td>
            <td style="padding: 10px 10px; color: #4B5563;">${fechaDisplay}</td>
          </tr>`;
        rowsText += `* ${p.pedido_visible || 'N/D'} | ${p.categoria || ''} - ${p.tipo || ''} (Fecha: ${fechaDisplay})\n`;
      }

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Nueva Solicitud Ingresada al Sistema
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a Administrador/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Se ha recibido una nueva solicitud pública con <strong>${count} requerimiento(s)</strong>:
        </p>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 16px; margin: 12px 0 20px 0; border-radius: 6px; font-size: 13px;">
          <p style="margin: 0 0 4px 0;"><strong>Solicitante:</strong> ${solicitante} (${correo})</p>
          <p style="margin: 0;"><strong>Área / Dependencia:</strong> ${area}</p>
        </div>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
          <thead>
            <tr style="background-color: #F3F4F6; text-align: left;">
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Código PED</th>
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Categoría</th>
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Tipo</th>
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${gestionUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            ${singlePedidoId ? 'Ver Detalle del Pedido' : 'Ir al Panel de Gestión'}
          </a>
        </div>
      `;

      const text = `NUEVA SOLICITUD INGRESADA (ADMIN)\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a Administrador/a ${rawNombre},\nSe recibió una nueva solicitud de ${solicitante} (${area}, ${payload?.correo || ''}) con ${count} requerimiento(s):\n\n${rowsText}\nPanel de gestión:\n${gestionUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Nueva Solicitud Ingresada', contentHtml),
        text,
        n8nTipo: 'pedido_nuevo_admin',
      };
    }

    default: {
      const pedVisible = escapeHtml(payload?.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Actualización de Estado: ${payload?.pedido_visible || 'PED'}`;
      const estado = escapeHtml(payload?.estado || 'En proceso');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Actualización de Estado
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que su pedido <strong>${pedVisible}</strong> ha cambiado al estado: <strong>${estado}</strong>.
        </p>
      `;

      const text = `ACTUALIZACIÓN DE ESTADO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSu pedido ${payload?.pedido_visible || 'PED'} ha cambiado al estado: ${payload?.estado || ''}.\n`;

      return {
        subject,
        html: wrapHtmlLayout('Actualización de Estado', contentHtml),
        text,
        n8nTipo: 'cambio_estado'
      };
    }
  }
}

export async function dispatchBatch(batchSize = 10, leaseSeconds = 300) {
  console.log(`[DISPATCHER] Claiming batch of up to ${batchSize} pending communications (lease: ${leaseSeconds}s)...`);
  
  const { data: claimedItems, error: claimError } = await supabase.rpc('comunicacion_claim_batch', {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds
  });

  if (claimError) {
    console.error('[DISPATCHER] Claim RPC error:', claimError);
    return { success: false, error: claimError.message, processed: 0, results: [] };
  }

  const items = claimedItems || [];
  console.log(`[DISPATCHER] Claimed ${items.length} items.`);

  if (items.length === 0) {
    return { success: true, processed: 0, results: [] };
  }

  const results = [];
  const webhookUrl = `${n8nUrl}/webhook/pedidos-email`;
  const appUrl = resolvePublicAppUrl();

  for (const item of items) {
    const claimId = item.claim_id;
    let isUncertain = false;
    console.log(`[DISPATCHER] Processing item ${item.id} (claim_id=${claimId}, ${item.tipo_comunicacion} -> ${item.destinatario_email})...`);

    try {
      // Allowlist check in test mode
      const toEmail = (item.destinatario_email || '').trim().toLowerCase();
      const isAuthorizedTestEmail = toEmail === 'pablosaldiviainfo@gmail.com' ||
        toEmail.endsWith('@tierradelfuego.gob.ar') ||
        toEmail.endsWith('@tdf.gob.ar');

      if (!isAuthorizedTestEmail && process.env.NODE_ENV !== 'production') {
        throw {
          semanticType: 'PERMANENT_RECIPIENT_REJECTED',
          status: 422,
          message: `Destinatario '${toEmail}' no está en la allowlist de pruebas autorizadas.`
        };
      }

      let payloadToRender = item.payload || {};
      if (item.tipo_comunicacion === 'pedido_ingresado' || item.tipo_comunicacion === 'submission_created') {
        if (payloadToRender.encrypted_envelope) {
          try {
            const idempotencyKey = item.idempotency_key || `submission_created:${item.id}`;
            const decrypted = decryptTokenEnvelope(
              payloadToRender.encrypted_envelope,
              'magic_link_delivery',
              idempotencyKey
            );
            if (decrypted) {
              payloadToRender = { ...payloadToRender, magic_token: decrypted, raw_token: decrypted };
            }
          } catch (e) {
            console.warn(`[DISPATCHER] Could not decrypt envelope for item ${item.id}:`, e.message);
          }
        }

        if (!payloadToRender.magic_token && !payloadToRender.raw_token) {
          try {
            const { data: accessData, error: accessErr } = await supabase.rpc('solicitante_request_access', {
              p_correo: item.destinatario_email,
            });
            if (!accessErr && accessData?.found && accessData?.magic_token) {
              const idempotencyKey = item.idempotency_key || `submission_created:${item.id}`;
              const envelope = encryptTokenEnvelope(
                accessData.magic_token,
                'magic_link_delivery',
                idempotencyKey
              );
              payloadToRender = {
                ...payloadToRender,
                magic_token: accessData.magic_token,
                raw_token: accessData.magic_token,
                encrypted_envelope: envelope,
              };
              await supabase
                .from('comunicaciones_pedido')
                .update({
                  payload: {
                    ...item.payload,
                    encrypted_envelope: envelope,
                  },
                })
                .eq('id', item.id);
            }
          } catch (genErr) {
            console.warn(`[DISPATCHER] Error generating access token for submission_created ${item.id}:`, genErr.message);
          }
        }

        const finalToken = (payloadToRender.magic_token || payloadToRender.raw_token || '');
        if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
          throw {
            semanticType: 'PERMANENT_VALIDATION_ERROR',
            status: 422,
            message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token de acceso válido. Despacho cancelado para evitar envío sin enlace directo.`
          };
        }
      } else if (item.tipo_comunicacion === 'magic_link_access' || item.tipo_comunicacion === 'access_requested') {
        if (payloadToRender.encrypted_envelope) {
          try {
            const idempotencyKey = item.idempotency_key || `magic_link:${item.id}`;
            const decrypted = decryptTokenEnvelope(
              payloadToRender.encrypted_envelope,
              'magic_link_delivery',
              idempotencyKey
            );
            if (decrypted) {
              payloadToRender = { ...payloadToRender, magic_token: decrypted, raw_token: decrypted };
            }
          } catch (e) {
            console.warn(`[DISPATCHER] Could not decrypt envelope for item ${item.id}:`, e.message);
          }
        }

        const finalToken = (payloadToRender.magic_token || payloadToRender.raw_token || '');
        if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
          throw {
            semanticType: 'PERMANENT_VALIDATION_ERROR',
            status: 422,
            message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token de acceso válido. Despacho cancelado para evitar envío de enlace vacío.`
          };
        }
      } else if (item.tipo_comunicacion === 'informacion_faltante' || item.tipo_comunicacion === 'info_requested') {
        if (payloadToRender.encrypted_envelope) {
          try {
            const idempotencyKey = item.idempotency_key || `info_requested:${payloadToRender.solicitud_id || item.id}`;
            const decrypted = decryptTokenEnvelope(
              payloadToRender.encrypted_envelope,
              'info_requested_delivery',
              idempotencyKey
            );
            if (decrypted) {
              payloadToRender = {
                ...payloadToRender,
                token: decrypted,
                raw_token: decrypted,
                info_token: decrypted,
              };
            }
          } catch (e) {
            console.warn(`[DISPATCHER] Could not decrypt envelope for item ${item.id}:`, e.message);
          }
        }

        const finalToken = (payloadToRender.token || payloadToRender.raw_token || payloadToRender.info_token || '');
        if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
          throw {
            semanticType: 'PERMANENT_VALIDATION_ERROR',
            status: 422,
            message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token directo de respuesta válido. Despacho cancelado para evitar envío sin enlace directo.`
          };
        }
      } else if (item.tipo_comunicacion === 'finalizado' || item.tipo_comunicacion === 'pedido_finalizado') {
        if (payloadToRender.encrypted_envelope) {
          try {
            const idempotencyKey = item.idempotency_key || `finalizado:${item.id}`;
            const decrypted = decryptTokenEnvelope(
              payloadToRender.encrypted_envelope,
              'magic_link_delivery',
              idempotencyKey
            );
            if (decrypted) {
              payloadToRender = { ...payloadToRender, magic_token: decrypted, raw_token: decrypted };
            }
          } catch (e) {
            console.warn(`[DISPATCHER] Could not decrypt envelope for finalizado ${item.id}:`, e.message);
          }
        }

        if (!payloadToRender.magic_token && !payloadToRender.raw_token) {
          try {
            const { data: accessData, error: accessErr } = await supabase.rpc('solicitante_request_access', {
              p_correo: item.destinatario_email,
            });
            if (!accessErr && accessData?.found && accessData?.magic_token) {
              const idempotencyKey = item.idempotency_key || `finalizado:${item.id}`;
              const envelope = encryptTokenEnvelope(
                accessData.magic_token,
                'magic_link_delivery',
                idempotencyKey
              );
              payloadToRender = {
                ...payloadToRender,
                magic_token: accessData.magic_token,
                raw_token: accessData.magic_token,
                encrypted_envelope: envelope,
              };
              await supabase
                .from('comunicaciones_pedido')
                .update({
                  payload: {
                    ...item.payload,
                    encrypted_envelope: envelope,
                  },
                })
                .eq('id', item.id);
            }
          } catch (genErr) {
            console.warn(`[DISPATCHER] Error generating access token for finalizado ${item.id}:`, genErr.message);
          }
        }

        const finalToken = (payloadToRender.magic_token || payloadToRender.raw_token || '');
        if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
          throw {
            semanticType: 'PERMANENT_VALIDATION_ERROR',
            status: 422,
            message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token de acceso válido para Mis Solicitudes. Despacho cancelado para evitar envío sin enlace directo.`
          };
        }
      } else if (item.tipo_comunicacion === 'en_proceso' || item.tipo_comunicacion === 'pedido_en_proceso') {
        if (payloadToRender.encrypted_envelope) {
          try {
            const idempotencyKey = item.idempotency_key || `en_proceso:${item.id}`;
            const decrypted = decryptTokenEnvelope(
              payloadToRender.encrypted_envelope,
              'magic_link_delivery',
              idempotencyKey
            );
            if (decrypted) {
              payloadToRender = { ...payloadToRender, magic_token: decrypted, raw_token: decrypted };
            }
          } catch (e) {
            console.warn(`[DISPATCHER] Could not decrypt envelope for en_proceso ${item.id}:`, e.message);
          }
        }

        if (!payloadToRender.magic_token && !payloadToRender.raw_token) {
          try {
            const { data: accessData, error: accessErr } = await supabase.rpc('solicitante_request_access', {
              p_correo: item.destinatario_email,
            });
            if (!accessErr && accessData?.found && accessData?.magic_token) {
              const idempotencyKey = item.idempotency_key || `en_proceso:${item.id}`;
              const envelope = encryptTokenEnvelope(
                accessData.magic_token,
                'magic_link_delivery',
                idempotencyKey
              );
              payloadToRender = {
                ...payloadToRender,
                magic_token: accessData.magic_token,
                raw_token: accessData.magic_token,
                encrypted_envelope: envelope,
              };
              await supabase
                .from('comunicaciones_pedido')
                .update({
                  payload: {
                    ...item.payload,
                    encrypted_envelope: envelope,
                  },
                })
                .eq('id', item.id);
            }
          } catch (genErr) {
            console.warn(`[DISPATCHER] Error generating access token for en_proceso ${item.id}:`, genErr.message);
          }
        }

        const finalToken = (payloadToRender.magic_token || payloadToRender.raw_token || '');
        if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
          throw {
            semanticType: 'PERMANENT_VALIDATION_ERROR',
            status: 422,
            message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token de acceso válido para Mis Solicitudes. Despacho cancelado para evitar envío sin enlace directo.`
          };
        }
      }

      const rendered = renderEmail(item.tipo_comunicacion, payloadToRender, appUrl);
      
      const headers = { 'Content-Type': 'application/json' };
      if (integrationSecret) {
        headers['x-n8n-integration-secret'] = integrationSecret;
      }

      const n8nPayload = {
        communication_id: item.id,
        pedido_id: item.pedido_id || '',
        servicio_id: item.payload?.servicio_id || '',
        tipo: rendered.n8nTipo,
        to: item.destinatario_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
      };

      let res;
      try {
        res = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(n8nPayload)
        });
      } catch (fetchErr) {
        isUncertain = true;
        throw {
          semanticType: 'NETWORK_TIMEOUT_POST_SEND',
          status: 0,
          message: `Fallo de conexión o timeout durante despacho a n8n: ${fetchErr?.message}`
        };
      }

      if (!res.ok) {
        const errBody = await res.text();
        const status = res.status;
        if (status === 400 || status === 422) {
          throw { semanticType: 'PERMANENT_VALIDATION_ERROR', status, message: `Error permanente de validación (HTTP ${status}): ${errBody.slice(0, 300)}` };
        } else if (status === 401) {
          throw { semanticType: 'PERMANENT_AUTH_UNAUTHORIZED', status, message: `Error de autenticación con n8n (HTTP 401): ${errBody.slice(0, 300)}` };
        } else if (status === 403) {
          const isOauth = errBody.toLowerCase().includes('token') || errBody.toLowerCase().includes('oauth') || errBody.toLowerCase().includes('credential');
          const semanticType = isOauth ? 'PERMANENT_AUTH_CREDENTIALS_EXPIRED' : 'PERMANENT_AUTH_FORBIDDEN';
          throw { semanticType, status, message: `Acceso prohibido n8n [${semanticType}] (HTTP 403): ${errBody.slice(0, 300)}` };
        } else if (status === 429) {
          const retryHeader = res.headers.get('Retry-After');
          const parsedWait = retryHeader ? parseInt(retryHeader, 10) : 600;
          throw { semanticType: 'TRANSIENT_RATE_LIMIT', status, retryAfter: isNaN(parsedWait) ? 600 : parsedWait, message: `Cuota excedida (HTTP 429). Reintento en ${parsedWait}s` };
        } else if (status === 504 || status === 502) {
          isUncertain = true;
          throw { semanticType: 'TRANSIENT_GATEWAY_TIMEOUT_POST_SEND', status, message: `Timeout o fallo de pasarela tras despacho (HTTP ${status}). Resultado externo incierto: ${errBody.slice(0, 300)}` };
        } else {
          // 500 / 503
          let explicitPreSendError = false;
          try {
            const parsed = JSON.parse(errBody);
            if (parsed.sent === false || parsed.stage === 'pre_send' || parsed.code === 'BAD_INPUT') {
              explicitPreSendError = true;
            }
          } catch {
            void 0;
          }

          if (explicitPreSendError) {
            throw { semanticType: 'TRANSIENT_SERVER_ERROR_CONFIRMED_NOT_SENT', status, message: `Error de servidor n8n / Gmail confirmado previo a envío (HTTP ${status}): ${errBody.slice(0, 300)}` };
          } else {
            isUncertain = true;
            throw { semanticType: 'UNKNOWN_SERVER_OUTCOME_500', status, message: `Error de servidor n8n / Gmail con resultado desconocido tras envío (HTTP ${status}). Retenido en uncertain para evitar duplicación: ${errBody.slice(0, 300)}` };
          }
        }
      }

      const resJson = await res.json();
      const providerMsgId = resJson?.message_id || resJson?.id || `n8n_${Date.now()}`;

      // Mark success passing claim_id
      await supabase.rpc('comunicacion_mark_result', {
        p_id: item.id,
        p_success: true,
        p_provider_msg_id: String(providerMsgId),
        p_error: null,
        p_retry_seconds: null,
        p_claim_id: claimId,
        p_uncertain: false
      });

      console.log(`[DISPATCHER] Item ${item.id} SUCCESS -> provider_message_id: ${providerMsgId}`);
      results.push({ id: item.id, success: true, status: 'enviada', provider_message_id: String(providerMsgId) });
    } catch (err) {
      const errMsg = err?.message || 'Unknown dispatch error';
      console.error(`[DISPATCHER] Item ${item.id} FAILED -> ${errMsg}`);
      
      let retrySecs = 300;
      if (
        err.semanticType === 'PERMANENT_VALIDATION_ERROR' ||
        err.semanticType === 'PERMANENT_AUTH_UNAUTHORIZED' ||
        err.semanticType === 'PERMANENT_AUTH_FORBIDDEN' ||
        err.semanticType === 'PERMANENT_AUTH_CREDENTIALS_EXPIRED' ||
        err.semanticType === 'PERMANENT_RECIPIENT_REJECTED'
      ) {
        retrySecs = 0; // Agota inmediatamente
      } else if (err.semanticType === 'TRANSIENT_RATE_LIMIT') {
        retrySecs = err.retryAfter || 600;
      } else {
        retrySecs = Math.min(3600, 300 * Math.pow(2, item.attempts || 0));
      }

      await supabase.rpc('comunicacion_mark_result', {
        p_id: item.id,
        p_success: false,
        p_provider_msg_id: null,
        p_error: errMsg,
        p_retry_seconds: retrySecs,
        p_claim_id: claimId,
        p_uncertain: isUncertain
      });

      results.push({
        id: item.id,
        success: false,
        status: isUncertain ? 'uncertain' : (retrySecs === 0 ? 'fallida' : 'retry_wait'),
        error: errMsg
      });
    }
  }

  return { success: true, processed: items.length, results };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('comunicaciones-dispatch.mjs')) {
  const batchArg = parseInt(process.argv[2] || '10', 10);
  dispatchBatch(batchArg)
    .then(r => {
      console.log('[DISPATCHER] Completed dispatch run:', JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[DISPATCHER] Fatal error:', err);
      process.exit(1);
    });
}
