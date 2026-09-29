import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';

function extractSessionToken(req: Request, body?: Record<string, any>): string {
  if (body?.session_token) return String(body.session_token).trim();
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

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido. Utilice POST' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const sessionToken = extractSessionToken(req, body);

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'SESSION_REQUIRED', message: 'Token de sesión de solicitante requerido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const envioId = (body.envio_id || body.envioId || '').trim();
    const pedidoIds = Array.isArray(body.pedido_ids) ? body.pedido_ids : [];
    const motivo = (body.motivo || '').trim();
    const archivosIds = Array.isArray(body.archivos_ids) ? body.archivos_ids : (Array.isArray(body.archivos) ? body.archivos : []);

    if (!envioId) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'ID de envío requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (pedidoIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe seleccionar al menos un pedido para solicitar revisión' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (motivo.length < 10) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'El motivo de revisión debe contener al menos 10 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (archivosIds.length > 5) {
      return new Response(
        JSON.stringify({ error: 'LIMIT_EXCEEDED', message: 'No se pueden adjuntar más de 5 archivos a la solicitud de revisión' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('pedido_request_revision', {
      p_session_token: sessionToken,
      p_envio_id: envioId,
      p_pedido_ids: pedidoIds,
      p_motivo: motivo,
      p_archivos_ids: archivosIds,
    });

    if (error) {
      let statusCode = 500;
      let errorCode = error.code || 'REVISION_ERROR';

      if (error.code === '42203' || error.code === '42501' || error.message.includes('SESSION_INVALID') || error.message.includes('SESSION_NOT_FOUND') || error.message.includes('SESSION_EXPIRED') || error.message.includes('SESSION_REVOKED') || error.message.includes('FORBIDDEN') || error.message.includes('UNAUTHORIZED')) {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
      } else if (error.code === '40001' || error.message.includes('REVISION_ALREADY_OPEN')) {
        statusCode = 409;
        errorCode = 'REVISION_ALREADY_OPEN';
      } else if (error.code === 'P0002' || error.message.includes('PEDIDO_NOT_FOUND') || error.message.includes('ENVIO_NOT_FOUND')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (error.code === '42200' || error.message.includes('VALIDATION_ERROR') || error.message.includes('INVALID_STATE') || error.message.includes('LIMIT_EXCEEDED') || error.message.includes('PEDIDO_ENVIO_MISMATCH') || error.message.includes('DELIVERY_NOT_FOUND')) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
      }

      return new Response(
        JSON.stringify({ error: errorCode, code: errorCode, message: error.message }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
