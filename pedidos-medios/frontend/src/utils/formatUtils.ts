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
/**
 * Formatea un timestamp ISO/UTC de recepción (`created_at`) a fecha y hora local
 * de Argentina (`America/Argentina/Ushuaia`, `es-AR`) en formato `DD/MM/YYYY HH:mm` (CAM-06).
 * Respeta el UTC almacenado en Supabase sin depender de la zona horaria del navegador
 * ni de la hora actual del sistema.
 */
export function formatIngresoDateTime(rawDate: string | null | undefined): string {
  if (!rawDate || typeof rawDate !== 'string') return '';
  const trimmed = rawDate.trim();
  if (!trimmed) return '';

  // Si es únicamente fecha YYYY-MM-DD sin componente horario, evitar corrimiento UTC
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, yyyy, mm, dd] = dateOnlyMatch;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Normalizar formato ISO si viene con espacio en lugar de T y asegurar sufijo UTC si carece de zona
  let normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2').replace(/([+-]\d{2})$/, '$1:00');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Ushuaia',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const day = (partMap.day || '').padStart(2, '0');
  const month = (partMap.month || '').padStart(2, '0');
  const year = partMap.year || '';
  const rawHour = partMap.hour === '24' ? '00' : (partMap.hour || '');
  const hour = rawHour.padStart(2, '0');
  const minute = (partMap.minute || '').padStart(2, '0');

  if (!day || !month || !year) {
    return trimmed;
  }

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

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
      timeZone: 'America/Argentina/Ushuaia',
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
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return 'Fecha no disponible';
  const formatted = formatIngresoDateTime(trimmed);
  return formatted || 'Fecha no disponible';
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

/**
 * Resuelve de forma inteligente y jerárquica el nombre o descripción del servicio solicitado.
 * Jerarquía:
 * 1. categoria_nombre + tipo_nombre (si ambos están presentes) -> "Categoría — Tipo"
 * 2. Solo categoria_nombre -> "Categoría"
 * 3. Solo tipo_nombre -> "Tipo"
 * 4. Título directo en pedido o campos descriptivos legibles en informacion_especifica
 * 5. Fallback a "—" únicamente si no hay nada disponible
 */
export function getServicioSolicitadoTexto(pedido: any): string {
  if (!pedido) return '—';

  const cat = (pedido.categoria_nombre || pedido.pedido?.categoria_nombre || '').trim();
  const tipo = (pedido.tipo_nombre || pedido.pedido?.tipo_nombre || '').trim();

  if (cat && tipo) {
    return `${cat} — ${tipo}`;
  }
  if (cat) {
    return cat;
  }
  if (tipo) {
    return tipo;
  }

  const tituloDirecto = (pedido.titulo || pedido.pedido?.titulo || '').trim();
  if (tituloDirecto) return tituloDirecto;

  const info = pedido.informacion_especifica || pedido.pedido?.informacion_especifica || {};
  const infoCandidates = [
    info.titulo,
    info.nombre_servicio,
    info.servicio_solicitado,
    info.tipo_trabajo,
    info.tipo_servicio,
    info.servicio,
    info.resumen,
    info.descripcion_corta,
  ];

  for (const candidate of infoCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return '—';
}

