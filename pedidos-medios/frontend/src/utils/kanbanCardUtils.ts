import { PedidoListItem } from '../services/gestionApi';

/**
 * Retorna el título a mostrar en las tarjetas Kanban.
 * Prioriza el título real del pedido (o de información específica).
 * Si no existe, genera un fallback legible basado en categoría, tipo de servicio u origen.
 */
export function getPedidoCardTitle(ped: PedidoListItem): string {
  if (ped.titulo && ped.titulo.trim().length > 0) {
    return ped.titulo.trim();
  }

  const infoTitle = (ped.informacion_especifica as any)?.titulo;
  if (infoTitle && typeof infoTitle === 'string' && infoTitle.trim().length > 0) {
    return infoTitle.trim();
  }

  if (ped.categoria_nombre && ped.tipo_nombre) {
    return `${ped.categoria_nombre} · ${ped.tipo_nombre}`;
  }

  if (ped.categoria_nombre) {
    return ped.categoria_nombre;
  }

  if (ped.tipo_nombre) {
    return ped.tipo_nombre;
  }

  return ped.origen === 'interno' ? 'Pedido interno' : 'Solicitud de servicio';
}
