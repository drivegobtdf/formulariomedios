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

    const solicitudId = (body.solicitud_id || body.solicitudId || '').trim();
    const respuestaTexto = (body.respuesta_texto || body.respuesta || '').trim();
    const enlaces = Array.isArray(body.enlaces) ? body.enlaces : [];
    const archivos = Array.isArray(body.archivos) ? body.archivos : [];

    if (!solicitudId) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'ID de solicitud de información requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!respuestaTexto && enlaces.length === 0 && archivos.length === 0) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe ingresar un texto de respuesta, al menos un enlace o adjuntar un archivo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('solicitante_submit_info_response', {
      p_session_token: sessionToken,
      p_solicitud_id: solicitudId,
      p_respuesta_texto: respuestaTexto || null,
      p_enlaces: enlaces.length > 0 ? enlaces : null,
      p_archivos: archivos.length > 0 ? archivos : null,
    });

    if (error) {
      let statusCode = 500;
      let errorCode = error.code || 'RESPONSE_ERROR';

      if (error.code === '42203' || error.message.includes('SESSION_INVALID') || error.message.includes('SESSION_EXPIRED') || error.message.includes('SESSION_REVOKED')) {
        statusCode = 401;
        errorCode = 'SESSION_INVALID';
      } else if (error.code === '42205' || error.message.includes('SOLICITUD_EXPIRED')) {
        statusCode = 410;
        errorCode = 'SOLICITUD_EXPIRED';
      } else if (error.code === '42206' || error.message.includes('SOLICITUD_ALREADY_RESPONDED')) {
        statusCode = 409;
        errorCode = 'SOLICITUD_ALREADY_RESPONDED';
      } else if (error.code === 'P0002' || error.message.includes('SOLICITUD_NOT_FOUND')) {
        statusCode = 404;
        errorCode = 'SOLICITUD_NOT_FOUND';
      } else if (error.code === '42200' || error.message.includes('VALIDATION_ERROR')) {
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
