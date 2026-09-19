import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  getSupabaseConfig,
} from '../_shared/security.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido. Utilice POST' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Cabecera Authorization requerida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, publishableKey, serviceRoleKey, supabaseAnonKey } = getSupabaseConfig();
    const effectivePublicKey = publishableKey || supabaseAnonKey;

    if (!supabaseUrl || !effectivePublicKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'SERVER_CONFIGURATION_ERROR', message: 'Configuración del servidor incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    // 1. Cliente con token del usuario autenticado para validar sesión y uid
    const userClient = createClient(supabaseUrl, effectivePublicKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: callerUser }, error: callerErr } = await userClient.auth.getUser(jwt);
    if (callerErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Sesión no válida o expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Cliente administrativo (service_role) aislado para operaciones server-side
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validar que el actor sea administrador aprobado en usuarios_acceso
    const { data: callerAccess, error: accessErr } = await adminClient
      .from('usuarios_acceso')
      .select('app_role, estado_acceso, nombre_usuario')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    if (
      accessErr ||
      !callerAccess ||
      callerAccess.estado_acceso !== 'aprobado' ||
      callerAccess.app_role !== 'administrador'
    ) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: 'Acceso denegado: se requiere rol de administrador aprobado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = (body.user_id || body.userId || '').trim();

    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'user_id debe ser un UUID válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Guard: Auto-eliminación prohibida
    if (targetUserId === callerUser.id) {
      return new Response(
        JSON.stringify({ error: 'SELF_DELETE_FORBIDDEN', message: 'Un administrador no puede eliminarse a sí mismo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener datos del usuario objetivo en usuarios_acceso
    const { data: targetProfile } = await adminClient
      .from('usuarios_acceso')
      .select('user_id, nombre, apellido, nombre_usuario, app_role, estado_acceso')
      .eq('user_id', targetUserId)
      .maybeSingle();

    // Obtener datos de Auth para rescatar email y confirmar existencia
    const { data: authUserData } = await adminClient.auth.admin.getUserById(targetUserId);
    const targetAuthUser = authUserData?.user;

    if (!targetProfile && !targetAuthUser) {
      return new Response(
        JSON.stringify({ error: 'USER_NOT_FOUND', message: 'Usuario no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Guard: Estado permitido para eliminación ('pendiente', 'rechazado', 'revocado')
    // Los usuarios aprobados deben revocarse previamente
    if (targetProfile && targetProfile.estado_acceso === 'aprobado') {
      return new Response(
        JSON.stringify({
          error: 'APPROVED_USER_DELETE_FORBIDDEN',
          message: 'No es posible eliminar un usuario aprobado. Primero debe revocar su acceso.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Guard: Protección del último administrador
    if (targetProfile?.app_role === 'administrador') {
      const { count: otherAdminsCount, error: countErr } = await adminClient
        .from('usuarios_acceso')
        .select('*', { count: 'exact', head: true })
        .eq('app_role', 'administrador')
        .eq('estado_acceso', 'aprobado')
        .neq('user_id', targetUserId);

      if (countErr || (otherAdminsCount !== null && otherAdminsCount < 1)) {
        return new Response(
          JSON.stringify({
            error: 'LAST_ADMIN_PROTECTED',
            message: 'No es posible eliminar la cuenta: el sistema requiere al menos un administrador aprobado.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Si el usuario objetivo figuraba como responsable_user_id en pedidos activos, desasignar de forma segura
    await adminClient
      .from('pedidos')
      .update({ responsable_user_id: null })
      .eq('responsable_user_id', targetUserId);

    // Snapshot para trazabilidad en auditoría
    const targetEmail = targetAuthUser?.email || null;
    const targetUsername = targetProfile?.nombre_usuario || 'desconocido';
    const targetNombre = targetProfile?.nombre || '';
    const targetApellido = targetProfile?.apellido || '';
    const targetRole = targetProfile?.app_role || 'observador';
    const targetEstado = targetProfile?.estado_acceso || 'desconocido';

    // 3. Registrar auditoría del evento (usuario.eliminado)
    await adminClient.from('audit_log').insert({
      actor_user_id: callerUser.id,
      accion: 'usuario.eliminado',
      recurso_tipo: 'usuarios_acceso',
      recurso_id: targetUserId,
      metadata: {
        user_id: targetUserId,
        email: targetEmail,
        nombre_usuario: targetUsername,
        nombre: targetNombre,
        apellido: targetApellido,
        app_role: targetRole,
        estado_acceso: targetEstado,
        deleted_by_admin_id: callerUser.id,
        deleted_by_username: callerAccess.nombre_usuario,
        timestamp: new Date().toISOString(),
      },
    });

    // 4. Eliminar de public.usuarios_acceso
    if (targetProfile) {
      const { error: delProfileErr } = await adminClient
        .from('usuarios_acceso')
        .delete()
        .eq('user_id', targetUserId);

      if (delProfileErr) {
        return new Response(
          JSON.stringify({ error: 'DATABASE_ERROR', message: `Error al eliminar perfil de acceso: ${delProfileErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Eliminar definitivamente de Supabase Auth (shouldSoftDelete = false)
    if (targetAuthUser) {
      const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(targetUserId, false);
      if (delAuthErr) {
        // Log error internally, but respond clearly
        console.error('Error al eliminar usuario de auth.users:', delAuthErr);
        return new Response(
          JSON.stringify({ error: 'AUTH_DELETE_ERROR', message: `Error al eliminar usuario en Auth: ${delAuthErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuario eliminado permanentemente.',
        user_id: targetUserId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Error inesperado del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
