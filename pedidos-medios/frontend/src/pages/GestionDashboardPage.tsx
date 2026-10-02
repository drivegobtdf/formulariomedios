import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPedidos, fetchGestionStats, updatePedidoMetadata, PedidoListItem, GestionStats } from '../services/gestionApi';
import { getSupabaseClient } from '../services/supabaseClient';
import { EliminarPedidosModal } from '../components/gestion/EliminarPedidosModal';
import { EditarEtiquetaModal } from '../components/gestion/EditarEtiquetaModal';
import { formatReworkHistoricalText } from '../utils/statusBadges';

export type GestionTabFilter =
  | 'todos'
  | 'mis_pedidos'
  | 'sin_asignar'
  | 'requieren_atencion'
  | 'finalizados'
  | 'cancelados'
  | 'archivados';

export const GestionDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isApproved, isAdmin, isObserver, signOut } = useAuth();

  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [stats, setStats] = useState<GestionStats>({
    total: 0,
    nuevos: 0,
    enRevision: 0,
    enProceso: 0,
    esperandoInfo: 0,
    finalizados: 0,
    cancelados: 0,
    sinAsignar: 0,
    archivados: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk Selection & Delete Modal State
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  // Etiqueta Modal State
  const [selectedPedidoForEtiqueta, setSelectedPedidoForEtiqueta] = useState<PedidoListItem | null>(null);

  // Realtime Connection State
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastRealtimeUpdate, setLastRealtimeUpdate] = useState<Date | null>(null);

  // Filters & Views
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [tabFilter, setTabFilter] = useState<GestionTabFilter>('todos');
  const [prioridadFilter, setPrioridadFilter] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination for table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const canEditMetadata = isApproved && (isAdmin || user?.appRole === 'equipo');

  const loadData = useCallback(async () => {
    if (!isApproved) return;
    setLoading(true);
    setError(null);
    try {
      let estadoFilter: string | undefined;
      if (tabFilter === 'requieren_atencion') estadoFilter = 'Esperando información';
      else if (tabFilter === 'finalizados') estadoFilter = 'Finalizado';
      else if (tabFilter === 'cancelados') estadoFilter = 'Cancelado';

      const [pedidosData, statsData] = await Promise.all([
        fetchPedidos({
          archivado: tabFilter === 'archivados',
          responsable_user_id: tabFilter === 'mis_pedidos' ? user?.userId : undefined,
          unassigned: tabFilter === 'sin_asignar' ? true : undefined,
          estado: estadoFilter,
          prioridad: prioridadFilter !== 'todas' ? prioridadFilter : undefined,
          search: searchTerm || undefined,
        }),
        fetchGestionStats().catch(() => ({
          total: 0,
          nuevos: 0,
          enRevision: 0,
          enProceso: 0,
          esperandoInfo: 0,
          finalizados: 0,
          cancelados: 0,
          sinAsignar: 0,
          archivados: 0,
        })),
      ]);

      setPedidos(pedidosData);
      setStats(statsData);
      setCurrentPage(1);
    } catch (err: unknown) {
      setError('No se pudieron cargar las solicitudes del sistema. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [tabFilter, prioridadFilter, searchTerm, user?.userId, isApproved]);

  const handlePrioridadChange = async (ped: PedidoListItem, newPrioridad: string) => {
    if (!canEditMetadata || ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado') return;
    try {
      const val = (newPrioridad === '' || newPrioridad === 'sin_prioridad') ? null : (newPrioridad as 'alta' | 'media' | 'baja');
      const res = await updatePedidoMetadata(ped.id, ped.version, {
        prioridad: val,
        update_prioridad: true,
      });
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === ped.id
            ? { ...p, prioridad: res.prioridad, version: res.version }
            : p
        )
      );
    } catch (err: any) {
      alert(err.message || 'Error al actualizar la prioridad');
      loadData();
    }
  };

  const handleSaveEtiqueta = async (newEtiqueta: string | null) => {
    if (!selectedPedidoForEtiqueta) return;
    const ped = selectedPedidoForEtiqueta;
    const res = await updatePedidoMetadata(ped.id, ped.version, {
      etiqueta_interna: newEtiqueta,
      update_etiqueta: true,
    });
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === ped.id
          ? { ...p, etiqueta_interna: res.etiqueta_interna, version: res.version }
          : p
      )
    );
    setSelectedPedidoForEtiqueta(null);
  };

  useEffect(() => {
    if (isApproved) {
      loadData();
    }
  }, [loadData, isApproved]);

  // Realtime subscription on public.pedidos
  useEffect(() => {
    if (!isApproved) return;

    const supabase = getSupabaseClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadData();
        setLastRealtimeUpdate(new Date());
      }, 300);
    };

    const channel = supabase
      .channel('gestion-dashboard-realtime-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => {
          triggerRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeConnected(false);
        }
      });

    const handleFocus = () => {
      loadData();
    };
    const handleOnline = () => {
      loadData();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [isApproved, loadData]);

  // Canonical states for Kanban board (4 active in a single horizontal row)
  const estadosKanban = useMemo(() => ['Nuevo', 'En revisión', 'En proceso', 'Esperando información'], []);

  const isTerminalOrArchivedTab =
    tabFilter === 'finalizados' || tabFilter === 'cancelados' || tabFilter === 'archivados';

  // Paginated table data
  const totalPages = Math.ceil(pedidos.length / pageSize) || 1;
  const paginatedPedidos = useMemo(() => {
    return pedidos.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [pedidos, currentPage, pageSize]);

  // Elements actually rendered in the current view (strictly visible)
  const visibleSelectablePedidos = useMemo(() => {
    if (viewMode === 'table') {
      return paginatedPedidos;
    }
    if (isTerminalOrArchivedTab) {
      return pedidos;
    }
    return pedidos.filter((p) => estadosKanban.includes(p.estado));
  }, [viewMode, paginatedPedidos, isTerminalOrArchivedTab, pedidos, estadosKanban]);

  // Reconcile selection with currently visible elements
  useEffect(() => {
    setSelectedPedidoIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(visibleSelectablePedidos.map((p) => p.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [visibleSelectablePedidos]);

  const toggleSelectPedido = (id: string) => {
    setSelectedPedidoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const allVisibleIds = visibleSelectablePedidos.map((p) => p.id);
    setSelectedPedidoIds(new Set(allVisibleIds));
  };

  const clearSelection = () => {
    setSelectedPedidoIds(new Set());
  };

  const handleDeleteSuccess = (deletedCount: number) => {
    clearSelection();
    setDeleteSuccessMessage(`Se eliminaron permanentemente ${deletedCount} pedido${deletedCount > 1 ? 's' : ''} y sus recursos asociados.`);
    loadData();
    setTimeout(() => {
      setDeleteSuccessMessage(null);
    }, 6000);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const estadoTitles: Record<string, { label: string; color: string; bg: string; border: string }> = {
    'Nuevo': { label: 'Nuevo', color: 'var(--pedidos-status-nuevo-text, #0369a1)', bg: 'var(--pedidos-status-nuevo-bg, #f0f9ff)', border: 'var(--pedidos-status-nuevo-border, #bae6fd)' },
    'En revisión': { label: 'En Revisión', color: 'var(--pedidos-status-revision-text, #b45309)', bg: 'var(--pedidos-status-revision-bg, #fffbeb)', border: 'var(--pedidos-status-revision-border, #fde68a)' },
    'En proceso': { label: 'En Proceso', color: 'var(--pedidos-status-proceso-text, #4338ca)', bg: 'var(--pedidos-status-proceso-bg, #eef2ff)', border: 'var(--pedidos-status-proceso-border, #c7d2fe)' },
    'Esperando información': { label: 'Esperando Información', color: 'var(--pedidos-status-esperando-text, #a16207)', bg: 'var(--pedidos-status-esperando-bg, #fefce8)', border: 'var(--pedidos-status-esperando-border, #fef08a)' },
    'Finalizado': { label: 'Finalizado', color: 'var(--pedidos-status-finalizado-text, #15803d)', bg: 'var(--pedidos-status-finalizado-bg, #f0fdf4)', border: 'var(--pedidos-status-finalizado-border, #bbf7d0)' },
    'Cancelado': { label: 'Cancelado', color: 'var(--pedidos-status-cancelado-text, #b91c1c)', bg: 'var(--pedidos-status-cancelado-bg, #fef2f2)', border: 'var(--pedidos-status-cancelado-border, #fecaca)' },
  };

  // Auth Loading State
  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--pedidos-text-primary, #1e293b)' }}>Verificando credenciales...</h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>Conectando con el servidor de autenticación institucional.</p>
      </div>
    );
  }

  // Unauthenticated Gate
  if (!user) {
    return (
      <div style={{ maxWidth: '480px', margin: '3rem auto', padding: '0 1rem' }}>
        <div
          style={{
            backgroundColor: 'var(--pedidos-surface-raised, #ffffff)',
            borderRadius: '0.75rem',
            border: '1px solid var(--pedidos-border-default, #e2e8f0)',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(2, 132, 199, 0.15)',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '1.75rem',
            }}
          >
            🔒
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #0f172a)', margin: '0 0 0.5rem 0' }}>
            Acceso restringido
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--pedidos-text-muted, #64748b)', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
            Iniciá sesión con una cuenta institucional autorizada.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Iniciar sesión
          </button>
        </div>
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
            backgroundColor: 'var(--pedidos-surface-raised, #ffffff)',
            borderRadius: '0.75rem',
            border: '1px solid var(--pedidos-border-default, #e2e8f0)',
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
              backgroundColor: isPendiente ? 'rgba(217, 119, 6, 0.15)' : 'rgba(239, 68, 68, 0.15)',
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

          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #0f172a)', margin: '0 0 0.5rem 0' }}>
            {isPendiente
              ? 'Acceso pendiente'
              : isRechazado
              ? 'Acceso no aprobado'
              : 'Acceso revocado'}
          </h2>

          <p style={{ fontSize: '0.9rem', color: 'var(--pedidos-text-muted, #64748b)', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
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
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
              color: 'var(--pedidos-control-text, #334155)',
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

  return (
    <div style={{ width: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header & Role Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #0f172a)', margin: 0 }}>
              Gestión de pedidos
            </h1>
            <span
              className={`pedidos-role-badge ${
                isAdmin ? 'pedidos-role-admin' : isObserver ? 'pedidos-role-obs' : 'pedidos-role-equipo'
              }`}
            >
              {isObserver ? 'Observador' : isAdmin ? 'Administrador' : 'Equipo'}
            </span>
            <span
              title={lastRealtimeUpdate ? `Última sincronización: ${lastRealtimeUpdate.toLocaleTimeString()}` : 'Suscrito a cambios en tiempo real'}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.55rem',
                borderRadius: '9999px',
                backgroundColor: realtimeConnected ? 'var(--pedidos-status-finalizado-bg, #f0fdf4)' : 'var(--pedidos-surface-sunken, #f8fafc)',
                color: realtimeConnected ? 'var(--pedidos-status-finalizado-text, #166534)' : 'var(--pedidos-text-muted, #64748b)',
                border: `1px solid ${realtimeConnected ? 'var(--pedidos-status-finalizado-border, #bbf7d0)' : 'var(--pedidos-border-default, #cbd5e1)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: realtimeConnected ? '#22c55e' : '#94a3b8',
                  display: 'inline-block',
                }}
              />
              {realtimeConnected ? 'En vivo' : 'Desconectado'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              background: viewMode === 'board' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-control-bg, #ffffff)',
              color: viewMode === 'board' ? '#ffffff' : 'var(--pedidos-control-text, #334155)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              background: viewMode === 'table' ? 'var(--pedidos-brand-accent, #0284c7)' : 'var(--pedidos-control-bg, #ffffff)',
              color: viewMode === 'table' ? '#ffffff' : 'var(--pedidos-control-text, #334155)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Tabla
          </button>
        </div>
      </div>

      {/* Delete Success Alert */}
      {deleteSuccessMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--pedidos-status-finalizado-bg, #f0fdf4)',
            border: '1px solid var(--pedidos-status-finalizado-border, #86efac)',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--pedidos-status-finalizado-text, #166534)',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <span>✓</span>
          <span>{deleteSuccessMessage}</span>
        </div>
      )}

      {/* Bulk Selection Action Bar for Admins */}
      {isAdmin && (
        <div
          style={{
            backgroundColor: selectedPedidoIds.size > 0 ? 'var(--pedidos-surface-sunken, #eff6ff)' : 'var(--pedidos-surface-default, #f8fafc)',
            border: selectedPedidoIds.size > 0 ? '1px solid var(--pedidos-brand-accent, #bfdbfe)' : '1px solid var(--pedidos-border-default, #e2e8f0)',
            borderRadius: '0.5rem',
            padding: '0.6rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--pedidos-text-primary, #1e293b)' }}>
              Selección masiva:
            </span>
            <span
              style={{
                fontWeight: 700,
                color: selectedPedidoIds.size > 0 ? '#1d4ed8' : 'var(--pedidos-text-muted, #64748b)',
                backgroundColor: selectedPedidoIds.size > 0 ? 'rgba(59, 130, 246, 0.15)' : 'var(--pedidos-surface-sunken, #f1f5f9)',
                padding: '0.15rem 0.55rem',
                borderRadius: '9999px',
              }}
            >
              {selectedPedidoIds.size} seleccionados
            </span>
            {visibleSelectablePedidos.length > 0 && (
              <button
                type="button"
                onClick={selectAllVisible}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Seleccionar todos los visibles ({visibleSelectablePedidos.length})
              </button>
            )}
            {selectedPedidoIds.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Deseleccionar
              </button>
            )}
          </div>

          {selectedPedidoIds.size > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              style={{
                padding: '0.45rem 1rem',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
              }}
            >
              <span>🗑️</span>
              <span>Eliminar {selectedPedidoIds.size} seleccionado{selectedPedidoIds.size > 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* Metric Cards Banner (only if no error) */}
      {!error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Activos</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-text-primary, #0f172a)', margin: '0.1rem 0 0 0' }}>
              {stats.nuevos + stats.enRevision + stats.enProceso + stats.esperandoInfo}
            </p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-nuevo-text, #0369a1)', fontWeight: 600, textTransform: 'uppercase' }}>Nuevos</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-nuevo-text, #0369a1)', margin: '0.1rem 0 0 0' }}>{stats.nuevos}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-revision-text, #b45309)', fontWeight: 600, textTransform: 'uppercase' }}>En revisión</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-revision-text, #b45309)', margin: '0.1rem 0 0 0' }}>{stats.enRevision}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-proceso-text, #4338ca)', fontWeight: 600, textTransform: 'uppercase' }}>En proceso</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-proceso-text, #4338ca)', margin: '0.1rem 0 0 0' }}>{stats.enProceso}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-esperando-text, #a16207)', fontWeight: 600, textTransform: 'uppercase' }}>Esperando información</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-esperando-text, #a16207)', margin: '0.1rem 0 0 0' }}>{stats.esperandoInfo}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-cancelado-text, #b91c1c)', fontWeight: 600, textTransform: 'uppercase' }}>Sin asignar</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-cancelado-text, #b91c1c)', margin: '0.1rem 0 0 0' }}>{stats.sinAsignar}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-status-finalizado-text, #15803d)', fontWeight: 600, textTransform: 'uppercase' }}>Finalizados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-status-finalizado-text, #15803d)', margin: '0.1rem 0 0 0' }}>{stats.finalizados}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Cancelados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-text-muted, #64748b)', margin: '0.1rem 0 0 0' }}>{stats.cancelados}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--pedidos-text-secondary, #475569)', fontWeight: 600, textTransform: 'uppercase' }}>Archivados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pedidos-text-secondary, #475569)', margin: '0.1rem 0 0 0' }}>{stats.archivados}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: 'var(--pedidos-surface-default, #ffffff)', padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--pedidos-border-default, #e2e8f0)' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'mis_pedidos', label: 'Mis pedidos' },
            { id: 'sin_asignar', label: 'Sin asignar' },
            { id: 'requieren_atencion', label: 'Esperando información' },
            { id: 'finalizados', label: 'Finalizados' },
            { id: 'cancelados', label: 'Cancelados' },
            { id: 'archivados', label: 'Archivados' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabFilter(t.id as GestionTabFilter)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: tabFilter === t.id ? 'var(--pedidos-brand-accent, #0284c7)' : 'transparent',
                color: tabFilter === t.id ? '#ffffff' : 'var(--pedidos-text-muted, #64748b)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Selector de Prioridad */}
          <select
            value={prioridadFilter}
            onChange={(e) => setPrioridadFilter(e.target.value)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              fontSize: '0.825rem',
              backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
              color: 'var(--pedidos-text-primary, #334155)',
              cursor: 'pointer',
            }}
            aria-label="Filtrar por prioridad"
          >
            <option value="todas">Todas las prioridades</option>
            <option value="alta">🔴 Alta</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🟢 Baja</option>
            <option value="sin_prioridad">Sin prioridad</option>
          </select>

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Buscar por código PED..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                fontSize: '0.825rem',
                minWidth: '200px',
                backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                color: 'var(--pedidos-text-primary, #1e293b)',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.35rem 0.75rem',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
              }}
            >
              Buscar
            </button>
          </form>
        </div>
      </div>

      {/* Error state with retry */}
      {error && (
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#991b1b', fontSize: '0.95rem' }}>
              Error al consultar el tablero
            </h4>
            <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            style={{
              padding: '0.45rem 1rem',
              backgroundColor: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
          <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>🔄</div>
          Cargando pedidos...
        </div>
      ) : viewMode === 'board' ? (
        /* Board View */
        isTerminalOrArchivedTab ? (
          /* Dedicated Terminal / Archived Panel */
          <div style={{ backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--pedidos-text-primary, #0f172a)' }}>
                  {tabFilter === 'finalizados' && 'Finalizados'}
                  {tabFilter === 'cancelados' && 'Cancelados'}
                  {tabFilter === 'archivados' && 'Archivados'}
                </h3>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: tabFilter === 'finalizados' ? 'var(--pedidos-status-finalizado-bg, #f0fdf4)' : tabFilter === 'cancelados' ? 'var(--pedidos-status-cancelado-bg, #fef2f2)' : 'var(--pedidos-surface-sunken, #f1f5f9)',
                  color: tabFilter === 'finalizados' ? 'var(--pedidos-status-finalizado-text, #15803d)' : tabFilter === 'cancelados' ? 'var(--pedidos-status-cancelado-text, #b91c1c)' : 'var(--pedidos-text-secondary, #475569)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  border: `1px solid ${tabFilter === 'finalizados' ? 'var(--pedidos-status-finalizado-border, #bbf7d0)' : tabFilter === 'cancelados' ? 'var(--pedidos-status-cancelado-border, #fecaca)' : 'var(--pedidos-border-default, #cbd5e1)'}`,
                }}>
                  {pedidos.length} pedidos
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTabFilter('todos')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                  backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Volver
              </button>
            </div>

            {pedidos.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #94a3b8)', border: '1px dashed var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem' }}>
                No hay pedidos en este estado.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {pedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)', border: 'var(--pedidos-border-default, #cbd5e1)' };
                  const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                  return (
                    <Link
                      key={ped.id}
                      to={`/gestion/pedidos/${ped.id}`}
                      style={{
                        backgroundColor: ped.retrabajo_activo ? 'var(--pedidos-rework-bg, #fffbeb)' : 'var(--pedidos-surface-raised, #ffffff)',
                        border: ped.retrabajo_activo ? '1px solid var(--pedidos-rework-border, #fde68a)' : '1px solid var(--pedidos-border-default, #e2e8f0)',
                        borderLeft: ped.retrabajo_activo ? '4px solid var(--pedidos-rework-accent, #d97706)' : undefined,
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = ped.retrabajo_activo ? '#d97706' : '#0284c7';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = ped.retrabajo_activo ? 'var(--pedidos-rework-border, #fde68a)' : 'var(--pedidos-border-default, #e2e8f0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selectedPedidoIds.has(ped.id)}
                              onChange={() => toggleSelectPedido(ped.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                            />
                          )}
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--pedidos-text-primary, #0f172a)' }}>{ped.pedido_visible}</span>
                        </div>
                        <span style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '9999px',
                          backgroundColor: styleInfo.bg,
                          color: styleInfo.color,
                          border: `1px solid ${styleInfo.border}`,
                        }}>
                          {styleInfo.label}
                        </span>
                      </div>
                      {ped.retrabajo_activo ? (
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: 'var(--pedidos-rework-text, #b45309)',
                            backgroundColor: 'var(--pedidos-rework-bg, #fef3c7)',
                            border: '1px solid var(--pedidos-rework-border, #fde68a)',
                            borderRadius: '0.25rem',
                            padding: '0.2rem 0.45rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            width: 'fit-content',
                          }}
                        >
                          🔄 DEVUELTO - RETRABAJAR {ped.revision_count ? `· Rev #${ped.revision_count}` : ''}
                        </div>
                      ) : !ped.retrabajo_activo && ped.estado === 'Finalizado' && (ped.revision_count || 0) > 0 ? (
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--pedidos-text-secondary, #475569)',
                            backgroundColor: 'var(--pedidos-surface-sunken, #f1f5f9)',
                            border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                            borderRadius: '0.25rem',
                            padding: '0.2rem 0.45rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            width: 'fit-content',
                          }}
                        >
                          RETRABAJADO · {formatReworkHistoricalText(ped.revision_count || 0)}
                        </div>
                      ) : null}
                      <div style={{ fontSize: '0.825rem', color: 'var(--pedidos-text-secondary, #334155)', fontWeight: 500 }}>
                        {ped.categoria_nombre || 'General'} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                      </div>

                      {/* Metadatos: Prioridad y Etiqueta Interna */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                        {canEditMetadata && !isTerminal ? (
                          <select
                            value={ped.prioridad || ''}
                            onChange={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePrioridadChange(ped, e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`prioridad-badge-select prioridad-${ped.prioridad || 'sin-prioridad'}`}
                            aria-label="Cambiar prioridad"
                          >
                            <option value="">Sin prioridad</option>
                            <option value="alta">🔴 Alta</option>
                            <option value="media">🟡 Media</option>
                            <option value="baja">🟢 Baja</option>
                          </select>
                        ) : (
                          <span className={`prioridad-badge prioridad-${ped.prioridad || 'sin-prioridad'}`}>
                            {ped.prioridad === 'alta' && '🔴 Alta'}
                            {ped.prioridad === 'media' && '🟡 Media'}
                            {ped.prioridad === 'baja' && '🟢 Baja'}
                            {!ped.prioridad && 'Sin prioridad'}
                          </span>
                        )}

                        {ped.etiqueta_interna ? (
                          <span
                            className="etiqueta-interna-pill"
                            title={canEditMetadata && !isTerminal ? 'Clic para editar etiqueta' : undefined}
                            onClick={(e) => {
                              if (canEditMetadata && !isTerminal) {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedPedidoForEtiqueta(ped);
                              }
                            }}
                          >
                            🏷️ {ped.etiqueta_interna}
                          </span>
                        ) : canEditMetadata && !isTerminal ? (
                          <button
                            type="button"
                            className="btn-add-etiqueta"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedPedidoForEtiqueta(ped);
                            }}
                            title="Agregar etiqueta interna"
                          >
                            + Etiqueta
                          </button>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--pedidos-border-subtle, #f1f5f9)' }}>
                        <span style={{ color: ped.responsable_nombre ? 'var(--pedidos-text-secondary, #334155)' : '#b91c1c', fontWeight: 500 }}>
                          {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                        </span>
                        <span style={{ color: 'var(--pedidos-brand-accent, #0284c7)', fontWeight: 600 }}>Ver detalle &rarr;</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Active Kanban Board View - 4 Columns Single Horizontal Row with Internal Scroll */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))',
              gap: '1rem',
              alignItems: 'flex-start',
              overflowX: 'auto',
              paddingBottom: '1rem',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {estadosKanban.map((estado) => {
              const columnPedidos = pedidos.filter((p) => p.estado === estado);
              const styleInfo = estadoTitles[estado] || { label: estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)', border: 'var(--pedidos-border-default, #cbd5e1)' };

              return (
                <div
                  key={estado}
                  style={{
                    backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                    border: `1px solid ${styleInfo.border}`,
                    borderRadius: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 280px)',
                    minWidth: '280px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  {/* Column Header (Fixed) */}
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid var(--pedidos-border-default, #e2e8f0)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--pedidos-surface-raised, #ffffff)',
                      borderTopLeftRadius: '0.5rem',
                      borderTopRightRadius: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: styleInfo.color,
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--pedidos-text-primary, #1e293b)' }}>
                        {styleInfo.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: styleInfo.bg,
                        color: styleInfo.color,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        border: `1px solid ${styleInfo.border}`,
                      }}
                    >
                      {columnPedidos.length}
                    </span>
                  </div>

                  {/* Column Cards (Vertical Scroll) */}
                  <div
                    style={{
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      overflowY: 'auto',
                      flex: 1,
                      minHeight: '160px',
                    }}
                  >
                    {columnPedidos.map((ped) => {
                      const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                      return (
                        <Link
                          key={ped.id}
                          to={`/gestion/pedidos/${ped.id}`}
                          style={{
                            backgroundColor: ped.retrabajo_activo ? 'var(--pedidos-rework-bg, #fffbeb)' : 'var(--pedidos-surface-raised, #ffffff)',
                            border: ped.retrabajo_activo ? '1px solid var(--pedidos-rework-border, #fde68a)' : '1px solid var(--pedidos-border-default, #cbd5e1)',
                            borderLeft: ped.retrabajo_activo ? '4px solid var(--pedidos-rework-accent, #d97706)' : undefined,
                            borderRadius: '0.5rem',
                            padding: '0.85rem',
                            textDecoration: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.45rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = ped.retrabajo_activo ? '#d97706' : '#0284c7';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = ped.retrabajo_activo ? 'var(--pedidos-rework-border, #fde68a)' : 'var(--pedidos-border-default, #cbd5e1)';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                          }}
                        >
                          {/* Top Bar: PED & Date */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              {isAdmin && (
                                <input
                                  type="checkbox"
                                  checked={selectedPedidoIds.has(ped.id)}
                                  onChange={() => toggleSelectPedido(ped.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                />
                              )}
                              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--pedidos-text-primary, #0f172a)' }}>
                                {ped.pedido_visible}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.725rem', color: 'var(--pedidos-text-muted, #64748b)' }}>
                              {new Date(ped.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* DEVUELTO - RETRABAJAR Badge if applicable */}
                          {ped.retrabajo_activo && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                color: 'var(--pedidos-rework-text, #b45309)',
                                backgroundColor: 'var(--pedidos-rework-bg, #fef3c7)',
                                border: '1px solid var(--pedidos-rework-border, #fde68a)',
                                borderRadius: '0.25rem',
                                padding: '0.2rem 0.45rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                width: 'fit-content',
                              }}
                            >
                              🔄 DEVUELTO - RETRABAJAR {ped.revision_count ? `· Rev #${ped.revision_count}` : ''}
                            </div>
                          )}

                          {/* Service Category & Type */}
                          <div style={{ fontSize: '0.8rem', color: 'var(--pedidos-text-secondary, #334155)', fontWeight: 500 }}>
                            {ped.categoria_nombre || 'General'} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                          </div>

                          {/* Metadatos: Prioridad y Etiqueta Interna */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                            {canEditMetadata && !isTerminal ? (
                              <select
                                value={ped.prioridad || ''}
                                onChange={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handlePrioridadChange(ped, e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`prioridad-badge-select prioridad-${ped.prioridad || 'sin-prioridad'}`}
                                aria-label="Cambiar prioridad"
                              >
                                <option value="">Sin prioridad</option>
                                <option value="alta">🔴 Alta</option>
                                <option value="media">🟡 Media</option>
                                <option value="baja">🟢 Baja</option>
                              </select>
                            ) : (
                              <span className={`prioridad-badge prioridad-${ped.prioridad || 'sin-prioridad'}`}>
                                {ped.prioridad === 'alta' && '🔴 Alta'}
                                {ped.prioridad === 'media' && '🟡 Media'}
                                {ped.prioridad === 'baja' && '🟢 Baja'}
                                {!ped.prioridad && 'Sin prioridad'}
                              </span>
                            )}

                            {ped.etiqueta_interna ? (
                              <span
                                className="etiqueta-interna-pill"
                                title={canEditMetadata && !isTerminal ? 'Clic para editar etiqueta' : undefined}
                                onClick={(e) => {
                                  if (canEditMetadata && !isTerminal) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedPedidoForEtiqueta(ped);
                                  }
                                }}
                              >
                                🏷️ {ped.etiqueta_interna}
                              </span>
                            ) : canEditMetadata && !isTerminal ? (
                              <button
                                type="button"
                                className="btn-add-etiqueta"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedPedidoForEtiqueta(ped);
                                }}
                                title="Agregar etiqueta interna"
                              >
                                + Etiqueta
                              </button>
                            ) : null}
                          </div>

                          {/* 48h Info Request Badge if applicable */}
                          {ped.estado === 'Esperando información' && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: 'var(--pedidos-status-esperando-text, #a16207)',
                                backgroundColor: 'var(--pedidos-status-esperando-bg, #fefce8)',
                                border: '1px solid var(--pedidos-status-esperando-border, #fef08a)',
                                borderRadius: '0.25rem',
                                padding: '0.2rem 0.4rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                width: 'fit-content',
                              }}
                            >
                              ⏳ 48h Info Pendiente
                            </div>
                          )}

                          {/* Footer: Responsable & Action */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem', paddingTop: '0.4rem', borderTop: '1px solid var(--pedidos-border-subtle, #f1f5f9)' }}>
                            <span style={{ color: ped.responsable_nombre ? 'var(--pedidos-text-secondary, #334155)' : '#b91c1c', fontWeight: 500 }}>
                              {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                            </span>
                            <span style={{ color: 'var(--pedidos-brand-accent, #0284c7)', fontWeight: 600 }}>Ver detalle &rarr;</span>
                          </div>
                        </Link>
                      );
                    })}

                    {columnPedidos.length === 0 && (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #94a3b8)', fontSize: '0.8rem', border: '1px dashed var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.375rem', margin: 'auto 0' }}>
                        Sin pedidos en este estado
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Table View */
        <div style={{ backgroundColor: 'var(--pedidos-surface-raised, #ffffff)', border: '1px solid var(--pedidos-border-default, #e2e8f0)', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--pedidos-table-header-bg, #f8fafc)', borderBottom: '1px solid var(--pedidos-border-default, #e2e8f0)', color: 'var(--pedidos-text-secondary, #475569)', fontWeight: 600 }}>
                  {isAdmin && (
                    <th style={{ padding: '0.75rem 0.5rem 0.75rem 1rem', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={paginatedPedidos.length > 0 && paginatedPedidos.every(p => selectedPedidoIds.has(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newSet = new Set(selectedPedidoIds);
                            paginatedPedidos.forEach(p => newSet.add(p.id));
                            setSelectedPedidoIds(newSet);
                          } else {
                            const newSet = new Set(selectedPedidoIds);
                            paginatedPedidos.forEach(p => newSet.delete(p.id));
                            setSelectedPedidoIds(newSet);
                          }
                        }}
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        title="Seleccionar página visible"
                      />
                    </th>
                  )}
                  <th style={{ padding: '0.75rem 1rem' }}>Código PED</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Categoría / Tipo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Prioridad</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Etiqueta</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Responsable</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Fecha Ingreso</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)' };
                  const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                  return (
                    <tr key={ped.id} style={{ borderBottom: '1px solid var(--pedidos-table-row-border, #f1f5f9)', backgroundColor: ped.retrabajo_activo ? 'var(--pedidos-rework-bg, #fffbeb)' : undefined }}>
                      {isAdmin && (
                        <td style={{ padding: '0.75rem 0.5rem 0.75rem 1rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedPedidoIds.has(ped.id)}
                            onChange={() => toggleSelectPedido(ped.id)}
                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                          />
                        </td>
                      )}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--pedidos-text-primary, #0f172a)' }}>
                        {ped.pedido_visible}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--pedidos-text-secondary, #334155)' }}>
                        <div style={{ fontWeight: 500 }}>{ped.categoria_nombre || 'General'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted, #64748b)' }}>{ped.tipo_nombre || 'Pieza'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {canEditMetadata && !isTerminal ? (
                          <select
                            value={ped.prioridad || ''}
                            onChange={(e) => handlePrioridadChange(ped, e.target.value)}
                            className={`prioridad-badge-select prioridad-${ped.prioridad || 'sin-prioridad'}`}
                            aria-label="Cambiar prioridad"
                          >
                            <option value="">Sin prioridad</option>
                            <option value="alta">🔴 Alta</option>
                            <option value="media">🟡 Media</option>
                            <option value="baja">🟢 Baja</option>
                          </select>
                        ) : (
                          <span className={`prioridad-badge prioridad-${ped.prioridad || 'sin-prioridad'}`}>
                            {ped.prioridad === 'alta' && '🔴 Alta'}
                            {ped.prioridad === 'media' && '🟡 Media'}
                            {ped.prioridad === 'baja' && '🟢 Baja'}
                            {!ped.prioridad && 'Sin prioridad'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {ped.etiqueta_interna ? (
                          <span
                            className="etiqueta-interna-pill"
                            title={canEditMetadata && !isTerminal ? 'Clic para editar etiqueta' : undefined}
                            onClick={() => {
                              if (canEditMetadata && !isTerminal) {
                                setSelectedPedidoForEtiqueta(ped);
                              }
                            }}
                          >
                            🏷️ {ped.etiqueta_interna}
                          </span>
                        ) : canEditMetadata && !isTerminal ? (
                          <button
                            type="button"
                            className="btn-add-etiqueta"
                            onClick={() => setSelectedPedidoForEtiqueta(ped)}
                            title="Agregar etiqueta interna"
                          >
                            + Etiqueta
                          </button>
                        ) : (
                          <span style={{ color: 'var(--pedidos-text-muted, #94a3b8)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: styleInfo.bg, color: styleInfo.color }}>
                            {styleInfo.label}
                          </span>
                          {ped.retrabajo_activo ? (
                            <span style={{ fontSize: '0.675rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '0.25rem', backgroundColor: 'var(--pedidos-rework-bg, #fef3c7)', color: 'var(--pedidos-rework-text, #b45309)', border: '1px solid var(--pedidos-rework-border, #fde68a)' }}>
                              🔄 DEVUELTO {ped.revision_count ? `(#${ped.revision_count})` : ''}
                            </span>
                          ) : !ped.retrabajo_activo && ped.estado === 'Finalizado' && (ped.revision_count || 0) > 0 ? (
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '0.25rem', backgroundColor: 'var(--pedidos-surface-sunken, #f1f5f9)', color: 'var(--pedidos-text-secondary, #475569)', border: '1px solid var(--pedidos-border-default, #cbd5e1)' }}>
                              RETRABAJADO · {formatReworkHistoricalText(ped.revision_count || 0)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: ped.responsable_nombre ? 'var(--pedidos-text-secondary, #334155)' : '#b91c1c', fontWeight: 500 }}>
                        {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--pedidos-text-muted, #64748b)', fontSize: '0.8rem' }}>
                        {new Date(ped.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          to={`/gestion/pedidos/${ped.id}`}
                          style={{ color: 'var(--pedidos-brand-accent, #0284c7)', fontWeight: 600, textDecoration: 'none', fontSize: '0.85rem' }}
                        >
                          Ver detalle &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paginatedPedidos.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--pedidos-text-muted, #94a3b8)' }}>
                      No se encontraron pedidos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--pedidos-border-default, #e2e8f0)', backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--pedidos-text-muted, #64748b)' }}>
                Página {currentPage} de {totalPages} ({pedidos.length} pedidos)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--pedidos-border-default, #cbd5e1)', background: currentPage === 1 ? 'var(--pedidos-surface-sunken, #f1f5f9)' : 'var(--pedidos-control-bg, #ffffff)', color: 'var(--pedidos-control-text, #334155)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--pedidos-border-default, #cbd5e1)', background: currentPage === totalPages ? 'var(--pedidos-surface-sunken, #f1f5f9)' : 'var(--pedidos-control-bg, #ffffff)', color: 'var(--pedidos-control-text, #334155)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Delete Modal */}
      {showDeleteModal && (
        <EliminarPedidosModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          pedidoIds={Array.from(selectedPedidoIds)}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {/* Editar Etiqueta Modal */}
      {selectedPedidoForEtiqueta && (
        <EditarEtiquetaModal
          isOpen={Boolean(selectedPedidoForEtiqueta)}
          onClose={() => setSelectedPedidoForEtiqueta(null)}
          pedidoVisible={selectedPedidoForEtiqueta.pedido_visible}
          initialEtiqueta={selectedPedidoForEtiqueta.etiqueta_interna || null}
          onSave={handleSaveEtiqueta}
        />
      )}
    </div>
  );
};
