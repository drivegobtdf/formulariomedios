import React from 'react';
import {
  DisenoPiezaSlug,
  DISENO_PIEZAS_CONFIG,
  FlyerRrssData,
  InvitacionDigitalData,
  CertificadoData,
  OtrosDisenoData,
} from '../../types/form';
import { ValidationErrors, getLocalTodayDateString } from '../../validation/formValidation';

interface DisenoGraficoFormProps {
  selectedPiezas: DisenoPiezaSlug[];
  onTogglePieza: (pieza: DisenoPiezaSlug) => void;
  flyerData: FlyerRrssData;
  onChangeFlyer: (data: Partial<FlyerRrssData>) => void;
  invitacionData: InvitacionDigitalData;
  onChangeInvitacion: (data: Partial<InvitacionDigitalData>) => void;
  certificadoData: CertificadoData;
  onChangeCertificado: (data: Partial<CertificadoData>) => void;
  otrosData: OtrosDisenoData;
  onChangeOtros: (data: Partial<OtrosDisenoData>) => void;
  errors: ValidationErrors;
}

export const DisenoGraficoForm: React.FC<DisenoGraficoFormProps> = ({
  selectedPiezas,
  onTogglePieza,
  flyerData,
  onChangeFlyer,
  invitacionData,
  onChangeInvitacion,
  certificadoData,
  onChangeCertificado,
  otrosData,
  onChangeOtros,
  errors,
}) => {
  return (
    <div className="pedidos-category-section">
      <div className="pedidos-section-header">
        <h3>Diseño Gráfico</h3>
      </div>

      <div className="pedidos-pieza-selector">
        <label className="pedidos-label required">
          Elegí una o más piezas. <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.85rem' }}>(Cada pieza genera un PED)</span>
        </label>
        {errors['diseno_piezas'] && (
          <div className="pedidos-error-banner" role="alert">{errors['diseno_piezas']}</div>
        )}
        <div className="pedidos-pieza-grid">
          {DISENO_PIEZAS_CONFIG.map((p) => {
            const isChecked = selectedPiezas.includes(p.slug);
            return (
              <label
                key={p.slug}
                className={`pedidos-pieza-card ${isChecked ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onTogglePieza(p.slug)}
                />
                <div className="pedidos-pieza-info">
                  <strong>{p.nombre}</strong>
                  <span>{p.descripcion}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Subformulario Flyer RRSS */}
      {selectedPiezas.includes('flyer_rrss') && (
        <fieldset className="pedidos-subform-card">
          <legend>
            <span className="pedidos-badge-pill">Pieza: Flyer para redes sociales</span>
          </legend>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-6">
              <label htmlFor="flyer_formato" className="pedidos-label required">
                Formato de la imagen
              </label>
              <select
                id="flyer_formato"
                className={`pedidos-select ${errors['flyer_rrss.formato'] ? 'error' : ''}`}
                value={flyerData.formato || ''}
                onChange={(e) => onChangeFlyer({ formato: e.target.value })}
                aria-invalid={!!errors['flyer_rrss.formato']}
                aria-describedby={errors['flyer_rrss.formato'] ? 'flyer_formato_error' : undefined}
              >
                <option value="">Seleccionar formato...</option>
                <option value="Cuadrado 1:1 (Feed Instagram/Facebook)">Cuadrado 1:1 (Feed Instagram/Facebook)</option>
                <option value="Vertical 9:16 (Historias / Reels / WhatsApp)">Vertical 9:16 (Historias / Reels / WhatsApp)</option>
                <option value="Horizontal 16:9 (Twitter / Web / Prensa)">Horizontal 16:9 (Twitter / Web / Prensa)</option>
                <option value="Adaptable a varios formatos">Adaptable a varios formatos</option>
              </select>
              {errors['flyer_rrss.formato'] && (
                <span id="flyer_formato_error" className="pedidos-error-text" role="alert">{errors['flyer_rrss.formato']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-6">
              <label htmlFor="flyer_fecha_limite" className="pedidos-label required">
                Fecha límite requerida
              </label>
              <input
                type="date"
                id="flyer_fecha_limite"
                min={getLocalTodayDateString()}
                className={`pedidos-input ${errors['flyer_rrss.fecha_limite'] ? 'error' : ''}`}
                value={flyerData.fecha_limite || ''}
                onChange={(e) => onChangeFlyer({ fecha_limite: e.target.value })}
                aria-invalid={!!errors['flyer_rrss.fecha_limite']}
                aria-describedby={errors['flyer_rrss.fecha_limite'] ? 'flyer_fecha_limite_error' : undefined}
              />
              {errors['flyer_rrss.fecha_limite'] && (
                <span id="flyer_fecha_limite_error" className="pedidos-error-text" role="alert">{errors['flyer_rrss.fecha_limite']}</span>
              )}
            </div>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="flyer_texto" className="pedidos-label required">
              Texto y contenido que debe incluir el flyer
            </label>
            <textarea
              id="flyer_texto"
              className={`pedidos-textarea ${errors['flyer_rrss.texto'] ? 'error' : ''}`}
              rows={4}
              placeholder="Ingresá el texto completo, título, fecha, hora, lugar y mensajes clave que deben figurar en la pieza gráfica..."
              value={flyerData.texto || ''}
              onChange={(e) => onChangeFlyer({ texto: e.target.value })}
              aria-invalid={!!errors['flyer_rrss.texto']}
              aria-describedby={
                errors['flyer_rrss.texto']
                  ? 'flyer_texto_error flyer_texto_hint'
                  : 'flyer_texto_hint'
              }
            />
            <div className="pedidos-field-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              {errors['flyer_rrss.texto'] ? (
                <span id="flyer_texto_error" className="pedidos-error-text" role="alert">{errors['flyer_rrss.texto']}</span>
              ) : <span />}
              <span id="flyer_texto_hint" className="pedidos-hint-text">
                {(flyerData.texto || '').length} caracteres · mínimo 5
              </span>
            </div>
          </div>
        </fieldset>
      )}

      {/* Subformulario Invitación Digital */}
      {selectedPiezas.includes('invitacion_digital') && (
        <fieldset className="pedidos-subform-card">
          <legend>
            <span className="pedidos-badge-pill">Pieza: Invitación digital</span>
          </legend>

          <div className="pedidos-form-group">
            <label htmlFor="inv_nombre_evento" className="pedidos-label required">
              Nombre o título del evento
            </label>
            <input
              type="text"
              id="inv_nombre_evento"
              className={`pedidos-input ${errors['invitacion_digital.nombre_evento'] ? 'error' : ''}`}
              placeholder="Ej: Acto Oficial del Día de la Bandera"
              value={invitacionData.nombre_evento || ''}
              onChange={(e) => onChangeInvitacion({ nombre_evento: e.target.value })}
              aria-invalid={!!errors['invitacion_digital.nombre_evento']}
              aria-describedby={errors['invitacion_digital.nombre_evento'] ? 'inv_nombre_evento_error' : undefined}
            />
            {errors['invitacion_digital.nombre_evento'] && (
              <span id="inv_nombre_evento_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.nombre_evento']}</span>
            )}
          </div>

          <div className="pedidos-form-row">
            <div className="pedidos-form-group col-4">
              <label htmlFor="inv_fecha" className="pedidos-label required">
                Fecha del evento
              </label>
              <input
                type="date"
                id="inv_fecha"
                min={getLocalTodayDateString()}
                className={`pedidos-input ${errors['invitacion_digital.fecha'] ? 'error' : ''}`}
                value={invitacionData.fecha || ''}
                onChange={(e) => onChangeInvitacion({ fecha: e.target.value })}
                aria-invalid={!!errors['invitacion_digital.fecha']}
                aria-describedby={errors['invitacion_digital.fecha'] ? 'inv_fecha_error' : undefined}
              />
              {errors['invitacion_digital.fecha'] && (
                <span id="inv_fecha_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.fecha']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-4">
              <label htmlFor="inv_hora" className="pedidos-label required">
                Hora
              </label>
              <input
                type="time"
                id="inv_hora"
                className={`pedidos-input ${errors['invitacion_digital.hora'] ? 'error' : ''}`}
                value={invitacionData.hora || ''}
                onChange={(e) => onChangeInvitacion({ hora: e.target.value })}
                aria-invalid={!!errors['invitacion_digital.hora']}
                aria-describedby={errors['invitacion_digital.hora'] ? 'inv_hora_error' : undefined}
              />
              {errors['invitacion_digital.hora'] && (
                <span id="inv_hora_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.hora']}</span>
              )}
            </div>

            <div className="pedidos-form-group col-4">
              <label htmlFor="inv_modalidad" className="pedidos-label required">
                Modalidad
              </label>
              <select
                id="inv_modalidad"
                className={`pedidos-select ${errors['invitacion_digital.modalidad'] ? 'error' : ''}`}
                value={invitacionData.modalidad || ''}
                onChange={(e) => onChangeInvitacion({ modalidad: e.target.value as InvitacionDigitalData['modalidad'] })}
                aria-invalid={!!errors['invitacion_digital.modalidad']}
                aria-describedby={errors['invitacion_digital.modalidad'] ? 'inv_modalidad_error' : undefined}
              >
                <option value="">Seleccionar...</option>
                <option value="Presencial">Presencial</option>
                <option value="Virtual">Virtual</option>
                <option value="Híbrida">Híbrida</option>
              </select>
              {errors['invitacion_digital.modalidad'] && (
                <span id="inv_modalidad_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.modalidad']}</span>
              )}
            </div>
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="inv_lugar" className="pedidos-label required">
              Lugar / Dirección (o enlace si es virtual)
            </label>
            <input
              type="text"
              id="inv_lugar"
              className={`pedidos-input ${errors['invitacion_digital.lugar'] ? 'error' : ''}`}
              placeholder="Ej: Salón Islas Malvinas, Casa de Gobierno"
              value={invitacionData.lugar || ''}
              onChange={(e) => onChangeInvitacion({ lugar: e.target.value })}
              aria-invalid={!!errors['invitacion_digital.lugar']}
              aria-describedby={errors['invitacion_digital.lugar'] ? 'inv_lugar_error' : undefined}
            />
            {errors['invitacion_digital.lugar'] && (
              <span id="inv_lugar_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.lugar']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="inv_programa" className="pedidos-label required">
              Programa / Cronograma de actividades
            </label>
            <textarea
              id="inv_programa"
              className={`pedidos-textarea ${errors['invitacion_digital.programa'] ? 'error' : ''}`}
              rows={3}
              placeholder="Detalle del cronograma, oradores y orden del evento..."
              value={invitacionData.programa || ''}
              onChange={(e) => onChangeInvitacion({ programa: e.target.value })}
              aria-invalid={!!errors['invitacion_digital.programa']}
              aria-describedby={errors['invitacion_digital.programa'] ? 'inv_programa_error' : undefined}
            />
            {errors['invitacion_digital.programa'] && (
              <span id="inv_programa_error" className="pedidos-error-text" role="alert">{errors['invitacion_digital.programa']}</span>
            )}
          </div>
        </fieldset>
      )}

      {/* Subformulario Certificado */}
      {selectedPiezas.includes('certificado') && (
        <fieldset className="pedidos-subform-card">
          <legend>
            <span className="pedidos-badge-pill">Pieza: Certificados y diplomas</span>
          </legend>

          <div className="pedidos-form-group">
            <label htmlFor="cert_nombre" className="pedidos-label required">
              Nombre de la actividad / curso / capacitación
            </label>
            <input
              type="text"
              id="cert_nombre"
              className={`pedidos-input ${errors['certificado.nombre_actividad'] ? 'error' : ''}`}
              placeholder="Ej: Taller de Formación en Gestión Pública 2026"
              value={certificadoData.nombre_actividad || ''}
              onChange={(e) => onChangeCertificado({ nombre_actividad: e.target.value })}
              aria-invalid={!!errors['certificado.nombre_actividad']}
              aria-describedby={errors['certificado.nombre_actividad'] ? 'cert_nombre_error' : undefined}
            />
            {errors['certificado.nombre_actividad'] && (
              <span id="cert_nombre_error" className="pedidos-error-text" role="alert">{errors['certificado.nombre_actividad']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="cert_firmantes" className="pedidos-label required">
              Autoridades firmantes (Nombre, Apellido y Cargo)
            </label>
            <input
              type="text"
              id="cert_firmantes"
              className={`pedidos-input ${errors['certificado.firmantes'] ? 'error' : ''}`}
              placeholder="Ej: Lic. Juan Pérez (Secretario), Dra. Ana Gómez (Directora)"
              value={certificadoData.firmantes || ''}
              onChange={(e) => onChangeCertificado({ firmantes: e.target.value })}
              aria-invalid={!!errors['certificado.firmantes']}
              aria-describedby={errors['certificado.firmantes'] ? 'cert_firmantes_error' : undefined}
            />
            {errors['certificado.firmantes'] && (
              <span id="cert_firmantes_error" className="pedidos-error-text" role="alert">{errors['certificado.firmantes']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="cert_destinatarios" className="pedidos-label required">
              Lista o detalle de destinatarios
            </label>
            <textarea
              id="cert_destinatarios"
              className={`pedidos-textarea ${errors['certificado.destinatarios'] ? 'error' : ''}`}
              rows={3}
              placeholder="Ingresá los nombres de los destinatarios o indicá si se adjuntará una planilla Excel en el paso 3..."
              value={certificadoData.destinatarios || ''}
              onChange={(e) => onChangeCertificado({ destinatarios: e.target.value })}
              aria-invalid={!!errors['certificado.destinatarios']}
              aria-describedby={errors['certificado.destinatarios'] ? 'cert_destinatarios_error' : undefined}
            />
            {errors['certificado.destinatarios'] && (
              <span id="cert_destinatarios_error" className="pedidos-error-text" role="alert">{errors['certificado.destinatarios']}</span>
            )}
          </div>
        </fieldset>
      )}

      {/* Subformulario Otros requerimientos gráficos */}
      {selectedPiezas.includes('otros_diseno') && (
        <fieldset className="pedidos-subform-card">
          <legend>
            <span className="pedidos-badge-pill">Pieza: Otros requerimientos gráficos</span>
          </legend>

          <div className="pedidos-form-group">
            <label htmlFor="otros_desc" className="pedidos-label required">
              Descripción de la pieza gráfica
            </label>
            <textarea
              id="otros_desc"
              className={`pedidos-textarea ${errors['otros_diseno.descripcion'] ? 'error' : ''}`}
              rows={3}
              placeholder="Detallá qué pieza necesitás (ej: banner institucional, folleto díptico, credencial, afiche A3)..."
              value={otrosData.descripcion || ''}
              onChange={(e) => onChangeOtros({ descripcion: e.target.value })}
              aria-invalid={!!errors['otros_diseno.descripcion']}
              aria-describedby={errors['otros_diseno.descripcion'] ? 'otros_desc_error' : undefined}
            />
            {errors['otros_diseno.descripcion'] && (
              <span id="otros_desc_error" className="pedidos-error-text" role="alert">{errors['otros_diseno.descripcion']}</span>
            )}
          </div>

          <div className="pedidos-form-group">
            <label htmlFor="otros_medidas" className="pedidos-label required">
              Medidas o soporte técnico
            </label>
            <input
              type="text"
              id="otros_medidas"
              className={`pedidos-input ${errors['otros_diseno.medidas_soporte'] ? 'error' : ''}`}
              placeholder="Ej: 90x190 cm para roll-up / A4 digital / Imprenta color frente y dorso"
              value={otrosData.medidas_soporte || ''}
              onChange={(e) => onChangeOtros({ medidas_soporte: e.target.value })}
              aria-invalid={!!errors['otros_diseno.medidas_soporte']}
              aria-describedby={errors['otros_diseno.medidas_soporte'] ? 'otros_medidas_error' : undefined}
            />
            {errors['otros_diseno.medidas_soporte'] && (
              <span id="otros_medidas_error" className="pedidos-error-text" role="alert">{errors['otros_diseno.medidas_soporte']}</span>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
};
