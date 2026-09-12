import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPedidos, PedidoListItem } from '../services/gestionApi';

export const GestionDashboardPage: React.FC = () => {
  const { user, isObserver } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [tabFilter, setTabFilter] = useState<'todos' | 'mis_pedidos' | 'sin_asignar' | 'archivados'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pedidosData = await fetchPedidos({
        archivado: tabFilter === 'archivados',
        responsable_user_id: tabFilter === 'mis_pedidos' ? user?.userId : undefined,
        unassigned: tabFilter === 'sin_asignar' ? true : undefined,
        search: searchTerm || undefined,
      });
      setPedidos(pedidosData);
    } catch (err: any) {
      setError(err.message || 'Error cargando datos del tablero.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tabFilter, user?.userId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Grouping for Board
  const estadosOrder = ['recibido', 'en_analisis', 'en_curso', 'finalizado', 'cancelado'];
  const estadoTitles: Record<string, { label: string; color: string; bg: string }> = {
    recibido: { label: 'Recibido', color: '#0369a1', bg: '#e0f2fe' },
    en_analisis: { label: 'En Análisis', color: '#b45309', bg: '#fef3c7' },
    en_curso: { label: 'En Curso', color: '#4338ca', bg: '#e0e7ff' },
    finalizado: { label: 'Finalizado', color: '#15803d', bg: '#dcfce7' },
    cancelado: { label: 'Cancelado', color: '#b91c1c', bg: '#fee2e2' },
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Gestión Interna de Pedidos
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Secretaría de Medios · {isObserver ? 'Modo Observador (Solo Lectura)' : `Operador: ${user?.nombre} ${user?.apellido}`}
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
            }}
          >
            Vista Tabla
          </button>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'todos', label: 'Todos los Activos' },
            { id: 'mis_pedidos', label: 'Mis Pedidos' },
            { id: 'sin_asignar', label: 'Sin Asignar' },
            { id: 'archivados', label: 'Archivados' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTabFilter(tab.id as any)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: tabFilter === tab.id ? '#0f172a' : '#f1f5f9',
                color: tabFilter === tab.id ? '#ffffff' : '#475569',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Buscar por PED..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
          />
          <button
            type="submit"
            style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Cargando pedidos...</div>
      ) : viewMode === 'board' ? (
        /* Board / Kanban View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', alignItems: 'flex-start' }}>
          {estadosOrder.map((est) => {
            const items = pedidos.filter((p) => p.estado === est);
            const styleInfo = estadoTitles[est];
            return (
              <div key={est} style={{ background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: styleInfo.color }}>
                    {styleInfo.label}
                  </span>
                  <span style={{ background: styleInfo.bg, color: styleInfo.color, padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {items.length}
                  </span>
                </div>

                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                  {items.map((p) => (
                    <Link
                      key={p.id}
                      to={`/pedido/${p.pedido_visible}`}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.375rem',
                        padding: '0.875rem',
                        textDecoration: 'none',
                        color: 'inherit',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        display: 'block',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                          {p.pedido_visible}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          v{p.version}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '0.5rem' }}>
                        {p.categoria_nombre} {p.tipo_nombre ? `· ${p.tipo_nombre}` : ''}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: p.responsable_nombre ? '#0369a1' : '#dc2626', fontWeight: 500 }}>
                        👤 {p.responsable_nombre || 'Sin Asignar'}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div style={{ background: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '0.75rem 1rem' }}>Código</th>
                <th style={{ padding: '0.75rem 1rem' }}>Categoría / Tipo</th>
                <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                <th style={{ padding: '0.75rem 1rem' }}>Responsable</th>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha Creación</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No se encontraron pedidos.
                  </td>
                </tr>
              ) : (
                pedidos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{p.pedido_visible}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {p.categoria_nombre} {p.tipo_nombre ? `· ${p.tipo_nombre}` : ''}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', background: estadoTitles[p.estado]?.bg || '#f1f5f9', color: estadoTitles[p.estado]?.color || '#334155' }}>
                        {estadoTitles[p.estado]?.label || p.estado}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: p.responsable_nombre ? '#0f172a' : '#dc2626' }}>
                      {p.responsable_nombre || 'Sin Asignar'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {new Date(p.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link
                        to={`/pedido/${p.pedido_visible}`}
                        style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Ver Detalle →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
