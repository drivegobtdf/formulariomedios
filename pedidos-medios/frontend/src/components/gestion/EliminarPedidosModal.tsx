import React, { useState, useEffect, useRef } from 'react';
import { adminPreviewPurgePedidos, adminExecutePurgePedidos, PurgePreviewResult } from '../../services/gestionApi';

interface EliminarPedidosModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedidoIds: string[];
  onSuccess: (deletedCount: number) => void;
}

export const EliminarPedidosModal: React.FC<EliminarPedidosModalProps> = ({
  isOpen,
  onClose,
  pedidoIds,
  onSuccess,
}) => {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<PurgePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStage, setDeleteStage] = useState<'idle' | 'preparing' | 'drive' | 'db' | 'completed'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Clave de idempotencia única por apertura de modal
  const idempotencyKeyRef = useRef<string>('');

  useEffect(() => {
    if (isOpen && pedidoIds.length > 0) {
      idempotencyKeyRef.current = `purge_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      setLoadingPreview(true);
      setPreview(null);
      setPreviewError(null);
      setConfirmInput('');
      setDeleteError(null);
      setIsDeleting(false);
      setDeleteStage('idle');

      adminPreviewPurgePedidos(pedidoIds)
        .then((data) => {
          setPreview(data);
        })
        .catch((err) => {
          setPreviewError(err.message || 'No se pudo obtener el preview de eliminación');
        })
        .finally(() => {
          setLoadingPreview(false);
        });
    }
  }, [isOpen, pedidoIds]);

  if (!isOpen) return null;

  const count = preview?.pedidos_count || pedidoIds.length;
  const requiresConfirmWord = count > 1;
  const isConfirmValid = !requiresConfirmWord || confirmInput.trim() === 'ELIMINAR';

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmValid || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteStage('preparing');

    try {
      setDeleteStage('drive');
      const res = await adminExecutePurgePedidos(pedidoIds, idempotencyKeyRef.current);
      setDeleteStage('completed');
      onSuccess(res.deleted_count);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Ocurrió un error al eliminar los pedidos.');
      setIsDeleting(false);
      setDeleteStage('idle');
    }
  };

  return (
    <div
      className="pedidos-modal-overlay pedidos-modal-overlay-danger"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-purge-title"
    >
      <div className="pedidos-modal-dialog pedidos-modal-dialog-md pedidos-modal-dialog-danger">
        {/* Header */}
        <div className="pedidos-modal-header pedidos-modal-header-danger">
          <div className="pedidos-modal-header-title-row">
            <span className="pedidos-modal-danger-icon" aria-hidden="true">⚠️</span>
            <h3
              id="modal-purge-title"
              className="pedidos-modal-title pedidos-modal-title-danger"
            >
              ELIMINAR PEDIDOS PERMANENTEMENTE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="pedidos-modal-close-btn"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="pedidos-modal-body">
          {loadingPreview ? (
            <div className="pedidos-modal-loading">
              <div className="pedidos-modal-loading-icon">⏳</div>
              <p className="pedidos-modal-loading-text">Calculando impacto de la eliminación...</p>
            </div>
          ) : previewError ? (
            <div className="pedidos-modal-error-banner">
              <strong>Error:</strong> {previewError}
            </div>
          ) : (
            <form onSubmit={handleDelete} className="pedidos-modal-form">
              {deleteError && (
                <div className="pedidos-modal-error-banner">
                  <strong>Atención:</strong> {deleteError}
                </div>
              )}

              {isDeleting ? (
                <div className="pedidos-modal-deleting-progress">
                  <div className="pedidos-modal-deleting-spinner">🔄</div>
                  <div className="pedidos-modal-deleting-stage">
                    {deleteStage === 'preparing' && 'Preparando operación segura...'}
                    {deleteStage === 'drive' && 'Limpiando archivos en Google Drive...'}
                    {deleteStage === 'db' && 'Eliminando registros de base de datos...'}
                    {deleteStage === 'completed' && 'Operación completada con éxito'}
                  </div>
                  <p className="pedidos-modal-deleting-hint">
                    Esta operación es transaccional y duradera. Por favor no cierres la ventana.
                  </p>
                </div>
              ) : (
                <>
                  <p className="pedidos-modal-purge-intro">
                    Estás por eliminar permanentemente <strong>{count} pedido{count > 1 ? 's' : ''}</strong>.
                  </p>

                  {/* Impact Breakdown */}
                  <div className="pedidos-modal-impact-box">
                    <div className="pedidos-modal-impact-title">
                      Esta operación eliminará o desvinculará:
                    </div>
                    <ul className="pedidos-modal-impact-list">
                      <li><strong>{preview?.entregas_count || 0}</strong> entregas realizadas</li>
                      <li><strong>{preview?.revisiones_count || 0}</strong> solicitudes de revisión</li>
                      <li><strong>{preview?.archivos_count || 0}</strong> archivos registrados</li>
                      <li><strong>{preview?.comunicaciones_count || 0}</strong> comunicaciones asociadas</li>
                      <li>
                        <strong>{(preview?.drive_file_ids?.length || 0) + (preview?.drive_folder_ids?.length || 0)}</strong> recursos de Google Drive
                      </li>
                    </ul>
                  </div>

                  {/* Visible PED Codes */}
                  {preview?.pedidos_visibles && preview.pedidos_visibles.length > 0 && (
                    <div className="pedidos-modal-affected-container">
                      <label className="pedidos-modal-label">
                        Pedidos afectados:
                      </label>
                      <div className="pedidos-modal-ped-list">
                        {preview.pedidos_visibles.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Require typing ELIMINAR */}
                  {requiresConfirmWord && (
                    <div className="pedidos-modal-confirm-container">
                      <label className="pedidos-modal-confirm-label">
                        Para confirmar la eliminación masiva, escribí <span style={{ textDecoration: 'underline' }}>ELIMINAR</span> a continuación:
                      </label>
                      <input
                        type="text"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder="ELIMINAR"
                        disabled={isDeleting}
                        className={`pedidos-modal-confirm-input ${confirmInput.trim() === 'ELIMINAR' ? 'is-confirmed' : ''}`}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pedidos-modal-footer">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isDeleting}
                      className="pedidos-modal-btn-cancel"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!isConfirmValid || isDeleting}
                      className="pedidos-modal-btn-danger"
                    >
                      {`Eliminar ${count} pedido${count > 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
