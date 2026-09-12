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
} from '../validation/formValidation';
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
      expect(errs['flyer_rrss.formato']).toBeDefined();
      expect(errs['flyer_rrss.texto']).toBeDefined();
      expect(errs['flyer_rrss.fecha_limite']).toBeDefined();
    });

    it('debe validar que Cobertura de Eventos requiera fecha, hora, lugar, ciudad y autoridades', () => {
      const state: Partial<FormWizardState> = {
        selected_categorias: ['cobertura_eventos'],
        cobertura_data: {
          fecha: '',
          hora_inicio: '',
          lugar: '',
          ciudad: '',
          autoridades: '',
          requerimientos: '',
        },
      };

      const errs = validateStep2(state as FormWizardState);
      expect(errs['cobertura.fecha']).toBeDefined();
      expect(errs['cobertura.hora_inicio']).toBeDefined();
      expect(errs['cobertura.lugar']).toBeDefined();
      expect(errs['cobertura.ciudad']).toBeDefined();
      expect(errs['cobertura.autoridades']).toBeDefined();
      expect(errs['cobertura.requerimientos']).toBeDefined();
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

    it('debe validar límites de archivos y links en validateStep3', () => {
      const emptyErrs = validateStep3([], []);
      expect(Object.keys(emptyErrs).length).toBe(0);

      const invalidLinkErrs = validateStep3(
        [],
        [{ id: '1', url: 'not-a-valid-url', targets: 'all' }]
      );
      expect(invalidLinkErrs['link_0']).toBeDefined();
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
