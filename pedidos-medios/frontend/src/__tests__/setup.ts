import '@testing-library/jest-dom';
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const PROD_SUPABASE_REF = 'uwzgyirilafgnbpmrkic';
const nativeFetch = globalThis.fetch;

/**
 * Guardián global de aislamiento de red para pruebas unitarias (GATE-0 / Fase 0H).
 * Bloquea de forma fail-closed cualquier intento de petición HTTP hacia el proyecto
 * Supabase PRODUCCIÓN durante la ejecución de Vitest.
 */
function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input && typeof input.url === 'string') {
    return input.url;
  }
  return String(input);
}

export function createProdBlockedFetch(
  baseFetch: typeof fetch = nativeFetch
): typeof fetch {
  const guardedFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const targetUrl = extractRequestUrl(input);
    if (targetUrl.toLowerCase().includes(PROD_SUPABASE_REF)) {
      throw new Error(
        `SECURITY_VIOLATION: Las pruebas unitarias tienen estrictamente prohibido conectarse a Supabase PRODUCCIÓN (${PROD_SUPABASE_REF}). URL bloqueada: ${targetUrl}`
      );
    }
    return baseFetch(input, init);
  }) as typeof fetch;

  return guardedFetch;
}

const guardedGlobalFetch = createProdBlockedFetch(nativeFetch);
globalThis.fetch = guardedGlobalFetch;

beforeEach(() => {
  // Asegurar que el guardián de red hacia PROD esté activo al inicio de cada test
  if (globalThis.fetch === nativeFetch) {
    globalThis.fetch = guardedGlobalFetch;
  }
  // Configurar la URL inicial de jsdom bajo el base path de PEDIDOS
  window.history.pushState({}, 'Test page', '/formulariomedios/');
});

afterEach(() => {
  cleanup();
  if (globalThis.fetch === nativeFetch) {
    globalThis.fetch = guardedGlobalFetch;
  }
});
