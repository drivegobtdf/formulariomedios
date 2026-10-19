import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  fetchTableros,
  fetchTableroDetail,
  createTablero,
  updateTablero,
  deleteTablero,
  inviteTableroMember,
  updateTableroMemberRole,
  revokeTableroMember,
  createColumna,
  updateColumna,
  deleteColumna,
  reorderColumnas,
  createTarjeta,
  updateTarjeta,
  deleteTarjeta,
  moveTarjeta,
  toggleChecklistItem,
  addChecklistItem,
  deleteChecklistItem,
  addTarjetaComentario,
  searchTarjetas,
  fetchCollaborators,
  fetchPedidosReferences,
  TableroPrivado,
  TableroColumna,
  TableroTarjeta,
  TableroCollaborator,
  PedidoReference,
  TipoContenidoTarjeta,
} from '../services/tablerosApi';
import { getSupabaseClient } from '../services/supabaseClient';
import '../styles/tableros.css';

export const TablerosPrivadosPage: React.FC = () => {
  const navigate = useNavigate();
  const { boardId: routeBoardId } = useParams<{ boardId?: string }>();
  const { isApproved, isObserver } = useAuth();

  // Estados de datos
  const [tableros, setTableros] = useState<TableroPrivado[]>([]);
  const [selectedTableroId, setSelectedTableroId] = useState<string | null>(routeBoardId || null);
  const [boardDetail, setBoardDetail] = useState<{
    board: TableroPrivado;
    miembros: any[];
    columnas: TableroColumna[];
    tarjetas: TableroTarjeta[];
    canEdit: boolean;
    isOwner: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados de modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showColModal, setShowColModal] = useState<{ mode: 'create' | 'edit'; col?: TableroColumna } | null>(null);
  const [showCardModal, setShowCardModal] = useState<{
    mode: 'create' | 'view';
    columnaId?: string;
    tarjeta?: TableroTarjeta;
  } | null>(null);

  // Formularios
  const [formTitulo, setFormTitulo] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState('azul');
  const [formColNombre, setFormColNombre] = useState('');

  // Compartir
  const [collaborators, setCollaborators] = useState<TableroCollaborator[]>([]);
  const [selectedCollabId, setSelectedCollabId] = useState('');
  const [selectedCollabRole, setSelectedCollabRole] = useState<'lectura' | 'edicion'>('lectura');
  const [collabLoading, setCollabLoading] = useState(false);

  // Tarjeta Modal Form
  const [cardTitulo, setCardTitulo] = useState('');
  const [cardDesc, setCardDesc] = useState('');
  const [cardTipo, setCardTipo] = useState<TipoContenidoTarjeta>('nota_rapida');
  const [cardColor, setCardColor] = useState('blanco');
  const [cardColumnaId, setCardColumnaId] = useState('');
  const [cardMetadata, setCardMetadata] = useState<Record<string, any>>({});
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [pedidoSearch, setPedidoSearch] = useState('');
  const [pedidosRefs, setPedidosRefs] = useState<PedidoReference[]>([]);

  // Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Drag & drop state
  const draggedColIdRef = useRef<string | null>(null);
  const draggedCardRef = useRef<{ cardId: string; sourceColId: string } | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Cargar lista de tableros
  const loadTableros = useCallback(async () => {
    if (!isApproved || isObserver) return;
    try {
      setLoading(true);
      setError(null);
      const list = await fetchTableros();
      setTableros(list);

      // Si no hay seleccionado o el seleccionado ya no existe
      if (list.length > 0) {
        if (!selectedTableroId || !list.some((t) => t.id === selectedTableroId)) {
          setSelectedTableroId(list[0].id);
        }
      } else {
        setSelectedTableroId(null);
        setBoardDetail(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar tableros');
    } finally {
      setLoading(false);
    }
  }, [isApproved, isObserver, selectedTableroId]);

  useEffect(() => {
    loadTableros();
  }, [loadTableros]);

  // Cargar detalle del tablero seleccionado
  const loadDetail = useCallback(async (tableroId: string) => {
    try {
      setDetailLoading(true);
      const detail = await fetchTableroDetail(tableroId);
      setBoardDetail(detail);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar detalle del tablero');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTableroId) {
      loadDetail(selectedTableroId);
    }
  }, [selectedTableroId, loadDetail]);

  // Suscripción Realtime para el tablero activo
  useEffect(() => {
    if (!selectedTableroId || isObserver) return;

    const supabase = getSupabaseClient();
    const channelName = `realtime-board-${selectedTableroId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablero_tarjetas' },
        (payload: any) => {
          if (payload.new?.tablero_id === selectedTableroId || payload.old?.tablero_id === selectedTableroId) {
            loadDetail(selectedTableroId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablero_columnas' },
        (payload: any) => {
          if (payload.new?.tablero_id === selectedTableroId || payload.old?.tablero_id === selectedTableroId) {
            loadDetail(selectedTableroId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablero_tarjeta_checklists' },
        (payload: any) => {
          if (payload.new?.tablero_id === selectedTableroId) {
            loadDetail(selectedTableroId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablero_tarjeta_comentarios' },
        (payload: any) => {
          if (payload.new?.tablero_id === selectedTableroId) {
            loadDetail(selectedTableroId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablero_miembros' },
        (payload: any) => {
          if (payload.new?.tablero_id === selectedTableroId || payload.old?.tablero_id === selectedTableroId) {
            loadDetail(selectedTableroId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTableroId, isObserver, loadDetail]);

  // Manejo de búsqueda
  const handleSearchChange = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const res = await searchTarjetas(q);
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Apertura de modal de compartir
  const openShareModal = async () => {
    setShowShareModal(true);
    setCollabLoading(true);
    try {
      const collabs = await fetchCollaborators();
      setCollaborators(collabs);
      if (collabs.length > 0) setSelectedCollabId(collabs[0].user_id);
    } catch {
      setCollaborators([]);
    } finally {
      setCollabLoading(false);
    }
  };

  // Crear tablero
  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitulo.trim()) return;
    try {
      const newBoard = await createTablero({
        titulo: formTitulo,
        descripcion: formDesc,
        color: formColor,
      });
      setShowCreateModal(false);
      setFormTitulo('');
      setFormDesc('');
      await loadTableros();
      setSelectedTableroId(newBoard.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo crear el tablero'}`);
    }
  };

  // Editar tablero
  const handleEditBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardDetail || !formTitulo.trim()) return;
    try {
      await updateTablero(boardDetail.board.id, {
        titulo: formTitulo,
        descripcion: formDesc,
        color: formColor,
      });
      setShowEditModal(false);
      await loadTableros();
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo editar el tablero'}`);
    }
  };

  // Eliminar tablero
  const handleDeleteBoard = async () => {
    if (!boardDetail) return;
    try {
      await deleteTablero(boardDetail.board.id);
      setShowDeleteModal(false);
      await loadTableros();
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo eliminar el tablero'}`);
    }
  };

  // Invitar miembro
  const handleInviteMember = async () => {
    if (!boardDetail || !selectedCollabId) return;
    try {
      await inviteTableroMember(boardDetail.board.id, selectedCollabId, selectedCollabRole);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo invitar al usuario'}`);
    }
  };

  // Modificar rol de miembro
  const handleUpdateMemberRole = async (userId: string, role: 'lectura' | 'edicion') => {
    if (!boardDetail) return;
    try {
      await updateTableroMemberRole(boardDetail.board.id, userId, role);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo actualizar el rol'}`);
    }
  };

  // Revocar acceso
  const handleRevokeMember = async (userId: string) => {
    if (!boardDetail) return;
    if (!confirm('¿Confirma revocar el acceso a este usuario?')) return;
    try {
      await revokeTableroMember(boardDetail.board.id, userId);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo revocar el acceso'}`);
    }
  };

  // Guardar columna (crear o editar)
  const handleSaveColumna = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardDetail || !formColNombre.trim()) return;
    try {
      if (showColModal?.mode === 'create') {
        await createColumna(
          boardDetail.board.id,
          formColNombre,
          boardDetail.columnas.length
        );
      } else if (showColModal?.mode === 'edit' && showColModal.col) {
        await updateColumna(showColModal.col.id, formColNombre);
      }
      setShowColModal(null);
      setFormColNombre('');
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo guardar la columna'}`);
    }
  };

  // Eliminar columna
  const handleDeleteColumna = async (colId: string) => {
    if (!boardDetail) return;
    if (!confirm('¿Confirma eliminar esta columna y todas sus tarjetas?')) return;
    try {
      await deleteColumna(colId);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo eliminar la columna'}`);
    }
  };

  // Abrir modal de tarjeta para crear o ver
  const openCardModal = (mode: 'create' | 'view', colId?: string, tarjeta?: TableroTarjeta) => {
    if (mode === 'create') {
      setCardTitulo('');
      setCardDesc('');
      setCardTipo('nota_rapida');
      setCardColor('blanco');
      setCardColumnaId(colId || (boardDetail?.columnas[0]?.id ?? ''));
      setCardMetadata({});
      setNewChecklistText('');
      setNewCommentText('');
      setShowCardModal({ mode: 'create', columnaId: colId });
    } else if (tarjeta) {
      setCardTitulo(tarjeta.titulo);
      setCardDesc(tarjeta.descripcion || '');
      setCardTipo(tarjeta.tipo_contenido);
      setCardColor(tarjeta.color);
      setCardColumnaId(tarjeta.columna_id);
      setCardMetadata(tarjeta.metadata || {});
      setNewChecklistText('');
      setNewCommentText('');
      setShowCardModal({ mode: 'view', tarjeta });
    }
  };

  // Buscar pedidos para referencia
  const handleSearchPedidosRef = async (q: string) => {
    setPedidoSearch(q);
    try {
      const list = await fetchPedidosReferences(q);
      setPedidosRefs(list);
    } catch {
      setPedidosRefs([]);
    }
  };

  // Guardar tarjeta
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardDetail || !cardTitulo.trim()) return;

    try {
      if (showCardModal?.mode === 'create') {
        await createTarjeta({
          tableroId: boardDetail.board.id,
          columnaId: cardColumnaId || showCardModal.columnaId!,
          titulo: cardTitulo,
          descripcion: cardDesc,
          tipoContenido: cardTipo,
          metadata: cardMetadata,
          color: cardColor,
          orden: boardDetail.tarjetas.filter((t) => t.columna_id === cardColumnaId).length,
        });
      } else if (showCardModal?.mode === 'view' && showCardModal.tarjeta) {
        // Si cambió de columna
        if (cardColumnaId !== showCardModal.tarjeta.columna_id) {
          await moveTarjeta(showCardModal.tarjeta.id, cardColumnaId, 0);
        }
        await updateTarjeta(showCardModal.tarjeta.id, {
          titulo: cardTitulo,
          descripcion: cardDesc,
          tipoContenido: cardTipo,
          metadata: cardMetadata,
          color: cardColor,
        });
      }
      setShowCardModal(null);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo guardar la tarjeta'}`);
    }
  };

  // Eliminar tarjeta
  const handleDeleteCard = async () => {
    if (!boardDetail || !showCardModal?.tarjeta) return;
    if (!confirm('¿Confirma eliminar esta tarjeta?')) return;
    try {
      await deleteTarjeta(showCardModal.tarjeta.id);
      setShowCardModal(null);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo eliminar la tarjeta'}`);
    }
  };

  // Toggle checklist item
  const handleToggleChecklist = async (chkId: string, current: boolean) => {
    try {
      await toggleChecklistItem(chkId, !current);
      if (boardDetail) await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo actualizar la tarea'}`);
    }
  };

  // Agregar checklist item
  const handleAddChecklistItem = async () => {
    if (!boardDetail || !showCardModal?.tarjeta || !newChecklistText.trim()) return;
    try {
      await addChecklistItem(
        boardDetail.board.id,
        showCardModal.tarjeta.id,
        newChecklistText,
        showCardModal.tarjeta.checklists?.length || 0
      );
      setNewChecklistText('');
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo agregar la tarea'}`);
    }
  };

  // Eliminar checklist item
  const handleDeleteChecklistItem = async (chkId: string) => {
    if (!boardDetail) return;
    try {
      await deleteChecklistItem(chkId);
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo eliminar la tarea'}`);
    }
  };

  // Agregar comentario
  const handleAddComment = async () => {
    if (!boardDetail || !showCardModal?.tarjeta || !newCommentText.trim()) return;
    try {
      await addTarjetaComentario(
        boardDetail.board.id,
        showCardModal.tarjeta.id,
        newCommentText
      );
      setNewCommentText('');
      await loadDetail(boardDetail.board.id);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo agregar el comentario'}`);
    }
  };

  // DRAG & DROP: Columnas
  const handleDragStartCol = (e: React.DragEvent, colId: string) => {
    if (!boardDetail?.canEdit) return;
    draggedColIdRef.current = colId;
    e.dataTransfer.setData('text/plain', `col:${colId}`);
  };

  const handleDropCol = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!boardDetail?.canEdit || !draggedColIdRef.current) return;
    const sourceColId = draggedColIdRef.current;
    if (sourceColId === targetColId) return;

    const cols = [...boardDetail.columnas];
    const sourceIndex = cols.findIndex((c) => c.id === sourceColId);
    const targetIndex = cols.findIndex((c) => c.id === targetColId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = cols.splice(sourceIndex, 1);
    cols.splice(targetIndex, 0, moved);

    // Actualizar UI optimistamente
    setBoardDetail({ ...boardDetail, columnas: cols });
    draggedColIdRef.current = null;

    try {
      await reorderColumnas(boardDetail.board.id, cols.map((c) => c.id));
    } catch {
      await loadDetail(boardDetail.board.id);
    }
  };

  // DRAG & DROP: Tarjetas
  const handleDragStartCard = (e: React.DragEvent, cardId: string, colId: string) => {
    if (!boardDetail?.canEdit) return;
    draggedCardRef.current = { cardId, sourceColId: colId };
    e.dataTransfer.setData('text/plain', `card:${cardId}`);
  };

  const handleDragOverCol = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDropCardOnCol = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    setDragOverColId(null);
    if (!boardDetail?.canEdit || !draggedCardRef.current) return;
    const { cardId, sourceColId } = draggedCardRef.current;
    draggedCardRef.current = null;

    if (sourceColId === targetColId) return;

    // Actualizar optimista en UI
    const tarjetas = boardDetail.tarjetas.map((t) =>
      t.id === cardId ? { ...t, columna_id: targetColId } : t
    );
    setBoardDetail({ ...boardDetail, tarjetas });

    try {
      await moveTarjeta(cardId, targetColId, 0);
      await loadDetail(boardDetail.board.id);
    } catch {
      await loadDetail(boardDetail.board.id);
    }
  };

  // Bloqueo estricto PoLP para Observador
  if (isObserver) {
    return (
      <div className="tableros-container" style={{ padding: '2rem 1rem' }}>
        <div className="pedidos-card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>Acceso Restringido</h2>
          <p style={{ color: 'var(--pedidos-text-muted)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            El rol <strong>Observador</strong> no participa en el módulo de <strong>Tableros Privados</strong>. Esta sección es de uso exclusivo para equipos operativos y administradores autorizados.
          </p>
          <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={() => navigate('/gestion')}>
            Volver a Gestión de Pedidos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tableros-container">
      {/* Barra de navegación superior de tableros */}
      <div className="tableros-nav-bar">
        <div className="tableros-select-group">
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--pedidos-text-muted)' }}>
            Tablero activo:
          </label>
          <select
            className="tableros-select"
            value={selectedTableroId || ''}
            onChange={(e) => setSelectedTableroId(e.target.value)}
            disabled={tableros.length === 0}
          >
            {tableros.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo} {t.mi_rol === 'propietario' ? '👑 (Mío)' : t.mi_rol === 'edicion' ? '✏️ (Editor)' : '👁️ (Lectura)'}
              </option>
            ))}
            {tableros.length === 0 && <option value="">Sin tableros disponibles</option>}
          </select>

          <button
            type="button"
            className="pedidos-btn pedidos-btn-primary pedidos-btn-sm"
            onClick={() => {
              setFormTitulo('');
              setFormDesc('');
              setFormColor('azul');
              setShowCreateModal(true);
            }}
          >
            + Nuevo Tablero
          </button>
        </div>

        {/* Buscador de tarjetas en tableros autorizados */}
        <div className="tableros-search-box">
          <input
            type="text"
            className="tableros-search-input"
            placeholder="🔍 Buscar tarjetas..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {isSearching && (
            <span style={{ position: 'absolute', right: '0.65rem', fontSize: '0.8rem', pointerEvents: 'none' }}>⏳</span>
          )}
          {searchResults.length > 0 && (
            <div className="tableros-search-results-popover">
              <div style={{ padding: '0.5rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--pedidos-text-muted)', borderBottom: '1px solid var(--pedidos-border-subtle)' }}>
                Resultados encontrados ({searchResults.length})
              </div>
              {searchResults.map((res) => (
                <div
                  key={res.id}
                  className="tableros-search-item"
                  onClick={() => {
                    setSelectedTableroId(res.tablero_id);
                    setSearchQuery('');
                    setSearchResults([]);
                    // Abrir tarjeta si coincide tablero
                    const card = boardDetail?.tarjetas.find((t) => t.id === res.id);
                    if (card) openCardModal('view', undefined, card);
                  }}
                >
                  <div className="tableros-search-item-title">{res.titulo}</div>
                  <div className="tableros-search-item-meta">
                    Tablero: <strong>{res.tablero_titulo}</strong> • Columna: {res.columna_nombre}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {detailLoading && (
        <div style={{ fontSize: '0.8rem', color: 'var(--pedidos-text-muted)', padding: '0.25rem 0' }}>
          Sincronizando tablero en tiempo real...
        </div>
      )}

      {/* Header del tablero activo */}
      {boardDetail ? (
        <div className="tableros-header">
          <div className="tableros-header-left">
            <div className="tableros-header-title-row">
              <h1 className="tableros-header-title">{boardDetail.board.titulo}</h1>
              {boardDetail.board.mi_rol && (
                <span className={`tablero-role-badge ${boardDetail.board.mi_rol}`}>
                  {boardDetail.board.mi_rol === 'propietario' && '👑 Propietario'}
                  {boardDetail.board.mi_rol === 'edicion' && '✏️ Puede editar'}
                  {boardDetail.board.mi_rol === 'lectura' && '👁️ Solo lectura'}
                  {boardDetail.board.mi_rol === 'admin_global' && '🛡️ Vista Global Admin (Lectura)'}
                </span>
              )}
            </div>
            {boardDetail.board.descripcion && (
              <p className="tableros-header-desc">{boardDetail.board.descripcion}</p>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted)', marginTop: '0.2rem' }}>
              Propietario: {boardDetail.board.propietario?.nombre} {boardDetail.board.propietario?.apellido} • Miembros: {boardDetail.miembros.length + 1}
            </div>
          </div>

          <div className="tableros-header-actions">
            {boardDetail.canEdit && (
              <button
                type="button"
                className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                onClick={() => {
                  setFormColNombre('');
                  setShowColModal({ mode: 'create' });
                }}
              >
                + Columna
              </button>
            )}

            {boardDetail.isOwner && (
              <>
                <button
                  type="button"
                  className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                  onClick={openShareModal}
                >
                  👥 Compartir ({boardDetail.miembros.length})
                </button>

                <button
                  type="button"
                  className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                  onClick={() => {
                    setFormTitulo(boardDetail.board.titulo);
                    setFormDesc(boardDetail.board.descripcion || '');
                    setFormColor(boardDetail.board.color);
                    setShowEditModal(true);
                  }}
                >
                  ✏️ Editar
                </button>

                <button
                  type="button"
                  className="pedidos-btn pedidos-btn-danger pedidos-btn-sm"
                  onClick={() => setShowDeleteModal(true)}
                >
                  🗑️ Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pedidos-text-muted)' }}>
          Cargando tableros...
        </div>
      ) : (
        <div className="pedidos-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No tienes tableros privados aún</h3>
          <p style={{ color: 'var(--pedidos-text-muted)', marginBottom: '1.5rem', maxWidth: '460px', margin: '0 auto 1.5rem auto' }}>
            Crea tu primer tablero privado colaborativo para organizar tareas, notas rápidas, contactos y recordatorios con tu equipo.
          </p>
          <button
            type="button"
            className="pedidos-btn pedidos-btn-primary"
            onClick={() => {
              setFormTitulo('');
              setFormDesc('');
              setFormColor('azul');
              setShowCreateModal(true);
            }}
          >
            + Crear Primer Tablero
          </button>
        </div>
      )}

      {/* Canvas Kanban del tablero */}
      {boardDetail && (
        <div className="tablero-canvas">
          {boardDetail.columnas.map((col) => {
            const cardsInCol = boardDetail.tarjetas.filter((t) => t.columna_id === col.id);

            return (
              <div
                key={col.id}
                className="tablero-columna"
                onDragOver={(e) => handleDragOverCol(e, col.id)}
                onDrop={(e) => handleDropCardOnCol(e, col.id)}
              >
                {/* Header de columna */}
                <div
                  className="tablero-columna-header"
                  draggable={boardDetail.canEdit}
                  onDragStart={(e) => handleDragStartCol(e, col.id)}
                  onDrop={(e) => handleDropCol(e, col.id)}
                >
                  <div className="tablero-columna-title-wrap">
                    {boardDetail.canEdit && <span className="tablero-columna-grip" title="Arrastrar columna">⠿</span>}
                    <h3 className="tablero-columna-title">{col.nombre}</h3>
                    <span className="tablero-columna-count">{cardsInCol.length}</span>
                  </div>

                  {boardDetail.canEdit && (
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <button
                        type="button"
                        className="pedidos-btn pedidos-btn-sm"
                        style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setFormColNombre(col.nombre);
                          setShowColModal({ mode: 'edit', col });
                        }}
                        title="Renombrar columna"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="pedidos-btn pedidos-btn-sm"
                        style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', color: 'var(--pedidos-brand-danger)' }}
                        onClick={() => handleDeleteColumna(col.id)}
                        title="Eliminar columna"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Zona de tarjetas */}
                <div className={`tablero-columna-cards ${dragOverColId === col.id ? 'drag-over' : ''}`}>
                  {cardsInCol.map((card) => {
                    const completedChk = (card.checklists || []).filter((c) => c.completado).length;
                    const totalChk = (card.checklists || []).length;
                    const commentsCount = (card.comentarios || []).length;

                    return (
                      <div
                        key={card.id}
                        className={`tablero-card color-${card.color || 'blanco'}`}
                        draggable={boardDetail.canEdit}
                        onDragStart={(e) => handleDragStartCard(e, card.id, col.id)}
                        onClick={() => openCardModal('view', undefined, card)}
                      >
                        {/* Etiqueta de tipo de contenido */}
                        <div className="tablero-card-type-tag">
                          {card.tipo_contenido === 'nota_rapida' && '📝 Nota rápida'}
                          {card.tipo_contenido === 'checklist' && '☑️ Checklist'}
                          {card.tipo_contenido === 'enlace' && '🔗 Enlace'}
                          {card.tipo_contenido === 'contacto' && '👤 Contacto'}
                          {card.tipo_contenido === 'recordatorio' && '⏰ Recordatorio'}
                          {card.tipo_contenido === 'pedido_ref' && '📦 Pedido'}
                          {card.tipo_contenido === 'documentacion' && '📄 Documentación'}
                        </div>

                        {/* Título */}
                        <h4 className="tablero-card-title">{card.titulo}</h4>

                        {/* Previsualización específica según tipo */}
                        {card.descripcion && (
                          <p className="tablero-card-preview-text">{card.descripcion}</p>
                        )}
                        {card.tipo_contenido === 'enlace' && card.metadata?.url && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-brand-accent)', textDecoration: 'underline' }}>
                            {card.metadata.etiqueta || card.metadata.url}
                          </div>
                        )}
                        {card.tipo_contenido === 'contacto' && (card.metadata?.telefono || card.metadata?.email) && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted)' }}>
                            {card.metadata.nombre && <span>{card.metadata.nombre} • </span>}
                            {card.metadata.telefono && <span>📞 {card.metadata.telefono} </span>}
                          </div>
                        )}
                        {card.tipo_contenido === 'recordatorio' && card.metadata?.fecha_limite && (
                          <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                            📅 {card.metadata.fecha_limite}
                          </div>
                        )}
                        {card.tipo_contenido === 'pedido_ref' && card.metadata?.numero_identificador && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-brand-primary)', fontWeight: 700 }}>
                            Ref: {card.metadata.numero_identificador}
                          </div>
                        )}

                        {/* Footer de tarjeta con conteos */}
                        {(totalChk > 0 || commentsCount > 0) && (
                          <div className="tablero-card-footer">
                            <div className="tablero-card-meta-chips">
                              {totalChk > 0 && (
                                <span style={{ color: completedChk === totalChk ? 'var(--pedidos-brand-success)' : 'inherit' }}>
                                  ☑️ {completedChk}/{totalChk}
                                </span>
                              )}
                              {commentsCount > 0 && <span>💬 {commentsCount}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer de columna */}
                {boardDetail.canEdit && (
                  <div className="tablero-columna-footer">
                    <button
                      type="button"
                      className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => openCardModal('create', col.id)}
                    >
                      + Añadir tarjeta
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Crear Tablero */}
      {showCreateModal && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '480px' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">Nuevo Tablero Privado</h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateBoard}>
              <div className="pedidos-modal-body tablero-modal-body">
                <div className="tablero-field">
                  <label>Título del Tablero *</label>
                  <input
                    type="text"
                    className="pedidos-input"
                    placeholder="Ej: Campaña Prensa Verano 2026"
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    required
                  />
                </div>
                <div className="tablero-field">
                  <label>Descripción / Objetivo</label>
                  <textarea
                    className="pedidos-textarea"
                    placeholder="Detalle opcional de la planificación o temas de este tablero"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="tablero-field">
                  <label>Color Identificador</label>
                  <select className="pedidos-select" value={formColor} onChange={(e) => setFormColor(e.target.value)}>
                    <option value="azul">Azul</option>
                    <option value="verde">Verde</option>
                    <option value="rojo">Rojo</option>
                    <option value="ambar">Ámbar</option>
                    <option value="morado">Morado</option>
                    <option value="gris">Gris</option>
                    <option value="cyan">Cyan</option>
                    <option value="esmeralda">Esmeralda</option>
                  </select>
                </div>
              </div>
              <div className="pedidos-modal-footer">
                <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="pedidos-btn pedidos-btn-primary">Crear Tablero</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar Tablero */}
      {showEditModal && boardDetail && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '480px' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">Editar Tablero</h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEditBoard}>
              <div className="pedidos-modal-body tablero-modal-body">
                <div className="tablero-field">
                  <label>Título *</label>
                  <input
                    type="text"
                    className="pedidos-input"
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    required
                  />
                </div>
                <div className="tablero-field">
                  <label>Descripción</label>
                  <textarea
                    className="pedidos-textarea"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="tablero-field">
                  <label>Color</label>
                  <select className="pedidos-select" value={formColor} onChange={(e) => setFormColor(e.target.value)}>
                    <option value="azul">Azul</option>
                    <option value="verde">Verde</option>
                    <option value="rojo">Rojo</option>
                    <option value="ambar">Ámbar</option>
                    <option value="morado">Morado</option>
                    <option value="gris">Gris</option>
                    <option value="cyan">Cyan</option>
                    <option value="esmeralda">Esmeralda</option>
                  </select>
                </div>
              </div>
              <div className="pedidos-modal-footer">
                <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button type="submit" className="pedidos-btn pedidos-btn-primary">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Eliminar Tablero */}
      {showDeleteModal && boardDetail && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '440px' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">Eliminar Tablero</h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowDeleteModal(false)}>✕</button>
            </div>
            <div className="pedidos-modal-body" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, color: 'var(--pedidos-text-primary)' }}>
                ¿Estás seguro de que deseas eliminar permanentemente el tablero <strong>{boardDetail.board.titulo}</strong>?
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--pedidos-brand-danger)', marginTop: '0.5rem' }}>
                Se eliminarán todas sus columnas, tarjetas, checklists y comentarios asociados. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="pedidos-modal-footer">
              <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
              <button type="button" className="pedidos-btn pedidos-btn-danger" onClick={handleDeleteBoard}>Confirmar y Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Compartir y Permisos */}
      {showShareModal && boardDetail && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '540px' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">Compartir Tablero</h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowShareModal(false)}>✕</button>
            </div>
            <div className="pedidos-modal-body tablero-modal-body">
              {/* Invitar nuevo */}
              <div style={{ background: 'var(--pedidos-surface-sunken)', padding: '0.85rem', borderRadius: '0.375rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Invitar colaborador del equipo:</span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    className="pedidos-select"
                    style={{ flex: 1, minWidth: '180px' }}
                    value={selectedCollabId}
                    onChange={(e) => setSelectedCollabId(e.target.value)}
                  >
                    {collaborators.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.nombre} {c.apellido} ({c.app_role})
                      </option>
                    ))}
                    {collaborators.length === 0 && <option value="">Sin colaboradores disponibles</option>}
                  </select>

                  <select
                    className="pedidos-select"
                    style={{ width: '130px' }}
                    value={selectedCollabRole}
                    onChange={(e) => setSelectedCollabRole(e.target.value as any)}
                  >
                    <option value="lectura">Solo lectura</option>
                    <option value="edicion">Puede editar</option>
                  </select>

                  <button
                    type="button"
                    className="pedidos-btn pedidos-btn-primary pedidos-btn-sm"
                    onClick={handleInviteMember}
                    disabled={!selectedCollabId || collabLoading}
                  >
                    Invitar
                  </button>
                </div>
              </div>

              {/* Lista de miembros existentes */}
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                  Miembros con acceso ({boardDetail.miembros.length + 1}):
                </span>
                <div className="tablero-members-list">
                  {/* Propietario */}
                  <div className="tablero-member-row">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {boardDetail.board.propietario?.nombre} {boardDetail.board.propietario?.apellido} (Tú)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted)' }}>Propietario del tablero</div>
                    </div>
                    <span className="tablero-role-badge propietario">👑 Propietario</span>
                  </div>

                  {/* Invitados */}
                  {boardDetail.miembros.map((m: any) => (
                    <div key={m.id} className="tablero-member-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {m.usuario?.nombre} {m.usuario?.apellido} (@{m.usuario?.nombre_usuario})
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--pedidos-text-muted)' }}>Rol del sistema: {m.usuario?.app_role}</div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select
                          className="pedidos-select pedidos-btn-sm"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          value={m.rol_tablero}
                          onChange={(e) => handleUpdateMemberRole(m.user_id, e.target.value as any)}
                        >
                          <option value="lectura">Solo lectura</option>
                          <option value="edicion">Puede editar</option>
                        </select>

                        <button
                          type="button"
                          className="pedidos-btn pedidos-btn-sm"
                          style={{ color: 'var(--pedidos-brand-danger)', padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                          onClick={() => handleRevokeMember(m.user_id)}
                          title="Revocar acceso"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="pedidos-modal-footer">
              <button type="button" className="pedidos-btn pedidos-btn-primary" onClick={() => setShowShareModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Columna (Crear / Renombrar) */}
      {showColModal && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '400px' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">
                {showColModal.mode === 'create' ? 'Nueva Columna' : 'Renombrar Columna'}
              </h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowColModal(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveColumna}>
              <div className="pedidos-modal-body" style={{ padding: '1rem' }}>
                <div className="tablero-field">
                  <label>Nombre de la Columna *</label>
                  <input
                    type="text"
                    className="pedidos-input"
                    placeholder="Ej: En revisión, Prioridad alta, Bloqueado..."
                    value={formColNombre}
                    onChange={(e) => setFormColNombre(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="pedidos-modal-footer">
                <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={() => setShowColModal(null)}>Cancelar</button>
                <button type="submit" className="pedidos-btn pedidos-btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tarjeta (Crear / Ver / Editar) */}
      {showCardModal && boardDetail && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-container" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="pedidos-modal-header">
              <h3 className="pedidos-modal-title">
                {showCardModal.mode === 'create' ? 'Nueva Tarjeta' : 'Detalle de Tarjeta'}
              </h3>
              <button type="button" className="pedidos-modal-close" onClick={() => setShowCardModal(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveCard}>
              <div className="pedidos-modal-body tablero-modal-body">
                {/* Título de Tarjeta */}
                <div className="tablero-field">
                  <label>Título *</label>
                  <input
                    type="text"
                    className="pedidos-input"
                    placeholder="Título descriptivo de la tarjeta"
                    value={cardTitulo}
                    onChange={(e) => setCardTitulo(e.target.value)}
                    disabled={!boardDetail.canEdit}
                    required
                  />
                </div>

                {/* Columna & Color & Tipo */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  <div className="tablero-field">
                    <label>Columna</label>
                    <select
                      className="pedidos-select"
                      value={cardColumnaId}
                      onChange={(e) => setCardColumnaId(e.target.value)}
                      disabled={!boardDetail.canEdit}
                    >
                      {boardDetail.columnas.map((col) => (
                        <option key={col.id} value={col.id}>{col.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div className="tablero-field">
                    <label>Tipo de Contenido</label>
                    <select
                      className="pedidos-select"
                      value={cardTipo}
                      onChange={(e) => setCardTipo(e.target.value as any)}
                      disabled={!boardDetail.canEdit}
                    >
                      <option value="nota_rapida">📝 Nota rápida</option>
                      <option value="checklist">☑️ Checklist colaborativo</option>
                      <option value="enlace">🔗 Enlace</option>
                      <option value="contacto">👤 Contacto</option>
                      <option value="recordatorio">⏰ Recordatorio</option>
                      <option value="pedido_ref">📦 Referencia a Pedido</option>
                      <option value="documentacion">📄 Documentación interna</option>
                    </select>
                  </div>

                  <div className="tablero-field">
                    <label>Color</label>
                    <select
                      className="pedidos-select"
                      value={cardColor}
                      onChange={(e) => setCardColor(e.target.value)}
                      disabled={!boardDetail.canEdit}
                    >
                      <option value="blanco">Gris / Estándar</option>
                      <option value="azul">Azul</option>
                      <option value="verde">Verde</option>
                      <option value="rojo">Rojo</option>
                      <option value="ambar">Ámbar</option>
                      <option value="morado">Morado</option>
                      <option value="cyan">Cyan</option>
                    </select>
                  </div>
                </div>

                {/* Aviso de seguridad sobre contraseñas */}
                <div className="tablero-security-tip">
                  <span>🔐</span>
                  <div>
                    <strong>Pauta de Seguridad:</strong> No almacenes contraseñas en texto plano. Para compartir credenciales o accesos, utiliza referencias al gestor seguro institucional (Bitwarden / Vault).
                  </div>
                </div>

                {/* Campos específicos por Tipo de Contenido */}
                {cardTipo === 'enlace' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="tablero-field">
                      <label>URL del Enlace</label>
                      <input
                        type="url"
                        className="pedidos-input"
                        placeholder="https://..."
                        value={cardMetadata.url || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, url: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    <div className="tablero-field">
                      <label>Texto del Enlace</label>
                      <input
                        type="text"
                        className="pedidos-input"
                        placeholder="Ej: Carpeta de Producción Drive"
                        value={cardMetadata.etiqueta || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, etiqueta: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    {cardMetadata.url && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <a href={cardMetadata.url} target="_blank" rel="noopener noreferrer" className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm">
                          ↗️ Abrir enlace externo
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {cardTipo === 'contacto' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div className="tablero-field">
                      <label>Nombre</label>
                      <input
                        type="text"
                        className="pedidos-input"
                        placeholder="Ej: María González"
                        value={cardMetadata.nombre || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, nombre: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    <div className="tablero-field">
                      <label>Teléfono</label>
                      <input
                        type="tel"
                        className="pedidos-input"
                        placeholder="+54 2901 ..."
                        value={cardMetadata.telefono || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, telefono: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    <div className="tablero-field">
                      <label>Email</label>
                      <input
                        type="email"
                        className="pedidos-input"
                        placeholder="correo@..."
                        value={cardMetadata.email || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, email: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                  </div>
                )}

                {cardTipo === 'recordatorio' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="tablero-field">
                      <label>Fecha Límite</label>
                      <input
                        type="date"
                        className="pedidos-input"
                        value={cardMetadata.fecha_limite || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, fecha_limite: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    <div className="tablero-field">
                      <label>Detalle del Recordatorio</label>
                      <input
                        type="text"
                        className="pedidos-input"
                        placeholder="Ej: Salir a cobertura antes de las 14:00"
                        value={cardMetadata.nota_recordatorio || ''}
                        onChange={(e) => setCardMetadata({ ...cardMetadata, nota_recordatorio: e.target.value })}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                  </div>
                )}

                {cardTipo === 'pedido_ref' && (
                  <div className="tablero-field">
                    <label>Asociar a un Pedido Existente</label>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        className="pedidos-input"
                        placeholder="Buscar por PED-... o título de pedido"
                        value={pedidoSearch}
                        onChange={(e) => handleSearchPedidosRef(e.target.value)}
                        disabled={!boardDetail.canEdit}
                      />
                    </div>
                    {pedidosRefs.length > 0 && (
                      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--pedidos-border-default)', borderRadius: '0.375rem' }}>
                        {pedidosRefs.map((p) => (
                          <div
                            key={p.id}
                            style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--pedidos-border-subtle)', cursor: 'pointer', fontSize: '0.85rem' }}
                            onClick={() => {
                              setCardMetadata({
                                ...cardMetadata,
                                pedido_id: p.id,
                                numero_identificador: p.numero_identificador,
                                titulo_pedido: p.titulo,
                              });
                              setPedidosRefs([]);
                            }}
                          >
                            <strong>{p.numero_identificador}</strong> — {p.titulo} ({p.estado})
                          </div>
                        ))}
                      </div>
                    )}
                    {cardMetadata.pedido_id && (
                      <div style={{ background: 'var(--pedidos-surface-sunken)', padding: '0.65rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <strong>{cardMetadata.numero_identificador}</strong>: {cardMetadata.titulo_pedido}
                        </div>
                        <Link to={`/gestion/pedido/${cardMetadata.pedido_id}`} className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm" target="_blank">
                          Ver pedido ↗
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Descripción / Notas */}
                <div className="tablero-field">
                  <label>{cardTipo === 'documentacion' ? 'Contenido de Documentación' : 'Descripción / Notas'}</label>
                  <textarea
                    className="pedidos-textarea"
                    placeholder="Escribe detalles, especificaciones o notas aquí..."
                    value={cardDesc}
                    onChange={(e) => setCardDesc(e.target.value)}
                    rows={4}
                    disabled={!boardDetail.canEdit}
                  />
                </div>

                {/* Checklist colaborativo (si ya fue creada la tarjeta) */}
                {showCardModal.mode === 'view' && showCardModal.tarjeta && (
                  <div className="tablero-checklist-container">
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      Checklist colaborativo ({(showCardModal.tarjeta.checklists || []).filter((c) => c.completado).length}/{(showCardModal.tarjeta.checklists || []).length}):
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {(showCardModal.tarjeta.checklists || []).map((chk) => (
                        <div key={chk.id} className="tablero-checklist-item">
                          <label className={`tablero-checklist-label ${chk.completado ? 'completado' : ''}`}>
                            <input
                              type="checkbox"
                              checked={chk.completado}
                              onChange={() => handleToggleChecklist(chk.id, chk.completado)}
                              disabled={!boardDetail.canEdit}
                            />
                            <span>{chk.texto}</span>
                          </label>

                          {boardDetail.canEdit && (
                            <button
                              type="button"
                              className="pedidos-btn pedidos-btn-sm"
                              style={{ color: 'var(--pedidos-brand-danger)', padding: '0.1rem 0.35rem', fontSize: '0.75rem' }}
                              onClick={() => handleDeleteChecklistItem(chk.id)}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {boardDetail.canEdit && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                        <input
                          type="text"
                          className="pedidos-input"
                          placeholder="Nueva tarea de checklist..."
                          value={newChecklistText}
                          onChange={(e) => setNewChecklistText(e.target.value)}
                        />
                        <button
                          type="button"
                          className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                          onClick={handleAddChecklistItem}
                          disabled={!newChecklistText.trim()}
                        >
                          + Agregar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Comentarios por tarjeta (si ya fue creada la tarjeta) */}
                {showCardModal.mode === 'view' && showCardModal.tarjeta && (
                  <div className="tablero-comments-section">
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      Comentarios ({showCardModal.tarjeta.comentarios?.length || 0}):
                    </span>

                    <div className="tablero-comment-list">
                      {(showCardModal.tarjeta.comentarios || []).map((com) => (
                        <div key={com.id} className="tablero-comment-bubble">
                          <div className="tablero-comment-header">
                            <span>{com.autor?.nombre} {com.autor?.apellido}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--pedidos-text-muted)' }}>
                              {new Date(com.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="tablero-comment-text">{com.contenido}</p>
                        </div>
                      ))}
                      {(showCardModal.tarjeta.comentarios || []).length === 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--pedidos-text-muted)' }}>
                          Sin comentarios aún.
                        </div>
                      )}
                    </div>

                    {boardDetail.canEdit && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <textarea
                          className="pedidos-textarea"
                          placeholder="Escribe un comentario..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          rows={2}
                        />
                        <button
                          type="button"
                          className="pedidos-btn pedidos-btn-secondary pedidos-btn-sm"
                          style={{ alignSelf: 'flex-end' }}
                          onClick={handleAddComment}
                          disabled={!newCommentText.trim()}
                        >
                          Publicar Comentario
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pedidos-modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  {showCardModal.mode === 'view' && boardDetail.canEdit && (
                    <button
                      type="button"
                      className="pedidos-btn pedidos-btn-danger pedidos-btn-sm"
                      onClick={handleDeleteCard}
                    >
                      🗑️ Eliminar tarjeta
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="pedidos-btn pedidos-btn-secondary" onClick={() => setShowCardModal(null)}>
                    {boardDetail.canEdit ? 'Cancelar' : 'Cerrar'}
                  </button>
                  {boardDetail.canEdit && (
                    <button type="submit" className="pedidos-btn pedidos-btn-primary">
                      {showCardModal.mode === 'create' ? 'Crear Tarjeta' : 'Guardar Cambios'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
