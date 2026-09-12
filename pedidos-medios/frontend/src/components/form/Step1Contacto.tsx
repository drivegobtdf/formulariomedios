import React from 'react';
import {
  ContactoFormState,
  CategoriaSlug,
  CATEGORIAS_CONFIG,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';

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
            />
            {errors.nombre_apellido && (
              <span className="pedidos-error-text" role="alert">{errors.nombre_apellido}</span>
            )}
          </div>

          <div className="pedidos-form-group col-6">
            <label htmlFor="contacto_telefono" className="pedidos-label required">
              Teléfono / WhatsApp
            </label>
            <input
              type="tel"
              id="contacto_telefono"
              className={`pedidos-input ${errors.telefono ? 'error' : ''}`}
              placeholder="Ej: +54 2901 445566"
              value={contacto.telefono}
              onChange={(e) => onChangeContacto({ telefono: e.target.value })}
              autoComplete="tel"
            />
            {errors.telefono && (
              <span className="pedidos-error-text" role="alert">{errors.telefono}</span>
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
            />
            {errors.correo && (
              <span className="pedidos-error-text" role="alert">{errors.correo}</span>
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
            />
            {errors.area_solicitante && (
              <span className="pedidos-error-text" role="alert">{errors.area_solicitante}</span>
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
