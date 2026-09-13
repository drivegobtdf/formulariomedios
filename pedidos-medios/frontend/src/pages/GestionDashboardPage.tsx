import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPedidos, PedidoListItem } from '../services/gestionApi';

export const GestionDashboardPage: React.FC = () => {
  const { user, isObserver, isAdmin } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Views
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [tabFilter, setTabFilter] = useState<'todos' | 'mis_pedidos' | 'sin_asignar' | 'requieren_atencion' | 'archivados'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination for table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pedidosData = await fetchPedidos({
        archivado: tabFilter === 'archivados',
        responsable_user_id: tabFilter === 'mis_pedidos' ? user?.userId : undefined,
        unassigned: tabFilter === 'sin_asignar' ? true : undefined,
        estado: tabFilter === 'requieren_atencion' ? 'Esperando información' : undefined,
        search: searchTerm || undefined,
      });
      setPedidos(pedidosData);
      setCurrentPage(1);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error cargando datos del tablero.');
    } finally {
      setLoading(false);
    }
  }, [tabFilter, searchTerm, user?.userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Canonical states for Kanban board
  const estadosKanban = ['Nuevo', 'En revisión', 'En proceso', 'Esperando información'];
  const estadoTitles: Record<string, { label: string; color: string; bg: string }> = {
    'Nuevo': { label: 'Nuevo', color: '#0369a1', bg: '#e0f2fe' },
    'En revisión': { label: 'En Revisión', color: '#b45309', bg: '#fef3c7' },
    'En proceso': { label: 'En Proceso', color: '#4338ca', bg: '#e0e7ff' },
    'Esperando información': { label: 'Esperando Información', color: '#a16207', bg: '#fefce8' },
    'Finalizado': { label: 'Finalizado', color: '#15803d', bg: '#dcfce7' },
    'Cancelado': { label: 'Cancelado', color: '#b91c1c', bg: '#fee2e2' },
  };

  // Stats calculation
  const stats = {
    total: pedidos.length,
    nuevos: pedidos.filter(p => p.estado === 'Nuevo').length,
    enRevision: pedidos.filter(p => p.estado === 'En revisión').length,
    enProceso: pedidos.filter(p => p.estado === 'En proceso').length,
    esperandoInfo: pedidos.filter(p => p.estado === 'Esperando información').length,
    sinAsignar: pedidos.filter(p => !p.responsable_user_id).length,
  };

  // Paginated table data
  const totalPages = Math.ceil(pedidos.length / pageSize) || 1;
  const paginatedPedidos = pedidos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header & Role Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Gestión Interna de Pedidos
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
              {isObserver ? 'Observador (Solo Lectura)' : isAdmin ? 'Administrador' : 'Equipo'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Secretaría de Medios · {user?.nombre ? `${user.nombre} ${user.apellido} (${user.nombreUsuario})` : 'Cargando usuario...'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              background: viewMode === 'board' ? '#0284c7' : '#ffffff',
              color: viewMode === 'board' ? '#ffffff' : '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Tablero Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              background: viewMode === 'table' ? '#0284c7' : '#ffffff',
              color: viewMode === 'table' ? '#ffffff' : '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Vista Tabla
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Listados</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0 0 0' }}>{stats.total}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, textTransform: 'uppercase' }}>Nuevos</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0369a1', margin: '0.25rem 0 0 0' }}>{stats.nuevos}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>En Revisión</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309', margin: '0.25rem 0 0 0' }}>{stats.enRevision}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#4338ca', fontWeight: 600, textTransform: 'uppercase' }}>En Proceso</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4338ca', margin: '0.25rem 0 0 0' }}>{stats.enProceso}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#a16207', fontWeight: 600, textTransform: 'uppercase' }}>Esperando Info (48h)</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a16207', margin: '0.25rem 0 0 0' }}>{stats.esperandoInfo}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase' }}>Sin Asignar</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c', margin: '0.25rem 0 0 0' }}>{stats.sinAsignar}</p>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'mis_pedidos', label: 'Mis Pedidos' },
            { id: 'sin_asignar', label: 'Sin Asignar' },
            { id: 'requieren_atencion', label: 'Requieren Atención' },
            { id: 'archivados', label: 'Archivados' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabFilter(t.id as any)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: tabFilter === t.id ? '#0f172a' : 'transparent',
                color: tabFilter === t.id ? '#ffffff' : '#64748b',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
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
              padding: '0.4rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              minWidth: '240px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.4rem 0.85rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Notifications / Errors */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '0.375rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Cargando pedidos...
        </div>
      ) : viewMode === 'board' ? (
        /* Kanban Board View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', alignItems: 'flex-start' }}>
          {estadosKanban.map((estado) => {
            const columnPedidos = pedidos.filter((p) => p.estado === estado);
            const styleInfo = estadoTitles[estado] || { label: estado, color: '#334155', bg: '#f1f5f9' };

            return (
              <div
                key={estado}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {/* Column Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
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
                      backgroundColor: '#e2e8f0',
                      color: '#475569',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '9999px',
                    }}
                  >
                    {columnPedidos.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '120px' }}>
                  {columnPedidos.map((ped) => (
                    <Link
                      key={ped.id}
                      to={`/gestion/pedidos/${ped.id}`}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.375rem',
                        padding: '0.75rem',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                          {ped.pedido_visible}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {new Date(ped.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        <strong>{ped.categoria_nombre || 'General'}</strong> · {ped.tipo_nombre || 'Pieza'}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.75rem' }}>
                        <span style={{ color: ped.responsable_user_id ? '#334155' : '#b91c1c', fontWeight: 500 }}>
                          {ped.responsable_nombre || '⚠️ Sin Asignar'}
                        </span>
                        <span style={{ color: '#0284c7', fontWeight: 600 }}>Ver detalle →</span>
                      </div>
                    </Link>
                  ))}
                  {columnPedidos.length === 0 && (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      Sin pedidos en este estado
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
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
                        <div>{ped.categoria_nombre || 'General'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ped.tipo_nombre || 'Pieza'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: styleInfo.bg, color: styleInfo.color }}>
                          {styleInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: ped.responsable_user_id ? '#334155' : '#b91c1c', fontWeight: 500 }}>
                        {ped.responsable_nombre || '⚠️ Sin Asignar'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {new Date(ped.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          to={`/gestion/pedidos/${ped.id}`}
                          style={{ color: '#0284c7', fontWeight: 600, textDecoration: 'none', fontSize: '0.85rem' }}
                        >
                          Ver Detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paginatedPedidos.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
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
