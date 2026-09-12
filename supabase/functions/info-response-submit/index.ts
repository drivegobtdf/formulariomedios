import crypto from 'node:crypto';
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
    const body = await req.json();
    const token = (body.token || '').trim();
    const respuestaTexto = (body.respuesta_texto || body.respuesta || '').trim();
    const archivoIds = Array.isArray(body.archivo_ids) ? body.archivo_ids : null;
    const enlaces = Array.isArray(body.enlaces) ? body.enlaces : (body.enlace ? [body.enlace] : null);

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'El token de solicitud es obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!respuestaTexto && (!archivoIds || archivoIds.length === 0) && (!enlaces || enlaces.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe ingresar un mensaje de respuesta, adjuntar archivos o incluir enlaces' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('info_response_submit_core', {
      p_token_hash: tokenHash,
      p_respuesta_texto: respuestaTexto || null,
      p_archivo_ids: archivoIds,
      p_enlaces: enlaces,
    });

    if (error) {
      const code = error.code;
      let statusCode = 500;

      if (code === '42201' || error.message.includes('TOKEN_EXPIRED')) {
        statusCode = 410;
      } else if (code === 'P0002' || error.message.includes('TOKEN_NOT_FOUND')) {
        statusCode = 404;
      } else if (code === '42200' || error.message.includes('PAYLOAD_REQUIRED')) {
        statusCode = 400;
      }

      return new Response(
        JSON.stringify({ error: error.code || 'SUBMIT_ERROR', message: error.message }),
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
