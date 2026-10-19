import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  generateFinalizacionWhatsAppMessage,
  getFinalizacionWhatsAppUrl,
  CANONICAL_APP_BASE_URL,
} from '../utils/whatsappFinalizacion';
import { CompartirWhatsAppModal } from '../components/gestion/CompartirWhatsAppModal';

describe('Fase 4D — Generación de Mensaje de Finalización para WhatsApp', () => {
  it('1. Genera mensaje completo para primera finalización (V1)', () => {
    const msg = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      titulo: 'Campaña Vacunación Antigripal',
      solicitanteNombre: 'Juan Pérez',
      solicitanteArea: 'Ministerio de Salud',
      solicitanteTelefono: '2964 477578',
      versionNumber: 1,
      enlacesEntrega: ['https://drive.google.com/drive/folders/1a2b3c4d5e'],
      archivosEntrega: ['afiche_vacunacion.pdf'],
      pedidoId: 'c97b8377-6f81-42da-91ca-a5bfcf56bdfa',
    });

    expect(msg).toContain('✅ *PEDIDO FINALIZADO*');
    expect(msg).toContain('📌 *PED-2026-X000136 — Campaña Vacunación Antigripal*');
    expect(msg).toContain('👤 *Solicitante:* Juan Pérez — Ministerio de Salud');
    expect(msg).toContain('📦 *Versión:* 1');
    expect(msg).toContain('📎 *Archivos y enlaces de esta entrega:*');
    expect(msg).toContain('https://drive.google.com/drive/folders/1a2b3c4d5e');
    expect(msg).toContain('📄 afiche_vacunacion.pdf (descargar en Gestión)');
    expect(msg).toContain('📱 *WhatsApp del solicitante:*');
    expect(msg).toContain('https://wa.me/5492964477578');
    expect(msg).toContain('🖥️ *Ver pedido en Gestión:*');
    expect(msg).toContain('https://formulariomedios.pages.dev/gestion/pedidos/c97b8377-6f81-42da-91ca-a5bfcf56bdfa');
  });

  it('2. Genera encabezado de nueva versión para V2 y posteriores', () => {
    const msgV2 = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      titulo: 'Campaña Vacunación Antigripal',
      solicitanteNombre: 'Juan Pérez',
      solicitanteArea: 'Ministerio de Salud',
      solicitanteTelefono: '+54 9 2964 477578',
      versionNumber: 2,
      enlacesEntrega: ['https://drive.google.com/drive/folders/v2-updated'],
      pedidoId: 'c97b8377-6f81-42da-91ca-a5bfcf56bdfa',
    });

    expect(msgV2).toContain('🔄✨ *NUEVA VERSIÓN DISPONIBLE*');
    expect(msgV2).not.toContain('✅ *PEDIDO FINALIZADO*');
    expect(msgV2).toContain('📦 *Versión:* 2');
    expect(msgV2).toContain('https://drive.google.com/drive/folders/v2-updated');
  });

  it('3. Genera encabezado para V3 correctamente', () => {
    const msgV3 = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      versionNumber: 3,
      pedidoId: 'c97b8377-6f81-42da-91ca-a5bfcf56bdfa',
    });

    expect(msgV3).toContain('🔄✨ *NUEVA VERSIÓN DISPONIBLE*');
    expect(msgV3).toContain('📦 *Versión:* 3');
  });

  it('4. Omite bloque de archivos y enlaces si no hay material (finalización solo con nota)', () => {
    const msg = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      titulo: 'Reunión de coordinación',
      solicitanteNombre: 'María Rossi',
      solicitanteArea: 'Secretaría de Medios',
      solicitanteTelefono: '2901 123456',
      versionNumber: 1,
      enlacesEntrega: [],
      archivosEntrega: [],
      pedidoId: 'uuid-1234',
    });

    expect(msg).not.toContain('📎 *Archivos y enlaces de esta entrega:*');
    expect(msg).toContain('📦 *Versión:* 1');
    expect(msg).toContain('🖥️ *Ver pedido en Gestión:*');
  });

  it('5. Omite bloque de WhatsApp si el teléfono es inválido o falta', () => {
    const msgSinTel = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      solicitanteNombre: 'Sin Teléfono',
      solicitanteTelefono: null,
      versionNumber: 1,
      pedidoId: 'uuid-1234',
    });
    expect(msgSinTel).not.toContain('📱 *WhatsApp del solicitante:*');

    const msgInvalido = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      solicitanteNombre: 'Tel Invalido',
      solicitanteTelefono: '123',
      versionNumber: 1,
      pedidoId: 'uuid-1234',
    });
    expect(msgInvalido).not.toContain('📱 *WhatsApp del solicitante:*');
  });

  it('6. Normaliza teléfonos argentinos con prefijo 549 para wa.me sin alterar el dato de origen', () => {
    const msg1 = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-A1',
      solicitanteTelefono: '2964 477578',
      versionNumber: 1,
      pedidoId: 'uuid-1',
    });
    expect(msg1).toContain('https://wa.me/5492964477578');

    const msg2 = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-A2',
      solicitanteTelefono: '+5492901123456',
      versionNumber: 1,
      pedidoId: 'uuid-2',
    });
    expect(msg2).toContain('https://wa.me/5492901123456');

    const msg3 = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-A3',
      solicitanteTelefono: '011 15 4444-5555',
      versionNumber: 1,
      pedidoId: 'uuid-3',
    });
    // Si parsePhoneNumberFromString normaliza CABA a 1144445555 con prefijo 549
    expect(msg3).toContain('https://wa.me/5491144445555');
    const waDetails = getFinalizacionWhatsAppUrl(msg3);
    expect(waDetails).toContain('https://api.whatsapp.com/send?text=');
    expect(waDetails).toContain('https%3A%2F%2Fwa.me%2F5491144445555');
  });

  it('7. Utiliza únicamente el dominio canónico https://formulariomedios.pages.dev/ y ruta interna de Gestión', () => {
    expect(CANONICAL_APP_BASE_URL).toBe('https://formulariomedios.pages.dev');

    const msg = generateFinalizacionWhatsAppMessage({
      codigo: 'PED-2026-X000136',
      versionNumber: 1,
      pedidoId: 'f932c406-c669-952a-da7e-66634c23ebc3',
    });

    expect(msg).toContain('https://formulariomedios.pages.dev/gestion/pedidos/f932c406-c669-952a-da7e-66634c23ebc3');
    expect(msg).not.toContain('seguimiento');
    expect(msg).not.toContain('mis-solicitudes');
  });

  it('8. getFinalizacionWhatsAppUrl codifica correctamente el mensaje mediante encodeURIComponent', () => {
    const sample = '✅ *PEDIDO FINALIZADO*\n\n📌 *PED-001*\nhttps://formulariomedios.pages.dev/gestion/pedidos/123';
    const waUrl = getFinalizacionWhatsAppUrl(sample);

    expect(waUrl.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    const encodedText = waUrl.replace('https://api.whatsapp.com/send?text=', '');
    expect(decodeURIComponent(encodedText)).toBe(sample);
  });
});

describe('Fase 4D — Componente CompartirWhatsAppModal', () => {
  const dummyMsg = '✅ *PEDIDO FINALIZADO*\n\n📌 *PED-001*';
  const dummyUrl = 'https://api.whatsapp.com/send?text=dummy';

  it('1. Renderiza el modal cuando isOpen es true con textos y botones oficiales', () => {
    render(
      <CompartirWhatsAppModal
        isOpen={true}
        onClose={vi.fn()}
        message={dummyMsg}
        whatsappUrl={dummyUrl}
      />
    );

    expect(screen.getByText('¿Querés compartir esta entrega por WhatsApp?')).toBeInTheDocument();
    expect(screen.getByText(/PEDIDO FINALIZADO/)).toBeInTheDocument();
    expect(screen.getByText(/PED-001/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compartir por WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ahora no/i })).toBeInTheDocument();
    // Requisito estricto: NO incluir "Copiar resumen"
    expect(screen.queryByRole('button', { name: /Copiar resumen/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Copiar resumen/i)).not.toBeInTheDocument();
  });

  it('2. No renderiza nada si isOpen es false', () => {
    const { container } = render(
      <CompartirWhatsAppModal
        isOpen={false}
        onClose={vi.fn()}
        message={dummyMsg}
        whatsappUrl={dummyUrl}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('3. Botón "Ahora no" cierra el modal sin efectos secundarios', () => {
    const handleClose = vi.fn();
    render(
      <CompartirWhatsAppModal
        isOpen={true}
        onClose={handleClose}
        message={dummyMsg}
        whatsappUrl={dummyUrl}
      />
    );

    const btnAhoraNo = screen.getByRole('button', { name: /Ahora no/i });
    fireEvent.click(btnAhoraNo);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('4. Botón "Compartir por WhatsApp" abre WhatsApp con encodeURIComponent y cierra modal', () => {
    const handleClose = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <CompartirWhatsAppModal
        isOpen={true}
        onClose={handleClose}
        message={dummyMsg}
        whatsappUrl={dummyUrl}
      />
    );

    const btnShare = screen.getByRole('button', { name: /Compartir por WhatsApp/i });
    fireEvent.click(btnShare);

    expect(openSpy).toHaveBeenCalledWith(dummyUrl, '_blank', 'noopener,noreferrer');
    expect(handleClose).toHaveBeenCalledTimes(1);

    openSpy.mockRestore();
  });
});
