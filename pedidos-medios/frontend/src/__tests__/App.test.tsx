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

  it('debe renderizar el paso 1 del Formulario Público en la ruta inicial con las 8 categorías', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 2, name: /1\. Datos de Contacto y Servicios Requeridos/i })
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/Diseño gráfico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cobertura de eventos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gacetilla de prensa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Publicaciones en redes sociales/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Producción audiovisual/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Animación y motion graphics/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Transmisión en vivo \/ streaming/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sitios y contenidos web/i)).toBeInTheDocument();
  });
});
