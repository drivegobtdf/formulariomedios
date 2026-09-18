import React from 'react';
import { SubmissionResponsePayload, FormPieceItem, ContactoFormState } from '../../types/form';

interface Step5ResultadoProps {
  result: SubmissionResponsePayload;
  pieces: FormPieceItem[];
  contacto: ContactoFormState;
  onNewSubmission: () => void;
}

export const Step5Resultado: React.FC<Step5ResultadoProps> = ({
  result,
  pieces,
  contacto,
  onNewSubmission,
}) => {
  return (
    <div className="pedidos-result-container">
      <div className="pedidos-result-header">
        <div className="pedidos-result-icon">✓</div>
        <h2>Solicitud recibida</h2>
        <p className="pedidos-result-subtitle">
          Guardá tus códigos PED para consultar tus solicitudes.
        </p>
      </div>

      <div className="pedidos-result-peds-card">
        <h3 className="pedidos-result-card-title">
          Tus solicitudes ({result.pedidos.length})
        </h3>

        <div className="pedidos-peds-grid">
          {result.pedidos.map((ped, idx) => {
            const piece = pieces.find((p) => p.client_request_ref === ped.client_request_ref);
            return (
              <div key={ped.pedido_id || idx} className="pedidos-ped-receipt-card">
                <div className="pedidos-ped-receipt-header">
                  <span className="pedidos-ped-badge">
                    {piece?.codigo_ped_prefijo || ped.categoria_slug.charAt(0).toUpperCase()}
                  </span>
                  <div className="pedidos-ped-title-block">
                    <h4>{piece?.piece_title || ped.tipo_slug}</h4>
                  </div>
                </div>

                <div className="pedidos-ped-code-box">
                  <span className="code-label">Código PED:</span>
                  <span className="code-value">{ped.codigo_ped}</span>
                </div>

                <div className="pedidos-ped-status-row">
                  <span className="status-label">Estado:</span>
                  <span className="pedidos-status-pill nuevo">Nuevo</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pedidos-result-info-box">
        <div className="pedidos-result-info-icon">📋</div>
        <div>
          <h4>Registro confirmado</h4>
          <p>
            Enviamos la confirmación a tu correo (<strong>{contacto.correo}</strong>).
          </p>
        </div>
      </div>

      <div className="pedidos-result-actions">
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNewSubmission}>
          + Nueva solicitud
        </button>
      </div>
    </div>
  );
};
