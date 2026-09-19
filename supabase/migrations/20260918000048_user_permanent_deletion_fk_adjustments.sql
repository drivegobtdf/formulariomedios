-- ==============================================================================
-- MIGRATION 048: User Permanent Deletion FK Adjustments & Integrity
-- Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
-- ==============================================================================

-- 1. Ajustar claves foráneas de public.pedido_asignaciones para preservar historial
DO $$
BEGIN
    -- Responsable nuevo: permitir NULL y ON DELETE SET NULL
    ALTER TABLE public.pedido_asignaciones ALTER COLUMN responsable_nuevo DROP NOT NULL;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'pedido_asignaciones_responsable_nuevo_fkey' 
          AND table_name = 'pedido_asignaciones'
    ) THEN
        ALTER TABLE public.pedido_asignaciones DROP CONSTRAINT pedido_asignaciones_responsable_nuevo_fkey;
    END IF;
    
    ALTER TABLE public.pedido_asignaciones 
        ADD CONSTRAINT pedido_asignaciones_responsable_nuevo_fkey 
        FOREIGN KEY (responsable_nuevo) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- Asignado por: permitir NULL y ON DELETE SET NULL
    ALTER TABLE public.pedido_asignaciones ALTER COLUMN asignado_por DROP NOT NULL;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'pedido_asignaciones_asignado_por_fkey' 
          AND table_name = 'pedido_asignaciones'
    ) THEN
        ALTER TABLE public.pedido_asignaciones DROP CONSTRAINT pedido_asignaciones_asignado_por_fkey;
    END IF;
    
    ALTER TABLE public.pedido_asignaciones 
        ADD CONSTRAINT pedido_asignaciones_asignado_por_fkey 
        FOREIGN KEY (asignado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;

-- 2. Ajustar claves foráneas de public.solicitudes_informacion para preservar solicitudes
DO $$
BEGIN
    ALTER TABLE public.solicitudes_informacion ALTER COLUMN solicitada_por DROP NOT NULL;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'solicitudes_informacion_solicitada_por_fkey' 
          AND table_name = 'solicitudes_informacion'
    ) THEN
        ALTER TABLE public.solicitudes_informacion DROP CONSTRAINT solicitudes_informacion_solicitada_por_fkey;
    END IF;
    
    ALTER TABLE public.solicitudes_informacion 
        ADD CONSTRAINT solicitudes_informacion_solicitada_por_fkey 
        FOREIGN KEY (solicitada_por) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;

-- 3. Ajustar claves foráneas de public.notas_pedido para preservar notas
DO $$
BEGIN
    ALTER TABLE public.notas_pedido ALTER COLUMN autor_user_id DROP NOT NULL;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notas_pedido_autor_user_id_fkey' 
          AND table_name = 'notas_pedido'
    ) THEN
        ALTER TABLE public.notas_pedido DROP CONSTRAINT notas_pedido_autor_user_id_fkey;
    END IF;
    
    ALTER TABLE public.notas_pedido 
        ADD CONSTRAINT notas_pedido_autor_user_id_fkey 
        FOREIGN KEY (autor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;

-- 4. Ajustar claves foráneas de public.entregas_pedido para preservar entregas
DO $$
BEGIN
    ALTER TABLE public.entregas_pedido ALTER COLUMN entregado_por DROP NOT NULL;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'entregas_pedido_entregado_por_fkey' 
          AND table_name = 'entregas_pedido'
    ) THEN
        ALTER TABLE public.entregas_pedido DROP CONSTRAINT entregas_pedido_entregado_por_fkey;
    END IF;
    
    ALTER TABLE public.entregas_pedido 
        ADD CONSTRAINT entregas_pedido_entregado_por_fkey 
        FOREIGN KEY (entregado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;
