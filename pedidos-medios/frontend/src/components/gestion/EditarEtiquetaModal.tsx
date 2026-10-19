import React, { useState, useEffect } from 'react';
import {
  PedidoEtiquetaItem,
  EtiquetaColor,
  fetchPedidoEtiquetas,
  setPedidoEtiquetas,
} from '../../services/gestionApi';
import { ETIQUETA_COLOR_OPTIONS, getEtiquetaColorOption } from '../../utils/etiquetasConfig';

export interface EditarEtiquetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedidoId: string;
  pedidoVisible: string;
  initialEtiquetas?: PedidoEtiquetaItem[];
  // Compatibilidad hacia atrás
  initialEtiqueta?: string | null;
  onSave?: (newEtiqueta: string | null) => Promise<void>;
  onSuccess?: () => void;
}

export const EditarEtiquetaModal: React.FC<EditarEtiquetaModalProps> = ({
  isOpen,
  onClose,
  pedidoId,
  pedidoVisible,
  initialEtiquetas,
  initialEtiqueta,
  onSave,
  onSuccess,
}) => {
  const [etiquetas, setEtiquetas] = useState<Array<{ id?: string; texto: string; color: EtiquetaColor }>>([]);
  const [newTexto, setNewTexto] = useState('');
  const [selectedColor, setSelectedColor] = useState<EtiquetaColor>('azul');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setNewTexto('');
    setSelectedColor('azul');
    setSaving(false);

    if (initialEtiquetas !== undefined) {
      setEtiquetas(Array.isArray(initialEtiquetas) ? initialEtiquetas.map((e) => ({ id: e.id, texto: e.texto, color: e.color })) : []);
      setLoading(false);
    } else if (pedidoId) {
      setLoading(true);
      Promise.resolve(fetchPedidoEtiquetas(pedidoId))
        .then((items) => {
          if (Array.isArray(items) && items.length > 0) {
            setEtiquetas(items.map((e) => ({ id: e.id, texto: e.texto, color: e.color })));
          } else if (initialEtiqueta && initialEtiqueta.trim()) {
            setEtiquetas([{ texto: initialEtiqueta.trim(), color: 'azul' }]);
          } else {
            setEtiquetas([]);
          }
        })
        .catch(() => {
          if (initialEtiqueta && initialEtiqueta.trim()) {
            setEtiquetas([{ texto: initialEtiqueta.trim(), color: 'azul' }]);
          } else {
            setEtiquetas([]);
          }
        })
        .finally(() => setLoading(false));
    } else if (initialEtiqueta && initialEtiqueta.trim()) {
      setEtiquetas([{ texto: initialEtiqueta.trim(), color: 'azul' }]);
      setLoading(false);
    } else {
      setEtiquetas([]);
      setLoading(false);
    }
  }, [isOpen, pedidoId, initialEtiquetas, initialEtiqueta]);

  if (!isOpen) return null;

  const handleAddEtiqueta = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newTexto.trim();
    if (!clean) return;

    if (clean.length > 30) {
      setError('La etiqueta no puede tener más de 30 caracteres.');
      return;
    }

    // Validación case-insensitive de duplicados
    const duplicate = etiquetas.some((item) => item.texto.toLowerCase() === clean.toLowerCase());
    if (duplicate) {
      setError(`Ya existe una etiqueta con el nombre "${clean}" en este pedido.`);
      return;
    }

    setEtiquetas((prev) => [...prev, { texto: clean, color: selectedColor }]);
    setNewTexto('');
    setError(null);
  };

  const handleRemoveEtiqueta = (index: number) => {
    setEtiquetas((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      if (pedidoId) {
        await Promise.resolve(
          setPedidoEtiquetas(
            pedidoId,
            etiquetas.map((e) => ({ texto: e.texto, color: e.color }))
          )
        );
      }

      const firstLabel = etiquetas.length > 0 ? etiquetas[0].texto : null;
      if (onSave) {
        await Promise.resolve(onSave(firstLabel));
      }

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar las etiquetas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--pedidos-surface-backdrop, rgba(0, 0, 0, 0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--pedidos-surface-overlay, #ffffff)',
          color: 'var(--pedidos-text-primary, #1f2937)',
          border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
          borderRadius: '0.75rem',
          maxWidth: '460px',
          width: '100%',
          boxShadow: 'var(--pedidos-shadow-lg, 0 10px 25px rgba(0,0,0,0.2))',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #1f2937)' }}>
              Etiqueta interna
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
              {pedidoVisible} · Etiquetas del pedido
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--pedidos-text-muted, #64748b)',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {error && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--pedidos-status-rejected-bg, #fef2f2)',
                border: '1px solid var(--pedidos-status-rejected-border, #fecaca)',
                borderRadius: '0.375rem',
                color: 'var(--pedidos-status-rejected-text, #b91c1c)',
                fontSize: '0.825rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          {/* List of current tags */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--pedidos-text-muted, #64748b)',
                textTransform: 'uppercase',
                marginBottom: '0.5rem',
              }}
            >
              Etiquetas asignadas ({etiquetas.length})
            </label>

            {loading ? (
              <div style={{ fontSize: '0.825rem', color: 'var(--pedidos-text-muted, #64748b)', padding: '0.5rem 0' }}>
                Cargando etiquetas...
              </div>
            ) : etiquetas.length === 0 ? (
              <div
                style={{
                  fontSize: '0.825rem',
                  color: 'var(--pedidos-text-muted, #94a3b8)',
                  fontStyle: 'italic',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                  borderRadius: '0.375rem',
                  border: '1px dashed var(--pedidos-border-default, #e2e8f0)',
                }}
              >
                No hay etiquetas asignadas a este pedido.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {etiquetas.map((item, idx) => {
                  return (
                    <span
                      key={`${item.texto}-${idx}`}
                      className={`etiqueta-interna-pill etiqueta-color-${item.color}`}
                      style={{
                        padding: '0.25rem 0.55rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <span>🏷️ {item.texto}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEtiqueta(idx)}
                        disabled={saving}
                        title={`Eliminar etiqueta "${item.texto}"`}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '0.85rem',
                          lineHeight: 1,
                          opacity: 0.7,
                          color: 'inherit',
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form to add new label */}
          <form
            onSubmit={handleAddEtiqueta}
            style={{
              padding: '0.85rem',
              backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
              borderRadius: '0.5rem',
              border: '1px solid var(--pedidos-border-default, #e2e8f0)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="input-nueva-etiqueta"
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  marginBottom: '0.35rem',
                  color: 'var(--pedidos-text-primary, #1f2937)',
                }}
              >
                Nueva etiqueta (máx. 30 caracteres)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  id="input-nueva-etiqueta"
                  type="text"
                  value={newTexto}
                  onChange={(e) => setNewTexto(e.target.value.slice(0, 30))}
                  placeholder="Ej: URGENTE, WEB, PRENSA"
                  maxLength={30}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--pedidos-control-border, #cbd5e1)',
                    backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                    color: 'var(--pedidos-control-text, #1f2937)',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={saving || !newTexto.trim()}
                  style={{
                    padding: '0.5rem 0.85rem',
                    backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    cursor: saving || !newTexto.trim() ? 'not-allowed' : 'pointer',
                    opacity: !newTexto.trim() ? 0.6 : 1,
                  }}
                >
                  + Agregar
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '0.3rem',
                  fontSize: '0.7rem',
                  color: 'var(--pedidos-text-muted, #64748b)',
                }}
              >
                <span>Uso operativo interno únicamente</span>
                <span>{newTexto.trim().length} / 30</span>
              </div>
            </div>

            {/* Color Selector */}
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  color: 'var(--pedidos-text-secondary, #475569)',
                  marginBottom: '0.35rem',
                }}
              >
                Color de etiqueta:
              </span>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {ETIQUETA_COLOR_OPTIONS.map((opt) => {
                  const isSelected = selectedColor === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedColor(opt.key)}
                      title={opt.label}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '9999px',
                        backgroundColor: opt.dotColor,
                        border: isSelected ? '2.5px solid var(--pedidos-brand-accent, #0284c7)' : '2px solid transparent',
                        boxShadow: isSelected ? '0 0 0 2px var(--pedidos-surface-overlay, #ffffff)' : 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.1s ease',
                        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                      }}
                      aria-label={`Color ${opt.label}`}
                    />
                  );
                })}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--pedidos-text-secondary, #475569)',
                    marginLeft: '0.25rem',
                    alignSelf: 'center',
                    fontWeight: 500,
                  }}
                >
                  {getEtiquetaColorOption(selectedColor).label}
                </span>
              </div>
            </div>
          </form>

          {/* Footer buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--pedidos-surface-sunken, #f1f5f9)',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                borderRadius: '0.375rem',
                color: 'var(--pedidos-text-primary, #334155)',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '0.5rem 1.25rem',
                backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#ffffff',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
