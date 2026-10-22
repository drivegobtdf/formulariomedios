import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPedidos, fetchGestionStats, updatePedidoMetadata, PedidoListItem, GestionStats } from '../services/gestionApi';
import { getSupabaseClient } from '../services/supabaseClient';
import { EliminarPedidosModal } from '../components/gestion/EliminarPedidosModal';
import { EditarEtiquetaModal } from '../components/gestion/EditarEtiquetaModal';
import { CargaInternaModal } from '../components/CargaInternaModal';
import { formatReworkHistoricalText } from '../utils/statusBadges';
import { getPedidoCardTitle } from '../utils/kanbanCardUtils';
import { KanbanEtiquetasBadge } from '../components/gestion/KanbanEtiquetasBadge';

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
  const [origenFilter, setOrigenFilter] = useState<'todos' | 'publico' | 'interno'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEtiquetasFilter, setSelectedEtiquetasFilter] = useState<string[]>([]);
  const [showEtiquetasDropdown, setShowEtiquetasDropdown] = useState(false);
  const [showCargaInternaModal, setShowCargaInternaModal] = useState(false);

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
          origen: origenFilter !== 'todos' ? origenFilter : undefined,
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
  }, [tabFilter, prioridadFilter, origenFilter, searchTerm, user?.userId, isApproved]);

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
      if (err?.code === '22000' && err?.message?.includes('VERSION_CONFLICT')) {
        alert('Conflicto de versión: el pedido fue modificado concurrentemente por otro usuario. Se recargarán los datos actualizados.');
      } else {
        alert(err.message || 'Error al actualizar la prioridad');
      }
      loadData();
    }
  };

  const handleSaveEtiqueta = async (newEtiqueta: string | null) => {
    if (!selectedPedidoForEtiqueta) return;
    const ped = selectedPedidoForEtiqueta;
    try {
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
    } catch (err: any) {
      if (err?.code === '22000' && err?.message?.includes('VERSION_CONFLICT')) {
        alert('Conflicto de versión: el pedido fue modificado concurrentemente por otro usuario. Se recargarán los datos actualizados.');
      } else {
        alert(err.message || 'Error al actualizar la etiqueta interna');
      }
      loadData();
      throw err;
    }
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

  // Available unique labels across current pedidos (Fase 4B)
  const availableEtiquetas = useMemo(() => {
    const map = new Map<string, string>();
    pedidos.forEach((p) => {
      if (p.etiquetas && p.etiquetas.length > 0) {
        p.etiquetas.forEach((e) => {
          const key = e.texto.toLowerCase().trim();
          if (!map.has(key)) map.set(key, e.texto.trim());
        });
      } else if (p.etiqueta_interna && p.etiqueta_interna.trim()) {
        const key = p.etiqueta_interna.toLowerCase().trim();
        if (!map.has(key)) map.set(key, p.etiqueta_interna.trim());
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [pedidos]);

  // Filtered pedidos according to multi-etiqueta filter with OR semantics (Fase 4B)
  const filteredPedidos = useMemo(() => {
    if (selectedEtiquetasFilter.length === 0) {
      return pedidos;
    }
    const lowerFilters = selectedEtiquetasFilter.map((s) => s.toLowerCase().trim());
    return pedidos.filter((p) => {
      const matchEtiquetas = (p.etiquetas || []).some((e) =>
        lowerFilters.includes(e.texto.toLowerCase().trim())
      );
      if (matchEtiquetas) return true;
      if (p.etiqueta_interna) {
        return lowerFilters.includes(p.etiqueta_interna.toLowerCase().trim());
      }
      return false;
    });
  }, [pedidos, selectedEtiquetasFilter]);

  // Paginated table data
  const totalPages = Math.ceil(filteredPedidos.length / pageSize) || 1;
  const paginatedPedidos = useMemo(() => {
    return filteredPedidos.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredPedidos, currentPage, pageSize]);

  // Elements actually rendered in the current view (strictly visible)
  const visibleSelectablePedidos = useMemo(() => {
    if (viewMode === 'table') {
      return paginatedPedidos;
    }
    if (isTerminalOrArchivedTab) {
      return filteredPedidos;
    }
    return filteredPedidos.filter((p) => estadosKanban.includes(p.estado));
  }, [viewMode, paginatedPedidos, isTerminalOrArchivedTab, filteredPedidos, estadosKanban]);

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
    <div style={{ width: '100%', margin: '0 auto', fontFamily: 'var(--font-inter-variable, system-ui, -apple-system, sans-serif)' }}>
      {/* Header & Role Info */}
      <div className="pedidos-gestion-header">
        <div className="pedidos-gestion-title-row">
          <h1 className="pedidos-gestion-title">
            Gestión de pedidos
          </h1>
          <span
            className={`pedidos-role-badge pedidos-gestion-role-badge ${
              isAdmin ? 'pedidos-role-admin' : isObserver ? 'pedidos-role-obs' : 'pedidos-role-equipo'
            }`}
          >
            {isObserver ? 'Observador' : isAdmin ? 'Administrador' : 'Equipo'}
          </span>
          <span
            title={lastRealtimeUpdate ? `Última sincronización: ${lastRealtimeUpdate.toLocaleTimeString()}` : 'Suscrito a cambios en tiempo real'}
            className={`pedidos-realtime-badge ${realtimeConnected ? 'is-connected' : 'is-disconnected'}`}
          >
            <span
              className={`pedidos-realtime-dot ${realtimeConnected ? 'is-connected' : 'is-disconnected'}`}
            />
            {realtimeConnected ? 'En vivo' : 'Desconectado'}
          </span>
        </div>

        <div className="pedidos-gestion-actions">
          {canEditMetadata && (
            <button
              type="button"
              onClick={() => setShowCargaInternaModal(true)}
              className="pedidos-btn-carga-interna"
            >
              <span>➕</span>
              <span>Carga interna</span>
            </button>
          )}

          <div className="pedidos-view-switcher">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`pedidos-view-switcher-btn ${viewMode === 'board' ? 'is-active' : ''}`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`pedidos-view-switcher-btn ${viewMode === 'table' ? 'is-active' : ''}`}
            >
              Tabla
            </button>
          </div>

          {!isObserver && (
            <Link
              to="/gestion/tableros"
              className="pedidos-btn-tableros"
            >
              <span>📋</span>
              <span>Tableros privados</span>
            </Link>
          )}
        </div>
      </div>

      {/* Delete Success Alert */}
      {deleteSuccessMessage && (
        <div className="pedidos-linear-alert-success">
          <span>✓</span>
          <span>{deleteSuccessMessage}</span>
        </div>
      )}

      {/* Bulk Selection Action Bar for Admins */}
      {isAdmin && (
        <div className={`pedidos-linear-bulk-bar ${selectedPedidoIds.size > 0 ? 'has-selection' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--pedidos-text-primary)' }}>
              Selección masiva:
            </span>
            <span className={`pedidos-linear-bulk-pill ${selectedPedidoIds.size > 0 ? 'is-active' : ''}`}>
              {selectedPedidoIds.size} seleccionados
            </span>
            {visibleSelectablePedidos.length > 0 && (
              <button
                type="button"
                onClick={selectAllVisible}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pedidos-brand-accent, #0284c7)',
                  fontSize: '0.825rem',
                  fontWeight: 500,
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
                  color: 'var(--pedidos-text-muted, #8a8f98)',
                  fontSize: '0.825rem',
                  fontWeight: 500,
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
              className="pedidos-linear-btn-danger"
            >
              <span>🗑️</span>
              <span>Eliminar {selectedPedidoIds.size} seleccionado{selectedPedidoIds.size > 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* Metric Cards Banner (only if no error) */}
      {!error && (
        <div className="pedidos-linear-stats-grid">
          {/* 1. Activos (Métrica Focal Primaria) */}
          <div className="pedidos-linear-stat-card pedidos-linear-stat-card-activos">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Activos</span>
              <span className="pedidos-linear-stat-dot dot-activos" />
            </div>
            <p className="pedidos-linear-stat-value">
              {stats.nuevos + stats.enRevision + stats.enProceso + stats.esperandoInfo}
            </p>
          </div>

          {/* 2. Nuevos */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Nuevos</span>
              <span className="pedidos-linear-stat-dot dot-nuevos" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.nuevos}</p>
          </div>

          {/* 3. En revisión */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">En revisión</span>
              <span className="pedidos-linear-stat-dot dot-revision" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.enRevision}</p>
          </div>

          {/* 4. En proceso */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">En proceso</span>
              <span className="pedidos-linear-stat-dot dot-proceso" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.enProceso}</p>
          </div>

          {/* 5. Esperando información */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Esperando información</span>
              <span className="pedidos-linear-stat-dot dot-esperando" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.esperandoInfo}</p>
          </div>

          {/* 6. Sin asignar */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Sin asignar</span>
              <span className="pedidos-linear-stat-dot dot-sin-asignar" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.sinAsignar}</p>
          </div>

          {/* 7. Finalizados */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Finalizados</span>
              <span className="pedidos-linear-stat-dot dot-finalizados" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.finalizados}</p>
          </div>

          {/* 8. Cancelados */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Cancelados</span>
              <span className="pedidos-linear-stat-dot dot-cancelados" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.cancelados}</p>
          </div>

          {/* 9. Archivados */}
          <div className="pedidos-linear-stat-card">
            <div className="pedidos-linear-stat-header">
              <span className="pedidos-linear-stat-label">Archivados</span>
              <span className="pedidos-linear-stat-dot dot-archivados" />
            </div>
            <p className="pedidos-linear-stat-value">{stats.archivados}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls (Linear Shelf) */}
      <div className="pedidos-linear-filter-shelf">
        {/* Fila 1: Pestañas de Filtrado Principal */}
        <div className="pedidos-linear-filter-shelf-top">
          <div className="pedidos-linear-tabs-track">
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
                className={`pedidos-linear-tab-btn ${tabFilter === t.id ? 'is-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fila 2: Selectores de Origen, Prioridad, Etiquetas y Búsqueda */}
        <div className="pedidos-linear-filter-shelf-bottom">
          <div className="pedidos-linear-filters-left">
            {/* Selector de Origen */}
            <select
              value={origenFilter}
              onChange={(e) => setOrigenFilter(e.target.value as 'todos' | 'publico' | 'interno')}
              className="pedidos-linear-select"
              aria-label="Filtrar por origen"
            >
              <option value="todos">Todos los orígenes</option>
              <option value="publico">🌐 Público</option>
              <option value="interno">🏢 Interno</option>
            </select>

            {/* Selector de Prioridad */}
            <select
              value={prioridadFilter}
              onChange={(e) => setPrioridadFilter(e.target.value)}
              className="pedidos-linear-select"
              aria-label="Filtrar por prioridad"
            >
              <option value="todas">Todas las prioridades</option>
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Media</option>
              <option value="baja">🟢 Baja</option>
              <option value="sin_prioridad">Sin prioridad</option>
            </select>

            {/* Selector Multi-Etiqueta (Fase 4B) */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowEtiquetasDropdown((prev) => !prev)}
                className={`pedidos-linear-tag-btn ${selectedEtiquetasFilter.length > 0 ? 'has-selected' : ''}`}
                aria-label="Filtrar por etiquetas"
                title="Filtrar por etiquetas (OR)"
              >
                <span>🏷️</span>
                <span>
                  {selectedEtiquetasFilter.length === 0
                    ? 'Etiquetas'
                    : `${selectedEtiquetasFilter.length} etiqueta${selectedEtiquetasFilter.length > 1 ? 's' : ''}`}
                </span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{showEtiquetasDropdown ? '▲' : '▼'}</span>
              </button>

              {showEtiquetasDropdown && (
                <div className="pedidos-linear-dropdown-menu">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                      paddingBottom: '0.35rem',
                      borderBottom: '1px solid var(--pedidos-border-subtle, rgba(255,255,255,0.06))',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--pedidos-text-primary)' }}>
                      Filtrar por etiqueta (OR)
                    </span>
                    {selectedEtiquetasFilter.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedEtiquetasFilter([])}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '0.7rem',
                          color: 'var(--color-coral-red, #eb5757)',
                          cursor: 'pointer',
                          padding: 0,
                          fontWeight: 600,
                        }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {availableEtiquetas.length === 0 ? (
                    <div style={{ fontSize: '0.775rem', color: 'var(--pedidos-text-muted)', fontStyle: 'italic', padding: '0.5rem' }}>
                      No hay etiquetas disponibles.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {availableEtiquetas.map((tag) => {
                        const isChecked = selectedEtiquetasFilter.includes(tag);
                        return (
                          <label
                            key={tag}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.25rem 0.35rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              backgroundColor: isChecked ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedEtiquetasFilter((prev) =>
                                  isChecked ? prev.filter((t) => t !== tag) : [...prev, tag]
                                );
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: isChecked ? 600 : 400, color: 'var(--pedidos-text-primary)' }}>
                              {tag}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Formulario de Búsqueda Compacto */}
          <form onSubmit={handleSearchSubmit} className="pedidos-linear-search-form">
            <input
              type="text"
              placeholder="Buscar por código o título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pedidos-linear-search-input"
            />
            <button
              type="submit"
              className="pedidos-linear-search-btn"
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
        /* Board View (Linear Kanban - Etapa 3) */
        isTerminalOrArchivedTab ? (
          /* Dedicated Terminal / Archived Panel */
          <div className="pedidos-terminal-panel">
            <div className="pedidos-terminal-header">
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
                className="pedidos-linear-btn-ghost"
              >
                ← Volver
              </button>
            </div>

            {filteredPedidos.length === 0 ? (
              <div className="pedidos-kanban-empty">
                No hay pedidos en este estado.
              </div>
            ) : (
              <div className="pedidos-terminal-grid">
                {filteredPedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)', border: 'var(--pedidos-border-default, #cbd5e1)' };
                  const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                  const isSelected = selectedPedidoIds.has(ped.id);
                  return (
                    <article
                      key={ped.id}
                      className={`kanban-card ${isSelected ? 'is-selected' : ''} ${ped.retrabajo_activo ? 'is-retrabajo' : ''} ${ped.origen === 'interno' ? 'is-interno' : ''}`}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('input, select, button, .etiqueta-interna-pill, a, label, .etiqueta-overflow-badge')) {
                          return;
                        }
                        navigate(`/gestion/pedidos/${ped.id}`);
                      }}
                    >
                      <div className="pedidos-kanban-card-top">
                        <div className="pedidos-kanban-card-id-row">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectPedido(ped.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="pedidos-kanban-card-checkbox"
                            />
                          )}
                          <span className="pedidos-kanban-card-id">{ped.pedido_visible}</span>
                          {ped.origen === 'interno' && (
                            <span className="pedidos-badge-interno">
                              INTERNO
                            </span>
                          )}
                        </div>
                        <span
                          className="pedidos-kanban-status-pill"
                          style={{
                            backgroundColor: styleInfo.bg,
                            color: styleInfo.color,
                            borderColor: styleInfo.border,
                          }}
                        >
                          {styleInfo.label}
                        </span>
                      </div>
                      {ped.retrabajo_activo ? (
                        <div className="pedidos-badge-retrabajo">
                          🔄 DEVUELTO - RETRABAJAR {ped.revision_count ? `· Rev #${ped.revision_count}` : ''}
                        </div>
                      ) : !ped.retrabajo_activo && ped.estado === 'Finalizado' && (ped.revision_count || 0) > 0 ? (
                        <div className="pedidos-badge-retrabajado-hist">
                          RETRABAJADO · {formatReworkHistoricalText(ped.revision_count || 0)}
                        </div>
                      ) : null}
                      <div
                        className={`kanban-card-title ${ped.titulo ? 'has-explicit-title' : ''}`}
                        title={getPedidoCardTitle(ped)}
                      >
                        {getPedidoCardTitle(ped)}
                      </div>
                      <div className="pedidos-kanban-service">
                        {ped.categoria_nombre || (ped.origen === 'interno' ? 'Sin categoría' : 'General')} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                      </div>

                      {/* Solicitante y Área */}
                      <div className="pedidos-kanban-parties">
                        <div
                          className="pedidos-kanban-requester"
                          title={`Solicitante: ${ped.solicitante_nombre || (ped.origen === 'interno' ? 'No informado' : 'Sin solicitante')}`}
                        >
                          <span style={{ color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 500, marginRight: '0.25rem' }}>👤</span>
                          {ped.solicitante_nombre || (ped.origen === 'interno' ? 'No informado' : 'Sin solicitante')}
                        </div>
                        <div
                          className="pedidos-kanban-area"
                          title={`Área: ${ped.area_solicitante || (ped.origen === 'interno' ? 'No informada' : 'Sin área')}`}
                        >
                          <span style={{ color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 500, marginRight: '0.25rem' }}>🏛️</span>
                          {ped.area_solicitante || (ped.origen === 'interno' ? 'No informada' : 'Sin área')}
                        </div>
                      </div>

                      {/* Metadatos: Prioridad y Múltiples Etiquetas */}
                      <div className="pedidos-kanban-meta-row">
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

                        <KanbanEtiquetasBadge
                          etiquetas={ped.etiquetas}
                          legacyEtiqueta={ped.etiqueta_interna}
                          canEdit={canEditMetadata && !isTerminal}
                          onOpenModal={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedPedidoForEtiqueta(ped);
                          }}
                        />
                      </div>

                      <div className="pedidos-kanban-card-footer">
                        <span className={`pedidos-kanban-assignee ${ped.responsable_nombre ? 'is-assigned' : 'is-unassigned'}`}>
                          {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                        </span>
                        <Link
                          to={`/gestion/pedidos/${ped.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="pedidos-kanban-detail-link"
                        >
                          Ver detalle &rarr;
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Active Kanban Board View - 4 Columns Single Horizontal Row with Internal Scroll */
          <div className="pedidos-kanban-board">
            {estadosKanban.map((estado) => {
              const columnPedidos = filteredPedidos.filter((p) => p.estado === estado);
              const styleInfo = estadoTitles[estado] || { label: estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)', border: 'var(--pedidos-border-default, #cbd5e1)' };

              return (
                <div
                  key={estado}
                  className="pedidos-kanban-col"
                >
                  {/* Column Header (Fixed) */}
                  <div className="pedidos-kanban-col-header">
                    <div className="pedidos-kanban-col-header-left">
                      <span
                        className="pedidos-kanban-status-dot"
                        style={{ backgroundColor: styleInfo.color }}
                      />
                      <span className="pedidos-kanban-col-title">
                        {styleInfo.label}
                      </span>
                    </div>
                    <span className="pedidos-kanban-col-count">
                      {columnPedidos.length}
                    </span>
                  </div>

                  {/* Column Cards (Vertical Scroll) */}
                  <div className="pedidos-kanban-col-body">
                    {columnPedidos.map((ped) => {
                      const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                      const isSelected = selectedPedidoIds.has(ped.id);
                      return (
                        <article
                          key={ped.id}
                          className={`kanban-card ${isSelected ? 'is-selected' : ''} ${ped.retrabajo_activo ? 'is-retrabajo' : ''} ${ped.origen === 'interno' ? 'is-interno' : ''}`}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('input, select, button, .etiqueta-interna-pill, a, label, .etiqueta-overflow-badge')) {
                              return;
                            }
                            navigate(`/gestion/pedidos/${ped.id}`);
                          }}
                        >
                          {/* Top Bar: PED & Date */}
                          <div className="pedidos-kanban-card-top">
                            <div className="pedidos-kanban-card-id-row">
                              {isAdmin && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectPedido(ped.id)}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  className="pedidos-kanban-card-checkbox"
                                />
                              )}
                              <span className="pedidos-kanban-card-id">
                                {ped.pedido_visible}
                              </span>
                              {ped.origen === 'interno' && (
                                <span className="pedidos-badge-interno">
                                  INTERNO
                                </span>
                              )}
                            </div>
                            <span className="pedidos-kanban-card-date">
                              {new Date(ped.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* DEVUELTO - RETRABAJAR Badge if applicable */}
                          {ped.retrabajo_activo && (
                            <div className="pedidos-badge-retrabajo">
                              🔄 DEVUELTO - RETRABAJAR {ped.revision_count ? `· Rev #${ped.revision_count}` : ''}
                            </div>
                          )}

                          {/* Título de la tarjeta (Desktop: máx 2 líneas; Mobile: compacto) */}
                          <div
                            className={`kanban-card-title ${ped.titulo ? 'has-explicit-title' : ''}`}
                            title={getPedidoCardTitle(ped)}
                          >
                            {getPedidoCardTitle(ped)}
                          </div>

                          {/* Service Category & Type */}
                          <div className="pedidos-kanban-service">
                            {ped.categoria_nombre || (ped.origen === 'interno' ? 'Sin categoría' : 'General')} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                          </div>

                          {/* Solicitante y Área */}
                          <div className="pedidos-kanban-parties">
                            <div
                              className="pedidos-kanban-requester"
                              title={`Solicitante: ${ped.solicitante_nombre || (ped.origen === 'interno' ? 'No informado' : 'Sin solicitante')}`}
                            >
                              <span style={{ color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 500, marginRight: '0.25rem' }}>👤</span>
                              {ped.solicitante_nombre || (ped.origen === 'interno' ? 'No informado' : 'Sin solicitante')}
                            </div>
                            <div
                              className="pedidos-kanban-area"
                              title={`Área: ${ped.area_solicitante || (ped.origen === 'interno' ? 'No informada' : 'Sin área')}`}
                            >
                              <span style={{ color: 'var(--pedidos-text-muted, #64748b)', fontWeight: 500, marginRight: '0.25rem' }}>🏛️</span>
                              {ped.area_solicitante || (ped.origen === 'interno' ? 'No informada' : 'Sin área')}
                            </div>
                          </div>

                          {/* Metadatos: Prioridad y Múltiples Etiquetas */}
                          <div className="pedidos-kanban-meta-row">
                            {canEditMetadata && !isTerminal ? (
                              <select
                                value={ped.prioridad || ''}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handlePrioridadChange(ped, e.target.value);
                                }}
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

                            <KanbanEtiquetasBadge
                              etiquetas={ped.etiquetas}
                              legacyEtiqueta={ped.etiqueta_interna}
                              canEdit={canEditMetadata && !isTerminal}
                              onOpenModal={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedPedidoForEtiqueta(ped);
                              }}
                            />
                          </div>

                          {/* 48h Info Request Badge if applicable */}
                          {ped.estado === 'Esperando información' && (
                            <div className="pedidos-badge-info-pendiente">
                              ⏳ 48h Info Pendiente
                            </div>
                          )}

                          {/* Footer: Responsable & Action */}
                          <div className="pedidos-kanban-card-footer">
                            <span className={`pedidos-kanban-assignee ${ped.responsable_nombre ? 'is-assigned' : 'is-unassigned'}`}>
                              {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                            </span>
                            <Link
                              to={`/gestion/pedidos/${ped.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="pedidos-kanban-detail-link"
                            >
                              Ver detalle &rarr;
                            </Link>
                          </div>
                        </article>
                      );
                    })}

                    {columnPedidos.length === 0 && (
                      <div className="pedidos-kanban-empty">
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
        /* Table View — Rediseño Linear Etapa 4 */
        <div className="pedidos-gestion-table-card">
          <div className="pedidos-gestion-table-scroll">
            <table className="pedidos-gestion-table">
              <thead>
                <tr className="pedidos-gestion-table-header-row">
                  {isAdmin && (
                    <th className="pedidos-table-th pedidos-table-th-checkbox">
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
                        className="pedidos-table-checkbox"
                        title="Seleccionar página visible"
                        aria-label="Seleccionar todos los pedidos de la página visible"
                      />
                    </th>
                  )}
                  <th className="pedidos-table-th pedidos-table-th-id">Código PED</th>
                  <th className="pedidos-table-th pedidos-table-th-service">Categoría / Tipo</th>
                  <th className="pedidos-table-th pedidos-table-th-priority">Prioridad</th>
                  <th className="pedidos-table-th pedidos-table-th-tags">Etiqueta</th>
                  <th className="pedidos-table-th pedidos-table-th-status">Estado</th>
                  <th className="pedidos-table-th pedidos-table-th-assignee">Responsable</th>
                  <th className="pedidos-table-th pedidos-table-th-date">Fecha Ingreso</th>
                  <th className="pedidos-table-th pedidos-table-th-actions">Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: 'var(--pedidos-text-secondary, #334155)', bg: 'var(--pedidos-surface-sunken, #f1f5f9)', border: 'var(--pedidos-border-default, #cbd5e1)' };
                  const isTerminal = ped.archivado || ped.estado === 'Finalizado' || ped.estado === 'Cancelado';
                  const isSelected = selectedPedidoIds.has(ped.id);

                  return (
                    <tr
                      key={ped.id}
                      className={`pedidos-gestion-table-row ${isSelected ? 'is-selected' : ''} ${ped.retrabajo_activo ? 'is-retrabajo' : ''}`}
                    >
                      {isAdmin && (
                        <td className="pedidos-table-td pedidos-table-td-checkbox">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPedido(ped.id)}
                            className="pedidos-table-checkbox"
                            aria-label={`Seleccionar pedido ${ped.pedido_visible}`}
                          />
                        </td>
                      )}
                      <td className="pedidos-table-td pedidos-table-td-id">
                        <div className="pedidos-table-id-row">
                          <span className="pedidos-table-ped-code">{ped.pedido_visible}</span>
                          {ped.origen === 'interno' && (
                            <span className="pedidos-badge-interno">
                              INTERNO
                            </span>
                          )}
                        </div>
                        <div
                          className={`pedidos-table-title ${ped.titulo ? 'has-explicit-title' : ''}`}
                          title={getPedidoCardTitle(ped)}
                        >
                          {getPedidoCardTitle(ped)}
                        </div>
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-service">
                        <div className="pedidos-table-category">{ped.categoria_nombre || (ped.origen === 'interno' ? 'Sin categoría' : 'General')}</div>
                        <div className="pedidos-table-type">{ped.tipo_nombre || (ped.origen === 'interno' ? 'General' : 'Pieza')}</div>
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-priority">
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
                      <td className="pedidos-table-td pedidos-table-td-tags">
                        <KanbanEtiquetasBadge
                          etiquetas={ped.etiquetas}
                          legacyEtiqueta={ped.etiqueta_interna}
                          canEdit={canEditMetadata && !isTerminal}
                          onOpenModal={() => setSelectedPedidoForEtiqueta(ped)}
                        />
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-status">
                        <div className="pedidos-table-status-stack">
                          <span
                            className="pedidos-kanban-status-pill"
                            style={{
                              backgroundColor: styleInfo.bg,
                              color: styleInfo.color,
                              borderColor: styleInfo.border,
                            }}
                          >
                            {styleInfo.label}
                          </span>
                          {ped.retrabajo_activo ? (
                            <span className="pedidos-table-rework-badge">
                              🔄 DEVUELTO {ped.revision_count ? `(#${ped.revision_count})` : ''}
                            </span>
                          ) : !ped.retrabajo_activo && ped.estado === 'Finalizado' && (ped.revision_count || 0) > 0 ? (
                            <span className="pedidos-table-reworked-hist-badge">
                              RETRABAJADO · {formatReworkHistoricalText(ped.revision_count || 0)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-assignee">
                        <span className={`pedidos-table-assignee-text ${ped.responsable_nombre ? 'is-assigned' : 'is-unassigned'}`}>
                          {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                        </span>
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-date">
                        <time dateTime={ped.created_at} className="pedidos-table-date-text">
                          {new Date(ped.created_at).toLocaleDateString()}
                        </time>
                      </td>
                      <td className="pedidos-table-td pedidos-table-td-actions">
                        <Link
                          to={`/gestion/pedidos/${ped.id}`}
                          className="pedidos-table-detail-link"
                        >
                          Ver detalle &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paginatedPedidos.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="pedidos-table-empty">
                      No se encontraron pedidos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {totalPages > 1 && (
            <div className="pedidos-table-pagination">
              <span className="pedidos-table-pagination-info">
                Página {currentPage} de {totalPages} ({pedidos.length} pedidos)
              </span>
              <div className="pedidos-table-pagination-actions">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="pedidos-pagination-btn"
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="pedidos-pagination-btn"
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

      {/* Editar Etiqueta Modal (Fase 4B Multi-etiquetas) */}
      {selectedPedidoForEtiqueta && (
        <EditarEtiquetaModal
          isOpen={Boolean(selectedPedidoForEtiqueta)}
          onClose={() => setSelectedPedidoForEtiqueta(null)}
          pedidoId={selectedPedidoForEtiqueta.id}
          pedidoVisible={selectedPedidoForEtiqueta.pedido_visible}
          initialEtiquetas={selectedPedidoForEtiqueta.etiquetas}
          initialEtiqueta={selectedPedidoForEtiqueta.etiqueta_interna || null}
          onSuccess={async (savedEtiquetas) => {
            if (selectedPedidoForEtiqueta && savedEtiquetas) {
              const pedId = selectedPedidoForEtiqueta.id;
              setPedidos((prev) =>
                prev.map((p) =>
                  p.id === pedId
                    ? {
                        ...p,
                        etiquetas: savedEtiquetas,
                        etiqueta_interna: savedEtiquetas.length > 0 ? savedEtiquetas[0].texto : null,
                      }
                    : p
                )
              );
            }
            setSelectedPedidoForEtiqueta(null);
            await loadData();
          }}
          onSave={handleSaveEtiqueta}
        />
      )}

      {/* Carga Interna Modal */}
      {showCargaInternaModal && (
        <CargaInternaModal
          isOpen={showCargaInternaModal}
          onClose={() => setShowCargaInternaModal(false)}
          onSuccess={(_newPedidoId, visible) => {
            setShowCargaInternaModal(false);
            setDeleteSuccessMessage(`Pedido interno ${visible} creado exitosamente.`);
            loadData();
          }}
        />
      )}
    </div>
  );
};
