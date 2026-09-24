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
            <h4 style={{ color: '#0369a1', margin: '0 0 0.5rem 0' }}>Recordatorio de tiempos para los pedidos del área de diseño gráfico</h4>
            <ul style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.25rem', color: '#0f172a', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <li><strong>5 días hábiles para piezas simples:</strong> Flyers RRSS, efemérides, banners y tarjetas.</li>
              <li><strong>15 a 30 días para piezas complejas:</strong> afiches, cartelería, campañas y piezas impresas.</li>
            </ul>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', fontStyle: 'italic' }}>
              Estos tiempos pueden variar por imprevistos en la gestión de pedidos.
            </p>
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
