import React from 'react';
import { ProduccionAudiovisualData, ContactoFormState } from '../../types/form';
import { AsesoramientoCard } from './AsesoramientoCard';
import { ValidationErrors, getUshuaiaTomorrowDateString } from '../../validation/formValidation';

interface ProduccionAudiovisualFormProps {
  data: ProduccionAudiovisualData;
  contacto: ContactoFormState;
  onChange: (fields: Partial<ProduccionAudiovisualData>) => void;
  onEditContacto: () => void;
  errors: ValidationErrors;
}

export const ProduccionAudiovisualForm: React.FC<ProduccionAudiovisualFormProps> = ({
  data,
  contacto,
  onChange,
  onEditContacto,
  errors,
}) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Producción Audiovisual</h3>
        <p className="pedidos-section-desc">
          Videos institucionales, coberturas en video, entrevistas, reels y edición de material audiovisual.
        </p>
      </div>

      <AsesoramientoCard
        categoryTitle="Producción audiovisual"
        fields={data}
        contacto={contacto}
        onChange={onChange}
        onEditContacto={onEditContacto}
        errorObjetivo={errors['audiovisual.objetivo_asesoramiento']}
      />

      {!data.requiere_asesoramiento && (
        <div className="pedidos-category-body">
          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="av_tipo" className="pedidos-label required">
                Tipo de producción
              </label>
              <select
                id="av_tipo"
                className={`pedidos-select ${errors['audiovisual.tipo_produccion'] ? 'error' : ''}`}
                value={data.tipo_produccion || ''}
                onChange={(e) => onChange({ tipo_produccion: e.target.value })}
              >
                <option value="">Seleccionar tipo...</option>
                <option value="Video institucional">Video institucional</option>
                <option value="Entrevista">Entrevista</option>
                <option value="Reel / Video corto para redes">Reel / Video corto para redes</option>
                <option value="Edición de material existente">Edición de material existente</option>
                <option value="Otro">Otro</option>
              </select>
              {errors['audiovisual.tipo_produccion'] && (
                <span className="pedidos-error-text" role="alert">{errors['audiovisual.tipo_produccion']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="av_formato" className="pedidos-label required">
                Formato de video
              </label>
              <select
                id="av_formato"
                className={`pedidos-select ${errors['audiovisual.formato'] ? 'error' : ''}`}
                value={data.formato || ''}
                onChange={(e) => onChange({ formato: e.target.value })}
              >
                <option value="">Seleccionar formato...</option>
                <option value="Horizontal 16:9 (YouTube / TV / Actos)">Horizontal 16:9 (YouTube / TV / Actos)</option>
                <option value="Vertical 9:16 (Instagram Reels / TikTok / WhatsApp)">Vertical 9:16 (Instagram Reels / TikTok / WhatsApp)</option>
                <option value="Cuadrado 1:1 (Feed redes)">Cuadrado 1:1 (Feed redes)</option>
                <option value="No estoy seguro (definir con el equipo)">No estoy seguro (definir con el equipo)</option>
              </select>
              {errors['audiovisual.formato'] && (
                <span className="pedidos-error-text" role="alert">{errors['audiovisual.formato']}</span>
              )}
            </div>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="av_desc" className="pedidos-label required">
              Descripción y objetivo del video
            </label>
            <textarea
              id="av_desc"
              className={`pedidos-textarea ${errors['audiovisual.descripcion_objetivo'] ? 'error' : ''}`}
              rows={3}
              placeholder="Detallá el objetivo del contenido audiovisual, público al que va dirigido y mensajes principales..."
              value={data.descripcion_objetivo || ''}
              onChange={(e) => onChange({ descripcion_objetivo: e.target.value })}
            />
            {errors['audiovisual.descripcion_objetivo'] && (
              <span className="pedidos-error-text" role="alert">{errors['audiovisual.descripcion_objetivo']}</span>
            )}
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="av_fecha_limite" className="pedidos-label required">
                Fecha límite de entrega
              </label>
              <input
                type="date"
                id="av_fecha_limite"
                min={getUshuaiaTomorrowDateString()}
                className={`pedidos-input ${errors['audiovisual.fecha_limite'] ? 'error' : ''}`}
                value={data.fecha_limite || ''}
                onChange={(e) => onChange({ fecha_limite: e.target.value })}
                aria-invalid={!!errors['audiovisual.fecha_limite']}
                aria-describedby={errors['audiovisual.fecha_limite'] ? 'av_fecha_limite_error' : undefined}
              />
              {errors['audiovisual.fecha_limite'] && (
                <span id="av_fecha_limite_error" className="pedidos-error-text" role="alert">{errors['audiovisual.fecha_limite']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label className="pedidos-label">¿Requiere rodaje o grabación presencial?</label>
              <div className="pedidos-radio-inline" style={{ marginTop: '0.5rem' }}>
                <label className="pedidos-radio-label">
                  <input
                    type="radio"
                    name="av_grabacion"
                    checked={data.requiere_grabacion === true}
                    onChange={() => onChange({ requiere_grabacion: true })}
                  />
                  <span>Sí, requiere grabación</span>
                </label>
                <label className="pedidos-radio-label">
                  <input
                    type="radio"
                    name="av_grabacion"
                    checked={data.requiere_grabacion !== true}
                    onChange={() => onChange({ requiere_grabacion: false })}
                  />
                  <span>No (solo edición / animación)</span>
                </label>
              </div>
            </div>
          </div>

          {data.requiere_grabacion && (
            <fieldset className="pedidos-subform-card">
              <legend>
                <span className="pedidos-badge-pill">Datos de la grabación</span>
              </legend>

              <div className="pedidos-form-row">
                <div className="pedidos-form-group col-4">
                  <label htmlFor="av_grab_fecha" className="pedidos-label required">
                    Fecha de grabación
                  </label>
                  <input
                    type="date"
                    id="av_grab_fecha"
                    min={getUshuaiaTomorrowDateString()}
                    className={`pedidos-input ${errors['audiovisual.grabacion_fecha'] ? 'error' : ''}`}
                    value={data.grabacion_fecha || ''}
                    onChange={(e) => onChange({ grabacion_fecha: e.target.value })}
                    aria-invalid={!!errors['audiovisual.grabacion_fecha']}
                    aria-describedby={errors['audiovisual.grabacion_fecha'] ? 'av_grab_fecha_error' : undefined}
                  />
                  {errors['audiovisual.grabacion_fecha'] && (
                    <span id="av_grab_fecha_error" className="pedidos-error-text" role="alert">{errors['audiovisual.grabacion_fecha']}</span>
                  )}
                </div>

                <div className="pedidos-form-group col-4">
                  <label htmlFor="av_grab_hora" className="pedidos-label required">
                    Horario
                  </label>
                  <input
                    type="time"
                    id="av_grab_hora"
                    className={`pedidos-input ${errors['audiovisual.grabacion_hora'] ? 'error' : ''}`}
                    value={data.grabacion_hora || ''}
                    onChange={(e) => onChange({ grabacion_hora: e.target.value })}
                  />
                  {errors['audiovisual.grabacion_hora'] && (
                    <span className="pedidos-error-text" role="alert">{errors['audiovisual.grabacion_hora']}</span>
                  )}
                </div>

                <div className="pedidos-form-group col-4">
                  <label htmlFor="av_grab_ciudad" className="pedidos-label required">
                    Ciudad
                  </label>
                  <select
                    id="av_grab_ciudad"
                    className={`pedidos-select ${errors['audiovisual.grabacion_ciudad'] ? 'error' : ''}`}
                    value={data.grabacion_ciudad || ''}
                    onChange={(e) => onChange({ grabacion_ciudad: e.target.value as ProduccionAudiovisualData['grabacion_ciudad'] })}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Ushuaia">Ushuaia</option>
                    <option value="Río Grande">Río Grande</option>
                    <option value="Tolhuin">Tolhuin</option>
                  </select>
                  {errors['audiovisual.grabacion_ciudad'] && (
                    <span className="pedidos-error-text" role="alert">{errors['audiovisual.grabacion_ciudad']}</span>
                  )}
                </div>
              </div>

              <div className="pedidos-form-group">
                <label htmlFor="av_grab_lugar" className="pedidos-label required">
                  Lugar o locación de grabación
                </label>
                <input
                  type="text"
                  id="av_grab_lugar"
                  className={`pedidos-input ${errors['audiovisual.grabacion_lugar'] ? 'error' : ''}`}
                  placeholder="Ej: Despacho de Ministra / Planta de Procesamiento / Exterior"
                  value={data.grabacion_lugar || ''}
                  onChange={(e) => onChange({ grabacion_lugar: e.target.value })}
                />
                {errors['audiovisual.grabacion_lugar'] && (
                  <span className="pedidos-error-text" role="alert">{errors['audiovisual.grabacion_lugar']}</span>
                )}
              </div>
            </fieldset>
          )}

          {data.tipo_produccion === 'Edición de material existente' && (
            <div className="pedidos-form-group">
              <label htmlFor="av_material_enlace" className="pedidos-label">
                Enlace a material crudo / videos existentes (opcional)
              </label>
              <input
                type="url"
                id="av_material_enlace"
                className="pedidos-input"
                placeholder="Ej: https://drive.google.com/... o enlace de nube"
                value={data.material_enlace || ''}
                onChange={(e) => onChange({ material_enlace: e.target.value })}
              />
              <span className="pedidos-hint-text">
                Si tenés archivos individuales menores a 10 MB, también podés adjuntarlos en el Paso 3.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
