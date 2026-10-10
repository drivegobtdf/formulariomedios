/**
 * Utilidades de formato para el sistema PEDIDOS.
 */

/**
 * Formatea un tamaño en bytes a una unidad legible (Bytes, KB, MB, GB).
 * Distingue explícitamente tamaños no disponibles (null, undefined, NaN)
 * de un tamaño realmente igual a cero (0 Bytes).
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return 'Tamaño no disponible';
  }
  if (bytes === 0) {
    return '0 Bytes';
  }
  if (bytes < 1024) {
    return `${bytes} Bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Formatea una fecha a representación local argentina (DD/MM/YYYY)
 * sin riesgo de corrimiento de día por zona horaria UTC (desplazamiento de medianoche).
 */
export function formatLocalDate(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // Formato estricto YYYY-MM-DD
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }

  // Si incluye hora o es ISO completo
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return trimmed;
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return trimmed;
  }
}

/**
 * Traduce estados técnicos de almacenamiento a texto comprensible en español.
 */
export function formatArchivoEstado(estado: string | null | undefined): string {
  if (!estado) return 'Desconocido';
  const normal = estado.toLowerCase().trim();
  switch (normal) {
    case 'verified':
      return 'Verificado en almacenamiento';
    case 'reserved':
      return 'En proceso de subida';
    case 'failed':
      return 'Error en almacenamiento';
    case 'pending':
      return 'Pendiente';
    default:
      return estado;
  }
}

/**
 * Formatea una fecha/hora de historial a representación local argentina (DD/MM/YYYY HH:mm)
 * con fallback resiliente 'Fecha no disponible' en lugar de 'Invalid Date'.
 */
export function formatHistoryDate(rawDate?: string | null): string {
  if (!rawDate) return 'Fecha no disponible';
  const trimmed = typeof rawDate === 'string' ? rawDate.trim() : '';
  if (!trimmed) return 'Fecha no disponible';
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return 'Fecha no disponible';
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Fecha no disponible';
  }
}

/**
 * Formatea una fecha ISO a tiempo relativo legible en español (es-AR).
 * Ejemplos: "Hace un momento", "Hace 5 min", "Hace 2 h", "Hace 3 d", o "DD/MM/AAAA".
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  try {
    const date = new Date(trimmed);
    const time = date.getTime();
    if (isNaN(time)) return '';

    const now = Date.now();
    const diffSec = Math.floor((now - time) / 1000);

    if (diffSec < 60) {
      return 'Hace un momento';
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `Hace ${diffMin} min`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `Hace ${diffHours} h`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return diffDays === 1 ? 'Ayer' : `Hace ${diffDays} d`;
    }

    return formatLocalDate(trimmed);
  } catch {
    return '';
  }
}

/**
 * Formatea el texto de resumen de una notificación de usuario.
 * Garantiza:
 * - Para 'nota_creada': "[Nombre Apellido] dejó una nota interna en [PED-...]"
 * - Nunca expone UUIDs de base de datos
 * - Nunca expone correos electrónicos
 * - Nunca expone el texto confidencial de la nota
 */
export function formatNotificationSummary(notif: {
  tipo: string;
  metadata?: {
    mensaje_resumen?: string;
    pedido_visible?: string;
    actor_nombre?: string;
    [key: string]: any;
  };
}): string {
  const meta = notif.metadata || {};
  const pedidoCode = meta.pedido_visible || '';

  if (notif.tipo === 'nota_creada') {
    const actor = meta.actor_nombre?.trim();
    if (actor && !actor.includes('@') && !/^[0-9a-f-]{36}$/i.test(actor)) {
      return `${actor} dejó una nota interna en ${pedidoCode}`.trim();
    }
    if (meta.mensaje_resumen && !meta.mensaje_resumen.includes('@') && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(meta.mensaje_resumen)) {
      return meta.mensaje_resumen;
    }
    return `Un integrante del equipo dejó una nota interna en ${pedidoCode}`.trim();
  }

  if (meta.mensaje_resumen) {
    return meta.mensaje_resumen;
  }

  if (pedidoCode) {
    return `Notificación para ${pedidoCode}`;
  }

  return 'Notificación operativa';
}

