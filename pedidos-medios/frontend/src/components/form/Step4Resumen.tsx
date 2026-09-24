import React from 'react';
import {
  FormWizardState,
  FormPieceItem,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';
import { formatPhoneForDisplay } from '../../utils/phoneUtils';

interface Step4ResumenProps {
  state: FormWizardState;
  pieces: FormPieceItem[];
  onGoToStep: (step: number) => void;
  onToggleConfirmado: (checked: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  errors: ValidationErrors;
}

const FIELD_LABELS: Record<string, string> = {
  fecha_limite: 'Fecha límite',
  hora_inicio: 'Hora de inicio',
  hora_fin: 'Hora de fin',
  nombre_evento: 'Nombre del evento',
  nombre_actividad: 'Nombre de la actividad',
  medidas_soporte: 'Medidas / Soporte',
  referente_contacto: 'Referente de contacto',
  telefono_contacto: 'Teléfono de contacto',
  informacion_base: 'Información base',
  fecha_sugerida: 'Fecha sugerida',
  texto_copy: 'Texto / Copy',
  enlaces_referencia: 'Enlaces de referencia',
  tipo_produccion: 'Tipo de producción',
  descripcion_objetivo: 'Descripción / Objetivo',
  grabacion_fecha: 'Fecha de grabación',
  grabacion_hora: 'Hora de grabación',
  grabacion_lugar: 'Lugar de grabación',
  grabacion_ciudad: 'Ciudad de grabación',
  material_enlace: 'Enlace a material',
  tipo_motion: 'Tipo de animación',
  texto_contenido: 'Texto / Contenido',
  duracion_aprox: 'Duración aprox.',
  tipo_streaming: 'Tipo de transmisión',
  descripcion_requerimientos: 'Requerimientos',
  participantes_estimados: 'Participantes estimados',
  tipo_web: 'Tipo de requerimiento web',
  url_pagina: 'Página actual',
  contenido_cambios: 'Contenido / Cambios',
  requerimientos: 'Requerimientos',
  lugar: 'Lugar',
  ciudad: 'Ciudad',
  fecha: 'Fecha',
  hora: 'Hora',
  formato: 'Formato',
  texto: 'Texto',
  programa: 'Programa',
  firmantes: 'Firmantes',
  destinatarios: 'Destinatarios',
  descripcion: 'Descripción',
  autoridades: 'Autoridades',
};

export function getPieceFieldLabel(piece: FormPieceItem, key: string): string {
  const { categoria_slug, tipo_slug } = piece;

  // 1. Diseño Gráfico
  if (
    categoria_slug === 'diseno_grafico' ||
    ['flyer_rrss', 'invitacion_digital', 'certificado', 'otros_diseno'].includes(tipo_slug)
  ) {
    if (key === 'fecha_limite' || key === 'fecha') return 'Fecha del evento/actividad/pieza';
    if (key === 'texto') return 'Texto y contenido solicitado';
    if (key === 'formato') return 'Formato';
    if (key === 'programa' || key === 'destinatarios' || key === 'especificaciones')
      return 'Especificaciones del pedido';
    if (key === 'nombre_actividad') return 'Nombre de la actividad';
    if (key === 'firmantes') return 'Autoridades firmantes';
    if (key === 'descripcion') return 'Descripción de la pieza gráfica';
    if (key === 'medidas_soporte') return 'Medidas o soporte técnico';
  }

  // 2. Cobertura de Eventos
  if (categoria_slug === 'cobertura_eventos' || tipo_slug === 'cobertura_eventos') {
    if (key === 'fecha') return 'Fecha del evento';
    if (key === 'hora_inicio') return 'Hora de inicio';
    if (key === 'hora_fin') return 'Hora estimada de fin';
    if (key === 'lugar') return 'Lugar / Dirección';
    if (key === 'ciudad') return 'Ciudad';
    if (key === 'autoridades') return 'Autoridades asistentes';
    if (key === 'requerimientos') return 'Requerimientos de cobertura';
  }

  // 3. Gacetilla
  if (categoria_slug === 'gacetilla' || tipo_slug === 'gacetilla') {
    if (key === 'referente_contacto') return 'Referente o vocero de contacto';
    if (key === 'telefono_contacto') return 'Teléfono de contacto directo';
    if (key === 'informacion_base') return 'Información base';
  }

  // 4. Redes Sociales
  if (categoria_slug === 'redes_sociales' || tipo_slug === 'redes_sociales') {
    if (key === 'fecha_sugerida') return 'Fecha sugerida de publicación';
    if (key === 'texto_copy') return 'Texto / Copy propuesto';
    if (key === 'enlaces_referencia') return 'Enlaces de referencia';
  }

  // 5. Producción Audiovisual
  if (categoria_slug === 'produccion_audiovisual' || tipo_slug === 'produccion_audiovisual') {
    if (key === 'tipo_produccion') return 'Tipo de producción';
    if (key === 'formato') return 'Formato de video';
    if (key === 'descripcion_objetivo') return 'Descripción y objetivo';
    if (key === 'fecha_limite') return 'Fecha límite de entrega';
    if (key === 'grabacion_fecha') return 'Fecha de grabación';
    if (key === 'grabacion_hora') return 'Horario de grabación';
    if (key === 'grabacion_lugar') return 'Lugar de grabación';
    if (key === 'grabacion_ciudad') return 'Ciudad de grabación';
    if (key === 'material_enlace') return 'Enlace a material';
  }

  // 6. Animación y Motion Graphics
  if (categoria_slug === 'motion_graphics' || tipo_slug === 'motion_graphics') {
    if (key === 'tipo_motion') return 'Tipo de animación';
    if (key === 'formato') return 'Formato visual';
    if (key === 'texto_contenido') return 'Texto / Títulos a incluir';
    if (key === 'descripcion') return 'Descripción del requerimiento';
    if (key === 'fecha_limite') return 'Fecha límite de entrega';
    if (key === 'duracion_aprox') return 'Duración aproximada';
    if (key === 'referencias') return 'Referencias visuales';
  }

  // 7. Streaming
  if (categoria_slug === 'streaming' || tipo_slug === 'streaming') {
    if (key === 'tipo_streaming') return 'Tipo de requerimiento';
    if (key === 'nombre_evento') return 'Nombre del evento / actividad';
    if (key === 'fecha') return 'Fecha de la transmisión';
    if (key === 'hora_inicio') return 'Hora de inicio';
    if (key === 'hora_fin') return 'Hora estimada de fin';
    if (key === 'modalidad') return 'Modalidad';
    if (key === 'participantes_estimados') return 'Cantidad estimada de participantes';
    if (key === 'lugar') return 'Lugar de la transmisión';
    if (key === 'ciudad') return 'Ciudad';
    if (key === 'descripcion_requerimientos') return 'Requerimientos técnicos';
  }

  // 8. Sitios Web
  if (categoria_slug === 'sitios_web' || tipo_slug === 'sitios_web') {
    if (key === 'tipo_web') return 'Tipo de solicitud web';
    if (key === 'descripcion_objetivo') return 'Descripción y objetivo';
    if (key === 'pagina_existente') return '¿Página existente?';
    if (key === 'url_pagina') return 'Dirección web / URL actual';
    if (key === 'contenido_cambios') return 'Contenidos / Cambios solicitados';
    if (key === 'fecha_limite') return 'Fecha límite de puesta en línea';
    if (key === 'enlaces_referencia') return 'Enlaces de referencia';
  }

  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const Step4Resumen: React.FC<Step4ResumenProps> = ({
  state,
  pieces,
  onGoToStep,
  onToggleConfirmado,
  onSubmit,
  onBack,
  errors,
}) => {
  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>4. Revisá y enviá</h2>
      </div>

      {state.submission_error && (
        <div className="pedidos-error-banner" role="alert">
          <strong>No se pudo completar el envío:</strong> {state.submission_error}
        </div>
      )}

      {/* Bloque 1: Datos de Contacto */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>Datos del solicitante</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(1)}>
            Editar
          </button>
        </div>
        <div className="pedidos-summary-grid">
          <div className="pedidos-summary-item">
            <span className="label">Nombre y apellido:</span>
            <strong>{state.contacto.nombre_apellido}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Número de WhatsApp:</span>
            <strong>{formatPhoneForDisplay(state.contacto.telefono)}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Correo oficial:</span>
            <strong>{state.contacto.correo}</strong>
          </div>
          <div className="pedidos-summary-item">
            <span className="label">Área / Dependencia:</span>
            <strong>{state.contacto.area_solicitante}</strong>
          </div>
        </div>
      </div>

      {/* Bloque 2: Solicitudes y Piezas Requeridas (Multi-PED) */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>Solicitudes ({pieces.length} PED{pieces.length > 1 ? 's' : ''})</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(2)}>
            Editar
          </button>
        </div>

        <div className="pedidos-summary-pieces-list">
          {pieces.map((p, idx) => {
            const dataObj = p.data as Record<string, unknown>;
            const hasAsesoramiento = Boolean(dataObj.requiere_asesoramiento);

            return (
              <div key={p.client_request_ref} className="pedidos-summary-piece-card">
                <div className="pedidos-summary-piece-header">
                  <span className="pedidos-piece-number">#{idx + 1}</span>
                  <strong className="pedidos-piece-title">{p.piece_title}</strong>
                </div>

                <div className="pedidos-summary-piece-details">
                  {hasAsesoramiento ? (
                    <div className="pedidos-asesoramiento-badge-row">
                      <span className="pedidos-badge-pill highlight">Requiere asesoramiento</span>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                        <strong>Objetivo:</strong> {String(dataObj.objetivo_asesoramiento || '')}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        Canal de contacto preferido:{' '}
                        {dataObj.contacto_preferido === 'email' ? 'Correo electrónico' : 'WhatsApp'}
                      </p>
                    </div>
                  ) : (
                    <ul className="pedidos-piece-fields-list">
                      {Object.entries(dataObj).map(([key, val]) => {
                        if (
                          !val ||
                          typeof val === 'object' ||
                          key === 'requiere_asesoramiento' ||
                          key === 'asiste_autoridades' ||
                          (key === 'autoridades' && String(val).trim() === '')
                        ) {
                          return null;
                        }
                        const label = getPieceFieldLabel(p, key);
                        return (
                          <li key={key}>
                            <span className="field-name">{label}:</span>
                            <span className="field-val">{String(val)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloque 3: Archivos y Enlaces */}
      <div className="pedidos-summary-block">
        <div className="pedidos-summary-header">
          <h3>Archivos y enlaces</h3>
          <button type="button" className="pedidos-btn-link" onClick={() => onGoToStep(3)}>
            Editar
          </button>
        </div>

        <div className="pedidos-summary-files-section">
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
              Archivos ({state.archivos.length}):
            </strong>
            {state.archivos.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', margin: '0.25rem 0 0 0' }}>
                No se adjuntaron archivos binarios.
              </p>
            ) : (
              <ul className="pedidos-summary-list">
                {state.archivos.map((a) => {
                  const targetLabel =
                    a.targets === 'all'
                      ? 'Todas las solicitudes'
                      : pieces.find((p) => p.client_request_ref === a.targets[0])?.piece_title || 'Específica';
                  return (
                    <li key={a.client_file_ref}>
                      📄 <strong>{a.name}</strong> ({(a.size / (1024 * 1024)).toFixed(2)} MB) —{' '}
                      <span style={{ color: '#0369a1' }}>Destino: {targetLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
              Enlaces ({state.links.length}):
            </strong>
            {state.links.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', margin: '0.25rem 0 0 0' }}>
                No se incluyeron enlaces externos.
              </p>
            ) : (
              <ul className="pedidos-summary-list">
                {state.links.map((l) => {
                  const targetLabel =
                    l.targets === 'all'
                      ? 'Todas las solicitudes'
                      : pieces.find((p) => p.client_request_ref === l.targets[0])?.piece_title || 'Específica';
                  return (
                    <li key={l.id}>
                      🔗 <strong>{l.url}</strong> {l.descripcion && `(${l.descripcion})`} —{' '}
                      <span style={{ color: '#0369a1' }}>Destino: {targetLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bloque 4: Declaración y Confirmación */}
      <div className="pedidos-confirm-card">
        <label className="pedidos-checkbox-label">
          <input
            type="checkbox"
            checked={state.confirmado}
            onChange={(e) => onToggleConfirmado(e.target.checked)}
            disabled={state.submitting}
          />
          <span className="pedidos-checkbox-text">
            <strong>Revisé los datos y son correctos.</strong>
          </span>
        </label>
        {errors.confirmado && (
          <span className="pedidos-error-text" role="alert" style={{ display: 'block', marginTop: '0.5rem' }}>
            {errors.confirmado}
          </span>
        )}
      </div>

      <div className="pedidos-step-actions">
        <button
          type="button"
          className="pedidos-btn pedidos-btn-secondary"
          onClick={onBack}
          disabled={state.submitting}
        >
          Atrás
        </button>
        <button
          type="button"
          className="pedidos-btn pedidos-btn-success"
          onClick={onSubmit}
          disabled={state.submitting || !state.confirmado}
          style={{ minWidth: '200px' }}
        >
          {state.submitting
            ? 'Enviando...'
            : pieces.length > 1
            ? 'Enviar solicitudes'
            : 'Enviar solicitud'}
        </button>
      </div>
    </div>
  );
};
