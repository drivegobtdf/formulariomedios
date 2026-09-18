import React from 'react';
import { CoberturaEventosData } from '../../types/form';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface CoberturaEventosFormProps {
  data: CoberturaEventosData;
  onChange: (fields: Partial<CoberturaEventosData>) => void;
  errors: ValidationErrors;
}

export const CoberturaEventosForm: React.FC<CoberturaEventosFormProps> = ({ data, onChange, errors }) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Cobertura de Eventos</h3>
        <p className="pedidos-section-desc">
          Solicitud de cobertura audiovisual, fotográfica y periodística para actos oficiales, conferencias y eventos institucionales.
        </p>
      </div>

      <div className="pedidos-form-row">
        <div className="pedidos-form-group col-4">
          <label htmlFor="cob_fecha" className="pedidos-label required">
            Fecha del evento
          </label>
          <input
            type="date"
            id="cob_fecha"
            min={getLocalTodayDateString()}
            className={`pedidos-input ${errors['cobertura.fecha'] ? 'error' : ''}`}
            value={data.fecha || ''}
            onChange={(e) => onChange({ fecha: e.target.value })}
            aria-invalid={!!errors['cobertura.fecha']}
            aria-describedby={errors['cobertura.fecha'] ? 'cob_fecha_error' : undefined}
          />
          {errors['cobertura.fecha'] && (
            <span id="cob_fecha_error" className="pedidos-error-text" role="alert">{errors['cobertura.fecha']}</span>
          )}
        </div>

        <div className="pedidos-form-group col-4">
          <label htmlFor="cob_hora_inicio" className="pedidos-label required">
            Hora de inicio
          </label>
          <input
            type="time"
            id="cob_hora_inicio"
            className={`pedidos-input ${errors['cobertura.hora_inicio'] ? 'error' : ''}`}
            value={data.hora_inicio || ''}
            onChange={(e) => onChange({ hora_inicio: e.target.value })}
          />
          {errors['cobertura.hora_inicio'] && (
            <span className="pedidos-error-text" role="alert">{errors['cobertura.hora_inicio']}</span>
          )}
        </div>

        <div className="pedidos-form-group col-4">
          <label htmlFor="cob_hora_fin" className="pedidos-label">
            Hora estimada de fin (opcional)
          </label>
          <input
            type="time"
            id="cob_hora_fin"
            className="pedidos-input"
            value={data.hora_fin || ''}
            onChange={(e) => onChange({ hora_fin: e.target.value })}
          />
        </div>
      </div>

      <div className="pedidos-form-row">
        <div className="pedidos-form-group col-8">
          <label htmlFor="cob_lugar" className="pedidos-label required">
            Lugar / Dirección
          </label>
          <input
            type="text"
            id="cob_lugar"
            className={`pedidos-input ${errors['cobertura.lugar'] ? 'error' : ''}`}
            placeholder="Ej: Gimnasio Petrina, Tira 4"
            value={data.lugar || ''}
            onChange={(e) => onChange({ lugar: e.target.value })}
          />
          {errors['cobertura.lugar'] && (
            <span className="pedidos-error-text" role="alert">{errors['cobertura.lugar']}</span>
          )}
        </div>

        <div className="pedidos-form-group col-4">
          <label htmlFor="cob_ciudad" className="pedidos-label required">
            Ciudad
          </label>
          <select
            id="cob_ciudad"
            className={`pedidos-select ${errors['cobertura.ciudad'] ? 'error' : ''}`}
            value={data.ciudad || ''}
            onChange={(e) => onChange({ ciudad: e.target.value as CoberturaEventosData['ciudad'] })}
          >
            <option value="">Seleccionar...</option>
            <option value="Ushuaia">Ushuaia</option>
            <option value="Río Grande">Río Grande</option>
            <option value="Tolhuin">Tolhuin</option>
          </select>
          {errors['cobertura.ciudad'] && (
            <span className="pedidos-error-text" role="alert">{errors['cobertura.ciudad']}</span>
          )}
        </div>
      </div>

      <div className="pedidos-form-group">
        <label className="pedidos-label required">¿Asisten autoridades?</label>
        <div className="pedidos-radio-inline" style={{ marginTop: '0.5rem' }}>
          <label className="pedidos-radio-label">
            <input
              type="radio"
              name="cobertura_asiste_autoridades"
              checked={data.asiste_autoridades === 'si'}
              onChange={() => onChange({ asiste_autoridades: 'si' })}
            />
            <span>Sí</span>
          </label>
          <label className="pedidos-radio-label">
            <input
              type="radio"
              name="cobertura_asiste_autoridades"
              checked={data.asiste_autoridades === 'no'}
              onChange={() => onChange({ asiste_autoridades: 'no', autoridades: '' })}
            />
            <span>No</span>
          </label>
        </div>
        {errors['cobertura.asiste_autoridades'] && (
          <span className="pedidos-error-text" role="alert">{errors['cobertura.asiste_autoridades']}</span>
        )}
      </div>

      {data.asiste_autoridades === 'si' && (
        <div className="pedidos-form-group">
          <label htmlFor="cob_autoridades" className="pedidos-label required">
            ¿Qué autoridades asistirán?
          </label>
          <input
            type="text"
            id="cob_autoridades"
            className={`pedidos-input ${errors['cobertura.autoridades'] ? 'error' : ''}`}
            placeholder="Ej: Gobernador, Ministra de Obras Públicas, Intendentes..."
            value={data.autoridades || ''}
            onChange={(e) => onChange({ autoridades: e.target.value })}
          />
          {errors['cobertura.autoridades'] && (
            <span className="pedidos-error-text" role="alert">{errors['cobertura.autoridades']}</span>
          )}
        </div>
      )}

      <div className="pedidos-form-group">
        <label htmlFor="cob_requerimientos" className="pedidos-label required">
          Requerimientos de cobertura
        </label>
        <textarea
          id="cob_requerimientos"
          className={`pedidos-textarea ${errors['cobertura.requerimientos'] ? 'error' : ''}`}
          rows={3}
          placeholder="Detallá si se requiere fotografía, tomas en video, testimonios, notas al finalizar, etc..."
          value={data.requerimientos || ''}
          onChange={(e) => onChange({ requerimientos: e.target.value })}
        />
        {errors['cobertura.requerimientos'] && (
          <span className="pedidos-error-text" role="alert">{errors['cobertura.requerimientos']}</span>
        )}
      </div>
    </div>
  );
};
