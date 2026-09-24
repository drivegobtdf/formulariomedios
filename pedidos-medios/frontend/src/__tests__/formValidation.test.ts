/**
 * Tests unitarios de validación del Formulario Público (Revisión 3.0)
 */

import { describe, it, expect } from 'vitest';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateFileMetadata,
  MAX_FILE_SIZE_LIMIT,
  isValidHttpUrl,
  validateWhatsAppPhone,
  getWhatsAppDetails,
  formatPhoneForDisplay,
  getLocalTodayDateString,
  getLocalTomorrowDateString,
  getUshuaiaTodayDateString,
  getUshuaiaTomorrowDateString,
  isDateBeforeToday,
  isDateBeforeTomorrow,
  validateNotPastDate,
  validateFechaLimite,
  DEFAULT_PAST_DATE_ERROR_MESSAGE,
  DEFAULT_NOT_TOMORROW_ERROR_MESSAGE,
  validateMinLength,
  revalidateErrors,
} from '../validation/formValidation';
import { COUNTRIES_LIST, DEFAULT_COUNTRY_CODE } from '../utils/phoneUtils';
import { FormWizardState } from '../types/form';

describe('Módulo de Validación del Formulario (Revision 3.0)', () => {
  describe('Paso 1: Contacto y Categorías', () => {
    it('debe rechazar campos de contacto vacíos o inválidos', () => {
      const errs = validateStep1(
        { nombre_apellido: '', telefono: '', correo: 'invalido', area_solicitante: '' },
        []
      );

      expect(errs.nombre_apellido).toBeDefined();
      expect(errs.telefono).toBeDefined();
      expect(errs.correo).toBeDefined();
      expect(errs.area_solicitante).toBeDefined();
      expect(errs.selected_categorias).toBeDefined();
    });

    it('debe aceptar contacto válido con al menos 1 categoría seleccionada', () => {
      const errs = validateStep1(
        {
          nombre_apellido: 'María Gómez',
          telefono: '+542901445566',
          correo: 'maria.gomez@tierradelfuego.gob.ar',
          area_solicitante: 'Dirección Provincial de Medios',
        },
        ['diseno_grafico']
      );

      expect(Object.keys(errs).length).toBe(0);
    });

    it('WhatsApp Argentina: Validación de reglas (Tests A - H)', () => {
      // A. Argentina seleccionado por defecto
      expect(DEFAULT_COUNTRY_CODE).toBe('AR');
      expect(COUNTRIES_LIST[0].code).toBe('AR');
      expect(COUNTRIES_LIST[0].displayDialCode).toBe('+54 9');

      // B. Input válido 2964477578 -> canonical +5492964477578
      const resB = validateWhatsAppPhone('2964477578', 'AR');
      expect(resB.isValid).toBe(true);
      expect(resB.canonical).toBe('+5492964477578');

      // C. Formato visual legible
      expect(resB.formatted).toContain('54 9 2964');

      // D. wa.me exclusivo con dígitos
      expect(resB.waDigits).toBe('5492964477578');
      expect(resB.waUrl).toBe('https://wa.me/5492964477578');

      // E. 0 inicial -> inválido con mensaje exacto
      const resE = validateWhatsAppPhone('02964477578', 'AR');
      expect(resE.isValid).toBe(false);
      expect(resE.errorMessage).toBe('Ingresá el número sin el 0 inicial.');

      // F. prefijo 15 -> inválido con mensaje exacto
      const resF1 = validateWhatsAppPhone('15477578', 'AR');
      expect(resF1.isValid).toBe(false);
      expect(resF1.errorMessage).toBe('Ingresá el número sin el prefijo 15.');

      const resF2 = validateWhatsAppPhone('296415477578', 'AR');
      expect(resF2.isValid).toBe(false);
      expect(resF2.errorMessage).toBe('Ingresá el número sin el prefijo 15.');

      const resF3 = validateWhatsAppPhone('2964-15-477578', 'AR');
      expect(resF3.isValid).toBe(false);
      expect(resF3.errorMessage).toBe('Ingresá el número sin el prefijo 15.');

      // G. espacios, guiones y paréntesis durante entrada -> normalización correcta
      const resG1 = validateWhatsAppPhone('2964 477578', 'AR');
      expect(resG1.isValid).toBe(true);
      expect(resG1.canonical).toBe('+5492964477578');

      const resG2 = validateWhatsAppPhone('2964-47-7578', 'AR');
      expect(resG2.isValid).toBe(true);
      expect(resG2.canonical).toBe('+5492964477578');

      const resG3 = validateWhatsAppPhone('(2964) 477578', 'AR');
      expect(resG3.isValid).toBe(true);
      expect(resG3.canonical).toBe('+5492964477578');

      // H. letras -> inválido
      const resH = validateWhatsAppPhone('2964abc', 'AR');
      expect(resH.isValid).toBe(false);
      expect(resH.errorMessage).toBe('Ingresá solo números, sin letras.');
    });

    it('WhatsApp Internacional: Reglas para CL, UY, BR, US (Sección 16)', () => {
      // Chile (CL)
      const resCL = validateWhatsAppPhone('912345678', 'CL');
      expect(resCL.isValid).toBe(true);
      expect(resCL.canonical).toBe('+56912345678');
      expect(resCL.waDigits).toBe('56912345678');
      expect(resCL.waUrl).toBe('https://wa.me/56912345678');

      // Uruguay (UY)
      const resUY = validateWhatsAppPhone('99123456', 'UY');
      expect(resUY.isValid).toBe(true);
      expect(resUY.canonical).toBe('+59899123456');
      expect(resUY.waDigits).toBe('59899123456');
      expect(resUY.waUrl).toBe('https://wa.me/59899123456');

      // Brasil (BR)
      const resBR = validateWhatsAppPhone('11987654321', 'BR');
      expect(resBR.isValid).toBe(true);
      expect(resBR.canonical).toBe('+5511987654321');
      expect(resBR.waDigits).toBe('5511987654321');
      expect(resBR.waUrl).toBe('https://wa.me/5511987654321');

      // Estados Unidos (US)
      const resUS = validateWhatsAppPhone('2025550123', 'US');
      expect(resUS.isValid).toBe(true);
      expect(resUS.canonical).toBe('+12025550123');
      expect(resUS.waDigits).toBe('12025550123');
      expect(resUS.waUrl).toBe('https://wa.me/12025550123');

      // Verificar que regla del +54 9 NO se aplica a otros países
      expect(resCL.canonical).not.toContain('+54');
      expect(resUY.canonical).not.toContain('+54');
      expect(resBR.canonical).not.toContain('+54');
      expect(resUS.canonical).not.toContain('+54');

      // Todos los waUrl no contienen espacios, guiones ni '+'
      for (const res of [resCL, resUY, resBR, resUS]) {
        expect(res.waUrl).toMatch(/^https:\/\/wa\.me\/\d+$/);
      }
    });

    it('Gestión / Históricos: getWhatsAppDetails y formatPhoneForDisplay (Sección 17)', () => {
      // A & B & C: Canónico argentino -> formateado + link wa.me sin +, espacios o guiones
      const details = getWhatsAppDetails('+5492964477578');
      expect(details).not.toBeNull();
      expect(details?.waUrl).toBe('https://wa.me/5492964477578');
      expect(details?.waDigits).toBe('5492964477578');
      expect(details?.waDigits).not.toMatch(/[+\s\-()]/);

      // Formato visual legible
      expect(formatPhoneForDisplay('+5492964477578')).toContain('54 9 2964');

      // D. Número histórico no normalizable -> retorna null (sin link falso)
      expect(getWhatsAppDetails('12345')).toBeNull();
      expect(getWhatsAppDetails('no-un-telefono')).toBeNull();
      expect(formatPhoneForDisplay('12345')).toBe('12345');
    });
  });

  describe('Paso 2: Detalle por Categoría', () => {
    it('debe validar requerimientos de Diseño Gráfico y Flyer RRSS', () => {
      const state: Partial<FormWizardState> = {
        selected_categorias: ['diseno_grafico'],
        diseno_piezas: ['flyer_rrss'],
        diseno_data: {
          flyer_rrss: { formato: '', texto: '', fecha_limite: '' },
        },
      };

      const errs = validateStep2(state as FormWizardState);
      expect(errs['flyer_rrss.texto']).toBeDefined();
      expect(errs['flyer_rrss.fecha_limite']).toBeDefined();
    });

    it('debe validar que Cobertura de Eventos requiera fecha, hora, lugar, ciudad, requerimientos y opción de autoridades', () => {
      const state: Partial<FormWizardState> = {
        selected_categorias: ['cobertura_eventos'],
        cobertura_data: {
          fecha: '',
          hora_inicio: '',
          lugar: '',
          ciudad: '',
          asiste_autoridades: '',
          autoridades: '',
          requerimientos: '',
        },
      };

      const errs = validateStep2(state as FormWizardState);
      expect(errs['cobertura.fecha']).toBeDefined();
      expect(errs['cobertura.hora_inicio']).toBeDefined();
      expect(errs['cobertura.lugar']).toBeDefined();
      expect(errs['cobertura.ciudad']).toBeDefined();
      expect(errs['cobertura.asiste_autoridades']).toBe('Seleccioná una opción.');
      expect(errs['cobertura.requerimientos']).toBeDefined();
    });

    it('debe validar selector de autoridades: sin selección bloquea, "no" es válido sin autoridades, "si" exige nombres', () => {
      const baseState: Partial<FormWizardState> = {
        selected_categorias: ['cobertura_eventos'],
        cobertura_data: {
          fecha: '2026-12-01',
          hora_inicio: '10:00',
          lugar: 'Casa de Gobierno',
          ciudad: 'Ushuaia',
          asiste_autoridades: '',
          autoridades: '',
          requerimientos: 'Cobertura fotográfica',
        },
      };

      // 1. Sin seleccionar (estado inicial '')
      const errsUnset = validateStep2(baseState as FormWizardState);
      expect(errsUnset['cobertura.asiste_autoridades']).toBe('Seleccioná una opción.');
      expect(errsUnset['cobertura.autoridades']).toBeUndefined();

      // 2. Selecciona "no" -> válido, no exige autoridades
      baseState.cobertura_data!.asiste_autoridades = 'no';
      const errsNo = validateStep2(baseState as FormWizardState);
      expect(errsNo['cobertura.asiste_autoridades']).toBeUndefined();
      expect(errsNo['cobertura.autoridades']).toBeUndefined();

      // 3. Selecciona "si" con campo vacío -> bloquea exigiendo autoridades
      baseState.cobertura_data!.asiste_autoridades = 'si';
      baseState.cobertura_data!.autoridades = '';
      const errsSiEmpty = validateStep2(baseState as FormWizardState);
      expect(errsSiEmpty['cobertura.asiste_autoridades']).toBeUndefined();
      expect(errsSiEmpty['cobertura.autoridades']).toBe('Indicá qué autoridades asistirán.');

      // 4. Selecciona "si" con nombres válidos -> válido
      baseState.cobertura_data!.autoridades = 'Gobernador y Ministros';
      const errsSiValid = validateStep2(baseState as FormWizardState);
      expect(errsSiValid['cobertura.asiste_autoridades']).toBeUndefined();
      expect(errsSiValid['cobertura.autoridades']).toBeUndefined();
    });

    it('debe aplicar patrón de asesoramiento simplificado si requiere_asesoramiento es true', () => {
      const state: Partial<FormWizardState> = {
        selected_categorias: ['produccion_audiovisual'],
        audiovisual_data: {
          requiere_asesoramiento: true,
          objetivo_asesoramiento: '',
        },
      };

      const errs = validateStep2(state as FormWizardState);
      expect(errs['audiovisual.objetivo_asesoramiento']).toBeDefined();
      expect(errs['audiovisual.tipo_produccion']).toBeUndefined(); // No se exigen campos técnicos
    });
  });

  describe('Paso 3: Validación de Archivos y Adjuntos', () => {
    it('debe rechazar archivos mayores a 10 MB', () => {
      const err = validateFileMetadata({
        name: 'documento.pdf',
        size: MAX_FILE_SIZE_LIMIT + 1,
        type: 'application/pdf',
      });

      expect(err).toContain('supera el tamaño máximo');
    });

    it('debe rechazar extensiones no permitidas', () => {
      const err = validateFileMetadata({
        name: 'script.exe',
        size: 1024,
        type: 'application/x-msdownload',
      });

      expect(err).toContain('Tipo de archivo no permitido');
    });

    it('debe aceptar formatos contractuales permitidos (PDF, PNG, JPG, DOCX, ZIP)', () => {
      expect(
        validateFileMetadata({ name: 'guia.pdf', size: 1024, type: 'application/pdf' })
      ).toBeNull();
      expect(
        validateFileMetadata({ name: 'logo.png', size: 1024, type: 'image/png' })
      ).toBeNull();
      expect(
        validateFileMetadata({ name: 'foto.jpg', size: 1024, type: 'image/jpeg' })
      ).toBeNull();
      expect(
        validateFileMetadata({
          name: 'texto.docx',
          size: 1024,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      ).toBeNull();
      expect(
        validateFileMetadata({ name: 'recursos.zip', size: 1024, type: 'application/zip' })
      ).toBeNull();
    });

    it('debe validar límites de archivos y links en validateStep3 con mensaje unificado', () => {
      const emptyErrs = validateStep3([], []);
      expect(Object.keys(emptyErrs).length).toBe(0);

      const invalidLinkErrs = validateStep3(
        [],
        [{ id: '1', url: 'not-a-valid-url', targets: 'all' }]
      );
      expect(invalidLinkErrs['link_0']).toBe(
        'Enlace no válido. Ingresá la dirección completa con http:// o https://.'
      );

      const validLinkErrs = validateStep3(
        [],
        [{ id: '1', url: 'https://ejemplo.com', targets: 'all' }]
      );
      expect(validLinkErrs['link_0']).toBeUndefined();
    });

    it('isValidHttpUrl: debe aceptar exclusivamente URLs completas con http:// o https:// (Tests A-E, Case-Insensitive)', () => {
      // A. https://ejemplo.com -> válido
      expect(isValidHttpUrl('https://ejemplo.com')).toBe(true);

      // B. http://ejemplo.com -> válido
      expect(isValidHttpUrl('http://ejemplo.com')).toBe(true);

      // C. https://www.ejemplo.com -> válido
      expect(isValidHttpUrl('https://www.ejemplo.com')).toBe(true);

      // D. http://www.ejemplo.com -> válido
      expect(isValidHttpUrl('http://www.ejemplo.com')).toBe(true);

      // E. https://drive.google.com/file/d/123 -> válido
      expect(isValidHttpUrl('https://drive.google.com/file/d/123')).toBe(true);
      expect(isValidHttpUrl('https://drive.google.com/file/d/123456789/view')).toBe(true);

      // Case-insensitivity del protocolo
      expect(isValidHttpUrl('HTTP://ejemplo.com')).toBe(true);
      expect(isValidHttpUrl('HTTPS://ejemplo.com')).toBe(true);
    });

    it('isValidHttpUrl: debe rechazar URLs incompletas o sin protocolo explícito (Tests F-I)', () => {
      // F. ejemplo.com -> inválido
      expect(isValidHttpUrl('ejemplo.com')).toBe(false);

      // G. www.ejemplo.com -> inválido
      expect(isValidHttpUrl('www.ejemplo.com')).toBe(false);

      // H. drive.google.com/file/d/123 -> inválido
      expect(isValidHttpUrl('drive.google.com/file/d/123')).toBe(false);
      expect(isValidHttpUrl('drive.google.com/file/d/123456789/view')).toBe(false);

      // I. hola -> inválido
      expect(isValidHttpUrl('hola')).toBe(false);
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl('   ')).toBe(false);
    });

    it('isValidHttpUrl: debe rechazar esquemas y protocolos no seguros o bloqueados (Tests J-L)', () => {
      // J. javascript:alert(1) -> inválido (y JAVASCRIPT:alert(1))
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('JAVASCRIPT:alert(1)')).toBe(false);

      // K. data:text/html,... -> inválido
      expect(isValidHttpUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);

      // L. file:///tmp/test -> inválido
      expect(isValidHttpUrl('file:///tmp/test')).toBe(false);

      // Otros esquemas bloqueados
      expect(isValidHttpUrl('vbscript:msgbox')).toBe(false);
      expect(isValidHttpUrl('ftp://ftp.ejemplo.com')).toBe(false);
      expect(isValidHttpUrl('mailto:test@ejemplo.com')).toBe(false);
    });
  });

  describe('Helpers de Fecha y Validación Reactiva (America/Argentina/Ushuaia)', () => {
    it('getUshuaiaTodayDateString y getUshuaiaTomorrowDateString deben calcular fechas civiles sin desfasaje por UTC', () => {
      // 23:30 en Argentina (UTC-3) -> 14 Septiembre
      const localLateDate = new Date('2026-09-15T02:30:00Z'); // 23:30 local en Argentina
      expect(getUshuaiaTodayDateString(localLateDate)).toBe('2026-09-14');
      expect(getUshuaiaTomorrowDateString(localLateDate)).toBe('2026-09-15');

      // 00:15 en Argentina (UTC-3) -> 15 Septiembre
      const localEarlyDate = new Date('2026-09-15T03:15:00Z'); // 00:15 local en Argentina
      expect(getUshuaiaTodayDateString(localEarlyDate)).toBe('2026-09-15');
      expect(getUshuaiaTomorrowDateString(localEarlyDate)).toBe('2026-09-16');

      // Compatibility aliases
      expect(getLocalTodayDateString(localLateDate)).toBe('2026-09-14');
      expect(isDateBeforeToday('2026-09-13', localLateDate)).toBe(true);
      expect(isDateBeforeToday('2026-09-14', localLateDate)).toBe(false);
      expect(DEFAULT_PAST_DATE_ERROR_MESSAGE).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
    });

    it('validateNotPastDate: debe validar fechas de acuerdo a la nueva regla global (ayer y hoy prohibidos, mañana y futuro permitidos)', () => {
      const refDate = new Date('2026-09-14T15:00:00Z'); // 14 Septiembre 2026 12:00 local Ushuaia

      // Test A: Hoy -> RECHAZADO
      expect(validateNotPastDate('2026-09-14', { refDate })).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);

      // Test B: Ayer -> RECHAZADO
      expect(validateNotPastDate('2026-09-13', { refDate })).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      expect(
        validateNotPastDate('2026-09-13', {
          refDate,
          pastMessage: 'No podés seleccionar una fecha pasada.',
        })
      ).toBe('No podés seleccionar una fecha pasada.');

      // Test C: Mañana -> ACEPTADO (null)
      expect(validateNotPastDate('2026-09-15', { refDate })).toBeNull();

      // Test D: Futuro lejano -> ACEPTADO (null)
      expect(validateNotPastDate('2026-09-16', { refDate })).toBeNull();
      expect(validateNotPastDate('2027-12-31', { refDate })).toBeNull();

      // Campo vacío requerido (por defecto)
      expect(
        validateNotPastDate('', { refDate, requiredMessage: 'Indicá la fecha del evento.' })
      ).toBe('Indicá la fecha del evento.');
      expect(validateNotPastDate('   ', { refDate, requiredMessage: 'Indicá la fecha.' })).toBe(
        'Indicá la fecha.'
      );
      expect(validateNotPastDate(undefined, 'Indicá la fecha.')).toBe('Indicá la fecha.');

      // Campo vacío opcional
      expect(validateNotPastDate('', { required: false, refDate })).toBeNull();
      expect(validateNotPastDate(undefined, { required: false, refDate })).toBeNull();

      // Formato malformado
      expect(validateNotPastDate('14-09-2026', { refDate })).toBe(
        'Formato de fecha no válido (debe ser AAAA-MM-DD).'
      );
      expect(validateNotPastDate('2026-9-14', { refDate })).toBe(
        'Formato de fecha no válido (debe ser AAAA-MM-DD).'
      );
      expect(validateNotPastDate('texto', { refDate })).toBe(
        'Formato de fecha no válido (debe ser AAAA-MM-DD).'
      );

      // Fecha inválida en calendario (ej. 31 de febrero)
      expect(validateNotPastDate('2026-02-31', { refDate })).toBe(
        'Fecha no válida en el calendario.'
      );
    });

    it('isDateBeforeTomorrow y validateFechaLimite deben rechazar hoy y ayer, y aceptar mañana y futuras', () => {
      const refDate = new Date('2026-09-14T15:00:00Z'); // 14 Sept 2026 local

      // Ayer
      expect(isDateBeforeTomorrow('2026-09-13', refDate)).toBe(true);
      expect(validateFechaLimite('2026-09-13', undefined, undefined, refDate)).toBe(
        DEFAULT_NOT_TOMORROW_ERROR_MESSAGE
      );

      // Hoy -> RECHAZADO (isDateBeforeTomorrow = true)
      expect(isDateBeforeTomorrow('2026-09-14', refDate)).toBe(true);
      expect(validateFechaLimite('2026-09-14', undefined, undefined, refDate)).toBe(
        DEFAULT_NOT_TOMORROW_ERROR_MESSAGE
      );

      // Mañana -> ACEPTADO
      expect(isDateBeforeTomorrow('2026-09-15', refDate)).toBe(false);
      expect(validateFechaLimite('2026-09-15', undefined, undefined, refDate)).toBeNull();

      // Futuro posterior
      expect(isDateBeforeTomorrow('2026-09-20', refDate)).toBe(false);
      expect(validateFechaLimite('2026-09-20', undefined, undefined, refDate)).toBeNull();

      // Fecha vacía
      expect(validateFechaLimite('', undefined, undefined, refDate)).toBe(
        'Indicá la fecha requerida.'
      );
    });

    it('validateStep2: debe aplicar la regla >= mañana en todos los campos operativos de todos los servicios', () => {
      const yesterday = '2026-09-13';
      const today = '2026-09-14';
      const tomorrow = getLocalTomorrowDateString();

      // 1. Diseño Gráfico -> Flyer
      const stateFlyerPast: Partial<FormWizardState> = {
        selected_categorias: ['diseno_grafico'],
        diseno_piezas: ['flyer_rrss'],
        diseno_data: { flyer_rrss: { formato: '1:1', texto: 'Texto válido', fecha_limite: yesterday } },
      };
      expect(validateStep2(stateFlyerPast as FormWizardState)['flyer_rrss.fecha_limite']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateFlyerPast.diseno_data!.flyer_rrss!.fecha_limite = today;
      expect(validateStep2(stateFlyerPast as FormWizardState)['flyer_rrss.fecha_limite']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateFlyerPast.diseno_data!.flyer_rrss!.fecha_limite = tomorrow;
      expect(validateStep2(stateFlyerPast as FormWizardState)['flyer_rrss.fecha_limite']).toBeUndefined();

      // 2. Diseño Gráfico -> Invitación Digital
      const stateInvPast: Partial<FormWizardState> = {
        selected_categorias: ['diseno_grafico'],
        diseno_piezas: ['invitacion_digital'],
        diseno_data: {
          invitacion_digital: {
            nombre_evento: 'Acto Oficial',
            fecha: today,
            hora: '10:00',
            lugar: 'Casa de Gobierno',
            modalidad: 'Presencial',
            programa: 'Cronograma completo',
          },
        },
      };
      expect(validateStep2(stateInvPast as FormWizardState)['invitacion_digital.fecha']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateInvPast.diseno_data!.invitacion_digital!.fecha = tomorrow;
      expect(validateStep2(stateInvPast as FormWizardState)['invitacion_digital.fecha']).toBeUndefined();

      // 3. Cobertura de Eventos
      const stateCobPast: Partial<FormWizardState> = {
        selected_categorias: ['cobertura_eventos'],
        cobertura_data: {
          fecha: today,
          hora_inicio: '10:00',
          lugar: 'Gimnasio Petrina',
          ciudad: 'Ushuaia',
          asiste_autoridades: 'si',
          autoridades: 'Gobernador',
          requerimientos: 'Fotografía y video institucional',
        },
      };
      expect(validateStep2(stateCobPast as FormWizardState)['cobertura.fecha']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateCobPast.cobertura_data!.fecha = tomorrow;
      expect(validateStep2(stateCobPast as FormWizardState)['cobertura.fecha']).toBeUndefined();

      // 4. Redes Sociales
      const stateRedesPast: Partial<FormWizardState> = {
        selected_categorias: ['redes_sociales'],
        redes_data: {
          fecha_sugerida: today,
          texto_copy: 'Texto del post con hashtags #TDF',
        },
      };
      expect(validateStep2(stateRedesPast as FormWizardState)['redes.fecha_sugerida']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateRedesPast.redes_data!.fecha_sugerida = tomorrow;
      expect(validateStep2(stateRedesPast as FormWizardState)['redes.fecha_sugerida']).toBeUndefined();

      // 5. Producción Audiovisual -> Fecha límite
      const stateAvPast: Partial<FormWizardState> = {
        selected_categorias: ['produccion_audiovisual'],
        audiovisual_data: {
          requiere_asesoramiento: false,
          tipo_produccion: 'Video institucional',
          descripcion_objetivo: 'Objetivo del video institucional',
          formato: '16:9',
          fecha_limite: today,
        },
      };
      expect(validateStep2(stateAvPast as FormWizardState)['audiovisual.fecha_limite']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateAvPast.audiovisual_data!.fecha_limite = tomorrow;
      expect(validateStep2(stateAvPast as FormWizardState)['audiovisual.fecha_limite']).toBeUndefined();

      // 6. Producción Audiovisual -> Grabación
      const stateAvGrabPast: Partial<FormWizardState> = {
        selected_categorias: ['produccion_audiovisual'],
        audiovisual_data: {
          requiere_asesoramiento: false,
          tipo_produccion: 'Video institucional',
          descripcion_objetivo: 'Objetivo del video institucional',
          formato: '16:9',
          fecha_limite: tomorrow,
          requiere_grabacion: true,
          grabacion_fecha: today,
          grabacion_hora: '14:00',
          grabacion_lugar: 'Despacho',
          grabacion_ciudad: 'Ushuaia',
        },
      };
      expect(validateStep2(stateAvGrabPast as FormWizardState)['audiovisual.grabacion_fecha']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateAvGrabPast.audiovisual_data!.grabacion_fecha = tomorrow;
      expect(validateStep2(stateAvGrabPast as FormWizardState)['audiovisual.grabacion_fecha']).toBeUndefined();

      // 7. Motion Graphics
      const stateMotionPast: Partial<FormWizardState> = {
        selected_categorias: ['motion_graphics'],
        motion_data: {
          requiere_asesoramiento: false,
          tipo_motion: 'Placa animada',
          texto_contenido: 'Texto animado',
          descripcion: 'Descripción del motion graphics',
          formato: '16:9',
          fecha_limite: today,
        },
      };
      expect(validateStep2(stateMotionPast as FormWizardState)['motion.fecha_limite']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateMotionPast.motion_data!.fecha_limite = tomorrow;
      expect(validateStep2(stateMotionPast as FormWizardState)['motion.fecha_limite']).toBeUndefined();

      // 8. Streaming
      const stateStreamingPast: Partial<FormWizardState> = {
        selected_categorias: ['streaming'],
        streaming_data: {
          requiere_asesoramiento: false,
          tipo_streaming: 'Transmisión en vivo de un evento',
          nombre_evento: 'Sesión Inaugural',
          fecha: today,
          hora_inicio: '11:00',
          modalidad: 'Virtual',
          descripcion_requerimientos: 'Transmisión por YouTube y Facebook Live',
        },
      };
      expect(validateStep2(stateStreamingPast as FormWizardState)['streaming.fecha']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateStreamingPast.streaming_data!.fecha = tomorrow;
      expect(validateStep2(stateStreamingPast as FormWizardState)['streaming.fecha']).toBeUndefined();

      // 9. Sitios Web
      const stateWebPast: Partial<FormWizardState> = {
        selected_categorias: ['sitios_web'],
        web_data: {
          requiere_asesoramiento: false,
          tipo_web: 'Crear una página',
          descripcion_objetivo: 'Nueva página para programa provincial',
          contenido_cambios: 'Secciones institucionales y formulario',
          fecha_limite: today,
        },
      };
      expect(validateStep2(stateWebPast as FormWizardState)['web.fecha_limite']).toBe(DEFAULT_NOT_TOMORROW_ERROR_MESSAGE);
      stateWebPast.web_data!.fecha_limite = tomorrow;
      expect(validateStep2(stateWebPast as FormWizardState)['web.fecha_limite']).toBeUndefined();
    });

    it('validateMinLength debe distinguir entre campo vacío y contenido menor al mínimo', () => {
      const emptyMsg = 'Ingresá el texto o contenido que debe llevar el flyer.';
      const shortMsg = 'Ingresá al menos 5 caracteres.';

      // Vacío
      expect(validateMinLength('', 5, emptyMsg, shortMsg)).toBe(emptyMsg);
      expect(validateMinLength('   ', 5, emptyMsg, shortMsg)).toBe(emptyMsg);

      // Menor al mínimo
      expect(validateMinLength('Hola', 5, emptyMsg, shortMsg)).toBe(shortMsg);

      // Igual o mayor al mínimo
      expect(validateMinLength('Hola!', 5, emptyMsg, shortMsg)).toBeNull();
      expect(validateMinLength('Flyer oficial', 5, emptyMsg, shortMsg)).toBeNull();
    });

    it('revalidateErrors debe limpiar inmediatamente errores corregidos sin añadir errores a campos no alertados', () => {
      const currentErrors = {
        'flyer_rrss.formato': 'Seleccioná el formato del flyer.',
        'flyer_rrss.texto': 'Ingresá el texto o contenido que debe llevar el flyer.',
        'flyer_rrss.fecha_limite': 'Indicá la fecha límite de entrega.',
      };

      // Simular que el usuario corrigió el formato pero el texto y fecha siguen con error
      const freshErrors = {
        'flyer_rrss.texto': 'Ingresá al menos 5 caracteres.', // Mensaje actualizado
        'flyer_rrss.fecha_limite': 'Indicá la fecha límite de entrega.',
        'otro_campo_no_tocado': 'Error de campo no alertado previamente',
      };

      const nextErrors = revalidateErrors(currentErrors, freshErrors);

      // Formato corregido -> eliminado inmediatamente
      expect(nextErrors['flyer_rrss.formato']).toBeUndefined();
      // Texto actualizado a nuevo mensaje
      expect(nextErrors['flyer_rrss.texto']).toBe('Ingresá al menos 5 caracteres.');
      // Fecha límite se conserva
      expect(nextErrors['flyer_rrss.fecha_limite']).toBe('Indicá la fecha límite de entrega.');
      // Campo no alertado previamente NO se añade de forma prematura
      expect(nextErrors['otro_campo_no_tocado']).toBeUndefined();
    });
  });

  describe('Paso 4: Confirmación', () => {
    it('debe rechazar confirmación no tildada', () => {
      const errs = validateStep4(false);
      expect(errs.confirmado).toBeDefined();
    });

    it('debe aceptar confirmación tildada', () => {
      const errs = validateStep4(true);
      expect(errs.confirmado).toBeUndefined();
    });
  });
});
