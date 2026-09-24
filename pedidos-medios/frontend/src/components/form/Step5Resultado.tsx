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

      {(pieces.some((p) => p.categoria_slug === 'diseno_grafico') ||
        result.pedidos.some((p) => p.categoria_slug === 'diseno_grafico')) && (
        <div className="pedidos-result-info-box pedidos-diseno-notice" style={{ background: '#f0f9ff', borderColor: '#bae6fd', borderLeft: '4px solid #0284c7' }}>
          <div className="pedidos-result-info-icon" style={{ color: '#0284c7' }}>ℹ️</div>
          <div>
            <h4 style={{ color: '#0369a1', margin: '0 0 0.4rem 0' }}>Recordatorio de tiempos para pedidos de Diseño Gráfico</h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#0f172a', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <li><strong>Plazos de entrega:</strong> de 3 a 5 días hábiles a partir de la confirmación de la solicitud.</li>
              <li><strong>Pedidos urgentes:</strong> deben solicitarse con un mínimo de 48 horas de anticipación.</li>
            </ul>
          </div>
        </div>
      )}

      <div className="pedidos-result-actions">
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNewSubmission}>
          + Nueva solicitud
        </button>
      </div>
    </div>
  );
};
