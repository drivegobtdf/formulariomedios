-- =============================================================================
-- Migración: 20260928000056_expose_register_pedido_drive_folder.sql
-- Crear public.register_pedido_drive_folder accesible para service_role
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_pedido_drive_folder(
    p_pedido_id uuid,
    p_folder_type text,
    p_drive_folder_id text,
    p_folder_name text,
    p_organization_status text DEFAULT 'completed',
    p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions, pg_temp
AS $$
DECLARE
    v_rec public.pedido_drive_folders%ROWTYPE;
BEGIN
    INSERT INTO public.pedido_drive_folders (
        pedido_id, folder_type, drive_folder_id, folder_name, organization_status, last_error, updated_at
    ) VALUES (
        p_pedido_id, p_folder_type, p_drive_folder_id, p_folder_name, p_organization_status, p_last_error, now()
    )
    ON CONFLICT (pedido_id, folder_type) DO UPDATE SET
        drive_folder_id = EXCLUDED.drive_folder_id,
        folder_name = EXCLUDED.folder_name,
        organization_status = EXCLUDED.organization_status,
        last_error = EXCLUDED.last_error,
        updated_at = now()
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_rec.id,
        'pedido_id', v_rec.pedido_id,
        'folder_type', v_rec.folder_type,
        'drive_folder_id', v_rec.drive_folder_id,
        'folder_name', v_rec.folder_name,
        'organization_status', v_rec.organization_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_pedido_drive_folder(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_pedido_drive_folder(uuid, text, text, text, text, text) TO service_role;
