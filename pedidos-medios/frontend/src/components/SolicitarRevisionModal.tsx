import React, { useState, useEffect, useCallback } from 'react';
import { solicitanteSubmitRevisionRequest } from '../services/trackingApi';
import { uploadFileForRevision } from '../services/formApi';
import { formatFileSize } from '../utils/formatUtils';
import { ALLOWED_EXTENSIONS, validateFileMetadata } from '../validation/formValidation';

interface SolicitarRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  pedidoId: string;
  pedidoVisible?: string;
  categoriaNombre?: string;
  tipoNombre?: string;
  envioId?: string;
  onSuccess: (revisionSolId: string, pedidoId: string) => void;
}

interface RevisionFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'preparing' | 'uploading' | 'verifying' | 'completed' | 'error';
  progress: number;
  archivoId?: string;
  error?: string;
}

const MAX_FILES = 5;

function getHumanErrorMessage(rawError?: string): string {
  if (!rawError) return 'Error al procesar el archivo.';
  const lower = rawError.toLowerCase();
  if (lower.includes('session_invalid') || lower.includes('session_expired') || lower.includes('unauthorized') || lower.includes('sesión') || lower.includes('token')) {
    return 'Tu sesión venció. Volvé a abrir el pedido.';
  }
  if (lower.includes('forbidden') || lower.includes('pertenece') || lower.includes('no autorizado')) {
    return 'El archivo no pertenece a este pedido.';
  }
  if (lower.includes('formato no admitido') || lower.includes('validation_error')) {
    return 'Formato no admitido. Usá documentos, imágenes, multimedia o archivos comprimidos permitidos.';
  }
  if (lower.includes('tamaño') || lower.includes('excede') || lower.includes('max_file')) {
    return 'El archivo supera el tamaño máximo permitido (25 MB).';
  }
  if (lower.includes('google drive') || lower.includes('drive_') || lower.includes('almacenamiento') || lower.includes('storage') || lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return 'El servicio de almacenamiento no está disponible temporalmente.';
  }
  if (lower.includes('red') || lower.includes('network') || lower.includes('conexión') || lower.includes('streaming')) {
    return 'Fallo de conexión. Verificá tu red y reintentá.';
  }
  if (lower.includes('prepar') || lower.includes('prepare')) {
    return 'No se pudo iniciar la subida.';
  }
  if (lower.includes('verific') || lower.includes('complete')) {
    return 'No se pudo completar la carga del archivo.';
  }
  return 'No se pudo completar la subida.';
}

export const SolicitarRevisionModal: React.FC<SolicitarRevisionModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
  pedidoId,
  pedidoVisible,
  categoriaNombre,
  tipoNombre,
  envioId,
  onSuccess,
}) => {
  const [motivo, setMotivo] = useState('');
  const [files, setFiles] = useState<RevisionFileItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setFiles([]);
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, pedidoId]);

  const handleFileUpload = useCallback(
    async (fileItem: RevisionFileItem) => {
      try {
        const res = await uploadFileForRevision(
          sessionToken,
          envioId || pedidoId,
          fileItem.id,
          fileItem.file,
          (pct) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileItem.id ? { ...f, progress: pct } : f))
            );
          },
          (state) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileItem.id ? { ...f, status: state } : f))
            );
          }
        );

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: 'completed', archivoId: res.archivo_id, progress: 100 }
              : f
          )
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: 'error', error: err.message || 'Error al subir archivo' }
              : f
          )
        );
      }
    },
    [sessionToken, envioId, pedidoId]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = Array.from(e.target.files || []);
    if (!chosenFiles.length) return;

    if (files.length + chosenFiles.length > MAX_FILES) {
      setSubmitError(`No podés adjuntar más de ${MAX_FILES} archivos en total.`);
      return;
    }

    const newItems: RevisionFileItem[] = [];
    for (const f of chosenFiles) {
      const valErr = validateFileMetadata({ name: f.name, size: f.size, type: f.type });
      if (valErr) {
        setSubmitError(valErr);
        return;
      }
      const itemUuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      const item: RevisionFileItem = {
        id: itemUuid,
        file: f,
        name: f.name,
        size: f.size,
        status: 'preparing',
        progress: 5,
      };
      newItems.push(item);
    }

    setSubmitError(null);
    setFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';

    // Iniciar subida inmediata de cada archivo
    for (const item of newItems) {
      handleFileUpload(item);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRetryFile = (item: RevisionFileItem) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === item.id ? { ...f, status: 'preparing', progress: 5, error: undefined } : f
      )
    );
    handleFileUpload(item);
  };

  const hasInProgressFiles = files.some(
    (f) => f.status === 'preparing' || f.status === 'uploading' || f.status === 'verifying'
  );
  const hasErrorFiles = files.some((f) => f.status === 'error');
  const canSubmit =
    !isSubmitting &&
    !hasInProgressFiles &&
    !hasErrorFiles &&
    motivo.trim().length >= 10 &&
    pedidoId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Recolectar archivo_ids completados
      const finalArchivoIds = files
        .filter((f) => f.status === 'completed' && f.archivoId)
        .map((f) => f.archivoId as string);

      const response = await solicitanteSubmitRevisionRequest(sessionToken, {
        pedido_id: pedidoId,
        motivo: motivo.trim(),
        archivos_ids: finalArchivoIds,
      });

      onSuccess(response.revision_solicitud_id, pedidoId);
      onClose();
    } catch (err: any) {
      setSubmitError(
        err.message || 'Ocurrió un error al enviar la solicitud de revisión. Por favor intente nuevamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const subHeader = [categoriaNombre, tipoNombre].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-revision-title"
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            backgroundColor: '#f8fafc',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🔄</span>
              <h3
                id="modal-revision-title"
                style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}
              >
                Solicitar Revisión · {pedidoVisible || 'PED'}
              </h3>
            </div>
            {subHeader && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                {subHeader}
              </p>
            )}
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Indicá los ajustes necesarios para que el equipo retome el trabajo sobre este pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              color: '#94a3b8',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Error banner */}
            {submitError && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Atención:</strong> {submitError}
              </div>
            )}

            {/* Motivo */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>
                ¿Qué necesitás que revisemos? <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describí con claridad los ajustes requeridos (ej: El video tiene el logo anterior y las placas necesitan corregir la fecha al 15 de Octubre...)"
                rows={4}
                required
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.75rem' }}>
                <span style={{ color: motivo.trim().length >= 10 ? '#059669' : '#d97706' }}>
                  {motivo.trim().length >= 10 ? '✓ Longitud adecuada' : `Mínimo 10 caracteres (${motivo.trim().length}/10)`}
                </span>
                <span style={{ color: '#94a3b8' }}>{motivo.length} caracteres</span>
              </div>
            </div>

            {/* Archivos de referencia con subida inmediata */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>
                Archivos de referencia (opcional)
              </label>
              <div
                style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                }}
              >
                <input
                  type="file"
                  id="revision-file-upload"
                  multiple
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  disabled={files.length >= MAX_FILES || isSubmitting}
                />
                <label
                  htmlFor="revision-file-upload"
                  style={{
                    display: 'inline-block',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    color: '#0284c7',
                    cursor: files.length >= MAX_FILES || isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  📎 Seleccionar archivos de corrección
                </label>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.725rem', color: '#64748b' }}>
                  Hasta 5 archivos (máx. 25 MB c/u) · Documentos, imágenes, multimedia o comprimidos permitidos
                </p>
              </div>

              {/* Lista de archivos con estado en tiempo real */}
              {files.length > 0 && (
                <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {files.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.375rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                        <span>📄</span>
                        <span style={{ fontWeight: 500, color: '#1e293b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                          {item.name}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.725rem' }}>
                          ({formatFileSize(item.size)})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {item.status === 'preparing' && (
                          <span style={{ color: '#0284c7', fontSize: '0.75rem', fontWeight: 600 }}>
                            Preparando...
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span style={{ color: '#0284c7', fontSize: '0.75rem', fontWeight: 600 }}>
                            {item.progress > 0 ? `Subiendo (${item.progress}%)...` : 'Subiendo...'}
                          </span>
                        )}
                        {item.status === 'verifying' && (
                          <span style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>
                            Verificando...
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.75rem' }}>✓ Listo</span>
                        )}
                        {item.status === 'error' && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>⚠️ Error</span>
                              <button
                                type="button"
                                onClick={() => handleRetryFile(item)}
                                style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                              >
                                Reintentar
                              </button>
                            </div>
                            {item.error && (
                              <span style={{ color: '#b91c1c', fontSize: '0.7rem' }}>
                                {getHumanErrorMessage(item.error)}
                              </span>
                            )}
                          </div>
                        )}
                        {!isSubmitting && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#dc2626',
                              cursor: 'pointer',
                              padding: '0.1rem 0.3rem',
                              fontSize: '0.9rem',
                            }}
                            title="Eliminar archivo"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #e2e8f0',
                marginTop: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '0.6rem 1.25rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  padding: '0.6rem 1.5rem',
                  backgroundColor: canSubmit ? '#f59e0b' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '0.375rem',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                {isSubmitting ? 'Enviando...' : 'Solicitar revisión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
