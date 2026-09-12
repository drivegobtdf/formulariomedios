import crypto from 'node:crypto';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';

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
    let pedidoVisible = '';
    let trackingToken = '';

    if (req.method === 'GET') {
      const url = new URL(req.url);
      pedidoVisible = url.searchParams.get('pedido_visible') || url.searchParams.get('ped') || '';
      trackingToken = url.searchParams.get('token') || url.searchParams.get('tracking_token') || '';
    } else {
      const body = await req.json();
      pedidoVisible = body.pedido_visible || body.ped || '';
      trackingToken = body.token || body.tracking_token || '';
    }

    pedidoVisible = pedidoVisible.trim();
    trackingToken = trackingToken.trim();

    if (!pedidoVisible || !trackingToken) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe ingresar el código PED y el token de seguimiento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenHash = crypto.createHash('sha256').update(trackingToken).digest('hex');

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('tracking_get_core', {
      p_pedido_visible: pedidoVisible,
      p_token_hash: tokenHash,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'DATABASE_ERROR', message: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'NOT_FOUND', message: 'Pedido no encontrado o credencial inválida' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
