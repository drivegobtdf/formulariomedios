import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';
import { validateSubmissionPayloadDates } from '../_shared/payloadValidation.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

interface PedidoSummary {
  id: string;
  pedido_visible: string;
}

/**
 * Sintetiza un título limpio (3 a 50 caracteres, sin HTML) para solicitudes ciudadanas
 * en vuelo originadas desde una pestaña abierta con el bundle previo a CAM-09 (`c444c9c`),
 * donde el objeto `informacion_especifica` carece por completo de la clave `titulo`.
 */
export function synthesizeLegacyInFlightTitle(
  pedido: Record<string, any>,
  contacto?: Record<string, any> | null
): string {
  const info = (pedido?.informacion_especifica && typeof pedido.informacion_especifica === 'object')
    ? pedido.informacion_especifica
    : {};

  const candidates = [
    info.nombre_evento,
    info.nombre_actividad,
    info.tema,
    info.asunto,
    info.objetivo,
    info.motivo,
    info.informacion_base,
    pedido?.tipo_slug && contacto?.area_solicitante
      ? `${String(pedido.tipo_slug).replace(/_/g, ' ')} - ${String(contacto.area_solicitante)}`
      : null,
    pedido?.tipo_slug ? `Solicitud ${String(pedido.tipo_slug).replace(/_/g, ' ')}` : null,
    pedido?.categoria_codigo ? `Pedido ${String(pedido.categoria_codigo)}` : null,
  ];

  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const stripped = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped.length >= 3) {
      return stripped.length > 50 ? stripped.slice(0, 50).trim() : stripped;
    }
  }

  return 'Solicitud de comunicacion institucional';
}

/**
 * Normaliza exclusivamente payloads legacy en vuelo que carecen de la propiedad `titulo`
 * (`!('titulo' in informacion_especifica)`), preservando intacta la validación estricta
 * de CAM-09 / INC-04 (`TITLE_REQUIRED` / `TITLE_INVALID`) para cualquier solicitud emitida
 * por el nuevo frontend o clientes que incluyan el campo `titulo`.
 */
export function normalizeLegacyInFlightSubmissionTitles(
  body: any,
  options: { disableLegacyTitleFallback?: boolean } = {}
): { payload: any; legacySynthesizedCount: number } {
  if (!body || typeof body !== 'object' || !Array.isArray(body.pedidos)) {
    return { payload: body, legacySynthesizedCount: 0 };
  }

  const envDisabled =
    typeof Deno !== 'undefined' &&
    typeof Deno.env?.get === 'function' &&
    Deno.env.get('DISABLE_LEGACY_TITLE_FALLBACK') === 'true';

  if (options.disableLegacyTitleFallback === true || envDisabled) {
    return { payload: body, legacySynthesizedCount: 0 };
  }

  let legacySynthesizedCount = 0;
  const normalizedPedidos = body.pedidos.map((ped: any) => {
    if (!ped || typeof ped !== 'object') return ped;

    const hasTopLevelTitleKey = Object.prototype.hasOwnProperty.call(ped, 'titulo');
    const info = (ped.informacion_especifica && typeof ped.informacion_especifica === 'object')
      ? ped.informacion_especifica
      : {};
    const hasInfoTitleKey = Object.prototype.hasOwnProperty.call(info, 'titulo');

    // Si el cliente envió la clave `titulo` (incluso vacía, corta, larga o con HTML),
    // pertenece al contrato CAM-09 y NO se modifica para que el trigger valide estrictamente.
    if (hasTopLevelTitleKey || hasInfoTitleKey) {
      return ped;
    }

    legacySynthesizedCount++;
    const synthesized = synthesizeLegacyInFlightTitle(ped, body.contacto);
    return {
      ...ped,
      informacion_especifica: {
        ...info,
        titulo: synthesized,
        _legacy_title_synthesized: true,
      },
    };
  });

  if (legacySynthesizedCount === 0) {
    return { payload: body, legacySynthesizedCount: 0 };
  }

  return {
    payload: {
      ...body,
      pedidos: normalizedPedidos,
    },
    legacySynthesizedCount,
  };
}

/**
 * Organiza los archivos del solicitante desde _incoming hacia la carpeta SOLICITUD {pedido_visible}
 * Garantiza durabilidad y resiliencia: si Drive falla, el PED ya confirmado se preserva
 * y el estado queda registrado como 'failed' para reintento.
 */
async function organizeCitizenSubmissionFiles(supabase: SupabaseClient, pedidos: PedidoSummary[]): Promise<void> {
  if (!pedidos || pedidos.length === 0) return;

  const driveAdapter = getDriveAdapter();

  for (const ped of pedidos) {
    if (!ped.id || !ped.pedido_visible) continue;

    try {
      // 1. Obtener archivos asociados al pedido
      const { data: apData, error: apErr } = await supabase
        .from('archivo_pedido')
        .select('archivo_id')
        .eq('pedido_id', ped.id);

      if (apErr || !apData || apData.length === 0) {
        continue;
      }

      const archIds = apData.map((r: any) => r.archivo_id).filter(Boolean);
      if (archIds.length === 0) continue;

      const { data: archFiles, error: archErr } = await supabase
        .from('archivos')
        .select('id, drive_file_id, nombre_original, estado, contexto')
        .in('id', archIds);

      if (archErr || !archFiles || archFiles.length === 0) {
        continue;
      }

      const filesToMove = archFiles.filter((a: any) => a && a.drive_file_id);
      if (filesToMove.length === 0) {
        continue;
      }

      const folderName = `SOLICITUD ${ped.pedido_visible}`;

      // 2. Reclamo atómico en PostgreSQL antes de side effects en Google Drive
      const { data: claimData, error: claimErr } = await supabase.rpc('claim_pedido_drive_folder', {
        p_pedido_id: ped.id,
        p_folder_type: 'solicitud',
        p_folder_name: folderName,
        p_lease_seconds: 60,
      });

      if (claimErr || !claimData) {
        console.warn(`[SUBMISSION_CREATE] Error al reclamar carpeta de solicitud para ${ped.pedido_visible}:`, claimErr?.message);
        continue;
      }

      let solicitudFolderId: string | null = null;
      let claimToken: string | null = null;

      if (claimData.status === 'completed' && claimData.drive_folder_id) {
        solicitudFolderId = claimData.drive_folder_id;
      } else if (claimData.status === 'claimed') {
        claimToken = claimData.claim_token;
        const rootFolderId = await driveAdapter.ensureRootFolder();
        solicitudFolderId = await driveAdapter.ensureFolder(rootFolderId, folderName);
      } else {
        // Estado locked por otro worker: saltar para evitar conflicto
        continue;
      }

      const rootFolderId = await driveAdapter.ensureRootFolder();
      const stagingFolderId = await driveAdapter.ensureStagingFolder(rootFolderId, '_incoming');

      // 3. Mover cada archivo de _incoming a la carpeta SOLICITUD
      for (const file of filesToMove) {
        await driveAdapter.moveFile(file.drive_file_id, solicitudFolderId!, stagingFolderId);
      }

      // 4. Completar registro atómicamente si poseemos el claim
      if (claimToken) {
        await supabase.rpc('complete_pedido_drive_folder', {
          p_pedido_id: ped.id,
          p_folder_type: 'solicitud',
          p_claim_token: claimToken,
          p_drive_folder_id: solicitudFolderId!,
          p_folder_name: folderName,
        });
      }
    } catch (driveErr: unknown) {
      const errMsg = (driveErr as Error)?.message || 'Error desconocido al mover archivos en Google Drive';
      console.warn(`[SUBMISSION_CREATE] Advertencia al organizar archivos en Google Drive para ${ped.pedido_visible}: ${errMsg}`);

      // Registrar falla en PostgreSQL para recuperación/retry seguro
      try {
        await supabase.rpc('fail_pedido_drive_folder', {
          p_pedido_id: ped.id,
          p_folder_type: 'solicitud',
          p_claim_token: null,
          p_last_error: errMsg,
        });
      } catch {
        // Ignorar error al registrar bitácora de fallo
      }
    }
  }
}

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
    const rawBody = await req.json();

    // Validación Server-Side Centralizada de Fechas Operativas (Revisión 3.0)
    const dateValidation = validateSubmissionPayloadDates(rawBody);
    if (!dateValidation.isValid) {
      return new Response(
        JSON.stringify({
          error: 'VALIDATION_ERROR',
          message: dateValidation.error,
          field: dateValidation.field,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compatibilidad transicional sin ventana: si llega un payload en vuelo desde una pestaña
    // con el bundle anterior (`c444c9c`) sin propiedad `titulo`, sintetiza un título válido (3-50 chars, sin HTML).
    // Si el payload incluye la propiedad `titulo`, preserva la validación estricta de CAM-09 / INC-04.
    const { payload: body } = normalizeLegacyInFlightSubmissionTitles(rawBody);

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('submission_create_core', {
      p_payload: body,
    });

    if (error) {
      const code = error.code;
      let statusCode = 500;

      if (code === '40001' || error.message.includes('IDEMPOTENCY_CONFLICT')) {
        statusCode = 409;
      } else if (
        code === '22023' ||
        code === '23514' ||
        code === '23505' ||
        error.message.includes('VALIDATION_ERROR') ||
        error.message.includes('TITLE_REQUIRED') ||
        error.message.includes('TITLE_INVALID') ||
        error.message.includes('MAX_FILES_EXCEEDED') ||
        error.message.includes('FILE_SIZE_EXCEEDED') ||
        error.message.includes('FILE_MIME_UNSUPPORTED') ||
        error.message.includes('SESSION_EXPIRED')
      ) {
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

    // Organizar archivos de solicitante en carpeta SOLICITUD {pedido_visible} (post-commit, no bloqueante de integridad)
    if (!isReplay && data?.pedidos && Array.isArray(data.pedidos)) {
      await organizeCitizenSubmissionFiles(supabase, data.pedidos);
    }

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

// Iniciar servidor HTTP en Supabase Edge Runtime (Deno)
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
