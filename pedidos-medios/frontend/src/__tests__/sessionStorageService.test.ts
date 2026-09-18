import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SOLICITANTE_SESSION_STORAGE_KEY,
  getStoredSolicitanteSession,
  saveStoredSolicitanteSession,
  clearStoredSolicitanteSession,
  isSessionStorageAvailable,
} from '../services/sessionStorageService';

describe('sessionStorageService: Gestión segura y estrictamente aislada en sessionStorage', () => {
  beforeEach(() => {
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    clearStoredSolicitanteSession();
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Guarda y recupera sesión válida en sessionStorage SIN escribir en localStorage', () => {
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

    // Escribe en sessionStorage
    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).not.toBeNull();

    // NUNCA escribe en localStorage (contrato de seguridad y privacidad)
    expect(localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('2. Rechaza tokens vacíos o no válidos sin alterar storage', () => {
    expect(saveStoredSolicitanteSession({ session_token: '' })).toBe(false);
    expect(saveStoredSolicitanteSession({ session_token: '   ' })).toBe(false);
    expect(getStoredSolicitanteSession()).toBeNull();
  });

  it('3. Limpia exclusivamente la clave de PEDIDOS sin tocar otras claves de storage', () => {
    localStorage.setItem('other_app_key', 'keep_this');
    sessionStorage.setItem('other_app_key', 'keep_this');
    saveStoredSolicitanteSession({ session_token: 'tok-123' });

    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem('other_app_key')).toBe('keep_this');
    expect(localStorage.getItem('other_app_key')).toBe('keep_this');

    clearStoredSolicitanteSession();

    expect(sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem('other_app_key')).toBe('keep_this');
    expect(localStorage.getItem('other_app_key')).toBe('keep_this');
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

  it('6. Purga preventivamente cualquier residuo obsoleto en localStorage', () => {
    localStorage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, JSON.stringify({ session_token: 'legacy-token' }));

    // Al llamar a getStoredSolicitanteSession() debe purgar localStorage
    const result = getStoredSolicitanteSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('7. Maneja tolerante el caso donde sessionStorage arroja SecurityError / permisos bloqueados', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    expect(isSessionStorageAvailable()).toBe(false);
    // Retorna false indicando que el almacenamiento web falló (se retiene en memoria)
    expect(saveStoredSolicitanteSession({ session_token: 'tok' })).toBe(false);
    expect(getStoredSolicitanteSession()?.session_token).toBe('tok');

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });
});

