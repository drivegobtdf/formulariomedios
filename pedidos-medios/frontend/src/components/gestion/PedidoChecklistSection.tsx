import React, { useState, useEffect } from 'react';
import {
  PedidoChecklistItem,
  fetchPedidoChecklist,
  createChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  reorderChecklistItems,
} from '../../services/gestionApi';

interface PedidoChecklistSectionProps {
  pedidoId: string;
  initialItems?: PedidoChecklistItem[];
  isObserver: boolean;
  onUpdate?: () => void;
}

export const PedidoChecklistSection: React.FC<PedidoChecklistSectionProps> = ({
  pedidoId,
  initialItems,
  isObserver,
  onUpdate,
}) => {
  const [items, setItems] = useState<PedidoChecklistItem[]>(Array.isArray(initialItems) ? initialItems : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTexto, setNewTexto] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTexto, setEditingTexto] = useState('');

  // Mobile collapsible accordion state (open by default, toggleable on mobile)
  const [isCollapsedMobile, setIsCollapsedMobile] = useState(false);

  // Drag & drop state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItems !== undefined) {
      setItems(Array.isArray(initialItems) ? initialItems : []);
    } else if (pedidoId) {
      loadChecklist();
    }
  }, [pedidoId, initialItems]);

  const loadChecklist = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPedidoChecklist(pedidoId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar checklist');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTexto.trim();
    if (!clean || isObserver || actionLoading) return;

    setActionLoading(true);
    setError(null);
    try {
      const created = await createChecklistItem(pedidoId, clean);
      setItems((prev) => [...prev, created]);
      setNewTexto('');
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Error al crear tarea');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle = async (item: PedidoChecklistItem) => {
    if (isObserver || actionLoading) return;

    const newCompletado = !item.completado;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              completado: newCompletado,
              completado_at: newCompletado ? new Date().toISOString() : null,
            }
          : i
      )
    );

    try {
      const updated = await toggleChecklistItem(item.id, newCompletado);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar tarea');
      // Rollback
      loadChecklist();
    }
  };

  const handleStartEdit = (item: PedidoChecklistItem) => {
    if (isObserver) return;
    setEditingId(item.id);
    setEditingTexto(item.texto);
  };

  const handleSaveEdit = async (itemId: string) => {
    const clean = editingTexto.trim();
    if (!clean || isObserver) return;

    setActionLoading(true);
    setError(null);
    try {
      const updated = await updateChecklistItem(itemId, clean);
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setEditingId(null);
      setEditingTexto('');
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar texto');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (isObserver || actionLoading) return;

    setActionLoading(true);
    setError(null);
    try {
      await deleteChecklistItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar tarea');
    } finally {
      setActionLoading(false);
    }
  };

  // Reordering helpers (for drag and drop & accessible up/down buttons)
  const moveItem = async (fromIndex: number, toIndex: number, currentList: PedidoChecklistItem[]) => {
    if (isObserver || fromIndex === toIndex || toIndex < 0 || toIndex >= currentList.length) return;

    const updated = [...currentList];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Update state optimistically
    const reorderedIds = updated.map((i) => i.id);
    setItems(updated);

    try {
      await reorderChecklistItems(pedidoId, reorderedIds);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Error al reordenar tareas');
      loadChecklist();
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (isObserver) return;
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId || isObserver) return;

    const fromIdx = pendingItems.findIndex((i) => i.id === draggedItemId);
    const toIdx = pendingItems.findIndex((i) => i.id === targetId);

    if (fromIdx !== -1 && toIdx !== -1) {
      moveItem(fromIdx, toIdx, pendingItems);
    }
    setDraggedItemId(null);
  };

  // Group items: pendientes arriba (ordenadas por orden ASC), completadas agrupadas abajo
  const safeItems = Array.isArray(items) ? items : [];
  const pendingItems = safeItems.filter((i) => !i.completado);
  const completedItems = safeItems.filter((i) => i.completado);
  const totalCount = safeItems.length;
  const completedCount = completedItems.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="pedidos-detalle-card" style={{ marginTop: '1.25rem' }}>
      {/* Header with Title, Progress, and Mobile Collapse Toggle */}
      <div
        className="pedidos-detalle-card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h2 className="pedidos-detalle-card-title" style={{ margin: 0 }}>
            ☑️ Checklist de tareas
          </h2>
          {totalCount > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: completedCount === totalCount ? 'var(--pedidos-status-finalizado-text, #15803d)' : 'var(--pedidos-brand-accent, #0284c7)',
                backgroundColor: completedCount === totalCount ? 'var(--pedidos-status-finalizado-bg, #dcfce7)' : 'var(--pedidos-surface-sunken, #eff6ff)',
                padding: '0.15rem 0.55rem',
                borderRadius: '9999px',
                border: completedCount === totalCount ? '1px solid var(--pedidos-status-finalizado-border, #bbf7d0)' : '1px solid var(--pedidos-border-default, #bfdbfe)',
              }}
            >
              {completedCount} de {totalCount} completadas
            </span>
          )}
        </div>

        {/* Mobile toggle button */}
        <button
          type="button"
          onClick={() => setIsCollapsedMobile(!isCollapsedMobile)}
          className="checklist-mobile-toggle"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pedidos-text-secondary, #475569)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            padding: '0.2rem 0.4rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          aria-label={isCollapsedMobile ? 'Expandir checklist' : 'Plegar checklist'}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {isCollapsedMobile ? 'Mostrar' : 'Ocultar'}
          </span>
          <span>{isCollapsedMobile ? '▼' : '▲'}</span>
        </button>
      </div>

      {/* Accordion Content */}
      {!isCollapsedMobile && (
        <div style={{ marginTop: '0.75rem' }}>
          {error && (
            <div
              style={{
                padding: '0.6rem 0.85rem',
                backgroundColor: 'var(--pedidos-status-rejected-bg, #fef2f2)',
                border: '1px solid var(--pedidos-status-rejected-border, #fecaca)',
                borderRadius: '0.375rem',
                color: 'var(--pedidos-status-rejected-text, #b91c1c)',
                fontSize: '0.825rem',
                marginBottom: '0.75rem',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Progress Bar */}
          {totalCount > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'var(--pedidos-surface-sunken, #e2e8f0)',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    backgroundColor: progressPct === 100 ? '#16a34a' : 'var(--pedidos-brand-accent, #0284c7)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Add Item Form (Only for Admin & Equipo) */}
          {!isObserver && (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Añadir una tarea interna..."
                value={newTexto}
                onChange={(e) => setNewTexto(e.target.value)}
                maxLength={500}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--pedidos-control-border, #cbd5e1)',
                  backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                  color: 'var(--pedidos-control-text, #1f2937)',
                  fontSize: '0.875rem',
                }}
              />
              <button
                type="submit"
                disabled={actionLoading || !newTexto.trim()}
                style={{
                  padding: '0.5rem 0.9rem',
                  backgroundColor: 'var(--pedidos-brand-accent, #0284c7)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: actionLoading || !newTexto.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newTexto.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                + Tarea
              </button>
            </form>
          )}

          {loading && items.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--pedidos-text-muted, #64748b)', padding: '0.75rem 0' }}>
              Cargando tareas...
            </div>
          ) : items.length === 0 ? (
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--pedidos-text-muted, #64748b)',
                fontStyle: 'italic',
                padding: '1rem',
                textAlign: 'center',
                backgroundColor: 'var(--pedidos-surface-sunken, #f8fafc)',
                borderRadius: '0.5rem',
                border: '1px dashed var(--pedidos-border-default, #e2e8f0)',
              }}
            >
              {isObserver
                ? 'No hay tareas registradas en este pedido.'
                : 'No hay tareas asignadas. Añade tareas arriba para llevar el control interno del pedido.'}
            </div>
          ) : (
            <div className="pedidos-checklist-container">
              {/* 1. Tareas Pendientes */}
              {pendingItems.map((item, index) => {
                const isEditing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`pedidos-checklist-item ${draggedItemId === item.id ? 'is-dragging' : ''}`}
                    draggable={!isObserver && !isEditing}
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, item.id)}
                  >
                    {/* Drag Handle & Accessible Controls for Admin/Equipo */}
                    {!isObserver && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                        <span
                          className="checklist-drag-handle"
                          title="Arrastra para reordenar"
                          aria-label="Arrastrar para reordenar"
                        >
                          ⠿
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <button
                            type="button"
                            onClick={() => moveItem(index, index - 1, pendingItems)}
                            disabled={index === 0 || actionLoading}
                            title="Subir tarea"
                            style={{
                              background: 'none',
                              border: 'none',
                              fontSize: '0.65rem',
                              lineHeight: 1,
                              cursor: index === 0 ? 'not-allowed' : 'pointer',
                              color: index === 0 ? '#cbd5e1' : '#64748b',
                              padding: '1px',
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(index, index + 1, pendingItems)}
                            disabled={index === pendingItems.length - 1 || actionLoading}
                            title="Bajar tarea"
                            style={{
                              background: 'none',
                              border: 'none',
                              fontSize: '0.65rem',
                              lineHeight: 1,
                              cursor: index === pendingItems.length - 1 ? 'not-allowed' : 'pointer',
                              color: index === pendingItems.length - 1 ? '#cbd5e1' : '#64748b',
                              padding: '1px',
                            }}
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={item.completado}
                      onChange={() => handleToggle(item)}
                      disabled={isObserver || actionLoading}
                      style={{
                        marginTop: '0.2rem',
                        cursor: isObserver ? 'default' : 'pointer',
                        width: '16px',
                        height: '16px',
                        accentColor: 'var(--pedidos-brand-accent, #0284c7)',
                      }}
                      aria-label={`Marcar como completada: ${item.texto}`}
                    />

                    {/* Content or Edit Form */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={editingTexto}
                            onChange={(e) => setEditingTexto(e.target.value)}
                            maxLength={500}
                            autoFocus
                            disabled={actionLoading}
                            style={{
                              flex: 1,
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.85rem',
                              borderRadius: '0.25rem',
                              border: '1px solid var(--pedidos-control-border, #cbd5e1)',
                              backgroundColor: 'var(--pedidos-control-bg, #ffffff)',
                              color: 'var(--pedidos-control-text, #1f2937)',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(item.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={actionLoading || !editingTexto.trim()}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={actionLoading}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: 'var(--pedidos-surface-sunken, #f1f5f9)',
                              color: 'var(--pedidos-text-secondary, #475569)',
                              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span
                          className="checklist-item-text"
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--pedidos-text-primary, #1e293b)',
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.texto}
                        </span>
                      )}
                    </div>

                    {/* Action buttons (Edit / Delete) for Admin/Equipo */}
                    {!isObserver && !isEditing && (
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          disabled={actionLoading}
                          title="Editar texto de la tarea"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            color: 'var(--pedidos-text-muted, #64748b)',
                            padding: '0.15rem 0.3rem',
                            borderRadius: '0.25rem',
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          disabled={actionLoading}
                          title="Eliminar tarea"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            color: '#dc2626',
                            padding: '0.15rem 0.3rem',
                            borderRadius: '0.25rem',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2. Tareas Completadas (Agrupadas debajo con tachado e historial) */}
              {completedItems.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      color: 'var(--pedidos-text-muted, #64748b)',
                      textTransform: 'uppercase',
                      padding: '0.35rem 0.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>✓ Completadas ({completedItems.length})</span>
                  </div>

                  {completedItems.map((item) => (
                    <div
                      key={item.id}
                      className="pedidos-checklist-item is-completed"
                      style={{ marginBottom: '0.35rem' }}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={item.completado}
                        onChange={() => handleToggle(item)}
                        disabled={isObserver || actionLoading}
                        style={{
                          marginTop: '0.2rem',
                          cursor: isObserver ? 'default' : 'pointer',
                          width: '16px',
                          height: '16px',
                          accentColor: 'var(--pedidos-brand-accent, #0284c7)',
                        }}
                        aria-label={`Desmarcar tarea: ${item.texto}`}
                      />

                      {/* Content & Metadata */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span
                          className="checklist-item-text"
                          style={{
                            fontSize: '0.85rem',
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.texto}
                        </span>

                        {/* Who and When Completed Metadata */}
                        {(item.completado_por_nombre || item.completado_at) && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--pedidos-text-muted, #64748b)',
                              marginTop: '0.15rem',
                            }}
                          >
                            <span>✓ Completada </span>
                            {item.completado_por_nombre && (
                              <span>por <strong>{item.completado_por_nombre}</strong> </span>
                            )}
                            {item.completado_at && (
                              <span>el {new Date(item.completado_at).toLocaleDateString('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Delete button for Admin/Equipo */}
                      {!isObserver && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          disabled={actionLoading}
                          title="Eliminar tarea completada"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            padding: '0.15rem 0.3rem',
                            borderRadius: '0.25rem',
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
