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
import { InfoResponseForm } from '../components/InfoResponseForm';
import { formatFileSize } from '../utils/formatUtils';

interface UrlParamsResult {
  token: string | null;
  isMalformedOrEmpty: boolean;
  targetPedido: string | null;
}

function parseUrlParams(): UrlParamsResult {
  if (typeof window === 'undefined') return { token: null, isMalformedOrEmpty: false, targetPedido: null };

  let hasTokenParam = false;
  let rawVal: string | null = null;
  let targetPed: string | null = null;

  // 1. Check URL Hash: #access_token=...&pedido=... or #token=...
  if (window.location.hash) {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    const hashParams = new URLSearchParams(rawHash);
    if (hashParams.has('access_token') || hashParams.has('token')) {
      hasTokenParam = true;
      rawVal = hashParams.get('access_token') || hashParams.get('token');
    }
    if (hashParams.has('pedido') || hashParams.has('ref') || hashParams.has('pedido_id') || hashParams.has('id')) {
      targetPed = hashParams.get('pedido') || hashParams.get('ref') || hashParams.get('pedido_id') || hashParams.get('id');
    }
  }

  // 2. Check URL Search Query: ?access_token=...&pedido=...
  if (window.location.search) {
    const searchParams = new URLSearchParams(window.location.search);
    if (!hasTokenParam && (searchParams.has('access_token') || searchParams.has('token'))) {
      hasTokenParam = true;
      rawVal = searchParams.get('access_token') || searchParams.get('token');
    }
    if (!targetPed && (searchParams.has('pedido') || searchParams.has('ref') || searchParams.has('pedido_id') || searchParams.has('id'))) {
      targetPed = searchParams.get('pedido') || searchParams.get('ref') || searchParams.get('pedido_id') || searchParams.get('id');
    }
  }

  let token: string | null = null;
  let isMalformedOrEmpty = false;

  if (hasTokenParam) {
    const trimmed = (rawVal || '').trim();
    if (trimmed.length > 0) {
      token = trimmed;
    } else {
      isMalformedOrEmpty = true;
    }
  }

  return {
    token,
    isMalformedOrEmpty,
    targetPedido: targetPed ? targetPed.trim() : null,
  };
}

type ViewMode = 'INITIAL_EXCHANGE' | 'REQUEST_FORM' | 'AUTHENTICATED' | 'EXCHANGE_ERROR';
type FilterTab = 'todos' | 'info_requerida' | 'en_curso' | 'finalizadas';

export const MisSolicitudesPage: React.FC = () => {
  // Synchronous extraction of token and target pedido on initial load
  const initialParams = useMemo(() => parseUrlParams(), []);
  const initialToken = initialParams.token;
  const targetPedidoRef = useRef<string | null>(initialParams.targetPedido);

  // Synchronous extraction of stored session
  const storedSession = useMemo(() => {
    return getStoredSolicitanteSession();
  }, []);

  const isRestoringRef = useRef<boolean>(Boolean(!initialParams.token && storedSession?.session_token));

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (initialParams.token) return 'INITIAL_EXCHANGE';
    if (initialParams.isMalformedOrEmpty) return 'EXCHANGE_ERROR';
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
    if (initialParams.isMalformedOrEmpty) {
      return 'El enlace de acceso recibido está incompleto o es inválido. Por favor solicite un nuevo enlace.';
    }
    return null;
  });

  // Pedidos List State
  const [pedidos, setPedidos] = useState<SolicitantePedidoListItem[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [pedidosError, setPedidosError] = useState<string | null>(null);

  // Filters & Search
  const [filterTab, setFilterTab] = useState<FilterTab>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Pedido Detail Modal / Drawer
  const [selectedPedido, setSelectedPedido] = useState<SolicitantePedidoDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Info Request Response Form State
  const [respondingSolicitudId, setRespondingSolicitudId] = useState<string | null>(null);
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

      const list = res.pedidos || [];
      setPedidos(list);
      if (res.correo) {
        setSessionEmail(res.correo);
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

      // Auto-deep-link si se solicitó un pedido específico por URL
      if (targetPedidoRef.current && list.length > 0) {
        const target = targetPedidoRef.current.trim().toLowerCase();
        const matched = list.find(
          (p) =>
            p.pedido_visible?.toLowerCase() === target ||
            p.id?.toLowerCase() === target
        );
        if (matched) {
          targetPedidoRef.current = null;
          handleSelectPedido(matched.pedido_visible, undefined, st);
        }
      }
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
        clearStoredSolicitanteSession();
        setSessionToken(null);
        setSessionEmail(null);
        setPedidos([]);
        setSelectedPedido(null);
        setExchangeError('Su sesión ha expirado o es inválida. Por favor solicite un nuevo enlace de acceso.');
        setViewMode('EXCHANGE_ERROR');
      } else {
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

    const currentReqId = ++requestIdRef.current;
    const existingSession = getStoredSolicitanteSession();

    // Sanitizar inmediatamente la URL
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    try {
      const res = await solicitanteSessionExchange(token);
      if (currentReqId !== requestIdRef.current) return;

      const resolvedEmail = res.correo || res.email || '';
      const sessionTok = res.session_token;

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

      const code = err?.code || '';

      // Si el enlace ya fue utilizado pero este navegador conserva una sesión persistente, intentar reutilizarla
      if (code === 'TOKEN_ALREADY_USED' && existingSession?.session_token) {
        try {
          setSessionToken(existingSession.session_token);
          if (existingSession.correo) setSessionEmail(existingSession.correo);
          await loadPedidos(existingSession.session_token, existingSession.correo, currentReqId);
          // Si loadPedidos tuvo éxito, el usuario ingresa de forma transparente
          return;
        } catch {
          // Si la sesión almacenada tampoco era válida, continuar al flujo de error
        }
      }

      clearStoredSolicitanteSession();
      setSessionToken(null);
      setSessionEmail(null);
      setPedidos([]);
      setSelectedPedido(null);

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

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (initialToken) {
      handlePerformExchange(initialToken);
    } else if (!initialParams.isMalformedOrEmpty) {
      const stored = getStoredSolicitanteSession();
      if (stored?.session_token) {
        handleRestoreSession(stored.session_token, stored.correo);
      }
    }
  }, [initialToken, initialParams.isMalformedOrEmpty]);

  useEffect(() => {
    const handleHashOrPopState = () => {
      const parsed = parseUrlParams();
      if (parsed.targetPedido) {
        targetPedidoRef.current = parsed.targetPedido;
      }
      if (parsed.token) {
        exchangedRef.current = false;
        isRestoringRef.current = false;
        handlePerformExchange(parsed.token);
      } else if (parsed.isMalformedOrEmpty && !sessionToken) {
        setExchangeError('El enlace de acceso recibido está incompleto o es inválido. Por favor solicite un nuevo enlace.');
        setViewMode('EXCHANGE_ERROR');
      } else if (sessionToken && targetPedidoRef.current && pedidos.length > 0) {
        const target = targetPedidoRef.current.trim().toLowerCase();
        const matched = pedidos.find(
          (p) =>
            p.pedido_visible?.toLowerCase() === target ||
            p.id?.toLowerCase() === target
        );
        if (matched) {
          targetPedidoRef.current = null;
          handleSelectPedido(matched.pedido_visible);
        }
      }
    };
    window.addEventListener('hashchange', handleHashOrPopState);
    window.addEventListener('popstate', handleHashOrPopState);
    return () => {
      window.removeEventListener('hashchange', handleHashOrPopState);
      window.removeEventListener('popstate', handleHashOrPopState);
    };
  }, [sessionToken, pedidos]);

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

  const handleSelectPedido = async (
    pedidoRef: string,
    autoOpenSolicitudId?: string,
    overrideSessionToken?: string
  ) => {
    const effectiveToken = overrideSessionToken || sessionToken;
    if (!effectiveToken) return;
    setLoadingDetail(true);
    setDetailError(null);
    setSelectedPedido(null);
    setRespondingSolicitudId(autoOpenSolicitudId || null);
    setResponseSuccess(null);
    setResponseError(null);
    try {
      const detail = await solicitanteGetPedidoDetail(effectiveToken, pedidoRef);
      setSelectedPedido(detail);
      if (autoOpenSolicitudId) {
        setRespondingSolicitudId(autoOpenSolicitudId);
      }
    } catch (err: any) {
      setDetailError(err.message || 'No se pudo obtener el detalle de la solicitud.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitInfoResponseWithForm = async (
    solicitudId: string,
    formData: { respuesta_texto: string; enlaces: string[]; archivo_ids: string[] }
  ) => {
    if (!sessionToken || !selectedPedido) return;

    setSubmittingResponse(true);
    setResponseError(null);
    setResponseSuccess(null);

    try {
      await solicitanteSubmitInfoResponse(
        sessionToken,
        solicitudId,
        formData.respuesta_texto,
        formData.enlaces,
        formData.archivo_ids
      );
      setResponseSuccess('¡Respuesta enviada con éxito! Su solicitud ha vuelto al estado operativo.');
      setRespondingSolicitudId(null);
      // Recargar detalle y lista
      await handleSelectPedido(selectedPedido.pedido_visible);
      await loadPedidos(sessionToken);
    } catch (err: any) {
      setResponseError(err.message || 'Error al enviar la respuesta a la solicitud de información.');
    } finally {
      setSubmittingResponse(false);
    }
  };

  const handleLogout = async () => {
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
    const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
      'Nuevo': { label: 'Nuevo', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
      'En revisión': { label: 'En Revisión', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
      'En proceso': { label: 'En Proceso', bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' },
      'Esperando información': { label: 'Esperando Información (48h)', bg: '#fefce8', color: '#a16207', border: '#fef08a' },
      'Finalizado': { label: 'Finalizado', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
      'Cancelado': { label: 'Cancelado', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
    };
    const c = map[estado] || { label: estado, bg: '#f3f4f6', color: '#374151', border: '#e2e8f0' };
    return (
      <span
        style={{
          backgroundColor: c.bg,
          color: c.color,
          border: `1px solid ${c.border}`,
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          fontWeight: 700,
          fontSize: '0.8125rem',
          display: 'inline-block',
        }}
      >
        {c.label}
      </span>
    );
  };

  // KPIs
  const totalCount = pedidos.length;
  const pendingInfoCount = pedidos.filter((p) => (p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0) > 0).length;
  const activeCount = pedidos.filter((p) => p.estado === 'En proceso' || p.estado === 'En revisión' || p.estado === 'Nuevo' || p.estado === 'Esperando información').length;
  const finalizedCount = pedidos.filter((p) => p.estado === 'Finalizado').length;

  // Filtered List
  const filteredPedidos = useMemo(() => {
    return pedidos.filter((p) => {
      // Tab filter
      if (filterTab === 'info_requerida') {
        const hasPending = (p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0) > 0;
        if (!hasPending) return false;
      } else if (filterTab === 'en_curso') {
        if (p.estado !== 'En proceso' && p.estado !== 'En revisión' && p.estado !== 'Nuevo' && p.estado !== 'Esperando información') return false;
      } else if (filterTab === 'finalizadas') {
        if (p.estado !== 'Finalizado') return false;
      }

      // Query search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = p.pedido_visible?.toLowerCase().includes(q);
        const matchCat = p.categoria_nombre?.toLowerCase().includes(q);
        const matchTipo = p.tipo_nombre?.toLowerCase().includes(q);
        if (!matchCode && !matchCat && !matchTipo) return false;
      }

      return true;
    });
  }, [pedidos, filterTab, searchQuery]);

  return (
    <div className="mis-solicitudes-container pedidos-mis-solicitudes-wide">
      {/* Page Header */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Mis Solicitudes
            </h1>
          </div>
        </div>

        {sessionToken && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#ffffff', padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Sesión activa</span>
              <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{sessionEmail || 'Solicitante'}</strong>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                padding: '0.4rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Cerrar sesión
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
        <div style={{ maxWidth: '520px', margin: '3rem auto' }}>
          <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'inline-block', width: '2.5rem', height: '2.5rem', border: '3px solid #cbd5e1', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ marginTop: '1rem', color: '#1e293b', fontSize: '1.125rem', fontWeight: 700 }}>
              {isRestoringRef.current ? 'Recuperando sesión...' : 'Abriendo solicitudes...'}
            </h3>
          </div>
        </div>
      )}

      {/* VIEW 2: EXCHANGE ERROR */}
      {viewMode === 'EXCHANGE_ERROR' && (
        <div style={{ maxWidth: '520px', margin: '3rem auto' }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3.5rem', height: '3.5rem', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '1.5rem', marginBottom: '1rem' }}>
                ⚠️
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                Aviso de Acceso
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                {exchangeError || 'El enlace venció. Solicitá uno nuevo.'}
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
                backgroundColor: 'var(--pedidos-brand-primary, #0b2746)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(11, 39, 70, 0.2)',
              }}
            >
              Solicitar nuevo enlace
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: REQUEST ACCESS EMAIL FORM */}
      {viewMode === 'REQUEST_FORM' && (
        <div style={{ maxWidth: '520px', margin: '3rem auto' }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3.5rem', height: '3.5rem', borderRadius: '50%', backgroundColor: '#f0f9ff', color: 'var(--pedidos-brand-primary, #0b2746)', fontSize: '1.5rem', marginBottom: '1rem' }}>
                ✉️
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--pedidos-brand-primary, #0b2746)', margin: '0 0 0.5rem 0' }}>
                Mis Solicitudes
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                Recibí un enlace de acceso en tu correo.
              </p>
            </div>

            {requestMessage && (
              <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#166534', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Enlace enviado</p>
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
                  Correo electrónico
                </label>
                <input
                  id="solicitante-email"
                  type="email"
                  required
                  placeholder="ejemplo@tierradelfuego.gob.ar"
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
                  backgroundColor: cooldown > 0 ? '#94a3b8' : 'var(--pedidos-brand-primary, #0b2746)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: requestLoading || cooldown > 0 ? 'not-allowed' : 'pointer',
                  opacity: requestLoading ? 0.7 : 1,
                  boxShadow: cooldown > 0 ? 'none' : '0 2px 4px rgba(11, 39, 70, 0.2)',
                }}
              >
                {requestLoading
                  ? 'Enviando enlace...'
                  : cooldown > 0
                  ? `Reintentar en ${cooldown}s`
                  : 'Enviar enlace'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 4: ACTIVE SESSION -> Wide List of Pedidos + Inspection Modal */}
      {viewMode === 'AUTHENTICATED' && sessionToken && (
        <div>
          {/* 4 Summary KPI Cards */}
          <div className="mis-solicitudes-kpis">
            <div className="mis-solicitudes-kpi-card">
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Total
              </span>
              <div style={{ fontSize: '1.875rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {totalCount}
              </div>
            </div>

            <div className={`mis-solicitudes-kpi-card ${pendingInfoCount > 0 ? 'highlight' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                  Esperan respuesta
                </span>
                {pendingInfoCount > 0 && <span>⚠️</span>}
              </div>
              <div style={{ fontSize: '1.875rem', fontWeight: 800, color: '#b45309', marginTop: '0.25rem' }}>
                {pendingInfoCount}
              </div>
            </div>

            <div className="mis-solicitudes-kpi-card">
              <span style={{ fontSize: '0.75rem', color: '#4338ca', fontWeight: 700, textTransform: 'uppercase' }}>
                Activas
              </span>
              <div style={{ fontSize: '1.875rem', fontWeight: 800, color: '#4338ca', marginTop: '0.25rem' }}>
                {activeCount}
              </div>
            </div>

            <div className="mis-solicitudes-kpi-card">
              <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 700, textTransform: 'uppercase' }}>
                Finalizadas
              </span>
              <div style={{ fontSize: '1.875rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                {finalizedCount}
              </div>
            </div>
          </div>

          {/* Control Bar: Filters & Search */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.625rem', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setFilterTab('todos')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterTab === 'todos' ? '1px solid #0284c7' : '1px solid #cbd5e1',
                  backgroundColor: filterTab === 'todos' ? '#0284c7' : '#ffffff',
                  color: filterTab === 'todos' ? '#ffffff' : '#475569',
                }}
              >
                Todos ({totalCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('info_requerida')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterTab === 'info_requerida' ? '1px solid #d97706' : '1px solid #cbd5e1',
                  backgroundColor: filterTab === 'info_requerida' ? '#d97706' : '#ffffff',
                  color: filterTab === 'info_requerida' ? '#ffffff' : '#b45309',
                }}
              >
                Esperan respuesta ({pendingInfoCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('en_curso')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterTab === 'en_curso' ? '1px solid #4338ca' : '1px solid #cbd5e1',
                  backgroundColor: filterTab === 'en_curso' ? '#4338ca' : '#ffffff',
                  color: filterTab === 'en_curso' ? '#ffffff' : '#4338ca',
                }}
              >
                Activas ({activeCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('finalizadas')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterTab === 'finalizadas' ? '1px solid #16a34a' : '1px solid #cbd5e1',
                  backgroundColor: filterTab === 'finalizadas' ? '#16a34a' : '#ffffff',
                  color: filterTab === 'finalizadas' ? '#ffffff' : '#15803d',
                }}
              >
                Finalizadas ({finalizedCount})
              </button>
            </div>

            {/* Search Input & Refresh Button */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Buscar por PED o servicio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  minWidth: '220px',
                }}
              />
              <button
                type="button"
                onClick={() => loadPedidos(sessionToken, sessionEmail || undefined)}
                disabled={loadingPedidos}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#334155',
                }}
              >
                {loadingPedidos ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          {/* Main List Container */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            {loadingPedidos && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                <p>Cargando sus solicitudes...</p>
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

            {!loadingPedidos && filteredPedidos.length === 0 && !pedidosError && (
              <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#64748b' }}>
                <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155', margin: '0 0 0.35rem 0' }}>
                  No se encontraron solicitudes
                </p>
                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                  {searchQuery ? 'Pruebe con otros términos de búsqueda.' : 'No hay solicitudes para el filtro seleccionado.'}
                </p>
              </div>
            )}

            {!loadingPedidos && filteredPedidos.length > 0 && (
              <>
                {/* 1. Desktop Table View */}
                <div className="mis-solicitudes-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.85rem 1.25rem' }}>CÓDIGO PED</th>
                        <th style={{ padding: '0.85rem 1.25rem' }}>Categoría / Servicio</th>
                        <th style={{ padding: '0.85rem 1.25rem' }}>Fecha de Ingreso</th>
                        <th style={{ padding: '0.85rem 1.25rem' }}>Estado</th>
                        <th style={{ padding: '0.85rem 1.25rem' }}>Atención</th>
                        <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPedidos.map((p) => {
                        const pendingCount = p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0;
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '1rem 1.25rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                              {p.pedido_visible}
                            </td>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.categoria_nombre}</div>
                              <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>{p.tipo_nombre}</div>
                            </td>
                            <td style={{ padding: '1rem 1.25rem', color: '#475569', whiteSpace: 'nowrap' }}>
                              {new Date(p.created_at).toLocaleDateString('es-AR')}
                            </td>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              {getEstadoBadge(p.estado)}
                            </td>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              {pendingCount > 0 ? (
                                <span style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.25rem 0.6rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  ⚠️ {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                                </span>
                              ) : p.tiene_entrega ? (
                                <span style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '0.25rem 0.6rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  ✓ Entrega lista
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Al día</span>
                              )}
                            </td>
                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                {pendingCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPedido(p.pedido_visible)}
                                    style={{
                                      backgroundColor: '#d97706',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '0.4rem 0.85rem',
                                      borderRadius: '0.375rem',
                                      fontWeight: 700,
                                      fontSize: '0.8125rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Responder
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleSelectPedido(p.pedido_visible)}
                                  style={{
                                    backgroundColor: '#f1f5f9',
                                    color: '#0f172a',
                                    border: '1px solid #cbd5e1',
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '0.375rem',
                                    fontWeight: 600,
                                    fontSize: '0.8125rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Ver detalle
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. Mobile Cards View (<= 768px) */}
                <div className="mis-solicitudes-cards-wrapper" style={{ padding: '0.75rem' }}>
                  {filteredPedidos.map((p) => {
                    const pendingCount = p.solicitudes_pendientes_count || p.solicitudes_pendientes || 0;
                    return (
                      <div
                        key={p.id}
                        className={`mis-solicitudes-card-item ${pendingCount > 0 ? 'has-pending' : ''}`}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                              {p.pedido_visible}
                            </span>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                              Ingreso: {new Date(p.created_at).toLocaleDateString('es-AR')}
                            </div>
                          </div>
                          <div>{getEstadoBadge(p.estado)}</div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{p.categoria_nombre}</div>
                          <div style={{ color: '#475569', fontSize: '0.8125rem' }}>{p.tipo_nombre}</div>
                        </div>

                        {pendingCount > 0 && (
                          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde047', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#92400e', fontSize: '0.8125rem', fontWeight: 600 }}>
                            ⚠️ Información solicitada · 48 h
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          {pendingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSelectPedido(p.pedido_visible)}
                              style={{
                                flex: 1,
                                backgroundColor: '#d97706',
                                color: '#ffffff',
                                border: 'none',
                                padding: '0.6rem',
                                borderRadius: '0.375rem',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                              }}
                            >
                              Responder
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectPedido(p.pedido_visible)}
                            style={{
                              flex: 1,
                              backgroundColor: '#f1f5f9',
                              color: '#0f172a',
                              border: '1px solid #cbd5e1',
                              padding: '0.6rem',
                              borderRadius: '0.375rem',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            Ver detalle
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Solicitante Pedido Detail & Response */}
      {(selectedPedido || loadingDetail || detailError) && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', width: 'min(960px, 92vw)', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Detalle de solicitud
                </span>
                <h2 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0 0 0' }}>
                  {selectedPedido ? selectedPedido.pedido_visible : 'Cargando...'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedPedido(null); setDetailError(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '1.75rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
                aria-label="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            {loadingDetail && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                <p>Cargando datos de la solicitud...</p>
              </div>
            )}

            {detailError && (
              <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                {detailError}
              </div>
            )}

            {selectedPedido && !loadingDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Status & Service Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Servicio Solicitado</span>
                    <p style={{ margin: '0.15rem 0 0 0', fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                      {selectedPedido.categoria_nombre} — {selectedPedido.tipo_nombre}
                    </p>
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

                {/* 48h Info Requests & InfoResponseForm */}
                {selectedPedido.solicitudes_informacion && selectedPedido.solicitudes_informacion.length > 0 && (
                  <div style={{ border: '1px solid #fef08a', backgroundColor: '#fefce8', borderRadius: '0.5rem', padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#854d0e', margin: '0 0 0.85rem 0' }}>
                      Información solicitada · 48 h
                    </h3>
                    {selectedPedido.solicitudes_informacion.map((s) => {
                      const isExpired = Date.now() >= new Date(s.expires_at).getTime();
                      const isPending = s.estado === 'pendiente' && !isExpired;

                      return (
                        <div key={s.id} style={{ backgroundColor: '#ffffff', padding: '1rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #fde047', marginBottom: '0.85rem' }}>
                          <p style={{ margin: '0 0 0.5rem 0', color: '#1e293b', fontWeight: 600, fontSize: '0.925rem' }}>
                            {s.mensaje}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span>Vence: {new Date(s.expires_at).toLocaleString('es-AR')} (48 h)</span>
                            <span style={{ fontWeight: 700, color: s.estado === 'respondida' ? '#15803d' : isExpired ? '#b91c1c' : '#b45309' }}>
                              {s.estado === 'respondida' ? '✓ Respondida' : isExpired ? '✕ Vencida' : '⏳ Pendiente de respuesta'}
                            </span>
                          </div>

                          {s.respuesta_texto && (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.375rem', fontSize: '0.85rem', color: '#166534' }}>
                              <strong>Su respuesta:</strong>
                              <p style={{ margin: '0.25rem 0 0 0', whiteSpace: 'pre-wrap' }}>{s.respuesta_texto}</p>
                            </div>
                          )}

                          {isPending && (
                            <div style={{ marginTop: '1rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.85rem' }}>
                              {respondingSolicitudId === s.id ? (
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
                                  <InfoResponseForm
                                    auth={{ session_token: sessionToken || undefined, solicitud_id: s.id }}
                                    onSubmit={(formData) => handleSubmitInfoResponseWithForm(s.id, formData)}
                                    onCancel={() => setRespondingSolicitudId(null)}
                                    isSubmitting={submittingResponse}
                                    submitError={responseError}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setRespondingSolicitudId(s.id); setResponseError(null); }}
                                  style={{
                                    backgroundColor: '#d97706',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.375rem',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Responder
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
                  <div style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', borderRadius: '0.5rem', padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#166534', margin: '0 0 0.5rem 0' }}>
                      Entrega final · v{selectedPedido.entrega.version}
                    </h3>
                    {selectedPedido.entrega.nota_publica && (
                      <p style={{ margin: '0 0 0.75rem 0', color: '#1e293b', fontSize: '0.875rem' }}>
                        {selectedPedido.entrega.nota_publica}
                      </p>
                    )}
                    {selectedPedido.entrega.url_entrega && (
                      <a
                        href={selectedPedido.entrega.url_entrega}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-block',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          padding: '0.55rem 1.15rem',
                          borderRadius: '0.375rem',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          textDecoration: 'none',
                        }}
                      >
                        Abrir entrega
                      </a>
                    )}
                  </div>
                )}

                {/* Public Timeline */}
                {selectedPedido.timeline_publico && selectedPedido.timeline_publico.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem 0' }}>
                      Historial
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPedido.timeline_publico.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f8fafc', borderLeft: '3px solid #0284c7', borderRadius: '0 0.375rem 0.375rem 0', fontSize: '0.8125rem' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.evento}</span>
                          <span style={{ color: '#64748b' }}>{new Date(item.fecha).toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Original Attachments Metadata */}
                {selectedPedido.archivos_adjuntos && selectedPedido.archivos_adjuntos.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem 0' }}>
                      Archivos ({(selectedPedido.archivos_adjuntos || []).length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {selectedPedido.archivos_adjuntos.map((arch) => (
                        <div key={arch.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem', fontSize: '0.8125rem' }}>
                          <span style={{ color: '#1e293b', fontWeight: 500 }}>{arch.nombre}</span>
                          <span style={{ color: '#64748b' }}>{formatFileSize(arch.size_bytes)}</span>
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
