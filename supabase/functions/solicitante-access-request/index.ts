import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig, encryptTokenEnvelope } from '../_shared/security.ts';
import { renderMagicLinkEmail } from '../_shared/emailTemplates.ts';

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

    const { data, error } = await supabase.rpc('solicitante_request_access', {
      p_correo: email,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'REQUEST_FAILED', message: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // C06 / REQ-3: Si se generó magic_token efímero en memoria, cifrarlo en sobre autenticado para transporte durable
    if (data?.found && data?.magic_token && data?.token_id) {
      const idempotencyKey = `magic_link:${data.token_id}`;
      const encryptedEnvelope = encryptTokenEnvelope(
        data.magic_token,
        'magic_link_delivery',
        idempotencyKey
      );

      // Persistir el sobre cifrado en la fila de outbox (sin almacenar jamás el token en texto plano)
      const { data: outboxRow } = await supabase
        .from('comunicaciones_pedido')
        .select('id, payload')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (outboxRow?.id) {
        const updatedPayload = {
          ...(outboxRow.payload || {}),
          token_id: data.token_id,
          expires_at: data.expires_at,
          encrypted_envelope: encryptedEnvelope,
        };
        await supabase
          .from('comunicaciones_pedido')
          .update({ payload: updatedPayload })
          .eq('id', outboxRow.id);
      }

      // Intento de envío inmediato si n8n está disponible
      try {
        const n8nBaseUrl = (Deno.env.get('N8N_BASE_URL') || '').replace(/\/+$/, '');
        const integrationSecret = Deno.env.get('N8N_INTEGRATION_SECRET') || '';
        const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'http://localhost:5173';

        if (n8nBaseUrl && outboxRow?.id) {
          // Reclamar atómicamente el ítem para envío directo
          const { data: claimData } = await supabase.rpc('comunicacion_claim_batch', {
            p_batch_size: 1,
            p_lease_seconds: 60,
          });

          const claimedItem = (claimData || []).find((c: any) => c.id === outboxRow.id);
          if (claimedItem?.claim_id) {
            const rendered = renderMagicLinkEmail(
              {
                magic_token: data.magic_token,
                correo: email,
                ttl_minutes: Math.round((data.ttl_seconds || 900) / 60),
              },
              appBaseUrl
            );

            const n8nRes = await fetch(`${n8nBaseUrl}/webhook/pedidos-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-n8n-integration-secret': integrationSecret,
              },
              body: JSON.stringify({
                communication_id: outboxRow.id,
                pedido_id: '',
                servicio_id: 'portal_acceso',
                tipo: 'magic_link_access',
                to: email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
              }),
            });

            if (n8nRes.ok) {
              const n8nResult = await n8nRes.json();
              const providerMsgId = n8nResult.message_id || n8nResult.id || 'sent_direct_n8n';
              await supabase.rpc('comunicacion_mark_result', {
                p_id: outboxRow.id,
                p_claim_id: claimedItem.claim_id,
                p_success: true,
                p_provider_msg_id: String(providerMsgId),
                p_error: null,
                p_retry_seconds: null,
              });
            }
          }
        }
      } catch {
        // Si n8n está temporalmente offline o falla, el ítem permanece en outbox
        // con el sobre cifrado listo para ser despachado automáticamente por el scheduler.
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: data.message || 'Si el correo ingresado tiene solicitudes activas, recibirá un enlace de acceso en su casilla.',
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
