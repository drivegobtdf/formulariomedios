/** CAM-09: contrato de títulos por PED; PostgreSQL E2E y QA UI obligatorios. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateStep2 } from '../../pedidos-medios/frontend/src/validation/formValidation';
import type { FormWizardState } from '../../pedidos-medios/frontend/src/types/form';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261105100000_cam09_required_pedido_title.sql');

const basicState = (titles: Record<string, string>): FormWizardState => ({
  submission_key: 'cam09-test',
  current_step: 2,
  contacto: { nombre_apellido: '', telefono: '', correo: '', area_solicitante: '' },
  selected_categorias: ['gacetilla'],
  diseno_piezas: [],
  titulos_pedidos: titles,
  diseno_data: {},
  gacetilla_data: { referente_contacto: 'Ana Prueba', telefono_contacto: '123456789', informacion_base: 'Información suficiente para gacetilla de prueba.' },
  archivos: [], links: [], confirmado: false, submitting: false,
});

describe('CAM-09 — título obligatorio por pedido', () => {
  it('obliga título en cada PED seleccionado en el paso 2', () => {
    expect(validateStep2(basicState({}))['titulo_pedido.gacetilla']).toBeDefined();
    expect(validateStep2(basicState({ gacetilla: '  ' }))['titulo_pedido.gacetilla']).toBeDefined();
    expect(validateStep2(basicState({ gacetilla: 'Informe de prensa' }))['titulo_pedido.gacetilla']).toBeUndefined();
  });
  it('valida cada pieza gráfica seleccionada de forma independiente', () => {
    const state = basicState({ flyer_rrss: 'Título de flyer' });
    state.selected_categorias = ['diseno_grafico'];
    state.diseno_piezas = ['flyer_rrss', 'otros_diseno'];
    const errs = validateStep2(state);
    expect(errs['titulo_pedido.flyer_rrss']).toBeUndefined();
    expect(errs['titulo_pedido.otros_diseno']).toBeDefined();
  });
  it('incorpora título en el payload de cada pieza y lo visualiza en el resumen', () => {
    const page = read('pedidos-medios/frontend/src/pages/FormularioPublicoPage.tsx');
    const step = read('pedidos-medios/frontend/src/components/form/Step2Servicios.tsx');
    const summary = read('pedidos-medios/frontend/src/components/form/Step4Resumen.tsx');
    expect(page).toContain("titulo: (state.titulos_pedidos?.[p.tipo_slug] || '').trim()");
    expect(step).toContain('Título del pedido');
    expect(summary).toContain('p.titulo_pedido');
  });
  it('se aplica a ambos orígenes y preserva filas anteriores por ser BEFORE INSERT', () => {
    expect(migration).toContain('BEFORE INSERT ON public.pedidos');
    expect(migration).toContain("NEW.informacion_especifica->>'titulo'");
    expect(migration).toContain('NEW.titulo := v_title;');
    expect(migration).toContain('TITLE_REQUIRED');
    expect(migration).not.toContain('UPDATE public.pedidos');
  });
});
