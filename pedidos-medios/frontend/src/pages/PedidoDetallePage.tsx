import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  fetchPedidoById,
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
  downloadArchivo,
  PedidoDetailItem,
  HistorialOperativoItem,
  InternalUser,
  fetchInternalUsers,
} from '../services/gestionApi';
import { InformacionEspecificaViewer } from '../components/gestion/InformacionEspecificaViewer';
import { formatFileSize, formatArchivoEstado, formatLocalDate } from '../utils/formatUtils';
import { WhatsAppPhoneLink } from '../components/WhatsAppPhoneLink';

function getHistorialEventInfo(evento: string, payload: any) {
  const norm = (evento || '').toLowerCase();

  if (norm.includes('cread') || norm === 'pedido_creado') {
    return {
      title: 'Pedido Creado',
      icon: '📝',
      color: '#0284c7',
      desc: payload?.origen ? `Creado desde formulario público (${payload.origen})` : 'Pedido registrado en el sistema',
    };
  }
  if (norm.includes('estado') || norm === 'estado_cambiado') {
    const prev = payload?.estado_anterior || payload?.estado_previo || payload?.from;
    const next = payload?.estado_nuevo || payload?.estado_siguiente || payload?.to || payload?.estado;
    const motivo = payload?.motivo ? ` · Motivo: "${payload.motivo}"` : '';
    return {
      title: 'Cambio de Estado',
      icon: '🔄',
      color: '#d97706',
      desc: prev && next ? `${prev} → ${next}${motivo}` : next ? `Estado actualizado a ${next}${motivo}` : `Estado actualizado${motivo}`,
    };
  }
  if (norm.includes('responsable') || norm.includes('asign') || norm === 'responsable_asignado') {
    const resp = payload?.responsable_nombre || payload?.nuevo_responsable_nombre || payload?.responsable_user_id || 'Responsable asignado';
    return {
      title: 'Asignación de Responsable',
      icon: '👤',
      color: '#2563eb',
      desc: `Asignado a: ${resp}`,
    };
  }
  if (norm.includes('solicitud_informacion_creada') || (norm.includes('solicitud') && norm.includes('cread'))) {
    return {
      title: 'Solicitud de Información Emitida (48h)',
      icon: '⚠️',
      color: '#d97706',
      desc: payload?.mensaje ? `Requerimiento: "${payload.mensaje}"` : 'Se solicitó información complementaria al solicitante',
    };
  }
  if (norm.includes('solicitud_informacion_respondida') || (norm.includes('solicitud') && norm.includes('respond'))) {
    return {
      title: 'Solicitud de Información Respondida',
      icon: '📬',
      color: '#16a34a',
      desc: payload?.respuesta_texto ? `Respuesta: "${payload.respuesta_texto}"` : 'El solicitante respondió al requerimiento de información',
    };
  }
  if (norm.includes('finaliz') || norm === 'pedido_finalizado') {
    return {
      title: 'Pedido Finalizado y Entregado',
      icon: '✓',
      color: '#15803d',
      desc: payload?.url_entrega ? `Entrega registrada: ${payload.url_entrega}` : 'Pedido marcado como finalizado',
    };
  }
  if (norm.includes('reabiert') || norm === 'pedido_reabierto' || norm === 'reapertura') {
    const motivo = payload?.motivo ? ` · Motivo: "${payload.motivo}"` : '';
    return {
      title: 'Pedido Reabierto',
      icon: '↩️',
      color: '#ea580c',
      desc: `El pedido fue reabierto para tareas adicionales${motivo}`,
    };
  }
  if (norm.includes('nota') || norm === 'nota_creada') {
    return {
      title: 'Nota Interna Registrada',
      icon: '💬',
      color: '#475569',
      desc: payload?.texto ? `"${payload.texto}"` : 'Nota agregada al expediente',
    };
  }
  if (norm.includes('archivo') || norm === 'archivo_subido') {
    return {
      title: 'Archivo Adjunto Registrado',
      icon: '📎',
      color: '#0284c7',
      desc: payload?.nombre_original ? `Archivo: ${payload.nombre_original}` : 'Archivo asociado al pedido',
    };
  }

  return {
    title: evento.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    icon: '📌',
    color: '#0284c7',
    desc: payload?.motivo || payload?.descripcion || payload?.mensaje || '',
  };
}

export const PedidoDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isApproved, isAdmin, isObserver, signOut } = useAuth();

  const [pedido, setPedido] = useState<PedidoDetailItem | null>(null);
  const [historial, setHistorial] = useState<HistorialOperativoItem[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // File downloading state
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Assignee selection
  const [selectedResponsable, setSelectedResponsable] = useState<string>('');

  // State Transition modal
  const [showStateModal, setShowStateModal] = useState(false);
  const [targetState, setTargetState] = useState<string>('');
  const [stateMotivo, setStateMotivo] = useState('');

  // Finalize modal (with delivery)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [entregaUrl, setEntregaUrl] = useState('');
  const [entregaNota, setEntregaNota] = useState('');

  // Cancel / Reopen modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenMotivo, setReopenMotivo] = useState('');

  // Notes state (Internal only)
  const [notaTexto, setNotaTexto] = useState('');

  // Info request state (48h)
  const [showInfoReqModal, setShowInfoReqModal] = useState(false);
  const [infoReqMensaje, setInfoReqMensaje] = useState('');

  const loadData = useCallback(async (isSilent = false) => {
    if (!id || !isApproved) return;
    if (!isSilent) setLoading(true);
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
      if (!isSilent) setError(err.message || 'Error cargando pedido.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [id, isApproved]);

  useEffect(() => {
    if (pedido?.responsable_user_id) {
      setSelectedResponsable(pedido.responsable_user_id);
    } else {
      setSelectedResponsable('');
    }
  }, [pedido?.responsable_user_id]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      const currentPath = location.pathname + location.search + location.hash;
      navigate(`/login?returnTo=${encodeURIComponent(currentPath)}`, { replace: true });
      return;
    }

    if (!isApproved) {
      setLoading(false);
      return;
    }

    loadData();

    const handleFocus = () => {
      loadData(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadData(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authLoading, user, isApproved, loadData, navigate, location.pathname, location.search, location.hash]);

  // Polling condicional (~8s) mientras existan solicitudes de información pendientes
  useEffect(() => {
    const hasPendingInfo = pedido?.solicitudes?.some((s) => s.estado === 'pendiente' && !s.is_expired);
    if (!hasPendingInfo) return;

    const interval = setInterval(() => {
      loadData(true);
    }, 8000);

    return () => clearInterval(interval);
  }, [id, pedido?.solicitudes]);

  const handleDownload = async (archivoId: string, nombreOriginal: string) => {
    setDownloadingFileId(archivoId);
    setDownloadError(null);
    try {
      await downloadArchivo(archivoId, nombreOriginal);
    } catch (err: any) {
      setDownloadError(`No se pudo descargar "${nombreOriginal}": ${err.message || 'Error de conexión'}`);
    } finally {
      setDownloadingFileId(null);
    }
  };

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
    setModalError(null);
    setError(null);
    try {
      await changePedidoState(pedido.id, targetState, pedido.version, stateMotivo || undefined);
      setShowStateModal(false);
      setStateMotivo('');
      setSuccessMessage(`Estado actualizado a ${targetState}.`);
      await loadData();
    } catch (err: any) {
      const msg = err.message || 'Error al cambiar estado.';
      setModalError(msg);
      if (msg.includes('VERSION_CONFLICT') || msg.includes('40001')) {
        setModalError('Conflicto de versión: El pedido fue modificado recientemente. Por favor cierre este cuadro para recargar los datos.');
        loadData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido) return;
    setActionLoading(true);
    setModalError(null);
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
      const msg = err.message || 'Error al finalizar el pedido.';
      setModalError(msg);
      if (msg.includes('VERSION_CONFLICT') || msg.includes('40001')) {
        setModalError('Conflicto de versión: El pedido fue modificado recientemente. Por favor cierre este cuadro para recargar los datos.');
        loadData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !cancelMotivo.trim()) return;
    setActionLoading(true);
    setModalError(null);
    setError(null);
    try {
      await cancelPedido(pedido.id, cancelMotivo.trim(), pedido.version);
      setShowCancelModal(false);
      setCancelMotivo('');
      setSuccessMessage('Pedido cancelado exitosamente.');
      await loadData();
    } catch (err: any) {
      const msg = err.message || 'Error al cancelar pedido.';
      setModalError(msg);
      if (msg.includes('VERSION_CONFLICT') || msg.includes('40001')) {
        setModalError('Conflicto de versión: El pedido fue modificado recientemente. Por favor cierre este cuadro para recargar los datos.');
        loadData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido || !reopenMotivo.trim()) return;
    setActionLoading(true);
    setModalError(null);
    setError(null);
    try {
      await reopenPedido(pedido.id, reopenMotivo.trim(), pedido.version);
      setShowReopenModal(false);
      setReopenMotivo('');
      setSuccessMessage('Pedido reabierto exitosamente.');
      await loadData();
    } catch (err: any) {
      const msg = err.message || 'Error al reabrir pedido.';
      setModalError(msg);
      if (msg.includes('VERSION_CONFLICT') || msg.includes('40001')) {
        setModalError('Conflicto de versión: El pedido fue modificado recientemente. Por favor cierre este cuadro para recargar los datos.');
        loadData();
      }
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
      // Explicitly send 'interna' visibility
      await createNotaPedido(pedido.id, notaTexto.trim(), 'interna');
      setNotaTexto('');
      setSuccessMessage('Nota interna guardada (visible solo para el personal autorizado).');
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
    setModalError(null);
    setError(null);
    try {
      await createInfoRequest(pedido.id, infoReqMensaje.trim(), pedido.version);
      setShowInfoReqModal(false);
      setInfoReqMensaje('');
      setSuccessMessage('Solicitud de información emitida con vigencia contractual de 48 horas corridas.');
      await loadData();
    } catch (err: any) {
      const msg = err.message || 'Error al crear solicitud de información.';
      setModalError(msg);
      if (msg.includes('VERSION_CONFLICT') || msg.includes('40001')) {
        setModalError('Conflicto de versión: El pedido fue modificado recientemente. Por favor cierre este cuadro para recargar los datos.');
        loadData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const config: Record<string, { bg: string; color: string; border: string }> = {
      'Nuevo': { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
      'En revisión': { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
      'En proceso': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' },
      'Esperando información': { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' },
      'Finalizado': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
      'Cancelado': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    };
    const c = config[estado] || { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };

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
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
      >
        {estado}
      </span>
    );
  };

  // Auth Loading Gate
  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
        <h3>Verificando sesión...</h3>
      </div>
    );
  }

  // Unauthenticated Gate
  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
        <p>Redirigiendo a inicio de sesión...</p>
      </div>
    );
  }

  // Not Approved States (Pendiente / Rechazado / Revocado)
  if (!isApproved) {
    const estado = user.estadoAcceso;
    const isPendiente = estado === 'pendiente';
    const isRechazado = estado === 'rechazado';
    const isRevocado = estado === 'revocado';

    return (
      <div style={{ maxWidth: '520px', margin: '3rem auto', padding: '0 1rem' }}>
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: isPendiente ? '#fef3c7' : '#fee2e2',
              color: isPendiente ? '#b45309' : '#b91c1c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '1.75rem',
            }}
          >
            {isPendiente ? '⏳' : isRechazado ? '❌' : '🚫'}
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            {isPendiente
              ? 'Acceso pendiente'
              : isRechazado
              ? 'Acceso no aprobado'
              : 'Acceso revocado'}
          </h2>

          <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
            {isPendiente && 'Tu cuenta está en espera de aprobación por un administrador.'}
            {isRechazado && 'Tu solicitud de acceso no fue aprobada.'}
            {isRevocado && 'Tu acceso al sistema fue revocado.'}
          </p>

          <button
            type="button"
            onClick={signOut}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
        <p>Cargando detalles del pedido...</p>
      </div>
    );
  }

  if (error && !pedido) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '1.5rem', borderRadius: '0.5rem', margin: '2rem auto', maxWidth: '600px' }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Error al cargar el pedido</h3>
        <p style={{ margin: '0 0 1rem 0' }}>{error}</p>
        <Link to="/gestion" style={{ color: '#dc2626', fontWeight: 600 }}>
          ← Volver al Tablero de Gestión
        </Link>
      </div>
    );
  }

  if (!pedido) return null;

  // Formato no redundante de Categoría y Tipo de Servicio
  const categoriaTitulo = pedido.categoria_nombre || '';
  const tipoTitulo = pedido.tipo_nombre || '';
  const servicioEncabezado =
    categoriaTitulo.toLowerCase() === tipoTitulo.toLowerCase() || !tipoTitulo
      ? categoriaTitulo
      : `${categoriaTitulo} · ${tipoTitulo}`;

  const fechaLimiteVal = (pedido.informacion_especifica as any)?.fecha_limite || (pedido as any).fecha_limite;

  return (
    <div className="pedidos-detalle-container">
      {/* Top Navigation & Role Indicators */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Link
          to="/gestion"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: '#0284c7',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 700,
          }}
        >
          ← Volver
        </Link>

        {isObserver && (
          <span
            style={{
              background: '#fef3c7',
              color: '#b45309',
              padding: '0.2rem 0.6rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Observador
          </span>
        )}
      </div>

      {/* Global Notifications */}
      {successMessage && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#991b1b',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {downloadError && (
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fda4af',
            color: '#be123c',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            style={{ background: 'transparent', border: 'none', color: '#be123c', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="pedidos-detalle-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {pedido.pedido_visible}
              </h1>
              {getEstadoBadge(pedido.estado)}
              {pedido.archivado && (
                <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: 700, fontSize: '0.75rem' }}>
                  ARCHIVADO
                </span>
              )}
              <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                (v{pedido.version})
              </span>
            </div>

            <p style={{ color: '#334155', margin: '0.35rem 0 0 0', fontSize: '1rem', fontWeight: 600 }}>
              {servicioEncabezado}
            </p>

            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', fontSize: '0.8125rem', color: '#64748b', flexWrap: 'wrap' }}>
              <span>
                <strong>Ingreso:</strong> {new Date(pedido.created_at).toLocaleDateString('es-AR')}
              </span>
              {fechaLimiteVal && (
                <span style={{ color: '#b45309', fontWeight: 600 }}>
                  <strong>Fecha Límite:</strong> {formatLocalDate(fechaLimiteVal)}
                </span>
              )}
              <span>
                <strong>Responsable:</strong> {pedido.responsable_nombre || 'Sin asignar'}
              </span>
            </div>
          </div>

          {/* Action Toolbar for Authorized Roles */}
          {!isObserver && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
              {/* Operational State Transitions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* 1. Transición a "En revisión" (Válido desde Nuevo o Esperando información) */}
                {pedido.estado === 'Nuevo' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!pedido.responsable_user_id) {
                        setError('Debe asignar un responsable antes de pasar el pedido a En revisión.');
                        return;
                      }
                      setTargetState('En revisión');
                      setModalError(null);
                      setShowStateModal(true);
                    }}
                    disabled={actionLoading || !pedido.responsable_user_id}
                    title={!pedido.responsable_user_id ? 'Debe asignar un responsable antes de pasar a En revisión' : 'Pasar a En revisión'}
                    style={{
                      background: '#f8fafc',
                      color: !pedido.responsable_user_id ? '#94a3b8' : '#334155',
                      border: '1px solid #cbd5e1',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                      opacity: !pedido.responsable_user_id ? 0.6 : 1,
                    }}
                  >
                    En revisión
                  </button>
                )}

                {/* 2. Transición a "En proceso" (Válido desde En revisión o Esperando información) */}
                {pedido.estado === 'En revisión' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!pedido.responsable_user_id) {
                        setError('Debe asignar un responsable antes de pasar el pedido a En proceso.');
                        return;
                      }
                      setTargetState('En proceso');
                      setModalError(null);
                      setShowStateModal(true);
                    }}
                    disabled={actionLoading || !pedido.responsable_user_id}
                    title={!pedido.responsable_user_id ? 'Debe asignar un responsable antes de pasar a En proceso' : 'Pasar a En proceso'}
                    style={{
                      background: '#f8fafc',
                      color: !pedido.responsable_user_id ? '#94a3b8' : '#334155',
                      border: '1px solid #cbd5e1',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                      opacity: !pedido.responsable_user_id ? 0.6 : 1,
                    }}
                  >
                    En proceso
                  </button>
                )}

                {/* 2b. Retroceso de "En proceso" a "En revisión" */}
                {pedido.estado === 'En proceso' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!pedido.responsable_user_id) {
                        setError('Debe asignar un responsable antes de pasar el pedido a En revisión.');
                        return;
                      }
                      setTargetState('En revisión');
                      setModalError(null);
                      setShowStateModal(true);
                    }}
                    disabled={actionLoading || !pedido.responsable_user_id}
                    title={!pedido.responsable_user_id ? 'Debe asignar un responsable antes de volver a En revisión' : 'Volver a En revisión'}
                    style={{
                      background: '#f8fafc',
                      color: !pedido.responsable_user_id ? '#94a3b8' : '#334155',
                      border: '1px solid #cbd5e1',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                      opacity: !pedido.responsable_user_id ? 0.6 : 1,
                    }}
                  >
                    Volver a En revisión
                  </button>
                )}

                {/* 3. Acciones desde "Esperando información" */}
                {pedido.estado === 'Esperando información' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!pedido.responsable_user_id) {
                          setError('Debe asignar un responsable antes de pasar el pedido a En revisión.');
                          return;
                        }
                        setTargetState('En revisión');
                        setModalError(null);
                        setShowStateModal(true);
                      }}
                      disabled={actionLoading || !pedido.responsable_user_id}
                      title={!pedido.responsable_user_id ? 'Debe asignar un responsable antes de pasar a En revisión' : 'Pasar a En revisión'}
                      style={{
                        background: '#f8fafc',
                        color: !pedido.responsable_user_id ? '#94a3b8' : '#334155',
                        border: '1px solid #cbd5e1',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                        opacity: !pedido.responsable_user_id ? 0.6 : 1,
                      }}
                    >
                      En revisión
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!pedido.responsable_user_id) {
                          setError('Debe asignar un responsable antes de pasar el pedido a En proceso.');
                          return;
                        }
                        setTargetState('En proceso');
                        setModalError(null);
                        setShowStateModal(true);
                      }}
                      disabled={actionLoading || !pedido.responsable_user_id}
                      title={!pedido.responsable_user_id ? 'Debe asignar un responsable antes de pasar a En proceso' : 'Pasar a En proceso'}
                      style={{
                        background: '#f8fafc',
                        color: !pedido.responsable_user_id ? '#94a3b8' : '#334155',
                        border: '1px solid #cbd5e1',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                        opacity: !pedido.responsable_user_id ? 0.6 : 1,
                      }}
                    >
                      En proceso
                    </button>
                  </>
                )}

                {/* 4. Solicitud de Información 48h */}
                {pedido.estado !== 'Finalizado' && pedido.estado !== 'Cancelado' && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setShowInfoReqModal(true);
                    }}
                    disabled={actionLoading}
                    style={{
                      background: '#fef3c7',
                      color: '#b45309',
                      border: '1px solid #fcd34d',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Pedir información · 48 h
                  </button>
                )}
              </div>

              {/* Resolution & Archiving Transitions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Finalizar solo permitido desde En proceso según matriz contractual */}
                {pedido.estado === 'En proceso' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!pedido.responsable_user_id) {
                        setError('Debe asignar un responsable antes de finalizar el pedido.');
                        return;
                      }
                      setModalError(null);
                      setShowFinalizeModal(true);
                    }}
                    disabled={actionLoading || !pedido.responsable_user_id}
                    title={!pedido.responsable_user_id ? 'Debe haber un responsable asignado para finalizar el pedido' : 'Finalizar pedido'}
                    style={{
                      background: '#dcfce7',
                      color: !pedido.responsable_user_id ? '#94a3b8' : '#15803d',
                      border: '1px solid #86efac',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading || !pedido.responsable_user_id ? 'not-allowed' : 'pointer',
                      opacity: !pedido.responsable_user_id ? 0.6 : 1,
                    }}
                  >
                    Finalizar pedido
                  </button>
                )}

                {/* Cancelar disponible en estados activos */}
                {pedido.estado !== 'Finalizado' && pedido.estado !== 'Cancelado' && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setShowCancelModal(true);
                    }}
                    disabled={actionLoading}
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                )}

                {/* Reabrir para administrador si está cancelado */}
                {pedido.estado === 'Cancelado' && isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setShowReopenModal(true);
                    }}
                    disabled={actionLoading}
                    style={{
                      background: '#e0e7ff',
                      color: '#4338ca',
                      border: '1px solid #c7d2fe',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Reabrir pedido
                  </button>
                )}

                {/* Archivar / Desarchivar para Administrador */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleArchiveToggle}
                    disabled={actionLoading}
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {pedido.archivado ? 'Desarchivar' : 'Archivar'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warning Banners for Unassigned Orders */}
      {pedido.estado === 'Nuevo' && !pedido.responsable_user_id && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#92400e',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <strong>Asignación pendiente:</strong> Este pedido requiere un responsable asignado para comenzar su gestión.
          </div>
        </div>
      )}

      {pedido.estado !== 'Nuevo' && pedido.estado !== 'Cancelado' && !pedido.responsable_user_id && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#991b1b',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <strong>Sin responsable asignado:</strong> Asigná un operador o administrador para continuar.
          </div>
        </div>
      )}

      {/* Main 3-Column Responsive Grid */}
      <div className="pedidos-detalle-grid">
        {/* ===================================================================
            COLUMNA IZQUIERDA: Solicitante y Asignación Operativa
           =================================================================== */}
        <div className="col-left">
          {/* Tarjeta Solicitante */}
          <div className="pedidos-detalle-card">
            <div className="pedidos-detalle-card-header">
              <h2 className="pedidos-detalle-card-title">
                Datos del solicitante
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Nombre y apellido
                </span>
                <p style={{ margin: '0.15rem 0 0 0', fontWeight: 600, color: '#0f172a' }}>
                  {pedido.envio?.nombre_apellido || (pedido as any).solicitante_nombre || 'No especificado'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Área o dependencia
                </span>
                <p style={{ margin: '0.15rem 0 0 0', color: '#334155' }}>
                  {pedido.envio?.area_solicitante || (pedido as any).solicitante_area || 'No especificada'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Correo electrónico
                </span>
                <p style={{ margin: '0.15rem 0 0 0', color: '#0369a1', wordBreak: 'break-all' }}>
                  {pedido.envio?.correo || (pedido as any).solicitante_correo || 'No especificado'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  WhatsApp / Teléfono
                </span>
                <div style={{ marginTop: '0.2rem' }}>
                  <WhatsAppPhoneLink phone={pedido.envio?.telefono || (pedido as any).solicitante_telefono} />
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta Asignación de Responsable */}
          {!isObserver && (() => {
            const eligibleUsers = users.filter(
              (u) => (u.app_role === 'administrador' || u.app_role === 'equipo') && u.estado_acceso === 'aprobado'
            );
            const isUnassigned = !pedido.responsable_user_id;

            return (
              <div
                className="pedidos-detalle-card"
                style={isUnassigned ? { border: '2px solid #f59e0b', backgroundColor: '#fffdf5' } : undefined}
              >
                <div className="pedidos-detalle-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="pedidos-detalle-card-title">
                    Responsable
                  </h2>
                  {isUnassigned && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', backgroundColor: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px', border: '1px solid #fde68a' }}>
                      Obligatorio
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label htmlFor="select-responsable" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Usuario
                    </label>
                    <select
                      id="select-responsable"
                      value={selectedResponsable}
                      onChange={(e) => setSelectedResponsable(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: isUnassigned ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- Sin asignar --</option>
                      {eligibleUsers.map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.nombre} {u.apellido} ({u.nombre_usuario}) - {u.app_role}
                        </option>
                      ))}
                      {pedido.responsable_user_id && !eligibleUsers.some((u) => u.user_id === pedido.responsable_user_id) && (
                        <option key={pedido.responsable_user_id} value={pedido.responsable_user_id}>
                          {pedido.responsable_nombre || 'Responsable Asignado'} (actual)
                        </option>
                      )}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={actionLoading || selectedResponsable === (pedido.responsable_user_id || '')}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: actionLoading || selectedResponsable === (pedido.responsable_user_id || '') ? 'not-allowed' : 'pointer',
                      opacity: selectedResponsable === (pedido.responsable_user_id || '') ? 0.6 : 1,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {actionLoading ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ===================================================================
            COLUMNA CENTRAL: Especificaciones del Servicio
           =================================================================== */}
        <div className="col-center">
          <div className="pedidos-detalle-card">
            <div className="pedidos-detalle-card-header">
              <div>
                <h2 className="pedidos-detalle-card-title">
                  Especificaciones del servicio
                </h2>
              </div>
            </div>

            <InformacionEspecificaViewer
              informacion={pedido.informacion_especifica}
              informacionEspecifica={pedido.informacion_especifica}
              codigoCategoria={pedido.codigo_categoria}
            />
          </div>
        </div>

        {/* ===================================================================
            COLUMNA DERECHA: Adjuntos, Enlaces y Entregas
           =================================================================== */}
        <div className="col-right">
          {/* Archivos Adjuntos */}
          <div className="pedidos-detalle-card">
            <div className="pedidos-detalle-card-header">
              <h2 className="pedidos-detalle-card-title">
                Archivos ({(pedido.archivos || []).length})
              </h2>
            </div>

            {(pedido.archivos || []).length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
                No hay archivos adjuntos.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(pedido.archivos || []).map((a: any) => (
                  <div key={a.id} className="pedidos-file-item">
                    <div className="pedidos-file-info">
                      <span className="pedidos-file-name" title={a.nombre_original}>
                        {a.nombre_original}
                      </span>
                      <div className="pedidos-file-meta">
                        <span>{formatFileSize(a.size_bytes)}</span>
                        <span>•</span>
                        <span style={{ color: a.estado === 'verified' ? '#15803d' : '#64748b', fontWeight: a.estado === 'verified' ? 600 : 400 }}>
                          {formatArchivoEstado(a.estado)}
                        </span>
                        {a.mime_type && (
                          <>
                            <span>•</span>
                            <span>{a.mime_type}</span>
                          </>
                        )}
                        {a.contexto === 'informacion_respuesta' && (
                          <span style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #fde68a',
                            marginLeft: '0.25rem',
                          }}>
                            Respuesta a Info
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownload(a.id, a.nombre_original)}
                      disabled={downloadingFileId === a.id}
                      className="pedidos-btn-download"
                      aria-label={`Descargar archivo ${a.nombre_original}`}
                    >
                      {downloadingFileId === a.id ? (
                        <span>Descargando...</span>
                      ) : (
                        <>
                          <span>📥</span>
                          <span>Descargar</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enlaces al Material */}
          <div className="pedidos-detalle-card">
            <div className="pedidos-detalle-card-header">
              <h2 className="pedidos-detalle-card-title">
                Enlaces ({(pedido.enlaces || []).length})
              </h2>
            </div>

            {(pedido.enlaces || []).length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
                No hay enlaces externos.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(pedido.enlaces || []).map((e: any) => (
                  <div key={e.id} style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0284c7', fontSize: '0.875rem', wordBreak: 'break-all', fontWeight: 600 }}
                    >
                      {e.url}
                    </a>
                    {e.descripcion && (
                      <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                        {e.descripcion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entregas Registradas */}
          <div className="pedidos-detalle-card">
            <div className="pedidos-detalle-card-header">
              <h2 className="pedidos-detalle-card-title">
                Entregas ({(pedido.entregas || []).length})
              </h2>
            </div>

            {(pedido.entregas || []).length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
                No hay entregas registradas.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(pedido.entregas || []).map((ent: any) => (
                  <div
                    key={ent.id}
                    style={{
                      background: ent.es_vigente ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${ent.es_vigente ? '#86efac' : '#e2e8f0'}`,
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: ent.es_vigente ? '#15803d' : '#64748b' }}>
                        Entrega v{ent.version} {ent.es_vigente && '(Vigente)'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(ent.created_at).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                    {ent.enlace_externo && (
                      <div style={{ marginBottom: '0.35rem' }}>
                        <a
                          href={ent.enlace_externo}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#0369a1', fontSize: '0.8125rem', wordBreak: 'break-all', fontWeight: 600 }}
                        >
                          🔗 {ent.enlace_externo}
                        </a>
                      </div>
                    )}
                    {ent.nota && (
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                        {ent.nota}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECCIÓN INFERIOR: Solicitudes de Info (48h), Notas y Bitácora, Historial
         ===================================================================== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* Solicitudes de Información al Solicitante */}
        <div className="pedidos-detalle-card">
          <div className="pedidos-detalle-card-header">
            <div>
              <h2 className="pedidos-detalle-card-title">
                Información solicitada · 48 h
              </h2>
            </div>
          </div>

          {(pedido.solicitudes || (pedido as any).solicitudes_informacion || []).length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
              No hay solicitudes de información.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(pedido.solicitudes || (pedido as any).solicitudes_informacion || []).map((si: any) => (
                <div
                  key={si.id}
                  style={{
                    background: si.estado === 'respondida' ? '#f0fdf4' : si.estado === 'expirada' ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${si.estado === 'respondida' ? '#86efac' : si.estado === 'expirada' ? '#fca5a5' : '#fde68a'}`,
                    borderRadius: '0.5rem',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: si.estado === 'respondida' ? '#15803d' : si.estado === 'expirada' ? '#b91c1c' : '#b45309', textTransform: 'uppercase' }}>
                      Estado: {si.estado}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Emitida: {new Date(si.created_at).toLocaleString('es-AR')} · Vence: {new Date(si.expires_at).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                    <strong>Requerimiento:</strong> {si.mensaje}
                  </p>
                  {(si.respuesta_texto || si.estado === 'respondida') && (
                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Respuesta del Solicitante:</span>
                      {si.respuesta_texto && (
                        <p style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '0.875rem', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                          {si.respuesta_texto}
                        </p>
                      )}
                      {si.archivos_respuesta && si.archivos_respuesta.length > 0 && (
                        <div style={{ marginTop: '0.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Archivos aportados en respuesta:</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                            {si.archivos_respuesta.map((a: any) => (
                              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.8125rem', color: '#0f172a', wordBreak: 'break-all' }}>
                                  📄 {a.nombre_original} <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({formatFileSize(a.size_bytes)})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDownload(a.id, a.nombre_original)}
                                  disabled={downloadingFileId === a.id}
                                  className="pedidos-btn-download"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                >
                                  {downloadingFileId === a.id ? 'Descargando...' : '📥 Descargar'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {si.enlaces_respuesta && si.enlaces_respuesta.length > 0 && (
                        <div style={{ marginTop: '0.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Enlaces aportados en respuesta:</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                            {si.enlaces_respuesta.map((e: any) => (
                              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.8125rem', color: '#0f172a', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  🔗 <a
                                    href={e.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                                  >
                                    {e.url}
                                  </a>
                                </span>
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                    marginLeft: '0.5rem',
                                    border: '1px solid #bae6fd',
                                  }}
                                >
                                  Abrir enlace ↗
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notas internas — Solo personal autorizado */}
        <div className="pedidos-detalle-card">
          <div className="pedidos-detalle-card-header">
            <div>
              <h2 className="pedidos-detalle-card-title">
                Notas internas
              </h2>
            </div>
          </div>

          {!isObserver && (
            <form onSubmit={handleCreateNota} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
              <label htmlFor="input-nota-texto" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Nueva nota interna
              </label>
              <textarea
                id="input-nota-texto"
                rows={3}
                placeholder="Escribí una nota interna..."
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '0.75rem', boxSizing: 'border-box' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  type="submit"
                  disabled={actionLoading || !notaTexto.trim()}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.45rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: actionLoading || !notaTexto.trim() ? 'not-allowed' : 'pointer',
                    opacity: !notaTexto.trim() ? 0.6 : 1,
                  }}
                >
                  {actionLoading ? 'Guardando...' : 'Guardar nota'}
                </button>
              </div>
            </form>
          )}

          {(pedido.notas || []).length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
              No hay notas registradas.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(pedido.notas || []).map((n: any) => (
                <div
                  key={n.id}
                  style={{
                    background: n.visibilidad === 'solicitante' ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${n.visibilidad === 'solicitante' ? '#bae6fd' : '#e2e8f0'}`,
                    padding: '0.85rem 1rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600 }}>
                      {n.autor_nombre || 'Usuario'} · {new Date(n.created_at).toLocaleString('es-AR')}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: n.visibilidad === 'solicitante' ? '#0369a1' : '#475569',
                        background: n.visibilidad === 'solicitante' ? '#e0f2fe' : '#e2e8f0',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '0.25rem',
                      }}
                    >
                      {n.visibilidad === 'solicitante' ? 'MENSAJE PÚBLICO' : 'NOTA INTERNA'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {n.texto}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial Operativo Unificado */}
        <div className="pedidos-detalle-card">
          <div className="pedidos-detalle-card-header">
            <div>
              <h2 className="pedidos-detalle-card-title">
                Historial
              </h2>
            </div>
          </div>

          {historial.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>
              No hay registros en el historial.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {historial.map((h, idx) => {
                const eventInfo = getHistorialEventInfo(h.evento, h.payload);
                return (
                  <div
                    key={idx}
                    style={{
                      borderLeft: `3px solid ${eventInfo.color}`,
                      background: '#f8fafc',
                      padding: '0.85rem 1rem',
                      borderRadius: '0 0.375rem 0.375rem 0',
                      borderTop: '1px solid #f1f5f9',
                      borderRight: '1px solid #f1f5f9',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.825rem', color: eventInfo.color, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>{eventInfo.icon}</span>
                        <span>{eventInfo.title}</span>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(h.created_at).toLocaleString('es-AR')}
                      </span>
                    </div>

                    {eventInfo.desc && (
                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
                        {eventInfo.desc}
                      </p>
                    )}

                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span><strong>Actor:</strong> {h.actor_nombre || 'Sistema'}</span>
                    </div>

                    {h.payload && Object.keys(h.payload).length > 0 && (
                      <details className="pedidos-historial-details" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569', userSelect: 'none' }}>
                          Ver detalles técnicos (JSON)
                        </summary>
                        <pre style={{ margin: '0.35rem 0 0 0', padding: '0.5rem', background: '#e2e8f0', borderRadius: '0.25rem', fontSize: '0.7rem', overflowX: 'auto', maxHeight: '150px' }}>
                          {JSON.stringify(h.payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          MODALS
         ===================================================================== */}
      {/* Modal Cambio de Estado */}
      {showStateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              {targetState === 'En revisión' && pedido?.estado === 'En proceso'
                ? '¿Volver a En revisión?'
                : `Cambiar estado a: ${targetState}`}
            </h3>
            
            {modalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleStateChange}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo (opcional)</label>
                <textarea
                  rows={2}
                  value={stateMotivo}
                  onChange={(e) => setStateMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowStateModal(false);
                    setModalError(null);
                  }}
                  disabled={actionLoading}
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  {actionLoading ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Finalizar */}
      {showFinalizeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#15803d' }}>Finalizar pedido</h3>

            {modalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleFinalize}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Enlace de entrega (Drive u otro)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={entregaUrl}
                  onChange={(e) => setEntregaUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Nota de entrega</label>
                <textarea
                  rows={3}
                  placeholder="Detalles o instrucciones de la entrega..."
                  value={entregaNota}
                  onChange={(e) => setEntregaNota(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowFinalizeModal(false);
                    setModalError(null);
                  }}
                  disabled={actionLoading}
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  {actionLoading ? 'Finalizando...' : 'Finalizar pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cancelar */}
      {showCancelModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#b91c1c' }}>Cancelar pedido</h3>

            {modalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCancel}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo (requerido)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Motivo de la cancelación..."
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setModalError(null);
                  }}
                  disabled={actionLoading}
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !cancelMotivo.trim()}
                  style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: actionLoading || !cancelMotivo.trim() ? 'not-allowed' : 'pointer' }}
                >
                  {actionLoading ? 'Cancelando...' : 'Cancelar pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reabrir */}
      {showReopenModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '440px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#4338ca' }}>Reabrir pedido</h3>

            {modalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleReopen}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Motivo (requerido)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Motivo de la reapertura..."
                  value={reopenMotivo}
                  onChange={(e) => setReopenMotivo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowReopenModal(false);
                    setModalError(null);
                  }}
                  disabled={actionLoading}
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !reopenMotivo.trim()}
                  style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: actionLoading || !reopenMotivo.trim() ? 'not-allowed' : 'pointer' }}
                >
                  {actionLoading ? 'Reabriendo...' : 'Reabrir pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Solicitud de Información (48h) */}
      {showInfoReqModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '0.75rem', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#b45309' }}>Pedir información · 48 h</h3>

            {modalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateInfoRequest}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Detalle de la solicitud</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Detallá los datos, archivos o aclaraciones necesarias..."
                  value={infoReqMensaje}
                  onChange={(e) => setInfoReqMensaje(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowInfoReqModal(false);
                    setModalError(null);
                  }}
                  disabled={actionLoading}
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !infoReqMensaje.trim()}
                  style={{ background: '#d97706', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: actionLoading || !infoReqMensaje.trim() ? 'not-allowed' : 'pointer' }}
                >
                  {actionLoading ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
