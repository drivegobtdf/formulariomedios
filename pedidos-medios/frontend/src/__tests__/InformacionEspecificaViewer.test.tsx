import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InformacionEspecificaViewer } from '../components/gestion/InformacionEspecificaViewer';

describe('InformacionEspecificaViewer Unit Tests', () => {
  it('1. Renderiza Flyer con formato, texto y fecha límite formateada', () => {
    const data = {
      formato: 'Cuadrado 1:1 (Feed Instagram/Facebook)',
      texto: 'Texto institucional del flyer con salto\nde línea.',
      fecha_limite: '2026-09-30',
    };

    render(<InformacionEspecificaViewer informacion={data} codigoCategoria="D" />);

    expect(screen.getByText('Formato')).toBeInTheDocument();
    expect(screen.getByText('Cuadrado 1:1 (Feed Instagram/Facebook)')).toBeInTheDocument();
    expect(screen.getByText('Texto y contenido solicitado')).toBeInTheDocument();
    expect(screen.getByText(/Texto institucional del flyer con salto/i)).toBeInTheDocument();
    expect(screen.getByText('Fecha del evento/actividad/pieza')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026')).toBeInTheDocument();
  });

  it('2. Renderiza Motion Graphics con asesoramiento y datos de contacto preferido', () => {
    const data = {
      requiere_asesoramiento: true,
      objetivo_asesoramiento: 'Animación de apertura institucional.',
      contacto_preferido: 'whatsapp',
    };

    render(<InformacionEspecificaViewer informacion={data} codigoCategoria="M" />);

    expect(screen.getByText('Requiere asesoramiento: Sí')).toBeInTheDocument();
    expect(screen.getByText('Objetivo o requerimiento inicial')).toBeInTheDocument();
    expect(screen.getByText('Animación de apertura institucional.')).toBeInTheDocument();
    expect(screen.getByText(/Canal de contacto preferido:/i)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
  });

  it('3. Renderiza Cobertura de Eventos con lugar, ciudad, fechas y horarios', () => {
    const data = {
      fecha: '2026-10-15',
      hora_inicio: '10:00',
      hora_fin: '12:30',
      lugar: 'Casa de Gobierno',
      ciudad: 'Ushuaia',
      autoridades: 'Gobernador y Ministros',
      requerimientos: 'Fotografía y cobertura audiovisual',
    };

    render(<InformacionEspecificaViewer informacion={data} codigoCategoria="C" />);

    expect(screen.getByText('15/10/2026')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('12:30')).toBeInTheDocument();
    expect(screen.getByText('Casa de Gobierno')).toBeInTheDocument();
    expect(screen.getByText('Ushuaia')).toBeInTheDocument();
    expect(screen.getByText('Gobernador y Ministros')).toBeInTheDocument();
  });

  it('4. Renderiza campos booleanos como Sí / No y enlaces como tags <a> seguros', () => {
    const data = {
      pagina_existente: true,
      requiere_grabacion: false,
      url_pagina: 'https://tierradelfuego.gob.ar/programa',
    };

    render(<InformacionEspecificaViewer informacion={data} codigoCategoria="W" />);

    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://tierradelfuego.gob.ar/programa' });
    expect(link).toHaveAttribute('href', 'https://tierradelfuego.gob.ar/programa');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('5. Renderiza listas / arrays como elementos de lista <li>', () => {
    const data = {
      destinatarios: ['Juan Pérez', 'María Gómez', 'Carlos López'],
    };

    render(<InformacionEspecificaViewer informacion={data} />);

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María Gómez')).toBeInTheDocument();
    expect(screen.getByText('Carlos López')).toBeInTheDocument();
  });

  it('6. Maneja información vacía con mensaje amigable', () => {
    render(<InformacionEspecificaViewer informacion={{}} />);

    expect(screen.getByText(/No se registraron especificaciones adicionales/i)).toBeInTheDocument();
  });
});
