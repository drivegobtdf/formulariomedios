import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getSupabaseConfig } from '../_shared/env.ts';
import { getCorsHeaders } from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'AUTH_REQUIRED', message: 'Se requiere token de autenticación' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Validar identidad del usuario mediante Supabase Auth
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'AUTH_INVALID', message: 'Sesión de usuario inválida o expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;

    // 2. Validar rol de administrador aprobado en public.usuarios_acceso
    const { data: usuarioAcceso, error: accesoError } = await supabase
      .from('usuarios_acceso')
      .select('user_id, app_role, estado_acceso, nombre, apellido, nombre_usuario')
      .eq('user_id', userId)
      .single();

    if (accesoError || !usuarioAcceso || usuarioAcceso.app_role !== 'administrador' || usuarioAcceso.estado_acceso !== 'aprobado') {
      return new Response(
        JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Permiso denegado: Se requiere rol de administrador aprobado',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const actorDisplay = [usuarioAcceso.nombre, usuarioAcceso.apellido].filter(Boolean).join(' ') ||
      usuarioAcceso.nombre_usuario ||
      userData.user.email ||
      'administrador';

    // 3. Procesar cuerpo del request
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'preview';
    const rawIds = Array.isArray(body.pedido_ids) ? body.pedido_ids : [];
    const pedidoIds = rawIds.filter((id: any) => typeof id === 'string' && UUID_REGEX.test(id.trim())).map((id: string) => id.trim());

    if (pedidoIds.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'VALIDATION_ERROR',
          message: 'Debe especificar al menos un pedido_id válido en formato UUID',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Acción PREVIEW
    if (action === 'preview') {
      const { data: previewData, error: previewErr } = await supabase.rpc('admin_pedidos_purge_preview', {
        p_pedido_ids: pedidoIds,
      });

      if (previewErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: previewErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(previewData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Acción PURGE (Eliminación con limpieza de Google Drive y base de datos)
    if (action === 'purge') {
      // 5a. Obtener preview previo para recolectar recursos de Drive
      const { data: previewData, error: previewErr } = await supabase.rpc('admin_pedidos_purge_preview', {
        p_pedido_ids: pedidoIds,
      });

      if (previewErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: previewErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const driveFileIds: string[] = Array.isArray(previewData?.drive_file_ids) ? previewData.drive_file_ids : [];
      const driveFolderIds: string[] = Array.isArray(previewData?.drive_folder_ids) ? previewData.drive_folder_ids : [];

      // 5b. Limpieza en Google Drive
      const adapter = getDriveAdapter();
      const driveCleanupResults = {
        files_attempted: driveFileIds.length,
        files_deleted: 0,
        folders_attempted: driveFolderIds.length,
        folders_deleted: 0,
      };

      for (const fileId of driveFileIds) {
        try {
          const ok = await adapter.deleteItem(fileId);
          if (ok) driveCleanupResults.files_deleted++;
        } catch (e) {
          console.warn(`[PURGE] No se pudo eliminar archivo Drive ${fileId}:`, e);
        }
      }

      for (const folderId of driveFolderIds) {
        try {
          const ok = await adapter.deleteItem(folderId);
          if (ok) driveCleanupResults.folders_deleted++;
        } catch (e) {
          console.warn(`[PURGE] No se pudo eliminar carpeta Drive ${folderId}:`, e);
        }
      }

      // 5c. Ejecutar purga atómica en base de datos
      const { data: purgeResult, error: purgeErr } = await supabase.rpc('admin_pedidos_purge', {
        p_pedido_ids: pedidoIds,
        p_actor: actorDisplay,
      });

      if (purgeErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: purgeErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: purgeResult?.deleted_count || 0,
          pedidos_visibles: purgeResult?.pedidos_visibles || [],
          drive_cleanup: driveCleanupResults,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'INVALID_ACTION', message: `Acción '${action}' no reconocida` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: err.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
