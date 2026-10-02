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
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--pedidos-backdrop-bg, rgba(15, 23, 42, 0.7))',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-purge-title"
    >
      <div
        style={{
          backgroundColor: 'var(--pedidos-surface-overlay, #ffffff)',
          borderRadius: '0.75rem',
          maxWidth: '540px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--pedidos-border-default, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--pedidos-status-cancelado-border, #fee2e2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--pedidos-status-cancelado-bg, #fef2f2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem' }}>⚠️</span>
            <h3
              id="modal-purge-title"
              style={{ margin: 0, fontSize: '1.15rem', color: 'var(--pedidos-status-cancelado-text, #991b1b)', fontWeight: 800 }}
            >
              ELIMINAR PEDIDOS PERMANENTEMENTE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--pedidos-text-muted, #94a3b8)',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {loadingPreview ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--pedidos-text-muted, #64748b)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              <p style={{ margin: 0, fontWeight: 500 }}>Calculando impacto de la eliminación...</p>
            </div>
          ) : previewError ? (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--pedidos-status-cancelado-bg, #fef2f2)',
                border: '1px solid var(--pedidos-status-cancelado-border, #fecaca)',
                borderRadius: '0.5rem',
                color: 'var(--pedidos-status-cancelado-text, #991b1b)',
                fontSize: '0.875rem',
              }}
            >
              <strong>Error:</strong> {previewError}
            </div>
          ) : (
            <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {deleteError && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--pedidos-status-cancelado-bg, #fef2f2)',
                    border: '1px solid var(--pedidos-status-cancelado-border, #fecaca)',
                    borderRadius: '0.5rem',
                    color: 'var(--pedidos-status-cancelado-text, #991b1b)',
                    fontSize: '0.85rem',
                  }}
                >
                  <strong>Atención:</strong> {deleteError}
                </div>
              )}

              {isDeleting ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontSize: '2.5rem' }}>🔄</div>
                  <div style={{ fontWeight: 700, color: 'var(--pedidos-status-cancelado-text, #991b1b)', fontSize: '1rem' }}>
                    {deleteStage === 'preparing' && 'Preparando operación segura...'}
                    {deleteStage === 'drive' && 'Limpiando archivos en Google Drive...'}
                    {deleteStage === 'db' && 'Eliminando registros de base de datos...'}
                    {deleteStage === 'completed' && 'Operación completada con éxito'}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--pedidos-text-muted, #64748b)', maxWidth: '380px' }}>
                    Esta operación es transaccional y duradera. Por favor no cierres la ventana.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--pedidos-text-primary, #1e293b)', lineHeight: 1.5 }}>
                    Estás por eliminar permanentemente <strong>{count} pedido{count > 1 ? 's' : ''}</strong>.
                  </p>

                  {/* Impact Breakdown */}
                  <div
                    style={{
                      backgroundColor: 'var(--pedidos-status-cancelado-bg, #fff1f2)',
                      border: '1px solid var(--pedidos-status-cancelado-border, #ffe4e6)',
                      borderRadius: '0.5rem',
                      padding: '1rem',
                      fontSize: '0.85rem',
                      color: 'var(--pedidos-status-cancelado-text, #881337)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
                      Esta operación eliminará o desvinculará:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--pedidos-text-muted, #64748b)', marginBottom: '0.35rem' }}>
                        Pedidos afectados:
                      </label>
                      <div
                        style={{
                          maxHeight: '80px',
                          overflowY: 'auto',
                          backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                          border: '1px solid var(--pedidos-border-default, #e2e8f0)',
                          borderRadius: '0.375rem',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.8rem',
                          color: 'var(--pedidos-text-primary, #334155)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {preview.pedidos_visibles.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Require typing ELIMINAR */}
                  {requiresConfirmWord && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--pedidos-status-cancelado-text, #991b1b)', marginBottom: '0.4rem' }}>
                        Para confirmar la eliminación masiva, escribí <span style={{ textDecoration: 'underline' }}>ELIMINAR</span> a continuación:
                      </label>
                      <input
                        type="text"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder="ELIMINAR"
                        disabled={isDeleting}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: confirmInput.trim() === 'ELIMINAR' ? '2px solid #dc2626' : '1px solid var(--pedidos-border-default, #cbd5e1)',
                          backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: 'var(--pedidos-status-cancelado-text, #991b1b)',
                        }}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--pedidos-border-default, #e2e8f0)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isDeleting}
                      style={{
                        padding: '0.6rem 1.25rem',
                        backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                        border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                        borderRadius: '0.375rem',
                        color: 'var(--pedidos-control-text, #475569)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!isConfirmValid || isDeleting}
                      style={{
                        padding: '0.6rem 1.5rem',
                        backgroundColor: isConfirmValid && !isDeleting ? '#dc2626' : 'var(--pedidos-border-strong, #fca5a5)',
                        border: 'none',
                        borderRadius: '0.375rem',
                        color: '#ffffff',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: isConfirmValid && !isDeleting ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
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
