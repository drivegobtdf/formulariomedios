import React from 'react';

export interface WorkflowBadgeStyle {
  label: string;
  bg: string;
  color: string;
  border: string;
}

export const WORKFLOW_STATE_STYLES: Record<string, WorkflowBadgeStyle> = {
  'Nuevo': { label: 'Nuevo', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  'En revisión': { label: 'En Revisión', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  'En proceso': { label: 'En Proceso', bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' },
  'Esperando información': { label: 'Esperando Información', bg: '#fefce8', color: '#a16207', border: '#fef08a' },
  'Finalizado': { label: 'Finalizado', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  'Cancelado': { label: 'Cancelado', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
};

/**
 * Returns singular/plural text for historical rework count:
 * 1 -> "1 vez"
 * >1 -> "N veces"
 */
export function formatReworkHistoricalText(revisionCount: number): string {
  if (revisionCount === 1) return '1 vez';
  return `${revisionCount} veces`;
}

/**
 * Renders the real workflow state badge.
 */
export function renderWorkflowStateBadge(
  estado: string,
  options?: { size?: 'sm' | 'md'; customLabel?: string }
): React.ReactElement {
  const size = options?.size || 'md';
  const c = WORKFLOW_STATE_STYLES[estado] || {
    label: estado,
    bg: '#f3f4f6',
    color: '#374151',
    border: '#e2e8f0',
  };
  const label = options?.customLabel || c.label;
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        padding: isSmall ? '0.15rem 0.45rem' : '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontWeight: 700,
        fontSize: isSmall ? '0.725rem' : '0.8125rem',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * Renders the rework condition badge:
 * - Active: "🔄 DEVUELTO - RETRABAJAR · Rev #N"
 * - Historical (when estado === 'Finalizado' && !retrabajo_activo && revision_count > 0): "RETRABAJADO · N vez/veces"
 * - null otherwise.
 */
export function renderReworkConditionBadge(
  retrabajoActivo: boolean | undefined,
  estado: string,
  revisionCount: number | undefined,
  options?: { size?: 'sm' | 'md' }
): React.ReactElement | null {
  const size = options?.size || 'md';
  const isSmall = size === 'sm';
  const count = Number(revisionCount || 0);

  if (retrabajoActivo) {
    return (
      <span
        style={{
          backgroundColor: '#fffbeb',
          color: '#b45309',
          border: '1px solid #fde68a',
          padding: isSmall ? '0.15rem 0.45rem' : '0.25rem 0.75rem',
          borderRadius: isSmall ? '0.25rem' : '9999px',
          fontWeight: 800,
          fontSize: isSmall ? '0.7rem' : '0.8125rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          whiteSpace: 'nowrap',
          width: 'fit-content',
        }}
      >
        🔄 DEVUELTO - RETRABAJAR {count > 0 ? `· Rev #${count}` : ''}
      </span>
    );
  }

  if (estado === 'Finalizado' && count > 0) {
    return (
      <span
        style={{
          backgroundColor: '#f1f5f9',
          color: '#475569',
          border: '1px solid #cbd5e1',
          padding: isSmall ? '0.15rem 0.45rem' : '0.25rem 0.75rem',
          borderRadius: isSmall ? '0.25rem' : '9999px',
          fontWeight: 700,
          fontSize: isSmall ? '0.7rem' : '0.8125rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          whiteSpace: 'nowrap',
          width: 'fit-content',
        }}
      >
        RETRABAJADO · {formatReworkHistoricalText(count)}
      </span>
    );
  }

  return null;
}

/**
 * Combined helper rendering BOTH real state badge and rework badge if applicable.
 */
export function renderPedidoStatusBundle(
  estado: string,
  retrabajoActivo: boolean | undefined,
  revisionCount: number | undefined,
  options?: { size?: 'sm' | 'md'; direction?: 'row' | 'column'; gap?: string }
): React.ReactElement {
  const direction = options?.direction || 'column';
  const gap = options?.gap || '0.35rem';
  const size = options?.size || 'md';

  const stateBadge = renderWorkflowStateBadge(estado, { size });
  const conditionBadge = renderReworkConditionBadge(retrabajoActivo, estado, revisionCount, { size });

  if (!conditionBadge) {
    return stateBadge;
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: direction, gap, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {stateBadge}
      {conditionBadge}
    </div>
  );
}
