import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig, encryptTokenEnvelope } from '../_shared/security.ts';

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
    const email = (body.email || body.correo || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Debe ingresar un correo electrónico válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // F10 / REQ-DEDUP: Evitar duplicación de tokens/outbox si ya existe una solicitud reciente en proceso (Cooldown)
    const cooldownSeconds = parseInt(
      (typeof Deno !== 'undefined' ? Deno.env.get('SOLICITANTE_ACCESS_COOLDOWN_SECONDS') : '') || '45',
      10
    );
    const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

    const { data: recentToken } = await supabase
      .from('solicitante_access_tokens')
      .select('id, created_at, used_at, expires_at')
      .ilike('correo', email)
      .gte('created_at', cooldownThreshold)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentToken) {
      // Cooldown activo: responder inmediatamente con mensaje uniforme anti-enumeración sin generar duplicados
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Si el correo ingresado tiene solicitudes activas, recibirá un enlace de acceso en su casilla.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase.rpc('solicitante_request_access', {
      p_correo: email,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'REQUEST_FAILED', message: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // C06 / REQ-3: Si se generó magic_token efímero en memoria, cifrarlo en sobre autenticado para transporte durable en outbox
    if (data?.found && data?.magic_token && data?.token_id) {
      const idempotencyKey = `magic_link:${data.token_id}`;
      const encryptedEnvelope = encryptTokenEnvelope(
        data.magic_token,
        'magic_link_delivery',
        idempotencyKey
      );

      // Encolar de forma atómica en outbox con el sobre cifrado listo (sin almacenar jamás el token en texto plano)
      const { error: enqueueErr } = await supabase.rpc('solicitante_enqueue_access_email', {
        p_token_id: data.token_id,
        p_correo: email,
        p_nombre: data.solicitante_nombre || 'Solicitante',
        p_expires_at: data.expires_at,
        p_encrypted_envelope: encryptedEnvelope,
      });

      if (enqueueErr) {
        // Fallback directo con el cliente service_role si la RPC no estuviera disponible
        await supabase
          .from('comunicaciones_pedido')
          .upsert({
            destinatario_email: email,
            tipo_comunicacion: 'magic_link_access',
            estado: 'pendiente',
            idempotency_key: idempotencyKey,
            payload: {
              solicitante_nombre: data.solicitante_nombre || 'Solicitante',
              token_id: data.token_id,
              expires_at: data.expires_at,
              encrypted_envelope: encryptedEnvelope,
            },
            created_at: new Date().toISOString(),
          }, { onConflict: 'idempotency_key' });
      }
    }

    // Respuesta inmediata desacoplada de la entrega del correo (Outbox Asíncrono F10)
    return new Response(
      JSON.stringify({
        success: true,
        message: data?.message || 'Si el correo ingresado tiene solicitudes activas, recibirá un enlace de acceso en su casilla.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}

