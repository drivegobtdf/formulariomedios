-- ============================================================================
-- MIGRATION: 20261019040000_fase_4b_checklist_and_etiquetas.sql
-- DESCRIPTION: FASE 4B - Checklist interno por pedido y etiquetas múltiples con colores
-- SAFEGUARDS:
--   - PoLP: Solicitante y anon bloqueados por RLS y revocación de permisos
--   - Admin y Equipo: lectura y edición completa
--   - Observador: únicamente lectura
--   - Preservación íntegra de pedidos.etiqueta_interna para retrocompatibilidad
--   - Backfill idempotente de etiquetas preexistentes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA: public.pedido_checklist_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  texto text NOT NULL,
  completado boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completado_at timestamptz NULL,
  CONSTRAINT check_checklist_texto CHECK (length(trim(texto)) > 0 AND length(texto) <= 500),
  CONSTRAINT check_checklist_orden CHECK (orden >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pedido_checklist_items_pedido_id_orden
  ON public.pedido_checklist_items(pedido_id, orden ASC, created_at ASC);

-- RLS para pedido_checklist_items
ALTER TABLE public.pedido_checklist_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pedido_checklist_items FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_checklist_items TO authenticated, service_role;

DROP POLICY IF EXISTS "pedido_checklist_select_operational" ON public.pedido_checklist_items;
CREATE POLICY "pedido_checklist_select_operational"
ON public.pedido_checklist_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo', 'observador')
  )
);

DROP POLICY IF EXISTS "pedido_checklist_insert_operational" ON public.pedido_checklist_items;
CREATE POLICY "pedido_checklist_insert_operational"
ON public.pedido_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

DROP POLICY IF EXISTS "pedido_checklist_update_operational" ON public.pedido_checklist_items;
CREATE POLICY "pedido_checklist_update_operational"
ON public.pedido_checklist_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

DROP POLICY IF EXISTS "pedido_checklist_delete_operational" ON public.pedido_checklist_items;
CREATE POLICY "pedido_checklist_delete_operational"
ON public.pedido_checklist_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

-- ----------------------------------------------------------------------------
-- 2. TABLA: public.pedido_etiquetas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  texto text NOT NULL,
  color text NOT NULL DEFAULT 'azul',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT check_etiqueta_texto CHECK (length(trim(texto)) > 0 AND length(texto) <= 30),
  CONSTRAINT check_etiqueta_color CHECK (color IN ('azul', 'verde', 'ambar', 'rojo', 'morado', 'rosa', 'indigo', 'gris'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_etiquetas_unique_pedido_texto
  ON public.pedido_etiquetas(pedido_id, (lower(trim(texto))));

CREATE INDEX IF NOT EXISTS idx_pedido_etiquetas_pedido_id
  ON public.pedido_etiquetas(pedido_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_pedido_etiquetas_texto
  ON public.pedido_etiquetas((lower(trim(texto))));

-- RLS para pedido_etiquetas
ALTER TABLE public.pedido_etiquetas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pedido_etiquetas FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_etiquetas TO authenticated, service_role;

DROP POLICY IF EXISTS "pedido_etiquetas_select_operational" ON public.pedido_etiquetas;
CREATE POLICY "pedido_etiquetas_select_operational"
ON public.pedido_etiquetas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo', 'observador')
  )
);

DROP POLICY IF EXISTS "pedido_etiquetas_insert_operational" ON public.pedido_etiquetas;
CREATE POLICY "pedido_etiquetas_insert_operational"
ON public.pedido_etiquetas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

DROP POLICY IF EXISTS "pedido_etiquetas_update_operational" ON public.pedido_etiquetas;
CREATE POLICY "pedido_etiquetas_update_operational"
ON public.pedido_etiquetas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

DROP POLICY IF EXISTS "pedido_etiquetas_delete_operational" ON public.pedido_etiquetas;
CREATE POLICY "pedido_etiquetas_delete_operational"
ON public.pedido_etiquetas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_acceso ua
    WHERE ua.user_id = auth.uid()
      AND ua.estado_acceso = 'aprobado'
      AND ua.app_role IN ('administrador', 'equipo')
  )
);

-- ----------------------------------------------------------------------------
-- 3. HELPER Y BACKFILL: SINCRONIZACIÓN pedidos.etiqueta_interna
-- ----------------------------------------------------------------------------
-- Ampliación aditiva de check_pedidos_etiqueta_interna para soportar etiquetas de hasta 30 caracteres
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS check_pedidos_etiqueta_interna;
ALTER TABLE public.pedidos ADD CONSTRAINT check_pedidos_etiqueta_interna 
  CHECK (etiqueta_interna IS NULL OR (char_length(etiqueta_interna) <= 30 AND char_length(trim(etiqueta_interna)) > 0));

CREATE OR REPLACE FUNCTION public._sync_pedido_etiqueta_interna(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first_label text;
  v_current_label text;
BEGIN
  SELECT texto INTO v_first_label
  FROM public.pedido_etiquetas
  WHERE pedido_id = p_pedido_id
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT etiqueta_interna INTO v_current_label
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF v_current_label IS DISTINCT FROM v_first_label THEN
    UPDATE public.pedidos
    SET etiqueta_interna = v_first_label
    WHERE id = p_pedido_id;
  END IF;
END;
$$;

-- Trigger bidireccional anti-recursión: pedidos -> pedido_etiquetas
CREATE OR REPLACE FUNCTION public._trg_sync_pedidos_to_etiquetas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Cortar recursión de triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.etiqueta_interna IS NOT NULL AND trim(NEW.etiqueta_interna) <> '' THEN
      INSERT INTO public.pedido_etiquetas (pedido_id, texto, color)
      VALUES (NEW.id, trim(NEW.etiqueta_interna), 'azul')
      ON CONFLICT (pedido_id, (lower(trim(texto)))) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.etiqueta_interna IS DISTINCT FROM NEW.etiqueta_interna) THEN
    IF NEW.etiqueta_interna IS NOT NULL AND trim(NEW.etiqueta_interna) <> '' THEN
      IF OLD.etiqueta_interna IS NOT NULL AND trim(OLD.etiqueta_interna) <> '' THEN
        IF EXISTS (
          SELECT 1 FROM public.pedido_etiquetas
          WHERE pedido_id = NEW.id AND lower(trim(texto)) = lower(trim(NEW.etiqueta_interna))
        ) THEN
          DELETE FROM public.pedido_etiquetas
          WHERE pedido_id = NEW.id AND lower(trim(texto)) = lower(trim(OLD.etiqueta_interna));
        ELSE
          UPDATE public.pedido_etiquetas
          SET texto = trim(NEW.etiqueta_interna)
          WHERE pedido_id = NEW.id
            AND lower(trim(texto)) = lower(trim(OLD.etiqueta_interna));
        END IF;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.pedido_etiquetas
        WHERE pedido_id = NEW.id AND lower(trim(texto)) = lower(trim(NEW.etiqueta_interna))
      ) THEN
        INSERT INTO public.pedido_etiquetas (pedido_id, texto, color)
        VALUES (NEW.id, trim(NEW.etiqueta_interna), 'azul')
        ON CONFLICT (pedido_id, (lower(trim(texto)))) DO NOTHING;
      END IF;
    ELSE
      IF OLD.etiqueta_interna IS NOT NULL AND trim(OLD.etiqueta_interna) <> '' THEN
        DELETE FROM public.pedido_etiquetas
        WHERE pedido_id = NEW.id
          AND lower(trim(texto)) = lower(trim(OLD.etiqueta_interna));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pedidos_to_etiquetas ON public.pedidos;
CREATE TRIGGER trg_sync_pedidos_to_etiquetas
AFTER INSERT OR UPDATE OF etiqueta_interna ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_pedidos_to_etiquetas();

-- Trigger bidireccional anti-recursión: pedido_etiquetas -> pedidos
CREATE OR REPLACE FUNCTION public._trg_sync_pedido_etiquetas_to_pedidos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_id uuid;
  v_first_label text;
  v_current_label text;
BEGIN
  -- Cortar recursión de triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);

  SELECT texto INTO v_first_label
  FROM public.pedido_etiquetas
  WHERE pedido_id = v_pedido_id
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT etiqueta_interna INTO v_current_label
  FROM public.pedidos
  WHERE id = v_pedido_id;

  -- Actualizar únicamente si hay desincronización
  -- Invariante: NO modifica version, NO dispara domain_events ni comunicaciones
  IF v_current_label IS DISTINCT FROM v_first_label THEN
    UPDATE public.pedidos
    SET etiqueta_interna = v_first_label
    WHERE id = v_pedido_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pedido_etiquetas_to_pedidos ON public.pedido_etiquetas;
CREATE TRIGGER trg_sync_pedido_etiquetas_to_pedidos
AFTER INSERT OR UPDATE OR DELETE ON public.pedido_etiquetas
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_pedido_etiquetas_to_pedidos();

-- Backfill idempotente desde pedidos.etiqueta_interna preexistente
DO $$
BEGIN
  INSERT INTO public.pedido_etiquetas (pedido_id, texto, color)
  SELECT
    p.id,
    trim(p.etiqueta_interna),
    'azul'
  FROM public.pedidos p
  WHERE p.etiqueta_interna IS NOT NULL
    AND trim(p.etiqueta_interna) <> ''
  ON CONFLICT (pedido_id, (lower(trim(texto)))) DO NOTHING;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPCS PARA CHECKLIST INTERNO
-- ----------------------------------------------------------------------------

-- A. pedido_checklist_list
CREATE OR REPLACE FUNCTION public.pedido_checklist_list(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_res jsonb;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo', 'observador') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Rol no autorizado para ver checklist' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'pedido_id', ci.pedido_id,
      'texto', ci.texto,
      'completado', ci.completado,
      'orden', ci.orden,
      'created_by', ci.created_by,
      'created_at', ci.created_at,
      'updated_at', ci.updated_at,
      'completado_por', ci.completado_por,
      'completado_at', ci.completado_at,
      'completado_por_nombre', CASE
        WHEN u_comp.user_id IS NOT NULL THEN trim(u_comp.nombre || ' ' || u_comp.apellido)
        ELSE NULL
      END
    ) ORDER BY ci.orden ASC, ci.created_at ASC
  ) INTO v_res
  FROM public.pedido_checklist_items ci
  LEFT JOIN public.usuarios_acceso u_comp ON u_comp.user_id = ci.completado_por
  WHERE ci.pedido_id = p_pedido_id;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_list(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_list(uuid) TO authenticated, service_role;

-- B. pedido_checklist_item_create
CREATE OR REPLACE FUNCTION public.pedido_checklist_item_create(p_pedido_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_clean_text text;
  v_orden integer;
  v_new_row public.pedido_checklist_items%ROWTYPE;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para crear tareas' USING ERRCODE = '42501';
  END IF;

  v_clean_text := trim(p_texto);
  IF v_clean_text IS NULL OR length(v_clean_text) = 0 THEN
    RAISE EXCEPTION 'INVALID_TEXT: El texto de la tarea no puede estar vacío' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean_text) > 500 THEN
    RAISE EXCEPTION 'INVALID_TEXT: El texto de la tarea no puede superar 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
    RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no existe' USING ERRCODE = '02000';
  END IF;

  SELECT COALESCE(MAX(orden) + 1, 0) INTO v_orden
  FROM public.pedido_checklist_items
  WHERE pedido_id = p_pedido_id;

  INSERT INTO public.pedido_checklist_items (
    pedido_id,
    texto,
    completado,
    orden,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_pedido_id,
    v_clean_text,
    false,
    v_orden,
    auth.uid(),
    clock_timestamp(),
    clock_timestamp()
  )
  RETURNING * INTO v_new_row;

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    p_pedido_id::text,
    'checklist_item_create',
    jsonb_build_object('item_id', v_new_row.id, 'texto', v_clean_text, 'orden', v_orden)
  );

  RETURN jsonb_build_object(
    'id', v_new_row.id,
    'pedido_id', v_new_row.pedido_id,
    'texto', v_new_row.texto,
    'completado', v_new_row.completado,
    'orden', v_new_row.orden,
    'created_by', v_new_row.created_by,
    'created_at', v_new_row.created_at,
    'updated_at', v_new_row.updated_at,
    'completado_por', v_new_row.completado_por,
    'completado_at', v_new_row.completado_at,
    'completado_por_nombre', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_item_create(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_item_create(uuid, text) TO authenticated, service_role;

-- C. pedido_checklist_item_toggle
CREATE OR REPLACE FUNCTION public.pedido_checklist_item_toggle(p_item_id uuid, p_completado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_row public.pedido_checklist_items%ROWTYPE;
  v_comp_nombre text;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para cambiar tareas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.pedido_checklist_items
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Tarea de checklist no encontrada' USING ERRCODE = '02000';
  END IF;

  UPDATE public.pedido_checklist_items
  SET
    completado = p_completado,
    completado_por = CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
    completado_at = CASE WHEN p_completado THEN clock_timestamp() ELSE NULL END,
    updated_at = clock_timestamp()
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  IF v_row.completado_por IS NOT NULL THEN
    SELECT trim(nombre || ' ' || apellido) INTO v_comp_nombre
    FROM public.usuarios_acceso
    WHERE user_id = v_row.completado_por;
  END IF;

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    v_row.pedido_id::text,
    'checklist_item_toggle',
    jsonb_build_object('item_id', p_item_id, 'completado', p_completado)
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'pedido_id', v_row.pedido_id,
    'texto', v_row.texto,
    'completado', v_row.completado,
    'orden', v_row.orden,
    'created_by', v_row.created_by,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'completado_por', v_row.completado_por,
    'completado_at', v_row.completado_at,
    'completado_por_nombre', v_comp_nombre
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_item_toggle(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_item_toggle(uuid, boolean) TO authenticated, service_role;

-- D. pedido_checklist_item_update
CREATE OR REPLACE FUNCTION public.pedido_checklist_item_update(p_item_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_clean_text text;
  v_row public.pedido_checklist_items%ROWTYPE;
  v_comp_nombre text;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para editar tareas' USING ERRCODE = '42501';
  END IF;

  v_clean_text := trim(p_texto);
  IF v_clean_text IS NULL OR length(v_clean_text) = 0 THEN
    RAISE EXCEPTION 'INVALID_TEXT: El texto de la tarea no puede estar vacío' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean_text) > 500 THEN
    RAISE EXCEPTION 'INVALID_TEXT: El texto de la tarea no puede superar 500 caracteres' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pedido_checklist_items
  SET
    texto = v_clean_text,
    updated_at = clock_timestamp()
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Tarea de checklist no encontrada' USING ERRCODE = '02000';
  END IF;

  IF v_row.completado_por IS NOT NULL THEN
    SELECT trim(nombre || ' ' || apellido) INTO v_comp_nombre
    FROM public.usuarios_acceso
    WHERE user_id = v_row.completado_por;
  END IF;

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    v_row.pedido_id::text,
    'checklist_item_update',
    jsonb_build_object('item_id', p_item_id, 'texto', v_clean_text)
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'pedido_id', v_row.pedido_id,
    'texto', v_row.texto,
    'completado', v_row.completado,
    'orden', v_row.orden,
    'created_by', v_row.created_by,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'completado_por', v_row.completado_por,
    'completado_at', v_row.completado_at,
    'completado_por_nombre', v_comp_nombre
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_item_update(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_item_update(uuid, text) TO authenticated, service_role;

-- E. pedido_checklist_item_delete
CREATE OR REPLACE FUNCTION public.pedido_checklist_item_delete(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pedido_id uuid;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para eliminar tareas' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pedido_checklist_items
  WHERE id = p_item_id
  RETURNING pedido_id INTO v_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Tarea de checklist no encontrada' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    v_pedido_id::text,
    'checklist_item_delete',
    jsonb_build_object('item_id', p_item_id)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_item_delete(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_item_delete(uuid) TO authenticated, service_role;

-- F. pedido_checklist_reorder
CREATE OR REPLACE FUNCTION public.pedido_checklist_reorder(p_pedido_id uuid, p_item_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_id uuid;
  v_idx integer := 0;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para reordenar tareas' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY p_item_ids
  LOOP
    UPDATE public.pedido_checklist_items
    SET orden = v_idx, updated_at = clock_timestamp()
    WHERE id = v_id AND pedido_id = p_pedido_id;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    p_pedido_id::text,
    'checklist_reorder',
    jsonb_build_object('count', array_length(p_item_ids, 1))
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_reorder(uuid, uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_reorder(uuid, uuid[]) TO authenticated, service_role;

-- G. pedido_checklist_item_history (auditoría sobre mecanismo audit_log existente)
CREATE OR REPLACE FUNCTION public.pedido_checklist_item_history(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_res jsonb;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo', 'observador') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Rol no autorizado para ver historial' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'actor_user_id', a.actor_user_id,
      'actor_nombre', CASE
        WHEN ua.user_id IS NOT NULL THEN trim(ua.nombre || ' ' || ua.apellido)
        ELSE NULL
      END,
      'accion', a.accion,
      'completado', (a.metadata->>'completado')::boolean,
      'created_at', a.created_at
    ) ORDER BY a.created_at ASC
  ) INTO v_res
  FROM public.audit_log a
  LEFT JOIN public.usuarios_acceso ua ON ua.user_id = a.actor_user_id
  WHERE a.recurso_tipo = 'pedidos'
    AND a.accion = 'checklist_item_toggle'
    AND a.metadata->>'item_id' = p_item_id::text;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_checklist_item_history(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_checklist_item_history(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. RPCS PARA ETIQUETAS MÚLTIPLES
-- ----------------------------------------------------------------------------

-- A. pedido_etiquetas_list
CREATE OR REPLACE FUNCTION public.pedido_etiquetas_list(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_res jsonb;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo', 'observador') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Rol no autorizado para ver etiquetas' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'pedido_id', pe.pedido_id,
      'texto', pe.texto,
      'color', pe.color,
      'created_at', pe.created_at
    ) ORDER BY pe.created_at ASC
  ) INTO v_res
  FROM public.pedido_etiquetas pe
  WHERE pe.pedido_id = p_pedido_id;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_etiquetas_list(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_etiquetas_list(uuid) TO authenticated, service_role;

-- B. pedido_etiquetas_add
CREATE OR REPLACE FUNCTION public.pedido_etiquetas_add(
  p_pedido_id uuid,
  p_texto text,
  p_color text DEFAULT 'azul'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_clean_text text;
  v_clean_color text;
  v_new_row public.pedido_etiquetas%ROWTYPE;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para agregar etiquetas' USING ERRCODE = '42501';
  END IF;

  v_clean_text := trim(p_texto);
  IF v_clean_text IS NULL OR length(v_clean_text) = 0 THEN
    RAISE EXCEPTION 'INVALID_TEXT: El texto de la etiqueta no puede estar vacío' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean_text) > 30 THEN
    RAISE EXCEPTION 'INVALID_TEXT: La etiqueta no puede tener más de 30 caracteres' USING ERRCODE = '22023';
  END IF;

  v_clean_color := lower(trim(COALESCE(p_color, 'azul')));
  IF v_clean_color NOT IN ('azul', 'verde', 'ambar', 'rojo', 'morado', 'rosa', 'indigo', 'gris') THEN
    v_clean_color := 'azul';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
    RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no existe' USING ERRCODE = '02000';
  END IF;

  -- Chequeo de duplicado dentro del mismo pedido (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM public.pedido_etiquetas
    WHERE pedido_id = p_pedido_id AND lower(trim(texto)) = lower(v_clean_text)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_LABEL: Ya existe una etiqueta con este nombre en el pedido' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pedido_etiquetas (
    pedido_id,
    texto,
    color,
    created_by,
    created_at
  ) VALUES (
    p_pedido_id,
    v_clean_text,
    v_clean_color,
    auth.uid(),
    clock_timestamp()
  )
  RETURNING * INTO v_new_row;

  PERFORM public._sync_pedido_etiqueta_interna(p_pedido_id);

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    p_pedido_id::text,
    'etiqueta_add',
    jsonb_build_object('etiqueta_id', v_new_row.id, 'texto', v_clean_text, 'color', v_clean_color)
  );

  RETURN jsonb_build_object(
    'id', v_new_row.id,
    'pedido_id', v_new_row.pedido_id,
    'texto', v_new_row.texto,
    'color', v_new_row.color,
    'created_at', v_new_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_etiquetas_add(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_etiquetas_add(uuid, text, text) TO authenticated, service_role;

-- C. pedido_etiquetas_remove
CREATE OR REPLACE FUNCTION public.pedido_etiquetas_remove(p_etiqueta_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pedido_id uuid;
  v_texto text;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para quitar etiquetas' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pedido_etiquetas
  WHERE id = p_etiqueta_id
  RETURNING pedido_id, texto INTO v_pedido_id, v_texto;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LABEL_NOT_FOUND: Etiqueta no encontrada' USING ERRCODE = '02000';
  END IF;

  PERFORM public._sync_pedido_etiqueta_interna(v_pedido_id);

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    v_pedido_id::text,
    'etiqueta_remove',
    jsonb_build_object('etiqueta_id', p_etiqueta_id, 'texto', v_texto)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_etiquetas_remove(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_etiquetas_remove(uuid) TO authenticated, service_role;

-- D. pedido_etiquetas_set (gestión atómica del conjunto de etiquetas)
CREATE OR REPLACE FUNCTION public.pedido_etiquetas_set(
  p_pedido_id uuid,
  p_etiquetas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_item jsonb;
  v_clean_text text;
  v_clean_color text;
BEGIN
  SELECT ua.app_role INTO v_role
  FROM public.usuarios_acceso ua
  WHERE ua.user_id = auth.uid() AND ua.estado_acceso = 'aprobado';

  IF v_role IS NULL OR v_role NOT IN ('administrador', 'equipo') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrador o equipo para gestionar etiquetas' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
    RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido no existe' USING ERRCODE = '02000';
  END IF;

  -- Eliminar etiquetas actuales
  DELETE FROM public.pedido_etiquetas WHERE pedido_id = p_pedido_id;

  -- Insertar nuevas etiquetas
  IF p_etiquetas IS NOT NULL AND jsonb_typeof(p_etiquetas) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_etiquetas)
    LOOP
      v_clean_text := trim(v_item->>'texto');
      v_clean_color := lower(trim(COALESCE(v_item->>'color', 'azul')));

      IF v_clean_color NOT IN ('azul', 'verde', 'ambar', 'rojo', 'morado', 'rosa', 'indigo', 'gris') THEN
        v_clean_color := 'azul';
      END IF;

      IF v_clean_text IS NOT NULL AND length(v_clean_text) > 0 THEN
        IF length(v_clean_text) > 30 THEN
          v_clean_text := substring(v_clean_text FROM 1 FOR 30);
        END IF;

        INSERT INTO public.pedido_etiquetas (
          pedido_id,
          texto,
          color,
          created_by,
          created_at
        ) VALUES (
          p_pedido_id,
          v_clean_text,
          v_clean_color,
          auth.uid(),
          clock_timestamp()
        )
        ON CONFLICT (pedido_id, (lower(trim(texto)))) DO UPDATE
        SET color = EXCLUDED.color;
      END IF;
    END LOOP;
  END IF;

  PERFORM public._sync_pedido_etiqueta_interna(p_pedido_id);

  INSERT INTO public.audit_log (
    actor_user_id,
    recurso_tipo,
    recurso_id,
    accion,
    metadata
  ) VALUES (
    auth.uid(),
    'pedidos',
    p_pedido_id::text,
    'etiquetas_set',
    jsonb_build_object('count', jsonb_array_length(COALESCE(p_etiquetas, '[]'::jsonb)))
  );

  RETURN public.pedido_etiquetas_list(p_pedido_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_etiquetas_set(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pedido_etiquetas_set(uuid, jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ACTUALIZACIÓN RETROCOMPATIBLE: pedido_update_metadata (admite hasta 30 chars)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_update_metadata(
    p_pedido_id uuid,
    p_expected_version bigint,
    p_prioridad text DEFAULT NULL,
    p_etiqueta_interna text DEFAULT NULL,
    p_update_prioridad boolean DEFAULT false,
    p_update_etiqueta boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_current_version bigint;
    v_current_estado text;
    v_current_archivado boolean;
    v_old_prioridad text;
    v_old_etiqueta text;
    v_target_prioridad text;
    v_target_etiqueta text;
    v_clean_prioridad text;
    v_clean_etiqueta text;
    v_new_version bigint;
BEGIN
    -- 1. Validar p_expected_version obligatorio (no NULL y >= 1)
    IF p_expected_version IS NULL OR p_expected_version < 1 THEN
        RAISE EXCEPTION 'INVALID_EXPECTED_VERSION: p_expected_version es obligatorio y debe ser >= 1' USING ERRCODE = '22000';
    END IF;

    -- 2. Exigir al menos un campo a actualizar de forma NULL-safe
    IF NOT COALESCE(p_update_prioridad, false) AND NOT COALESCE(p_update_etiqueta, false) THEN
        RAISE EXCEPTION 'NO_FIELDS_TO_UPDATE: Debe especificarse al menos un campo a actualizar' USING ERRCODE = '22000';
    END IF;

    -- 3. Validar autenticación y estado aprobado
    IF v_actor_id IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no autenticado o no aprobado' USING ERRCODE = '42501';
    END IF;

    -- 4. Validar rol operativo (administrador o equipo)
    v_actor_role := private.current_app_role();
    IF v_actor_role NOT IN ('administrador', 'equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol % no autorizado para modificar metadatos', v_actor_role USING ERRCODE = '42501';
    END IF;

    -- 5. Bloquear fila y verificar versión
    SELECT version, estado, archivado, prioridad, etiqueta_interna
    INTO v_current_version, v_current_estado, v_current_archivado, v_old_prioridad, v_old_etiqueta
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF v_current_version IS NULL THEN
        RAISE EXCEPTION 'PEDIDO_NOT_FOUND: Pedido % no encontrado', p_pedido_id USING ERRCODE = 'P0002';
    END IF;

    IF v_current_version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: La versión esperada % no coincide con la versión actual %', p_expected_version, v_current_version USING ERRCODE = '22000';
    END IF;

    -- 6. Validar estado terminal
    IF v_current_archivado OR v_current_estado IN ('Finalizado', 'Cancelado') THEN
        RAISE EXCEPTION 'TERMINAL_STATE: No se pueden editar metadatos en un pedido en estado terminal (%) o archivado', v_current_estado USING ERRCODE = '22000';
    END IF;

    -- 7. Sanitizar y determinar valor objetivo de PRIORIDAD (NULL-safe)
    IF COALESCE(p_update_prioridad, false) THEN
        v_clean_prioridad := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_prioridad)), '');
        IF v_clean_prioridad IS NOT NULL AND v_clean_prioridad NOT IN ('alta', 'media', 'baja') THEN
            RAISE EXCEPTION 'INVALID_PRIORITY: La prioridad debe ser alta, media, baja o null' USING ERRCODE = '22000';
        END IF;
        v_target_prioridad := v_clean_prioridad;
    ELSE
        v_target_prioridad := v_old_prioridad;
    END IF;

    -- 8. Sanitizar y determinar valor objetivo de ETIQUETA INTERNA (NULL-safe)
    IF COALESCE(p_update_etiqueta, false) THEN
        v_clean_etiqueta := NULLIF(pg_catalog.btrim(p_etiqueta_interna), '');
        IF v_clean_etiqueta IS NOT NULL THEN
            IF pg_catalog.char_length(v_clean_etiqueta) > 30 THEN
                RAISE EXCEPTION 'INVALID_LABEL_LENGTH: La etiqueta interna no puede superar 30 caracteres' USING ERRCODE = '22000';
            END IF;
        END IF;
        v_target_etiqueta := v_clean_etiqueta;
    ELSE
        v_target_etiqueta := v_old_etiqueta;
    END IF;

    -- 9. Idempotencia: Si no hay cambios reales, retornar sin bump de versión ni auditoría
    IF (v_old_prioridad IS NOT DISTINCT FROM v_target_prioridad) AND (v_old_etiqueta IS NOT DISTINCT FROM v_target_etiqueta) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'pedido_id', p_pedido_id,
            'prioridad', v_target_prioridad,
            'etiqueta_interna', v_target_etiqueta,
            'version', v_current_version,
            'updated', false
        );
    END IF;

    v_new_version := v_current_version + 1;

    -- 10. Actualización atómica
    UPDATE public.pedidos
    SET prioridad = v_target_prioridad,
        etiqueta_interna = v_target_etiqueta,
        version = v_new_version,
        updated_at = pg_catalog.now()
    WHERE id = p_pedido_id;

    -- 11. Registro en audit_log usando defaults (gen_random_uuid() y now())
    INSERT INTO public.audit_log (
        actor_user_id,
        recurso_tipo,
        recurso_id,
        accion,
        metadata
    ) VALUES (
        v_actor_id,
        'pedidos',
        p_pedido_id::text,
        'update_metadata',
        pg_catalog.jsonb_build_object(
            'pedido_id', p_pedido_id,
            'prioridad_anterior', v_old_prioridad,
            'prioridad_nueva', v_target_prioridad,
            'etiqueta_anterior', v_old_etiqueta,
            'etiqueta_nueva', v_target_etiqueta,
            'version', v_new_version
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'pedido_id', p_pedido_id,
        'prioridad', v_target_prioridad,
        'etiqueta_interna', v_target_etiqueta,
        'version', v_new_version,
        'updated', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_update_metadata(uuid, bigint, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_update_metadata(uuid, bigint, text, text, boolean, boolean) TO authenticated;

