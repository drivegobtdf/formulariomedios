import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('debe renderizar el logo institucional oficial y la barra de navegación', () => {
    render(<App />);

    expect(
      screen.getByAltText(/Gobierno de Tierra del Fuego/i)
    ).toBeInTheDocument();

    expect(screen.getByRole('navigation', { name: /Navegación principal/i })).toBeInTheDocument();
  });

  it('debe renderizar la portada institucional en la ruta inicial y transicionar al wizard al pulsar Iniciar Nueva Solicitud', () => {
    render(<App />);

    // Portada Institucional Inicial
    expect(
      screen.getByRole('heading', { level: 1, name: /Solicitud de Comunicación y Medios/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/Cargá tu pedido/i)).toBeInTheDocument();
    expect(screen.getByText(/Seguí el avance/i)).toBeInTheDocument();
    expect(screen.getByText(/Recibí el material/i)).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Nueva solicitud/i });
    expect(startBtn).toBeInTheDocument();

    // No debe mostrar los campos del formulario antes de pulsar el CTA
    expect(screen.queryByLabelText(/Diseño gráfico/i)).not.toBeInTheDocument();

    // Pulsar CTA principal
    fireEvent.click(startBtn);

    // Ahora muestra el Paso 1 con las 8 categorías
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

