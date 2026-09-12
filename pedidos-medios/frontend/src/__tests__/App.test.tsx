import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('debe renderizar el título principal de PEDIDOS y la barra de navegación', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /PEDIDOS — Secretaría de Medios/i })
    ).toBeInTheDocument();

    expect(screen.getByRole('navigation', { name: /Navegación principal/i })).toBeInTheDocument();
  });

  it('debe renderizar la vista del Formulario Público en la ruta inicial', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 2, name: /Formulario Público de Solicitud de Servicios/i })
    ).toBeInTheDocument();
  });
});
