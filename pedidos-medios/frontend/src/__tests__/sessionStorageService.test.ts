import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SOLICITANTE_SESSION_STORAGE_KEY,
  getStoredSolicitanteSession,
  saveStoredSolicitanteSession,
  clearStoredSolicitanteSession,
  isSessionStorageAvailable,
} from '../services/sessionStorageService';

describe('sessionStorageService: Gestión segura y tolerante a fallos de sesión temporal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Guarda y recupera sesión válida con metadatos mínimos', () => {
    const saved = saveStoredSolicitanteSession({
      session_token: 'opaque-session-token-abc',
      correo: 'pablosaldiviainfo@gmail.com',
      expires_at: '2026-09-15T04:00:00.000Z',
    });

    expect(saved).toBe(true);

    const stored = getStoredSolicitanteSession();
    expect(stored).not.toBeNull();
    expect(stored?.session_token).toBe('opaque-session-token-abc');
    expect(stored?.correo).toBe('pablosaldiviainfo@gmail.com');
    expect(stored?.expires_at).toBe('2026-09-15T04:00:00.000Z');
    expect(stored?.version).toBe('1.0');

    // NUNCA escribe en localStorage
    expect(localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('2. Rechaza tokens vacíos o no válidos sin alterar storage', () => {
    expect(saveStoredSolicitanteSession({ session_token: '' })).toBe(false);
    expect(saveStoredSolicitanteSession({ session_token: '   ' })).toBe(false);
    expect(getStoredSolicitanteSession()).toBeNull();
  });

  it('3. Limpia exclusivamente la clave de PEDIDOS sin tocar otras claves de sessionStorage', () => {
    sessionStorage.setItem('other_app_key', 'keep_this');
    saveStoredSolicitanteSession({ session_token: 'tok-123' });

    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem('other_app_key')).toBe('keep_this');

    clearStoredSolicitanteSession();

    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem('other_app_key')).toBe('keep_this');
  });

  it('4. Maneja JSON corrupto en sessionStorage limpiando de forma segura sin arrojar excepción', () => {
    sessionStorage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, '{ invalid-json corrupt %%%');

    const result = getStoredSolicitanteSession();
    expect(result).toBeNull();
    // La clave corrupta debe haber sido eliminada defensivamente
    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('5. Maneja estructuras incompatibles o sin session_token eliminando la clave corrupta', () => {
    sessionStorage.setItem(
      SOLICITANTE_SESSION_STORAGE_KEY,
      JSON.stringify({ some_other_property: 123 })
    );

    const result = getStoredSolicitanteSession();
    expect(result).toBeNull();
    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('6. Maneja tolerante el caso donde sessionStorage arroja SecurityError / permisos bloqueados', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    expect(isSessionStorageAvailable()).toBe(false);
    expect(saveStoredSolicitanteSession({ session_token: 'tok' })).toBe(false);
    expect(getStoredSolicitanteSession()).toBeNull();

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });
});
