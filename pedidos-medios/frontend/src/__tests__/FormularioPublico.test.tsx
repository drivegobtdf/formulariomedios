/**
 * Tests de integración de componentes para el Formulario Público y Wizard
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioPublicoPage } from '../pages/FormularioPublicoPage';
import { getLocalTodayDateString } from '../validation/formValidation';

// Mock scrollTo
window.scrollTo = vi.fn();

describe('FormularioPublicoPage — Portada Institucional y Wizard Tests', () => {
  it('1. Portada Institucional Home: Muestra presentación, logo, 3 pasos simultáneos y CTAs sin desplegar campos de formulario inicialmente', () => {
    render(<FormularioPublicoPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /Solicitud de Comunicación y Medios/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/SISTEMA OFICIAL DE PEDIDOS/i)).toBeInTheDocument();

    // Las 3 cards se muestran juntas simultáneamente
    expect(screen.getByText(/Cargá tu pedido/i)).toBeInTheDocument();
    expect(screen.getByText(/Seguí el avance/i)).toBeInTheDocument();
    expect(screen.getByText(/Recibí el material/i)).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Nueva solicitud/i });
    expect(startBtn).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mis solicitudes/i })).toBeInTheDocument();

    // No debe haber inputs del formulario en la portada
    expect(screen.queryByLabelText(/Nombre y apellido/i)).not.toBeInTheDocument();

    // Al hacer clic en Iniciar Nueva Solicitud, se despliega el wizard
    fireEvent.click(startBtn);
    expect(screen.getByRole('heading', { level: 2, name: /1\. Datos de Contacto y Servicios Requeridos/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre y apellido/i)).toBeInTheDocument();
  });

  it('debe navegar por los pasos al completar los campos requeridos', async () => {
    render(<FormularioPublicoPage initialShowWizard={true} />);

    // Paso 1: Intentar continuar sin datos debe mostrar errores
    const nextBtn1 = screen.getByRole('button', { name: /^Continuar$/i });
    fireEvent.click(nextBtn1);

    expect(screen.getByText(/Ingresá tu nombre y apellido/i)).toBeInTheDocument();

    // Completar Paso 1
    fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), {
      target: { value: 'Juan Pérez' },
    });
    fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), {
      target: { value: '2901998877' },
    });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'juan.perez@tierradelfuego.gob.ar' },
    });
    fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), {
      target: { value: 'Secretaría General' },
    });

    // Seleccionar Diseño Gráfico y Gacetilla
    fireEvent.click(screen.getByLabelText(/Diseño gráfico/i));
    fireEvent.click(screen.getByLabelText(/Gacetilla de prensa/i));

    fireEvent.click(nextBtn1);

    // Ahora debemos estar en el Paso 2
    expect(
      screen.getByRole('heading', { level: 2, name: /2\. Detalle de la solicitud/i })
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
    const nextBtn2 = screen.getByRole('button', { name: /^Continuar$/i });
    fireEvent.click(nextBtn2);

    expect(
      screen.getByRole('heading', { level: 2, name: /3\. Archivos y enlaces/i })
    ).toBeInTheDocument();

    // Continuar al Paso 4 (Resumen)
    const nextBtn3 = screen.getByRole('button', { name: /^Continuar$/i });
    fireEvent.click(nextBtn3);

    expect(
      screen.getByRole('heading', { level: 2, name: /4\. Revisá y enviá/i })
    ).toBeInTheDocument();

    // Verificar que el resumen muestre los 2 PEDs a generar
    expect(screen.getByText(/Solicitudes \(2 PEDs\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Flyer para redes sociales/i)).toBeInTheDocument();
    expect(screen.getByText(/Gacetilla de prensa/i)).toBeInTheDocument();
    expect(screen.getByText(/Juan Pérez/i)).toBeInTheDocument();

    // Verificar botón de envío deshabilitado hasta tildar confirmación
    const submitBtn = screen.getByRole('button', { name: /Enviar solicitudes/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Revisé los datos y son correctos/i }));
    expect(submitBtn).not.toBeDisabled();
  });

  it('debe aceptar direcciones de correo electrónico no institucionales válidas', async () => {
    const { validateStep1 } = await import('../validation/formValidation');
    const validContacto = {
      nombre_apellido: 'Carlos Gómez',
      telefono: '+54 2901 123456',
      correo: 'carlos.gomez@empresa-privada.com.ar',
      area_solicitante: 'Asociación Civil',
    };
    const errors = validateStep1(validContacto, ['diseno_grafico']);
    expect(errors.correo).toBeUndefined();
    expect(Object.keys(errors).length).toBe(0);
  });

  it('debe renderizar Step5Resultado mostrando códigos PED reales y sin exponer token de tracking', async () => {
    const { Step5Resultado } = await import('../components/form/Step5Resultado');
    const mockResult = {
      success: true,
      envio_id: 'e0000000-0000-0000-0000-000000000001',
      submission_key: 's0000000-0000-0000-0000-000000000001',
      pedidos: [
        {
          pedido_id: 'p0000000-0000-0000-0000-000000000001',
          codigo_ped: 'PED-2026-D000101',
          client_request_ref: 'c1',
          categoria_slug: 'diseno_grafico' as const,
          tipo_slug: 'flyer_rrss',
          tracking_token: 'raw_secret_tracking_token_do_not_expose_123',
        },
      ],
      archivos: [],
      idempotent_replay: false,
    };

    const mockPieces = [
      {
        client_request_ref: 'c1',
        categoria_slug: 'diseno_grafico' as const,
        tipo_slug: 'flyer_rrss',
        codigo_ped_prefijo: 'D' as const,
        piece_title: 'Flyer para Redes',
        data: {},
      },
    ];

    const mockContacto = {
      nombre_apellido: 'Carlos Gómez',
      telefono: '+54 2901 123456',
      correo: 'carlos.gomez@gmail.com',
      area_solicitante: 'Prensa Externa',
    };

    render(
      <Step5Resultado
        result={mockResult}
        pieces={mockPieces}
        contacto={mockContacto}
        onNewSubmission={() => {}}
      />
    );

    // Debe mostrar el código PED real y el correo
    expect(screen.getByText('PED-2026-D000101')).toBeInTheDocument();
    expect(screen.getByText('carlos.gomez@gmail.com')).toBeInTheDocument();

    // NO debe mostrar el tracking token en el DOM
    expect(screen.queryByText(/raw_secret_tracking_token/i)).not.toBeInTheDocument();

    // NO debe tener botones a seguimiento público (F7)
    expect(screen.queryByRole('link', { name: /seguimiento/i })).not.toBeInTheDocument();
  });

  describe('Validación Reactiva y UX Flyer RRSS (Escenarios A - N)', () => {
    const setupStep2WithFlyer = async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Completar Paso 1 válido
      fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), {
        target: { value: 'Juan Pérez' },
      });
      fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), {
        target: { value: '2901998877' },
      });
      fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
        target: { value: 'juan.perez@tierradelfuego.gob.ar' },
      });
      fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), {
        target: { value: 'Secretaría General' },
      });

      // Seleccionar Diseño Gráfico
      fireEvent.click(screen.getByLabelText(/Diseño gráfico/i));

      // Avanzar a Paso 2
      const nextBtn1 = screen.getByRole('button', { name: /^Continuar$/i });
      fireEvent.click(nextBtn1);

      // Seleccionar pieza Flyer para redes sociales
      const flyerCheckbox = screen.getByRole('checkbox', { name: /Flyer para redes sociales/i });
      fireEvent.click(flyerCheckbox);

      return {
        nextBtn2: screen.getByRole('button', { name: /^Continuar$/i }),
      };
    };

    it('Escenario A & C & F: Campos vacíos al intentar continuar muestran errores visibles específicos', async () => {
      const { nextBtn2 } = await setupStep2WithFlyer();

      // Intentar continuar con campos de flyer vacíos
      fireEvent.click(nextBtn2);

      // Formato
      expect(screen.getByText(/Seleccioná el formato del flyer\./i)).toBeInTheDocument();
      // Textarea vacío (Escenario C)
      expect(
        screen.getByText(/Ingresá el texto o contenido que debe llevar el flyer\./i)
      ).toBeInTheDocument();
      // Fecha vacía (Escenario F)
      expect(screen.getByText(/Indicá la fecha límite de entrega\./i)).toBeInTheDocument();
    });

    it('Escenario B: Formato vacío con error desaparece inmediatamente al seleccionar opción sin nuevo submit', async () => {
      const { nextBtn2 } = await setupStep2WithFlyer();

      fireEvent.click(nextBtn2);
      expect(screen.getByText(/Seleccioná el formato del flyer\./i)).toBeInTheDocument();

      const selectFormato = screen.getByLabelText(/Formato de la imagen/i);
      expect(selectFormato).toHaveClass('error');
      expect(selectFormato).toHaveAttribute('aria-invalid', 'true');

      // Seleccionar un formato válido
      fireEvent.change(selectFormato, {
        target: { value: 'Cuadrado 1:1 (Feed Instagram/Facebook)' },
      });

      // El error debe desaparecer inmediatamente
      expect(screen.queryByText(/Seleccioná el formato del flyer\./i)).not.toBeInTheDocument();
      expect(selectFormato).not.toHaveClass('error');
      expect(selectFormato).toHaveAttribute('aria-invalid', 'false');
    });

    it('Escenario D & E: Textarea informa mínimo 5 caracteres, actualiza mensaje si es corto y desaparece al alcanzar el mínimo', async () => {
      const { nextBtn2 } = await setupStep2WithFlyer();

      const textarea = screen.getByLabelText(/Texto y contenido que debe incluir el flyer/i);
      expect(screen.getByText(/0 caracteres · mínimo 5/i)).toBeInTheDocument();

      // Intentar avanzar para provocar error
      fireEvent.click(nextBtn2);
      expect(
        screen.getByText(/Ingresá el texto o contenido que debe llevar el flyer\./i)
      ).toBeInTheDocument();
      expect(textarea).toHaveClass('error');

      // Escribir 4 caracteres (menor a 5) -> Escenario D
      fireEvent.change(textarea, { target: { value: 'Hola' } });
      expect(screen.getByText(/4 caracteres · mínimo 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Ingresá al menos 5 caracteres\./i)).toBeInTheDocument();
      expect(textarea).toHaveClass('error');

      // Escribir 5 caracteres -> Escenario E
      fireEvent.change(textarea, { target: { value: 'Hola!' } });
      expect(screen.getByText(/5 caracteres · mínimo 5/i)).toBeInTheDocument();
      expect(screen.queryByText(/Ingresá al menos 5 caracteres\./i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Ingresá el texto o contenido que debe llevar el flyer\./i)
      ).not.toBeInTheDocument();
      expect(textarea).not.toHaveClass('error');
      expect(textarea).toHaveAttribute('aria-invalid', 'false');
    });

    it('Escenario G, H, I, J, K, L: Validación reactiva de fecha límite (ayer inválida, hoy y futura válidas, corrección reactiva)', async () => {
      const { nextBtn2 } = await setupStep2WithFlyer();

      const dateInput = screen.getByLabelText(/Fecha límite requerida/i);
      const todayStr = getLocalTodayDateString();

      // Calcular fecha de ayer y mañana en base a fecha local
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const yesterdayStr = getLocalTodayDateString(yesterday);
      const tomorrowStr = getLocalTodayDateString(tomorrow);

      // Ingresar fecha de ayer (Escenario G)
      fireEvent.change(dateInput, { target: { value: yesterdayStr } });
      fireEvent.click(nextBtn2);

      expect(
        screen.getByText('La fecha no puede ser anterior a hoy.')
      ).toBeInTheDocument();
      expect(dateInput).toHaveClass('error');
      expect(dateInput).toHaveAttribute('aria-invalid', 'true');

      // Escenario J: Cambiar a hoy -> desaparece error sin nuevo submit (Escenario H: hoy es válida)
      fireEvent.change(dateInput, { target: { value: todayStr } });
      expect(
        screen.queryByText('La fecha no puede ser anterior a hoy.')
      ).not.toBeInTheDocument();
      expect(dateInput).not.toHaveClass('error');
      expect(dateInput).toHaveAttribute('aria-invalid', 'false');

      // Volver a poner fecha pasada
      fireEvent.change(dateInput, { target: { value: yesterdayStr } });
      fireEvent.click(nextBtn2);
      expect(
        screen.getByText('La fecha no puede ser anterior a hoy.')
      ).toBeInTheDocument();

      // Escenario K: Cambiar a fecha futura -> desaparece error sin nuevo submit (Escenario I: futura es válida)
      fireEvent.change(dateInput, { target: { value: tomorrowStr } });
      expect(
        screen.queryByText('La fecha no puede ser anterior a hoy.')
      ).not.toBeInTheDocument();
      expect(dateInput).not.toHaveClass('error');
      expect(dateInput).toHaveAttribute('aria-invalid', 'false');
    });

    it('Escenario M & N: Corrección total de campos avanza al Paso 3 y conserva datos ingresados', async () => {
      const { nextBtn2 } = await setupStep2WithFlyer();

      // Provocar errores
      fireEvent.click(nextBtn2);

      const selectFormato = screen.getByLabelText(/Formato de la imagen/i);
      const dateInput = screen.getByLabelText(/Fecha límite requerida/i);
      const textarea = screen.getByLabelText(/Texto y contenido que debe incluir el flyer/i);

      // Corregir todos los campos
      const textoPrueba = 'Texto completo del flyer institucional con datos oficiales.';
      const todayStr = getLocalTodayDateString();

      fireEvent.change(selectFormato, {
        target: { value: 'Vertical 9:16 (Historias / Reels / WhatsApp)' },
      });
      fireEvent.change(dateInput, { target: { value: todayStr } });
      fireEvent.change(textarea, { target: { value: textoPrueba } });

      // Verificar que los valores se conservaron en los inputs (Escenario N)
      expect(selectFormato).toHaveValue('Vertical 9:16 (Historias / Reels / WhatsApp)');
      expect(dateInput).toHaveValue(todayStr);
      expect(textarea).toHaveValue(textoPrueba);

      // Escenario M: Pulsar Continuar permite avanzar al Paso 3 normalmente
      fireEvent.click(nextBtn2);

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /3\. Archivos y enlaces/i,
        })
      ).toBeInTheDocument();
    });
  });

  describe('Paso 3: Enlaces al Material - Validación Reactiva y Labels Persistentes', () => {
    const setupStep3 = async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Paso 1
      fireEvent.change(screen.getByLabelText(/Nombre y Apellido/i), {
        target: { value: 'Juan Pérez' },
      });
      fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), {
        target: { value: '2901998877' },
      });
      fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
        target: { value: 'juan.perez@tierradelfuego.gob.ar' },
      });
      fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), {
        target: { value: 'Secretaría General' },
      });
      fireEvent.click(screen.getByLabelText(/Diseño gráfico/i));

      // Avanzar a Paso 2
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));

      // Completar Paso 2 con Flyer válido
      fireEvent.click(screen.getByRole('checkbox', { name: /Flyer para redes sociales/i }));
      fireEvent.change(screen.getByLabelText(/Formato de la imagen/i), {
        target: { value: 'Cuadrado 1:1 (Feed Instagram/Facebook)' },
      });
      fireEvent.change(screen.getByLabelText(/Fecha límite requerida/i), {
        target: { value: getLocalTodayDateString() },
      });
      fireEvent.change(screen.getByLabelText(/Texto y contenido que debe incluir el flyer/i), {
        target: { value: 'Texto de prueba para el flyer' },
      });

      // Avanzar a Paso 3
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /3\. Archivos y enlaces/i,
        })
      ).toBeInTheDocument();
    };

    it('Labels persistentes, validación reactiva de URL y retención de descripción (Tests M & N)', async () => {
      await setupStep3();

      // Agregar un enlace
      fireEvent.click(screen.getByRole('button', { name: /\+ Agregar enlace/i }));

      // Verificar labels visibles y persistentes
      expect(screen.getByLabelText(/Enlace al material/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Descripción$/i)).toBeInTheDocument();

      const urlInput = screen.getByLabelText(/Enlace al material/i);
      const descInput = screen.getByLabelText(/^Descripción$/i);

      // Ingresar URL inválida (hola) y descripción (fotos)
      fireEvent.change(urlInput, { target: { value: 'hola' } });
      fireEvent.change(descInput, { target: { value: 'fotos en alta resolución' } });

      // Intentar continuar al Paso 4
      const nextBtn3 = screen.getByRole('button', { name: /^Continuar$/i });
      fireEvent.click(nextBtn3);

      // Verificar que se muestra el error exacto y el estado de error
      expect(
        screen.getByText('Enlace no válido. Ingresá la dirección completa con http:// o https://.')
      ).toBeInTheDocument();
      expect(urlInput).toHaveClass('error');
      expect(urlInput).toHaveAttribute('aria-invalid', 'true');

      // Test M: El usuario corrige a una URL válida con https:// -> desaparece el error inmediatamente sin nuevo click
      fireEvent.change(urlInput, { target: { value: 'https://ejemplo.com' } });

      expect(
        screen.queryByText('Enlace no válido. Ingresá la dirección completa con http:// o https://.')
      ).not.toBeInTheDocument();
      expect(urlInput).not.toHaveClass('error');
      expect(urlInput).toHaveAttribute('aria-invalid', 'false');

      // Test N: La descripción se conserva intacta
      expect(descInput).toHaveValue('fotos en alta resolución');

      // Probar ingresar URL con http:// -> también es válida y no genera error
      fireEvent.change(urlInput, { target: { value: 'http://ejemplo.com/material' } });
      expect(
        screen.queryByText('Enlace no válido. Ingresá la dirección completa con http:// o https://.')
      ).not.toBeInTheDocument();
      expect(urlInput).not.toHaveClass('error');

      // Si el usuario introduce javascript:alert(1) y clickea continuar -> debe mostrar error
      fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });
      fireEvent.click(nextBtn3);
      expect(
        screen.getByText('Enlace no válido. Ingresá la dirección completa con http:// o https://.')
      ).toBeInTheDocument();
      expect(urlInput).toHaveClass('error');

      // Corregir a Google Drive link con https:// -> desaparece inmediatamente
      fireEvent.change(urlInput, {
        target: { value: 'https://drive.google.com/file/d/123456789/view' },
      });
      expect(
        screen.queryByText('Enlace no válido. Ingresá la dirección completa con http:// o https://.')
      ).not.toBeInTheDocument();
      expect(urlInput).not.toHaveClass('error');
      expect(descInput).toHaveValue('fotos en alta resolución');

      // Continuar al Paso 4
      fireEvent.click(nextBtn3);
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /4\. Revisá y enviá/i,
        })
      ).toBeInTheDocument();
    });
  });

  describe('Paso 1: Selector Internacional de WhatsApp y Validación Reactiva', () => {
    it('debe tener Argentina por defecto, validar reglas locales y revalidar reactivamente sin nuevo submit', async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Verificar país por defecto AR
      const countrySelect = screen.getByLabelText(/Seleccionar país para WhatsApp/i) as HTMLSelectElement;
      expect(countrySelect.value).toBe('AR');
      expect(screen.getByText(/Ingresá código de área y número, sin 0 y sin 15\./i)).toBeInTheDocument();

      const phoneInput = screen.getByLabelText(/Número de WhatsApp/i);
      const nextBtn1 = screen.getByRole('button', { name: /^Continuar$/i });

      // Ingresar número con 0 inicial -> 02964477578
      fireEvent.change(phoneInput, { target: { value: '02964477578' } });

      // Intentar continuar
      fireEvent.click(nextBtn1);

      // Error visible
      expect(screen.getByText('Ingresá el número sin el 0 inicial.')).toBeInTheDocument();
      expect(phoneInput).toHaveClass('error');
      expect(phoneInput).toHaveAttribute('aria-invalid', 'true');

      // Corrección reactiva: usuario borra el 0 -> 2964477578
      fireEvent.change(phoneInput, { target: { value: '2964477578' } });

      // El error debe desaparecer inmediatamente sin pulsar Continuar
      expect(screen.queryByText('Ingresá el número sin el 0 inicial.')).not.toBeInTheDocument();
      expect(phoneInput).not.toHaveClass('error');
      expect(phoneInput).toHaveAttribute('aria-invalid', 'false');

      // Probar formato con 15
      fireEvent.change(phoneInput, { target: { value: '296415477578' } });
      fireEvent.click(nextBtn1);
      expect(screen.getByText('Ingresá el número sin el prefijo 15.')).toBeInTheDocument();
      expect(phoneInput).toHaveClass('error');

      // Cambiar país a Chile (CL)
      fireEvent.change(countrySelect, { target: { value: 'CL' } });
      expect(countrySelect.value).toBe('CL');
      expect(screen.getByText(/Ingresá un número de WhatsApp válido para Chile\./i)).toBeInTheDocument();

      // Ingresar número válido chileno
      fireEvent.change(phoneInput, { target: { value: '912345678' } });
      expect(screen.queryByText(/Ingresá un número de WhatsApp válido para Chile\./i)).not.toBeInTheDocument();
      expect(phoneInput).not.toHaveClass('error');

      // Volver a Argentina y escribir formato con guiones/espacios
      fireEvent.change(countrySelect, { target: { value: 'AR' } });
      fireEvent.change(phoneInput, { target: { value: '2964 47-7578' } });
      expect(phoneInput).not.toHaveClass('error');
    });
  });

  describe('Paso 2: Validación Centralizada de Fechas Pasadas y Reactividad UI', () => {
    it('Cobertura de Eventos: debe poseer atributo min, rechazar fecha de ayer y limpiar reactivamente al ingresar hoy o futuro', async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Completar Paso 1 seleccionando Cobertura de Eventos
      fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), {
        target: { value: 'Esteban Martínez' },
      });
      fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), {
        target: { value: '2901445566' },
      });
      fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
        target: { value: 'esteban@tierradelfuego.gob.ar' },
      });
      fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), {
        target: { value: 'Dirección de Protocolo' },
      });

      fireEvent.click(screen.getByLabelText(/Cobertura de eventos/i));

      const nextBtn1 = screen.getByRole('button', { name: /^Continuar$/i });
      fireEvent.click(nextBtn1);

      // En Paso 2 - Cobertura de Eventos
      expect(
        screen.getByRole('heading', { level: 3, name: /Cobertura de Eventos/i })
      ).toBeInTheDocument();

      const fechaInput = screen.getByLabelText(/Fecha del evento/i) as HTMLInputElement;
      const today = getLocalTodayDateString();
      expect(fechaInput).toHaveAttribute('min', today);

      // Completar otros campos obligatorios de Cobertura
      fireEvent.change(screen.getByLabelText(/Hora de inicio/i), { target: { value: '10:00' } });
      fireEvent.change(screen.getByLabelText(/Lugar \/ Dirección/i), { target: { value: 'Gimnasio Petrina' } });
      fireEvent.change(screen.getByLabelText(/Ciudad/i), { target: { value: 'Ushuaia' } });
      fireEvent.click(screen.getByLabelText(/^Sí$/i));
      fireEvent.change(screen.getByLabelText(/¿Qué autoridades asistirán\?/i), { target: { value: 'Gobernador' } });
      fireEvent.change(screen.getByLabelText(/Requerimientos de cobertura/i), { target: { value: 'Cobertura fotográfica completa' } });

      // Ingresar fecha pasada: 2026-09-13
      fireEvent.change(fechaInput, { target: { value: '2026-09-13' } });

      // Intentar avanzar al Paso 3
      const nextBtn2 = screen.getByRole('button', { name: /^Continuar$/i });
      fireEvent.click(nextBtn2);

      // Debe mostrar error de fecha pasada
      expect(screen.getByText('La fecha no puede ser anterior a hoy.')).toBeInTheDocument();
      expect(fechaInput).toHaveClass('error');
      expect(fechaInput).toHaveAttribute('aria-invalid', 'true');

      // Corrección reactiva: cambiar a fecha de hoy -> el error desaparece de inmediato sin presionar Continuar
      fireEvent.change(fechaInput, { target: { value: today } });
      expect(screen.queryByText('La fecha no puede ser anterior a hoy.')).not.toBeInTheDocument();
      expect(fechaInput).not.toHaveClass('error');
      expect(fechaInput).toHaveAttribute('aria-invalid', 'false');

      // Avanzar al Paso 3 exitosamente
      fireEvent.click(nextBtn2);
      expect(
        screen.getByRole('heading', { level: 2, name: /3\. Archivos y enlaces/i })
      ).toBeInTheDocument();
    });

    it('Todos los servicios con fechas operativas deben incluir el atributo min con la fecha local de hoy', async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Completar Paso 1 seleccionando todos los servicios con campos de fecha
      fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), { target: { value: 'Juan' } });
      fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), { target: { value: '2901445566' } });
      fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'juan@tdf.gob.ar' } });
      fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), { target: { value: 'Medios' } });

      fireEvent.click(screen.getByLabelText(/Diseño gráfico/i));
      fireEvent.click(screen.getByLabelText(/Publicaciones en redes sociales/i));
      fireEvent.click(screen.getByLabelText(/Producción audiovisual/i));
      fireEvent.click(screen.getByLabelText(/Animación y motion graphics/i));
      fireEvent.click(screen.getByLabelText(/Transmisión en vivo \/ streaming/i));
      fireEvent.click(screen.getByLabelText(/Sitios y contenidos web/i));

      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));

      // En Diseño Gráfico -> Seleccionar Flyer e Invitación
      fireEvent.click(screen.getByRole('checkbox', { name: /Flyer para redes sociales/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Invitación digital/i }));

      const today = getLocalTodayDateString();

      // Verificar Flyer fecha límite
      expect(screen.getByLabelText(/Fecha límite requerida/i)).toHaveAttribute('min', today);

      // Verificar Invitación fecha
      expect(screen.getByLabelText(/Fecha del evento/i)).toHaveAttribute('min', today);

      // Verificar Redes Sociales fecha sugerida
      expect(screen.getByLabelText(/Fecha sugerida de publicación/i)).toHaveAttribute('min', today);

      // En Producción Audiovisual, tildar grabación
      fireEvent.click(screen.getByLabelText(/Sí, requiere grabación/i));
      expect(screen.getByLabelText(/Fecha de grabación/i)).toHaveAttribute('min', today);

      // Verificar Producción Audiovisual y Motion Graphics fecha límite
      const fechaEntregaInputs = screen.getAllByLabelText(/Fecha límite de entrega/i);
      expect(fechaEntregaInputs.length).toBeGreaterThanOrEqual(2);
      for (const input of fechaEntregaInputs) {
        expect(input).toHaveAttribute('min', today);
      }

      // Verificar Streaming fecha
      expect(screen.getByLabelText(/^Fecha$/i)).toHaveAttribute('min', today);

      // Verificar Sitios Web fecha límite
      expect(screen.getByLabelText(/Fecha límite de puesta en línea/i)).toHaveAttribute('min', today);
    });

    it('Cobertura de Eventos: Validación completa del selector "¿Asisten autoridades?" (8 reglas)', async () => {
      render(<FormularioPublicoPage initialShowWizard={true} />);

      // Completar Paso 1 seleccionando Cobertura de Eventos
      fireEvent.change(screen.getByLabelText(/Nombre y apellido/i), { target: { value: 'María López' } });
      fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), { target: { value: '2901445566' } });
      fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'maria@tdf.gob.ar' } });
      fireEvent.change(screen.getByLabelText(/Área o Dependencia/i), { target: { value: 'Protocolo' } });
      fireEvent.click(screen.getByLabelText(/Cobertura de eventos/i));

      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));

      // En Paso 2 - Cobertura de Eventos
      const today = getLocalTodayDateString();
      fireEvent.change(screen.getByLabelText(/Fecha del evento/i), { target: { value: today } });
      fireEvent.change(screen.getByLabelText(/Hora de inicio/i), { target: { value: '11:00' } });
      fireEvent.change(screen.getByLabelText(/Lugar \/ Dirección/i), { target: { value: 'Salón Malvinas' } });
      fireEvent.change(screen.getByLabelText(/Ciudad/i), { target: { value: 'Ushuaia' } });
      fireEvent.change(screen.getByLabelText(/Requerimientos de cobertura/i), { target: { value: 'Fotos institucionales' } });

      // 1. Estado inicial = '' -> ni Sí ni No están seleccionados
      const radioSi = screen.getByLabelText(/^Sí$/i) as HTMLInputElement;
      const radioNo = screen.getByLabelText(/^No$/i) as HTMLInputElement;
      expect(radioSi.checked).toBe(false);
      expect(radioNo.checked).toBe(false);
      expect(screen.queryByLabelText(/¿Qué autoridades asistirán\?/i)).not.toBeInTheDocument();

      // 2. Sin seleccionar Sí/No → intentar avanzar bloquea con mensaje
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      expect(screen.getByText('Seleccioná una opción.')).toBeInTheDocument();

      // 3. Seleccionar "Sí" → aparece campo de autoridades
      fireEvent.click(radioSi);
      expect(radioSi.checked).toBe(true);
      expect(screen.queryByText('Seleccioná una opción.')).not.toBeInTheDocument();
      const inputAutoridades = screen.getByLabelText(/¿Qué autoridades asistirán\?/i) as HTMLInputElement;
      expect(inputAutoridades).toBeInTheDocument();

      // 4. "Sí" + campo vacío → intentar avanzar bloquea con error
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      expect(screen.getByText('Indicá qué autoridades asistirán.')).toBeInTheDocument();

      // 5. "Sí" + nombres ingresados → campo válido
      fireEvent.change(inputAutoridades, { target: { value: 'Gobernador y Ministros' } });
      expect(screen.queryByText('Indicá qué autoridades asistirán.')).not.toBeInTheDocument();

      // 6. Cambiar "Sí" -> "No" → oculta el campo y limpia autoridades
      fireEvent.click(radioNo);
      expect(radioNo.checked).toBe(true);
      expect(radioSi.checked).toBe(false);
      expect(screen.queryByLabelText(/¿Qué autoridades asistirán\?/i)).not.toBeInTheDocument();

      // 7. "No" → válido sin nombres, permite avanzar al Paso 3 y luego al Paso 4
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      expect(screen.getByRole('heading', { level: 2, name: /3\. Archivos y enlaces/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      expect(screen.getByRole('heading', { level: 2, name: /4\. Revisá y enviá/i })).toBeInTheDocument();

      // 8. En Paso 4 Resumen: no muestra 'asiste_autoridades' y no muestra 'Autoridades' si fue No
      expect(screen.queryByText(/asiste_autoridades/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Autoridades:/i)).not.toBeInTheDocument();

      // Verificar caso Sí en Paso 4: volver a Paso 2, marcar Sí y completar autoridades
      fireEvent.click(screen.getAllByRole('button', { name: /^Editar$/i })[1]); // Editar solicitudes (Paso 2)
      expect(screen.getByRole('heading', { level: 3, name: /Cobertura de Eventos/i })).toBeInTheDocument();

      const radioSiAgain = screen.getByLabelText(/^Sí$/i);
      fireEvent.click(radioSiAgain);
      fireEvent.change(screen.getByLabelText(/¿Qué autoridades asistirán\?/i), {
        target: { value: 'Gobernador y Ministros' },
      });

      // Avanzar a Paso 3 y luego a Paso 4
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Continuar$/i }));
      expect(screen.getByRole('heading', { level: 2, name: /4\. Revisá y enviá/i })).toBeInTheDocument();

      // En Paso 4: muestra Autoridades con el valor y NO muestra la clave técnica asiste_autoridades
      expect(screen.queryByText(/asiste_autoridades/i)).not.toBeInTheDocument();
      expect(screen.getByText('Autoridades:')).toBeInTheDocument();
      expect(screen.getByText('Gobernador y Ministros')).toBeInTheDocument();
    });
  });
});
