/**
 * Utilidades de validación y sanitización de URLs para el sistema PEDIDOS.
 * Proyecto: PEDIDOS — Secretaría de Medios (Gobierno de Tierra del Fuego AIAS)
 */

const ALLOWED_EXACT_PATHS = new Set([
  '/gestion',
  '/usuarios',
  '/mis-solicitudes',
  '/solicitud-informacion',
  '/nueva-solicitud',
]);

const ALLOWED_PARAM_PATTERNS = [
  /^\/gestion\/pedidos\/[a-zA-Z0-9_.-]+$/,
  /^\/gestion\/pedido\/[a-zA-Z0-9_.-]+$/,
  /^\/pedido\/[a-zA-Z0-9_.-]+$/,
];

/**
 * Valida y sanitiza una URL de retorno interno (returnTo).
 * Previene ataques de redirección abierta (Open Redirect) garantizando que el destino
 * pertenezca estrictamente a las rutas internas autorizadas de la aplicación SPA.
 *
 * @param rawReturnTo - Cadena de ruta cruda (ej. query param o location state)
 * @param fallback - Ruta de respaldo segura por defecto ('/gestion')
 * @returns Ruta segura autorizada
 */
export function getSafeReturnTo(
  rawReturnTo: string | null | undefined,
  fallback = '/gestion'
): string {
  if (!rawReturnTo || typeof rawReturnTo !== 'string') {
    return fallback;
  }

  const trimmed = rawReturnTo.trim();
  if (!trimmed) {
    return fallback;
  }

  // 1. Debe comenzar con un único '/' y nunca '//' o '/\' (evita protocol-relative URLs: //evil.com)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // 2. Rechazar barras invertidas y caracteres de control
  if (trimmed.includes('\\') || /[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  // 3. Separar pathname de query string y hash
  let pathname = trimmed;
  let queryAndHash = '';

  const queryIdx = trimmed.indexOf('?');
  const hashIdx = trimmed.indexOf('#');
  let splitIdx = -1;
  if (queryIdx !== -1 && hashIdx !== -1) {
    splitIdx = Math.min(queryIdx, hashIdx);
  } else if (queryIdx !== -1) {
    splitIdx = queryIdx;
  } else if (hashIdx !== -1) {
    splitIdx = hashIdx;
  }

  if (splitIdx !== -1) {
    pathname = trimmed.slice(0, splitIdx);
    queryAndHash = trimmed.slice(splitIdx);
  }

  // 4. Rechazar si el pathname contiene ':' (evita javascript:, data:, https: o esquemas maliciosos)
  if (pathname.includes(':')) {
    return fallback;
  }

  // Normalizar pathname (remover barra final si tiene más de 1 caracter)
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // 5. Verificar pertenencia estricta a la lista blanca de rutas internas
  const isExactMatch = ALLOWED_EXACT_PATHS.has(normalizedPath);
  const isPatternMatch = ALLOWED_PARAM_PATTERNS.some((pattern) => pattern.test(normalizedPath));

  if (!isExactMatch && !isPatternMatch) {
    return fallback;
  }

  // 6. Retornar la ruta reconstruida con sus parámetros de consulta o hash originales
  return `${normalizedPath}${queryAndHash}`;
}
