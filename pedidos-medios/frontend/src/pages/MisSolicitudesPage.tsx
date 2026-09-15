import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  solicitanteRequestAccess,
  solicitanteSessionExchange,
  solicitanteGetPedidos,
  solicitanteGetPedidoDetail,
  solicitanteSubmitInfoResponse,
  solicitanteSessionRevoke,
  SolicitantePedidoListItem,
  SolicitantePedidoDetailDTO,
} from '../services/trackingApi';
import {
  getStoredSolicitanteSession,
  saveStoredSolicitanteSession,
  clearStoredSolicitanteSession,
  isSessionStorageAvailable,
} from '../services/sessionStorageService';

interface UrlTokenResult {
  token: string | null;
  isMalformedOrEmpty: boolean;
}

function parseUrlToken(): UrlTokenResult {
  if (typeof window === 'undefined') return { token: null, isMalformedOrEmpty: false };
  
  let hasTokenParam = false;
  let rawVal: string | null = null;

  // 1. Check URL Hash: #token=... or #access_token=...
  if (window.location.hash) {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    const hashParams = new URLSearchParams(rawHash);
    if (hashParams.has('token') || hashParams.has('access_token')) {
      hasTokenParam = true;
      rawVal = hashParams.get('token') || hashParams.get('access_token');
    }
  }

  // 2. Check URL Search Query: ?token=... or ?access_token=...
  if (!hasTokenParam && window.location.search) {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('token') || searchParams.has('access_token')) {
      hasTokenParam = true;
      rawVal = searchParams.get('token') || searchParams.get('access_token');
    }
  }

  if (hasTokenParam) {
    const trimmed = (rawVal || '').trim();
    if (trimmed.length > 0) {
      return { token: trimmed, isMalformedOrEmpty: false };
    }
    return { token: null, isMalformedOrEmpty: true };
  }

  return { token: null, isMalformedOrEmpty: false };
}

type ViewMode = 'INITIAL_EXCHANGE' | 'REQUEST_FORM' | 'AUTHENTICATED' | 'EXCHANGE_ERROR';

export const MisSolicitudesPage: React.FC = () => {
  // Synchronous extraction of token on initial load
  const initialTokenResult = useMemo(() => parseUrlToken(), []);
  const initialToken = initialTokenResult.token;

  // Synchronous extraction of stored session if no token in URL
  const storedSession = useMemo(() => {
    if (initialTokenResult.token || initialTokenResult.isMalformedOrEmpty) {
      return null;
    }
    return getStoredSolicitanteSession();
  }, [initialTokenResult]);

  const isRestoringRef = useRef<boolean>(Boolean(!initialTokenResult.token && storedSession?.session_token));

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (initialTokenResult.token) return 'INITIAL_EXCHANGE';
    if (initialTokenResult.isMalformedOrEmpty) return 'EXCHANGE_ERROR';
    if (storedSession?.session_token) return 'INITIAL_EXCHANGE';
    return 'REQUEST_FORM';
  });

  // Authentication & Session State (Scoped in memory and persisted in sessionStorage)
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return storedSession?.session_token || null;
  });
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => {
    return storedSession?.correo || null;
  });
  const [storageBlockedWarning, setStorageBlockedWarning] = useState<boolean>(false);

  const exchangedRef = useRef(false);
  const requestIdRef = useRef(0);

  // Request Link State
  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Exchange Error State
  const [exchangeError, setExchangeError] = useState<string | null>(() => {
    if (initialTokenResult.isMalformedOrEmpty) {
      return 'El enlace de acceso recibido está incompleto o es inválido. Por favor solicite un nuevo enlace.';
    }
    return null;
  });

  // Pedidos List State
  const [pedidos, setPedidos] = useState<SolicitantePedidoListItem[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [pedidosError, setPedidosError] = useState<string | null>(null);

  // Selected Pedido Detail Modal / Drawer
  const [selectedPedido, setSelectedPedido] = useState<SolicitantePedidoDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Info Request Response Form State
  const [respondingSolicitudId, setRespondingSolicitudId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responseLinks, setResponseLinks] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseSuccess, setResponseSuccess] = useState<string | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const loadPedidos = async (st: string, fallbackEmail?: string, reqId?: number) => {
    const activeReqId = reqId ?? ++requestIdRef.current;
    setLoadingPedidos(true);
    setPedidosError(null);

    try {
      const res = await solicitanteGetPedidos(st);
      if (activeReqId !== requestIdRef.current) return;

      setPedidos(res.pedidos || []);
      if (res.correo) {
        setSessionEmail(res.correo);
        // Sincronizar correo en sessionStorage si no estaba presente
        const currentStored = getStoredSolicitanteSession();
        if (currentStored && currentStored.session_token === st && !currentStored.correo) {
          saveStoredSolicitanteSession({
            ...currentStored,
            correo: res.correo,
          });
        }
      } else if (fallbackEmail && !sessionEmail) {
        setSessionEmail(fallbackEmail);
      }
      setViewMode('AUTHENTICATED');
    } catch (err: any) {
      if (activeReqId !== requestIdRef.current) return;

      const code = err?.code || '';
      const status = err?.status;
      const isAuthError =
        status === 401 ||
        code === 'SESSION_INVALID' ||
        code === 'SESSION_NOT_FOUND' ||
        code === 'SESSION_EXPIRED' ||
        code === 'SESSION_REVOKED' ||
        (err?.message && (
          err.message.includes('SESSION_INVALID') ||
          err.message.includes('SESSION_NOT_FOUND') ||
          err.message.includes('SESSION_EXPIRED') ||
          err.message.includes('SESSION_REVOKED') ||
          err.message.includes('Token de sesión') ||
          err.message.includes('Sesión no encontrada')
        ));

      if (isAuthError) {
        // Sesión vencida o inválida confirmada por backend: borrar almacenamiento local
        clearStoredSolicitanteSession();
        setSessionToken(null);
        setSessionEmail(null);
        setPedidos([]);
        setSelectedPedido(null);
        setExchangeError('Su sesión ha expirado o es inválida. Por favor solicite un nuevo enlace de acceso.');
        setViewMode('EXCHANGE_ERROR');
      } else {
        // Fallo de red, timeout o error transitorio: NO borrar sesión, permitir reintento
        setPedidosError(err.message || 'Error de conexión al cargar el listado de pedidos.');
        setViewMode('AUTHENTICATED');
      }
    } finally {
      if (activeReqId === requestIdRef.current) {
        setLoadingPedidos(false);
      }
    }
  };

  const handlePerformExchange = async (token: string) => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;
    isRestoringRef.current = false;
    setViewMode('INITIAL_EXCHANGE');

    // Iniciar nuevo request y limpiar datos previos para no mezclar identidades
    const currentReqId = ++requestIdRef.current;
    clearStoredSolicitanteSession();
    setSessionToken(null);
    setSessionEmail(null);
    setPedidos([]);
    setSelectedPedido(null);
    setPedidosError(null);

    // Sanitizar inmediatamente la barra de direcciones (nunca persistir token de enlace)
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    try {
      const res = await solicitanteSessionExchange(token);
      if (currentReqId !== requestIdRef.current) return;

      const resolvedEmail = res.correo || res.email || '';
      const sessionTok = res.session_token;

      // Guardar sesión opaca en sessionStorage
      const saved = saveStoredSolicitanteSession({
        session_token: sessionTok,
        correo: resolvedEmail,
        expires_at: res.expires_at,
      });
      if (!saved && !isSessionStorageAvailable()) {
        setStorageBlockedWarning(true);
      }

      setSessionToken(sessionTok);
      setSessionEmail(resolvedEmail);
      await loadPedidos(sessionTok, resolvedEmail, currentReqId);
    } catch (err: any) {
      if (currentReqId !== requestIdRef.current) return;
      clearStoredSolicitanteSession();
      const code = err?.code || '';
      let msg = 'El enlace de acceso es inválido o ha expirado. Por favor solicite un nuevo enlace.';
      if (code === 'TOKEN_EXPIRED') {
        msg = 'Este enlace de acceso ha expirado. Por favor solicite un nuevo enlace para acceder.';
      } else if (code === 'TOKEN_ALREADY_USED') {
        msg = 'Este enlace de acceso ya ha sido utilizado previamente. Por favor solicite un nuevo enlace.';
      } else if (code === 'TOKEN_NOT_FOUND' || code === 'TOKEN_INVALID') {
        msg = 'El enlace de acceso no es válido o no existe. Por favor solicite un nuevo enlace.';
      } else if (err?.message) {
        msg = err.message;
      }
      setExchangeError(msg);
      setViewMode('EXCHANGE_ERROR');
    }
  };

  const handleRestoreSession = async (token: string, fallbackEmail?: string) => {
    const currentReqId = ++requestIdRef.current;
    setViewMode('INITIAL_EXCHANGE');
    setSessionToken(token);
    if (fallbackEmail) setSessionEmail(fallbackEmail);
    await loadPedidos(token, fallbackEmail, currentReqId);
  };

  // Inicialización: canje si viene token en URL, o restauración si existe sesión guardada
  useEffect(() => {
    if (initialToken) {
      handlePerformExchange(initialToken);
    } else {
      const stored = getStoredSolicitanteSession();
      if (stored?.session_token) {
        handleRestoreSession(stored.session_token, stored.correo);
      }
    }
  }, [initialToken]);

  // Soporte de eventos in-page hashchange / popstate
  useEffect(() => {
    const handleHashOrPopState = () => {
      const parsed = parseUrlToken();
      if (parsed.token) {
        exchangedRef.current = false;
        isRestoringRef.current = false;
        handlePerformExchange(parsed.token);
      } else if (parsed.isMalformedOrEmpty && !sessionToken) {
        setExchangeError('El enlace de acceso recibido está incompleto o es inválido. Por favor solicite un nuevo enlace.');
        setViewMode('EXCHANGE_ERROR');
      }
    };
    window.addEventListener('hashchange', handleHashOrPopState);
    window.addEventListener('popstate', handleHashOrPopState);
    return () => {
      window.removeEventListener('hashchange', handleHashOrPopState);
      window.removeEventListener('popstate', handleHashOrPopState);
    };
  }, [sessionToken]);

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    if (!email.trim() || !email.includes('@')) {
      setRequestError('Ingrese un correo electrónico válido.');
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    setRequestMessage(null);
    try {
      const res = await solicitanteRequestAccess(email);
      setRequestMessage(
        res.message ||
          'Si existen solicitudes asociadas a este correo, le enviamos un enlace seguro para acceder.'
      );
      setCooldown(45);
    } catch (err: unknown) {
      setRequestError((err as Error)?.message || 'Error al procesar la solicitud.');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleSelectPedido = async (pedidoRef: string) => {
    if (!sessionToken) return;
    setLoadingDetail(true);
    setDetailError(null);
    setSelectedPedido(null);
    setRespondingSolicitudId(null);
    setResponseSuccess(null);
    setResponseError(null);
    try {
      const detail = await solicitanteGetPedidoDetail(sessionToken, pedidoRef);
      setSelectedPedido(detail);
    } catch (err: any) {
      setDetailError(err.message || 'No se pudo obtener el detalle de la solicitud.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitInfoResponse = async (e: React.FormEvent, solicitudId: string) => {
    e.preventDefault();
    if (!sessionToken || !selectedPedido) return;

    if (!responseText.trim() && !responseLinks.trim()) {
      setResponseError('Debe ingresar un texto explicativo o al menos un enlace con material.');
      return;
    }

    setSubmittingResponse(true);
    setResponseError(null);
    setResponseSuccess(null);

    const parsedLinks = responseLinks
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    try {
      await solicitanteSubmitInfoResponse(sessionToken, solicitudId, responseText.trim(), parsedLinks);
      setResponseSuccess('¡Respuesta enviada con éxito! Su solicitud ha vuelto al estado operativo.');
      setRespondingSolicitudId(null);
      setResponseText('');
      setResponseLinks('');
      // Reload detail and list
      await handleSelectPedido(selectedPedido.pedido_visible);
      await loadPedidos(sessionToken);
    } catch (err: any) {
      setResponseError(err.message || 'Error al enviar la respuesta a la solicitud de información.');
    } finally {
      setSubmittingResponse(false);
    }
  };

  const handleLogout = async () => {
    // Incrementar ID para invalidar respuestas asíncronas tardías
    requestIdRef.current++;
    const tokenToRevoke = sessionToken;
    clearStoredSolicitanteSession();
    setSessionToken(null);
    setSessionEmail(null);
    setPedidos([]);
    setSelectedPedido(null);
    setStorageBlockedWarning(false);
    setViewMode('REQUEST_FORM');
    if (tokenToRevoke) {
      try {
        await solicitanteSessionRevoke(tokenToRevoke);
      } catch {
        // Ignorar fallo de red en revocación remota
      }
    }
  };

  const getEstadoBadge = (estado: string) => {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      'Nuevo': { label: 'Nuevo', bg: '#e0f2fe', color: '#0369a1' },
      'En revisión': { label: 'En Revisión', bg: '#fef3c7', color: '#b45309' },
      'En proceso': { label: 'En Proceso', bg: '#e0e7ff', color: '#4338ca' },
      'Esperando información': { label: 'Esperando Información (48h)', bg: '#fefce8', color: '#a16207' },
      'Finalizado': { label: 'Finalizado', bg: '#dcfce7', color: '#15803d' },
      'Cancelado': { label: 'Cancelado', bg: '#fee2e2', color: '#b91c1c' },
    };
    const c = map[estado] || { label: estado, bg: '#f3f4f6', color: '#374151' };
    return (
      <span
        style={{
          backgroundColor: c.bg,
          color: c.color,
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          fontWeight: 600,
          fontSize: '0.8125rem',
          display: 'inline-block',
        }}
      >
        {c.label}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Mis Solicitudes
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
            Acceda a todas sus solicitudes mediante su correo electrónico institucional.
          </p>
        </div>

        {sessionToken && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Sesión Verificada</span>
              <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{sessionEmail || 'Solicitante'}</strong>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Cerrar Sesión
            </button>
          </div>
        )}
      </div>

      {/* Storage Blocked Warning Banner */}
      {storageBlockedWarning && sessionToken && (
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', color: '#92400e', fontSize: '0.875rem' }}>
          ⚠️ El almacenamiento de sesión está deshabilitado en su navegador. La sesión permanecerá activa en memoria, pero no podrá conservarse si recarga o cierra esta pestaña.
        </div>
      )}

      {/* VIEW 1: INITIAL EXCHANGE OR SESSION RESTORE IN PROGRESS */}
      {viewMode === 'INITIAL_EXCHANGE' && (
        <div style={{ maxWidth: '520px', margin: '2rem auto' }}>
          <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'inline-block', width: '2.5rem', height: '2.5rem', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ marginTop: '1rem', color: '#1e293b', fontSize: '1.125rem', fontWeight: 700 }}>
              {isRestoringRef.current ? 'Estamos recuperando tu sesión...' : 'Estamos abriendo tus solicitudes...'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              {isRestoringRef.current ? 'Validando credenciales de acceso.' : 'Verificando enlace seguro de acceso.'}
            </p>
          </div>
        </div>
      )}

      {/* VIEW 2: EXCHANGE ERROR */}
      {viewMode === 'EXCHANGE_ERROR' && (
        <div style={{ maxWidth: '520px', margin: '2rem auto' }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3.5rem', height: '3.5rem', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '1.5rem', marginBottom: '1rem' }}>
                ⚠️
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                Aviso de Acceso
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                {exchangeError || 'El enlace de acceso es inválido o ha expirado.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setExchangeError(null);
                setViewMode('REQUEST_FORM');
              }}
              style={{
                width: '100%',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              Solicitar un nuevo enlace
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: REQUEST ACCESS EMAIL FORM */}
      {viewMode === 'REQUEST_FORM' && (
        <div style={{ maxWidth: '520px', margin: '2rem auto' }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3.5rem', height: '3.5rem', borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '1.5rem', marginBottom: '1rem' }}>
                ✉️
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                Ingreso sin Contraseña
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                Ingrese el correo electrónico que utilizó al enviar sus pedidos. Le enviaremos un enlace seguro directo a su bandeja de entrada.
              </p>
            </div>

            {requestMessage && (
              <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#166534', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Enlace de acceso enviado</p>
                <p style={{ margin: '0 0 0.25rem 0' }}>{requestMessage}</p>
                {cooldown > 0 && (
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8125rem', color: '#15803d' }}>
                    Podrás solicitar otro enlace en {cooldown} segundos.
                  </p>
                )}
              </div>
            )}

            {requestError && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '0.5rem', color: '#991b1b', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                {requestError}
              </div>
            )}

            <form onSubmit={handleRequestAccess}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="solicitante-email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Correo Electrónico
                </label>
                <input
                  id="solicitante-email"
                  type="email"
                  required
                  placeholder="usuario@ejemplo.gob.ar"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                disabled={requestLoading || cooldown > 0}
                style={{
                  width: '100%',
                  backgroundColor: cooldown > 0 ? '#94a3b8' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: requestLoading || cooldown > 0 ? 'not-allowed' : 'pointer',
                  opacity: requestLoading ? 0.7 : 1,
                }}
              >
                {requestLoading
                  ? 'Enviando enlace...'
                  : cooldown > 0
                  ? `Podrás solicitar otro enlace en ${cooldown}s`
                  : 'Recibir Enlace Seguro de Acceso'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 4: ACTIVE SESSION -> List of Pedidos + Inspection Drawer */}
      {viewMode === 'AUTHENTICATED' && sessionToken && (
        <div>
          {/* Summary Indicators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Solicitudes</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>{pedidos.length}</div>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>Requieren Información (48h)</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b45309', marginTop: '0.25rem' }}>
                {pedidos.filter((p) => (p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0) > 0).length}
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.75rem', color: '#4338ca', fontWeight: 600, textTransform: 'uppercase' }}>En Curso</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4338ca', marginTop: '0.25rem' }}>
                {pedidos.filter((p) => p.estado === 'En proceso' || p.estado === 'En revisión' || p.estado === 'Nuevo').length}
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase' }}>Finalizados / Entregados</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                {pedidos.filter((p) => p.estado === 'Finalizado').length}
              </div>
            </div>
          </div>

          {/* Pedidos Table */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Listado de Solicitudes
              </h2>
              <button
                type="button"
                onClick={() => loadPedidos(sessionToken, sessionEmail || undefined)}
                disabled={loadingPedidos}
                style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {loadingPedidos ? 'Actualizando...' : '↻ Actualizar'}
              </button>
            </div>

            {loadingPedidos && (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                Cargando sus solicitudes...
              </div>
            )}

            {pedidosError && (
              <div style={{ padding: '1rem 1.25rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', margin: '1rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.875rem' }}>Error al comunicarse con el servidor</strong>
                  <span style={{ fontSize: '0.8125rem' }}>{pedidosError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadPedidos(sessionToken, sessionEmail || undefined)}
                  disabled={loadingPedidos}
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: loadingPedidos ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loadingPedidos ? 'Reintentando...' : 'Reintentar'}
                </button>
              </div>
            )}

            {!loadingPedidos && pedidos.length === 0 && !pedidosError && (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b' }}>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: '#334155', margin: '0 0 0.5rem 0' }}>No se encontraron solicitudes registradas</p>
                <p style={{ fontSize: '0.875rem', margin: 0 }}>Este correo electrónico no tiene pedidos asociados aún.</p>
              </div>
            )}

            {!loadingPedidos && pedidos.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 1.25rem' }}>Código Pedido</th>
                      <th style={{ padding: '0.75rem 1.25rem' }}>Categoría / Servicio</th>
                      <th style={{ padding: '0.75rem 1.25rem' }}>Fecha de Ingreso</th>
                      <th style={{ padding: '0.75rem 1.25rem' }}>Estado</th>
                      <th style={{ padding: '0.75rem 1.25rem' }}>Atención</th>
                      <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((p) => {
                      const pendingInfoCount = p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0;
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '1rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>
                            {p.pedido_visible}
                          </td>
                          <td style={{ padding: '1rem 1.25rem' }}>
                            <div style={{ fontWeight: 600, color: '#334155' }}>{p.categoria_nombre}</div>
                            <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>{p.tipo_nombre}</div>
                          </td>
                          <td style={{ padding: '1rem 1.25rem', color: '#475569' }}>
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '1rem 1.25rem' }}>
                            {getEstadoBadge(p.estado)}
                          </td>
                          <td style={{ padding: '1rem 1.25rem' }}>
                            {pendingInfoCount > 0 ? (
                              <span style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}>
                                ⚠️ Responder Info ({pendingInfoCount})
                              </span>
                            ) : p.tiene_entrega ? (
                              <span style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}>
                                ✓ Entrega Disponible
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Al día</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleSelectPedido(p.pedido_visible)}
                              style={{
                                backgroundColor: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '0.375rem',
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                cursor: 'pointer',
                              }}
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL / DRAWER: Solicitante Pedido Detail */}
      {(selectedPedido || loadingDetail || detailError) && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Detalle de Solicitud
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0 0 0' }}>
                  {selectedPedido ? selectedPedido.pedido_visible : 'Cargando...'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedPedido(null); setDetailError(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {loadingDetail && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                Cargando datos del pedido...
              </div>
            )}

            {detailError && (
              <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem' }}>
                {detailError}
              </div>
            )}

            {selectedPedido && !loadingDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Status & Service Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Servicio</span>
                    <p style={{ margin: '0.1rem 0 0 0', fontWeight: 700, color: '#1e293b' }}>{selectedPedido.categoria_nombre} — {selectedPedido.tipo_nombre}</p>
                  </div>
                  <div>
                    {getEstadoBadge(selectedPedido.estado)}
                  </div>
                </div>

                {/* Response Feedback Alerts */}
                {responseSuccess && (
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#166534', fontSize: '0.875rem' }}>
                    {responseSuccess}
                  </div>
                )}
                {responseError && (
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '0.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
                    {responseError}
                  </div>
                )}

                {/* 48h Info Requests & In-Place Response Form */}
                {selectedPedido.solicitudes_informacion && selectedPedido.solicitudes_informacion.length > 0 && (
                  <div style={{ border: '1px solid #fef08a', backgroundColor: '#fefce8', borderRadius: '0.5rem', padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#854d0e', margin: '0 0 0.75rem 0' }}>
                      ⚠️ Solicitudes de Información Faltante (48 Horas Corridas)
                    </h3>
                    {selectedPedido.solicitudes_informacion.map((s) => {
                      const isExpired = Date.now() >= new Date(s.expires_at).getTime();
                      const isPending = s.estado === 'pendiente' && !isExpired;

                      return (
                        <div key={s.id} style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #fde047', marginBottom: '0.75rem' }}>
                          <p style={{ margin: '0 0 0.5rem 0', color: '#334155', fontWeight: 500 }}>{s.mensaje}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                            <span>Vence: {new Date(s.expires_at).toLocaleString()} (48h corridas)</span>
                            <span style={{ fontWeight: 700, color: s.estado === 'respondida' ? '#15803d' : isExpired ? '#b91c1c' : '#b45309' }}>
                              {s.estado === 'respondida' ? 'Respondida' : isExpired ? 'Vencida' : 'Pendiente'}
                            </span>
                          </div>

                          {s.respuesta_texto && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f0fdf4', borderRadius: '0.25rem', fontSize: '0.8125rem', color: '#166534' }}>
                              <strong>Su respuesta:</strong> {s.respuesta_texto}
                            </div>
                          )}

                          {isPending && (
                            <div style={{ marginTop: '0.75rem' }}>
                              {respondingSolicitudId === s.id ? (
                                <form onSubmit={(e) => handleSubmitInfoResponse(e, s.id)} style={{ marginTop: '0.5rem' }}>
                                  <div style={{ marginBottom: '0.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                                      Texto de Respuesta
                                    </label>
                                    <textarea
                                      rows={3}
                                      placeholder="Escriba la información o aclaración solicitada..."
                                      value={responseText}
                                      onChange={(e) => setResponseText(e.target.value)}
                                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                                      Enlaces a materiales (Google Drive, Dropbox, OneDrive, WeTransfer o cualquier URL):
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="https://drive.google.com/... o https://dropbox.com/..."
                                      value={responseLinks}
                                      onChange={(e) => setResponseLinks(e.target.value)}
                                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => setRespondingSolicitudId(null)}
                                      style={{ padding: '0.4rem 0.75rem', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={submittingResponse}
                                      style={{ padding: '0.4rem 0.75rem', backgroundColor: '#ca8a04', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.8125rem', cursor: submittingResponse ? 'not-allowed' : 'pointer' }}
                                    >
                                      {submittingResponse ? 'Enviando...' : 'Enviar Respuesta'}
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setRespondingSolicitudId(s.id); setResponseText(''); setResponseLinks(''); }}
                                  style={{ backgroundColor: '#ca8a04', color: '#ffffff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}
                                >
                                  Responder a esta solicitud
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Final Delivery & Drive Link */}
                {selectedPedido.entrega && (
                  <div style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', borderRadius: '0.5rem', padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#166534', margin: '0 0 0.5rem 0' }}>
                      🎉 Entrega del Trabajo Realizado (v{selectedPedido.entrega.version})
                    </h3>
                    {selectedPedido.entrega.nota_publica && (
                      <p style={{ margin: '0 0 0.75rem 0', color: '#1e293b', fontSize: '0.875rem' }}>{selectedPedido.entrega.nota_publica}</p>
                    )}
                    {selectedPedido.entrega.url_entrega && (
                      <a
                        href={selectedPedido.entrega.url_entrega}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-block', backgroundColor: '#16a34a', color: '#ffffff', padding: '0.45rem 1rem', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
                      >
                        Descargar / Ver Materiales de Entrega
                      </a>
                    )}
                  </div>
                )}

                {/* Public Timeline */}
                {selectedPedido.timeline_publico && selectedPedido.timeline_publico.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem 0' }}>
                      Línea de Tiempo del Pedido
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPedido.timeline_publico.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f8fafc', borderLeft: '3px solid #0284c7', borderRadius: '0 0.375rem 0.375rem 0', fontSize: '0.8125rem' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.evento}</span>
                          <span style={{ color: '#64748b' }}>{new Date(item.fecha).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Original Attachments Metadata */}
                {selectedPedido.archivos_adjuntos && selectedPedido.archivos_adjuntos.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem 0' }}>
                      Archivos Iniciales Adjuntos
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {selectedPedido.archivos_adjuntos.map((arch) => (
                        <div key={arch.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', fontSize: '0.8125rem' }}>
                          <span style={{ color: '#334155' }}>{arch.nombre}</span>
                          <span style={{ color: '#64748b' }}>{(arch.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
