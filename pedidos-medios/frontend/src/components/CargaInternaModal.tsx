import React, { useState, useEffect } from 'react';
import {
  createInternalPedido,
  fetchCatalogoServicios,
  CatalogoCategoriaItem,
  CreateInternalPedidoParams,
} from '../services/gestionApi';

interface CargaInternaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPedidoId: string, pedidoVisible: string) => void;
}

export const CargaInternaModal: React.FC<CargaInternaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [solicitanteNombre, setSolicitanteNombre] = useState('');
  const [solicitanteArea, setSolicitanteArea] = useState('');
  const [solicitanteCorreo, setSolicitanteCorreo] = useState('');
  const [solicitanteTelefono, setSolicitanteTelefono] = useState('');

  const [catalogo, setCatalogo] = useState<CatalogoCategoriaItem[]>([]);
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [tipoServicioId, setTipoServicioId] = useState<string>('');
  const [prioridad, setPrioridad] = useState<'alta' | 'media' | 'baja' | ''>('');
  const [etiquetaInterna, setEtiquetaInterna] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');

  const [enlaces, setEnlaces] = useState<string[]>(['']);

  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Helper para resetear los campos al estado inicial limpio
  const resetForm = () => {
    setTitulo('');
    setDescripcion('');
    setSolicitanteNombre('');
    setSolicitanteArea('');
    setSolicitanteCorreo('');
    setSolicitanteTelefono('');
    setCategoriaId('');
    setTipoServicioId('');
    setPrioridad('');
    setEtiquetaInterna('');
    setFechaLimite('');
    setEnlaces(['']);
    setError(null);
    setShowDiscardConfirm(false);
  };

  // Detección estricta de formulario modificado (dirty)
  const isDirty =
    Boolean(titulo) ||
    Boolean(descripcion) ||
    Boolean(solicitanteNombre) ||
    Boolean(solicitanteArea) ||
    Boolean(solicitanteCorreo) ||
    Boolean(solicitanteTelefono) ||
    Boolean(categoriaId) ||
    Boolean(tipoServicioId) ||
    Boolean(prioridad) ||
    Boolean(etiquetaInterna) ||
    Boolean(fechaLimite) ||
    enlaces.length > 1 ||
    (enlaces.length === 1 && Boolean(enlaces[0]));

  // Cierre explícito protegido contra pérdida de datos
  const handleRequestClose = () => {
    if (submitting) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      resetForm();
      onClose();
    }
  };

  // Cargar catálogo de categorías y servicios al abrir
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setLoadingCatalogo(true);
    fetchCatalogoServicios()
      .then((data) => {
        if (mounted) setCatalogo(data);
      })
      .catch((err) => {
        console.error('Error cargando catálogo para carga interna:', err);
      })
      .finally(() => {
        if (mounted) setLoadingCatalogo(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Manejo de tecla Escape con confirmación si el formulario está dirty
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else if (isDirty) {
          setShowDiscardConfirm(true);
        } else {
          resetForm();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, isDirty, showDiscardConfirm, onClose]);

  if (!isOpen) return null;

  const currentCategory = catalogo.find((c) => c.id === categoriaId);
  const availableTipos = currentCategory ? currentCategory.tipos : [];

  const handleAddEnlace = () => {
    setEnlaces((prev) => [...prev, '']);
  };

  const handleRemoveEnlace = (index: number) => {
    setEnlaces((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnlaceChange = (index: number, val: string) => {
    setEnlaces((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanTitulo = titulo.trim();
    if (cleanTitulo.length < 3) {
      setError('El título del pedido es obligatorio y debe tener al menos 3 caracteres.');
      return;
    }

    const cleanEtiqueta = etiquetaInterna.trim();
    if (cleanEtiqueta.length > 10) {
      setError('La etiqueta interna no puede superar los 10 caracteres.');
      return;
    }

    const validEnlaces = enlaces
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const url of validEnlaces) {
      if (!/^https?:\/\/.+/i.test(url)) {
        setError(`El enlace "${url}" no es una URL válida (debe comenzar con http:// o https://).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: CreateInternalPedidoParams = {
        titulo: cleanTitulo,
        descripcion: descripcion.trim() || undefined,
        solicitante_nombre: solicitanteNombre.trim() || undefined,
        solicitante_area: solicitanteArea.trim() || undefined,
        solicitante_correo: solicitanteCorreo.trim() || undefined,
        solicitante_telefono: solicitanteTelefono.trim() || undefined,
        categoria_id: categoriaId || null,
        tipo_servicio_id: (categoriaId && tipoServicioId) ? tipoServicioId : null,
        prioridad: prioridad ? prioridad : null,
        etiqueta_interna: cleanEtiqueta || null,
        fecha_limite: fechaLimite || null,
        enlaces: validEnlaces.length > 0 ? validEnlaces : undefined,
        client_request_ref: crypto.randomUUID(),
      };

      const res = await createInternalPedido(payload);
      if (res && res.id) {
        resetForm();
        onSuccess(res.id, res.pedido_visible);
      } else {
        throw new Error('Respuesta inválida al crear pedido interno.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al crear el pedido interno. Intente nuevamente.');
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-carga-interna-title"
      className="pedidos-modal-overlay"
    >
      <div className="pedidos-modal-dialog pedidos-modal-dialog-lg">
        {/* Diálogo de Confirmación de Descarte */}
        {showDiscardConfirm && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-confirm-title"
            aria-describedby="discard-confirm-desc"
            className="pedidos-modal-alertdialog-backdrop"
          >
            <div className="pedidos-modal-alertdialog-card">
              <div className="pedidos-modal-alertdialog-header">
                <span className="pedidos-modal-danger-icon" aria-hidden="true">
                  ⚠️
                </span>
                <h3
                  id="discard-confirm-title"
                  className="pedidos-modal-alertdialog-title"
                >
                  ¿Descartar los cambios?
                </h3>
              </div>
              <p
                id="discard-confirm-desc"
                className="pedidos-modal-alertdialog-desc"
              >
                Hay información cargada que todavía no fue guardada. Si cerrás esta ventana, se perderán los cambios.
              </p>
              <div className="pedidos-modal-alertdialog-footer">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="pedidos-modal-btn-cancel"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  className="pedidos-modal-btn-danger"
                >
                  Descartar cambios
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cabecera del Modal */}
        <div className="pedidos-modal-header">
          <div className="pedidos-modal-header-title-row">
            <span className="pedidos-badge-interno">
              INTERNO
            </span>
            <h2
              id="modal-carga-interna-title"
              className="pedidos-modal-title"
            >
              Carga Interna de Pedido
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={submitting}
            aria-label="Cerrar modal"
            className="pedidos-modal-close-btn"
          >
            ✕
          </button>
        </div>

        {/* Contenido / Formulario */}
        <form onSubmit={handleSubmit} className="pedidos-modal-form-scrollable">
          <div className="pedidos-modal-body pedidos-modal-body-padded">
            {error && (
              <div className="pedidos-modal-error-banner">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* SECCIÓN 1: DATOS PRINCIPALES */}
            <div className="pedidos-modal-section">
              <h3 className="pedidos-modal-section-title">
                1. Datos Principales
              </h3>
              <div className="pedidos-modal-fields-stack">
                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-titulo"
                    className="pedidos-modal-label"
                  >
                    Título del Pedido <span className="pedidos-modal-required-mark">*</span>
                  </label>
                  <input
                    id="input-titulo"
                    type="text"
                    required
                    placeholder="Ej: Cobertura Acto Malvinas 2026 / Gráficas Semana Antártica"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    disabled={submitting}
                    autoFocus
                    className="pedidos-modal-input"
                  />
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-descripcion"
                    className="pedidos-modal-label"
                  >
                    Descripción / Alcance (opcional)
                  </label>
                  <textarea
                    id="input-descripcion"
                    rows={3}
                    placeholder="Detalles sobre las necesidades del pedido, piezas requeridas o especificaciones técnicas..."
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-textarea"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: SOLICITANTE / ÁREA (OPCIONAL) */}
            <div className="pedidos-modal-section pedidos-modal-section-divided">
              <h3 className="pedidos-modal-section-title">
                2. Solicitante / Organismo (Opcional)
              </h3>
              <div className="pedidos-modal-grid-2col">
                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-solicitante-nombre"
                    className="pedidos-modal-label"
                  >
                    Nombre y Apellido
                  </label>
                  <input
                    id="input-solicitante-nombre"
                    type="text"
                    placeholder="Ej: Lic. Martín Rodríguez"
                    value={solicitanteNombre}
                    onChange={(e) => setSolicitanteNombre(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input"
                  />
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-solicitante-area"
                    className="pedidos-modal-label"
                  >
                    Área / Ministerio
                  </label>
                  <input
                    id="input-solicitante-area"
                    type="text"
                    placeholder="Ej: Subsecretaría de Transporte"
                    value={solicitanteArea}
                    onChange={(e) => setSolicitanteArea(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input"
                  />
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-solicitante-correo"
                    className="pedidos-modal-label"
                  >
                    Correo Electrónico (referencial)
                  </label>
                  <input
                    id="input-solicitante-correo"
                    type="email"
                    placeholder="contacto@tdf.gob.ar"
                    value={solicitanteCorreo}
                    onChange={(e) => setSolicitanteCorreo(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input"
                  />
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-solicitante-telefono"
                    className="pedidos-modal-label"
                  >
                    Teléfono (referencial)
                  </label>
                  <input
                    id="input-solicitante-telefono"
                    type="text"
                    placeholder="+54 2901 ..."
                    value={solicitanteTelefono}
                    onChange={(e) => setSolicitanteTelefono(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: CLASIFICACIÓN Y METADATOS (OPCIONAL) */}
            <div className="pedidos-modal-section pedidos-modal-section-divided">
              <h3 className="pedidos-modal-section-title">
                3. Clasificación y Operación (Opcional)
              </h3>
              <div className="pedidos-modal-grid-2col">
                <div className="pedidos-modal-field">
                  <label
                    htmlFor="select-categoria"
                    className="pedidos-modal-label"
                  >
                    Categoría de Servicio
                  </label>
                  <select
                    id="select-categoria"
                    value={categoriaId}
                    onChange={(e) => {
                      setCategoriaId(e.target.value);
                      setTipoServicioId('');
                    }}
                    disabled={submitting || loadingCatalogo}
                    className="pedidos-modal-select"
                  >
                    <option value="">Sin categoría / General (I)</option>
                    {catalogo.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre} ({cat.codigo_ped})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="select-tipo"
                    className="pedidos-modal-label"
                  >
                    Tipo de Servicio
                  </label>
                  <select
                    id="select-tipo"
                    value={tipoServicioId}
                    onChange={(e) => setTipoServicioId(e.target.value)}
                    disabled={submitting || !categoriaId || availableTipos.length === 0}
                    className="pedidos-modal-select"
                  >
                    <option value="">Sin sub-servicio específico</option>
                    {availableTipos.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="select-prioridad"
                    className="pedidos-modal-label"
                  >
                    Prioridad
                  </label>
                  <select
                    id="select-prioridad"
                    value={prioridad}
                    onChange={(e) => setPrioridad(e.target.value as any)}
                    disabled={submitting}
                    className="pedidos-modal-select"
                  >
                    <option value="">Normal (por defecto)</option>
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>

                <div className="pedidos-modal-field">
                  <label
                    htmlFor="input-etiqueta"
                    className="pedidos-modal-label"
                  >
                    Etiqueta Interna (máx. 10 caracteres)
                  </label>
                  <input
                    id="input-etiqueta"
                    type="text"
                    maxLength={10}
                    placeholder="Ej: URGENTE / VIAL"
                    value={etiquetaInterna}
                    onChange={(e) => setEtiquetaInterna(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input"
                  />
                </div>

                <div className="pedidos-modal-field" style={{ gridColumn: 'span 2' }}>
                  <label
                    htmlFor="input-fecha-limite"
                    className="pedidos-modal-label"
                  >
                    Fecha Límite Deseada
                  </label>
                  <input
                    id="input-fecha-limite"
                    type="date"
                    value={fechaLimite}
                    onChange={(e) => setFechaLimite(e.target.value)}
                    disabled={submitting}
                    className="pedidos-modal-input pedidos-modal-input-date"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 4: ENLACES EXTERNOS (OPCIONAL) */}
            <div className="pedidos-modal-section pedidos-modal-section-divided">
              <div className="pedidos-modal-section-header">
                <h3 className="pedidos-modal-section-title" style={{ margin: 0 }}>
                  4. Enlaces de Referencia / Material (Opcional)
                </h3>
                <button
                  type="button"
                  onClick={handleAddEnlace}
                  disabled={submitting}
                  className="pedidos-modal-btn-link-action"
                >
                  + Agregar enlace
                </button>
              </div>

              <div className="pedidos-modal-links-stack">
                {enlaces.map((link, idx) => (
                  <div key={idx} className="pedidos-modal-link-row">
                    <input
                      type="url"
                      placeholder="https://drive.google.com/... o https://figma.com/..."
                      value={link}
                      onChange={(e) => handleEnlaceChange(idx, e.target.value)}
                      disabled={submitting}
                      className="pedidos-modal-input pedidos-modal-input-link"
                    />
                    {enlaces.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEnlace(idx)}
                        disabled={submitting}
                        aria-label="Eliminar enlace"
                        className="pedidos-modal-btn-icon-danger"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer del Modal */}
          <div className="pedidos-modal-footer">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={submitting}
              className="pedidos-modal-btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !titulo.trim()}
              className="pedidos-modal-btn-create"
            >
              {submitting ? 'Creando pedido...' : 'Crear Pedido Interno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
