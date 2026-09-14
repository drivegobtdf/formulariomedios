import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export const MisSolicitudesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Authentication & Session State
  const [email, setEmail] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return sessionStorage.getItem('solicitante_session_token') || null;
  });
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => {
    return sessionStorage.getItem('solicitante_session_email') || null;
  });

  // Request Link State
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Exchange State
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

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

  // Automatic Magic Token Exchange on URL query param (?token=...) or URL hash (#token=...)
  useEffect(() => {
    let hashToken: string | null = null;
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
      hashToken = hashParams.get('token') || hashParams.get('access_token');
    }
    const magicToken = searchParams.get('token') || searchParams.get('access_token') || hashToken;
    if (magicToken && !sessionToken) {
      handleExchange(magicToken);
    }
  }, [searchParams]);

  // Load Pedidos when Session Token is present
  useEffect(() => {
    if (sessionToken) {
      loadPedidos(sessionToken);
    }
  }, [sessionToken]);

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: unknown) {
      setRequestError((err as Error)?.message || 'Error al procesar la solicitud.');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleExchange = async (token: string) => {
    setExchangeLoading(true);
    setExchangeError(null);
    try {
      const res = await solicitanteSessionExchange(token);
      setSessionToken(res.session_token);
      setSessionEmail(res.email);
      sessionStorage.setItem('solicitante_session_token', res.session_token);
      sessionStorage.setItem('solicitante_session_email', res.email);
      // Clean query params and hash from URL
      setSearchParams({});
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'El enlace de acceso es inválido o ha expirado.';
      setExchangeError(msg);
    } finally {
      setExchangeLoading(false);
    }
  };

  const loadPedidos = async (st: string) => {
    setLoadingPedidos(true);
    setPedidosError(null);
    try {
      const res = await solicitanteGetPedidos(st);
      setPedidos(res.pedidos || []);
      if (res.correo) {
        setSessionEmail(res.correo);
        sessionStorage.setItem('solicitante_session_email', res.correo);
      }
    } catch (err: any) {
      if (err.status === 401 || err.code === 'SESSION_INVALID') {
        handleLogout();
        setExchangeError('Su sesión ha expirado o es inválida. Por favor solicite un nuevo enlace de acceso.');
      } else {
        setPedidosError(err.message || 'Error al cargar el listado de pedidos.');
      }
    } finally {
      setLoadingPedidos(false);
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
    if (sessionToken) {
      try {
        await solicitanteSessionRevoke(sessionToken);
      } catch {
        // Ignore logout network error
      }
    }
    setSessionToken(null);
    setSessionEmail(null);
    sessionStorage.removeItem('solicitante_session_token');
    sessionStorage.removeItem('solicitante_session_email');
    setPedidos([]);
    setSelectedPedido(null);
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

        {sessionToken && sessionEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Sesión Verificada</span>
              <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{sessionEmail}</strong>
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

      {/* VIEW 1: NO ACTIVE SESSION -> Request Email Form / Exchange In Progress */}
      {!sessionToken && (
        <div style={{ maxWidth: '520px', margin: '2rem auto' }}>
          {exchangeLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
              <div style={{ display: 'inline-block', width: '2.5rem', height: '2.5rem', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <h3 style={{ marginTop: '1rem', color: '#1e293b', fontSize: '1.125rem' }}>Verificando enlace seguro...</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Iniciando sesión segura de solicitante.</p>
            </div>
          )}

          {!exchangeLoading && (
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

              {exchangeError && (
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '0.5rem', color: '#991b1b', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                  <strong>Aviso:</strong> {exchangeError}
                </div>
              )}

              {requestMessage && (
                <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#166534', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Enlace de acceso enviado</p>
                  <p style={{ margin: 0 }}>{requestMessage}</p>
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
                  disabled={requestLoading}
                  style={{
                    width: '100%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: requestLoading ? 'not-allowed' : 'pointer',
                    opacity: requestLoading ? 0.7 : 1,
                  }}
                >
                  {requestLoading ? 'Enviando enlace...' : 'Recibir Enlace Seguro de Acceso'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ACTIVE SESSION -> List of Pedidos + Inspection Drawer */}
      {sessionToken && (
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
                {pedidos.filter((p) => p.solicitudes_pendientes > 0).length}
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
                onClick={() => loadPedidos(sessionToken)}
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
              <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', margin: '1rem', borderRadius: '0.5rem' }}>
                {pedidosError}
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
                    {pedidos.map((p) => (
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
                          {p.solicitudes_pendientes > 0 ? (
                            <span style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}>
                              ⚠️ Responder Info ({p.solicitudes_pendientes})
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
                    ))}
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
