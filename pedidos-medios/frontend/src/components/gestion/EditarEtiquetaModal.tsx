import React, { useState, useEffect, useRef } from 'react';
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
  onSuccess?: (savedEtiquetas?: PedidoEtiquetaItem[]) => void | Promise<void>;
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

  const prevIsOpenRef = useRef(false);
  const initializedPedidoIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Inicializar exclusivamente cuando el modal transiciona de cerrado a abierto
    // o cuando cambia el pedidoId para evitar que re-renders del componente padre
    // o recargas silenciosas en segundo plano borren las etiquetas que el usuario está editando.
    const isOpening = isOpen && !prevIsOpenRef.current;
    const isDifferentPedido = isOpen && initializedPedidoIdRef.current !== pedidoId;

    prevIsOpenRef.current = isOpen;

    if (!isOpen) {
      initializedPedidoIdRef.current = null;
      return;
    }

    if (!isOpening && !isDifferentPedido) {
      return;
    }

    initializedPedidoIdRef.current = pedidoId;
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
      const clean = newTexto.trim();
      const currentEtiquetas = [...etiquetas];
      if (clean && clean.length <= 30 && !currentEtiquetas.some((e) => e.texto.toLowerCase() === clean.toLowerCase())) {
        currentEtiquetas.push({ texto: clean, color: selectedColor });
      }

      let savedItems: PedidoEtiquetaItem[] = [];
      if (pedidoId) {
        savedItems = await setPedidoEtiquetas(
          pedidoId,
          currentEtiquetas.map((e) => ({ texto: e.texto, color: e.color }))
        );
      }

      const firstLabel = currentEtiquetas.length > 0 ? currentEtiquetas[0].texto : null;
      if (onSave) {
        await Promise.resolve(onSave(firstLabel));
      }

      if (onSuccess) {
        await Promise.resolve(onSuccess(savedItems));
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
      className="pedidos-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-etiquetas-title"
    >
      <div
        className="pedidos-modal-dialog pedidos-modal-dialog-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pedidos-modal-header">
          <div>
            <h3 id="modal-etiquetas-title" className="pedidos-modal-title">
              Etiqueta interna
            </h3>
            <span className="pedidos-modal-subtitle">
              {pedidoVisible} · Etiquetas del pedido
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="pedidos-modal-close-btn"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="pedidos-modal-body">
          {error && (
            <div className="pedidos-modal-error-banner">
              {error}
            </div>
          )}

          {/* List of current tags */}
          <div className="pedidos-modal-field">
            <label className="pedidos-modal-section-label">
              Etiquetas asignadas ({etiquetas.length})
            </label>

            {loading ? (
              <div className="pedidos-modal-loading-text">
                Cargando etiquetas...
              </div>
            ) : etiquetas.length === 0 ? (
              <div className="pedidos-modal-empty-box">
                No hay etiquetas asignadas a este pedido.
              </div>
            ) : (
              <div className="pedidos-modal-tags-wrap">
                {etiquetas.map((item, idx) => {
                  return (
                    <span
                      key={`${item.texto}-${idx}`}
                      className={`etiqueta-interna-pill etiqueta-color-${item.color}`}
                    >
                      <span>🏷️ {item.texto}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEtiqueta(idx)}
                        disabled={saving}
                        title={`Eliminar etiqueta "${item.texto}"`}
                        className="pedidos-modal-tag-remove-btn"
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
          <form onSubmit={handleAddEtiqueta} className="pedidos-modal-subcard">
            <div className="pedidos-modal-field">
              <label htmlFor="input-nueva-etiqueta" className="pedidos-modal-label">
                Nueva etiqueta (máx. 30 caracteres)
              </label>
              <div className="pedidos-modal-input-group">
                <input
                  id="input-nueva-etiqueta"
                  type="text"
                  value={newTexto}
                  onChange={(e) => setNewTexto(e.target.value.slice(0, 30))}
                  placeholder="Ej: URGENTE, WEB, PRENSA"
                  maxLength={30}
                  disabled={saving}
                  className="pedidos-modal-input"
                />
                <button
                  type="submit"
                  disabled={saving || !newTexto.trim()}
                  className="pedidos-modal-btn-add"
                >
                  + Agregar
                </button>
              </div>
              <div className="pedidos-modal-hint-row">
                <span>Uso operativo interno únicamente</span>
                <span>{newTexto.trim().length} / 30</span>
              </div>
            </div>

            {/* Color Selector */}
            <div>
              <span className="pedidos-modal-color-title">
                Color de etiqueta:
              </span>
              <div className="pedidos-modal-color-row">
                {ETIQUETA_COLOR_OPTIONS.map((opt) => {
                  const isSelected = selectedColor === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedColor(opt.key)}
                      title={opt.label}
                      className={`pedidos-modal-color-dot ${isSelected ? 'is-selected' : ''}`}
                      style={{ backgroundColor: opt.dotColor }}
                      aria-label={`Color ${opt.label}`}
                    />
                  );
                })}
                <span className="pedidos-modal-color-label">
                  {getEtiquetaColorOption(selectedColor).label}
                </span>
              </div>
            </div>
          </form>

          {/* Footer buttons */}
          <div className="pedidos-modal-footer">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="pedidos-modal-btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="pedidos-modal-btn-primary"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
