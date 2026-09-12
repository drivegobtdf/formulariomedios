import React from 'react';
import {
  FormWizardState,
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
        <h2>2. Detalle y Especificación de Servicios</h2>
        <p>
          Completá los requerimientos técnicos y detalles de cada una de las categorías seleccionadas.
        </p>
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
              fecha: '',
              hora_inicio: '',
              hora_fin: '',
              lugar: '',
              ciudad: '',
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

      <div className="pedidos-step-actions">
        <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={onBack}>
          ← Volver al Contacto
        </button>
        <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={onNext}>
          Continuar a Adjuntos y Enlaces →
        </button>
      </div>
    </div>
  );
};
