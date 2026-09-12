/**
 * Tests de integración de componentes para el Formulario Público y Wizard
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioPublicoPage } from '../pages/FormularioPublicoPage';

// Mock scrollTo
window.scrollTo = vi.fn();

describe('FormularioPublicoPage — Wizard Component Tests', () => {
  it('debe navegar por los pasos al completar los campos requeridos', async () => {
    render(<FormularioPublicoPage />);

    // Paso 1: Intentar continuar sin datos debe mostrar errores
    const nextBtn1 = screen.getByRole('button', { name: /Continuar al Detalle de Solicitudes/i });
    fireEvent.click(nextBtn1);

    expect(screen.getByText(/Ingresá tu nombre y apellido/i)).toBeInTheDocument();

    // Completar Paso 1
    fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), {
      target: { value: 'Juan Pérez' },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono \/ WhatsApp/i), {
      target: { value: '+542901998877' },
    });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'juan.perez@tierradelfuego.gob.ar' },
    });
    fireEvent.change(screen.getByLabelText(/Área, Ministerio o Dependencia/i), {
      target: { value: 'Secretaría General' },
    });

    // Seleccionar Diseño Gráfico y Gacetilla
    fireEvent.click(screen.getByLabelText(/Diseño gráfico/i));
    fireEvent.click(screen.getByLabelText(/Gacetilla de prensa/i));

    fireEvent.click(nextBtn1);

    // Ahora debemos estar en el Paso 2
    expect(
      screen.getByRole('heading', { level: 2, name: /2\. Detalle y Especificación de Servicios/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Diseño Gráfico/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Gacetilla de Prensa/i })).toBeInTheDocument();

    // En Diseño Gráfico, seleccionar Flyer
    fireEvent.click(screen.getByRole('checkbox', { name: /Flyer para redes sociales/i }));
    fireEvent.change(screen.getByLabelText(/Formato de la imagen/i), {
      target: { value: 'Cuadrado 1:1 (Feed Instagram/Facebook)' },
    });
    fireEvent.change(screen.getByLabelText(/Fecha límite requerida/i), {
      target: { value: '2026-10-15' },
    });
    fireEvent.change(screen.getByLabelText(/Texto y contenido que debe incluir el flyer/i), {
      target: { value: 'Texto institucional sobre inscripciones abiertas.' },
    });

    // En Gacetilla
    fireEvent.change(screen.getByLabelText(/Referente o vocero de contacto/i), {
      target: { value: 'Lic. Laura Martínez' },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono de contacto directo/i), {
      target: { value: '+542901112233' },
    });
    fireEvent.change(screen.getByLabelText(/Datos del hecho noticioso \/ Información base/i), {
      target: { value: 'Se abren las inscripciones para el programa provincial de capacitaciones 2026.' },
    });

    // Continuar al Paso 3 (Adjuntos)
    const nextBtn2 = screen.getByRole('button', { name: /Continuar a Adjuntos y Enlaces/i });
    fireEvent.click(nextBtn2);

    expect(
      screen.getByRole('heading', { level: 2, name: /3\. Archivos Adjuntos y Enlaces de Referencia/i })
    ).toBeInTheDocument();

    // Continuar al Paso 4 (Resumen)
    const nextBtn3 = screen.getByRole('button', { name: /Continuar al Resumen y Confirmación/i });
    fireEvent.click(nextBtn3);

    expect(
      screen.getByRole('heading', { level: 2, name: /4\. Resumen y Confirmación Final/i })
    ).toBeInTheDocument();

    // Verificar que el resumen muestre los 2 PEDs a generar
    expect(screen.getByText(/Solicitudes a Generar \(2 PEDs\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Flyer para redes sociales/i)).toBeInTheDocument();
    expect(screen.getByText(/Gacetilla de prensa/i)).toBeInTheDocument();
    expect(screen.getByText(/Juan Pérez/i)).toBeInTheDocument();

    // Verificar botón de envío deshabilitado hasta tildar confirmación
    const submitBtn = screen.getByRole('button', { name: /Enviar solicitudes/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que revisé los datos/i }));
    expect(submitBtn).not.toBeDisabled();
  });
});
