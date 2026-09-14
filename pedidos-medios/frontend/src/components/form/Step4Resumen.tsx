import React from 'react';
import {
  FormWizardState,
  FormPieceItem,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';
import { formatPhoneForDisplay } from '../../utils/phoneUtils';

interface Step4ResumenProps {
  state: FormWizardState;
  pieces: FormPieceItem[];
  onGoToStep: (step: number) => void;
  onToggleConfirmado: (checked: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  errors: ValidationErrors;
}

export const Step4Resumen: React.FC<Step4ResumenProps> = ({
  state,
  pieces,
  onGoToStep,
  onToggleConfirmado,
  onSubmit,
  onBack,
  errors,
}) => {
  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>4. Resumen y Confirmación Final</h2>
        <p>
          Revisá cuidadosamente los datos ingresados antes de confirmar el envío oficial a la Secretaría de Medios.
        </p>
      </div>

      {state.submission_error && (
        <div className="pedidos-error-banner" role="alert">
          <strong>No se pudo completar el envío:</strong> {state.submission_error}
        </div>
      )}

      {/* Bloque 1: Datos de Contacto */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>1. Datos del Solicitante</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(1)}>
            Editar contacto
          </button>
        </div>
        <div className="pedidos-summary-grid">
          <div className="pedidos-summary-item">
            <span className="label">Nombre y apellido:</span>
            <strong>{state.contacto.nombre_apellido}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Número de WhatsApp:</span>
            <strong>{formatPhoneForDisplay(state.contacto.telefono)}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Correo oficial:</span>
            <strong>{state.contacto.correo}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Área / Dependencia:</span>
            <strong>{state.contacto.area_solicitante}</strong>
          </div>
        </div>
      </div>

      {/* Bloque 2: Solicitudes y Piezas Requeridas (Multi-PED) */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>2. Solicitudes a Generar ({pieces.length} PED{pieces.length > 1 ? 's' : ''})</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(2)}>
            Editar requerimientos
          </button>
        </div>

        <div className="pedidos-summary-pieces-list">
          {pieces.map((p, idx) => {
            const dataObj = p.data as Record<string, unknown>;
            const hasAsesoramiento = Boolean(dataObj.requiere_asesoramiento);

            return (
              <div key={p.client_request_ref} className="pedidos-summary-piece-card">
                <div className="pedidos-summary-piece-header">
                  <span className="pedidos-piece-number">#{idx + 1}</span>
                  <span className="pedidos-cat-badge">{p.codigo_ped_prefijo}</span>
                  <strong className="pedidos-piece-title">{p.piece_title}</strong>
                </div>

                <div className="pedidos-summary-piece-details">
                  {hasAsesoramiento ? (
                    <div className="pedidos-asesoramiento-badge-row">
                      <span className="pedidos-badge-pill highlight">Requiere asesoramiento</span>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                        <strong>Objetivo:</strong> {String(dataObj.objetivo_asesoramiento || '')}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        Canal de contacto preferido:{' '}
                        {dataObj.contacto_preferido === 'email' ? 'Correo electrónico' : 'WhatsApp'}
                      </p>
                    </div>
                  ) : (
                    <ul className="pedidos-piece-fields-list">
                      {Object.entries(dataObj).map(([key, val]) => {
                        if (!val || typeof val === 'object' || key === 'requiere_asesoramiento') return null;
                        return (
                          <li key={key}>
                            <span className="field-name">{key.replace(/_/g, ' ')}:</span>
                            <span className="field-val">{String(val)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloque 3: Archivos y Enlaces */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>3. Archivos Adjuntos y Enlaces</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(3)}>
            Editar adjuntos
          </button>
        </div>

        <div className="pedidos-summary-files-section">
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
              Archivos ({state.archivos.length}):
            </strong>
            {state.archivos.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', margin: '0.25rem 0 0 0' }}>
                No se adjuntaron archivos binarios.
              </p>
            ) : (
              <ul className="pedidos-summary-list">
                {state.archivos.map((a) => {
                  const targetLabel =
                    a.targets === 'all'
                      ? 'Todas las solicitudes'
                      : pieces.find((p) => p.client_request_ref === a.targets[0])?.piece_title || 'Específica';
                  return (
                    <li key={a.client_file_ref}>
                      📄 <strong>{a.name}</strong> ({(a.size / (1024 * 1024)).toFixed(2)} MB) —{' '}
                      <span style={{ color: '#0369a1' }}>Destino: {targetLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
              Enlaces al material ({state.links.length}):
            </strong>
            {state.links.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', margin: '0.25rem 0 0 0' }}>
                No se incluyeron enlaces externos.
              </p>
            ) : (
              <ul className="pedidos-summary-list">
                {state.links.map((l) => {
                  const targetLabel =
                    l.targets === 'all'
                      ? 'Todas las solicitudes'
                      : pieces.find((p) => p.client_request_ref === l.targets[0])?.piece_title || 'Específica';
                  return (
                    <li key={l.id}>
                      🔗 <strong>{l.url}</strong> {l.descripcion && `(${l.descripcion})`} —{' '}
                      <span style={{ color: '#0369a1' }}>Destino: {targetLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bloque 4: Declaración y Confirmación */}
      <div className="pedidos-confirm-card">
        <label className="pedidos-checkbox-label">
          <input
            type="checkbox"
            checked={state.confirmado}
            onChange={(e) => onToggleConfirmado(e.target.checked)}
            disabled={state.submitting}
          />
          <span className="pedidos-checkbox-text">
            <strong>Confirmo que revisé los datos y que la información ingresada es correcta.</strong>
          </span>
        </label>
        {errors.confirmado && (
          <span className="pedidos-error-text" role="alert" style={{ display: 'block', marginTop: '0.5rem' }}>
            {errors.confirmado}
          </span>
        )}
      </div>

      <div className="pedidos-step-actions">
        <button
          type="button"
          className="pedidos-btn pedidos-btn-secondary"
          onClick={onBack}
          disabled={state.submitting}
        >
          ← Volver a Adjuntos
        </button>
        <button
          type="button"
          className="pedidos-btn pedidos-btn-success"
          onClick={onSubmit}
          disabled={state.submitting || !state.confirmado}
          style={{ minWidth: '200px' }}
        >
          {state.submitting ? 'Enviando solicitudes...' : 'Enviar solicitudes'}
        </button>
      </div>
    </div>
  );
};
