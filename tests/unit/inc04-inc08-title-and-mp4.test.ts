/**
 * Paquete 4 Post-QA: INC-04 (Títulos 3-50 chars y no HTML) e INC-08 (Soporte video/mp4 hasta 25 MB)
 *
 * Verificaciones:
 * 1. INC-04 Frontend: Límites 2 (rechazo), 3 (aceptación), 50 (aceptación), 51 (rechazo) y rechazo de HTML.
 * 2. INC-04 Frontend: Independencia de títulos en pedidos múltiples.
 * 3. INC-04 Carga Interna: Validación de límites 3-50, rechazo de HTML y atributos de input (minLength=3, maxLength=50).
 * 4. INC-04 Step 2 Público: Atributos de input (minLength=3, maxLength=50).
 * 5. INC-04 Migración SQL: Trigger cam09_require_new_pedido_title y RPC pedido_create_internal con límites 3-50.
 * 6. INC-04 Preservación de históricos: Trigger estrictamente BEFORE INSERT, sin truncamiento silencioso.
 * 7. INC-08 Migración SQL: submission_create_core incorpora video/mp4 y mantiene baseline (PDF, PNG, JPG, DOCX, ZIP).
 * 8. INC-08 Límites de tamaño: Límite contractual de 25 MB (26.214.400 bytes).
 * 9. INC-08 OPEN-014: Mantiene registro de decisión en estado ABIERTO para autorización formal.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateStep2 } from '../../pedidos-medios/frontend/src/validation/formValidation';
import type { FormWizardState } from '../../pedidos-medios/frontend/src/types/form';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

const createWizardState = (titles: Record<string, string>, categorias: string[] = ['gacetilla']): FormWizardState => ({
  submission_key: 'inc04-inc08-test',
  current_step: 2,
  contacto: { nombre_apellido: 'Juan Perez', telefono: '2901123456', correo: 'juan@tdf.gob.ar', area_solicitante: 'Prensa' },
  selected_categorias: categorias,
  diseno_piezas: categorias.includes('diseno_grafico') ? ['flyer_rrss', 'otros_diseno'] : [],
  titulos_pedidos: titles,
  diseno_data: {},
  gacetilla_data: { referente_contacto: 'Ana Referente', telefono_contacto: '123456789', informacion_base: 'Texto de prueba suficiente.' },
  archivos: [],
  links: [],
  confirmado: false,
  submitting: false,
});

describe('INC-04 — Títulos de pedidos (3 a 50 caracteres y sin HTML)', () => {
  describe('Frontend — Validación de Formulario Público (validateStep2)', () => {
    it('rechaza títulos con menos de 3 caracteres (límite 2)', () => {
      const state2 = createWizardState({ gacetilla: 'AB' });
      const errors2 = validateStep2(state2);
      expect(errors2['titulo_pedido.gacetilla']).toBe('Ingresá un título de 3 a 50 caracteres para este pedido.');

      const stateEmpty = createWizardState({ gacetilla: '  ' });
      const errorsEmpty = validateStep2(stateEmpty);
      expect(errorsEmpty['titulo_pedido.gacetilla']).toBe('Ingresá un título de 3 a 50 caracteres para este pedido.');
    });

    it('acepta títulos en el límite inferior de 3 caracteres', () => {
      const state3 = createWizardState({ gacetilla: 'ABC' });
      const errors3 = validateStep2(state3);
      expect(errors3['titulo_pedido.gacetilla']).toBeUndefined();
    });

    it('acepta títulos en el límite superior de 50 caracteres', () => {
      const title50 = 'A'.repeat(50);
      expect(title50.length).toBe(50);
      const state50 = createWizardState({ gacetilla: title50 });
      const errors50 = validateStep2(state50);
      expect(errors50['titulo_pedido.gacetilla']).toBeUndefined();
    });

    it('rechaza títulos con más de 50 caracteres (límite 51)', () => {
      const title51 = 'A'.repeat(51);
      expect(title51.length).toBe(51);
      const state51 = createWizardState({ gacetilla: title51 });
      const errors51 = validateStep2(state51);
      expect(errors51['titulo_pedido.gacetilla']).toBe('Ingresá un título de 3 a 50 caracteres para este pedido.');
    });

    it('rechaza títulos que contengan etiquetas HTML', () => {
      const stateHtml1 = createWizardState({ gacetilla: 'Título con <b>HTML</b>' });
      expect(validateStep2(stateHtml1)['titulo_pedido.gacetilla']).toBe('El título del pedido no puede contener etiquetas HTML.');

      const stateHtml2 = createWizardState({ gacetilla: '<script>alert(1)</script>' });
      expect(validateStep2(stateHtml2)['titulo_pedido.gacetilla']).toBe('El título del pedido no puede contener etiquetas HTML.');
    });

    it('valida títulos independientes por cada pieza en pedidos múltiples', () => {
      const multiState = createWizardState(
        { flyer_rrss: 'Flyer Vacunación', otros_diseno: 'X' },
        ['diseno_grafico']
      );
      const errs = validateStep2(multiState);
      expect(errs['titulo_pedido.flyer_rrss']).toBeUndefined();
      expect(errs['titulo_pedido.otros_diseno']).toBe('Ingresá un título de 3 a 50 caracteres para este pedido.');
    });
  });

  describe('Frontend — Componentes de UI', () => {
    it('Step2Servicios define minLength=3 y maxLength=50 en el input de título', () => {
      const step2Code = read('pedidos-medios/frontend/src/components/form/Step2Servicios.tsx');
      expect(step2Code).toContain('minLength={3}');
      expect(step2Code).toContain('maxLength={50}');
      expect(step2Code).not.toContain('maxLength={200}');
    });

    it('CargaInternaModal define minLength=3 y maxLength=50 en el input y valida límites y HTML', () => {
      const modalCode = read('pedidos-medios/frontend/src/components/CargaInternaModal.tsx');
      expect(modalCode).toContain('minLength={3}');
      expect(modalCode).toContain('maxLength={50}');
      expect(modalCode).toContain('cleanTitulo.length < 3');
      expect(modalCode).toContain('cleanTitulo.length > 50');
      expect(modalCode).toContain('/<[^>]*>/.test(cleanTitulo)');
    });
  });

  describe('Migración SQL — Reglas de base de datos para INC-04', () => {
    const migrationSql = read('supabase/migrations/20261110000003_inc04_inc08_title_limits_and_mp4_support.sql');

    it('actualiza cam09_require_new_pedido_title con límites 3 a 50 y chequeo HTML', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.cam09_require_new_pedido_title()');
      expect(migrationSql).toContain('char_length(v_title) < 3 OR char_length(v_title) > 50');
      expect(migrationSql).toContain("RAISE EXCEPTION 'TITLE_REQUIRED: Cada pedido debe tener un título de 3 a 50 caracteres'");
      expect(migrationSql).toContain("v_title ~ '<[^>]*>'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'TITLE_INVALID: El título no puede contener etiquetas HTML'");
    });

    it('preserva históricos al mantener el trigger exclusivamente como BEFORE INSERT', () => {
      expect(migrationSql).toContain('BEFORE INSERT ON public.pedidos');
      expect(migrationSql).toContain('FOR EACH ROW EXECUTE FUNCTION public.cam09_require_new_pedido_title()');
      // No debe haber triggers BEFORE UPDATE para títulos
      expect(migrationSql).not.toContain('BEFORE UPDATE ON public.pedidos');
      expect(migrationSql).not.toContain('UPDATE OF titulo ON public.pedidos');
    });

    it('actualiza pedido_create_internal con límites 3 a 50 y chequeo HTML', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.pedido_create_internal(');
      expect(migrationSql).toContain('char_length(v_titulo_clean) < 3 OR char_length(v_titulo_clean) > 50');
      expect(migrationSql).toContain("RAISE EXCEPTION 'TITLE_REQUIRED: El título del pedido es obligatorio y debe tener entre 3 y 50 caracteres'");
      expect(migrationSql).toContain("v_titulo_clean ~ '<[^>]*>'");
    });

    it('no realiza truncamiento silencioso en ninguna función', () => {
      expect(migrationSql).not.toMatch(/substr(?:ing)?\s*\(\s*v_title/i);
      expect(migrationSql).not.toMatch(/substr(?:ing)?\s*\(\s*v_titulo_clean/i);
      expect(migrationSql).not.toMatch(/left\s*\(\s*v_title/i);
    });
  });
});

describe('INC-08 — Soporte de archivos video/mp4 hasta 25 MB', () => {
  const migrationSql = read('supabase/migrations/20261110000003_inc04_inc08_title_limits_and_mp4_support.sql');

  it('submission_create_core incorpora video/mp4 en la lista blanca de tipos MIME', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.submission_create_core(p_payload jsonb)');
    expect(migrationSql).toContain("'video/mp4'");
  });

  it('submission_create_core conserva todos los formatos contractuales baseline', () => {
    expect(migrationSql).toContain("'application/pdf'");
    expect(migrationSql).toContain("'image/png'");
    expect(migrationSql).toContain("'image/jpeg'");
    expect(migrationSql).toContain("'image/jpg'");
    expect(migrationSql).toContain("'application/vnd.openxmlformats-officedocument.wordprocessingml.document'");
    expect(migrationSql).toContain("'application/zip'");
    expect(migrationSql).toContain("'application/x-zip-compressed'");
    expect(migrationSql).toContain("'application/x-zip'");
  });

  it('mantiene el límite contractual estricto de 25 MB (26.214.400 bytes)', () => {
    expect(migrationSql).toContain('IF v_file_size > 26214400 THEN');
    expect(migrationSql).toContain("RAISE EXCEPTION 'FILE_SIZE_EXCEEDED: El archivo % excede el límite máximo de 25 MB (% bytes)'");
  });

  it('mantiene la excepción FILE_MIME_UNSUPPORTED para tipos MIME no permitidos', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'FILE_MIME_UNSUPPORTED: Tipo MIME no permitido para el archivo %: %'");
  });

  it('mantiene el registro de decisiones OPEN-014 en estado ABIERTO', () => {
    const openDecisions = JSON.parse(read('docs/REGISTRO_DECISIONES_OPEN.json'));
    const item = openDecisions.canonical_decisions?.['OPEN-014'];
    expect(item).toBeDefined();
    expect(item.estado).toBe('ABIERTO');
    expect(item.descripcion).toContain('audiovisuales');
  });
});
