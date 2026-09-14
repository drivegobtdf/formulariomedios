import React from 'react';
import {
  ContactoFormState,
  CategoriaSlug,
  CATEGORIAS_CONFIG,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';
import {
  COUNTRIES_LIST,
  DEFAULT_COUNTRY_CODE,
  getCountryConfig,
  validateWhatsAppPhone,
} from '../../utils/phoneUtils';

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
  const selectedCountry = contacto.telefono_pais || DEFAULT_COUNTRY_CODE;
  const countryConfig = getCountryConfig(selectedCountry);

  const localNumber =
    contacto.telefono_local !== undefined
      ? contacto.telefono_local
      : contacto.telefono
      ? contacto.telefono.replace(/^\+549?/, '').replace(/^\+\d+/, '')
      : '';

  const handleCountryChange = (newCountry: string) => {
    const val = validateWhatsAppPhone(localNumber, newCountry);
    onChangeContacto({
      telefono_pais: newCountry,
      telefono_local: localNumber,
      telefono: val.isValid && val.canonical ? val.canonical : localNumber,
    });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const val = validateWhatsAppPhone(rawVal, selectedCountry);
    onChangeContacto({
      telefono_pais: selectedCountry,
      telefono_local: rawVal,
      telefono: val.isValid && val.canonical ? val.canonical : rawVal,
    });
  };

  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>1. Datos de Contacto y Servicios Requeridos</h2>
        <p>
          Ingresá los datos del solicitante y seleccioná los servicios que necesitás gestionar ante la Secretaría de Medios.
        </p>
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
            <div className="pedidos-phone-input-group">
              <div className="pedidos-country-select-wrapper">
                <select
                  id="contacto_pais"
                  className="pedidos-select pedidos-country-select"
                  value={selectedCountry}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  aria-label="Seleccionar país para WhatsApp"
                >
                  {COUNTRIES_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.displayDialCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="pedidos-phone-number-wrapper">
                <input
                  type="tel"
                  id="contacto_telefono"
                  className={`pedidos-input ${errors.telefono ? 'error' : ''}`}
                  placeholder={countryConfig.placeholder}
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
                {countryConfig.helpText}
              </span>
            )}
          </div>
        </div>

        <div className="pedidos-form-row">
          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_correo" className="pedidos-label required">
              Correo electrónico oficial o de contacto
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
              Área, Ministerio o Dependencia solicitante
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
        <p className="pedidos-hint-text" style={{ marginBottom: '1rem' }}>
          Podés seleccionar una o múltiples categorías en un solo envío. Cada pieza solicitada generará un número de seguimiento PED independiente.
        </p>

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
                    <span className="pedidos-cat-code">{cat.codigo}</span>
                    <strong className="pedidos-cat-title">{cat.nombre}</strong>
                  </div>
                  <p className="pedidos-cat-desc">{cat.descripcion}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="pedidos-step-actions">
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNext}>
          Continuar al Detalle de Solicitudes →
        </button>
      </div>
    </div>
  );
};
