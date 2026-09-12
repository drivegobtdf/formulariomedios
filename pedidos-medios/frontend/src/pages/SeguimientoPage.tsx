import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicTracking, requestTrackingRecovery, TrackingPublicDTO } from '../services/trackingApi';

export const SeguimientoPage: React.FC = () => {
  const [searchParams] = useSearchParams();
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

  const fetchTracking = async (ped: string, tok: string) => {
    if (!ped.trim() || !tok.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await getPublicTracking(ped, tok);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'No se pudo consultar el estado del pedido. Verifique el código y token.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
    } catch (err: any) {
      setRecoveryError(err.message || 'Error al procesar la solicitud.');
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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
          Seguimiento de Pedido
        </h1>
        <p style={{ color: '#64748b' }}>
          Consulte el estado público de su solicitud ingresando su identificador PED y el token de acceso.
        </p>
      </div>

      {/* Formulario de búsqueda */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
              Código de Pedido
            </label>
            <input
              type="text"
              placeholder="PED-2026-D000001"
              value={pedidoVisible}
              onChange={(e) => setPedidoVisible(e.target.value)}
              style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
              Token de Seguimiento
            </label>
            <input
              type="text"
              placeholder="Token de acceso (al menos 32 caracteres)"
              value={trackingToken}
              onChange={(e) => setTrackingToken(e.target.value)}
              style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setShowRecoveryModal(true);
                setRecoverySuccess(null);
                setRecoveryError(null);
              }}
              style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline' }}
            >
              ¿Perdió su token o código?
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '0.625rem 1.5rem', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Consultando...' : 'Consultar Estado'}
            </button>
          </div>
        </form>
      </div>

      {/* Mensaje de error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
        </div>
      )}

      {/* Resultados de seguimiento */}
      {data && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                Pedido Oficial
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
                {data.pedido_visible}
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                {data.categoria_nombre} {data.tipo_nombre ? `· ${data.tipo_nombre}` : ''}
              </p>
            </div>
            <div>{getEstadoBadge(data.estado)}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>FECHA DE SOLICITUD</div>
              <div style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500, marginTop: '0.25rem' }}>
                {new Date(data.created_at).toLocaleString('es-AR')}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>ÚLTIMA ACTUALIZACIÓN</div>
              <div style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500, marginTop: '0.25rem' }}>
                {new Date(data.updated_at).toLocaleString('es-AR')}
              </div>
            </div>
          </div>

          {/* Solicitudes de información pendientes */}
          {data.solicitudes_informacion && data.solicitudes_informacion.length > 0 && (
            <div style={{ border: '1px solid #fef08a', background: '#fefce8', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#854d0e', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚠️</span> Información Faltante Requerida
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#713f12', marginBottom: '1rem' }}>
                El equipo ha solicitado información adicional para continuar con su pedido. 
                <strong> Vigencia: 48 horas corridas desde la emisión.</strong>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.solicitudes_informacion.map((sol) => (
                  <div key={sol.id} style={{ background: '#ffffff', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #fef08a' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#1e293b' }}>{sol.mensaje}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#854d0e' }}>
                      <span>Vence: {new Date(sol.expires_at).toLocaleString('es-AR')} ({sol.estado})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entrega y resultados */}
          {data.entrega && (
            <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#166534', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                🎉 Entrega Final del Pedido
              </h3>
              <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Versión #{data.entrega.version} · {new Date(data.entrega.created_at).toLocaleString('es-AR')}
                </div>
                {data.entrega.nota_publica && <p style={{ fontSize: '0.875rem', color: '#334155', margin: '0 0 0.5rem 0' }}>{data.entrega.nota_publica}</p>}
                {data.entrega.url_entrega && (
                  <a href={data.entrega.url_entrega} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontSize: '0.875rem', textDecoration: 'underline', fontWeight: 500 }}>
                    Acceder a la entrega (Enlace Externo)
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Comunicaciones */}
          {data.comunicaciones && data.comunicaciones.length > 0 && (
            <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0.5rem', padding: '1.25rem' }}>
              <h3 style={{ color: '#334155', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                Comunicaciones Notificadas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.comunicaciones.map((c) => (
                  <div key={c.id} style={{ background: '#ffffff', padding: '0.875rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#1e293b' }}>Notificación: {c.tipo}</p>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(c.created_at).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Recuperación Anti-enumeración */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
              Recuperación de Seguimiento
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Ingrese el correo electrónico utilizado al presentar su solicitud. Si existen pedidos asociados, recibirá un correo con los accesos directos.
            </p>

            <form onSubmit={handleRecoverySubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  placeholder="su-correo@ejemplo.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                />
              </div>

              {recoveryError && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {recoveryError}
                </div>
              )}

              {recoverySuccess && (
                <div style={{ background: '#f0fdf4', color: '#166534', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {recoverySuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 500, cursor: 'pointer' }}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: recoveryLoading ? 'not-allowed' : 'pointer' }}
                >
                  {recoveryLoading ? 'Enviando...' : 'Enviar Enlace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
