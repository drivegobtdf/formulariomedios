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

  // Manejo de tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--pedidos-surface-backdrop, rgba(15, 23, 42, 0.65))',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--pedidos-surface-overlay, #ffffff)',
          color: 'var(--pedidos-text-primary, #0f172a)',
          border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
          borderRadius: '0.75rem',
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--pedidos-border-default, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--pedidos-surface-raised, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: 'var(--pedidos-interno-bg, #fff1f2)',
                color: 'var(--pedidos-interno-text, #e11d48)',
                border: '1px solid var(--pedidos-interno-border, #fecdd3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              INTERNO
            </span>
            <h2
              id="modal-carga-interna-title"
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--pedidos-text-primary, #0f172a)',
              }}
            >
              Carga Interna de Pedido
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--pedidos-text-muted, #64748b)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Contenido / Formulario */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div
                style={{
                  backgroundColor: 'var(--pedidos-status-cancelado-bg, #fef2f2)',
                  color: 'var(--pedidos-status-cancelado-text, #991b1b)',
                  border: '1px solid var(--pedidos-status-cancelado-border, #fca5a5)',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* SECCIÓN 1: DATOS PRINCIPALES */}
            <div>
              <h3
                style={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  margin: '0 0 0.75rem 0',
                  fontWeight: 700,
                }}
              >
                1. Datos Principales
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label
                    htmlFor="input-titulo"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
                  >
                    Título del Pedido <span style={{ color: '#e11d48' }}>*</span>
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
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.875rem',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-descripcion"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: SOLICITANTE / ÁREA (OPCIONAL) */}
            <div style={{ borderTop: '1px solid var(--pedidos-border-subtle, #f1f5f9)', paddingTop: '1rem' }}>
              <h3
                style={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  margin: '0 0 0.75rem 0',
                  fontWeight: 700,
                }}
              >
                2. Solicitante / Organismo (Opcional)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label
                    htmlFor="input-solicitante-nombre"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-solicitante-area"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-solicitante-correo"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-solicitante-telefono"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: CLASIFICACIÓN Y METADATOS (OPCIONAL) */}
            <div style={{ borderTop: '1px solid var(--pedidos-border-subtle, #f1f5f9)', paddingTop: '1rem' }}>
              <h3
                style={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  margin: '0 0 0.75rem 0',
                  fontWeight: 700,
                }}
              >
                3. Clasificación y Operación (Opcional)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label
                    htmlFor="select-categoria"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Sin categoría / General (I)</option>
                    {catalogo.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre} ({cat.codigo_ped})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="select-tipo"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
                  >
                    Tipo de Servicio
                  </label>
                  <select
                    id="select-tipo"
                    value={tipoServicioId}
                    onChange={(e) => setTipoServicioId(e.target.value)}
                    disabled={submitting || !categoriaId || availableTipos.length === 0}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                      cursor: !categoriaId ? 'not-allowed' : 'pointer',
                      opacity: !categoriaId ? 0.6 : 1,
                    }}
                  >
                    <option value="">Sin sub-servicio específico</option>
                    {availableTipos.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="select-prioridad"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
                  >
                    Prioridad
                  </label>
                  <select
                    id="select-prioridad"
                    value={prioridad}
                    onChange={(e) => setPrioridad(e.target.value as any)}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Normal (por defecto)</option>
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="input-etiqueta"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label
                    htmlFor="input-fecha-limite"
                    style={{
                      display: 'block',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                      color: 'var(--pedidos-text-primary, #334155)',
                    }}
                  >
                    Fecha Límite Deseada
                  </label>
                  <input
                    id="input-fecha-limite"
                    type="date"
                    value={fechaLimite}
                    onChange={(e) => setFechaLimite(e.target.value)}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      maxWidth: '240px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                      backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                      color: 'var(--pedidos-text-primary, #0f172a)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 4: ENLACES EXTERNOS (OPCIONAL) */}
            <div style={{ borderTop: '1px solid var(--pedidos-border-subtle, #f1f5f9)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3
                  style={{
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--pedidos-brand-accent, #0284c7)',
                    margin: 0,
                    fontWeight: 700,
                  }}
                >
                  4. Enlaces de Referencia / Material (Opcional)
                </h3>
                <button
                  type="button"
                  onClick={handleAddEnlace}
                  disabled={submitting}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0284c7',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0.1rem 0.3rem',
                  }}
                >
                  + Agregar enlace
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {enlaces.map((link, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/... o https://figma.com/..."
                      value={link}
                      onChange={(e) => handleEnlaceChange(idx, e.target.value)}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                        backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                        color: 'var(--pedidos-text-primary, #0f172a)',
                        fontSize: '0.85rem',
                      }}
                    />
                    {enlaces.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEnlace(idx)}
                        disabled={submitting}
                        aria-label="Eliminar enlace"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          padding: '0.2rem 0.4rem',
                        }}
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
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--pedidos-border-default, #e2e8f0)',
              backgroundColor: 'var(--pedidos-surface-raised, #f8fafc)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                backgroundColor: 'var(--pedidos-surface-sunken, #ffffff)',
                color: 'var(--pedidos-text-primary, #334155)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !titulo.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: !submitting && titulo.trim() ? '#e11d48' : '#cbd5e1',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: submitting || !titulo.trim() ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: !submitting && titulo.trim() ? '0 1px 2px rgba(225, 29, 72, 0.25)' : 'none',
              }}
            >
              {submitting ? 'Creando pedido...' : 'Crear Pedido Interno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
