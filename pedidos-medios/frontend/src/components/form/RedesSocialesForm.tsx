import React from 'react';
import { RedesSocialesData } from '../../types/form';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface RedesSocialesFormProps {
  data: RedesSocialesData;
  onChange: (fields: Partial<RedesSocialesData>) => void;
  errors: ValidationErrors;
}

export const RedesSocialesForm: React.FC<RedesSocialesFormProps> = ({ data, onChange, errors }) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Publicaciones en Redes Sociales</h3>
        <p className="pedidos-section-desc">
          Planificación y publicación de contenidos, copys e historias en los canales oficiales de redes sociales del Gobierno provincial.
        </p>
      </div>

      <div className="pedidos-form-group">
        <label htmlFor="redes_fecha" className="pedidos-label required">
          Fecha sugerida de publicación
        </label>
        <input
          type="date"
          id="redes_fecha"
          min={getLocalTodayDateString()}
          className={`pedidos-input ${errors['redes.fecha_sugerida'] ? 'error' : ''}`}
          value={data.fecha_sugerida || ''}
          onChange={(e) => onChange({ fecha_sugerida: e.target.value })}
          aria-invalid={!!errors['redes.fecha_sugerida']}
          aria-describedby={errors['redes.fecha_sugerida'] ? 'redes_fecha_error' : undefined}
        />
        {errors['redes.fecha_sugerida'] && (
          <span id="redes_fecha_error" className="pedidos-error-text" role="alert">{errors['redes.fecha_sugerida']}</span>
        )}
      </div>

      <div className="pedidos-form-group">
        <label htmlFor="redes_copy" className="pedidos-label required">
          Texto / Copy propuesto
        </label>
        <textarea
          id="redes_copy"
          className={`pedidos-textarea ${errors['redes.texto_copy'] ? 'error' : ''}`}
          rows={4}
          placeholder="Ingresá el texto que acompañará la publicación, hashtags sugeridos y menciones requeridas..."
          value={data.texto_copy || ''}
          onChange={(e) => onChange({ texto_copy: e.target.value })}
        />
        {errors['redes.texto_copy'] && (
          <span className="pedidos-error-text" role="alert">{errors['redes.texto_copy']}</span>
        )}
      </div>

      <div className="pedidos-form-group">
        <label htmlFor="redes_enlaces" className="pedidos-label">
          Enlaces de referencia o publicaciones relacionadas (opcional)
        </label>
        <textarea
          id="redes_enlaces"
          className="pedidos-textarea"
          rows={2}
          placeholder="Ej: https://instagram.com/p/..., https://facebook.com/..."
          value={data.enlaces_referencia || ''}
          onChange={(e) => onChange({ enlaces_referencia: e.target.value })}
        />
      </div>
    </div>
  );
};
