import React from 'react';
import {
  FormWizardState,
  FormPieceItem,
  DisenoPiezaSlug,
  FlyerRrssData,
  InvitacionDigitalData,
  CertificadoData,
  OtrosDisenoData,
  CoberturaEventosData,
  GacetillaData,
  RedesSocialesData,
  ProduccionAudiovisualData,
  MotionGraphicsData,
  StreamingData,
  SitiosWebData,
} from '../../types/form';
import { ValidationErrors } from '../../validation/formValidation';
import { DisenoGraficoForm } from './DisenoGraficoForm';
import { CoberturaEventosForm } from './CoberturaEventosForm';
import { GacetillaForm } from './GacetillaForm';
import { RedesSocialesForm } from './RedesSocialesForm';
import { ProduccionAudiovisualForm } from './ProduccionAudiovisualForm';
import { MotionGraphicsForm } from './MotionGraphicsForm';
import { StreamingForm } from './StreamingForm';
import { SitiosWebForm } from './SitiosWebForm';

interface Step2ServiciosProps {
  state: FormWizardState;
  availablePieces: FormPieceItem[];
  onChangeTituloPedido: (tipoSlug: string, title: string) => void;
  onToggleDisenoPieza: (pieza: DisenoPiezaSlug) => void;
  onChangeFlyer: (data: Partial<FlyerRrssData>) => void;
  onChangeInvitacion: (data: Partial<InvitacionDigitalData>) => void;
  onChangeCertificado: (data: Partial<CertificadoData>) => void;
  onChangeOtrosDiseno: (data: Partial<OtrosDisenoData>) => void;
  onChangeCobertura: (data: Partial<CoberturaEventosData>) => void;
  onChangeGacetilla: (data: Partial<GacetillaData>) => void;
  onChangeRedes: (data: Partial<RedesSocialesData>) => void;
  onChangeAudiovisual: (data: Partial<ProduccionAudiovisualData>) => void;
  onChangeMotion: (data: Partial<MotionGraphicsData>) => void;
  onChangeStreaming: (data: Partial<StreamingData>) => void;
  onChangeWeb: (data: Partial<SitiosWebData>) => void;
  onGoToStep1: () => void;
  errors: ValidationErrors;
  onNext: () => void;
  onBack: () => void;
}

export const Step2Servicios: React.FC<Step2ServiciosProps> = ({
  state,
  availablePieces,
  onChangeTituloPedido,
  onToggleDisenoPieza,
  onChangeFlyer,
  onChangeInvitacion,
  onChangeCertificado,
  onChangeOtrosDiseno,
  onChangeCobertura,
  onChangeGacetilla,
  onChangeRedes,
  onChangeAudiovisual,
  onChangeMotion,
  onChangeStreaming,
  onChangeWeb,
  onGoToStep1,
  errors,
  onNext,
  onBack,
}) => {
  return (
    <div className="pedidos-step-container">
      <div className="pedidos-step-header">
        <h2>2. Detalle de la solicitud</h2>
      </div>

      {state.selected_categorias.includes('diseno_grafico') && (
        <DisenoGraficoForm
          selectedPiezas={state.diseno_piezas}
          onTogglePieza={onToggleDisenoPieza}
          flyerData={state.diseno_data?.flyer_rrss || { formato: '', texto: '', fecha_limite: '' }}
          onChangeFlyer={onChangeFlyer}
          invitacionData={
            state.diseno_data?.invitacion_digital || {
              nombre_evento: '',
              fecha: '',
              hora: '',
              lugar: '',
              modalidad: '',
              programa: '',
            }
          }
          onChangeInvitacion={onChangeInvitacion}
          certificadoData={
            state.diseno_data?.certificado || {
              nombre_actividad: '',
              firmantes: '',
              destinatarios: '',
            }
          }
          onChangeCertificado={onChangeCertificado}
          otrosData={state.diseno_data?.otros_diseno || { descripcion: '', medidas_soporte: '' }}
          onChangeOtros={onChangeOtrosDiseno}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('cobertura_eventos') && (
        <CoberturaEventosForm
          data={
            state.cobertura_data || {
              nombre_evento: '',
              fecha: '',
              hora_inicio: '',
              hora_fin: '',
              lugar: '',
              ciudad: '',
              asiste_autoridades: '',
              autoridades: '',
              requerimientos: '',
            }
          }
          onChange={onChangeCobertura}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('gacetilla') && (
        <GacetillaForm
          data={
            state.gacetilla_data || {
              referente_contacto: '',
              telefono_contacto: '',
              informacion_base: '',
            }
          }
          onChange={onChangeGacetilla}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('redes_sociales') && (
        <RedesSocialesForm
          data={
            state.redes_data || {
              fecha_sugerida: '',
              texto_copy: '',
              enlaces_referencia: '',
            }
          }
          onChange={onChangeRedes}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('produccion_audiovisual') && (
        <ProduccionAudiovisualForm
          data={state.audiovisual_data || { requiere_asesoramiento: false }}
          contacto={state.contacto}
          onChange={onChangeAudiovisual}
          onEditContacto={onGoToStep1}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('motion_graphics') && (
        <MotionGraphicsForm
          data={state.motion_data || { requiere_asesoramiento: false }}
          contacto={state.contacto}
          onChange={onChangeMotion}
          onEditContacto={onGoToStep1}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('streaming') && (
        <StreamingForm
          data={state.streaming_data || { requiere_asesoramiento: false }}
          contacto={state.contacto}
          onChange={onChangeStreaming}
          onEditContacto={onGoToStep1}
          errors={errors}
        />
      )}

      {state.selected_categorias.includes('sitios_web') && (
        <SitiosWebForm
          data={state.web_data || { requiere_asesoramiento: false }}
          contacto={state.contacto}
          onChange={onChangeWeb}
          onEditContacto={onGoToStep1}
          errors={errors}
        />
      )}

      {availablePieces.length > 0 && (
        <section aria-label="Títulos de los pedidos" style={{ marginTop: '1.25rem' }}>
          <h3>Identificá cada pedido</h3>
          <p>Ingresá un título para cada pieza o servicio solicitado.</p>
          {availablePieces.map((piece) => {
            const inputId = `titulo-pedido-${piece.tipo_slug}`;
            const error = errors[`titulo_pedido.${piece.tipo_slug}`];
            return (
              <div key={piece.client_request_ref} style={{ marginBottom: '1rem' }}>
                <label htmlFor={inputId} style={{ display: 'block', fontWeight: 600 }}>
                  Título del pedido · {piece.piece_title} (obligatorio)
                </label>
                <input
                  id={inputId}
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  value={state.titulos_pedidos?.[piece.tipo_slug] || ''}
                  onChange={(e) => onChangeTituloPedido(piece.tipo_slug, e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  placeholder="Ej.: Campaña de vacunación de noviembre"
                  style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: '0.55rem', borderRadius: '0.375rem', border: '1px solid var(--pedidos-control-border, #cbd5e1)', background: 'var(--pedidos-control-bg, #fff)', color: 'var(--pedidos-control-text, #1e293b)' }}
                />
                {error && <p id={`${inputId}-error`} role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
              </div>
            );
          })}
        </section>
      )}

      <div className="pedidos-step-actions">
        <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={onBack}>
          Atrás
        </button>
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNext}>
          Continuar
        </button>
      </div>
    </div>
  );
};
