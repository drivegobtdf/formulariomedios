import React, { useState } from 'react';
import { PedidoEtiquetaItem } from '../../services/gestionApi';

interface KanbanEtiquetasBadgeProps {
  etiquetas?: PedidoEtiquetaItem[];
  legacyEtiqueta?: string | null;
  maxVisible?: number;
  canEdit?: boolean;
  onOpenModal?: (e: React.MouseEvent) => void;
}

export const KanbanEtiquetasBadge: React.FC<KanbanEtiquetasBadgeProps> = ({
  etiquetas,
  legacyEtiqueta,
  maxVisible = 3,
  canEdit = false,
  onOpenModal,
}) => {
  const [showPopover, setShowPopover] = useState(false);

  const allTags =
    etiquetas && etiquetas.length > 0
      ? etiquetas
      : legacyEtiqueta && legacyEtiqueta.trim()
      ? [{ id: 'legacy', pedido_id: '', texto: legacyEtiqueta.trim(), color: 'azul' as const, created_at: '' }]
      : [];

  const visibleTags = allTags.slice(0, maxVisible);
  const remainingTags = allTags.slice(maxVisible);

  if (allTags.length === 0) {
    if (!canEdit || !onOpenModal) return null;
    return (
      <button
        type="button"
        className="btn-add-etiqueta"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenModal(e);
        }}
        title="Agregar etiqueta interna"
      >
        + Etiqueta
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        flexWrap: 'wrap',
        position: 'relative',
      }}
      onClick={(e) => {
        if (canEdit && onOpenModal) {
          e.preventDefault();
          e.stopPropagation();
          onOpenModal(e);
        }
      }}
    >
      {visibleTags.map((t, idx) => (
        <span
          key={`${t.texto}-${idx}`}
          className={`etiqueta-interna-pill etiqueta-color-${t.color || 'azul'}`}
          title={canEdit ? `Etiqueta: ${t.texto} (Clic para editar)` : `Etiqueta: ${t.texto}`}
        >
          🏷️ {t.texto}
        </span>
      ))}

      {remainingTags.length > 0 && (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <span
            className="etiqueta-overflow-badge"
            title={`+${remainingTags.length} más: ${remainingTags.map((r) => r.texto).join(', ')}`}
            onMouseEnter={() => setShowPopover(true)}
            onMouseLeave={() => setShowPopover(false)}
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover((prev) => !prev);
            }}
          >
            +{remainingTags.length}
          </span>

          {showPopover && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '0.35rem',
                backgroundColor: 'var(--pedidos-surface-overlay, #ffffff)',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                borderRadius: '0.375rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                padding: '0.35rem 0.5rem',
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                minWidth: '100px',
                pointerEvents: 'none',
              }}
            >
              {remainingTags.map((r, i) => (
                <span
                  key={`${r.texto}-${i}`}
                  className={`etiqueta-interna-pill etiqueta-color-${r.color || 'azul'}`}
                  style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                >
                  🏷️ {r.texto}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
