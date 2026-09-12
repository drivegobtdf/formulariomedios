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
    const email = (body.email || body.correo || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe proporcionar un correo electrónico válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.rpc('tracking_recover_core', {
      p_correo: email,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'DATABASE_ERROR', message: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Respuesta anti-enumeración uniforme
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Si el correo electrónico se encuentra registrado en el sistema, recibirá un mensaje con los enlaces seguros de seguimiento.',
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
