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

        rowsHtml += `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 10px; font-weight: bold; color: ${BRAND_PRIMARY};">${pedVis}</td>
            <td style="padding: 12px 10px;">${cat}</td>
            <td style="padding: 12px 10px;">${tip}</td>
          </tr>`;
        rowsText += `* ${p.pedido_visible || 'N/D'} | ${p.categoria || ''} - ${p.tipo || ''}\n`;
      }

      const rawToken = (payload.magic_token || payload.raw_token || payload.token || '').trim();
      const portalUrl = rawToken
        ? `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}`
        : `${cleanAppUrl}/mis-solicitudes`;
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
      const rawToken = String(payload.token || payload.raw_token || payload.info_token || '').trim();
      const actionUrl = rawToken
        ? `${cleanAppUrl}/solicitud-informacion#token=${encodeURIComponent(rawToken)}`
        : `${cleanAppUrl}/mis-solicitudes`;
      const buttonText = 'Responder requerimiento';
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
          <a href="${actionUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            ${buttonText}
          </a>
        </div>
      `;

      const text = `REQUERIMIENTO DE INFORMACIÓN COMPLEMENTARIA (48 HORAS CORRIDAS)\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nSe requiere información adicional para su pedido ${payload.pedido_visible || 'PED'}:\n\n"${rawMensaje}"\n\nATENCIÓN: Dispone de 48 horas corridas (Vence: ${expiresAt}) para ingresar su respuesta.\n\nPara responder ingrese a: ${actionUrl}\n`;

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
      const rawPedVisible = (payload.pedido_visible || '').trim();
      const subject = `[PEDIDOS] Solicitud Finalizada: ${payload.pedido_visible || 'PED'}`;
      const rawToken = (payload.magic_token || payload.raw_token || payload.token || '').trim();
      const portalUrl = rawToken
        ? `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken)}${rawPedVisible ? `&pedido=${encodeURIComponent(rawPedVisible)}` : ''}`
        : `${cleanAppUrl}/mis-solicitudes`;
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
      const rawToken = (payload.magic_token || payload.raw_token || '') as string;
      if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
        throw new Error('Error al renderizar email de acceso: el token de seguridad es requerido y no puede estar vacío');
      }
      const subject = `[PEDIDOS] Acceso a Mis Solicitudes`;
      const accessUrl = `${cleanAppUrl}/mis-solicitudes#access_token=${encodeURIComponent(rawToken.trim())}`;

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
        n8nTipo: 'magic_link_access',
      };
    }

    // -------------------------------------------------------------------------
    // 7. Pedido en Proceso — C04, C06
    // -------------------------------------------------------------------------
    case 'en_proceso':
    case 'pedido_en_proceso': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const rawPedVisible = (payload.pedido_visible || '').trim();
      const subject = `[PEDIDOS] Tu solicitud ${payload.pedido_visible || 'PED'} está en proceso`;
      const rawToken = (payload.magic_token || payload.raw_token || payload.token || '').trim();
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

      const text = `TU SOLICITUD ESTÁ EN PROCESO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nTu solicitud ${payload.pedido_visible || 'PED'} ingresó a la etapa "En proceso".\nEl equipo de la Secretaría de Medios comenzó a trabajar en tu requerimiento.\nPodés consultar el estado actualizado desde el portal de Mis solicitudes en:\n${portalUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Tu solicitud está en proceso', contentHtml),
        text,
        n8nTipo: 'en_proceso',
      };
    }

    // -------------------------------------------------------------------------
    // 8. Solicitud de Acceso Aprobada (Personal Interno)
    // -------------------------------------------------------------------------
    case 'acceso_aprobado':
    case 'user_access_approved':
    case 'user_approved': {
      const subject = `[PEDIDOS] Tu solicitud de acceso operativo ha sido aprobada`;
      const loginUrl = `${cleanAppUrl}/login`;
      const rolDisplay = payload.app_role || payload.rol || 'equipo';
      const rolLabel =
        rolDisplay === 'administrador'
          ? 'Administrador'
          : rolDisplay === 'observador'
          ? 'Observador'
          : 'Equipo Operativo';
      const usernameSafe = escapeHtml(payload.nombre_usuario || payload.username || '');

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">
          ✓ Solicitud de Acceso Aprobada
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Te informamos que tu solicitud de acceso al sistema <strong>PEDIDOS</strong> ha sido aprobada por la administración.
        </p>
        <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px 18px; margin: 18px 0; border-radius: 6px;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #166534;">
            <strong>Usuario:</strong> ${usernameSafe ? `@${usernameSafe}` : 'Tu cuenta institucional'}
          </p>
          <p style="margin: 0; font-size: 13px; color: #166534;">
            <strong>Rol asignado:</strong> ${escapeHtml(rolLabel)}
          </p>
        </div>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: ${BRAND_MUTED}; line-height: 1.5;">
          Ya podés ingresar al Panel de Gestión utilizando tu correo electrónico y tu contraseña personal.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${loginUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Iniciar Sesión
          </a>
        </div>
      `;

      const text = `SOLICITUD DE ACCESO APROBADA\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a ${rawNombre},\nTu solicitud de acceso al sistema PEDIDOS ha sido aprobada.\nRol asignado: ${rolLabel}\n\nPodés iniciar sesión en:\n${loginUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Acceso Aprobado', contentHtml),
        text,
        n8nTipo: 'acceso_aprobado',
      };
    }

    // -------------------------------------------------------------------------
    // 9. Pedido Asignado a Operador / Responsable
    // -------------------------------------------------------------------------
    case 'pedido_asignado':
    case 'pedido_assigned':
    case 'assignment_notification': {
      const pedVisible = escapeHtml(payload.pedido_visible || 'PED');
      const subject = `[PEDIDOS] Te fue asignado el pedido: ${payload.pedido_visible || 'PED'}`;
      const pedidoId = payload.pedido_id ? encodeURIComponent(String(payload.pedido_id)) : '';
      const gestionUrl = pedidoId ? `${cleanAppUrl}/gestion/pedidos/${pedidoId}` : `${cleanAppUrl}/gestion`;
      const catSafe = escapeHtml(payload.categoria || 'Servicio');
      const tipSafe = escapeHtml(payload.tipo || 'General');
      const areaSafe = escapeHtml(payload.area_solicitante || 'Gobierno');
      const solicitanteSafe = escapeHtml(payload.solicitante_nombre || payload.nombre_solicitante || payload.nombre_apellido || 'Solicitante');
      const fechaLimite = payload.fecha_limite ? escapeHtml(String(payload.fecha_limite)) : 'Sin especificar';
      const motivoAsignacion = payload.motivo ? escapeHtml(String(payload.motivo)) : '';

      const contentHtml = `
        <h2 style="margin: 0 0 16px 0; color: ${BRAND_PRIMARY}; font-size: 18px;">
          Asignación de Pedido de Trabajo
        </h2>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">
          Hola <strong>${nombreSafe}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          Se te ha asignado como responsable del pedido <strong>${pedVisible}</strong>.
        </p>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 16px 0; font-size: 13px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden;">
          <tbody>
            <tr style="border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #475569; width: 35%;">Código PED:</td>
              <td style="padding: 10px 14px; font-weight: 700; color: ${BRAND_PRIMARY};">${pedVisible}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #475569;">Categoría / Tipo:</td>
              <td style="padding: 10px 14px;">${catSafe} — ${tipSafe}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #475569;">Área Solicitante:</td>
              <td style="padding: 10px 14px;">${areaSafe} (${solicitanteSafe})</td>
            </tr>
            <tr>
              <td style="padding: 10px 14px; font-weight: 600; color: #475569;">Fecha Requerida:</td>
              <td style="padding: 10px 14px;">${fechaLimite}</td>
            </tr>
          </tbody>
        </table>
        ${motivoAsignacion ? `
          <div style="background-color: #FEF3C7; border-left: 4px solid ${BRAND_WARNING}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #78350F;"><strong>Nota de asignación:</strong> ${motivoAsignacion}</p>
          </div>
        ` : ''}
        <div style="text-align: center; margin: 28px 0;">
          <a href="${gestionUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ver Pedido en Gestión
          </a>
        </div>
      `;

      const text = `ASIGNACIÓN DE PEDIDO\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nHola ${rawNombre},\nSe te ha asignado como responsable del pedido ${payload.pedido_visible || 'PED'}.\n\n* Código: ${payload.pedido_visible || 'PED'}\n* Categoría: ${payload.categoria || ''} - ${payload.tipo || ''}\n* Área solicitante: ${payload.area_solicitante || ''}\n* Fecha requerida: ${payload.fecha_limite || 'Sin especificar'}\n\nIngresá al pedido en:\n${gestionUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Asignación de Pedido', contentHtml),
        text,
        n8nTipo: 'pedido_asignado',
      };
    }

    // -------------------------------------------------------------------------
    // 10. Alerta a Administradores de Nueva Solicitud Ingresada
    // -------------------------------------------------------------------------
    case 'pedido_nuevo_admin':
    case 'admin_submission_alert': {
      const pedidos = Array.isArray(payload.pedidos) ? payload.pedidos : [];
      const count = pedidos.length || 1;
      const codes = pedidos.map((p: any) => p.pedido_visible).filter(Boolean).join(', ');
      const subject = `[PEDIDOS Admin] Nueva solicitud ingresada: ${codes || 'Nuevos Requerimientos'}`;
      const gestionUrl = `${cleanAppUrl}/gestion`;
      const solicitante = escapeHtml(
        payload.solicitante ||
          payload.solicitante_nombre ||
          payload.nombre_solicitante ||
          payload.nombre_apellido ||
          'Solicitante'
      );
      const area = escapeHtml(payload.area_solicitante || 'Gobierno');
      const correo = escapeHtml(payload.correo || '');

      let rowsHtml = '';
      let rowsText = '';

      for (const p of pedidos) {
        const pedVis = escapeHtml(p.pedido_visible || 'N/D');
        const cat = escapeHtml(p.categoria || 'Servicio');
        const tip = escapeHtml(p.tipo || 'General');
        const fechaLim = p.fecha_limite ? escapeHtml(String(p.fecha_limite)) : '-';

        rowsHtml += `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 10px 10px; font-weight: bold; color: ${BRAND_PRIMARY};">${pedVis}</td>
            <td style="padding: 10px 10px;">${cat}</td>
            <td style="padding: 10px 10px;">${tip}</td>
            <td style="padding: 10px 10px; color: #4B5563;">${fechaLim}</td>
          </tr>`;
        rowsText += `* ${p.pedido_visible || 'N/D'} | ${p.categoria || ''} - ${p.tipo || ''} (Fecha: ${p.fecha_limite || '-'})\n`;
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
              <th style="padding: 10px 10px; color: ${BRAND_MUTED}; font-size: 12px; text-transform: uppercase;">Fecha Límite</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${gestionUrl}" style="display: inline-block; background-color: ${BRAND_PRIMARY}; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Ir al Panel de Gestión
          </a>
        </div>
      `;

      const text = `NUEVA SOLICITUD INGRESADA (ADMIN)\nGobierno de Tierra del Fuego AIAS — Secretaría de Medios\n\nEstimado/a Administrador/a ${rawNombre},\nSe recibió una nueva solicitud de ${solicitante} (${area}, ${payload.correo || ''}) con ${count} requerimiento(s):\n\n${rowsText}\nPanel de gestión:\n${gestionUrl}\n`;

      return {
        subject,
        html: wrapHtmlLayout('Nueva Solicitud Ingresada', contentHtml),
        text,
        n8nTipo: 'pedido_nuevo_admin',
      };
    }

    // -------------------------------------------------------------------------
    // 11. Cambio de Estado General — C04
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

export function renderEnProcesoEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('en_proceso', payload, appBaseUrl);
}

export function renderAccesoAprobadoEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('acceso_aprobado', payload, appBaseUrl);
}

export function renderPedidoAsignadoEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('pedido_asignado', payload, appBaseUrl);
}

export function renderPedidoNuevoAdminEmail(payload: Record<string, any>, appBaseUrl?: string): RenderedEmail {
  return renderEmail('pedido_nuevo_admin', payload, appBaseUrl);
}

export const renderEmailForCommunication = renderEmail;

