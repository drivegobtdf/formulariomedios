import React from 'react';
import { MotionGraphicsData, ContactoFormState } from '../../types/form';
import { AsesoramientoCard } from './AsesoramientoCard';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface MotionGraphicsFormProps {
  data: MotionGraphicsData;
  contacto: ContactoFormState;
  onChange: (fields: Partial<MotionGraphicsData>) => void;
  onEditContacto: () => void;
  errors: ValidationErrors;
}

export const MotionGraphicsForm: React.FC<MotionGraphicsFormProps> = ({
  data,
  contacto,
  onChange,
  onEditContacto,
  errors,
}) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Animación y Motion Graphics</h3>
        <p className="pedidos-section-desc">
          Placas animadas, zócalos, infografías en movimiento y animaciones 2D para contenidos audiovisuales y redes.
        </p>
      </div>

      <AsesoramientoCard
        categoryTitle="Animación y motion graphics"
        fields={data}
        contacto={contacto}
        onChange={onChange}
        onEditContacto={onEditContacto}
        errorObjetivo={errors['motion.objetivo_asesoramiento']}
      />

      {!data.requiere_asesoramiento && (
        <div className="pedidos-category-body">
          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="mg_tipo" className="pedidos-label required">
                Tipo de animación
              </label>
              <select
                id="mg_tipo"
                className={`pedidos-select ${errors['motion.tipo_motion'] ? 'error' : ''}`}
                value={data.tipo_motion || ''}
                onChange={(e) => onChange({ tipo_motion: e.target.value })}
              >
                <option value="">Seleccionar tipo...</option>
                <option value="Placa animada">Placa animada</option>
                <option value="Títulos y zócalos animados">Títulos y zócalos animados</option>
                <option value="Infografía en movimiento">Infografía en movimiento</option>
                <option value="Video explicativo animado">Video explicativo animado</option>
                <option value="Otro">Otro</option>
              </select>
              {errors['motion.tipo_motion'] && (
                <span className="pedidos-error-text" role="alert">{errors['motion.tipo_motion']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="mg_formato" className="pedidos-label required">
                Formato visual
              </label>
              <select
                id="mg_formato"
                className={`pedidos-select ${errors['motion.formato'] ? 'error' : ''}`}
                value={data.formato || ''}
                onChange={(e) => onChange({ formato: e.target.value })}
              >
                <option value="">Seleccionar formato...</option>
                <option value="Horizontal 16:9 (YouTube / Pantallas)">Horizontal 16:9 (YouTube / Pantallas)</option>
                <option value="Vertical 9:16 (Reels / Stories)">Vertical 9:16 (Reels / Stories)</option>
                <option value="Cuadrado 1:1 (Feed)">Cuadrado 1:1 (Feed)</option>
                <option value="No estoy seguro">No estoy seguro</option>
              </select>
              {errors['motion.formato'] && (
                <span className="pedidos-error-text" role="alert">{errors['motion.formato']}</span>
              )}
            </div>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="mg_texto" className="pedidos-label required">
              Texto / Títulos a incluir
            </label>
            <textarea
              id="mg_texto"
              className={`pedidos-textarea ${errors['motion.texto_contenido'] ? 'error' : ''}`}
              rows={3}
              placeholder="Ingresá los textos literales, cifras o datos que deben aparecer animados..."
              value={data.texto_contenido || ''}
              onChange={(e) => onChange({ texto_contenido: e.target.value })}
            />
            {errors['motion.texto_contenido'] && (
              <span className="pedidos-error-text" role="alert">{errors['motion.texto_contenido']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="mg_desc" className="pedidos-label required">
              Descripción del requerimiento y estilo
            </label>
            <textarea
              id="mg_desc"
              className={`pedidos-textarea ${errors['motion.descripcion'] ? 'error' : ''}`}
              rows={3}
              placeholder="Explicá cómo imaginás la animación, ritmo, elementos visuales o colores institucionales..."
              value={data.descripcion || ''}
              onChange={(e) => onChange({ descripcion: e.target.value })}
            />
            {errors['motion.descripcion'] && (
              <span className="pedidos-error-text" role="alert">{errors['motion.descripcion']}</span>
            )}
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="mg_fecha" className="pedidos-label required">
                Fecha límite de entrega
              </label>
              <input
                type="date"
                id="mg_fecha"
                min={getLocalTodayDateString()}
                className={`pedidos-input ${errors['motion.fecha_limite'] ? 'error' : ''}`}
                value={data.fecha_limite || ''}
                onChange={(e) => onChange({ fecha_limite: e.target.value })}
                aria-invalid={!!errors['motion.fecha_limite']}
                aria-describedby={errors['motion.fecha_limite'] ? 'mg_fecha_error' : undefined}
              />
              {errors['motion.fecha_limite'] && (
                <span id="mg_fecha_error" className="pedidos-error-text" role="alert">{errors['motion.fecha_limite']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="mg_duracion" className="pedidos-label">
                Duración aproximada (opcional)
              </label>
              <input
                type="text"
                id="mg_duracion"
                className="pedidos-input"
                placeholder="Ej: 15 segundos / 30 segundos / 1 minuto"
                value={data.duracion_aprox || ''}
                onChange={(e) => onChange({ duracion_aprox: e.target.value })}
              />
            </div>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="mg_ref" className="pedidos-label">
              Referencias o ejemplos visuales (opcional)
            </label>
            <textarea
              id="mg_ref"
              className="pedidos-textarea"
              rows={2}
              placeholder="Enlaces a videos o ejemplos de estilo de animación deseado..."
              value={data.referencias || ''}
              onChange={(e) => onChange({ referencias: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
