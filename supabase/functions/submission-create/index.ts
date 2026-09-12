import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
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

    const body = await req.json();

    const { data, error } = await supabase.rpc('submission_create_core', {
      p_payload: body,
    });

    if (error) {
      const code = error.code;
      let statusCode = 500;

      if (code === '40001' || error.message.includes('IDEMPOTENCY_CONFLICT')) {
        statusCode = 409;
      } else if (code === '22023' || code === '23514' || code === '23505' || error.message.includes('VALIDATION_ERROR') || error.message.includes('MAX_FILES_EXCEEDED') || error.message.includes('FILE_SIZE_EXCEEDED') || error.message.includes('FILE_MIME_UNSUPPORTED') || error.message.includes('SESSION_EXPIRED')) {
        statusCode = 400;
      } else if (code === '55000' || error.message.includes('FILE_NOT_VERIFIED')) {
        statusCode = 422;
      } else if (code === 'P0002') {
        statusCode = 404;
      }

      return new Response(
        JSON.stringify({
          error: error.code || 'SUBMISSION_ERROR',
          message: error.message,
        }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isReplay = Boolean(data?.idempotent_replay);
    return new Response(
      JSON.stringify(data),
      {
        status: isReplay ? 200 : 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
