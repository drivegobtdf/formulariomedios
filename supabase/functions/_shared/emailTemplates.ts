// =============================================================================
// Módulo de Plantillas de Correo Institucionales — Sistema PEDIDOS
// Gobierno de Tierra del Fuego AIAS — Secretaría de Medios
// C03, C04, C05, C06, C13: Escapado HTML, Privacidad y Cobertura Total
// =============================================================================

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  n8nTipo: string;
}

const BRAND_PRIMARY = '#0B2746';
const BRAND_SECONDARY = '#1E5AA0';
const BRAND_BG = '#F4F7FA';
const BRAND_CARD = '#FFFFFF';
const BRAND_TEXT = '#1F2937';
const BRAND_MUTED = '#6B7280';
const BRAND_WARNING = '#D97706';

export function escapeHtml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapHtmlLayout(title: string, contentHtml: string): string {
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
          <!-- Encabezado Institucional -->
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

          <!-- Cuerpo Principal -->
          <tr>
            <td style="padding: 32px 24px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Pie Institucional -->
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

export function renderEmail(
  tipoComunicacion: string,
  payload: Record<string, any>,
  appBaseUrl = 'http://localhost:5173'
): RenderedEmail {
  const cleanAppUrl = appBaseUrl.replace(/\/+$/, '');
  const rawNombre = payload.nombre_apellido || payload.destinatario_nombre || 'Solicitante';
  const nombreSafe = escapeHtml(rawNombre);

  switch (tipoComunicacion) {
    // -------------------------------------------------------------------------
    // 1. Envío Agrupado Inicial (submission.created) — C03
    // -------------------------------------------------------------------------
    case 'pedido_ingresado':
    case 'submission_created': {
      const pedidos = Array.isArray(payload.pedidos) ? payload.pedidos : [];
      const count = pedidos.length || 1;
      const codes = pedidos.map((p: any) => p.pedido_visible).filter(Boolean).join(', ');
      const subject = `[PEDIDOS] Solicitud recibida: ${codes || 'Nuevos Requerimientos'}`;

      let rowsHtml = '';
      let rowsText = '';

      for (const p of pedidos) {
        const pedVis = escapeHtml(p.pedido_visible || 'N/D');
        const cat = escapeHtml(p.categoria || 'Servicio');
        const tip = escapeHtml(p.tipo || 'General');
        const trackingUrl = `${cleanAppUrl}/seguimiento?id=${encodeURIComponent(p.id || '')}&ref=${encodeURIComponent(p.pedido_visible || '')}`;

        rowsHtml += `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 10px; font-weight: bold; color: ${BRAND_PRIMARY};">${pedVis}</td>
            <td style="padding: 12px 10px;">${cat}</td>
            <td style="padding: 12px 10px;">${tip}</td>
          </tr>`;
        rowsText += `* ${p.pedido_visible || 'N/D'} | ${p.categoria || ''} - ${p.tipo || ''}\n`;
      }

      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const areaSafe = escapeHtml(payload.area_solicitante || 'Gobierno');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Confirmación de Solicitud Ingresada
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
          Hemos recibido su solicitud formal con <strong>${count} requerimiento(s) de servicio</strong> para el área <strong>${areaSafe}</strong>.
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

      const text = `CONFIRMACIÓN DE SOLICITUD INGRESADA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nHemos recibido su solicitud con ${count} requerimiento(s) de servicio para el área ${payload.area_solicitante || ''}.\n\nRequerimientos:\n${rowsText}\nPuede acceder a la totalidad de sus trámites mediante el botón "Ver mis solicitudes" en:\n${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Solicitud Ingresada', contentHtml),
        text,
        n8nTipo: 'pedido_ingresado',
      };
    }

    // -------------------------------------------------------------------------
    // 2. Información Faltante (Plazo Estricto de 48 Horas Corridas) — C04, C05
    // -------------------------------------------------------------------------
    case 'informacion_faltante':
    case 'info_requested': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Requerimiento de Información (48h): ${payload.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const rawMensaje = payload.mensaje || payload.motivo || 'Se requiere información complementaria para avanzar con el pedido.';
      const mensajeSafe = escapeHtml(rawMensaje);
      const catSafe = escapeHtml(payload.categoria || '');
      const tipSafe = escapeHtml(payload.tipo || '');
      const expiresAt = payload.expires_at ? new Date(payload.expires_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Ushuaia' }) : '48 horas corridas desde la emisión';

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

      const text = `REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (48 HORAS CORRIDAS)\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSe requiere información adicional para su pedido ${payload.pedido_visible || 'PED'}:\n\n"${rawMensaje}"\n\nATENCIÓN: Dispone de 48 horas corridas (Vence: ${expiresAt}) para ingresar su respuesta.\n\nPara responder ingrese a: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Requerimiento de Información', contentHtml),
        text,
        n8nTipo: 'informacion_faltante',
      };
    }

    // -------------------------------------------------------------------------
    // 3. Información Respondida por Solicitante — C04
    // -------------------------------------------------------------------------
    case 'informacion_respondida':
    case 'info_responded': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Información Recibida: ${payload.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">
          ✓ Información Complementaria Recibida
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Confirmamos que su respuesta y documentación complementaria para el pedido <strong>${pedVisible}</strong> ha sido recibida correctamente por el equipo de la Secretaría de Medios.
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: ${BRAND_MUTED}; line-height: 1.5;">
          El pedido reanudará su circuito de producción habitual. Puede verificar el estado en tiempo real a través del portal.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Consultar en Mis Solicitudes
          </a>
        </div>
      `;

      const text = `INFORMACIÓN COMPLEMENTARIA RECIBIDA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nConfirmamos la recepción de la información complementaria para su pedido ${payload.pedido_visible || 'PED'}.\nEl pedido continúa su curso.\n\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Información Recibida', contentHtml),
        text,
        n8nTipo: 'informacion_respondida',
      };
    }

    // -------------------------------------------------------------------------
    // 4. Pedido Finalizado con Entrega — C04, C13
    // -------------------------------------------------------------------------
    case 'finalizado':
    case 'pedido_finalizado': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Solicitud Finalizada: ${payload.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const urlEntrega = payload.extra?.url_entrega || payload.url_entrega || '';
      // NOTA C13: Solo se usa nota_cierre pública, nunca notas_internas
      const notaCierreRaw = payload.nota_cierre || payload.nota || payload.extra?.nota_cierre || '';
      const notaCierreSafe = escapeHtml(notaCierreRaw);
      const catSafe = escapeHtml(payload.categoria || '');
      const tipSafe = escapeHtml(payload.tipo || '');

      let entregaBlockHtml = '';
      let entregaBlockText = '';

      if (urlEntrega) {
        const urlSafe = escapeHtml(urlEntrega);
        entregaBlockHtml = `
          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; padding: 16px; margin: 20px 0; border-radius: 6px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-weight: 700; color: #065F46; font-size: 14px;">
              Enlace de Entrega de Material:
            </p>
            <a href="${urlSafe}" style="display: inline-block; background-color: #059669; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 600; font-size: 13px;">
              Abrir Material Entregado
            </a>
          </div>`;
        entregaBlockText = `\nEnlace de entrega de material: ${urlEntrega}\n`;
      }

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">
          ✓ Solicitud Finalizada Exitosamente
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que el pedido <strong>${pedVisible}</strong> (${catSafe}${tipSafe ? ' - ' + tipSafe : ''}) ha sido completado y finalizado por el equipo de la Secretaría de Medios.
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

      const text = `SOLICITUD FINALIZADA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nEl pedido ${payload.pedido_visible || 'PED'} ha sido completado y finalizado.${entregaBlockText}\nPuede consultar el historial completo en: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Solicitud Finalizada', contentHtml),
        text,
        n8nTipo: 'finalizado',
      };
    }

    // -------------------------------------------------------------------------
    // 5. Pedido Cancelado con Motivo — C04, C13
    // -------------------------------------------------------------------------
    case 'cancelado':
    case 'pedido_cancelado': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Solicitud Cancelada: ${payload.pedido_visible || 'PED'}`;
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;
      const rawMotivo = payload.motivo_cancelacion || payload.extra?.motivo || 'Cancelado por el operador.';
      const motivoSafe = escapeHtml(rawMotivo);
      const catSafe = escapeHtml(payload.categoria || '');
      const tipSafe = escapeHtml(payload.tipo || '');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #DC2626; font-size: 18px;">
          Solicitud Cancelada
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que el pedido <strong>${pedVisible}</strong> (${catSafe}${tipSafe ? ' - ' + tipSafe : ''}) ha sido cancelado.
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

      const text = `SOLICITUD CANCELADA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nEl pedido ${payload.pedido_visible || 'PED'} ha sido cancelado.\n\nMotivo:\n"${rawMotivo}"\n\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Solicitud Cancelada', contentHtml),
        text,
        n8nTipo: 'cancelado',
      };
    }

    // -------------------------------------------------------------------------
    // 6. Enlace Seguro de Acceso (Magic Link — Mis Solicitudes) — C06, C07
    // -------------------------------------------------------------------------
    case 'magic_link_access':
    case 'access_requested': {
      const subject = `[PEDIDOS] Enlace Seguro de Acceso a Mis Solicitudes`;
      const rawToken = payload.magic_token || payload.raw_token || '';
      const accessUrl = `${cleanAppUrl}/mis-solicitudes#token=${encodeURIComponent(rawToken)}`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Acceso Seguro a Mis Solicitudes
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
          Hemos recibido una solicitud para acceder a la totalidad de sus trámites en el portal de la Secretaría de Medios. Utilice el siguiente botón seguro:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${accessUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 15px;">
            Ingresar a Mis Solicitudes
          </a>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 12px; color: ${BRAND_MUTED}; text-align: center;">
          Este enlace es de uso único y expira automáticamente por razones de seguridad.
        </p>
      `;

      const text = `ACCESO SEGURO A MIS SOLICITUDES\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nUtilice el siguiente enlace seguro para acceder a sus solicitudes:\n${accessUrl}\n\n(Este enlace es de uso único)\n`;

      return {
        subject,
        html: wrapHtmlLayout('Acceso a Mis Solicitudes', contentHtml),
        text,
        n8nTipo: 'magic_link_access',
      };
    }

    // -------------------------------------------------------------------------
    // 7. Cambio de Estado General — C04
    // -------------------------------------------------------------------------
    default: {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Actualización de Estado: ${payload.pedido_visible || 'PED'}`;
      const estadoSafe = escapeHtml(payload.estado || 'En proceso');
      const portalUrl = `${cleanAppUrl}/mis-solicitudes`;

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Actualización de Estado
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Le informamos que su pedido <strong>${pedVisible}</strong> ha cambiado al estado: <strong>${estadoSafe}</strong>.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ver en el Portal
          </a>
        </div>
      `;

      const text = `ACTUALIZACIÓN DE ESTADO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSu pedido ${payload.pedido_visible || 'PED'} ha cambiado al estado: ${payload.estado || 'En proceso'}.\n\nPortal: ${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Actualización de Estado', contentHtml),
        text,
        n8nTipo: 'cambio_estado',
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Helper shortcuts for specific template rendering
// -----------------------------------------------------------------------------
export function renderSubmissionCreatedEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('pedido_ingresado', payload, appBaseUrl);
}

export function renderInfoRequestedEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('informacion_faltante', payload, appBaseUrl);
}

export function renderInfoRespondedEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('informacion_respondida', payload, appBaseUrl);
}

export function renderFinalizedEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('finalizado', payload, appBaseUrl);
}

export function renderCancelledEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('cancelado', payload, appBaseUrl);
}

export function renderMagicLinkEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('magic_link_access', payload, appBaseUrl);
}

export const renderEmailForCommunication = renderEmail;
