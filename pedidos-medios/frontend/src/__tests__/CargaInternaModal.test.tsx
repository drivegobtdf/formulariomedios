import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CargaInternaModal } from '../components/CargaInternaModal';
import * as gestionApi from '../services/gestionApi';

vi.mock('../services/gestionApi', async () => {
  const actual = await vi.importActual<typeof import('../services/gestionApi')>('../services/gestionApi');
  return {
    ...actual,
    createInternalPedido: vi.fn(),
    fetchCatalogoServicios: vi.fn(),
  };
});

describe('CargaInternaModal Component', () => {
  const mockCatalogo: gestionApi.CatalogoCategoriaItem[] = [
    {
      id: 'cat-1',
      nombre: 'Diseño Gráfico',
      codigo_ped: 'D',
      tipos: [
        { id: 'tipo-1', nombre: 'Flyer Digital' },
        { id: 'tipo-2', nombre: 'Banner Web' },
      ],
    },
    {
      id: 'cat-2',
      nombre: 'Prensa y Comunicación',
      codigo_ped: 'P',
      tipos: [{ id: 'tipo-3', nombre: 'Gacetilla' }],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(gestionApi.fetchCatalogoServicios).mockResolvedValue(mockCatalogo);
  });

  it('no debe renderizar nada cuando isOpen es false', () => {
    const { container } = render(
      <CargaInternaModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('debe cargar y renderizar el formulario correctamente cuando isOpen es true', async () => {
    render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Carga Interna de Pedido')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(gestionApi.fetchCatalogoServicios).toHaveBeenCalledTimes(1);
    });

    const catSelect = screen.getByLabelText(/Categoría de Servicio/i);
    expect(catSelect).toBeInTheDocument();
  });

  it('debe validar que el título tenga al menos 3 caracteres', async () => {
    render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
    fireEvent.change(tituloInput, { target: { value: 'ab' } });

    const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/El título del pedido es obligatorio y debe tener al menos 3 caracteres/i)
    ).toBeInTheDocument();
    expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();
  });

  it('debe validar que las URLs de enlaces externos comiencen con http o https', async () => {
    render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
    fireEvent.change(tituloInput, { target: { value: 'Campaña Vial Invierno 2026' } });

    const linkInput = screen.getByPlaceholderText(/https:\/\/drive\.google\.com\/\.\.\. o https:\/\/figma\.com\/\.\.\./i);
    fireEvent.change(linkInput, { target: { value: 'ftp://servidor-externo/archivo.pdf' } });

    const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    expect(
      await screen.findByText(/no es una URL válida/i)
    ).toBeInTheDocument();
    expect(gestionApi.createInternalPedido).not.toHaveBeenCalled();
  });

  it('debe llamar a createInternalPedido y onSuccess con datos válidos', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();

    vi.mocked(gestionApi.createInternalPedido).mockResolvedValue({
      success: true,
      id: 'ped-int-123',
      pedido_visible: 'PED-2026-I000001',
      estado: 'Nuevo',
      origen: 'interno',
      version: 1,
      idempotent: false,
    });

    render(<CargaInternaModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
    fireEvent.change(tituloInput, { target: { value: 'Campaña de Vacunación Antigripal' } });

    const descInput = screen.getByPlaceholderText(/Detalles sobre las necesidades del pedido/i);
    fireEvent.change(descInput, { target: { value: 'Materiales gráficos urgentes para centros de salud' } });

    const solicitanteInput = screen.getByPlaceholderText(/Lic\. Martín Rodríguez/i);
    fireEvent.change(solicitanteInput, { target: { value: 'Dra. María Fernández' } });

    const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(gestionApi.createInternalPedido).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: 'Campaña de Vacunación Antigripal',
          descripcion: 'Materiales gráficos urgentes para centros de salud',
          solicitante_nombre: 'Dra. María Fernández',
        })
      );
      expect(mockOnSuccess).toHaveBeenCalledWith('ped-int-123', 'PED-2026-I000001');
    });
  });

  it('debe permitir agregar y quitar enlaces dinámicamente', async () => {
    render(<CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getAllByPlaceholderText(/https:\/\/drive\.google\.com\/\.\.\. o https:\/\/figma\.com\/\.\.\./i)).toHaveLength(1);

    const addLinkBtn = screen.getByRole('button', { name: /\+ Agregar enlace/i });
    fireEvent.click(addLinkBtn);

    expect(screen.getAllByPlaceholderText(/https:\/\/drive\.google\.com\/\.\.\. o https:\/\/figma\.com\/\.\.\./i)).toHaveLength(2);

    const removeBtns = screen.getAllByRole('button', { name: /Eliminar enlace/i });
    expect(removeBtns).toHaveLength(2);
    fireEvent.click(removeBtns[0]);

    expect(screen.getAllByPlaceholderText(/https:\/\/drive\.google\.com\/\.\.\. o https:\/\/figma\.com\/\.\.\./i)).toHaveLength(1);
  });

  describe('Protección contra cierre accidental y pérdida de datos', () => {
    const renderOpenModal = async (onClose = vi.fn(), onSuccess = vi.fn()) => {
      const utils = render(<CargaInternaModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);
      await waitFor(() => {
        expect(gestionApi.fetchCatalogoServicios).toHaveBeenCalled();
      });
      return utils;
    };

    it('A. abrir Carga Interna -> completar título -> click backdrop -> modal sigue abierto -> título permanece', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i) as HTMLInputElement;
      fireEvent.change(tituloInput, { target: { value: 'Proyecto Ininterrumpido' } });

      const dialogBackdrop = screen.getByRole('dialog');
      fireEvent.click(dialogBackdrop);

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(tituloInput.value).toBe('Proyecto Ininterrumpido');
      expect(screen.getByText('Carga Interna de Pedido')).toBeInTheDocument();
    });

    it('B. abrir modal vacío -> click backdrop -> modal sigue abierto', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const dialogBackdrop = screen.getByRole('dialog');
      fireEvent.click(dialogBackdrop);

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByText('Carga Interna de Pedido')).toBeInTheDocument();
    });

    it('C. modificar formulario -> click X -> aparece confirmación de descarte', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const descInput = screen.getByPlaceholderText(/Detalles sobre las necesidades del pedido/i);
      fireEvent.change(descInput, { target: { value: 'Borrador con datos valiosos' } });

      const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeBtn);

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument();
      expect(
        screen.getByText(/Hay información cargada que todavía no fue guardada/i)
      ).toBeInTheDocument();
    });

    it('D. confirmación -> "Seguir editando" -> modal abierto -> datos preservados', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const descInput = screen.getByPlaceholderText(/Detalles sobre las necesidades del pedido/i) as HTMLTextAreaElement;
      fireEvent.change(descInput, { target: { value: 'Borrador con datos valiosos' } });

      const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeBtn);

      const keepEditingBtn = screen.getByRole('button', { name: /Seguir editando/i });
      fireEvent.click(keepEditingBtn);

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
      expect(descInput.value).toBe('Borrador con datos valiosos');
    });

    it('E. confirmación -> "Descartar cambios" -> modal cierra', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const descInput = screen.getByPlaceholderText(/Detalles sobre las necesidades del pedido/i);
      fireEvent.change(descInput, { target: { value: 'Borrador a descartar' } });

      const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeBtn);

      const discardBtn = screen.getByRole('button', { name: /Descartar cambios/i });
      fireEvent.click(discardBtn);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('F. formulario limpio -> click X -> cierra normalmente sin alerta', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeBtn);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
    });

    it('G. formulario dirty -> Escape -> confirmar antes de descartar', async () => {
      const mockOnClose = vi.fn();
      await renderOpenModal(mockOnClose);

      const solicitanteInput = screen.getByPlaceholderText(/Lic\. Martín Rodríguez/i);
      fireEvent.change(solicitanteInput, { target: { value: 'Juan Pérez' } });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument();

      // Si se pulsa Escape dentro de la confirmación, se cancela la alerta y regresa a editar
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('H. submit exitoso -> cierra sin alerta de descarte', async () => {
      const mockOnClose = vi.fn();
      const mockOnSuccess = vi.fn();

      vi.mocked(gestionApi.createInternalPedido).mockResolvedValue({
        success: true,
        id: 'ped-int-999',
        pedido_visible: 'PED-2026-I000099',
        estado: 'Nuevo',
        origen: 'interno',
        version: 1,
        idempotent: false,
      });

      await renderOpenModal(mockOnClose, mockOnSuccess);

      const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
      fireEvent.change(tituloInput, { target: { value: 'Lanzamiento Oficial 2026' } });

      const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith('ped-int-999', 'PED-2026-I000099');
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
    });

    it('I. botón Cancelar en footer respeta confirmación si está dirty o cierra directo si está limpio', async () => {
      const mockOnClose = vi.fn();
      const { unmount } = await renderOpenModal(mockOnClose);

      // Limpio: Cancelar cierra directo
      const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
      fireEvent.click(cancelBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      unmount();

      // Dirty: Cancelar pide confirmación
      const mockOnCloseDirty = vi.fn();
      await renderOpenModal(mockOnCloseDirty);
      const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
      fireEvent.change(tituloInput, { target: { value: 'Cambio pendiente' } });

      const cancelBtnDirty = screen.getByRole('button', { name: /Cancelar/i });
      fireEvent.click(cancelBtnDirty);

      expect(mockOnCloseDirty).not.toHaveBeenCalled();
      expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument();
    });
  });
});
