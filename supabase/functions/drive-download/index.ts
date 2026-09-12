import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  sanitizeFileName,
  verifyUserRole,
  getSupabaseConfig,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { supabaseUrl, publishableKey, serviceRoleKey } = getSupabaseConfig();

    // 1. Extraer y verificar Token JWT de autenticación
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Cabecera Authorization Bearer requerida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '').trim();

    // Cliente con contexto de usuario para verificar identidad
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Token JWT inválido o expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verificar autorización RBAC en usuarios_acceso (Admin, Equipo, Observador aprobado)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userAccess = await verifyUserRole(adminClient, userData.user.id);
    if (!userAccess.approved || !userAccess.role) {
      return new Response(
        JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Usuario no cuenta con aprobación activa o rol habilitado para descargas',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Obtener parámetro archivo_id
    const url = new URL(req.url);
    const archivoId = url.searchParams.get('archivo_id');

    if (!archivoId) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'Parámetro archivo_id es obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Buscar metadata del archivo en base de datos
    const { data: archivo, error: archErr } = await adminClient
      .from('archivos')
      .select('*, archivo_pedido(*)')
      .eq('id', archivoId)
      .maybeSingle();

    if (archErr || !archivo) {
      return new Response(
        JSON.stringify({ error: 'NOT_FOUND', message: 'Archivo no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (archivo.estado !== 'verified' || !archivo.drive_file_id) {
      return new Response(
        JSON.stringify({ error: 'FILE_NOT_AVAILABLE', message: 'El archivo solicitado no está verificado en almacenamiento' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Descargar stream binario desde Google Drive
    const adapter = getDriveAdapter();
    const download = await adapter.downloadFileStream(archivo.drive_file_id);

    const safeFilename = sanitizeFileName(archivo.nombre_original || download.name);

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': archivo.mime_type || download.mimeType,
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': (archivo.size_bytes || download.size).toString(),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };

    // Retornar stream binario directamente
    return new Response(download.stream as unknown as BodyInit, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno al procesar descarga' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
