import React from 'react';
import { SitiosWebData, ContactoFormState } from '../../types/form';
import { AsesoramientoCard } from './AsesoramientoCard';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface SitiosWebFormProps {
  data: SitiosWebData;
  contacto: ContactoFormState;
  onChange: (fields: Partial<SitiosWebData>) => void;
  onEditContacto: () => void;
  errors: ValidationErrors;
}

export const SitiosWebForm: React.FC<SitiosWebFormProps> = ({
  data,
  contacto,
  onChange,
  onEditContacto,
  errors,
}) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Sitios y Contenidos Web</h3>
        <p className="pedidos-section-desc">
          Creación y actualización de páginas institucionales, landing pages, formularios y publicaciones en el portal web oficial.
        </p>
      </div>

      <AsesoramientoCard
        categoryTitle="Sitios y contenidos web"
        fields={data}
        contacto={contacto}
        onChange={onChange}
        onEditContacto={onEditContacto}
        errorObjetivo={errors['web.objetivo_asesoramiento']}
      />

      {!data.requiere_asesoramiento && (
        <div className="pedidos-category-body">
          <div className="pedidos-form-group">
            <label htmlFor="web_tipo" className="pedidos-label required">
              Tipo de solicitud web
            </label>
            <select
              id="web_tipo"
              className={`pedidos-select ${errors['web.tipo_web'] ? 'error' : ''}`}
              value={data.tipo_web || ''}
              onChange={(e) => onChange({ tipo_web: e.target.value })}
            >
              <option value="">Seleccionar tipo...</option>
              <option value="Crear una página">Crear una nueva página</option>
              <option value="Actualizar una página existente">Actualizar una página existente</option>
              <option value="Landing page / Campaña">Landing page / Campaña</option>
              <option value="Formulario digital">Formulario digital</option>
              <option value="Actualizar contenido o enlaces">Actualizar contenido o enlaces</option>
              <option value="Otro">Otro</option>
            </select>
            {errors['web.tipo_web'] && (
              <span className="pedidos-error-text" role="alert">{errors['web.tipo_web']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="web_desc" className="pedidos-label required">
              Descripción y objetivo
            </label>
            <textarea
              id="web_desc"
              className={`pedidos-textarea ${errors['web.descripcion_objetivo'] ? 'error' : ''}`}
              rows={3}
              placeholder="Describí el propósito de la página o actualización web..."
              value={data.descripcion_objetivo || ''}
              onChange={(e) => onChange({ descripcion_objetivo: e.target.value })}
            />
            {errors['web.descripcion_objetivo'] && (
              <span className="pedidos-error-text" role="alert">{errors['web.descripcion_objetivo']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label className="pedidos-label">¿Existe actualmente una página web relacionada?</label>
            <div className="pedidos-radio-inline" style={{ marginTop: '0.5rem' }}>
              <label className="pedidos-radio-label">
                <input
                  type="radio"
                  name="web_pagina_existente"
                  checked={data.pagina_existente === true}
                  onChange={() => onChange({ pagina_existente: true })}
                />
                <span>Sí, existe una página previa</span>
              </label>
              <label className="pedidos-radio-label">
                <input
                  type="radio"
                  name="web_pagina_existente"
                  checked={data.pagina_existente !== true}
                  onChange={() => onChange({ pagina_existente: false, url_pagina: '' })}
                />
                <span>No (es totalmente nueva)</span>
              </label>
            </div>
          </div>

          {data.pagina_existente && (
            <div className="pedidos-form-group">
              <label htmlFor="web_url" className="pedidos-label required">
                Dirección web / URL de la página actual
              </label>
              <input
                type="url"
                id="web_url"
                className={`pedidos-input ${errors['web.url_pagina'] ? 'error' : ''}`}
                placeholder="https://tierradelfuego.gob.ar/seccion/..."
                value={data.url_pagina || ''}
                onChange={(e) => onChange({ url_pagina: e.target.value })}
              />
              {errors['web.url_pagina'] && (
                <span className="pedidos-error-text" role="alert">{errors['web.url_pagina']}</span>
              )}
            </div>
          )}

          <div className="pedidos-form-group">
            <label htmlFor="web_cambios" className="pedidos-label required">
              Contenidos, textos o cambios solicitados
            </label>
            <textarea
              id="web_cambios"
              className={`pedidos-textarea ${errors['web.contenido_cambios'] ? 'error' : ''}`}
              rows={4}
              placeholder="Ingresá los textos, títulos, botones o cambios específicos a incorporar..."
              value={data.contenido_cambios || ''}
              onChange={(e) => onChange({ contenido_cambios: e.target.value })}
            />
            {errors['web.contenido_cambios'] && (
              <span className="pedidos-error-text" role="alert">{errors['web.contenido_cambios']}</span>
            )}
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="web_fecha" className="pedidos-label required">
                Fecha límite de puesta en línea
              </label>
              <input
                type="date"
                id="web_fecha"
                min={getLocalTodayDateString()}
                className={`pedidos-input ${errors['web.fecha_limite'] ? 'error' : ''}`}
                value={data.fecha_limite || ''}
                onChange={(e) => onChange({ fecha_limite: e.target.value })}
                aria-invalid={!!errors['web.fecha_limite']}
                aria-describedby={errors['web.fecha_limite'] ? 'web_fecha_error' : undefined}
              />
              {errors['web.fecha_limite'] && (
                <span id="web_fecha_error" className="pedidos-error-text" role="alert">{errors['web.fecha_limite']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="web_ref" className="pedidos-label">
                Enlaces de referencia o ejemplos (opcional)
              </label>
              <input
                type="text"
                id="web_ref"
                className="pedidos-input"
                placeholder="Ej: https://ejemplo.gob.ar/..."
                value={data.enlaces_referencia || ''}
                onChange={(e) => onChange({ enlaces_referencia: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
