/**
 * Servicio centralizado y tipado para almacenamiento en sesión
 * del solicitante ("Mis Solicitudes").
 * 
 * Reglas contractuales de seguridad y arquitectura:
 * 1. Utiliza estrictamente sessionStorage (aislado por pestaña) como almacenamiento web.
 * 2. NUNCA escribe bearer credentials, session tokens ni correos en localStorage.
 * 3. Posee fallback seguro a memoria interna ante restricciones del navegador (ej. modo incógnito).
 * 4. Limpia preventivamente cualquier residuo obsoleto en localStorage para evitar fugas entre pestañas.
 * 5. NUNCA llama a storage.clear() (solo gestiona su propia clave).
 * 6. Maneja de forma tolerante fallos de JSON corrupto o restricciones de privacidad.
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

// Fallback en memoria si sessionStorage está totalmente restringido o inaccesible
let inMemorySession: StoredSolicitanteSession | null = null;

/**
 * Obtiene el objeto sessionStorage disponible de forma segura.
 */
function getAvailableSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    if (window.sessionStorage) {
      const testKey = '__pedidos_test_storage__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    }
  } catch {
    // sessionStorage no disponible o restringido
  }

  return null;
}

/**
 * Comprueba de forma segura si sessionStorage está disponible
 */
export function isSessionStorageAvailable(): boolean {
  return getAvailableSessionStorage() !== null;
}

/**
 * Obtiene y valida la sesión almacenada en sessionStorage (o memoria).
 * Si el contenido está corrupto o es incompatible, lo limpia y retorna null.
 * Defensivamente remueve cualquier residuo que hubiese quedado previamente en localStorage.
 */
export function getStoredSolicitanteSession(): StoredSolicitanteSession | null {
  // Purga defensiva de cualquier residuo obsoleto en localStorage
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage && window.localStorage.getItem(SOLICITANTE_SESSION_STORAGE_KEY)) {
        window.localStorage.removeItem(SOLICITANTE_SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignorar restricciones de acceso a localStorage
    }
  }

  const storage = getAvailableSessionStorage();

  if (!storage) {
    if (inMemorySession) {
      return { ...inMemorySession };
    }
    return null;
  }

  try {
    const raw = storage.getItem(SOLICITANTE_SESSION_STORAGE_KEY);

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

    const sessionObj: StoredSolicitanteSession = {
      version: '1.0',
      session_token: parsed.session_token.trim(),
      correo: typeof parsed.correo === 'string' ? parsed.correo.trim() : undefined,
      expires_at: typeof parsed.expires_at === 'string' ? parsed.expires_at : undefined,
      env: typeof parsed.env === 'string' ? parsed.env : undefined,
      stored_at: typeof parsed.stored_at === 'string' ? parsed.stored_at : new Date().toISOString(),
    };

    inMemorySession = { ...sessionObj };
    return sessionObj;
  } catch {
    // JSON corrupto o error de acceso: limpiar de forma defensiva
    clearStoredSolicitanteSession();
    return null;
  }
}

/**
 * Guarda la sesión opaca y sus metadatos mínimos en sessionStorage y memoria defensiva.
 * Retorna true si se guardó exitosamente en sessionStorage.
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

  const payload: StoredSolicitanteSession = {
    version: '1.0',
    session_token: params.session_token.trim(),
    correo: params.correo?.trim(),
    expires_at: params.expires_at,
    env: params.env || (typeof import.meta !== 'undefined' && import.meta.env?.MODE) || 'production',
    stored_at: new Date().toISOString(),
  };

  inMemorySession = { ...payload };

  const storage = getAvailableSessionStorage();
  if (!storage) {
    return false; // Guardado en memoria únicamente por almacenamiento no disponible
  }

  try {
    storage.setItem(SOLICITANTE_SESSION_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false; // Conservado en memoria únicamente por fallo de almacenamiento
  }
}

/**
 * Elimina exclusivamente la clave de sesión de PEDIDOS en sessionStorage, memoria y localStorage.
 * Nunca usa storage.clear() para no afectar otras claves del sitio.
 */
export function clearStoredSolicitanteSession(): void {
  inMemorySession = null;

  if (typeof window === 'undefined') return;

  try {
    if (window.sessionStorage) {
      window.sessionStorage.removeItem(SOLICITANTE_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignorar
  }

  try {
    if (window.localStorage) {
      window.localStorage.removeItem(SOLICITANTE_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignorar
  }
}

