import React, { useState, useMemo, useCallback } from 'react';
import { getPublicConfig } from '../services/config';
import {
  FormWizardState,
  CategoriaSlug,
  DisenoPiezaSlug,
  FormPieceItem,
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
  FormUploadedFile,
  FormLinkItem,
  SubmissionPayload,
} from '../types/form';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  revalidateErrors,
  ValidationErrors,
} from '../validation/formValidation';
import {
  prepareSubmissionSession,
  uploadFileToDrive,
  submitMultiPedFormulario,
} from '../services/formApi';
import { StepIndicator } from '../components/form/StepIndicator';
import { Step1Contacto } from '../components/form/Step1Contacto';
import { Step2Servicios } from '../components/form/Step2Servicios';
import { Step3Adjuntos } from '../components/form/Step3Adjuntos';
import { Step4Resumen } from '../components/form/Step4Resumen';
import { Step5Resultado } from '../components/form/Step5Resultado';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const INITIAL_STATE: FormWizardState = {
  submission_key: generateUUID(),
  current_step: 1,
  contacto: {
    nombre_apellido: '',
    telefono: '',
    correo: '',
    area_solicitante: '',
  },
  selected_categorias: [],
  diseno_piezas: [],
  diseno_data: {
    flyer_rrss: { formato: '', texto: '', fecha_limite: '' },
    invitacion_digital: { nombre_evento: '', fecha: '', hora: '', lugar: '', modalidad: '', programa: '' },
    certificado: { nombre_actividad: '', firmantes: '', destinatarios: '' },
    otros_diseno: { descripcion: '', medidas_soporte: '' },
  },
  cobertura_data: { fecha: '', hora_inicio: '', hora_fin: '', lugar: '', ciudad: '', asiste_autoridades: '', autoridades: '', requerimientos: '' },
  gacetilla_data: { referente_contacto: '', telefono_contacto: '', informacion_base: '' },
  redes_data: { fecha_sugerida: '', texto_copy: '', enlaces_referencia: '' },
  audiovisual_data: { requiere_asesoramiento: false },
  motion_data: { requiere_asesoramiento: false },
  streaming_data: { requiere_asesoramiento: false },
  web_data: { requiere_asesoramiento: false },
  archivos: [],
  links: [],
  confirmado: false,
  submitting: false,
};

export interface FormularioPublicoPageProps {
  initialShowWizard?: boolean;
}

export const FormularioPublicoPage: React.FC<FormularioPublicoPageProps> = ({ initialShowWizard = false }) => {
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    if (initialShowWizard) return true;
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('solicitar') || hash.includes('wizard') || hash.includes('iniciar') || hash.includes('nueva')) {
        return true;
      }
    }
    return false;
  });

  const [state, setState] = useState<FormWizardState>(INITIAL_STATE);
  const [maxStepVisited, setMaxStepVisited] = useState<number>(1);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Mapa de UUIDs estables por pieza
  const [pieceRefs] = useState<Record<string, string>>(() => ({
    flyer_rrss: generateUUID(),
    invitacion_digital: generateUUID(),
    certificado: generateUUID(),
    otros_diseno: generateUUID(),
    cobertura_eventos: generateUUID(),
    gacetilla: generateUUID(),
    redes_sociales: generateUUID(),
    produccion_audiovisual: generateUUID(),
    motion_graphics: generateUUID(),
    streaming: generateUUID(),
    sitios_web: generateUUID(),
  }));

  const isFormDirty = useMemo(() => {
    return Boolean(
      state.contacto.nombre_apellido.trim() ||
      state.contacto.correo.trim() ||
      state.contacto.telefono.trim() ||
      state.contacto.area_solicitante.trim() ||
      state.selected_categorias.length > 0 ||
      state.archivos.length > 0 ||
      state.links.length > 0
    );
  }, [state]);

  const handleStartWizard = useCallback(() => {
    setShowWizard(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleBackToHome = useCallback(() => {
    if (state.current_step === 5) {
      handleNewSubmission();
      setShowWizard(false);
      return;
    }
    if (isFormDirty) {
      if (window.confirm('¿Desea volver a la portada institucional? Los datos ingresados se mantendrán guardados en memoria.')) {
        setShowWizard(false);
      }
    } else {
      setShowWizard(false);
    }
  }, [state.current_step, isFormDirty]);

  // Lista de piezas activas calculada
  const availablePieces = useMemo<FormPieceItem[]>(() => {
    const list: FormPieceItem[] = [];

    if (state.selected_categorias.includes('diseno_grafico')) {
      if (state.diseno_piezas.includes('flyer_rrss')) {
        list.push({
          client_request_ref: pieceRefs.flyer_rrss,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          piece_title: 'Flyer para redes sociales',
          codigo_ped_prefijo: 'D',
          data: state.diseno_data.flyer_rrss || {},
        });
      }
      if (state.diseno_piezas.includes('invitacion_digital')) {
        list.push({
          client_request_ref: pieceRefs.invitacion_digital,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'invitacion_digital',
          piece_title: 'Invitación digital',
          codigo_ped_prefijo: 'D',
          data: state.diseno_data.invitacion_digital || {},
        });
      }
      if (state.diseno_piezas.includes('certificado')) {
        list.push({
          client_request_ref: pieceRefs.certificado,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'certificado',
          piece_title: 'Certificados y diplomas',
          codigo_ped_prefijo: 'D',
          data: state.diseno_data.certificado || {},
        });
      }
      if (state.diseno_piezas.includes('otros_diseno')) {
        list.push({
          client_request_ref: pieceRefs.otros_diseno,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'otros_diseno',
          piece_title: 'Otros requerimientos gráficos',
          codigo_ped_prefijo: 'D',
          data: state.diseno_data.otros_diseno || {},
        });
      }
    }

    if (state.selected_categorias.includes('cobertura_eventos')) {
      list.push({
        client_request_ref: pieceRefs.cobertura_eventos,
        categoria_slug: 'cobertura_eventos',
        tipo_slug: 'cobertura_eventos',
        piece_title: 'Cobertura de eventos',
        codigo_ped_prefijo: 'C',
        data: state.cobertura_data || {},
      });
    }

    if (state.selected_categorias.includes('gacetilla')) {
      list.push({
        client_request_ref: pieceRefs.gacetilla,
        categoria_slug: 'gacetilla',
        tipo_slug: 'gacetilla',
        piece_title: 'Gacetilla de prensa',
        codigo_ped_prefijo: 'G',
        data: state.gacetilla_data || {},
      });
    }

    if (state.selected_categorias.includes('redes_sociales')) {
      list.push({
        client_request_ref: pieceRefs.redes_sociales,
        categoria_slug: 'redes_sociales',
        tipo_slug: 'redes_sociales',
        piece_title: 'Publicaciones en redes sociales',
        codigo_ped_prefijo: 'R',
        data: state.redes_data || {},
      });
    }

    if (state.selected_categorias.includes('produccion_audiovisual')) {
      list.push({
        client_request_ref: pieceRefs.produccion_audiovisual,
        categoria_slug: 'produccion_audiovisual',
        tipo_slug: 'produccion_audiovisual',
        piece_title: 'Producción audiovisual',
        codigo_ped_prefijo: 'P',
        data: state.audiovisual_data || {},
      });
    }

    if (state.selected_categorias.includes('motion_graphics')) {
      list.push({
        client_request_ref: pieceRefs.motion_graphics,
        categoria_slug: 'motion_graphics',
        tipo_slug: 'motion_graphics',
        piece_title: 'Animación y motion graphics',
        codigo_ped_prefijo: 'M',
        data: state.motion_data || {},
      });
    }

    if (state.selected_categorias.includes('streaming')) {
      list.push({
        client_request_ref: pieceRefs.streaming,
        categoria_slug: 'streaming',
        tipo_slug: 'streaming',
        piece_title: 'Transmisión en vivo / streaming',
        codigo_ped_prefijo: 'S',
        data: state.streaming_data || {},
      });
    }

    if (state.selected_categorias.includes('sitios_web')) {
      list.push({
        client_request_ref: pieceRefs.sitios_web,
        categoria_slug: 'sitios_web',
        tipo_slug: 'sitios_web',
        piece_title: 'Sitios y contenidos web',
        codigo_ped_prefijo: 'W',
        data: state.web_data || {},
      });
    }

    return list;
  }, [state, pieceRefs]);

  // Actualizadores de Estado reactivos
  const updateContacto = (fields: Partial<typeof state.contacto>) => {
    setState((prev) => {
      const nextContacto = { ...prev.contacto, ...fields };
      const nextState = { ...prev, contacto: nextContacto };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep1(nextContacto, prev.selected_categorias);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const toggleCategoria = (slug: CategoriaSlug) => {
    setState((prev) => {
      const exists = prev.selected_categorias.includes(slug);
      const nextCats = exists
        ? prev.selected_categorias.filter((c) => c !== slug)
        : [...prev.selected_categorias, slug];
      const nextState = { ...prev, selected_categorias: nextCats };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep1(prev.contacto, nextCats);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const toggleDisenoPieza = (pieza: DisenoPiezaSlug) => {
    setState((prev) => {
      const exists = prev.diseno_piezas.includes(pieza);
      const nextPiezas = exists
        ? prev.diseno_piezas.filter((p) => p !== pieza)
        : [...prev.diseno_piezas, pieza];
      const nextState = { ...prev, diseno_piezas: nextPiezas };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateFlyer = (data: Partial<FlyerRrssData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        diseno_data: {
          ...prev.diseno_data,
          flyer_rrss: { ...(prev.diseno_data.flyer_rrss || { formato: '', texto: '', fecha_limite: '' }), ...data },
        },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateInvitacion = (data: Partial<InvitacionDigitalData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        diseno_data: {
          ...prev.diseno_data,
          invitacion_digital: {
            ...(prev.diseno_data.invitacion_digital || {
              nombre_evento: '',
              fecha: '',
              hora: '',
              lugar: '',
              modalidad: '',
              programa: '',
            }),
            ...data,
          },
        },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateCertificado = (data: Partial<CertificadoData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        diseno_data: {
          ...prev.diseno_data,
          certificado: {
            ...(prev.diseno_data.certificado || { nombre_actividad: '', firmantes: '', destinatarios: '' }),
            ...data,
          },
        },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateOtrosDiseno = (data: Partial<OtrosDisenoData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        diseno_data: {
          ...prev.diseno_data,
          otros_diseno: {
            ...(prev.diseno_data.otros_diseno || { descripcion: '', medidas_soporte: '' }),
            ...data,
          },
        },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateCobertura = (data: Partial<CoberturaEventosData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        cobertura_data: { ...(prev.cobertura_data || { fecha: '', hora_inicio: '', lugar: '', ciudad: '', asiste_autoridades: '', autoridades: '', requerimientos: '' }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateGacetilla = (data: Partial<GacetillaData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        gacetilla_data: { ...(prev.gacetilla_data || { referente_contacto: '', telefono_contacto: '', informacion_base: '' }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateRedes = (data: Partial<RedesSocialesData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        redes_data: { ...(prev.redes_data || { fecha_sugerida: '', texto_copy: '' }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateAudiovisual = (data: Partial<ProduccionAudiovisualData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        audiovisual_data: { ...(prev.audiovisual_data || { requiere_asesoramiento: false }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateMotion = (data: Partial<MotionGraphicsData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        motion_data: { ...(prev.motion_data || { requiere_asesoramiento: false }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateStreaming = (data: Partial<StreamingData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        streaming_data: { ...(prev.streaming_data || { requiere_asesoramiento: false }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const updateWeb = (data: Partial<SitiosWebData>) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        web_data: { ...(prev.web_data || { requiere_asesoramiento: false }), ...data },
      };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep2(nextState);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  // Manejo de Archivos y Subida Directa
  const ensureSession = useCallback(async (): Promise<{ sessionId: string; capabilityToken: string }> => {
    if (state.session_id && state.capability_token) {
      return { sessionId: state.session_id, capabilityToken: state.capability_token };
    }
    const session = await prepareSubmissionSession(state.submission_key);
    setState((prev) => ({
      ...prev,
      session_id: session.session_id,
      capability_token: session.capability_token,
    }));
    return { sessionId: session.session_id, capabilityToken: session.capability_token };
  }, [state.session_id, state.capability_token, state.submission_key]);

  const handleAddFiles = async (filesToAdd: File[]) => {
    try {
      const { sessionId, capabilityToken } = await ensureSession();

      for (const file of filesToAdd) {
        const clientFileRef = generateUUID();
        const initialFileItem: FormUploadedFile = {
          client_file_ref: clientFileRef,
          file,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          status: 'uploading',
          progress: 10,
          targets: 'all',
        };

        setState((prev) => ({
          ...prev,
          archivos: [...prev.archivos, initialFileItem],
        }));

        // Iniciar subida asíncrona
        uploadFileToDrive(
          sessionId,
          capabilityToken,
          clientFileRef,
          file,
          (progressPct) => {
            setState((prev) => ({
              ...prev,
              archivos: prev.archivos.map((a) =>
                a.client_file_ref === clientFileRef ? { ...a, progress: progressPct } : a
              ),
            }));
          }
        )
          .then((res) => {
            setState((prev) => ({
              ...prev,
              archivos: prev.archivos.map((a) =>
                a.client_file_ref === clientFileRef
                  ? {
                      ...a,
                      status: 'verified',
                      progress: 100,
                      client_file_ref: res.client_file_ref || a.client_file_ref,
                      archivo_id: res.archivo_id,
                      drive_file_id: res.drive_file_id,
                      reservation_id: res.reservation_id,
                    }
                  : a
              ),
            }));
          })
          .catch((err) => {
            setState((prev) => ({
              ...prev,
              archivos: prev.archivos.map((a) =>
                a.client_file_ref === clientFileRef
                  ? { ...a, status: 'error', error_message: err.message || 'Error de subida' }
                  : a
              ),
            }));
          });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors((prev) => ({
        ...prev,
        archivos: `Error al preparar sesión de almacenamiento: ${msg}`,
      }));
    }
  };

  const handleRetryFile = async (index: number) => {
    const fileItem = state.archivos[index];
    if (!fileItem || !fileItem.file) return;

    try {
      const { sessionId, capabilityToken } = await ensureSession();
      setState((prev) => ({
        ...prev,
        archivos: prev.archivos.map((a, i) =>
          i === index
            ? { ...a, status: 'uploading', progress: 10, error_message: undefined }
            : a
        ),
      }));

      uploadFileToDrive(
        sessionId,
        capabilityToken,
        fileItem.client_file_ref,
        fileItem.file,
        (progressPct) => {
          setState((prev) => ({
            ...prev,
            archivos: prev.archivos.map((a, i) =>
              i === index ? { ...a, progress: progressPct } : a
            ),
          }));
        }
      )
        .then((res) => {
          setState((prev) => ({
            ...prev,
            archivos: prev.archivos.map((a, i) =>
              i === index
                ? {
                    ...a,
                    status: 'verified',
                    progress: 100,
                    client_file_ref: res.client_file_ref || a.client_file_ref,
                    archivo_id: res.archivo_id,
                    drive_file_id: res.drive_file_id,
                    reservation_id: res.reservation_id,
                  }
                : a
            ),
          }));
        })
        .catch((err) => {
          setState((prev) => ({
            ...prev,
            archivos: prev.archivos.map((a, i) =>
              i === index
                ? { ...a, status: 'error', error_message: err.message || 'Error de subida' }
                : a
            ),
          }));
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        archivos: prev.archivos.map((a, i) =>
          i === index
            ? { ...a, status: 'error', error_message: `Error preparando sesión: ${msg}` }
            : a
        ),
      }));
    }
  };

  const handleRemoveFile = (index: number) => {
    setState((prev) => {
      const nextArchivos = prev.archivos.filter((_, i) => i !== index);
      const nextState = { ...prev, archivos: nextArchivos };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep3(nextArchivos, prev.links);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const handleChangeFileTarget = (index: number, target: 'all' | string) => {
    setState((prev) => ({
      ...prev,
      archivos: prev.archivos.map((a, i) =>
        i === index ? { ...a, targets: target === 'all' ? 'all' : [target] } : a
      ),
    }));
  };

  // Manejo de Enlaces
  const handleAddLink = () => {
    setState((prev) => ({
      ...prev,
      links: [
        ...prev.links,
        {
          id: generateUUID(),
          url: '',
          descripcion: '',
          targets: 'all',
        },
      ],
    }));
  };

  const handleRemoveLink = (index: number) => {
    setState((prev) => {
      const nextLinks = prev.links.filter((_, i) => i !== index);
      const nextState = { ...prev, links: nextLinks };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep3(prev.archivos, nextLinks);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  const handleChangeLink = (index: number, fields: Partial<FormLinkItem>) => {
    setState((prev) => {
      const nextLinks = prev.links.map((l, i) => (i === index ? { ...l, ...fields } : l));
      const nextState = { ...prev, links: nextLinks };
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const freshErrors = validateStep3(prev.archivos, nextLinks);
        return revalidateErrors(prevErrors, freshErrors);
      });
      return nextState;
    });
  };

  // Navegación del Wizard
  const goToStep = (step: number) => {
    setState((prev) => ({ ...prev, current_step: step }));
    if (step > maxStepVisited) setMaxStepVisited(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep1 = () => {
    const errs = validateStep1(state.contacto, state.selected_categorias);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    goToStep(2);
  };

  const handleNextStep2 = () => {
    const errs = validateStep2(state);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    goToStep(3);
  };

  const handleNextStep3 = () => {
    const errs = validateStep3(state.archivos, state.links);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    goToStep(4);
  };

  // Envío Final Multi-PED
  const handleSubmit = async () => {
    const errs = validateStep4(state.confirmado);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setState((prev) => ({ ...prev, submitting: true, submission_error: undefined }));

    try {
      const payload: SubmissionPayload = {
        schema_version: 3,
        submission_key: state.submission_key,
        session_id: state.session_id,
        capability_token: state.capability_token,
        contacto: state.contacto,
        pedidos: availablePieces.map((p) => ({
          client_request_ref: p.client_request_ref,
          categoria_slug: p.categoria_slug,
          tipo_slug: p.tipo_slug,
          informacion_especifica: p.data,
        })),
        file_bindings: state.archivos
          .filter((a) => a.status === 'verified')
          .map((a) => ({
            client_file_ref: a.client_file_ref,
            expected_name: a.name,
            expected_size: a.size,
            mime_type: a.mime,
            targets: a.targets,
          })),
        material_links: state.links.map((l) => ({
          url: l.url,
          descripcion: l.descripcion,
          targets: l.targets,
        })),
      };

      const result = await submitMultiPedFormulario(payload, state.capability_token);

      setState((prev) => ({
        ...prev,
        submitting: false,
        submission_result: result,
        current_step: 5,
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        submitting: false,
        submission_error: msg || 'Ocurrió un error inesperado al enviar las solicitudes.',
      }));
    }
  };

  const handleNewSubmission = () => {
    setState({
      ...INITIAL_STATE,
      submission_key: generateUUID(),
    });
    setMaxStepVisited(1);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!showWizard) {
    return (
      <div className="pedidos-home-view">
        <section className="pedidos-home-hero" aria-label="Portada institucional del sistema">
          <div className="pedidos-hero-badge">
            SISTEMA OFICIAL DE PEDIDOS
          </div>

          <h1 className="pedidos-hero-title">
            Solicitud de Comunicación y Medios
          </h1>

          <div className="pedidos-hero-actions">
            <button
              type="button"
              className="pedidos-btn-hero-primary"
              onClick={handleStartWizard}
              aria-label="Iniciar nueva solicitud"
            >
              + Nueva solicitud
            </button>
            <a
              href={`${getPublicConfig().basePath}/mis-solicitudes`}
              className="pedidos-btn-hero-secondary"
              aria-label="Mis solicitudes"
            >
              Mis solicitudes
            </a>
          </div>

          <div className="pedidos-flow-guide">
            <div className="pedidos-flow-step">
              <div className="pedidos-flow-step-header">
                <span className="pedidos-flow-step-num">1</span>
                <h4>Cargá tu pedido</h4>
              </div>
            </div>

            <div className="pedidos-flow-step">
              <div className="pedidos-flow-step-header">
                <span className="pedidos-flow-step-num">2</span>
                <h4>Seguí el avance</h4>
              </div>
            </div>

            <div className="pedidos-flow-step">
              <div className="pedidos-flow-step-header">
                <span className="pedidos-flow-step-num">3</span>
                <h4>Recibí el material</h4>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="pedidos-wizard-view">
      <div className="pedidos-wizard-header-nav">
        <button
          type="button"
          className="pedidos-btn-back-home"
          onClick={handleBackToHome}
          aria-label="Volver a la portada"
        >
          &larr; Volver
        </button>
      </div>

      <StepIndicator
        currentStep={state.current_step}
        onStepClick={(step) => goToStep(step)}
        maxStepVisited={maxStepVisited}
      />

      {state.current_step === 1 && (
        <Step1Contacto
          contacto={state.contacto}
          onChangeContacto={updateContacto}
          selectedCategorias={state.selected_categorias}
          onToggleCategoria={toggleCategoria}
          errors={errors}
          onNext={handleNextStep1}
        />
      )}

      {state.current_step === 2 && (
        <Step2Servicios
          state={state}
          onToggleDisenoPieza={toggleDisenoPieza}
          onChangeFlyer={updateFlyer}
          onChangeInvitacion={updateInvitacion}
          onChangeCertificado={updateCertificado}
          onChangeOtrosDiseno={updateOtrosDiseno}
          onChangeCobertura={updateCobertura}
          onChangeGacetilla={updateGacetilla}
          onChangeRedes={updateRedes}
          onChangeAudiovisual={updateAudiovisual}
          onChangeMotion={updateMotion}
          onChangeStreaming={updateStreaming}
          onChangeWeb={updateWeb}
          onGoToStep1={() => goToStep(1)}
          errors={errors}
          onNext={handleNextStep2}
          onBack={() => goToStep(1)}
        />
      )}

      {state.current_step === 3 && (
        <Step3Adjuntos
          archivos={state.archivos}
          links={state.links}
          availablePieces={availablePieces}
          onAddFiles={handleAddFiles}
          onRemoveFile={handleRemoveFile}
          onRetryFile={handleRetryFile}
          onChangeFileTarget={handleChangeFileTarget}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
          onChangeLink={handleChangeLink}
          errors={errors}
          onNext={handleNextStep3}
          onBack={() => goToStep(2)}
        />
      )}

      {state.current_step === 4 && (
        <Step4Resumen
          state={state}
          pieces={availablePieces}
          onGoToStep={(step) => goToStep(step)}
          onToggleConfirmado={(checked) => {
            setState((prev) => ({ ...prev, confirmado: checked }));
            if (checked) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.confirmado;
                return next;
              });
            }
          }}
          onSubmit={handleSubmit}
          onBack={() => goToStep(3)}
          errors={errors}
        />
      )}

      {state.current_step === 5 && state.submission_result && (
        <Step5Resultado
          result={state.submission_result}
          pieces={availablePieces}
          contacto={state.contacto}
          onNewSubmission={handleNewSubmission}
        />
      )}
    </div>
  );
};
