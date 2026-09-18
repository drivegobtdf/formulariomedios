import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicTracking, requestTrackingRecovery, exchangeTrackingToken, TrackingPublicDTO } from '../services/trackingApi';
import { getPublicConfig } from '../services/config';

export const SeguimientoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pedidoVisible, setPedidoVisible] = useState(searchParams.get('ped') || searchParams.get('pedido_visible') || '');
  const [trackingToken, setTrackingToken] = useState(searchParams.get('token') || searchParams.get('tracking_token') || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackingPublicDTO | null>(null);

  // Recovery modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Exchange modal state
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeInputToken, setExchangeInputToken] = useState(searchParams.get('canje') || searchParams.get('exchange_token') || '');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeSuccess, setExchangeSuccess] = useState<string | null>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const fetchTracking = async (ped: string, tok: string) => {
    if (!ped.trim() || !tok.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await getPublicTracking(ped, tok);
      setData(res);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'No se pudo consultar el estado del pedido. Verifique el código y token.');
    } finally {
      setLoading(false);
    }
  };

  const handleExchange = async (tokenToExchange: string) => {
    if (!tokenToExchange.trim()) return;
    setExchangeLoading(true);
    setExchangeError(null);
    setExchangeSuccess(null);
    try {
      const res = await exchangeTrackingToken(tokenToExchange);
      setExchangeSuccess(`¡Acceso rotado con éxito! Código: ${res.pedido_visible}. Su nueva clave de seguimiento ha sido activada.`);
      setPedidoVisible(res.pedido_visible);
      setTrackingToken(res.tracking_token);
      setSearchParams({ ped: res.pedido_visible, token: res.tracking_token });
      await fetchTracking(res.pedido_visible, res.tracking_token);
    } catch (err: unknown) {
      setExchangeError((err as Error)?.message || 'Error al canjear credencial de recuperación.');
    } finally {
      setExchangeLoading(false);
    }
  };

  useEffect(() => {
    const canjeToken = searchParams.get('canje') || searchParams.get('exchange_token');
    if (canjeToken) {
      setExchangeInputToken(canjeToken);
      setShowExchangeModal(true);
      handleExchange(canjeToken);
      return;
    }

    const ped = searchParams.get('ped') || searchParams.get('pedido_visible');
    const tok = searchParams.get('token') || searchParams.get('tracking_token');
    if (ped && tok) {
      setPedidoVisible(ped);
      setTrackingToken(tok);
      fetchTracking(ped, tok);
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoVisible.trim()) {
      setError('Ingrese el código de pedido (ej. PED-2026-D000001).');
      return;
    }
    if (!trackingToken.trim()) {
      setError('Ingrese el token de seguimiento provisto al confirmar su pedido.');
      return;
    }
    setSearchParams({ ped: pedidoVisible.trim(), token: trackingToken.trim() });
    fetchTracking(pedidoVisible, trackingToken);
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) {
      setRecoveryError('Ingrese su correo electrónico.');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoverySuccess(null);
    try {
      const res = await requestTrackingRecovery(recoveryEmail);
      setRecoverySuccess(res.message || 'Si existen pedidos activos asociados a este correo, se enviaron los enlaces de seguimiento.');
    } catch (err: unknown) {
      setRecoveryError((err as Error)?.message || 'Error al procesar la solicitud.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      'Nuevo': { label: 'Nuevo', bg: '#e0f2fe', color: '#0369a1' },
      'En revisión': { label: 'En Revisión', bg: '#fef3c7', color: '#b45309' },
      'En proceso': { label: 'En Proceso', bg: '#e0e7ff', color: '#4338ca' },
      'Esperando información': { label: 'Esperando Información', bg: '#fefce8', color: '#a16207' },
      'Finalizado': { label: 'Finalizado', bg: '#dcfce7', color: '#15803d' },
      'Cancelado': { label: 'Cancelado', bg: '#fee2e2', color: '#b91c1c' },
    };
    const c = map[estado] || { label: estado, bg: '#f3f4f6', color: '#374151' };
    return (
      <span style={{ backgroundColor: c.bg, color: c.color, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem' }}>
        {c.label}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
          Seguimiento de pedido
        </h1>
      </div>

      {/* Consulta Form */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label htmlFor="input-ped" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Código de Pedido (PED)
              </label>
              <input
                id="input-ped"
                type="text"
                placeholder="ej. PED-2026-D000001"
                value={pedidoVisible}
                onChange={(e) => setPedidoVisible(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="input-token" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Token de Seguimiento
              </label>
              <input
                id="input-token"
                type="text"
                placeholder="Clave alfanumérica de seguimiento"
                value={trackingToken}
                onChange={(e) => setTrackingToken(e.target.value.trim())}
                style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                ¿Olvidó su token de seguimiento?
              </button>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <button
                type="button"
                onClick={() => setShowExchangeModal(true)}
                style={{ background: 'none', border: 'none', color: '#0891b2', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Canjear enlace de recuperación
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Consultando...' : 'Consultar'}
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '0.5rem', color: '#991b1b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <div style={{ display: 'inline-block', width: '2rem', height: '2rem', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1rem' }}>Obteniendo datos...</p>
        </div>
      )}

      {/* Result DTO Card */}
      {data && !loading && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          {/* Header */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#f8fafc' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Detalle de solicitud
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0 0 0' }}>
                {data.pedido_visible}
              </h2>
            </div>
            <div>
              {getEstadoBadge(data.estado)}
            </div>
          </div>

          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', backgroundColor: '#f1f5f9', padding: '1rem', borderRadius: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Categoría</span>
                <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: '#1e293b' }}>{data.categoria_nombre}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Tipo de Servicio</span>
                <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: '#1e293b' }}>{data.tipo_nombre}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Fecha de Ingreso</span>
                <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: '#1e293b' }}>{new Date(data.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Solicitudes de información faltante (48h) */}
            {data.solicitudes_informacion && data.solicitudes_informacion.length > 0 && (
              <div style={{ border: '1px solid #fef08a', backgroundColor: '#fefce8', borderRadius: '0.5rem', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#854d0e', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Información solicitada · 48 h
                </h3>
                {data.solicitudes_informacion.map((s) => {
                  const isExpired = Date.now() >= new Date(s.expires_at).getTime();
                  return (
                    <div key={s.id} style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #fde047', marginBottom: '0.75rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', color: '#334155', fontWeight: 500 }}>{s.mensaje}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                        <span>Vence: {new Date(s.expires_at).toLocaleString()} (48 h)</span>
                        <span style={{ fontWeight: 600, color: s.estado === 'respondida' ? '#15803d' : isExpired ? '#b91c1c' : '#b45309' }}>
                          {s.estado === 'respondida' ? '✓ Respondida' : isExpired ? '✕ Vencida' : '⏳ Pendiente'}
                        </span>
                      </div>
                      {s.estado === 'pendiente' && !isExpired && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <a
                            href={`${getPublicConfig().basePath}/solicitud-informacion?token=${trackingToken}&ped=${data.pedido_visible}`}
                            style={{
                              display: 'inline-block',
                              backgroundColor: '#ca8a04',
                              color: '#ffffff',
                              padding: '0.4rem 1rem',
                              borderRadius: '0.375rem',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              textDecoration: 'none',
                            }}
                          >
                            Responder
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Entregas y Descargas */}
            {data.entrega && (
              <div style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', borderRadius: '0.5rem', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#166534', margin: '0 0 0.75rem 0' }}>
                  Entrega final · v{data.entrega.version || 1}
                </h3>
                {data.entrega.nota_publica && (
                  <p style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>{data.entrega.nota_publica}</p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {data.entrega.url_entrega && (
                    <a
                      href={data.entrega.url_entrega}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        textDecoration: 'none',
                      }}
                    >
                      Abrir entrega
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Archivos Adjuntos Originales */}
            {data.archivos_adjuntos && data.archivos_adjuntos.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem 0' }}>
                  Archivos
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.archivos_adjuntos.map((arch) => (
                    <li key={arch.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>{arch.nombre}</span>
                      <span style={{ color: '#64748b' }}>{(arch.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', maxWidth: '450px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem 0' }}>
              Recuperar Acceso a Seguimiento
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
              Ingrese el correo electrónico que utilizó al enviar la solicitud. Le enviaremos un enlace seguro de canje para restaurar su acceso.
            </p>
            {recoverySuccess ? (
              <div>
                <div style={{ padding: '0.75rem', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {recoverySuccess}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowRecoveryModal(false); setRecoverySuccess(null); }}
                  style={{ width: '100%', padding: '0.625rem', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecoverySubmit}>
                {recoveryError && (
                  <div style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {recoveryError}
                  </div>
                )}
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="recovery-email" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Correo Electrónico
                  </label>
                  <input
                    id="recovery-email"
                    type="email"
                    required
                    placeholder="correo@ejemplo.gob.ar"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => { setShowRecoveryModal(false); setRecoveryError(null); }}
                    style={{ padding: '0.5rem 1rem', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '0.375rem', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: recoveryLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {recoveryLoading ? 'Enviando...' : 'Solicitar Enlace'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Exchange Modal */}
      {showExchangeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem 0' }}>
              Canjear Enlace de Recuperación
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
              Ingrese la credencial de canje temporal recibida para rotar y obtener su nuevo token seguro de seguimiento.
            </p>
            {exchangeSuccess ? (
              <div>
                <div style={{ padding: '0.75rem', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {exchangeSuccess}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowExchangeModal(false); setExchangeSuccess(null); }}
                  style={{ width: '100%', padding: '0.625rem', backgroundColor: '#0891b2', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Ver Pedido
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleExchange(exchangeInputToken); }}>
                {exchangeError && (
                  <div style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {exchangeError}
                  </div>
                )}
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="exchange-token-input" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Token de Canje Temporal
                  </label>
                  <input
                    id="exchange-token-input"
                    type="text"
                    required
                    placeholder="Clave de canje temporal"
                    value={exchangeInputToken}
                    onChange={(e) => setExchangeInputToken(e.target.value.trim())}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => { setShowExchangeModal(false); setExchangeError(null); }}
                    style={{ padding: '0.5rem 1rem', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '0.375rem', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={exchangeLoading}
                    style={{ padding: '0.5rem 1rem', backgroundColor: '#0891b2', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: exchangeLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {exchangeLoading ? 'Canjeando...' : 'Canjear y Activar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
