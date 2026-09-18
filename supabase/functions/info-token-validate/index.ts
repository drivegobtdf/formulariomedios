import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig, computeSha256Hex } from '../_shared/security.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    let token = '';

    if (req.method === 'GET') {
      const url = new URL(req.url);
      token = url.searchParams.get('token') || '';
    } else {
      const body = await req.json();
      token = body.token || '';
    }

    token = token.trim();
    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: 'TOKEN_REQUIRED', message: 'Token de solicitud obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenHash = await computeSha256Hex(token);

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: solicitud, error } = await supabase
      .from('solicitudes_informacion')
      .select('id, pedido_id, mensaje, estado, expires_at, respuesta_texto, responded_at, created_at, pedidos:pedido_id(pedido_visible, codigo_categoria)')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ valid: false, error: 'DATABASE_ERROR', message: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!solicitud) {
      return new Response(
        JSON.stringify({ valid: false, error: 'TOKEN_NOT_FOUND', message: 'Solicitud de información no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(solicitud.expires_at).getTime();
    const isExpired = Date.now() >= expiresAt;

    if (isExpired) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'TOKEN_EXPIRED',
          message: 'La solicitud de información ha vencido tras 48 horas corridas.',
          expires_at: solicitud.expires_at,
        }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isResponded = solicitud.estado === 'respondida';
    const pedData = solicitud.pedidos as any;

    return new Response(
      JSON.stringify({
        valid: true,
        responded: isResponded,
        solicitud: {
          id: solicitud.id,
          pedido_id: solicitud.pedido_id,
          pedido_visible: pedData?.pedido_visible,
          categoria_nombre: pedData?.categorias_servicio?.nombre,
          tipo_nombre: pedData?.tipos_servicio?.nombre,
          mensaje: solicitud.mensaje,
          estado: solicitud.estado,
          expires_at: solicitud.expires_at,
          respuesta_texto: solicitud.respuesta_texto,
          responded_at: solicitud.responded_at,
          created_at: solicitud.created_at,
        },
      }),
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
