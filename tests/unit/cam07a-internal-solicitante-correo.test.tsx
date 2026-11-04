import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CargaInternaModal } from '../../pedidos-medios/frontend/src/components/CargaInternaModal';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi', async () => {
  const actual = await vi.importActual<typeof import('../../pedidos-medios/frontend/src/services/gestionApi')>(
    '../../pedidos-medios/frontend/src/services/gestionApi'
  );
  return {
    ...actual,
    fetchCatalogoServicios: vi.fn().mockResolvedValue([]),
    createInternalPedido: vi.fn(),
    uploadInternalPedidoFile: vi.fn(),
  };
});

describe('CAM-07A — Correo electrónico obligatorio en creación de pedidos internos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(gestionApi.fetchCatalogoServicios).mockResolvedValue([
      {
        id: 'cat-prensa',
        nombre: 'Prensa',
        codigo_ped: 'P',
        tipos: [{ id: 'tipo-gac', nombre: 'Gacetilla Oficial' }],
      },
    ]);
    vi.mocked(gestionApi.createInternalPedido).mockResolvedValue({
      success: true,
      id: 'ped-cam07a-uuid-1',
      pedido_visible: 'PED-2026-X000100',
      estado: 'Nuevo',
      origen: 'interno',
      version: 1,
      idempotent: false,
    });
  });

  describe('1. Frontend — Renderizado y atributos del campo', () => {
    it('renderiza la etiqueta obligatoria "Correo electrónico del solicitante *" y el atributo required', () => {
      render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      const label = screen.getByText('Correo electrónico del solicitante *');
      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute('for', 'input-solicitante-correo');

      const input = screen.getByLabelText('Correo electrónico del solicitante *') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'email');
      expect(input).toHaveAttribute('required');
      expect(input.placeholder).toBe('contacto@tdf.gob.ar');
    });
  });

  describe('2. Frontend — Validaciones en cliente (handleSubmit)', () => {
    it('rechaza la creación cuando el correo está completamente vacío', async () => {
      render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i), {
        target: { value: 'Pedido interno urgente sin correo' },
      });

      const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
      const form = submitBtn.closest('form')!;
      fireEvent.submit(form);

      expect(
        await screen.findByText('El correo electrónico del solicitante es obligatorio.')
      ).toBeInTheDocument();
      expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();
    });

    it('rechaza la creación cuando el correo contiene únicamente espacios en blanco', async () => {
      render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i), {
        target: { value: 'Pedido interno urgente con espacios' },
      });

      fireEvent.change(screen.getByLabelText(/Correo electrónico del solicitante \*/i), {
        target: { value: '     ' },
      });

      const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
      const form = submitBtn.closest('form')!;
      fireEvent.submit(form);

      expect(
        await screen.findByText('El correo electrónico del solicitante es obligatorio.')
      ).toBeInTheDocument();
      expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();
    });

    it('rechaza formatos de correo inválidos (sin @, sin dominio, con caracteres inválidos)', async () => {
      const invalidEmails = [
        'correosinidentificador',
        'usuario@',
        '@dominio.com',
        'usuario@dominio',
        'usuario@.com',
        'usuario espacio@dominio.com',
      ];

      for (const invalidEmail of invalidEmails) {
        const { unmount } = render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i), {
          target: { value: 'Prueba de validación formato correo' },
        });

        fireEvent.change(screen.getByLabelText(/Correo electrónico del solicitante \*/i), {
          target: { value: invalidEmail },
        });

        const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
        const form = submitBtn.closest('form')!;
        fireEvent.submit(form);

        expect(
          await screen.findByText('El formato del correo electrónico es inválido.')
        ).toBeInTheDocument();
        expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();

        unmount();
      }
    });
  });

  describe('3. Frontend — Aceptación de dominios abiertos y normalización', () => {
    it('acepta y normaliza correos de cualquier dominio válido (institucional, comercial, educativo)', async () => {
      const validCases = [
        {
          input: '  solicitante.tdf@TDF.GOB.AR  ',
          expected: 'solicitante.tdf@tdf.gob.ar',
        },
        {
          input: 'Usuario.General@Gmail.Com',
          expected: 'usuario.general@gmail.com',
        },
        {
          input: '  prensa-externa@agencia.com.ar  ',
          expected: 'prensa-externa@agencia.com.ar',
        },
        {
          input: 'profesor@universidad.edu.ar',
          expected: 'profesor@universidad.edu.ar',
        },
      ];

      for (const { input, expected } of validCases) {
        const mockSuccess = vi.fn();
        const { unmount } = render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={mockSuccess} />);

        fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i), {
          target: { value: 'Pedido con dominio variado' },
        });

        fireEvent.change(screen.getByLabelText(/Correo electrónico del solicitante \*/i), {
          target: { value: input },
        });

        const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
        const form = submitBtn.closest('form')!;
        fireEvent.submit(form);

        await waitFor(() => {
          expect(gestionApi.createInternalPedido).toHaveBeenCalledWith(
            expect.objectContaining({
              titulo: 'Pedido con dominio variado',
              solicitante_correo: expected,
            })
          );
          expect(mockSuccess).toHaveBeenCalledWith('ped-cam07a-uuid-1', 'PED-2026-X000100');
        });

        unmount();
      }
    });

    it('preserva el correo ingresado si se produce un error en el backend', async () => {
      vi.mocked(gestionApi.createInternalPedido).mockRejectedValueOnce(
        new Error('Error de conexión con el servidor')
      );

      render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i), {
        target: { value: 'Pedido que experimenta error' },
      });

      const emailInput = screen.getByLabelText(/Correo electrónico del solicitante \*/i) as HTMLInputElement;
      fireEvent.change(emailInput, {
        target: { value: 'solicitante.resiliente@tdf.gob.ar' },
      });

      const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
      const form = submitBtn.closest('form')!;
      fireEvent.submit(form);

      expect(await screen.findByText('Error de conexión con el servidor')).toBeInTheDocument();
      expect(emailInput.value).toBe('solicitante.resiliente@tdf.gob.ar');
    });
  });

  describe('4. Backend / Migración — Auditoría estricta de contrato SQL', () => {
    it('la migración implementa todas las cláusulas de seguridad, validación y preservación histórica', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261104164500_cam07a_internal_solicitante_correo_required.sql'
      );
      const sql = readFileSync(migrationPath, 'utf-8');

      // 1. Debe actualizar la RPC pedido_create_internal con SECURITY DEFINER
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.pedido_create_internal/i);
      expect(sql).toMatch(/SECURITY DEFINER/i);

      // 2. Debe mantener la firma canónica de 13 parámetros
      expect(sql).toMatch(/p_titulo text/i);
      expect(sql).toMatch(/p_solicitante_correo text DEFAULT NULL/i);
      expect(sql).toMatch(/p_client_request_ref uuid DEFAULT NULL/i);

      // 3. PoLP: Solo usuarios autenticados con rol administrador o equipo
      expect(sql).toMatch(/v_actor_id := auth\.uid\(\);/i);
      expect(sql).toMatch(/v_role NOT IN \('administrador', 'equipo'\)/i);

      // 4. Idempotencia previa a la inserción
      expect(sql).toMatch(/WHERE client_request_ref = p_client_request_ref AND origen = 'interno'/i);

      // 5. Exigencia y normalización del correo
      expect(sql).toMatch(/v_correo_clean := lower\(trim\(COALESCE\(p_solicitante_correo, ''\)\)\);/i);
      expect(sql).toMatch(/SOLICITANTE_CORREO_REQUIRED/i);
      expect(sql).toMatch(/INVALID_SOLICITANTE_CORREO/i);

      // 6. Regex canónica equivalente en SQL
      expect(sql).toMatch(/\^\[A-Za-z0-9\._%\+-\]\+@\[A-Za-z0-9\.-]\+\\\.\[A-Za-z]\{2,\}\$/);

      // 7. Inclusión en informacion_especifica (privacidad: NO duplicar en domain_events ni audit_log)
      expect(sql).toMatch(/'contacto_correo',\s*v_correo_clean/);
      expect(sql).toMatch(/'correo',\s*v_correo_clean/);
      expect(sql).not.toMatch(/'solicitante_correo',\s*v_correo_clean/);

      // 8. Permisos PoLP: REVOKE ALL FROM PUBLIC, anon; GRANT TO authenticated, service_role
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.pedido_create_internal/i);
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.pedido_create_internal.*TO authenticated, service_role/i);

      // 9. Preservación histórica: NO debe existir ningún UPDATE indiscriminado sobre pedidos
      expect(sql).not.toMatch(/UPDATE public\.pedidos/i);
    });
  });
});
