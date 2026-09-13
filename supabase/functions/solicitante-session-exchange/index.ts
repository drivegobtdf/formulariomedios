import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Contractual rule: POST only to prevent crawlers / pre-fetching from consuming single-use tokens
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido. El canje de acceso requiere POST' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const token = (body.token || body.access_token || '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Token de acceso obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('solicitante_session_exchange', {
      p_token: token,
    });

    if (error) {
      const code = error.code;
      let statusCode = 500;
      let errorCode = error.code || 'EXCHANGE_ERROR';

      if (code === '42201' || error.message.includes('TOKEN_EXPIRED')) {
        statusCode = 410;
        errorCode = 'TOKEN_EXPIRED';
      } else if (code === '42202' || error.message.includes('TOKEN_ALREADY_USED')) {
        statusCode = 409;
        errorCode = 'TOKEN_ALREADY_USED';
      } else if (code === 'P0002' || error.message.includes('TOKEN_NOT_FOUND')) {
        statusCode = 404;
        errorCode = 'TOKEN_NOT_FOUND';
      } else if (code === '42200' || error.message.includes('VALIDATION_ERROR') || error.message.includes('TOKEN_REQUIRED')) {
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
