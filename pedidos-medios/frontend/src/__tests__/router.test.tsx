import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Router Placeholder Routes', () => {
  it('debe contener enlaces para todas las rutas clave de la especificación', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /^Formulario$/i })).toHaveAttribute(
      'href',
      '/formulariomedios'
    );
    const misSolicitudesLinks = screen.getAllByRole('link', { name: /^Mis Solicitudes$/i });
    expect(misSolicitudesLinks[0]).toHaveAttribute(
      'href',
      '/formulariomedios/mis-solicitudes'
    );
    expect(screen.getByRole('link', { name: /^Gestión$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/gestion'
    );
    expect(screen.getByRole('link', { name: /^Usuarios$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/usuarios'
    );
    expect(screen.getByRole('link', { name: /^Acceso Interno$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/login'
    );
  });
});
