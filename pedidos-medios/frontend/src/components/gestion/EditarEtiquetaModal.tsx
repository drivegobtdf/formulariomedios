import React, { useState, useEffect } from 'react';

interface EditarEtiquetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedidoVisible: string;
  initialEtiqueta: string | null;
  onSave: (newEtiqueta: string | null) => Promise<void>;
}

export const EditarEtiquetaModal: React.FC<EditarEtiquetaModalProps> = ({
  isOpen,
  onClose,
  pedidoVisible,
  initialEtiqueta,
  onSave,
}) => {
  const [etiqueta, setEtiqueta] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEtiqueta(initialEtiqueta || '');
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initialEtiqueta]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = etiqueta.trim();
    if (clean.length > 10) {
      setError('La etiqueta no puede tener más de 10 caracteres.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(clean ? clean : null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la etiqueta');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al quitar la etiqueta');
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
          maxWidth: '420px',
          width: '100%',
          boxShadow: 'var(--pedidos-shadow-lg, 0 10px 25px rgba(0,0,0,0.2))',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
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
              {pedidoVisible}
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

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
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

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.35rem',
                color: 'var(--pedidos-text-primary, #1f2937)',
              }}
            >
              Texto de la etiqueta (máx. 10 caracteres)
            </label>
            <input
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value.slice(0, 10))}
              placeholder="Ej: URGENTE, WEB, PRENSA"
              maxLength={10}
              autoFocus
              disabled={saving}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--pedidos-control-border, #cbd5e1)',
                backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                color: 'var(--pedidos-control-text, #1f2937)',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '0.35rem',
                fontSize: '0.75rem',
                color: 'var(--pedidos-text-muted, #64748b)',
              }}
            >
              <span>Uso operativo interno únicamente</span>
              <span>{etiqueta.trim().length} / 10</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div>
              {initialEtiqueta && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 0.85rem',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--pedidos-status-rejected-border, #cbd5e1)',
                    borderRadius: '0.375rem',
                    color: 'var(--pedidos-status-rejected-text, #dc2626)',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Quitar
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                type="submit"
                disabled={saving}
                style={{
                  padding: '0.5rem 1.15rem',
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
        </form>
      </div>
    </div>
  );
};
