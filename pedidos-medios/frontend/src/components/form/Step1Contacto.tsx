import React from 'react';
import {
  ContactoFormState,
  CategoriaSlug,
  CATEGORIAS_CONFIG,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';
import { validateWhatsAppPhone } from '../../utils/phoneUtils';

interface Step1ContactoProps {
  contacto: ContactoFormState;
  onChangeContacto: (fields: Partial<ContactoFormState>) => void;
  selectedCategorias: CategoriaSlug[];
  onToggleCategoria: (slug: CategoriaSlug) => void;
  errors: ValidationErrors;
  onNext: () => void;
}

export const Step1Contacto: React.FC<Step1ContactoProps> = ({
  contacto,
  onChangeContacto,
  selectedCategorias,
  onToggleCategoria,
  errors,
  onNext,
}) => {
  const localNumber =
    contacto.telefono_local !== undefined
      ? contacto.telefono_local
      : contacto.telefono
      ? contacto.telefono.replace(/^\+549?/, '').replace(/^\+\d+/, '')
      : '';

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const val = validateWhatsAppPhone(rawVal, 'AR');
    onChangeContacto({
      telefono_pais: 'AR',
      telefono_local: rawVal,
      telefono: val.isValid && val.canonical ? val.canonical : rawVal,
    });
  };

  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>1. Datos de Contacto y Servicios Requeridos</h2>
      </div>

      <div className="pedidos-card">
        <h3 className="pedidos-card-title">Datos del Solicitante</h3>

        <div className="pedidos-form-row">
          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_nombre" className="pedidos-label required">
              Nombre y apellido
            </label>
            <input
              type="text"
              id="contacto_nombre"
              className={`pedidos-input ${errors.nombre_apellido ? 'error' : ''}`}
              placeholder="Ej: Lic. María Gómez"
              value={contacto.nombre_apellido}
              onChange={(e) => onChangeContacto({ nombre_apellido: e.target.value })}
              autoComplete="name"
              aria-invalid={!!errors.nombre_apellido}
              aria-describedby={errors.nombre_apellido ? 'contacto_nombre_error' : undefined}
            />
            {errors.nombre_apellido && (
              <span id="contacto_nombre_error" className="pedidos-error-text" role="alert">{errors.nombre_apellido}</span>
            )}
          </div>

          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_telefono" className="pedidos-label required">
              Número de WhatsApp
            </label>
            <div className="pedidos-phone-input-group" style={{ display: 'flex', alignItems: 'stretch' }}>
              <div
                className="pedidos-phone-prefix-fixed"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.6rem 0.85rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRight: 'none',
                  borderRadius: '0.375rem 0 0 0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#334155',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                <span>Argentina (+54 9)</span>
              </div>
              <div className="pedidos-phone-number-wrapper" style={{ flex: 1 }}>
                <input
                  type="tel"
                  id="contacto_telefono"
                  className={`pedidos-input ${errors.telefono ? 'error' : ''}`}
                  style={{ borderRadius: '0 0.375rem 0.375rem 0' }}
                  placeholder="2964 477578"
                  value={localNumber}
                  onChange={handleNumberChange}
                  autoComplete="tel-national"
                  aria-label="Número de WhatsApp"
                  aria-invalid={Boolean(errors.telefono)}
                  aria-describedby={
                    errors.telefono ? 'contacto_telefono_error' : 'contacto_telefono_help'
                  }
                />
              </div>
            </div>
            {errors.telefono ? (
              <span id="contacto_telefono_error" className="pedidos-error-text" role="alert">
                {errors.telefono}
              </span>
            ) : (
              <span
                id="contacto_telefono_help"
                className="pedidos-hint-text"
                style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}
              >
                Ingresá código de área y número, sin 0 y sin 15.
              </span>
            )}
          </div>
        </div>

        <div className="pedidos-form-row">
          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_correo" className="pedidos-label required">
              Correo electrónico
            </label>
            <input
              type="email"
              id="contacto_correo"
              className={`pedidos-input ${errors.correo ? 'error' : ''}`}
              placeholder="usuario@tierradelfuego.gob.ar"
              value={contacto.correo}
              onChange={(e) => onChangeContacto({ correo: e.target.value })}
              autoComplete="email"
              aria-invalid={!!errors.correo}
              aria-describedby={errors.correo ? 'contacto_correo_error' : undefined}
            />
            {errors.correo && (
              <span id="contacto_correo_error" className="pedidos-error-text" role="alert">{errors.correo}</span>
            )}
          </div>

          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_area" className="pedidos-label required">
              Área o Dependencia
            </label>
            <input
              type="text"
              id="contacto_area"
              className={`pedidos-input ${errors.area_solicitante ? 'error' : ''}`}
              placeholder="Ej: Ministerio de Salud / Dirección de Prensa"
              value={contacto.area_solicitante}
              onChange={(e) => onChangeContacto({ area_solicitante: e.target.value })}
              aria-invalid={!!errors.area_solicitante}
              aria-describedby={errors.area_solicitante ? 'contacto_area_error' : undefined}
            />
            {errors.area_solicitante && (
              <span id="contacto_area_error" className="pedidos-error-text" role="alert">{errors.area_solicitante}</span>
            )}
          </div>
        </div>
      </div>

      <div className="pedidos-card" style={{ marginTop: '1.5rem' }}>
        <h3 className="pedidos-card-title required-label">¿Qué servicios necesitás solicitar?</h3>

        {errors.selected_categorias && (
          <div className="pedidos-error-banner" role="alert">{errors.selected_categorias}</div>
        )}

        <div className="pedidos-category-grid">
          {CATEGORIAS_CONFIG.map((cat) => {
            const isSelected = selectedCategorias.includes(cat.slug);
            return (
              <label
                key={cat.slug}
                className={`pedidos-category-card ${isSelected ? 'selected' : ''}`}
              >
                <div className="pedidos-cat-checkbox">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleCategoria(cat.slug)}
                    aria-label={cat.nombre}
                  />
                </div>
                <div className="pedidos-cat-content">
                  <div className="pedidos-cat-header">
                    <strong className="pedidos-cat-title">{cat.nombre}</strong>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="pedidos-step-actions">
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNext}>
          Continuar
        </button>
      </div>
    </div>
  );
};
