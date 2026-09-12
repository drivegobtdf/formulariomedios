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
    expect(screen.getByRole('link', { name: /^Confirmación$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/solicitud-recibida'
    );
    expect(screen.getByRole('link', { name: /^Seguimiento$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/seguimiento'
    );
    expect(screen.getByRole('link', { name: /^Info Faltante$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/solicitud-informacion'
    );
    expect(screen.getByRole('link', { name: /^Login$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/login'
    );
    expect(screen.getByRole('link', { name: /^Solicitar Acceso$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/solicitar-acceso'
    );
    expect(screen.getByRole('link', { name: /^Gestión$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/gestion'
    );
    expect(screen.getByRole('link', { name: /^Usuarios$/i })).toHaveAttribute(
      'href',
      '/formulariomedios/usuarios'
    );
  });
});
