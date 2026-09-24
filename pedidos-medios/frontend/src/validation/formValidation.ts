/**
 * Módulo de validación para el Formulario Público (Revisión 3.0)
 * Proyecto: PEDIDOS — Secretaría de Medios
 */

import {
  FormWizardState,
  ContactoFormState,
  CategoriaSlug,
  FormUploadedFile,
  FormLinkItem,
} from '../types/form';
import {
  validateWhatsAppPhone,
  getWhatsAppDetails,
  formatPhoneForDisplay,
} from '../utils/phoneUtils';

export { validateWhatsAppPhone, getWhatsAppDetails, formatPhoneForDisplay };

export interface ValidationErrors {
  [key: string]: string;
}

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const URL_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;

/**
 * Valida si una URL es completa con protocolo explícito http:// o https://
 * Case-insensitive respecto al protocolo.
 * Bloquea cualquier otro esquema (javascript:, data:, file:, ftp:, etc.).
 */
export function isValidHttpUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const MAX_FILES_LIMIT = 10;
export const MAX_FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10,485,760 bytes

export const ALLOWED_MIME_TYPES: string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
];

export const ALLOWED_EXTENSIONS: string[] = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.zip'];

export function validateFileMetadata(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_FILE_SIZE_LIMIT) {
    return `El archivo supera el tamaño máximo permitido de 10 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) || isAllowedExt;

  if (!isAllowedMime && !isAllowedExt) {
    return `Tipo de archivo no permitido (.${ext.replace('.', '')}). Formatos permitidos: PDF, PNG, JPG, DOCX, ZIP.`;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Helpers de Validación Reactiva y Fechas Locales
// -----------------------------------------------------------------------------

export const DEFAULT_PAST_DATE_ERROR_MESSAGE = 'La fecha no puede ser anterior a hoy.';

export interface ValidateDateOptions {
  required?: boolean;
  requiredMessage?: string;
  pastMessage?: string;
  refDate?: Date;
}

/**
 * Obtiene la fecha local actual en formato YYYY-MM-DD sin desfasaje por UTC.
 */
export function getLocalTodayDateString(refDate: Date = new Date()): string {
  const year = refDate.getFullYear();
  const month = String(refDate.getMonth() + 1).padStart(2, '0');
  const day = String(refDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida si una fecha YYYY-MM-DD es anterior a la fecha local del día de la solicitud.
 * Regla:
 * - date < today_local -> true (inválida)
 * - date == today_local -> false (válida)
 * - date > today_local -> false (válida)
 */
export function isDateBeforeToday(dateStr: string, refDate: Date = new Date()): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return false;
  }
  const todayStr = getLocalTodayDateString(refDate);
  return dateStr.trim() < todayStr;
}

/**
 * Valida centralizadamente un campo de fecha operativa para nuevas solicitudes públicas.
 * Reglas:
 * 1. Si está vacía y required = true (por defecto true) -> error requiredMessage.
 * 2. Si está vacía y required = false -> válido (null).
 * 3. Si no cumple formato YYYY-MM-DD o fecha de calendario no existe -> error de formato/calendario.
 * 4. Si la fecha es anterior a hoy (civil YYYY-MM-DD) -> error pastMessage ('La fecha no puede ser anterior a hoy.').
 * 5. Si la fecha es igual o posterior a hoy -> válido (null).
 */
export function validateNotPastDate(
  dateValue?: string,
  options?: ValidateDateOptions | string
): string | null {
  let required = true;
  let requiredMessage = 'Indicá una fecha válida.';
  let pastMessage = DEFAULT_PAST_DATE_ERROR_MESSAGE;
  let refDate = new Date();

  if (typeof options === 'string') {
    requiredMessage = options;
  } else if (options) {
    if (options.required !== undefined) required = options.required;
    if (options.requiredMessage !== undefined) requiredMessage = options.requiredMessage;
    if (options.pastMessage !== undefined) pastMessage = options.pastMessage;
    if (options.refDate !== undefined) refDate = options.refDate;
  }

  if (!dateValue || dateValue.trim() === '') {
    return required ? requiredMessage : null;
  }

  const trimmed = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Formato de fecha no válido (debe ser AAAA-MM-DD).';
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  const parsedDate = new Date(y, m - 1, d);
  if (
    parsedDate.getFullYear() !== y ||
    parsedDate.getMonth() !== m - 1 ||
    parsedDate.getDate() !== d
  ) {
    return 'Fecha no válida en el calendario.';
  }

  if (isDateBeforeToday(trimmed, refDate)) {
    return pastMessage;
  }

  return null;
}

/**
 * Valida un campo de fecha límite obligatoria con validación de no-anterioridad.
 */
export function validateFechaLimite(
  dateValue?: string,
  emptyMessage = 'Indicá la fecha límite de entrega.',
  pastMessage = DEFAULT_PAST_DATE_ERROR_MESSAGE,
  refDate: Date = new Date()
): string | null {
  return validateNotPastDate(dateValue, {
    required: true,
    requiredMessage: emptyMessage,
    pastMessage,
    refDate,
  });
}

/**
 * Valida longitud mínima requerida de un campo de texto.
 */
export function validateMinLength(
  value: string | undefined,
  min: number,
  emptyMessage: string,
  tooShortMessage?: string
): string | null {
  const trimmed = value ? value.trim() : '';
  if (!trimmed) {
    return emptyMessage;
  }
  if (trimmed.length < min) {
    return tooShortMessage || `Ingresá al menos ${min} caracteres.`;
  }
  return null;
}

/**
 * Revalida reactivamente el conjunto de errores visibles.
 * Regla:
 * - Si un campo tenía error y ahora es válido (no está en freshErrors) -> se remueve inmediatamente.
 * - Si un campo tenía error y sigue siendo inválido -> se actualiza el mensaje de error.
 * - Si un campo NO tenía error visible -> NO se añade prematuramente mientras el usuario escribe/selecciona.
 */
export function revalidateErrors(
  currentErrors: ValidationErrors,
  freshErrors: ValidationErrors
): ValidationErrors {
  const nextErrors = { ...currentErrors };
  for (const key of Object.keys(currentErrors)) {
    if (!freshErrors[key]) {
      delete nextErrors[key];
    } else {
      nextErrors[key] = freshErrors[key];
    }
  }
  return nextErrors;
}

// -----------------------------------------------------------------------------
// Paso 1: Contacto y Categorías
// -----------------------------------------------------------------------------

export function validateStep1(contacto: ContactoFormState, selected_categorias: CategoriaSlug[]): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!contacto.nombre_apellido || contacto.nombre_apellido.trim().length < 2) {
    errors.nombre_apellido = 'Ingresá tu nombre y apellido.';
  }

  const phoneVal = validateWhatsAppPhone(
    contacto.telefono_local !== undefined ? contacto.telefono_local : contacto.telefono,
    contacto.telefono_pais || 'AR'
  );
  if (!phoneVal.isValid) {
    errors.telefono = phoneVal.errorMessage || 'Ingresá un número de WhatsApp válido.';
  }

  if (!contacto.correo || !EMAIL_REGEX.test(contacto.correo.trim())) {
    errors.correo = 'Ingresá una dirección de correo electrónico válida.';
  }

  if (!contacto.area_solicitante || contacto.area_solicitante.trim().length < 2) {
    errors.area_solicitante = 'Ingresá el área, dirección o dependencia solicitante.';
  }

  if (!selected_categorias || selected_categorias.length === 0) {
    errors.selected_categorias = 'Seleccioná al menos un servicio o categoría para solicitar.';
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Paso 2: Detalles específicos de servicios
// -----------------------------------------------------------------------------

export function validateStep2(state: FormWizardState): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const cat of state.selected_categorias) {
    switch (cat) {
      case 'diseno_grafico': {
        if (!state.diseno_piezas || state.diseno_piezas.length === 0) {
          errors['diseno_piezas'] = 'Seleccioná al menos una pieza gráfica a solicitar.';
          break;
        }

        for (const pieza of state.diseno_piezas) {
          switch (pieza) {
            case 'flyer_rrss': {
              const data = state.diseno_data?.flyer_rrss;
              const textoErr = validateMinLength(
                data?.texto,
                5,
                'Ingresá el texto o contenido que debe llevar el flyer.',
                'Ingresá al menos 5 caracteres.'
              );
              if (textoErr) {
                errors['flyer_rrss.texto'] = textoErr;
              }
              const fechaErr = validateNotPastDate(data?.fecha_limite, {
                requiredMessage: 'Indicá la fecha del evento/actividad/pieza.',
              });
              if (fechaErr) {
                errors['flyer_rrss.fecha_limite'] = fechaErr;
              }
              break;
            }
            case 'invitacion_digital': {
              const data = state.diseno_data?.invitacion_digital;
              const fechaErr = validateNotPastDate(data?.fecha, {
                requiredMessage: 'Indicá la fecha del evento/actividad/pieza.',
              });
              if (fechaErr) {
                errors['invitacion_digital.fecha'] = fechaErr;
              }
              const especErr = validateMinLength(
                data?.programa || data?.especificaciones,
                3,
                'Ingresá las especificaciones del pedido.',
                'Ingresá al menos 3 caracteres.'
              );
              if (especErr) {
                errors['invitacion_digital.programa'] = especErr;
              }
              break;
            }
            case 'certificado': {
              const data = state.diseno_data?.certificado;
              if (!data?.nombre_actividad || data.nombre_actividad.trim().length < 2) {
                errors['certificado.nombre_actividad'] = 'Ingresá el nombre de la actividad o curso.';
              }
              const fechaErr = validateNotPastDate(data?.fecha, {
                requiredMessage: 'Indicá la fecha del evento/actividad/pieza.',
              });
              if (fechaErr) {
                errors['certificado.fecha'] = fechaErr;
              }
              if (!data?.firmantes || data.firmantes.trim().length < 2) {
                errors['certificado.firmantes'] = 'Ingresá las autoridades o personas firmantes.';
              }
              const destErr = validateMinLength(
                data?.destinatarios || data?.especificaciones,
                2,
                'Ingresá las especificaciones o destinatarios del certificado.',
                'Ingresá al menos 2 caracteres.'
              );
              if (destErr) {
                errors['certificado.destinatarios'] = destErr;
              }
              break;
            }
            case 'otros_diseno': {
              const data = state.diseno_data?.otros_diseno;
              const fechaErr = validateNotPastDate(data?.fecha, {
                requiredMessage: 'Indicá la fecha del evento/actividad/pieza.',
              });
              if (fechaErr) {
                errors['otros_diseno.fecha'] = fechaErr;
              }
              if (!data?.descripcion || data.descripcion.trim().length < 5) {
                errors['otros_diseno.descripcion'] = 'Describí la pieza gráfica que necesitás.';
              }
              if (!data?.medidas_soporte || data.medidas_soporte.trim().length < 2) {
                errors['otros_diseno.medidas_soporte'] = 'Indicá las medidas o soporte técnico (ej: 1x2m, banner, lona, folleto).';
              }
              break;
            }
          }
        }
        break;
      }

      case 'cobertura_eventos': {
        const data = state.cobertura_data;
        const fechaErr = validateNotPastDate(data?.fecha, {
          requiredMessage: 'Indicá la fecha de la cobertura.',
        });
        if (fechaErr) {
          errors['cobertura.fecha'] = fechaErr;
        }
        if (!data?.hora_inicio || data.hora_inicio.trim() === '') {
          errors['cobertura.hora_inicio'] = 'Indicá la hora de inicio del evento.';
        }
        if (!data?.lugar || data.lugar.trim().length < 2) {
          errors['cobertura.lugar'] = 'Indicá el lugar o dirección donde se realizará.';
        }
        if (!data?.ciudad) {
          errors['cobertura.ciudad'] = 'Seleccioná la ciudad (Ushuaia, Río Grande o Tolhuin).';
        }
        if (!data?.asiste_autoridades || (data.asiste_autoridades !== 'si' && (data.asiste_autoridades as unknown) !== true && data.asiste_autoridades !== 'no')) {
          errors['cobertura.asiste_autoridades'] = 'Seleccioná una opción.';
        } else if (data.asiste_autoridades === 'si' || (data.asiste_autoridades as unknown) === true) {
          if (!data?.autoridades || data.autoridades.trim().length < 2) {
            errors['cobertura.autoridades'] = 'Indicá qué autoridades asistirán.';
          }
        }
        if (!data?.requerimientos || data.requerimientos.trim().length < 5) {
          errors['cobertura.requerimientos'] = 'Detallá los requerimientos de cobertura (fotos, video, testimonios, etc.).';
        }
        break;
      }

      case 'gacetilla': {
        const data = state.gacetilla_data;
        if (!data?.referente_contacto || data.referente_contacto.trim().length < 2) {
          errors['gacetilla.referente_contacto'] = 'Indicá el referente o vocero de contacto para la prensa.';
        }
        if (!data?.telefono_contacto || data.telefono_contacto.trim().length < 5) {
          errors['gacetilla.telefono_contacto'] = 'Indicá el teléfono directo del referente.';
        }
        if (!data?.informacion_base || data.informacion_base.trim().length < 10) {
          errors['gacetilla.informacion_base'] = 'Ingresá la información base o datos del hecho noticioso.';
        }
        break;
      }

      case 'redes_sociales': {
        const data = state.redes_data;
        const fechaErr = validateNotPastDate(data?.fecha_sugerida, {
          requiredMessage: 'Indicá la fecha sugerida de publicación.',
        });
        if (fechaErr) {
          errors['redes.fecha_sugerida'] = fechaErr;
        }
        if (!data?.texto_copy || data.texto_copy.trim().length < 5) {
          errors['redes.texto_copy'] = 'Ingresá el texto o copy propuesto para la publicación.';
        }
        break;
      }

      case 'produccion_audiovisual': {
        const data = state.audiovisual_data;
        if (data?.requiere_asesoramiento) {
          if (!data.objetivo_asesoramiento || data.objetivo_asesoramiento.trim().length < 5) {
            errors['audiovisual.objetivo_asesoramiento'] = 'Describí brevemente qué necesitás para que el equipo te asesore.';
          }
        } else {
          if (!data?.tipo_produccion || data.tipo_produccion.trim() === '') {
            errors['audiovisual.tipo_produccion'] = 'Seleccioná el tipo de producción audiovisual.';
          }
          if (!data?.descripcion_objetivo || data.descripcion_objetivo.trim().length < 5) {
            errors['audiovisual.descripcion_objetivo'] = 'Ingresá la descripción y objetivo del video.';
          }
          if (!data?.formato || data.formato.trim() === '') {
            errors['audiovisual.formato'] = 'Seleccioná el formato de video.';
          }
          const fechaAudiovisualErr = validateNotPastDate(data?.fecha_limite, {
            requiredMessage: 'Indicá la fecha límite de entrega.',
          });
          if (fechaAudiovisualErr) {
            errors['audiovisual.fecha_limite'] = fechaAudiovisualErr;
          }
          if (data?.requiere_grabacion) {
            const fechaGrabErr = validateNotPastDate(data.grabacion_fecha, {
              requiredMessage: 'Indicá la fecha prevista para la grabación.',
            });
            if (fechaGrabErr) {
              errors['audiovisual.grabacion_fecha'] = fechaGrabErr;
            }
            if (!data.grabacion_hora || data.grabacion_hora.trim() === '') {
              errors['audiovisual.grabacion_hora'] = 'Indicá el horario previsto.';
            }
            if (!data.grabacion_lugar || data.grabacion_lugar.trim().length < 2) {
              errors['audiovisual.grabacion_lugar'] = 'Indicá el lugar de grabación.';
            }
            if (!data.grabacion_ciudad) {
              errors['audiovisual.grabacion_ciudad'] = 'Seleccioná la ciudad de grabación.';
            }
          }
        }
        break;
      }

      case 'motion_graphics': {
        const data = state.motion_data;
        if (data?.requiere_asesoramiento) {
          if (!data.objetivo_asesoramiento || data.objetivo_asesoramiento.trim().length < 5) {
            errors['motion.objetivo_asesoramiento'] = 'Describí brevemente qué necesitás para que el equipo te asesore.';
          }
        } else {
          if (!data?.tipo_motion || data.tipo_motion.trim() === '') {
            errors['motion.tipo_motion'] = 'Seleccioná el tipo de animación.';
          }
          if (!data?.texto_contenido || data.texto_contenido.trim().length < 3) {
            errors['motion.texto_contenido'] = 'Ingresá el texto o títulos a animar.';
          }
          if (!data?.descripcion || data.descripcion.trim().length < 5) {
            errors['motion.descripcion'] = 'Describí lo que necesitás comunicar.';
          }
          if (!data?.formato || data.formato.trim() === '') {
            errors['motion.formato'] = 'Seleccioná el formato visual.';
          }
          const fechaMotionErr = validateNotPastDate(data?.fecha_limite, {
            requiredMessage: 'Indicá la fecha límite de entrega.',
          });
          if (fechaMotionErr) {
            errors['motion.fecha_limite'] = fechaMotionErr;
          }
        }
        break;
      }

      case 'streaming': {
        const data = state.streaming_data;
        if (data?.requiere_asesoramiento) {
          if (!data.objetivo_asesoramiento || data.objetivo_asesoramiento.trim().length < 5) {
            errors['streaming.objetivo_asesoramiento'] = 'Describí brevemente qué necesitás para que el equipo te asesore.';
          }
        } else {
          if (!data?.tipo_streaming || data.tipo_streaming.trim() === '') {
            errors['streaming.tipo_streaming'] = 'Seleccioná el tipo de transmisión o sala.';
          }
          if (!data?.nombre_evento || data.nombre_evento.trim().length < 2) {
            errors['streaming.nombre_evento'] = 'Ingresá el nombre del evento o actividad.';
          }
          const fechaStreamingErr = validateNotPastDate(data?.fecha, {
            requiredMessage: 'Indicá la fecha de la transmisión.',
          });
          if (fechaStreamingErr) {
            errors['streaming.fecha'] = fechaStreamingErr;
          }
          if (!data?.hora_inicio || data.hora_inicio.trim() === '') {
            errors['streaming.hora_inicio'] = 'Indicá el horario de inicio.';
          }
          if (!data?.modalidad) {
            errors['streaming.modalidad'] = 'Seleccioná la modalidad (Presencial / Virtual / Híbrida).';
          }
          if (!data?.descripcion_requerimientos || data.descripcion_requerimientos.trim().length < 5) {
            errors['streaming.descripcion_requerimientos'] = 'Detallá los requerimientos técnicos y descripción.';
          }
          if (data?.modalidad === 'Presencial' || data?.modalidad === 'Híbrida') {
            if (!data.lugar || data.lugar.trim().length < 2) {
              errors['streaming.lugar'] = 'Indicá el lugar físico de la transmisión.';
            }
            if (!data.ciudad) {
              errors['streaming.ciudad'] = 'Seleccioná la ciudad.';
            }
          }
        }
        break;
      }

      case 'sitios_web': {
        const data = state.web_data;
        if (data?.requiere_asesoramiento) {
          if (!data.objetivo_asesoramiento || data.objetivo_asesoramiento.trim().length < 5) {
            errors['web.objetivo_asesoramiento'] = 'Describí brevemente qué necesitás para que el equipo te asesore.';
          }
        } else {
          if (!data?.tipo_web || data.tipo_web.trim() === '') {
            errors['web.tipo_web'] = 'Seleccioná el tipo de requerimiento web.';
          }
          if (!data?.descripcion_objetivo || data.descripcion_objetivo.trim().length < 5) {
            errors['web.descripcion_objetivo'] = 'Ingresá la descripción y objetivo de la página o cambio.';
          }
          if (data?.pagina_existente && (!data.url_pagina || !isValidHttpUrl(data.url_pagina))) {
            errors['web.url_pagina'] = 'Ingresá una URL válida de la página existente (ej: https://tierradelfuego.gob.ar/ejemplo).';
          }
          if (!data?.contenido_cambios || data.contenido_cambios.trim().length < 5) {
            errors['web.contenido_cambios'] = 'Detallá los contenidos, secciones o cambios solicitados.';
          }
          const fechaWebErr = validateNotPastDate(data?.fecha_limite, {
            requiredMessage: 'Indicá la fecha límite de publicación o puesta en línea.',
          });
          if (fechaWebErr) {
            errors['web.fecha_limite'] = fechaWebErr;
          }
        }
        break;
      }
    }
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Paso 3: Adjuntos y Enlaces
// -----------------------------------------------------------------------------

export function validateStep3(archivos: FormUploadedFile[], links: FormLinkItem[]): ValidationErrors {
  const errors: ValidationErrors = {};

  if (archivos.length > MAX_FILES_LIMIT) {
    errors['archivos'] = `Podés adjuntar como máximo ${MAX_FILES_LIMIT} archivos por presentación (actualmente: ${archivos.length}).`;
  }

  for (let i = 0; i < archivos.length; i++) {
    const arch = archivos[i];
    if (arch.status === 'uploading') {
      errors[`archivo_${i}`] = `El archivo "${arch.name}" todavía se está subiendo. Esperá a que finalice.`;
    } else if (arch.status === 'error') {
      errors[`archivo_${i}`] = `El archivo "${arch.name}" falló al subirse: ${arch.error_message || 'Error desconocido'}.`;
    }
  }

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (!link.url || !isValidHttpUrl(link.url)) {
      errors[`link_${i}`] = 'Enlace no válido. Ingresá la dirección completa con http:// o https://.';
    }
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Paso 4: Confirmación
// -----------------------------------------------------------------------------

export function validateStep4(confirmado: boolean): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!confirmado) {
    errors.confirmado = 'Debés confirmar que revisaste los datos antes de enviar las solicitudes.';
  }
  return errors;
}
