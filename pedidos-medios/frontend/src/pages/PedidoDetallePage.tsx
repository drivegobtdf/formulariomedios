import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  fetchPedidoById,
  fetchInternalUsers,
  fetchPedidoHistorialOperativo,
  assignPedido,
  changePedidoState,
  finalizePedido,
  cancelPedido,
  reopenPedido,
  archivePedido,
  restorePedido,
  createNotaPedido,
  createInfoRequest,
  PedidoDetailItem,
  InternalUser,
  HistorialOperativoItem,
} from '../services/gestionApi';

export const PedidoDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isObserver } = useAuth();

  const [pedido, setPedido] = useState<PedidoDetailItem | null>(null);
  const [historial, setHistorial] = useState<HistorialOperativoItem[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal / Form states
  const [selectedResponsable, setSelectedResponsable] = useState('');
  const [targetState, setTargetState] = useState('');
  const [stateMotivo, setStateMotivo] = useState('');
  const [showStateModal, setShowStateModal] = useState(false);

  // Finalize delivery state (F9 Pre-implementation)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [entregaUrl, setEntregaUrl] = useState('');
  const [entregaNota, setEntregaNota] = useState('');

  // Cancel / Reopen modal (F9 Pre-implementation)
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenMotivo, setReopenMotivo] = useState('');

  // Notes state
  const [notaTexto, setNotaTexto] = useState('');
  const [notaVisibilidad, setNotaVisibilidad] = useState<'interna' | 'solicitante'>('interna');

  // Info request state (48h)
  const [showInfoReqModal, setShowInfoReqModal] = useState(false);
  const [infoReqMensaje, setInfoReqMensaje] = useState('');

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, u] = await Promise.all([
        fetchPedidoById(id),
        fetchInternalUsers().catch(() => []),
      ]);
      setPedido(p);
      setUsers(u);
      setSelectedResponsable(p.responsable_user_id || '');

      const h = await fetchPedidoHistorialOperativo(p.id).catch(() => []);
      setHistorial(h);
    } catch (err: any) {
      setError(err.message || 'Error cargando pedido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleAssign = async () => {
    if (!pedido || !selectedResponsable) return;
    setActionLoading(true);
    setError(null);
    try {
      await assignPedido(pedido.id, selectedResponsable, pedido.version);
      setSuccessMessage('Responsable asignado correctamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al asignar responsable.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !targetState) return;
    setActionLoading(true);
    setError(null);
    try {
      await changePedidoState(pedido.id, targetState, pedido.version, stateMotivo || undefined);
      setShowStateModal(false);
      setStateMotivo('');
      setSuccessMessage(`Estado actualizado a ${targetState}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido) return;
    setActionLoading(true);
    setError(null);
    try {
      await finalizePedido(pedido.id, pedido.version, {
        enlace_externo: entregaUrl.trim() || undefined,
        nota: entregaNota.trim() || undefined,
      });
      setShowFinalizeModal(false);
      setEntregaUrl('');
      setEntregaNota('');
      setSuccessMessage('Pedido finalizado y entrega registrada exitosamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al finalizar el pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !cancelMotivo.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await cancelPedido(pedido.id, cancelMotivo.trim(), pedido.version);
      setShowCancelModal(false);
      setCancelMotivo('');
      setSuccessMessage('Pedido cancelado exitosamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al cancelar pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !reopenMotivo.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await reopenPedido(pedido.id, reopenMotivo.trim(), pedido.version);
      setShowReopenModal(false);
      setReopenMotivo('');
      setSuccessMessage('Pedido reabierto exitosamente.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al reabrir pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!pedido) return;
    setActionLoading(true);
    setError(null);
    try {
      if (pedido.archivado) {
        await restorePedido(pedido.id, pedido.version);
        setSuccessMessage('Pedido restaurado del archivo.');
      } else {
        await archivePedido(pedido.id, pedido.version);
        setSuccessMessage('Pedido archivado correctamente.');
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar estado de archivo.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !notaTexto.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await createNotaPedido(pedido.id, notaTexto.trim(), notaVisibilidad);
      setNotaTexto('');
      setSuccessMessage('Nota agregada.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al guardar nota.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateInfoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !infoReqMensaje.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await createInfoRequest(pedido.id, infoReqMensaje.trim(), pedido.version);
      setShowInfoReqModal(false);
      setInfoReqMensaje('');
      setSuccessMessage('Solicitud de información creada con vigencia estricta de 48 horas corridas.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al crear solicitud de información.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Cargando pedido...</div>;
  }

  if (error && !pedido) {
    return (
      <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '1.5rem', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '0.5rem' }}>
        <h2>Error al cargar el pedido</h2>
        <p>{error}</p>
        <Link to="/gestion" style={{ color: '#0284c7', textDecoration: 'underline' }}>← Volver a Gestión</Link>
      </div>
    );
  }

  if (!pedido) return null;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/gestion" style={{ color: '#0284c7', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
          ← Volver al Tablero
        </Link>
        {isObserver && (
          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
            Modo Observador (Solo Lectura)
          </span>
        )}
      </div>

      {/* Notifications */}
      {successMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '0.75rem 1rem', borderRadius: '0.375rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage(null)} style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Main Order Header */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {pedido.pedido_visible}
              </h1>
              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem' }}>
                {pedido.estado.toUpperCase()}
              </span>
              {pedido.archivado && (
                <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem' }}>
                  ARCHIVADO
                </span>
              )}
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                (Versión {pedido.version})
              </span>
            </div>
            <p style={{ color: '#64748b', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              {pedido.categoria_nombre} {pedido.tipo_nombre ? `· ${pedido.tipo_nombre}` : ''}
            </p>
          </div>

          {/* Action Toolbar for Operadores (Disabled for Observador) */}
          {!isObserver && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
              {/* F8 Workflow Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTargetState('En revisión');
                    setShowStateModal(true);
                  }}
                  disabled={actionLoading || pedido.estado === 'En revisión' || pedido.estado.toLowerCase() === 'finalizado' || pedido.estado.toLowerCase() === 'cancelado'}
                  style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Analizar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetState('En proceso');
                    setShowStateModal(true);
                  }}
                  disabled={actionLoading || pedido.estado === 'En proceso' || pedido.estado.toLowerCase() === 'finalizado' || pedido.estado.toLowerCase() === 'cancelado'}
                  style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Poner En Curso
                </button>

                <button
                  type="button"
                  onClick={() => setShowInfoReqModal(true)}
                  disabled={actionLoading || pedido.estado.toLowerCase() === 'finalizado' || pedido.estado.toLowerCase() === 'cancelado'}
                  style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  + Pedir Info (48h)
                </button>
              </div>

              {/* Operaciones de Cierre / F9 */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {pedido.estado.toLowerCase() !== 'finalizado' && pedido.estado.toLowerCase() !== 'cancelado' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowFinalizeModal(true)}
                      disabled={actionLoading}
                      style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✓ Finalizar Pedido
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      disabled={actionLoading}
                      style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✕ Cancelar
                    </button>
                  </>
                )}

                {pedido.estado.toLowerCase() === 'cancelado' && (
                  <button
                    type="button"
                    onClick={() => setShowReopenModal(true)}
                    disabled={actionLoading}
                    style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ↺ Reabrir Pedido
                  </button>
                )}

                {(pedido.estado.toLowerCase() === 'finalizado' || pedido.estado.toLowerCase() === 'cancelado') && (
                  <button
                    type="button"
                    onClick={handleArchiveToggle}
                    disabled={actionLoading}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {pedido.archivado ? 'Desarchivar' : 'Archivar'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Responsable & Assign Section */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
            Responsable Asignado:
          </div>
          {!isObserver ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={selectedResponsable}
                onChange={(e) => setSelectedResponsable(e.target.value)}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
              >
                <option value="">-- Sin Asignar --</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.nombre} {u.apellido} ({u.nombre_usuario}) - {u.app_role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAssign}
                disabled={actionLoading || selectedResponsable === (pedido.responsable_user_id || '')}
                style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Asignar
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 500 }}>
              {pedido.responsable_nombre || 'Sin Asignar'}
            </div>
          )}
        </div>
      </div>

      {/* 2-Column Details Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left Column: Form Details, Info Requests, Deliveries, Notes, Historial Operativo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Solicitante & Contact Information */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Datos del Solicitante
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>NOMBRE Y APELLIDO</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{pedido.envio?.nombre_apellido || 'N/D'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>ÁREA SOLICITANTE</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{pedido.envio?.area_solicitante || 'N/D'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>CORREO ELECTRÓNICO</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{pedido.envio?.correo || 'N/D'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>TELÉFONO</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{pedido.envio?.telefono || 'N/D'}</span>
              </div>
            </div>
          </div>

          {/* Información Específica */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Información Específica del Pedido
            </h2>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#334155' }}>
                {JSON.stringify(pedido.informacion_especifica, null, 2)}
              </pre>
            </div>
          </div>

          {/* Solicitudes de Información */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Solicitudes de Información Faltante (Vigencia 48h)
            </h2>
            {pedido.solicitudes.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No hay solicitudes de información registradas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pedido.solicitudes.map((s) => (
                  <div key={s.id} style={{ border: '1px solid #fef08a', background: s.estado === 'respondida' ? '#f0fdf4' : s.is_expired ? '#fef2f2' : '#fefce8', padding: '1rem', borderRadius: '0.375rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: '#854d0e' }}>
                        Por: {s.solicitada_por_nombre || 'Operador'} · {new Date(s.created_at).toLocaleString('es-AR')}
                      </span>
                      <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                        {s.estado} {s.is_expired && s.estado === 'pendiente' ? '(VENCIDA 48H)' : ''}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#1e293b', margin: '0 0 0.5rem 0' }}>{s.mensaje}</p>
                    {s.respuesta_texto && (
                      <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', fontSize: '0.875rem', color: '#166534' }}>
                        <strong>Respuesta:</strong> {s.respuesta_texto}
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                          Respondida el {new Date(s.responded_at || '').toLocaleString('es-AR')}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entregas */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Entregas y Materiales Finales
            </h2>
            {pedido.entregas.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No se han registrado entregas todavía.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pedido.entregas.map((e) => (
                  <div key={e.id} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '1rem', borderRadius: '0.375rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#166534', fontWeight: 600, marginBottom: '0.25rem' }}>
                      <span>Entrega v{e.version} {e.es_vigente ? '(Vigente)' : ''}</span>
                      <span>{new Date(e.created_at).toLocaleString('es-AR')} por {e.entregado_por_nombre || 'Operador'}</span>
                    </div>
                    {e.nota && <p style={{ fontSize: '0.875rem', color: '#334155', margin: '0 0 0.5rem 0' }}>{e.nota}</p>}
                    {e.enlace_externo && (
                      <a href={e.enlace_externo} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontSize: '0.875rem', textDecoration: 'underline', fontWeight: 500 }}>
                        {e.enlace_externo}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas y Bitácora */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Notas y Bitácora de Comunicación
            </h2>

            {!isObserver && (
              <form onSubmit={handleCreateNota} style={{ marginBottom: '1.5rem' }}>
                <textarea
                  rows={3}
                  placeholder="Agregar una nota interna o para el solicitante..."
                  value={notaTexto}
                  onChange={(e) => setNotaTexto(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="radio"
                        name="visibilidad"
                        value="interna"
                        checked={notaVisibilidad === 'interna'}
                        onChange={() => setNotaVisibilidad('interna')}
                      />
                      Interna (Solo equipo)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="radio"
                        name="visibilidad"
                        value="solicitante"
                        checked={notaVisibilidad === 'solicitante'}
                        onChange={() => setNotaVisibilidad('solicitante')}
                      />
                      Pública (Visible en Seguimiento)
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={actionLoading || !notaTexto.trim()}
                    style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.4rem 1rem', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Guardar Nota
                  </button>
                </div>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pedido.notas.map((n) => (
                <div key={n.id} style={{ background: n.visibilidad === 'solicitante' ? '#f0f9ff' : '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem 1rem', borderRadius: '0.375rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                    <span>{n.autor_nombre || 'Usuario'} · {new Date(n.created_at).toLocaleString('es-AR')}</span>
                    <span style={{ fontWeight: 600, color: n.visibilidad === 'solicitante' ? '#0284c7' : '#475569' }}>
                      {n.visibilidad === 'solicitante' ? 'PÚBLICA' : 'INTERNA'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b' }}>{n.texto}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Historial Operativo (Proyección Sanitizada) */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Historial Operativo Unificado
            </h2>
            {historial.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No hay registros de actividad operativa disponibles.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {historial.map((h, idx) => (
                  <div key={idx} style={{ borderLeft: '3px solid #0284c7', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0 0.375rem 0.375rem 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0369a1', textTransform: 'uppercase' }}>
                        {h.evento.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(h.created_at).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                      <strong>Actor:</strong> {h.actor_nombre || 'Sistema'}
                    </div>
                    {h.payload && Object.keys(h.payload).length > 0 && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#64748b' }}>
                        {Object.entries(h.payload).map(([k, v]) => (
                          <span key={k} style={{ marginRight: '0.75rem' }}>
                            <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Historial de Asignaciones, Archivos Iniciales, Enlaces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Archivos y Enlaces Adjuntos Iniciales */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.75rem 0' }}>
              Archivos del Pedido ({pedido.archivos.length})
            </h3>
            {pedido.archivos.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No hay archivos adjuntos.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pedido.archivos.map((a) => (
                  <div key={a.id} style={{ fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{a.nombre_original}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {(a.size_bytes / 1024 / 1024).toFixed(2)} MB · {a.estado}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '1.25rem 0 0.75rem 0' }}>
              Enlaces del Pedido ({pedido.enlaces.length})
            </h3>
            {pedido.enlaces.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No hay enlaces adjuntos.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pedido.enlaces.map((e) => (
                  <div key={e.id} style={{ fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                    <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', wordBreak: 'break-all' }}>
                      {e.url}
                    </a>
                    {e.descripcion && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{e.descripcion}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historial de Asignaciones */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.75rem 0' }}>
              Historial de Asignaciones
            </h3>
            {pedido.asignaciones.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Sin asignaciones previas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pedido.asignaciones.map((asig) => (
                  <div key={asig.id} style={{ fontSize: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                    <div style={{ color: '#1e293b', fontWeight: 500 }}>
                      Asignado el {new Date(asig.created_at).toLocaleString('es-AR')}
                    </div>
                    {asig.motivo && <div style={{ color: '#64748b' }}>Motivo: {asig.motivo}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Cambio de Estado */}
      {showStateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Cambiar Estado a: {targetState.toUpperCase()}</h3>
            <form onSubmit={handleStateChange}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo (Opcional)</label>
                <textarea
                  rows={2}
                  value={stateMotivo}
                  onChange={(e) => setStateMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowStateModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem' }}>Cancelar</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600 }}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Finalizar (F9) */}
      {showFinalizeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#15803d' }}>Finalizar Pedido y Registrar Entrega</h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Ingrese el enlace a los materiales producidos (Google Drive u otro) y la nota explicativa para el solicitante.
            </p>
            <form onSubmit={handleFinalize}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Enlace Externo de Entrega (Drive / Compartido)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={entregaUrl}
                  onChange={(e) => setEntregaUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Nota de Entrega para el Solicitante</label>
                <textarea
                  rows={3}
                  placeholder="Instrucciones o detalles de los materiales entregados..."
                  value={entregaNota}
                  onChange={(e) => setEntregaNota(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowFinalizeModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem' }}>Cancelar</button>
                <button type="submit" disabled={actionLoading} style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600 }}>Finalizar Pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cancelar (F9) */}
      {showCancelModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#b91c1c' }}>Cancelar Pedido</h3>
            <form onSubmit={handleCancel}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo de Cancelación (Requerido)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explique el motivo de la cancelación..."
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowCancelModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem' }}>Cerrar</button>
                <button type="submit" disabled={actionLoading || !cancelMotivo.trim()} style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600 }}>Confirmar Cancelación</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reabrir (F9) */}
      {showReopenModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#4338ca' }}>Reabrir Pedido</h3>
            <form onSubmit={handleReopen}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo de Reapertura (Requerido)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Justifique la reapertura del pedido..."
                  value={reopenMotivo}
                  onChange={(e) => setReopenMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowReopenModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem' }}>Cerrar</button>
                <button type="submit" disabled={actionLoading || !reopenMotivo.trim()} style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600 }}>Reabrir Pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Solicitud de Información (48h) */}
      {showInfoReqModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#b45309' }}>Solicitar Información Faltante</h3>
            <p style={{ fontSize: '0.875rem', color: '#78350f', margin: '0 0 1rem 0' }}>
              Se emitirá un enlace con token único para el solicitante con <strong>vigencia estricta de 48 horas corridas</strong>.
            </p>
            <form onSubmit={handleCreateInfoRequest}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Requerimiento / Mensaje</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Detalle los datos, archivos o aclaraciones que se necesitan para avanzar..."
                  value={infoReqMensaje}
                  onChange={(e) => setInfoReqMensaje(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowInfoReqModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem' }}>Cancelar</button>
                <button type="submit" disabled={actionLoading || !infoReqMensaje.trim()} style={{ background: '#d97706', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600 }}>Emitir Solicitud</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
