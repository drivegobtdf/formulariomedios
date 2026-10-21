import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@tdf.gob.ar', rol: 'admin', estado: 'aprobado' },
    isAdmin: true,
    isObserver: false,
    isApproved: true,
    isTeamOrAdmin: true,
  }),
}));

vi.mock('../components/notifications/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('../components/profile/UserProfileMenu', () => ({
  UserProfileMenu: () => <div data-testid="user-profile-menu" />,
}));

describe('Logo por Tema y Dark Mode Header Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('A. theme = light -> muestra logo negro institucional actual', () => {
    localStorage.setItem('pedidos:theme', 'light');

    render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg).toBeInTheDocument();
    expect(logoImg.src).toContain('logo-gob-tdf');
    expect(logoImg.src).not.toContain('GOB-TDF-BLANCO');
  });

  it('B. theme = dark -> muestra GOB-TDF-BLANCO-scaled-e1777050842342.png', () => {
    localStorage.setItem('pedidos:theme', 'dark');

    render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg).toBeInTheDocument();
    expect(logoImg.src).toContain('GOB-TDF-BLANCO-scaled-e1777050842342');
  });

  it('C. cambio light -> dark -> cambia asset en tiempo real sin reload', () => {
    localStorage.setItem('pedidos:theme', 'light');

    render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg.src).toContain('logo-gob-tdf');

    const themeToggleBtn = screen.getByRole('button', { name: /Cambiar a modo oscuro/i });
    fireEvent.click(themeToggleBtn);

    expect(logoImg.src).toContain('GOB-TDF-BLANCO-scaled-e1777050842342');
    expect(localStorage.getItem('pedidos:theme')).toBe('dark');
  });

  it('D. dark -> light -> restaura asset original inmediatamente sin reload', () => {
    localStorage.setItem('pedidos:theme', 'dark');

    render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg.src).toContain('GOB-TDF-BLANCO-scaled-e1777050842342');

    const themeToggleBtn = screen.getByRole('button', { name: /Cambiar a modo claro/i });
    fireEvent.click(themeToggleBtn);

    expect(logoImg.src).toContain('logo-gob-tdf');
    expect(localStorage.getItem('pedidos:theme')).toBe('light');
  });

  it('E. dark mode -> la imagen se monta limpiamente sin contenedores ni marcos blancos intermedios', () => {
    localStorage.setItem('pedidos:theme', 'dark');

    const { container } = render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg).toBeInTheDocument();
    expect(logoImg.parentElement).toHaveClass('pedidos-header-brand-link');
    // El contenedor raíz tiene data-theme="dark"
    expect(container.querySelector('.pedidos-app')).toHaveAttribute('data-theme', 'dark');
  });

  it('F. sin localStorage -> inicializa en dark por defecto con logo blanco institucional', () => {
    // localStorage está limpio (sin pedidos:theme)
    const { container } = render(
      <MemoryRouter initialEntries={['/gestion']}>
        <Layout />
      </MemoryRouter>
    );

    const logoImg = screen.getByAltText(/Gobierno de Tierra del Fuego AIAS/i) as HTMLImageElement;
    expect(logoImg).toBeInTheDocument();
    expect(logoImg.src).toContain('GOB-TDF-BLANCO-scaled-e1777050842342');
    expect(container.querySelector('.pedidos-app')).toHaveAttribute('data-theme', 'dark');
  });
});
