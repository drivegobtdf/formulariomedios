import React, { useState, useEffect, useCallback } from 'react';
import {
  solicitanteGetEnvioRevisablePedidos,
  solicitanteSubmitRevisionRequest,
  SolicitanteRevisablePedidoItem,
} from '../services/trackingApi';
import { uploadFileForRevision } from '../services/formApi';
import { formatFileSize } from '../utils/formatUtils';

interface SolicitarRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  envioId: string;
  initialPedidoId?: string;
  onSuccess: (revisionSolId: string, updatedCount: number) => void;
}

interface SelectedFileItem {
  file: File;
  id: string;
  progress: number;
  uploadedArchivoId?: string;
  error?: string;
}

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.zip'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 5;

export const SolicitarRevisionModal: React.FC<SolicitarRevisionModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
  envioId,
  initialPedidoId,
  onSuccess,
}) => {
  const [loadingEnvio, setLoadingEnvio] = useState(true);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<SolicitanteRevisablePedidoItem[]>([]);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([]);
  const [motivo, setMotivo] = useState('');
  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);

  const loadEnvioPedidos = useCallback(async () => {
    if (!envioId || !sessionToken) return;
    setLoadingEnvio(true);
    setEnvioError(null);
    try {
      const res = await solicitanteGetEnvioRevisablePedidos(sessionToken, envioId);
      const items = res.pedidos || [];
      setPedidos(items);

      // Preselect initialPedidoId if eligible, or preselect single eligible PED
      const eligibleItems = items.filter((p) => p.is_eligible);
      if (initialPedidoId && eligibleItems.some((p) => p.id === initialPedidoId)) {
        setSelectedPedidoIds([initialPedidoId]);
      } else if (eligibleItems.length === 1) {
        setSelectedPedidoIds([eligibleItems[0].id]);
      } else if (eligibleItems.length > 0 && selectedPedidoIds.length === 0) {
        setSelectedPedidoIds(eligibleItems.map((p) => p.id));
      }
    } catch (err: any) {
      setEnvioError(err.message || 'Error al cargar los servicios del envío');
    } finally {
      setLoadingEnvio(false);
    }
  }, [envioId, sessionToken, initialPedidoId]);

  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setFiles([]);
      setSubmitError(null);
      setUploadProgressText(null);
      loadEnvioPedidos();
    }
  }, [isOpen, loadEnvioPedidos]);

  if (!isOpen) return null;

  const eligiblePedidos = pedidos.filter((p) => p.is_eligible);
  const allEligibleSelected =
    eligiblePedidos.length > 0 &&
    eligiblePedidos.every((p) => selectedPedidoIds.includes(p.id));

  const handleTogglePedido = (pedId: string) => {
    setSelectedPedidoIds((prev) =>
      prev.includes(pedId) ? prev.filter((id) => id !== pedId) : [...prev, pedId]
    );
  };

  const handleToggleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedPedidoIds([]);
    } else {
      setSelectedPedidoIds(eligiblePedidos.map((p) => p.id));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = Array.from(e.target.files || []);
    if (!chosenFiles.length) return;

    if (files.length + chosenFiles.length > MAX_FILES) {
      setSubmitError(`No podés adjuntar más de ${MAX_FILES} archivos en total.`);
      return;
    }

    const newItems: SelectedFileItem[] = [];
    for (const f of chosenFiles) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setSubmitError(`El archivo "${f.name}" tiene un formato no permitido. Formatos aceptados: PDF, PNG, JPG, DOCX, ZIP.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setSubmitError(`El archivo "${f.name}" supera el tamaño máximo de 25 MB.`);
        return;
      }
      newItems.push({
        file: f,
        id: Math.random().toString(36).substring(2, 9),
        progress: 0,
      });
    }

    setSubmitError(null);
    setFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPedidoIds.length === 0) {
      setSubmitError('Debés seleccionar al menos un servicio finalizado para solicitar revisión.');
      return;
    }
    if (motivo.trim().length < 10) {
      setSubmitError('Por favor detallá el motivo de revisión con al menos 10 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const uploadedArchivoIds: string[] = [];

      // 1. Subir archivos si existen
      if (files.length > 0) {
        setUploadProgressText('Subiendo archivos de referencia a almacenamiento seguro...');
        for (let i = 0; i < files.length; i++) {
          const item = files[i];
          setUploadProgressText(`Subiendo archivo ${i + 1} de ${files.length}: ${item.file.name}...`);
          const res = await uploadFileForRevision(
            sessionToken,
            envioId,
            `rev_${item.id}`,
            item.file,
            (pct) => {
              setFiles((prev) =>
                prev.map((f) => (f.id === item.id ? { ...f, progress: pct } : f))
              );
            }
          );
          uploadedArchivoIds.push(res.archivo_id);
        }
      }

      // 2. Enviar solicitud de revisión atómica Multi-PED
      setUploadProgressText('Registrando solicitud de revisión en el sistema...');
      const response = await solicitanteSubmitRevisionRequest(sessionToken, {
        envio_id: envioId,
        pedido_ids: selectedPedidoIds,
        motivo: motivo.trim(),
        archivos_ids: uploadedArchivoIds,
      });

      onSuccess(
        response.revision_solicitud_id,
        response.pedidos_revisados?.length || selectedPedidoIds.length
      );
      onClose();
    } catch (err: any) {
      setSubmitError(
        err.message || 'Ocurrió un error al enviar la solicitud de revisión. Por favor intente nuevamente.'
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgressText(null);
    }
  };

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
          maxWidth: '620px',
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
                Solicitar Revisión / Retrabajo
              </h3>
            </div>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Indicá los ajustes necesarios sobre los servicios entregados para que el equipo retome el trabajo.
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
          {loadingEnvio ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔄</div>
              Cargando servicios del envío...
            </div>
          ) : envioError ? (
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#991b1b',
                fontSize: '0.875rem',
              }}
            >
              <strong>Error:</strong> {envioError}
            </div>
          ) : (
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

              {/* 1. Selector de PEDs / Servicios */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.65rem',
                  }}
                >
                  <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                    ¿Sobre qué servicios necesitás una revisión? <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  {eligiblePedidos.length > 1 && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '0.775rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      {allEligibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos los disponibles'}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    backgroundColor: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1px',
                  }}
                >
                  {pedidos.map((ped) => {
                    const isSelected = selectedPedidoIds.includes(ped.id);
                    const isEligible = ped.is_eligible;

                    return (
                      <div
                        key={ped.id}
                        onClick={() => isEligible && handleTogglePedido(ped.id)}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: isSelected ? '#eff6ff' : isEligible ? '#ffffff' : '#f1f5f9',
                          cursor: isEligible ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #e2e8f0',
                          opacity: isEligible ? 1 : 0.7,
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isEligible}
                            onChange={() => isEligible && handleTogglePedido(ped.id)}
                            style={{ width: '16px', height: '16px', cursor: isEligible ? 'pointer' : 'not-allowed' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: isEligible ? '#0f172a' : '#64748b' }}>
                              {ped.pedido_visible} <span style={{ fontWeight: 400, color: '#475569' }}>· {ped.categoria_nombre} ({ped.tipo_nombre})</span>
                            </div>
                            {ped.entrega_vigente?.version && (
                              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.1rem' }}>
                                ✓ Entrega actual: v{ped.entrega_vigente.version}
                              </div>
                            )}
                          </div>
                        </div>

                        {!isEligible && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '9999px',
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              border: '1px solid #fca5a5',
                            }}
                          >
                            {ped.ineligible_reason || 'No disponible para revisión'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Solo se pueden devolver pedidos finalizados con entrega activa. Mínimo 1 servicio.
                </p>
              </div>

              {/* 2. Motivo común */}
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

              {/* 3. Archivos de referencia */}
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
                    accept=".pdf,.png,.jpg,.jpeg,.docx,.zip"
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
                    Hasta 5 archivos (máx. 25 MB c/u) · PDF, PNG, JPG/JPEG, DOCX, ZIP
                  </p>
                </div>

                {/* Lista de archivos adjuntados */}
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
                          <span style={{ fontWeight: 500, color: '#1e293b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {item.file.name}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.725rem' }}>
                            ({formatFileSize(item.file.size)})
                          </span>
                        </div>
                        {isSubmitting ? (
                          <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                            {item.progress > 0 ? `${item.progress}%` : 'En cola'}
                          </span>
                        ) : (
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
                    ))}
                  </div>
                )}
              </div>

              {/* Progress message */}
              {uploadProgressText && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.5rem',
                    color: '#1e40af',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ animation: 'spin 1s linear infinite' }}>🔄</span>
                  {uploadProgressText}
                </div>
              )}

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
                  disabled={isSubmitting || selectedPedidoIds.length === 0 || motivo.trim().length < 10}
                  style={{
                    padding: '0.6rem 1.5rem',
                    backgroundColor:
                      isSubmitting || selectedPedidoIds.length === 0 || motivo.trim().length < 10
                        ? '#cbd5e1'
                        : '#f59e0b',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor:
                      isSubmitting || selectedPedidoIds.length === 0 || motivo.trim().length < 10
                        ? 'not-allowed'
                        : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  {isSubmitting ? 'Enviando...' : `Enviar solicitud de revisión (${selectedPedidoIds.length})`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
