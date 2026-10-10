import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { formatRelativeTime } from '../../pedidos-medios/frontend/src/utils/formatUtils';
import * as authService from '../../pedidos-medios/frontend/src/services/auth';
import * as notificationsService from '../../pedidos-medios/frontend/src/services/notificationsApi';
import { NotificationBell } from '../../pedidos-medios/frontend/src/components/notifications/NotificationBell';
import { UserProfileModal } from '../../pedidos-medios/frontend/src/components/profile/UserProfileModal';
import { GlobalLogoutModal } from '../../pedidos-medios/frontend/src/components/profile/GlobalLogoutModal';
import * as authContextModule from '../../pedidos-medios/frontend/src/auth/AuthContext';
import * as notificationsHookModule from '../../pedidos-medios/frontend/src/hooks/useNotifications';
import { BrowserRouter } from 'react-router-dom';

describe('FASE B.2 — Centro de Notificaciones, Perfil de Usuario y UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. UTILIDAD: formatRelativeTime
  // ============================================================================
  describe('1. formatRelativeTime (es-AR)', () => {
    it('debe retornar string vacío para valores inválidos o nulos', () => {
      expect(formatRelativeTime(null)).toBe('');
      expect(formatRelativeTime(undefined)).toBe('');
      expect(formatRelativeTime('')).toBe('');
      expect(formatRelativeTime('fecha-invalida')).toBe('');
    });

    it('debe formatear diferencias menores a 60 segundos como "Hace un momento"', () => {
      const now = new Date(Date.now() - 30 * 1000).toISOString();
      expect(formatRelativeTime(now)).toBe('Hace un momento');
    });

    it('debe formatear minutos relativos correctamente', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinAgo)).toBe('Hace 5 min');
    });

    it('debe formatear horas relativas correctamente', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo)).toBe('Hace 2 h');
    });

    it('debe formatear días recientes como "Ayer" o "Hace X d"', () => {
      const oneDayAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(oneDayAgo)).toBe('Ayer');

      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(fourDaysAgo)).toBe('Hace 4 d');
    });
  });

  // ============================================================================
  // 2. SERVICIO: auth.ts -> updateMyProfile
  // ============================================================================
  describe('2. authService.updateMyProfile', () => {
    it('debe rechazar nombres o apellidos vacíos o con solo espacios sin llamar a Supabase', async () => {
      const res1 = await authService.updateMyProfile('   ', 'Valido');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('El nombre es obligatorio');

      const res2 = await authService.updateMyProfile('Valido', '   ');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('El apellido es obligatorio');
    });

    it('debe rechazar nombres o apellidos que excedan 100 caracteres', async () => {
      const longStr = 'a'.repeat(101);
      const res = await authService.updateMyProfile(longStr, 'Perez');
      expect(res.success).toBe(false);
      expect(res.error).toContain('no puede exceder los 100 caracteres');
    });
  });

  // ============================================================================
  // 3. COMPONENTE: NotificationBell (Campana y Badge)
  // ============================================================================
  describe('3. NotificationBell', () => {
    it('NO debe renderizarse si el usuario no es elegible o es observador (isEligible=false)', () => {
      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        isEligible: false,
      });

      const { container } = render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );
      expect(container.firstChild).toBeNull();
    });

    it('debe renderizarse y ocultar el badge cuando unreadCount === 0', () => {
      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        isEligible: true,
      });

      render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      const bellBtn = screen.getByRole('button', { name: /Notificaciones: sin nuevas notificaciones/i });
      expect(bellBtn).toBeDefined();
      expect(screen.queryByText('0')).toBeNull();
    });

    it('debe mostrar el badge con el conteo exacto (1..99) y "99+" si supera 99', () => {
      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [],
        unreadCount: 5,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        isEligible: true,
      });

      const { rerender } = render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      expect(screen.getByText('5')).toBeDefined();

      // Probar > 99
      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [],
        unreadCount: 120,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        isEligible: true,
      });

      rerender(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      expect(screen.getByText('99+')).toBeDefined();
    });

    it('al hacer clic en la campana debe abrir el dropdown sin marcar notificaciones como leídas', () => {
      const markAllReadMock = vi.fn();
      const markReadMock = vi.fn();
      const refreshMock = vi.fn();

      vi.spyOn(notificationsHookModule, 'useNotifications').mockReturnValue({
        notifications: [
          {
            id: 'notif-1',
            userId: 'user-1',
            pedidoId: 'ped-123',
            tipo: 'pedido_asignado',
            actorUserId: null,
            readAt: null,
            metadata: { pedido_visible: 'PED-2026-0042', mensaje_resumen: 'Te asignaron PED-2026-0042' },
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        refresh: refreshMock,
        markRead: markReadMock,
        markAllRead: markAllReadMock,
        isEligible: true,
      });

      render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      const bellBtn = screen.getByRole('button', { name: /Notificaciones: 1 no leídas/i });
      fireEvent.click(bellBtn);

      // El dropdown está visible
      expect(screen.getByText('Te asignaron PED-2026-0042')).toBeDefined();
      expect(screen.getByText('Todas')).toBeDefined();
      expect(screen.getByText(/No leídas/i)).toBeDefined();

      // Verificar que NO se marcaron automáticamente como leídas
      expect(markReadMock).not.toHaveBeenCalled();
      expect(markAllReadMock).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 4. COMPONENTE: UserProfileModal
  // ============================================================================
  describe('4. UserProfileModal', () => {
    it('debe mostrar los datos del usuario, campos editables de Nombre/Apellido y campos de solo lectura', () => {
      const mockUser = {
        userId: 'u-123',
        nombre: 'Agustín',
        apellido: 'Pérez',
        nombreUsuario: 'aperez',
        email: 'aperez@tierradelfuego.gob.ar',
        estadoAcceso: 'aprobado' as const,
        appRole: 'equipo' as const,
      };

      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: mockUser,
        isLoading: false,
        isApproved: true,
        isAdmin: false,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: vi.fn(),
      });

      render(<UserProfileModal isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('Mi Perfil')).toBeDefined();

      // Inputs de Nombre y Apellido son editables
      const nombreInput = screen.getByDisplayValue('Agustín') as HTMLInputElement;
      const apellidoInput = screen.getByDisplayValue('Pérez') as HTMLInputElement;
      expect(nombreInput.disabled).toBe(false);
      expect(apellidoInput.disabled).toBe(false);

      // Email y Username son estrictamente deshabilitados / solo lectura
      const emailInput = screen.getByDisplayValue('aperez@tierradelfuego.gob.ar') as HTMLInputElement;
      const usernameInput = screen.getByDisplayValue('@aperez') as HTMLInputElement;
      expect(emailInput.disabled).toBe(true);
      expect(usernameInput.disabled).toBe(true);

      // Rol y Estado se visualizan
      expect(screen.getByText('Equipo Operativo')).toBeDefined();
      expect(screen.getByText(/Aprobado/i)).toBeDefined();
    });

    it('debe llamar a updateMyProfile y refreshUser al guardar cambios válidos', async () => {
      const refreshMock = vi.fn();
      const onCloseMock = vi.fn();

      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: {
          userId: 'u-123',
          nombre: 'Agustín',
          apellido: 'Pérez',
          nombreUsuario: 'aperez',
          email: 'aperez@gob.ar',
          estadoAcceso: 'aprobado' as const,
          appRole: 'equipo' as const,
        },
        isLoading: false,
        isApproved: true,
        isAdmin: false,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: refreshMock,
        signOut: vi.fn(),
      });

      vi.spyOn(authService, 'updateMyProfile').mockResolvedValue({
        success: true,
        data: { nombre: 'Agustín Nuevo', apellido: 'Pérez Modificado' },
      });

      render(<UserProfileModal isOpen={true} onClose={onCloseMock} />);

      const nombreInput = screen.getByDisplayValue('Agustín');
      fireEvent.change(nombreInput, { target: { value: 'Agustín Nuevo' } });

      const saveBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(authService.updateMyProfile).toHaveBeenCalledWith('Agustín Nuevo', 'Pérez');
        expect(refreshMock).toHaveBeenCalled();
        expect(screen.getByText(/Perfil actualizado correctamente/i)).toBeDefined();
      });
    });
  });

  // ============================================================================
  // 5. COMPONENTE: GlobalLogoutModal
  // ============================================================================
  describe('5. GlobalLogoutModal', () => {
    it('debe advertir sobre la revocación de sesiones concurrentes y llamar a signOut({ scope: "global" })', async () => {
      const signOutMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();

      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: {
          userId: 'u-123',
          nombre: 'Equipo',
          apellido: 'DG',
          nombreUsuario: 'laboratoriodg',
          email: 'dg@gob.ar',
          estadoAcceso: 'aprobado' as const,
          appRole: 'equipo' as const,
        },
        isLoading: false,
        isApproved: true,
        isAdmin: false,
        isTeamOrAdmin: true,
        isObserver: false,
        refreshUser: vi.fn(),
        signOut: signOutMock,
      });

      render(<GlobalLogoutModal isOpen={true} onClose={onCloseMock} />);

      expect(screen.getByText(/Cerrar sesión en todos los equipos/i)).toBeDefined();
      expect(screen.getByText(/revocará el acceso en todos los demás dispositivos y pestañas/i)).toBeDefined();

      const confirmBtn = screen.getByRole('button', { name: /Cerrar todas las sesiones/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'global' });
        expect(onCloseMock).toHaveBeenCalled();
      });
    });
  });
});
