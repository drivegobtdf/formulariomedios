import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import crypto from 'node:crypto';
import {
  getCorsHeaders,
  generateCapabilityToken,
  verifyCapabilityToken,
  SESSION_TTL_SECONDS,
  MAX_FILES_PER_SUBMISSION,
  MAX_FILE_SIZE_BYTES,
  getSupabaseConfig,
} from '../_shared/security.ts';

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

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // Body vacío permitido -> genera nuevo submission_key
    }

    const submissionKey = (body.submission_key as string) || crypto.randomUUID();

    // Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(submissionKey)) {
      return new Response(
        JSON.stringify({ error: 'VALIDATION_ERROR', message: 'submission_key debe ser un UUID válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const providedToken = (req.headers.get('x-capability-token') || body.capability_token) as string | undefined;

    // Comprobar si ya existe una sesión para este submission_key
    const { data: existingSession } = await supabase
      .from('submission_sessions')
      .select('*')
      .eq('submission_key', submissionKey)
      .maybeSingle();

    if (existingSession) {
      if (existingSession.estado !== 'abierta' || new Date(existingSession.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ error: 'SESSION_EXPIRED', message: 'La sesión asociada a este submission_key ha expirado o ya fue confirmada' }),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Si el cliente presenta la prueba de capacidad que ya poseía -> retry seguro
      if (providedToken && verifyCapabilityToken(providedToken, existingSession.capability_hash)) {
        return new Response(
          JSON.stringify({
            session_id: existingSession.id,
            submission_key: existingSession.submission_key,
            capability_token: providedToken,
            expires_at: existingSession.expires_at,
            max_files: MAX_FILES_PER_SUBMISSION,
            max_file_size_bytes: MAX_FILE_SIZE_BYTES,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Si no presenta el capability token previo -> conflicto (no filtrar secretos ni tokens a terceros)
      return new Response(
        JSON.stringify({ error: 'SESSION_ALREADY_EXISTS', message: 'submission_key ya inicializada; se requiere x-capability-token para reanudar' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generar capability token
    const { token: capabilityToken, hash: capabilityHash } = generateCapabilityToken(submissionKey);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    const sessionId = crypto.randomUUID();

    const { error: insertError } = await supabase.from('submission_sessions').insert({
      id: sessionId,
      submission_key: submissionKey,
      capability_hash: capabilityHash,
      form_schema_version: 3,
      estado: 'abierta',
      expires_at: expiresAt,
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error al inicializar sesión de envío', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        session_id: sessionId,
        submission_key: submissionKey,
        capability_token: capabilityToken,
        expires_at: expiresAt,
        max_files: MAX_FILES_PER_SUBMISSION,
        max_file_size_bytes: MAX_FILE_SIZE_BYTES,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
