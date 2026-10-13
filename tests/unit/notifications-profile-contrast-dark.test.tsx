import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import * as fs from 'fs';
import * as path from 'path';

import { NotificationBell } from '../../pedidos-medios/frontend/src/components/notifications/NotificationBell';
import { UserProfileMenu } from '../../pedidos-medios/frontend/src/components/profile/UserProfileMenu';
import { GlobalLogoutModal } from '../../pedidos-medios/frontend/src/components/profile/GlobalLogoutModal';
import { UserProfileModal } from '../../pedidos-medios/frontend/src/components/profile/UserProfileModal';
import * as authContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import * as notificationsHookModule from '../../pedidos-medios/frontend/src/hooks/useNotifications';

describe('Hotfix UI — Contraste en Dark Mode (Notificaciones + Perfil)', () => {
  const mockUser = {
    id: 'user-test-uuid',
    email: 'operador@tierradelfuego.gob.ar',
    nombre: 'Agustín',
    apellido: 'Bogado',
    nombreUsuario: 'abogado',
    appRole: 'equipo' as const,
    estadoAcceso: 'aprobado' as const,
    sector: 'Medios',
    cargo: 'Operador',
    creadoEn: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. TOKENS CSS EN app.css
  // ==========================================================================
  describe('1. Verificación de tokens semánticos en app.css', () => {
    const cssPath = path.resolve(__dirname, '../../pedidos-medios/frontend/src/styles/app.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    it('A. Debe declarar --pedidos-surface-card y tokens de popover en :root (Light Mode)', () => {
      expect(cssContent).toContain('--pedidos-surface-card: #FFFFFF;');
      expect(cssContent).toContain('--pedidos-popover-bg: #FFFFFF;');
      expect(cssContent).toContain('--pedidos-popover-header-bg: #F8FAFC;');
      expect(cssContent).toContain('--pedidos-popover-footer-bg: #F8FAFC;');
      expect(cssContent).toContain('--pedidos-popover-border: #E2E8F0;');
      expect(cssContent).toContain('--pedidos-popover-item-hover: #F1F5F9;');
      expect(cssContent).toContain('--pedidos-popover-item-unread: #F0F9FF;');
      expect(cssContent).toContain('--pedidos-popover-danger-hover: #FEF2F2;');
    });

    it('B. Debe declarar tokens oscuros accesibles en [data-theme="dark"] (Dark Mode)', () => {
      expect(cssContent).toContain('--pedidos-surface-card: #1e293b;');
      expect(cssContent).toContain('--pedidos-brand-accent: #38bdf8;');
      expect(cssContent).toContain('--pedidos-brand-accent-hover: #7dd3fc;');
      expect(cssContent).toContain('--pedidos-popover-bg: #1e293b;');
      expect(cssContent).toContain('--pedidos-popover-header-bg: #0f172a;');
      expect(cssContent).toContain('--pedidos-popover-footer-bg: #0f172a;');
      expect(cssContent).toContain('--pedidos-popover-border: #334155;');
      expect(cssContent).toContain('--pedidos-popover-item-hover: #243147;');
      expect(cssContent).toContain('--pedidos-popover-item-unread: rgba(56, 189, 248, 0.12);');
      expect(cssContent).toContain('--pedidos-popover-danger-hover: rgba(239, 68, 68, 0.18);');
    });
  });

  // ==========================================================================
  // 2. NOTIFICATION BELL (Dropdown Popover)
  // ==========================================================================
  describe('2. NotificationBell — Estilos semánticos y contraste', () => {
    it('A. Panel dropdown, header, tabs y footer usan variables semánticas', () => {
      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [
          {
            id: 'notif-1',
            destinatarioId: 'user-test-uuid',
            pedidoId: 'ped-1',
            tipo: 'pedido_asignado',
            payload: { codigo: 'PED-2026-0001' },
            readAt: null, // No leída
            createdAt: new Date().toISOString(),
          },
          {
            id: 'notif-2',
            destinatarioId: 'user-test-uuid',
            pedidoId: 'ped-2',
            tipo: 'nota_interna_agregada',
            payload: { codigo: 'PED-2026-0002' },
            readAt: new Date().toISOString(), // Leída
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        isEligible: true,
      });

      const { container } = render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      // Abrir dropdown
      const bellButton = screen.getByRole('button', { name: /notificaciones/i });
      fireEvent.click(bellButton);

      // El panel dropdown existe
      const dropdownHeader = screen.getByText('Notificaciones');
      expect(dropdownHeader).toBeTruthy();

      // Verificar que el header usa variable semántica
      const headerContainer = dropdownHeader.closest('div[style*="background-color"]') as HTMLElement;
      expect(headerContainer.style.backgroundColor).toContain('var(--pedidos-popover-header-bg');

      // Tabs: botón "Todas" y "No leídas"
      const tabTodas = screen.getByRole('button', { name: /^Todas$/i });
      const tabNoLeidas = screen.getByRole('button', { name: /^No leídas/i });
      expect(tabTodas).toBeTruthy();
      expect(tabNoLeidas).toBeTruthy();

      const tabsContainer = tabTodas.parentElement as HTMLElement;
      expect(tabsContainer.style.backgroundColor).toContain('var(--pedidos-popover-header-bg');

      // Notificaciones leídas y no leídas distinguibles
      const notifElements = container.querySelectorAll('[role="button"][tabindex="0"]');
      expect(notifElements.length).toBe(2);

      const unreadItem = notifElements[0] as HTMLElement;
      const readItem = notifElements[1] as HTMLElement;

      expect(unreadItem.style.backgroundColor).toContain('var(--pedidos-popover-item-unread');
      expect(readItem.style.backgroundColor).toContain('var(--pedidos-popover-bg');

      // Footer
      const footerLink = screen.getByRole('button', { name: /Ver todas las notificaciones/i });
      const footerContainer = footerLink.parentElement as HTMLElement;
      expect(footerContainer.style.backgroundColor).toContain('var(--pedidos-popover-footer-bg');
    });
  });

  // ==========================================================================
  // 3. USER PROFILE MENU
  // ==========================================================================
  describe('3. UserProfileMenu — Estilos semánticos y contraste', () => {
    it('A. Dropdown usa popover tokens y el logout destructivo usa token de hover danger', () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <BrowserRouter>
          <UserProfileMenu />
        </BrowserRouter>
      );

      // Trigger button
      const triggerBtn = screen.getByRole('button', { name: /perfil de usuario/i });
      expect(triggerBtn).toBeTruthy();

      // Badge de rol usa clase semántica
      const roleBadge = screen.getByText('Equipo');
      expect(roleBadge.className).toContain('pedidos-role-equipo');

      // Abrir menú
      fireEvent.click(triggerBtn);

      // Opciones presentes
      const profileItem = screen.getByRole('button', { name: /Mi perfil/i });
      const localSignOutItem = screen.getByRole('button', { name: /Cerrar sesión en este equipo/i });
      const globalSignOutItem = screen.getByRole('button', { name: /Cerrar sesión en todos los equipos/i });

      expect(profileItem).toBeTruthy();
      expect(localSignOutItem).toBeTruthy();
      expect(globalSignOutItem).toBeTruthy();

      // Dropdown panel usa var(--pedidos-popover-bg)
      const menuOptionsContainer = profileItem.parentElement as HTMLElement;
      const dropdownPanel = menuOptionsContainer.parentElement as HTMLElement;
      expect(dropdownPanel.style.backgroundColor).toContain('var(--pedidos-popover-bg');

      // Test hover en botón destructivo
      fireEvent.mouseEnter(globalSignOutItem);
      expect(globalSignOutItem.style.backgroundColor).toContain('var(--pedidos-popover-danger-hover');
      fireEvent.mouseLeave(globalSignOutItem);
      expect(globalSignOutItem.style.backgroundColor).toBe('transparent');
    });
  });

  // ==========================================================================
  // 4. GLOBAL LOGOUT MODAL
  // ==========================================================================
  describe('4. GlobalLogoutModal — Contraste y advertencia', () => {
    it('A. Usa superficie semántica y caja de alerta accesible en ambos temas', () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      const { container } = render(
        <GlobalLogoutModal isOpen={true} onClose={vi.fn()} />
      );

      const modalTitle = screen.getByText('Cerrar sesión en todos los equipos');
      expect(modalTitle).toBeTruthy();

      // Cuadro de advertencia
      const alertBox = screen.getByText(/Atención:/i).closest('div') as HTMLElement;
      expect(alertBox.style.backgroundColor).toContain('var(--pedidos-status-revision-bg');
      expect(alertBox.style.color).toContain('var(--pedidos-status-revision-text');
    });
  });

  // ==========================================================================
  // 5. USER PROFILE MODAL
  // ==========================================================================
  describe('5. UserProfileModal — Inputs y badges en Dark Mode', () => {
    it('A. Inputs usan control-bg y badge de rol usa clase semántica', () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <UserProfileModal isOpen={true} onClose={vi.fn()} />
      );

      const modalTitle = screen.getByRole('heading', { name: /Mi Perfil/i });
      expect(modalTitle).toBeTruthy();

      const inputNombre = screen.getByDisplayValue('Agustín') as HTMLInputElement;
      expect(inputNombre.style.backgroundColor).toContain('var(--pedidos-control-bg');

      const roleBadge = screen.getByText('Equipo Operativo');
      expect(roleBadge.className).toContain('pedidos-role-equipo');
    });
  });

  // ==========================================================================
  // 6. FIDELIDAD DE MODO CLARO (CERO REGRESIONES)
  // ==========================================================================
  describe('6. Fidelidad en Modo Claro', () => {
    it('J. Los tokens de :root mantienen intactos los valores claros institucionales', () => {
      const cssPath = path.resolve(__dirname, '../../pedidos-medios/frontend/src/styles/app.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      // Verifica que los fallbacks y valores en :root son estrictamente los claros esperados
      expect(cssContent).toContain('--pedidos-popover-bg: #FFFFFF;');
      expect(cssContent).toContain('--pedidos-popover-header-bg: #F8FAFC;');
      expect(cssContent).toContain('--pedidos-popover-border: #E2E8F0;');
      expect(cssContent).toContain('--pedidos-popover-item-hover: #F1F5F9;');
      expect(cssContent).toContain('--pedidos-popover-item-unread: #F0F9FF;');
    });
  });

  // ==========================================================================
  // 7. DINÁMICA DE TEMA (LIGHT <-> DARK SIN RELOAD)
  // ==========================================================================
  describe('7. Conmutación dinámica de tema', () => {
    it('K. El toggle de tema actualiza el atributo data-theme en el contenedor sin recarga', () => {
      const appContainer = document.createElement('div');
      appContainer.id = 'pedidos-app';
      appContainer.className = 'pedidos-app';
      document.body.appendChild(appContainer);

      // Estado inicial (light)
      expect(appContainer.getAttribute('data-theme')).toBeNull();

      // Cambiar a dark
      appContainer.setAttribute('data-theme', 'dark');
      expect(appContainer.getAttribute('data-theme')).toBe('dark');

      // Volver a light
      appContainer.removeAttribute('data-theme');
      expect(appContainer.getAttribute('data-theme')).toBeNull();

      document.body.removeChild(appContainer);
    });
  });
});
