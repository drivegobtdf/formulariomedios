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

  try {
    let body: Record<string, any> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const sessionToken = extractSessionToken(req, body);
    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'SESSION_REQUIRED', message: 'Token de sesión de solicitante requerido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const envioId = (url.searchParams.get('envio_id') || body.envio_id || body.envioId || '').trim();

    if (!envioId) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'ID de envío requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('solicitante_get_envio_revisable_pedidos', {
      p_session_token: sessionToken,
      p_envio_id: envioId,
    });

    if (error) {
      let statusCode = 500;
      let errorCode = error.code || 'ENVIO_ERROR';

      if (error.code === '42203' || error.code === '42501' || error.message.includes('SESSION_INVALID') || error.message.includes('SESSION_NOT_FOUND') || error.message.includes('SESSION_EXPIRED') || error.message.includes('SESSION_REVOKED') || error.message.includes('FORBIDDEN')) {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
      } else if (error.code === 'P0002' || error.message.includes('ENVIO_NOT_FOUND')) {
        statusCode = 404;
        errorCode = 'ENVIO_NOT_FOUND';
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
