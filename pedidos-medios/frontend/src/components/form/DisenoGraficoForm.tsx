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

          <div className="pedidos-form-group">
            <label htmlFor="flyer_fecha_limite" className="pedidos-label required">
              Fecha del evento/actividad/pieza
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
            <label htmlFor="inv_fecha" className="pedidos-label required">
              Fecha del evento/actividad/pieza
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

          <div className="pedidos-form-group">
            <label htmlFor="inv_programa" className="pedidos-label required">
              Especificaciones del pedido
            </label>
            <textarea
              id="inv_programa"
              className={`pedidos-textarea ${errors['invitacion_digital.programa'] ? 'error' : ''}`}
              rows={3}
              placeholder="Detalle de la invitación, oradores, lugar/modalidad, horario y especificaciones..."
              value={invitacionData.programa || ''}
              onChange={(e) => onChangeInvitacion({ programa: e.target.value, especificaciones: e.target.value })}
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
            <label htmlFor="cert_fecha" className="pedidos-label required">
              Fecha del evento/actividad/pieza
            </label>
            <input
              type="date"
              id="cert_fecha"
              min={getLocalTodayDateString()}
              className={`pedidos-input ${errors['certificado.fecha'] ? 'error' : ''}`}
              value={certificadoData.fecha || ''}
              onChange={(e) => onChangeCertificado({ fecha: e.target.value })}
              aria-invalid={!!errors['certificado.fecha']}
              aria-describedby={errors['certificado.fecha'] ? 'cert_fecha_error' : undefined}
            />
            {errors['certificado.fecha'] && (
              <span id="cert_fecha_error" className="pedidos-error-text" role="alert">{errors['certificado.fecha']}</span>
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
              Especificaciones del pedido
            </label>
            <textarea
              id="cert_destinatarios"
              className={`pedidos-textarea ${errors['certificado.destinatarios'] ? 'error' : ''}`}
              rows={3}
              placeholder="Ingresá los nombres de los destinatarios o indicá si se adjuntará una planilla Excel en el paso 3..."
              value={certificadoData.destinatarios || ''}
              onChange={(e) => onChangeCertificado({ destinatarios: e.target.value, especificaciones: e.target.value })}
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
            <label htmlFor="otros_fecha" className="pedidos-label required">
              Fecha del evento/actividad/pieza
            </label>
            <input
              type="date"
              id="otros_fecha"
              min={getLocalTodayDateString()}
              className={`pedidos-input ${errors['otros_diseno.fecha'] ? 'error' : ''}`}
              value={otrosData.fecha || ''}
              onChange={(e) => onChangeOtros({ fecha: e.target.value })}
              aria-invalid={!!errors['otros_diseno.fecha']}
              aria-describedby={errors['otros_diseno.fecha'] ? 'otros_fecha_error' : undefined}
            />
            {errors['otros_diseno.fecha'] && (
              <span id="otros_fecha_error" className="pedidos-error-text" role="alert">{errors['otros_diseno.fecha']}</span>
            )}
          </div>

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
