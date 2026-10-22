import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EliminarPedidosModal } from '../../pedidos-medios/frontend/src/components/gestion/EliminarPedidosModal';
import { EditarEtiquetaModal } from '../../pedidos-medios/frontend/src/components/gestion/EditarEtiquetaModal';
import { CargaInternaModal } from '../../pedidos-medios/frontend/src/components/CargaInternaModal';
import * as gestionApi from '../../pedidos-medios/frontend/src/services/gestionApi';

vi.mock('../../pedidos-medios/frontend/src/services/gestionApi');

describe('Etapa 5 — Rediseño Linear: Modales de Gestión', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. CargaInternaModal (Diseño Linear & Confirmación de Descarte)', () => {
    const mockCatalogo: gestionApi.CatalogoCategoriaItem[] = [
      {
        id: 'cat-1',
        nombre: 'Diseño Gráfico',
        codigo_ped: 'D',
        tipos: [{ id: 'tipo-1', nombre: 'Flyer Digital' }],
      },
    ];

    beforeEach(() => {
      vi.spyOn(gestionApi, 'fetchCatalogoServicios').mockResolvedValue(mockCatalogo);
    });

    it('renderiza la estructura Linear con badge INTERNO, títulos y botón de acción', async () => {
      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <CargaInternaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
        </div>
      );

      const overlay = container.querySelector('.pedidos-modal-overlay');
      expect(overlay).toBeInTheDocument();

      const dialog = container.querySelector('.pedidos-modal-dialog.pedidos-modal-dialog-lg');
      expect(dialog).toBeInTheDocument();

      // Badge INTERNO presente
      const badgeInterno = screen.getByText('INTERNO');
      expect(badgeInterno).toBeInTheDocument();
      expect(badgeInterno.className).toContain('pedidos-badge-interno');

      // Título
      expect(screen.getByText('Carga Interna de Pedido')).toBeInTheDocument();

      // Botón submit con clase Linear
      const submitBtn = screen.getByRole('button', { name: /Crear Pedido Interno/i });
      expect(submitBtn.className).toContain('pedidos-modal-btn-create');
    });

    it('activa el diálogo de confirmación de descarte si el formulario está dirty al intentar cerrar', async () => {
      const onCloseMock = vi.fn();
      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <CargaInternaModal isOpen={true} onClose={onCloseMock} onSuccess={vi.fn()} />
        </div>
      );

      // Modificamos el título para ensuciar el formulario
      const tituloInput = screen.getByPlaceholderText(/Cobertura Acto Malvinas 2026/i);
      fireEvent.change(tituloInput, { target: { value: 'Nueva Campaña' } });

      // Clic en la cruz de cerrar
      const closeBtn = screen.getByLabelText('Cerrar modal');
      fireEvent.click(closeBtn);

      // Debe abrirse el alertdialog de confirmación
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument();
      expect(container.querySelector('.pedidos-modal-alertdialog-card')).toBeInTheDocument();
      expect(onCloseMock).not.toHaveBeenCalled();

      // Clic en "Seguir editando" cierra el diálogo de alerta pero mantiene el modal abierto
      const keepEditingBtn = screen.getByRole('button', { name: /Seguir editando/i });
      fireEvent.click(keepEditingBtn);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onCloseMock).not.toHaveBeenCalled();

      // Clic de nuevo y confirmamos descarte
      fireEvent.click(closeBtn);
      const discardBtn = screen.getByRole('button', { name: /Descartar cambios/i });
      fireEvent.click(discardBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. EliminarPedidosModal (Estilo Destructivo de Alto Impacto)', () => {
    const mockPreview: gestionApi.PurgePreviewResult = {
      pedidos_count: 2,
      pedidos_visibles: ['PED-2026-000001', 'PED-2026-000002'],
      entregas_count: 3,
      revisiones_count: 1,
      archivos_count: 5,
      comunicaciones_count: 4,
      drive_file_ids: ['d-1', 'd-2'],
      drive_folder_ids: ['df-1'],
    };

    beforeEach(() => {
      vi.spyOn(gestionApi, 'adminPreviewPurgePedidos').mockResolvedValue(mockPreview);
    });

    it('renderiza la cabecera destructiva con icono de advertencia y desglose de impacto', async () => {
      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EliminarPedidosModal
            isOpen={true}
            onClose={vi.fn()}
            pedidoIds={['ped-1', 'ped-2']}
            onSuccess={vi.fn()}
          />
        </div>
      );

      await waitFor(() => {
        expect(screen.getByText('ELIMINAR PEDIDOS PERMANENTEMENTE')).toBeInTheDocument();
      });

      expect(container.querySelector('.pedidos-modal-header-danger')).toBeInTheDocument();
      expect(container.querySelector('.pedidos-modal-impact-box')).toBeInTheDocument();

      // Desglose de impacto numérico
      expect(screen.getAllByText('3').length).toBe(2); // 3 entregas y 3 recursos drive
      expect(screen.getByText(/entregas realizadas/)).toBeInTheDocument();
      expect(screen.getByText(/recursos de Google Drive/)).toBeInTheDocument();

      // Códigos PED afectados en contenedor monospace
      expect(screen.getByText('PED-2026-000001, PED-2026-000002')).toBeInTheDocument();
      expect(container.querySelector('.pedidos-modal-ped-list')).toBeInTheDocument();
    });

    it('exige escribir exactamente "ELIMINAR" para desbloquear la eliminación masiva', async () => {
      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EliminarPedidosModal
            isOpen={true}
            onClose={vi.fn()}
            pedidoIds={['ped-1', 'ped-2']}
            onSuccess={vi.fn()}
          />
        </div>
      );

      await waitFor(() => {
        expect(screen.getByText(/Para confirmar la eliminación masiva/)).toBeInTheDocument();
      });

      const deleteBtn = screen.getByRole('button', { name: /Eliminar 2 pedidos/i });
      expect(deleteBtn).toBeDisabled();

      const confirmInput = screen.getByPlaceholderText('ELIMINAR');
      expect(confirmInput.className).not.toContain('is-confirmed');

      // Texto incorrecto
      fireEvent.change(confirmInput, { target: { value: 'eliminar' } }); // minúsculas
      expect(deleteBtn).toBeDisabled();

      // Texto exacto
      fireEvent.change(confirmInput, { target: { value: 'ELIMINAR' } });
      expect(deleteBtn).not.toBeDisabled();
      expect(container.querySelector('.pedidos-modal-confirm-input.is-confirmed')).toBeInTheDocument();
    });
  });

  describe('3. EditarEtiquetaModal (Diseño Compacto & Selector de Color)', () => {
    it('renderiza etiquetas asignadas, sub-tarjeta para agregar y selector de color', async () => {
      const initialEtiquetas = [
        { id: 'tag-1', pedido_id: 'ped-1', texto: 'WEB', color: 'azul' as const, created_at: '2026-01-01' },
      ];

      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={vi.fn()}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={initialEtiquetas}
          />
        </div>
      );

      expect(screen.getByText('Etiqueta interna')).toBeInTheDocument();
      expect(screen.getByText(/PED-2026-000001 · Etiquetas del pedido/)).toBeInTheDocument();

      // Etiqueta WEB asignada
      expect(screen.getByText('🏷️ WEB')).toBeInTheDocument();

      // Sub-tarjeta para agregar etiqueta
      expect(container.querySelector('.pedidos-modal-subcard')).toBeInTheDocument();
      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      expect(input).toBeInTheDocument();

      // Contador de caracteres
      expect(screen.getByText('0 / 30')).toBeInTheDocument();

      // Botón + Agregar
      const addBtn = screen.getByRole('button', { name: /\+ Agregar/i });
      expect(addBtn).toBeInTheDocument();

      // Selector de color con puntos
      const colorDots = container.querySelectorAll('.pedidos-modal-color-dot');
      expect(colorDots.length).toBeGreaterThan(0);

      // Botones de footer
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    });

    it('agrega nueva etiqueta dinámicamente y previene duplicados', async () => {
      render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={vi.fn()}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]}
          />
        </div>
      );

      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      const addBtn = screen.getByRole('button', { name: /\+ Agregar/i });

      // Agregar URGENTE
      fireEvent.change(input, { target: { value: 'URGENTE' } });
      fireEvent.click(addBtn);

      expect(screen.getByText('🏷️ URGENTE')).toBeInTheDocument();

      // Intento de duplicado (case-insensitive)
      fireEvent.change(input, { target: { value: 'urgente' } });
      fireEvent.click(addBtn);

      expect(screen.getByText(/Ya existe una etiqueta con el nombre "urgente"/i)).toBeInTheDocument();
    });

    it('persiste etiquetas añadidas correctamente mediante setPedidoEtiquetas, onSave y onSuccess', async () => {
      const mockSavedEtiquetas: gestionApi.PedidoEtiquetaItem[] = [
        { id: 'tag-1', pedido_id: 'ped-1', texto: 'URGENTE', color: 'rojo', created_at: '2026-01-01' },
      ];
      const setPedidoEtiquetasSpy = vi.spyOn(gestionApi, 'setPedidoEtiquetas').mockResolvedValue(mockSavedEtiquetas);
      const onSaveMock = vi.fn().mockResolvedValue(undefined);
      const onSuccessMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();

      render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={onCloseMock}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]}
            onSave={onSaveMock}
            onSuccess={onSuccessMock}
          />
        </div>
      );

      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      const addBtn = screen.getByRole('button', { name: /\+ Agregar/i });

      fireEvent.change(input, { target: { value: 'URGENTE' } });
      fireEvent.click(addBtn);

      const saveBtn = screen.getByRole('button', { name: 'Guardar' });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(setPedidoEtiquetasSpy).toHaveBeenCalledWith('ped-1', [
          { texto: 'URGENTE', color: 'azul' },
        ]);
        expect(onSaveMock).toHaveBeenCalledWith('URGENTE');
        expect(onSuccessMock).toHaveBeenCalledWith(mockSavedEtiquetas);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
      });
    });

    it('mantiene las etiquetas añadidas aunque el componente padre re-renderice pasando una nueva referencia de initialEtiquetas', async () => {
      const setPedidoEtiquetasSpy = vi.spyOn(gestionApi, 'setPedidoEtiquetas').mockResolvedValue([]);
      const onSaveMock = vi.fn().mockResolvedValue(undefined);
      const onSuccessMock = vi.fn();
      const onCloseMock = vi.fn();

      const { rerender } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={onCloseMock}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]}
            onSave={onSaveMock}
            onSuccess={onSuccessMock}
          />
        </div>
      );

      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      const addBtn = screen.getByRole('button', { name: /\+ Agregar/i });

      // Usuario agrega URGENTE
      fireEvent.change(input, { target: { value: 'URGENTE' } });
      fireEvent.click(addBtn);

      expect(screen.getByText('🏷️ URGENTE')).toBeInTheDocument();

      // Ocurre re-render del padre pasando una nueva referencia []
      rerender(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={onCloseMock}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]} // nueva referencia
            onSave={onSaveMock}
            onSuccess={onSuccessMock}
          />
        </div>
      );

      // La etiqueta NO debe haberse borrado
      expect(screen.getByText('🏷️ URGENTE')).toBeInTheDocument();

      // Al guardar, se envía URGENTE a la API
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(setPedidoEtiquetasSpy).toHaveBeenCalledWith('ped-1', [
          { texto: 'URGENTE', color: 'azul' },
        ]);
        expect(onSaveMock).toHaveBeenCalledWith('URGENTE');
      });
    });

    it('incorpora automáticamente texto pendiente en el input si el usuario pulsa Guardar directamente', async () => {
      const setPedidoEtiquetasSpy = vi.spyOn(gestionApi, 'setPedidoEtiquetas').mockResolvedValue([]);
      const onSaveMock = vi.fn().mockResolvedValue(undefined);

      render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={vi.fn()}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]}
            onSave={onSaveMock}
          />
        </div>
      );

      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      fireEvent.change(input, { target: { value: 'NOTICIA' } });

      // No pulsamos + Agregar, pulsamos Guardar directamente
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(setPedidoEtiquetasSpy).toHaveBeenCalledWith('ped-1', [
          { texto: 'NOTICIA', color: 'azul' },
        ]);
        expect(onSaveMock).toHaveBeenCalledWith('NOTICIA');
      });
    });

    it('muestra el banner de error y no cierra el modal si setPedidoEtiquetas falla', async () => {
      vi.spyOn(gestionApi, 'setPedidoEtiquetas').mockRejectedValue(new Error('DATABASE_CONNECTION_LOST'));
      const onCloseMock = vi.fn();

      const { container } = render(
        <div className="pedidos-app pedidos-app-wide" data-theme="dark">
          <EditarEtiquetaModal
            isOpen={true}
            onClose={onCloseMock}
            pedidoId="ped-1"
            pedidoVisible="PED-2026-000001"
            initialEtiquetas={[]}
          />
        </div>
      );

      const input = screen.getByPlaceholderText(/Ej: URGENTE, WEB, PRENSA/i);
      fireEvent.change(input, { target: { value: 'PRENSA' } });
      fireEvent.click(screen.getByRole('button', { name: /\+ Agregar/i }));

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(screen.getByText('DATABASE_CONNECTION_LOST')).toBeInTheDocument();
        expect(container.querySelector('.pedidos-modal-error-banner')).toBeInTheDocument();
        expect(onCloseMock).not.toHaveBeenCalled();
      });
    });
  });
});
