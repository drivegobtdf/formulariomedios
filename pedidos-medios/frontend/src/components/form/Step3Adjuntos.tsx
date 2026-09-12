import React, { useState, useRef } from 'react';
import {
  FormUploadedFile,
  FormLinkItem,
  FormPieceItem,
} from '../../types/form';
import {
  ValidationErrors,
  validateFileMetadata,
  MAX_FILES_LIMIT,
} from '../../validation/formValidation';

interface Step3AdjuntosProps {
  archivos: FormUploadedFile[];
  links: FormLinkItem[];
  availablePieces: FormPieceItem[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onChangeFileTarget: (index: number, target: 'all' | string) => void;
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
  onChangeLink: (index: number, fields: Partial<FormLinkItem>) => void;
  errors: ValidationErrors;
  onNext: () => void;
  onBack: () => void;
}

export const Step3Adjuntos: React.FC<Step3AdjuntosProps> = ({
  archivos,
  links,
  availablePieces,
  onAddFiles,
  onRemoveFile,
  onChangeFileTarget,
  onAddLink,
  onRemoveLink,
  onChangeLink,
  errors,
  onNext,
  onBack,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localFileError, setLocalFileError] = useState<string | null>(null);

  const isMultiPiece = availablePieces.length > 1;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(Array.from(e.target.files));
      e.target.value = ''; // Reset input
    }
  };

  const processSelectedFiles = (selectedFiles: File[]) => {
    setLocalFileError(null);

    if (archivos.length + selectedFiles.length > MAX_FILES_LIMIT) {
      setLocalFileError(
        `Podés adjuntar como máximo ${MAX_FILES_LIMIT} archivos en total (actualmente tenés ${archivos.length}).`
      );
      return;
    }

    const validFiles: File[] = [];
    for (const f of selectedFiles) {
      const valErr = validateFileMetadata({ name: f.name, size: f.size, type: f.type });
      if (valErr) {
        setLocalFileError(valErr);
        return;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      onAddFiles(validFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>3. Archivos Adjuntos y Enlaces de Referencia</h2>
        <p>
          Adjuntá logotipos, manuales de marca, fotografías, textos o planillas relacionadas a tus solicitudes.
        </p>
      </div>

      {errors.archivos && (
        <div className="pedidos-error-banner" role="alert">{errors.archivos}</div>
      )}
      {localFileError && (
        <div className="pedidos-error-banner" role="alert">{localFileError}</div>
      )}

      {/* Dropzone de subida */}
      <div className="pedidos-card">
        <h3 className="pedidos-card-title">Carga de Archivos</h3>
        <p className="pedidos-hint-text" style={{ marginBottom: '1rem' }}>
          Formatos permitidos: <strong>PDF, PNG, JPG, DOCX, ZIP</strong>. Hasta <strong>10 MB</strong> por archivo.
          Máximo <strong>10 archivos</strong> en total.
        </p>

        <div
          className={`pedidos-dropzone ${dragOver ? 'drag-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label="Seleccionar o arrastrar archivos para adjuntar"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.docx,.zip,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
            style={{ display: 'none' }}
          />
          <div className="pedidos-dropzone-icon">📁</div>
          <div className="pedidos-dropzone-text">
            <strong>Hacé clic acá para seleccionar archivos</strong> o arrastralos y soltalos
          </div>
          <div className="pedidos-dropzone-hint">
            ({archivos.length}/{MAX_FILES_LIMIT} archivos cargados)
          </div>
        </div>

        {/* Lista de archivos cargados */}
        {archivos.length > 0 && (
          <div className="pedidos-file-list" style={{ marginTop: '1.5rem' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#0f172a' }}>
              Archivos adjuntados ({archivos.length}):
            </h4>

            {archivos.map((fileItem, idx) => {
              const sizeMb = (fileItem.size / (1024 * 1024)).toFixed(2);
              const isUploading = fileItem.status === 'uploading';
              const isVerified = fileItem.status === 'verified';
              const isError = fileItem.status === 'error';

              return (
                <div key={fileItem.client_file_ref} className={`pedidos-file-row ${fileItem.status}`}>
                  <div className="pedidos-file-info">
                    <div className="pedidos-file-name">
                      <strong>{fileItem.name}</strong>
                      <span className="pedidos-file-size">({sizeMb} MB)</span>
                    </div>

                    <div className="pedidos-file-status-line">
                      {isUploading && (
                        <span className="pedidos-status-badge uploading">
                          Subiendo ({fileItem.progress}%)...
                        </span>
                      )}
                      {isVerified && (
                        <span className="pedidos-status-badge verified">
                          ✓ Verificado en almacenamiento seguro
                        </span>
                      )}
                      {isError && (
                        <span className="pedidos-status-badge error">
                          ⚠ Error: {fileItem.error_message || 'Fallo de subida'}
                        </span>
                      )}
                    </div>

                    {isUploading && (
                      <div className="pedidos-progress-bar">
                        <div
                          className="pedidos-progress-fill"
                          style={{ width: `${fileItem.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Selector de Destino de Archivo (Asociación N:M) */}
                    {isMultiPiece && (
                      <div className="pedidos-file-target-selector" style={{ marginTop: '0.5rem' }}>
                        <label htmlFor={`target_file_${idx}`} style={{ fontSize: '0.825rem', color: '#475569' }}>
                          Asociar este archivo a:
                        </label>
                        <select
                          id={`target_file_${idx}`}
                          className="pedidos-select-sm"
                          value={
                            fileItem.targets === 'all'
                              ? 'all'
                              : Array.isArray(fileItem.targets) && fileItem.targets.length === 1
                              ? fileItem.targets[0]
                              : 'all'
                          }
                          onChange={(e) => onChangeFileTarget(idx, e.target.value)}
                        >
                          <option value="all">Todas las solicitudes del envío</option>
                          {availablePieces.map((p) => (
                            <option key={p.client_request_ref} value={p.client_request_ref}>
                              Solo a: {p.piece_title} ({p.codigo_ped_prefijo})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="pedidos-file-actions">
                    <button
                      type="button"
                      className="pedidos-btn-icon-danger"
                      onClick={() => onRemoveFile(idx)}
                      title="Eliminar archivo"
                      aria-label={`Eliminar archivo ${fileItem.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enlaces de material pesado o carpetas en la nube */}
      <div className="pedidos-card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 className="pedidos-card-title" style={{ margin: 0 }}>Enlaces al Material (Opcional)</h3>
            <p className="pedidos-hint-text" style={{ margin: '0.25rem 0 0 0' }}>
              Si tenés archivos que superan los 10 MB, videos pesados o carpetas completas en Google Drive / OneDrive, ingresá los enlaces acá.
            </p>
          </div>
          <button type="button" className="pedidos-btn pedidos-btn-secondary btn-sm" onClick={onAddLink}>
            + Agregar enlace
          </button>
        </div>

        {links.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic', margin: '0.5rem 0' }}>
            No se han agregado enlaces externos adicionales.
          </p>
        ) : (
          <div className="pedidos-links-list">
            {links.map((link, idx) => (
              <div key={link.id} className="pedidos-link-row">
                <div className="pedidos-form-row" style={{ flex: 1, margin: 0 }}>
                  <div className="pedidos-form-group col-7" style={{ marginBottom: 0 }}>
                    <input
                      type="url"
                      className={`pedidos-input ${errors[`link_${idx}`] ? 'error' : ''}`}
                      placeholder="https://drive.google.com/... o enlace de nube"
                      value={link.url}
                      onChange={(e) => onChangeLink(idx, { url: e.target.value })}
                      aria-label="URL del enlace"
                    />
                    {errors[`link_${idx}`] && (
                      <span className="pedidos-error-text" role="alert">{errors[`link_${idx}`]}</span>
                    )}
                  </div>

                  <div className="pedidos-form-group col-5" style={{ marginBottom: 0 }}>
                    <input
                      type="text"
                      className="pedidos-input"
                      placeholder="Descripción breve (ej: Fotos en alta)"
                      value={link.descripcion || ''}
                      onChange={(e) => onChangeLink(idx, { descripcion: e.target.value })}
                      aria-label="Descripción del enlace"
                    />
                  </div>
                </div>

                {isMultiPiece && (
                  <div style={{ minWidth: '180px' }}>
                    <select
                      className="pedidos-select-sm"
                      value={
                        link.targets === 'all'
                          ? 'all'
                          : Array.isArray(link.targets) && link.targets.length === 1
                          ? link.targets[0]
                          : 'all'
                      }
                      onChange={(e) =>
                        onChangeLink(idx, {
                          targets: e.target.value === 'all' ? 'all' : [e.target.value],
                        })
                      }
                      aria-label="Asociación del enlace"
                    >
                      <option value="all">Todas las solicitudes</option>
                      {availablePieces.map((p) => (
                        <option key={p.client_request_ref} value={p.client_request_ref}>
                          Solo a: {p.piece_title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  className="pedidos-btn-icon-danger"
                  onClick={() => onRemoveLink(idx)}
                  title="Eliminar enlace"
                  aria-label="Eliminar enlace"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pedidos-step-actions">
        <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={onBack}>
          ← Volver a Especificación
        </button>
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNext}>
          Continuar al Resumen y Confirmación →
        </button>
      </div>
    </div>
  );
};
