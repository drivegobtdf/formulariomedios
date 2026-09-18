import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  getSupabaseConfig,
  encryptTokenEnvelope,
} from '../_shared/security.ts';

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
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Cabecera Authorization requerida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseUrl, publishableKey, serviceRoleKey, supabaseAnonKey } = getSupabaseConfig();
    const effectivePublicKey = publishableKey || supabaseAnonKey;

    if (!supabaseUrl || !effectivePublicKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'SERVER_CONFIGURATION_ERROR', message: 'Configuración del servidor incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    // 1. Cliente con token del usuario autenticado para validar sesión y uid (nunca recibe serviceRoleKey)
    const userClient = createClient(supabaseUrl, effectivePublicKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Sesión no válida o expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Cliente administrativo (service_role) para operaciones seguras de encolado
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validar rol de usuario en base de datos
    const { data: usuarioAcceso, error: accesoErr } = await adminClient
      .from('usuarios_acceso')
      .select('app_role, estado_acceso')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accesoErr || !usuarioAcceso || usuarioAcceso.estado_acceso !== 'aprobado' || !['administrador', 'equipo'].includes(usuarioAcceso.app_role)) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: 'No cuenta con permisos de administrador o equipo para solicitar información' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const pedidoId = (body.pedido_id || body.pedidoId || '').trim();
    const mensaje = (body.mensaje || '').trim();
    const expectedVersion = typeof body.expected_version === 'number' ? body.expected_version : null;

    if (!pedidoId || !mensaje) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'pedido_id y mensaje son obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mensaje.length < 5) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'El mensaje debe tener al menos 5 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Generar token criptográfico efímero de 256 bits y su sobre cifrado EN MEMORIA
    const rawBytes = new Uint8Array(32);
    crypto.getRandomValues(rawBytes);
    const rawToken = Array.from(rawBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const solicitudId = crypto.randomUUID();
    const idempotencyKey = `info_requested:${solicitudId}`;

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');

    const encryptedEnvelope = encryptTokenEnvelope(
      rawToken,
      'info_requested_delivery',
      idempotencyKey
    );

    // 4. Ejecutar la RPC Atómica de Base de Datos que crea solicitud + domain_event + outbox con envelope en 1 sola transacción
    const { data: rpcData, error: rpcErr } = await adminClient.rpc('info_request_create_atomic', {
      p_solicitud_id: solicitudId,
      p_pedido_id: pedidoId,
      p_actor_user_id: user.id,
      p_mensaje: mensaje,
      p_token_hash: tokenHash,
      p_encrypted_envelope: encryptedEnvelope,
      p_expected_version: expectedVersion,
    });

    if (rpcErr) {
      const code = rpcErr.code;
      let statusCode = 400;
      if (code === '42501' || rpcErr.message.includes('ACCESS_DENIED') || rpcErr.message.includes('ROLE_FORBIDDEN')) {
        statusCode = 403;
      } else if (code === '40001' || rpcErr.message.includes('VERSION_CONFLICT')) {
        statusCode = 409;
      } else if (code === 'P0002' || rpcErr.message.includes('PEDIDO_NOT_FOUND')) {
        statusCode = 404;
      }

      return new Response(
        JSON.stringify({ error: rpcErr.code || 'RPC_ERROR', message: rpcErr.message }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        solicitud_id: solicitudId,
        communication_id: rpcData?.communication_id,
        expires_at: rpcData?.expires_at,
        raw_token: rawToken,
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
