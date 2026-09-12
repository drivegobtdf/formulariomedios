-- ==============================================================================
-- MIGRATION 007: Indexes, Triggers and RLS Fail-Closed
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Triggers automáticos para updated_at
CREATE TRIGGER trg_pedidos_updated_at
    BEFORE UPDATE ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_pedido_sequences_updated_at
    BEFORE UPDATE ON public.pedido_sequences
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_usuarios_acceso_updated_at
    BEFORE UPDATE ON public.usuarios_acceso
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Índices para optimización de consultas operativas
-- Pedidos
CREATE INDEX idx_pedidos_envio_id ON public.pedidos(envio_id);
CREATE INDEX idx_pedidos_estado_created ON public.pedidos(estado, created_at);
CREATE INDEX idx_pedidos_responsable_estado ON public.pedidos(responsable_user_id, estado);
CREATE INDEX idx_pedidos_categoria_estado ON public.pedidos(categoria_id, estado);
CREATE INDEX idx_pedidos_tipo_servicio ON public.pedidos(tipo_servicio_id);
CREATE INDEX idx_pedidos_archivado ON public.pedidos(archivado_at) WHERE archivado_at IS NOT NULL;
CREATE INDEX idx_pedidos_fecha_limite ON public.pedidos(fecha_limite) WHERE fecha_limite IS NOT NULL;

-- Asignaciones
CREATE INDEX idx_pedido_asignaciones_pedido ON public.pedido_asignaciones(pedido_id, created_at DESC);
CREATE INDEX idx_pedido_asignaciones_nuevo ON public.pedido_asignaciones(responsable_nuevo);

-- Solicitudes de Información
CREATE INDEX idx_solicitudes_info_pedido ON public.solicitudes_informacion(pedido_id, estado);
CREATE INDEX idx_solicitudes_info_expires ON public.solicitudes_informacion(expires_at) WHERE estado = 'pendiente';

-- Relaciones N:M de Archivos y Enlaces
CREATE INDEX idx_archivo_pedido_pedido ON public.archivo_pedido(pedido_id);
CREATE INDEX idx_enlace_pedido_pedido ON public.enlace_pedido(pedido_id);

-- Notas y Entregas
CREATE INDEX idx_notas_pedido_pedido ON public.notas_pedido(pedido_id, created_at DESC);
CREATE INDEX idx_entregas_pedido_pedido ON public.entregas_pedido(pedido_id, version DESC);

-- Eventos, Comunicaciones y Auditoría
CREATE INDEX idx_domain_events_aggregate ON public.domain_events(aggregate_type, aggregate_id, created_at DESC);
CREATE INDEX idx_comunicaciones_estado ON public.comunicaciones_pedido(estado, created_at);
CREATE INDEX idx_comunicaciones_pedido ON public.comunicaciones_pedido(pedido_id);
CREATE INDEX idx_audit_log_recurso ON public.audit_log(recurso_tipo, recurso_id, created_at DESC);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_user_id, created_at DESC);

-- 3. Habilitar Row Level Security (RLS) en todas las tablas de aplicación (Fail-Closed)
ALTER TABLE public.categorias_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envios_formulario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_informacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivo_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enlaces_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enlace_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicaciones_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
