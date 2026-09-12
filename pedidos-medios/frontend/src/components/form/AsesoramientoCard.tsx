import React from 'react';
import { AsesoramientoFields, ContactoFormState } from '../../types/form';

interface AsesoramientoCardProps {
  categoryTitle: string;
  fields: AsesoramientoFields;
  contacto: ContactoFormState;
  onChange: (fields: Partial<AsesoramientoFields>) => void;
  onEditContacto: () => void;
  errorObjetivo?: string;
}

export const AsesoramientoCard: React.FC<AsesoramientoCardProps> = ({
  categoryTitle,
  fields,
  contacto,
  onChange,
  onEditContacto,
  errorObjetivo,
}) => {
  return (
    <div className="pedidos-asesoramiento-card">
      <div className="pedidos-asesoramiento-header">
        <label className="pedidos-field-label">
          ¿Necesitás asesoramiento del equipo de Medios para definir esta pieza de <strong>{categoryTitle}</strong>?
        </label>
        <div className="pedidos-radio-group">
          <label className="pedidos-radio-label">
            <input
              type="radio"
              name={`asesoramiento_${categoryTitle}`}
              checked={fields.requiere_asesoramiento === false}
              onChange={() => onChange({ requiere_asesoramiento: false })}
            />
            <span>No, sé lo que necesito (completar especificaciones técnicas)</span>
          </label>
          <label className="pedidos-radio-label">
            <input
              type="radio"
              name={`asesoramiento_${categoryTitle}`}
              checked={fields.requiere_asesoramiento === true}
              onChange={() =>
                onChange({
                  requiere_asesoramiento: true,
                  contacto_preferido: fields.contacto_preferido || 'whatsapp',
                })
              }
            />
            <span>Sí, necesito asesoramiento para definir la propuesta</span>
          </label>
        </div>
      </div>

      {fields.requiere_asesoramiento && (
        <div className="pedidos-asesoramiento-body">
          <div className="pedidos-alert pedidos-alert-info" role="status">
            <p>
              ¡No te preocupes! Completá brevemente qué querés comunicar y nuestro equipo te contactará para ayudarte a
              diseñar y planificar la producción más adecuada.
            </p>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor={`obj_${categoryTitle}`} className="pedidos-label required">
              ¿Cuál es el objetivo o qué necesitás comunicar?
            </label>
            <textarea
              id={`obj_${categoryTitle}`}
              className={`pedidos-textarea ${errorObjetivo ? 'error' : ''}`}
              rows={3}
              placeholder="Contanos brevemente qué actividad, campaña o mensaje querés difundir..."
              value={fields.objetivo_asesoramiento || ''}
              onChange={(e) => onChange({ objetivo_asesoramiento: e.target.value })}
            />
            {errorObjetivo && <span className="pedidos-error-text" role="alert">{errorObjetivo}</span>}
          </div>

          <div className="pedidos-form-group">
            <label className="pedidos-label">¿Por qué medio preferís que te contactemos?</label>
            <div className="pedidos-radio-inline">
              <label className="pedidos-radio-label">
                <input
                  type="radio"
                  name={`canal_${categoryTitle}`}
                  value="whatsapp"
                  checked={fields.contacto_preferido !== 'email'}
                  onChange={() => onChange({ contacto_preferido: 'whatsapp' })}
                />
                <span>WhatsApp ({contacto.telefono || 'Sin teléfono'})</span>
              </label>
              <label className="pedidos-radio-label">
                <input
                  type="radio"
                  name={`canal_${categoryTitle}`}
                  value="email"
                  checked={fields.contacto_preferido === 'email'}
                  onChange={() => onChange({ contacto_preferido: 'email' })}
                />
                <span>Correo electrónico ({contacto.correo || 'Sin correo'})</span>
              </label>
            </div>
            <button
              type="button"
              className="pedidos-btn-link"
              onClick={onEditContacto}
              style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}
            >
              Editar mis datos de contacto
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
