/**
 * Módulo de Generación de Mensajes de WhatsApp para Finalización de Pedidos (Fase 4D)
 * Sistema PEDIDOS — Secretaría de Medios
 * 
 * Dominio Canónico: https://formulariomedios.pages.dev/
 */

import { getWhatsAppDetails } from './phoneUtils';

export const CANONICAL_APP_BASE_URL = 'https://formulariomedios.pages.dev';

export interface FinalizacionWhatsAppParams {
  codigo: string;
  titulo?: string | null;
  solicitanteNombre?: string | null;
  solicitanteArea?: string | null;
  solicitanteTelefono?: string | null;
  versionNumber: number;
  enlacesEntrega?: string[] | null;
  archivosEntrega?: string[] | null;
  pedidoId: string;
}

/**
 * Genera el texto estructurado del mensaje de WhatsApp para compartir una entrega.
 * Cumple estrictamente con la especificación de Fase 4D:
 * - V1: "✅ *PEDIDO FINALIZADO*"
 * - V2+: "🔄✨ *NUEVA VERSIÓN DISPONIBLE*"
 * - Bloque de archivos/enlaces: omitido si no hay contenido material.
 * - Bloque de WhatsApp solicitante: normalizado con wa.me o totalmente omitido si es inválido.
 * - URL interna de Gestión: dominio canónico https://formulariomedios.pages.dev/gestion/pedidos/:id
 */
export function generateFinalizacionWhatsAppMessage(params: FinalizacionWhatsAppParams): string {
  const {
    codigo,
    titulo,
    solicitanteNombre,
    solicitanteArea,
    solicitanteTelefono,
    versionNumber,
    enlacesEntrega,
    archivosEntrega,
    pedidoId,
  } = params;

  const sections: string[] = [];

  // 1. Encabezado según versión
  if (versionNumber <= 1) {
    sections.push('✅ *PEDIDO FINALIZADO*');
  } else {
    sections.push('🔄✨ *NUEVA VERSIÓN DISPONIBLE*');
  }

  // 2. Metadatos del pedido: Código, Título, Solicitante y Versión
  const cleanCodigo = (codigo || '').trim();
  const cleanTitulo = (titulo || '').trim();
  const lineaCodigoTitulo = cleanTitulo && cleanTitulo.toLowerCase() !== cleanCodigo.toLowerCase()
    ? `📌 *${cleanCodigo} — ${cleanTitulo}*`
    : `📌 *${cleanCodigo}*`;

  const cleanNombre = (solicitanteNombre || '').trim();
  const cleanArea = (solicitanteArea || '').trim();
  let lineaSolicitante: string;
  if (cleanNombre && cleanArea) {
    lineaSolicitante = `👤 *Solicitante:* ${cleanNombre} — ${cleanArea}`;
  } else if (cleanNombre) {
    lineaSolicitante = `👤 *Solicitante:* ${cleanNombre}`;
  } else if (cleanArea) {
    lineaSolicitante = `👤 *Solicitante:* ${cleanArea}`;
  } else {
    lineaSolicitante = '👤 *Solicitante:* No especificado';
  }

  const lineaVersion = `📦 *Versión:* ${versionNumber}`;

  sections.push(`${lineaCodigoTitulo}\n${lineaSolicitante}\n${lineaVersion}`);

  // 3. Bloque de Archivos y Enlaces (Omitido si no hay ni archivos ni URLs)
  const validEnlaces = (enlacesEntrega || []).map((u) => u.trim()).filter(Boolean);
  const validArchivos = (archivosEntrega || []).map((a) => a.trim()).filter(Boolean);

  if (validEnlaces.length > 0 || validArchivos.length > 0) {
    const itemsLineas: string[] = [];

    // Enlaces externos compartibles
    for (const url of validEnlaces) {
      itemsLineas.push(url);
    }

    // Archivos de entrega (documentando acceso seguro vía Gestión según Requisito 7)
    for (const arch of validArchivos) {
      itemsLineas.push(`📄 ${arch} (descargar en Gestión)`);
    }

    if (itemsLineas.length > 0) {
      sections.push(`📎 *Archivos y enlaces de esta entrega:*\n${itemsLineas.join('\n')}`);
    }
  }

  // 4. Bloque de WhatsApp del solicitante (Omitido si no es válido o falta)
  if (solicitanteTelefono && typeof solicitanteTelefono === 'string' && solicitanteTelefono.trim()) {
    const waDetails = getWhatsAppDetails(solicitanteTelefono.trim());
    if (waDetails && waDetails.waUrl) {
      sections.push(`📱 *WhatsApp del solicitante:*\n${waDetails.waUrl}`);
    }
  }

  // 5. Enlace canónico de Gestión (requiere login interno de administración/equipo)
  const cleanId = (pedidoId || '').trim();
  const urlGestion = `${CANONICAL_APP_BASE_URL}/gestion/pedidos/${cleanId}`;
  sections.push(`🖥️ *Ver pedido en Gestión:*\n${urlGestion}`);

  return sections.join('\n\n');
}

/**
 * Genera el enlace universal para abrir WhatsApp (Web o App) con el mensaje codificado.
 */
export function getFinalizacionWhatsAppUrl(message: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}
