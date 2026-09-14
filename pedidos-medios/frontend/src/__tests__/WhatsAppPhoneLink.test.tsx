import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatsAppPhoneLink } from '../components/WhatsAppPhoneLink';

describe('WhatsAppPhoneLink — Componente de Enlace Directo para Gestión (Sección 17)', () => {
  it('A & B & C: Teléfono canónico argentino genera enlace wa.me seguro sin caracteres prohibidos', () => {
    render(<WhatsAppPhoneLink phone="+5492964477578" />);

    // A. Muestra número formateado para humanos
    const link = screen.getByRole('link', {
      name: /Abrir conversación de WhatsApp con \+54 9 2964/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('+54 9 2964 47 7578');

    // B. Atributos de apertura segura en nueva pestaña
    expect(link).toHaveAttribute('href', 'https://wa.me/5492964477578');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // C. El href no contiene '+', espacios ni guiones
    const href = link.getAttribute('href') || '';
    expect(href.replace('https://wa.me/', '')).toMatch(/^\d+$/);
    expect(href).not.toContain('+');
    expect(href).not.toContain(' ');
    expect(href).not.toContain('-');
  });

  it('D: Número histórico no parseable o inválido se muestra como texto sin enlace', () => {
    const { container } = render(<WhatsAppPhoneLink phone="12345" />);

    // D. Debe mostrar el texto histórico pero NO crear un link falso
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
  });

  it('E: Soporta números internacionales (Chile, USA, etc.)', () => {
    // Chile
    const { unmount } = render(<WhatsAppPhoneLink phone="+56912345678" />);
    const linkCL = screen.getByRole('link');
    expect(linkCL).toHaveAttribute('href', 'https://wa.me/56912345678');
    unmount();

    // USA
    render(<WhatsAppPhoneLink phone="+12025550123" />);
    const linkUS = screen.getByRole('link');
    expect(linkUS).toHaveAttribute('href', 'https://wa.me/12025550123');
  });

  it('Manejo de valores vacíos o nulos', () => {
    const { rerender } = render(<WhatsAppPhoneLink phone="" />);
    expect(screen.getByText('N/D')).toBeInTheDocument();

    rerender(<WhatsAppPhoneLink phone={null} />);
    expect(screen.getByText('N/D')).toBeInTheDocument();
  });
});
