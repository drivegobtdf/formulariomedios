import React, { useState, useRef } from 'react';
import { uploadFileForInfoResponse } from '../services/formApi';
import { formatFileSize } from '../utils/formatUtils';

export interface InfoResponseFormProps {
  auth: {
    info_token?: string;
    session_token?: string;
    solicitud_id?: string;
  };
  onSubmit: (data: {
    respuesta_texto: string;
    enlaces: string[];
    archivo_ids: string[];
  }) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

interface UploadedFileItem {
  id: string;
  file: File;
  clientFileRef: string;
  progress: number;
  status: 'uploading' | 'verified' | 'error';
  archivo_id?: string;
  error?: string;
}

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.zip'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB
const MAX_TOTAL_FILES = 10;

export const InfoResponseForm: React.FC<InfoResponseFormProps> = ({
  auth,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError = null,
}) => {
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const [enlaces, setEnlaces] = useState<string[]>(['']);
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddEnlace = () => {
    setEnlaces((prev) => [...prev, '']);
  };

  const handleEnlaceChange = (index: number, val: string) => {
    setEnlaces((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveEnlace = (index: number) => {
    setEnlaces((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Tipo de archivo no permitido: ${file.name}. Formatos admitidos: PDF, PNG, JPG, JPEG, DOCX, ZIP.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `El archivo "${file.name}" supera el tamaño máximo de 10 MB.`;
    }
    return null;
  };

  const handleFileSelection = async (selectedFileList: FileList | null) => {
    if (!selectedFileList || selectedFileList.length === 0) return;
    setValidationError(null);

    const newFiles = Array.from(selectedFileList);
    if (files.length + newFiles.length > MAX_TOTAL_FILES) {
      setValidationError(`No puede adjuntar más de ${MAX_TOTAL_FILES} archivos en total.`);
      return;
    }

    for (const f of newFiles) {
      const err = validateFile(f);
      if (err) {
        setValidationError(err);
        return;
      }
    }

    // Process and upload each file
    for (const f of newFiles) {
      const tempId = crypto.randomUUID();
      const clientFileRef = crypto.randomUUID();

      const item: UploadedFileItem = {
        id: tempId,
        file: f,
        clientFileRef,
        progress: 5,
        status: 'uploading',
      };

      setFiles((prev) => [...prev, item]);

      // Run async upload
      uploadFileForInfoResponse(
        auth,
        clientFileRef,
        f,
        (percent) => {
          setFiles((prev) =>
            prev.map((it) => (it.id === tempId ? { ...it, progress: percent } : it))
          );
        }
      )
        .then((res) => {
          setFiles((prev) =>
            prev.map((it) =>
              it.id === tempId
                ? { ...it, status: 'verified', progress: 100, archivo_id: res.archivo_id }
                : it
            )
          );
        })
        .catch((err: any) => {
          let errorMsg = err?.message || 'Error al subir archivo';
          if (errorMsg === 'Failed to fetch' || errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
            errorMsg = 'Error de conexión con el servicio de almacenamiento. Verifique su red e intente nuevamente.';
          }
          setFiles((prev) =>
            prev.map((it) =>
              it.id === tempId
                ? { ...it, status: 'error', error: errorMsg }
                : it
            )
          );
        });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((it) => it.id !== id));
  };

  const isUploading = files.some((f) => f.status === 'uploading');
  const validEnlaces = enlaces.map((u) => u.trim()).filter((u) => u.length > 0);
  const verifiedArchivoIds = files
    .filter((f) => f.status === 'verified' && f.archivo_id)
    .map((f) => f.archivo_id as string);

  const hasContent =
    textoRespuesta.trim().length > 0 ||
    validEnlaces.length > 0 ||
    verifiedArchivoIds.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isUploading) {
      setValidationError('Por favor espere a que finalicen las cargas de archivos en progreso.');
      return;
    }

    if (!hasContent) {
      setValidationError('Debe ingresar un texto explicativo, al menos un enlace o adjuntar un archivo.');
      return;
    }

    await onSubmit({
      respuesta_texto: textoRespuesta.trim(),
      enlaces: validEnlaces,
      archivo_ids: verifiedArchivoIds,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Texto de respuesta */}
      <div>
        <label htmlFor="info-resp-texto" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
          Respuesta
        </label>
        <textarea
          id="info-resp-texto"
          rows={4}
          placeholder="Escribí acá tu respuesta o aclaración..."
          value={textoRespuesta}
          onChange={(e) => setTextoRespuesta(e.target.value)}
          style={{
            width: '100%',
            padding: '0.625rem 0.75rem',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Enlaces complementarios */}
      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
          Enlaces opcionales
        </label>
        {enlaces.map((url, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => handleEnlaceChange(idx, e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
            {enlaces.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveEnlace(idx)}
                style={{
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  borderRadius: '0.375rem',
                  padding: '0 0.75rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
                aria-label="Quitar enlace"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddEnlace}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#0284c7',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: 600,
            padding: '0.25rem 0',
            textAlign: 'left',
          }}
        >
          + Agregar enlace
        </button>
      </div>

      {/* Adjuntar archivos */}
      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
          Archivos opcionales
        </label>

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed #cbd5e1',
            borderRadius: '0.5rem',
            padding: '1.25rem',
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            cursor: 'pointer',
            marginBottom: '0.75rem',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            data-testid="info-file-input"
            accept=".pdf,.png,.jpg,.jpeg,.docx,.zip"
            onChange={(e) => handleFileSelection(e.target.files)}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📁</div>
          <span style={{ color: '#0284c7', fontWeight: 600, fontSize: '0.875rem' }}>
            Seleccioná o arrastrá archivos
          </span>
          <span style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            PDF, PNG, JPG, DOCX, ZIP hasta 10 MB (máx. 10 archivos)
          </span>
        </div>

        {/* Lista de archivos seleccionados */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {files.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: `1px solid ${item.status === 'error' ? '#fca5a5' : item.status === 'verified' ? '#86efac' : '#cbd5e1'}`,
                  backgroundColor: item.status === 'error' ? '#fef2f2' : item.status === 'verified' ? '#f0fdf4' : '#ffffff',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden', paddingRight: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.file.name}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    {formatFileSize(item.file.size)}
                  </span>
                  {item.status === 'uploading' && (
                    <div style={{ width: '120px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                      <div style={{ width: `${item.progress}%`, height: '100%', backgroundColor: '#0284c7', transition: 'width 0.2s' }} />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{item.error || 'Error al subir'}</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {item.status === 'uploading' && (
                    <span style={{ color: '#0284c7', fontWeight: 600, fontSize: '0.75rem' }}>
                      {item.progress}%
                    </span>
                  )}
                  {item.status === 'verified' && (
                    <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.75rem' }}>
                      ✓ Listo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(item.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      lineHeight: 1,
                      padding: '0.2rem',
                    }}
                    aria-label={`Eliminar archivo ${item.file.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Errores */}
      {(validationError || submitError) && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
          {validationError || submitError}
        </div>
      )}

      {/* Botones de acción */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.375rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#475569',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || isUploading || !hasContent}
          style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            padding: '0.625rem 1.5rem',
            border: 'none',
            borderRadius: '0.375rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: (isSubmitting || isUploading || !hasContent) ? 'not-allowed' : 'pointer',
            opacity: (isSubmitting || isUploading || !hasContent) ? 0.6 : 1,
          }}
        >
          {isSubmitting ? 'Enviando respuesta...' : isUploading ? 'Subiendo archivos...' : 'Enviar respuesta'}
        </button>
      </div>
    </form>
  );
};
