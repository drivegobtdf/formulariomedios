import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig, getEnv, decryptTokenEnvelope, timingSafeEqualString, resolvePublicAppUrl } from '../_shared/security.ts';
import { renderEmailForCommunication } from '../_shared/emailTemplates.ts';

interface ClaimedCommItem {
  id: string;
  claim_id: string | null;
  pedido_id: string | null;
  envio_id: string | null;
  tipo_comunicacion: string;
  destinatario_email: string;
  attempts: number;
  payload: Record<string, unknown> | null;
  idempotency_key: string | null;
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido. Utilice POST o GET' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 0. Autenticación dedicada del despachador (Pre-Operation Guard)
  const serverDispatchSecret = getEnv('N8N_DISPATCH_SECRET');
  if (!serverDispatchSecret || serverDispatchSecret.trim().length === 0) {
    return new Response(
      JSON.stringify({
        error: 'CONFIGURATION_ERROR',
        message: 'N8N_DISPATCH_SECRET no está configurado en el servidor.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const clientDispatchSecret = req.headers.get('x-pedidos-dispatch-secret');
  if (!clientDispatchSecret || clientDispatchSecret.trim().length === 0) {
    return new Response(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        message: 'Cabecera x-pedidos-dispatch-secret requerida para invocar el despachador.',
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!timingSafeEqualString(clientDispatchSecret, serverDispatchSecret)) {
    return new Response(
      JSON.stringify({
        error: 'FORBIDDEN',
        message: 'Secreto de autorización de despacho inválido.',
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let batchSize = 10;
    let leaseSeconds = 300;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body?.batch_size && typeof body.batch_size === 'number') {
          batchSize = Math.max(1, Math.min(50, body.batch_size));
        }
        if (body?.lease_seconds && typeof body.lease_seconds === 'number') {
          leaseSeconds = Math.max(60, Math.min(3600, body.lease_seconds));
        }
      } catch {
        // Body was empty or not json, continue with defaults
      }
    }

    // 1. Claim batch with atomic leases, claim_id and sweep of expired leases (C08)
    const { data: claimedItems, error: claimError } = await supabase.rpc('comunicacion_claim_batch', {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
    });

    if (claimError) {
      return new Response(
        JSON.stringify({ error: 'CLAIM_FAILED', message: claimError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = (claimedItems || []) as ClaimedCommItem[];
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, items: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const n8nBaseUrl = getEnv('N8N_BASE_URL') || 'https://n8n.pablosaldiviafotos.ar';
    const n8nWebhookPath = getEnv('N8N_WEBHOOK_PATH') || 'pedidos-email';
    const n8nIntegrationSecret = getEnv('N8N_INTEGRATION_SECRET') || '';
    let appUrl: string;
    try {
      appUrl = resolvePublicAppUrl();
    } catch (configErr) {
      return new Response(
        JSON.stringify({
          error: 'CONFIGURATION_ERROR',
          message: (configErr as Error)?.message || 'Error de configuración de PUBLIC_APP_URL',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ id: string; success: boolean; status: string; provider_message_id?: string; error?: string }> = [];

    for (const item of items) {
      const claimId = item.claim_id;
      let isUncertain = false;
      let isSuccess = false;
      let providerMsgId: string | null = null;
      let errorMsg: string | null = null;
      let retrySeconds: number | null = 300;

      try {
        // C12: Validación de destinatario de prueba en entorno controlado
        const toEmail = (item.destinatario_email || '').trim().toLowerCase();
        const isAuthorizedTestEmail = toEmail === 'pablosaldiviainfo@gmail.com' ||
          toEmail.endsWith('@tierradelfuego.gob.ar') ||
          toEmail.endsWith('@tdf.gob.ar');

        if (!isAuthorizedTestEmail && Deno.env.get('ENVIRONMENT') !== 'production') {
          throw {
            semanticType: 'PERMANENT_RECIPIENT_REJECTED',
            status: 422,
            message: `Destinatario '${toEmail}' no está en la allowlist de pruebas autorizadas.`,
          };
        }

        // Descifrado del sobre autenticado en memoria para magic link si aplica
        let payloadToRender: Record<string, any> = item.payload || {};
        if (item.tipo_comunicacion === 'magic_link_access' || item.tipo_comunicacion === 'access_requested') {
          if (payloadToRender.encrypted_envelope) {
            try {
              const idempotencyKey = item.idempotency_key || `magic_link:${item.id}`;
              const decryptedToken = decryptTokenEnvelope(
                payloadToRender.encrypted_envelope as any,
                'magic_link_delivery',
                idempotencyKey
              );
              if (decryptedToken) {
                payloadToRender = {
                  ...payloadToRender,
                  magic_token: decryptedToken,
                  raw_token: decryptedToken,
                };
              }
            } catch (decErr) {
              console.warn(`[DISPATCHER] Error descifrando sobre para ${item.id}:`, (decErr as Error)?.message);
            }
          }

          // Hard guard: NUNCA despachar un magic link sin token válido y no vacío
          const finalToken = (payloadToRender.magic_token || payloadToRender.raw_token || '') as string;
          if (!finalToken || typeof finalToken !== 'string' || finalToken.trim().length === 0) {
            throw {
              semanticType: 'PERMANENT_VALIDATION_ERROR',
              status: 422,
              message: `Comunicación ${item.id} (${item.tipo_comunicacion}) no contiene token de acceso válido. Despacho cancelado para evitar envío de enlace vacío.`,
            };
          }
        }

        const rendered = renderEmailForCommunication(
          item.tipo_comunicacion,
          payloadToRender,
          appUrl
        );

        const webhookUrl = `${n8nBaseUrl.replace(/\/$/, '')}/webhook/${n8nWebhookPath.replace(/^\//, '')}`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (n8nIntegrationSecret) {
          headers['x-n8n-integration-secret'] = n8nIntegrationSecret;
        }

        const n8nPayload = {
          communication_id: item.id,
          pedido_id: item.pedido_id || '',
          servicio_id: (item.payload?.servicio_id as string) || '',
          tipo: rendered.n8nTipo,
          to: item.destinatario_email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        };

        let dispatchResponse: Response;
        try {
          dispatchResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(n8nPayload),
          });
        } catch (fetchErr) {
          // Si el fetch falló por timeout o drop de red luego de iniciar el envío, clasificar como uncertain (C10)
          isUncertain = true;
          throw {
            semanticType: 'NETWORK_TIMEOUT_POST_SEND',
            status: 0,
            message: `Fallo de conexión o timeout durante despacho a n8n: ${(fetchErr as Error)?.message}`,
          };
        }

        // C11: Clasificación semántica de respuestas HTTP y distinción de resultado conocido/desconocido
        if (!dispatchResponse.ok) {
          const status = dispatchResponse.status;
          const errText = (await dispatchResponse.text()).slice(0, 300);

          if (status === 400 || status === 422) {
            throw {
              semanticType: 'PERMANENT_VALIDATION_ERROR',
              status,
              message: `Error permanente de validación de payload (HTTP ${status}): ${errText}`,
            };
          } else if (status === 401) {
            throw {
              semanticType: 'PERMANENT_AUTH_UNAUTHORIZED',
              status,
              message: `Error de autenticación con webhook n8n (HTTP 401): ${errText}`,
            };
          } else if (status === 403) {
            const isOauth = errText.toLowerCase().includes('token') || errText.toLowerCase().includes('oauth') || errText.toLowerCase().includes('credential');
            const semanticType = isOauth ? 'PERMANENT_AUTH_CREDENTIALS_EXPIRED' : 'PERMANENT_AUTH_FORBIDDEN';
            throw {
              semanticType,
              status,
              message: `Acceso prohibido n8n [${semanticType}] (HTTP 403): ${errText}`,
            };
          } else if (status === 429) {
            const retryHeader = dispatchResponse.headers.get('Retry-After');
            const parsedWait = retryHeader ? parseInt(retryHeader, 10) : 600;
            throw {
              semanticType: 'TRANSIENT_RATE_LIMIT',
              status,
              retryAfter: isNaN(parsedWait) ? 600 : parsedWait,
              message: `Límite de tasa / cuota excedida (HTTP 429). Reintento en ${parsedWait}s: ${errText}`,
            };
          } else if (status === 504 || status === 502) {
            // Gateway Timeout o Bad Gateway post-despacho: resultado externo desconocido
            isUncertain = true;
            throw {
              semanticType: 'TRANSIENT_GATEWAY_TIMEOUT_POST_SEND',
              status,
              message: `Timeout o fallo de pasarela tras despacho (HTTP ${status}). Resultado externo incierto: ${errText}`,
            };
          } else {
            // 500 / 503: Determinar si el fallo ocurrió previo o posterior al despacho
            let explicitPreSendError = false;
            try {
              const parsed = JSON.parse(errText);
              if (parsed.sent === false || parsed.stage === 'pre_send' || parsed.code === 'BAD_INPUT') {
                explicitPreSendError = true;
              }
            } catch {
              // Not structured pre-send json
            }

            if (explicitPreSendError) {
              throw {
                semanticType: 'TRANSIENT_SERVER_ERROR_CONFIRMED_NOT_SENT',
                status,
                message: `Error del servidor n8n / Gmail confirmado previo a envío (HTTP ${status}): ${errText}`,
              };
            } else {
              isUncertain = true;
              throw {
                semanticType: 'UNKNOWN_SERVER_OUTCOME_500',
                status,
                message: `Error del servidor n8n / Gmail con resultado desconocido tras envío (HTTP ${status}). Retenido en uncertain para evitar duplicación: ${errText}`,
              };
            }
          }
        }

        const dispatchJson = await dispatchResponse.json();
        providerMsgId = String(dispatchJson?.message_id || dispatchJson?.id || `n8n_${Date.now()}`);
        isSuccess = true;

        // C08: Mark success passing claim_id to guard against stale lease
        await supabase.rpc('comunicacion_mark_result', {
          p_id: item.id,
          p_success: true,
          p_provider_msg_id: providerMsgId,
          p_error: null,
          p_retry_seconds: null,
          p_claim_id: claimId,
          p_uncertain: false,
        });

        results.push({ id: item.id, success: true, status: 'enviada', provider_message_id: providerMsgId });
      } catch (err: any) {
        errorMsg = err.message || (err as Error)?.message || 'Error desconocido';
        isSuccess = false;

        if (
          err.semanticType === 'PERMANENT_VALIDATION_ERROR' ||
          err.semanticType === 'PERMANENT_AUTH_UNAUTHORIZED' ||
          err.semanticType === 'PERMANENT_AUTH_FORBIDDEN' ||
          err.semanticType === 'PERMANENT_AUTH_CREDENTIALS_EXPIRED' ||
          err.semanticType === 'PERMANENT_RECIPIENT_REJECTED'
        ) {
          // Forzar agotamiento para que pase a fallida de inmediato
          retrySeconds = 0;
        } else if (err.semanticType === 'TRANSIENT_RATE_LIMIT') {
          retrySeconds = err.retryAfter || 600;
        } else {
          // Exponential backoff para fallos transitorios confirmados
          retrySeconds = Math.min(3600, 300 * Math.pow(2, item.attempts));
        }

        await supabase.rpc('comunicacion_mark_result', {
          p_id: item.id,
          p_success: false,
          p_provider_msg_id: null,
          p_error: errorMsg,
          p_retry_seconds: retrySeconds,
          p_claim_id: claimId,
          p_uncertain: isUncertain,
        });

        results.push({
          id: item.id,
          success: false,
          status: isUncertain ? 'uncertain' : (retrySeconds === 0 ? 'fallida' : 'retry_wait'),
          error: errorMsg,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: items.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'DISPATCH_CRITICAL_FAILURE', message: err?.message || 'Error crítico en dispatcher' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}

