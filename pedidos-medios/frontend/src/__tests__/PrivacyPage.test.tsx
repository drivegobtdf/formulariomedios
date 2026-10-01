import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PrivacyPage } from '../pages/PrivacyPage';
import { Layout } from '../components/Layout';
import App from '../App';

describe('PrivacyPage & Public Privacy Link Suite', () => {
  beforeEach(() => {
    window.__PEDIDOS_CONFIG__ = {
      basePath: '/',
      environment: 'production',
      uiMode: 'production-preview',
    };
  });

  afterEach(() => {
    delete window.__PEDIDOS_CONFIG__;
  });

  it('1. /privacidad renderiza sin autenticación y muestra el título oficial', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="privacidad" element={<PrivacyPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /POLÍTICA DE PRIVACIDAD/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Secretaría de Medios/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Gobierno de Tierra del Fuego/i).length).toBeGreaterThanOrEqual(1);
  });

  it('2. Contiene la sección de Google Drive con todas las garantías requeridas por Google OAuth', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <PrivacyPage />
      </MemoryRouter>
    );

    // Título de la sección
    expect(screen.getByRole('heading', { level: 2, name: /5\. Integración con Google Drive/i })).toBeInTheDocument();

    // Menciones explícitas del alcance y salvaguardas
    expect(screen.getByText(/drive\.file/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin fines publicitarios/i)).toBeInTheDocument();
    expect(screen.getByText(/No comercialización/i)).toBeInTheDocument();
    expect(screen.getByText(/No uso para entrenamiento de IA/i)).toBeInTheDocument();
    expect(screen.getByText(/Uso estrictamente operativo/i)).toBeInTheDocument();
  });

  it('3. Contiene la descripción de proveedores y servicios (Supabase, Drive, Gmail, Cloudflare, n8n)', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: /6\. Proveedores y Servicios Utilizados/i })).toBeInTheDocument();
    expect(screen.getByText(/Supabase:/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Drive:/i)).toBeInTheDocument();
    expect(screen.getByText(/Gmail \/ Google:/i)).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare Pages:/i)).toBeInTheDocument();
    expect(screen.getByText(/n8n:/i)).toBeInTheDocument();
  });

  it('4. Contiene la cláusula de conservación y seguridad de la información', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: /8\. Conservación de los Datos/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Los datos y archivos se conservan durante el tiempo necesario para la operación/i)
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: /9\. Seguridad de la Información/i })).toBeInTheDocument();
  });

  it('5. Existe enlace público a Política de Privacidad en el footer de la aplicación', () => {
    render(<App />);

    const privacyLinks = screen.getAllByRole('link', { name: /Política de Privacidad/i });
    expect(privacyLinks.length).toBeGreaterThan(0);
    expect(privacyLinks[0]).toHaveAttribute('href', '/privacidad');
  });

  it('6. Actualiza dinámicamente el document.title y meta description para SEO', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(document.title).toBe('Política de Privacidad | PEDIDOS — Secretaría de Medios');
    const metaDesc = document.querySelector('meta[name="description"]');
    expect(metaDesc).not.toBeNull();
    expect(metaDesc?.getAttribute('content')).toContain('Política de Privacidad del Sistema PEDIDOS');
  });

  it('7. Incluye enlaces de retorno al Portal Principal', () => {
    render(
      <MemoryRouter initialEntries={['/privacidad']}>
        <PrivacyPage />
      </MemoryRouter>
    );

    const backLinks = screen.getAllByRole('link', { name: /Volver al Portal Principal/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/');
  });
});
