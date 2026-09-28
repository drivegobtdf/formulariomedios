import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  sanitizeFileName,
  getSupabaseConfig,
  computeSha256Hex,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

function extractSessionToken(req: Request): string {
  const headerToken = req.headers.get('x-solicitante-session');
  if (headerToken) return headerToken.trim();
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return '';
}

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
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Extraer y validar token de sesión del solicitante
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'SESSION_REQUIRED', message: 'Token de sesión de solicitante requerido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenHash = await computeSha256Hex(sessionToken);
    const { data: solSession, error: sessErr } = await supabase
      .from('solicitante_sesiones')
      .select('correo, expires_at, revoked_at')
      .eq('session_token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessErr || !solSession) {
      return new Response(
        JSON.stringify({ error: 'SESSION_INVALID', message: 'Sesión de solicitante inválida o expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Extraer parámetros pedido_id y archivo_id
    const url = new URL(req.url);
    const pedidoRef = (url.searchParams.get('pedido_id') || url.searchParams.get('pedido_ref') || '').trim();
    const archivoId = (url.searchParams.get('archivo_id') || '').trim();

    if (!pedidoRef || !archivoId) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'Parámetros pedido_id y archivo_id son obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validar que el pedido pertenezca al correo del solicitante
    const { data: ped, error: pedErr } = await supabase
      .from('pedidos')
      .select('id, pedido_visible, envios_formulario:envio_id(correo)')
      .or(`id.eq.${pedidoRef},pedido_visible.eq.${pedidoRef}`)
      .maybeSingle();

    if (pedErr || !ped) {
      return new Response(
        JSON.stringify({ error: 'PEDIDO_NOT_FOUND', message: 'Pedido no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ownerEmail = (ped.envios_formulario as any)?.correo;
    if (!ownerEmail || ownerEmail.toLowerCase() !== solSession.correo.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: 'Acceso denegado a este pedido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validar que el archivo_id pertenezca a la entrega vigente de este pedido
    // Buscar en entrega_archivos O en entregas_pedido.archivo_id con es_vigente = true
    const { data: entregaVigente, error: entErr } = await supabase
      .from('entregas_pedido')
      .select('id, version, es_vigente, archivo_id, entrega_archivos(archivo_id)')
      .eq('pedido_id', ped.id)
      .eq('es_vigente', true)
      .maybeSingle();

    if (entErr || !entregaVigente) {
      return new Response(
        JSON.stringify({ error: 'NO_ACTIVE_DELIVERY', message: 'No existe una entrega vigente para este pedido' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const entregaArchivoIds = new Set<string>();
    if (entregaVigente.archivo_id) {
      entregaArchivoIds.add(entregaVigente.archivo_id);
    }
    if (Array.isArray(entregaVigente.entrega_archivos)) {
      for (const ea of entregaVigente.entrega_archivos) {
        if (ea.archivo_id) entregaArchivoIds.add(ea.archivo_id);
      }
    }

    if (!entregaArchivoIds.has(archivoId)) {
      return new Response(
        JSON.stringify({ error: 'FILE_FORBIDDEN', message: 'El archivo solicitado no forma parte de la entrega vigente de este pedido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Obtener metadata del archivo
    const { data: archivo, error: archErr } = await supabase
      .from('archivos')
      .select('*')
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
        JSON.stringify({ error: 'FILE_NOT_AVAILABLE', message: 'El archivo solicitado no está disponible' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Descargar stream binario de Google Drive y hacer streaming directo al cliente
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

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
