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

    // 4. Acción STATUS (Consultar estado de una operación por ID o IdempotencyKey)
    if (action === 'status') {
      const opId = body.operation_id;
      const idempotencyKey = body.idempotency_key;

      let query = supabase.from('admin_purge_operations').select('*, admin_purge_items(*)');
      if (opId && UUID_REGEX.test(opId)) {
        query = query.eq('id', opId);
      } else if (idempotencyKey) {
        query = query.eq('idempotency_key', idempotencyKey);
      } else {
        return new Response(
          JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe proveer operation_id o idempotency_key' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: opData, error: opErr } = await query.single();
      if (opErr || !opData) {
        return new Response(
          JSON.stringify({ error: 'NOT_FOUND', message: 'Operación no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(opData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validación de pedido_ids para el resto de acciones
    const rawIds = Array.isArray(body.pedido_ids) ? body.pedido_ids : [];
    const pedidoIds = rawIds.filter((id: any) => typeof id === 'string' && UUID_REGEX.test(id.trim())).map((id: string) => id.trim());

    // 5. Acción PREVIEW
    if (action === 'preview') {
      if (pedidoIds.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Debe especificar al menos un pedido_id válido en formato UUID',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

    // 6. Acción PURGE (Saga Durable e Idempotente)
    if (action === 'purge' || action === 'init') {
      const idempotencyKey = (body.idempotency_key || `purge_${pedidoIds.sort().join('_').slice(0, 40)}_${Date.now()}`).trim();

      if (pedidoIds.length === 0 && !body.operation_id) {
        return new Response(
          JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Debe especificar al menos un pedido_id válido',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 6a. Inicializar o recuperar la operación de purga en DB
      const { data: initData, error: initErr } = await supabase.rpc('admin_purge_operation_init', {
        p_pedido_ids: pedidoIds,
        p_idempotency_key: idempotencyKey,
        p_actor: actorDisplay,
      });

      if (initErr) {
        return new Response(
          JSON.stringify({ error: 'INIT_ERROR', message: initErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const operationId = initData.operation_id;
      const currentStatus = initData.status;

      // Si la operación ya fue completada anteriormente
      if (currentStatus === 'completed') {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'completed',
            operation_id: operationId,
            deleted_count: initData.pedidos_count,
            pedidos_visibles: initData.pedidos_visibles,
            message: 'Operación ya completada previamente (idempotente)',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Si solo se solicitó inicialización
      if (action === 'init') {
        return new Response(JSON.stringify(initData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 6b. FASE DRIVE: Limpieza durable con persistencia individual
      const adapter = getDriveAdapter();

      // Consultar items de Drive pendientes o fallidos para esta operación
      const { data: driveItems, error: itemsErr } = await supabase
        .from('admin_purge_items')
        .select('*')
        .eq('operation_id', operationId)
        .in('item_type', ['drive_file', 'drive_folder'])
        .in('status', ['pending', 'failed']);

      if (itemsErr) {
        return new Response(
          JSON.stringify({ error: 'DB_ERROR', message: itemsErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pendingItems = driveItems || [];

      for (const item of pendingItems) {
        let cleanupRes = await adapter.trashItem(item.target_id);

        // Retry con backoff breve ante fallo 5xx/network
        if (!cleanupRes.success && (!cleanupRes.httpStatus || cleanupRes.httpStatus >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          cleanupRes = await adapter.trashItem(item.target_id);
        }

        // Persistir el resultado individual del item inmediatamente en Postgres
        await supabase.rpc('admin_purge_item_update', {
          p_operation_id: operationId,
          p_item_type: item.item_type,
          p_target_id: item.target_id,
          p_status: cleanupRes.status,
          p_error: cleanupRes.error || null,
        });
      }

      // 6c. Evaluar fase Drive y transición de estado
      const { data: stepDriveData, error: stepDriveErr } = await supabase.rpc('admin_purge_operation_step_drive', {
        p_operation_id: operationId,
      });

      if (stepDriveErr) {
        return new Response(
          JSON.stringify({ error: 'SAGA_ERROR', message: stepDriveErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (stepDriveData.status !== 'processing_db') {
        return new Response(
          JSON.stringify({
            success: false,
            status: stepDriveData.status,
            operation_id: operationId,
            message: `Atención: ${stepDriveData.pending_or_failed_drive_items} recursos de Google Drive no pudieron limpiarse. La purga de base de datos fue pausada para garantizar consistencia. Puede reintentar la operación.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 6d. FASE POSTGRESQL: Purga atómica final vinculada a la operación autorizada
      const { data: purgeResult, error: purgeErr } = await supabase.rpc('admin_pedidos_purge', {
        p_operation_id: operationId,
        p_actor: actorDisplay,
      });

      if (purgeErr) {
        return new Response(
          JSON.stringify({
            error: 'DB_PURGE_ERROR',
            operation_id: operationId,
            message: purgeErr.message,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'completed',
          operation_id: operationId,
          deleted_count: purgeResult.deleted_count,
          pedidos_visibles: purgeResult.pedidos_visibles,
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
      JSON.stringify({ error: 'INTERNAL_ERROR', message: err.message || 'Error inesperado del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
