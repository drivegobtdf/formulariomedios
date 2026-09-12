import React from 'react';
import { GacetillaData } from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';

interface GacetillaFormProps {
  data: GacetillaData;
  onChange: (fields: Partial<GacetillaData>) => void;
  errors: ValidationErrors;
}

export const GacetillaForm: React.FC<GacetillaFormProps> = ({ data, onChange, errors }) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Gacetilla de Prensa</h3>
        <p className="pedidos-section-desc">
          Redacción y difusión de gacetillas y comunicados de prensa institucional para medios de comunicación.
        </p>
      </div>

      <div className="pedidos-form-row">
        <div className="pedidos-form-group col-6">
          <label htmlFor="gac_referente" className="pedidos-label required">
            Referente o vocero de contacto
          </label>
          <input
            type="text"
            id="gac_referente"
            className={`pedidos-input ${errors['gacetilla.referente_contacto'] ? 'error' : ''}`}
            placeholder="Nombre y cargo del referente que brinda la información"
            value={data.referente_contacto || ''}
            onChange={(e) => onChange({ referente_contacto: e.target.value })}
          />
          {errors['gacetilla.referente_contacto'] && (
            <span className="pedidos-error-text" role="alert">{errors['gacetilla.referente_contacto']}</span>
          )}
        </div>

        <div className="pedidos-form-group col-6">
          <label htmlFor="gac_tel" className="pedidos-label required">
            Teléfono de contacto directo
          </label>
          <input
            type="tel"
            id="gac_tel"
            className={`pedidos-input ${errors['gacetilla.telefono_contacto'] ? 'error' : ''}`}
            placeholder="Número de teléfono directo o WhatsApp"
            value={data.telefono_contacto || ''}
            onChange={(e) => onChange({ telefono_contacto: e.target.value })}
          />
          {errors['gacetilla.telefono_contacto'] && (
            <span className="pedidos-error-text" role="alert">{errors['gacetilla.telefono_contacto']}</span>
          )}
        </div>
      </div>

      <div className="pedidos-form-group">
        <label htmlFor="gac_info" className="pedidos-label required">
          Datos del hecho noticioso / Información base
        </label>
        <textarea
          id="gac_info"
          className={`pedidos-textarea ${errors['gacetilla.informacion_base'] ? 'error' : ''}`}
          rows={5}
          placeholder="Describí qué ocurrió o qué se anuncia, quiénes participaron, cifras, declaraciones clave y todo detalle relevante para la redacción periodística..."
          value={data.informacion_base || ''}
          onChange={(e) => onChange({ informacion_base: e.target.value })}
        />
        {errors['gacetilla.informacion_base'] && (
          <span className="pedidos-error-text" role="alert">{errors['gacetilla.informacion_base']}</span>
        )}
      </div>
    </div>
  );
};
