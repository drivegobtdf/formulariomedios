-- PEDIDOS CAM-08. Edición y borrado lógico de notas privadas con historial protegido.
-- Base: 15bb4f90f2d0842e090ec652bdc4748b72744752; no mutar SQL histórico.
-- Solamente notas visibilidad='interna'. Nunca alterar mensajes públicos.

ALTER TABLE public.notas_pedido
    ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS edited_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

-- El texto previo y nuevo se conserva sólo en tabla protegida, no en audit_log.
CREATE TABLE IF NOT EXISTS public.nota_pedido_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_id uuid NOT NULL REFERENCES public.notas_pedido(id) ON DELETE CASCADE,
    pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    accion text NOT NULL CHECK (accion IN ('edit', 'delete')),
    texto_anterior text NOT NULL,
    texto_nuevo text NULL,
    revision_anterior integer NOT NULL,
    revision_nueva integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cam08_revision_ascendente CHECK (revision_nueva = revision_anterior + 1)
);
CREATE INDEX IF NOT EXISTS idx_cam08_historial_nota
    ON public.nota_pedido_historial (nota_id, created_at DESC);

ALTER TABLE public.nota_pedido_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nota_pedido_historial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nota_pedido_historial TO authenticated;
DROP POLICY IF EXISTS cam08_historial_select_operadores ON public.nota_pedido_historial;
CREATE POLICY cam08_historial_select_operadores ON public.nota_pedido_historial
    FOR SELECT TO authenticated
    USING (private.is_approved() AND private.is_team_or_admin());

-- No conceder UPDATE/DELETE directo: mutaciones únicamente mediante RPC con auditoría.
REVOKE UPDATE, DELETE ON public.notas_pedido FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.nota_pedido_update(
    p_nota_id uuid,
    p_contenido text,
    p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions,auth,pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role text;
    v_nota public.notas_pedido%ROWTYPE;
    v_texto text := btrim(coalesce(p_contenido,''));
    v_new_revision integer;
BEGIN
    IF v_actor IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no aprobado' USING ERRCODE='42501';
    END IF;
    v_role := private.current_app_role();
    IF v_role NOT IN ('administrador','equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol no autorizado' USING ERRCODE='42501';
    END IF;
    IF p_nota_id IS NULL OR p_expected_revision IS NULL THEN
        RAISE EXCEPTION 'INVALID_NOTE_REVISION: Nota y revisión obligatorias' USING ERRCODE='42200';
    END IF;
    IF v_texto = '' THEN
        RAISE EXCEPTION 'CONTENT_REQUIRED: Nota vacía' USING ERRCODE='42200';
    END IF;

    SELECT * INTO v_nota FROM public.notas_pedido WHERE id=p_nota_id FOR UPDATE;
    IF v_nota.id IS NULL OR v_nota.visibilidad <> 'interna' THEN
        RAISE EXCEPTION 'NOTE_NOT_FOUND: Nota interna no encontrada' USING ERRCODE='P0002';
    END IF;
    IF v_role <> 'administrador' AND v_nota.autor_user_id <> v_actor THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el autor o un administrador puede editar' USING ERRCODE='42501';
    END IF;
    IF v_nota.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'NOTE_DELETED: Nota eliminada' USING ERRCODE='42200';
    END IF;
    IF v_nota.revision <> p_expected_revision THEN
        RAISE EXCEPTION 'NOTE_VERSION_CONFLICT: Nota modificada por otro usuario' USING ERRCODE='PT409';
    END IF;
    IF v_nota.texto = v_texto THEN
        RETURN jsonb_build_object('success',true,'idempotent',true,'nota_id',p_nota_id,'revision',v_nota.revision);
    END IF;

    v_new_revision := v_nota.revision + 1;
    INSERT INTO public.nota_pedido_historial (
        nota_id,pedido_id,actor_user_id,accion,texto_anterior,texto_nuevo,revision_anterior,revision_nueva
    ) VALUES (p_nota_id,v_nota.pedido_id,v_actor,'edit',v_nota.texto,v_texto,v_nota.revision,v_new_revision);
    UPDATE public.notas_pedido
       SET texto=v_texto,edited_at=now(),edited_by=v_actor,revision=v_new_revision
     WHERE id=p_nota_id;
    INSERT INTO public.audit_log(actor_user_id,recurso_tipo,recurso_id,accion,metadata,created_at)
    VALUES(v_actor,'notas_pedido',p_nota_id::text,'update',
           jsonb_build_object('pedido_id',v_nota.pedido_id,'revision_anterior',v_nota.revision,'revision_nueva',v_new_revision),now());
    RETURN jsonb_build_object('success',true,'nota_id',p_nota_id,'revision',v_new_revision,'edited',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.nota_pedido_delete(
    p_nota_id uuid,
    p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions,auth,pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role text;
    v_nota public.notas_pedido%ROWTYPE;
    v_new_revision integer;
BEGIN
    IF v_actor IS NULL OR NOT private.is_approved() THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Usuario no aprobado' USING ERRCODE='42501';
    END IF;
    v_role := private.current_app_role();
    IF v_role NOT IN ('administrador','equipo') THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: Rol no autorizado' USING ERRCODE='42501';
    END IF;
    IF p_nota_id IS NULL OR p_expected_revision IS NULL THEN
        RAISE EXCEPTION 'INVALID_NOTE_REVISION: Nota y revisión obligatorias' USING ERRCODE='42200';
    END IF;
    SELECT * INTO v_nota FROM public.notas_pedido WHERE id=p_nota_id FOR UPDATE;
    IF v_nota.id IS NULL OR v_nota.visibilidad <> 'interna' THEN
        RAISE EXCEPTION 'NOTE_NOT_FOUND: Nota interna no encontrada' USING ERRCODE='P0002';
    END IF;
    IF v_role <> 'administrador' AND v_nota.autor_user_id <> v_actor THEN
        RAISE EXCEPTION 'FORBIDDEN: Solo el autor o un administrador puede eliminar' USING ERRCODE='42501';
    END IF;
    IF v_nota.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object('success',true,'idempotent',true,'nota_id',p_nota_id,'deleted',true);
    END IF;
    IF v_nota.revision <> p_expected_revision THEN
        RAISE EXCEPTION 'NOTE_VERSION_CONFLICT: Nota modificada por otro usuario' USING ERRCODE='PT409';
    END IF;
    v_new_revision := v_nota.revision + 1;
    INSERT INTO public.nota_pedido_historial (
        nota_id,pedido_id,actor_user_id,accion,texto_anterior,texto_nuevo,revision_anterior,revision_nueva
    ) VALUES (p_nota_id,v_nota.pedido_id,v_actor,'delete',v_nota.texto,NULL,v_nota.revision,v_new_revision);
    UPDATE public.notas_pedido
       SET deleted_at=now(),deleted_by=v_actor,revision=v_new_revision
     WHERE id=p_nota_id;
    INSERT INTO public.audit_log(actor_user_id,recurso_tipo,recurso_id,accion,metadata,created_at)
    VALUES(v_actor,'notas_pedido',p_nota_id::text,'delete',
           jsonb_build_object('pedido_id',v_nota.pedido_id,'revision_anterior',v_nota.revision,'revision_nueva',v_new_revision),now());
    RETURN jsonb_build_object('success',true,'nota_id',p_nota_id,'revision',v_new_revision,'deleted',true);
END;
$$;

REVOKE ALL ON FUNCTION public.nota_pedido_update(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nota_pedido_delete(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nota_pedido_update(uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nota_pedido_delete(uuid,integer) TO authenticated;
