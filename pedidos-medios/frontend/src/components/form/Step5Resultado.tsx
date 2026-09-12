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
        <h2>¡Solicitud Recibida con Éxito!</h2>
        <p className="pedidos-result-subtitle">
          Hemos recibido tu presentación correctamente. Se ha generado un código de seguimiento único (PED) para cada una de las piezas y servicios solicitados.
        </p>
      </div>

      <div className="pedidos-result-peds-card">
        <h3 className="pedidos-result-card-title">
          Tus Solicitudes Registradas ({result.pedidos.length})
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
                    <span className="pedidos-ped-cat">{ped.categoria_slug.replace(/_/g, ' ')}</span>
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
          <h4>Comprobante de Registro de Solicitud</h4>
          <p>
            Tus solicitudes han sido registradas para el contacto <strong>{contacto.correo}</strong>. Conservá los códigos PED indicados arriba para consultar el estado de cada pedido ante la Secretaría de Medios.
          </p>
        </div>
      </div>

      <div className="pedidos-result-actions">
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNewSubmission}>
          + Realizar otra solicitud
        </button>
      </div>
    </div>
  );
};
