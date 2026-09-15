/**
 * Servicio centralizado y tipado para almacenamiento temporal en sessionStorage
 * de la sesión opaca del solicitante ("Mis Solicitudes").
 * 
 * Reglas contractuales:
 * 1. Usa exclusivamente sessionStorage (aislado por pestaña/recarga).
 * 2. NUNCA almacena en localStorage ni en la URL.
 * 3. NUNCA almacena tokens de enlace (magic links), sobres cifrados ni credenciales privilegiadas.
 * 4. NUNCA llama a sessionStorage.clear() (solo borra su propia clave).
 * 5. Maneja de forma tolerante fallos de JSON corrupto o restricciones de privacidad del navegador.
 */

export const SOLICITANTE_SESSION_STORAGE_KEY = 'pedidos_solicitante_session_v1';

export interface StoredSolicitanteSession {
  version: '1.0';
  session_token: string;
  correo?: string;
  expires_at?: string;
  env?: string;
  stored_at: string;
}

/**
 * Comprueba de forma segura si sessionStorage está disponible y operativo en el navegador
 */
export function isSessionStorageAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return false;
  }
  try {
    const testKey = '__pedidos_storage_test__';
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene y valida la sesión almacenada en sessionStorage.
 * Si el contenido está corrupto o es incompatible, lo limpia y retorna null.
 */
export function getStoredSolicitanteSession(): StoredSolicitanteSession | null {
  if (!isSessionStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY);
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      return null;
    }

    const parsed = JSON.parse(raw);

    // Validación estricta de estructura y tipo
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.session_token !== 'string' ||
      parsed.session_token.trim().length === 0
    ) {
      clearStoredSolicitanteSession();
      return null;
    }

    return {
      version: '1.0',
      session_token: parsed.session_token.trim(),
      correo: typeof parsed.correo === 'string' ? parsed.correo.trim() : undefined,
      expires_at: typeof parsed.expires_at === 'string' ? parsed.expires_at : undefined,
      env: typeof parsed.env === 'string' ? parsed.env : undefined,
      stored_at: typeof parsed.stored_at === 'string' ? parsed.stored_at : new Date().toISOString(),
    };
  } catch {
    // JSON corrupto o error de acceso: limpiar de forma defensiva
    clearStoredSolicitanteSession();
    return null;
  }
}

/**
 * Guarda la sesión opaca y sus metadatos mínimos en sessionStorage.
 * Retorna true si se guardó exitosamente, o false si el almacenamiento está bloqueado.
 */
export function saveStoredSolicitanteSession(params: {
  session_token: string;
  correo?: string;
  expires_at?: string;
  env?: string;
}): boolean {
  if (!params.session_token || typeof params.session_token !== 'string' || params.session_token.trim().length === 0) {
    return false;
  }

  if (!isSessionStorageAvailable()) {
    return false;
  }

  try {
    const payload: StoredSolicitanteSession = {
      version: '1.0',
      session_token: params.session_token.trim(),
      correo: params.correo?.trim(),
      expires_at: params.expires_at,
      env: params.env || (typeof import.meta !== 'undefined' && import.meta.env?.MODE) || 'production',
      stored_at: new Date().toISOString(),
    };

    window.sessionStorage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Elimina exclusivamente la clave de sesión de PEDIDOS de sessionStorage.
 * Nunca usa sessionStorage.clear() para no afectar otras aplicaciones o claves en la misma pestaña.
 */
export function clearStoredSolicitanteSession(): void {
  if (!isSessionStorageAvailable()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(SOLICITANTE_SESSION_STORAGE_KEY);
  } catch {
    // Ignorar si el almacenamiento está bloqueado
  }
}
