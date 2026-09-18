import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPedidos, fetchGestionStats, PedidoListItem, GestionStats } from '../services/gestionApi';

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

  // Filters & Views
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [tabFilter, setTabFilter] = useState<GestionTabFilter>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination for table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

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
  }, [tabFilter, searchTerm, user?.userId, isApproved]);

  useEffect(() => {
    if (isApproved) {
      loadData();
    }
  }, [loadData, isApproved]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Canonical states for Kanban board (4 active in a single horizontal row)
  const estadosKanban = ['Nuevo', 'En revisión', 'En proceso', 'Esperando información'];
  const estadoTitles: Record<string, { label: string; color: string; bg: string; border: string }> = {
    'Nuevo': { label: 'Nuevo', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    'En revisión': { label: 'En Revisión', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    'En proceso': { label: 'En Proceso', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
    'Esperando información': { label: 'Esperando Información', color: '#a16207', bg: '#fefce8', border: '#fef08a' },
    'Finalizado': { label: 'Finalizado', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    'Cancelado': { label: 'Cancelado', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  };

  // Auth Loading State
  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>Verificando credenciales...</h3>
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
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
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
              backgroundColor: '#e0f2fe',
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
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Acceso restringido
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
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

  // Paginated table data
  const totalPages = Math.ceil(pedidos.length / pageSize) || 1;
  const paginatedPedidos = pedidos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const isTerminalOrArchivedTab =
    tabFilter === 'finalizados' || tabFilter === 'cancelados' || tabFilter === 'archivados';

  return (
    <div style={{ width: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header & Role Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Gestión de pedidos
            </h1>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              backgroundColor: isObserver ? '#f1f5f9' : isAdmin ? '#fef3c7' : '#e0e7ff',
              color: isObserver ? '#475569' : isAdmin ? '#b45309' : '#4338ca',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {isObserver ? 'Observador' : isAdmin ? 'Administrador' : 'Equipo'}
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
              border: '1px solid #cbd5e1',
              background: viewMode === 'board' ? '#0284c7' : '#ffffff',
              color: viewMode === 'board' ? '#ffffff' : '#334155',
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
              border: '1px solid #cbd5e1',
              background: viewMode === 'table' ? '#0284c7' : '#ffffff',
              color: viewMode === 'table' ? '#ffffff' : '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Tabla
          </button>
        </div>
      </div>

      {/* Metric Cards Banner (only if no error) */}
      {!error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Activos</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0 0' }}>
              {stats.nuevos + stats.enRevision + stats.enProceso + stats.esperandoInfo}
            </p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 600, textTransform: 'uppercase' }}>Nuevos</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0369a1', margin: '0.1rem 0 0 0' }}>{stats.nuevos}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>En revisión</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', margin: '0.1rem 0 0 0' }}>{stats.enRevision}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#4338ca', fontWeight: 600, textTransform: 'uppercase' }}>En proceso</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4338ca', margin: '0.1rem 0 0 0' }}>{stats.enProceso}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#a16207', fontWeight: 600, textTransform: 'uppercase' }}>Esperando información</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a16207', margin: '0.1rem 0 0 0' }}>{stats.esperandoInfo}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase' }}>Sin asignar</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c', margin: '0.1rem 0 0 0' }}>{stats.sinAsignar}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase' }}>Finalizados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', margin: '0.1rem 0 0 0' }}>{stats.finalizados}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Cancelados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#64748b', margin: '0.1rem 0 0 0' }}>{stats.cancelados}</p>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Archivados</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#475569', margin: '0.1rem 0 0 0' }}>{stats.archivados}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: '#ffffff', padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
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
                background: tabFilter === t.id ? '#0f172a' : 'transparent',
                color: tabFilter === t.id ? '#ffffff' : '#64748b',
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

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Buscar por código PED..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              fontSize: '0.825rem',
              minWidth: '220px',
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
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                  {tabFilter === 'finalizados' && 'Finalizados'}
                  {tabFilter === 'cancelados' && 'Cancelados'}
                  {tabFilter === 'archivados' && 'Archivados'}
                </h3>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: tabFilter === 'finalizados' ? '#f0fdf4' : tabFilter === 'cancelados' ? '#fef2f2' : '#f1f5f9',
                  color: tabFilter === 'finalizados' ? '#15803d' : tabFilter === 'cancelados' ? '#b91c1c' : '#475569',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  border: `1px solid ${tabFilter === 'finalizados' ? '#bbf7d0' : tabFilter === 'cancelados' ? '#fecaca' : '#cbd5e1'}`,
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
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#0284c7',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Volver
              </button>
            </div>

            {pedidos.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '0.5rem' }}>
                No hay pedidos en este estado.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {pedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' };
                  return (
                    <Link
                      key={ped.id}
                      to={`/gestion/pedidos/${ped.id}`}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
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
                        e.currentTarget.style.borderColor = '#0284c7';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{ped.pedido_visible}</span>
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
                      <div style={{ fontSize: '0.825rem', color: '#334155', fontWeight: 500 }}>
                        {ped.categoria_nombre || 'General'} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ color: ped.responsable_nombre ? '#334155' : '#b91c1c', fontWeight: 500 }}>
                          {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                        </span>
                        <span style={{ color: '#0284c7', fontWeight: 600 }}>Ver detalle &rarr;</span>
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
              const styleInfo = estadoTitles[estado] || { label: estado, color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' };

              return (
                <div
                  key={estado}
                  style={{
                    backgroundColor: '#f8fafc',
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
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#ffffff',
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
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>
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
                    {columnPedidos.map((ped) => (
                      <Link
                        key={ped.id}
                        to={`/gestion/pedidos/${ped.id}`}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
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
                          e.currentTarget.style.borderColor = '#0284c7';
                          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                        }}
                      >
                        {/* Top Bar: PED & Date */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                            {ped.pedido_visible}
                          </span>
                          <span style={{ fontSize: '0.725rem', color: '#64748b' }}>
                            {new Date(ped.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Service Category & Type */}
                        <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
                          {ped.categoria_nombre || 'General'} {ped.tipo_nombre ? `· ${ped.tipo_nombre}` : ''}
                        </div>

                        {/* 48h Info Request Badge if applicable */}
                        {ped.estado === 'Esperando información' && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#a16207',
                              backgroundColor: '#fefce8',
                              border: '1px solid #fef08a',
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                          <span style={{ color: ped.responsable_nombre ? '#334155' : '#b91c1c', fontWeight: 500 }}>
                            {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                          </span>
                          <span style={{ color: '#0284c7', fontWeight: 600 }}>Ver detalle &rarr;</span>
                        </div>
                      </Link>
                    ))}

                    {columnPedidos.length === 0 && (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', border: '1px dashed #e2e8f0', borderRadius: '0.375rem', margin: 'auto 0' }}>
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
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Código PED</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Categoría / Tipo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Responsable</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Fecha Ingreso</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPedidos.map((ped) => {
                  const styleInfo = estadoTitles[ped.estado] || { label: ped.estado, color: '#334155', bg: '#f1f5f9' };
                  return (
                    <tr key={ped.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                        {ped.pedido_visible}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        <div style={{ fontWeight: 500 }}>{ped.categoria_nombre || 'General'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ped.tipo_nombre || 'Pieza'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: styleInfo.bg, color: styleInfo.color }}>
                          {styleInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: ped.responsable_nombre ? '#334155' : '#b91c1c', fontWeight: 500 }}>
                        {ped.responsable_nombre ? `👤 ${ped.responsable_nombre}` : '⚠️ Sin Asignar'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {new Date(ped.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          to={`/gestion/pedidos/${ped.id}`}
                          style={{ color: '#0284c7', fontWeight: 600, textDecoration: 'none', fontSize: '0.85rem' }}
                        >
                          Ver detalle &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paginatedPedidos.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                      No se encontraron pedidos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '0.85rem' }}>
              <span style={{ color: '#64748b' }}>
                Página {currentPage} de {totalPages} ({pedidos.length} pedidos)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#ffffff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', background: currentPage === totalPages ? '#f1f5f9' : '#ffffff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
