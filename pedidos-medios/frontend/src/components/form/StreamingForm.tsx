import React from 'react';
import { StreamingData, ContactoFormState } from '../../types/form';
import { AsesoramientoCard } from './AsesoramientoCard';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface StreamingFormProps {
  data: StreamingData;
  contacto: ContactoFormState;
  onChange: (fields: Partial<StreamingData>) => void;
  onEditContacto: () => void;
  errors: ValidationErrors;
}

export const StreamingForm: React.FC<StreamingFormProps> = ({
  data,
  contacto,
  onChange,
  onEditContacto,
  errors,
}) => {
  const isPresencialOHibrida = data.modalidad === 'Presencial' || data.modalidad === 'Híbrida';

  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Transmisión en Vivo / Streaming</h3>
        <p className="pedidos-section-desc">
          Transmisiones oficiales por streaming, generación de enlaces y salas virtuales de Zoom o Google Meet.
        </p>
      </div>

      <AsesoramientoCard
        categoryTitle="Transmisión en vivo / streaming"
        fields={data}
        contacto={contacto}
        onChange={onChange}
        onEditContacto={onEditContacto}
        errorObjetivo={errors['streaming.objetivo_asesoramiento']}
      />

      {!data.requiere_asesoramiento && (
        <div className="pedidos-category-body">
          <div className="pedidos-form-group">
            <label htmlFor="str_tipo" className="pedidos-label required">
              Tipo de requerimiento
            </label>
            <select
              id="str_tipo"
              className={`pedidos-select ${errors['streaming.tipo_streaming'] ? 'error' : ''}`}
              value={data.tipo_streaming || ''}
              onChange={(e) => onChange({ tipo_streaming: e.target.value })}
            >
              <option value="">Seleccionar tipo...</option>
              <option value="Transmisión en vivo de un evento">Transmisión en vivo de un evento</option>
              <option value="Link / sala institucional de Zoom">Link / sala institucional de Zoom</option>
              <option value="Link / sala de Google Meet">Link / sala de Google Meet</option>
              <option value="Sala de streaming">Sala de streaming</option>
              <option value="Otro">Otro</option>
            </select>
            {errors['streaming.tipo_streaming'] && (
              <span className="pedidos-error-text" role="alert">{errors['streaming.tipo_streaming']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="str_nombre" className="pedidos-label required">
              Nombre de la actividad / evento
            </label>
            <input
              type="text"
              id="str_nombre"
              className={`pedidos-input ${errors['streaming.nombre_evento'] ? 'error' : ''}`}
              placeholder="Ej: Apertura de Sesiones / Lanzamiento de Programa"
              value={data.nombre_evento || ''}
              onChange={(e) => onChange({ nombre_evento: e.target.value })}
            />
            {errors['streaming.nombre_evento'] && (
              <span className="pedidos-error-text" role="alert">{errors['streaming.nombre_evento']}</span>
            )}
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-4">
              <label htmlFor="str_fecha" className="pedidos-label required">
                Fecha
              </label>
              <input
                type="date"
                id="str_fecha"
                min={getLocalTodayDateString()}
                className={`pedidos-input ${errors['streaming.fecha'] ? 'error' : ''}`}
                value={data.fecha || ''}
                onChange={(e) => onChange({ fecha: e.target.value })}
                aria-invalid={!!errors['streaming.fecha']}
                aria-describedby={errors['streaming.fecha'] ? 'str_fecha_error' : undefined}
              />
              {errors['streaming.fecha'] && (
                <span id="str_fecha_error" className="pedidos-error-text" role="alert">{errors['streaming.fecha']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-4">
              <label htmlFor="str_inicio" className="pedidos-label required">
                Hora de inicio
              </label>
              <input
                type="time"
                id="str_inicio"
                className={`pedidos-input ${errors['streaming.hora_inicio'] ? 'error' : ''}`}
                value={data.hora_inicio || ''}
                onChange={(e) => onChange({ hora_inicio: e.target.value })}
              />
              {errors['streaming.hora_inicio'] && (
                <span className="pedidos-error-text" role="alert">{errors['streaming.hora_inicio']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-4">
              <label htmlFor="str_fin" className="pedidos-label">
                Hora estimada de fin (opcional)
              </label>
              <input
                type="time"
                id="str_fin"
                className="pedidos-input"
                value={data.hora_fin || ''}
                onChange={(e) => onChange({ hora_fin: e.target.value })}
              />
            </div>
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="str_modalidad" className="pedidos-label required">
                Modalidad
              </label>
              <select
                id="str_modalidad"
                className={`pedidos-select ${errors['streaming.modalidad'] ? 'error' : ''}`}
                value={data.modalidad || ''}
                onChange={(e) => onChange({ modalidad: e.target.value as StreamingData['modalidad'] })}
              >
                <option value="">Seleccionar modalidad...</option>
                <option value="Presencial">Presencial (con transmisión)</option>
                <option value="Virtual">Virtual (100% online)</option>
                <option value="Híbrida">Híbrida</option>
              </select>
              {errors['streaming.modalidad'] && (
                <span className="pedidos-error-text" role="alert">{errors['streaming.modalidad']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="str_participantes" className="pedidos-label">
                Cantidad estimada de participantes (opcional)
              </label>
              <input
                type="text"
                id="str_participantes"
                className="pedidos-input"
                placeholder="Ej: 50 a 100 personas"
                value={data.participantes_estimados || ''}
                onChange={(e) => onChange({ participantes_estimados: e.target.value })}
              />
            </div>
          </div>

          {isPresencialOHibrida && (
            <div className="pedidos-form-row">
              <div className="pedidos-form-group col-8">
                <label htmlFor="str_lugar" className="pedidos-label required">
                  Lugar físico de la transmisión
                </label>
                <input
                  type="text"
                  id="str_lugar"
                  className={`pedidos-input ${errors['streaming.lugar'] ? 'error' : ''}`}
                  placeholder="Ej: Salón de Usos Múltiples / Auditorio"
                  value={data.lugar || ''}
                  onChange={(e) => onChange({ lugar: e.target.value })}
                />
                {errors['streaming.lugar'] && (
                  <span className="pedidos-error-text" role="alert">{errors['streaming.lugar']}</span>
                )}
              </div>

              <div className="pedidos-form-group col-4">
                <label htmlFor="str_ciudad" className="pedidos-label required">
                  Ciudad
                </label>
                <select
                  id="str_ciudad"
                  className={`pedidos-select ${errors['streaming.ciudad'] ? 'error' : ''}`}
                  value={data.ciudad || ''}
                  onChange={(e) => onChange({ ciudad: e.target.value as StreamingData['ciudad'] })}
                >
                  <option value="">Seleccionar...</option>
                  <option value="Ushuaia">Ushuaia</option>
                  <option value="Río Grande">Río Grande</option>
                  <option value="Tolhuin">Tolhuin</option>
                </select>
                {errors['streaming.ciudad'] && (
                  <span className="pedidos-error-text" role="alert">{errors['streaming.ciudad']}</span>
                )}
              </div>
            </div>
          )}

          <div className="pedidos-form-group">
            <label htmlFor="str_req" className="pedidos-label required">
              Descripción y requerimientos técnicos
            </label>
            <textarea
              id="str_req"
              className={`pedidos-textarea ${errors['streaming.descripcion_requerimientos'] ? 'error' : ''}`}
              rows={3}
              placeholder="Detallá si se requiere retransmisión por redes, audio de consola, grabación de la sesión, etc..."
              value={data.descripcion_requerimientos || ''}
              onChange={(e) => onChange({ descripcion_requerimientos: e.target.value })}
            />
            {errors['streaming.descripcion_requerimientos'] && (
              <span className="pedidos-error-text" role="alert">{errors['streaming.descripcion_requerimientos']}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
