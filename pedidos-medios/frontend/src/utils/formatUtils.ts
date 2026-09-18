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
