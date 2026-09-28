import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { getCorsHeaders, getSupabaseConfig } from '../_shared/security.ts';
import { validateSubmissionPayloadDates } from '../_shared/payloadValidation.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

interface PedidoSummary {
  id: string;
  pedido_visible: string;
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

      // 2. Resolver o crear carpetas en Google Drive
      const rootFolderId = await driveAdapter.ensureRootFolder();
      const stagingFolderId = await driveAdapter.ensureStagingFolder(rootFolderId, '_incoming');
      const solicitudFolderId = await driveAdapter.ensureFolder(rootFolderId, folderName);

      // 3. Registrar estado inicial de persistencia en PostgreSQL
      await supabase.rpc('register_pedido_drive_folder', {
        p_pedido_id: ped.id,
        p_folder_type: 'solicitud',
        p_drive_folder_id: solicitudFolderId,
        p_folder_name: folderName,
        p_organization_status: 'processing',
        p_last_error: null,
      });

      // 4. Mover cada archivo de _incoming a la carpeta SOLICITUD
      for (const file of filesToMove) {
        await driveAdapter.moveFile(file.drive_file_id, solicitudFolderId, stagingFolderId);
      }

      // 5. Marcar organización completada
      await supabase.rpc('register_pedido_drive_folder', {
        p_pedido_id: ped.id,
        p_folder_type: 'solicitud',
        p_drive_folder_id: solicitudFolderId,
        p_folder_name: folderName,
        p_organization_status: 'completed',
        p_last_error: null,
      });
    } catch (driveErr: unknown) {
      const errMsg = (driveErr as Error)?.message || 'Error desconocido al mover archivos en Google Drive';
      console.warn(`[SUBMISSION_CREATE] Advertencia al organizar archivos en Google Drive para ${ped.pedido_visible}: ${errMsg}`);

      // Registrar falla en PostgreSQL para recuperación/retry seguro
      try {
        await supabase.rpc('register_pedido_drive_folder', {
          p_pedido_id: ped.id,
          p_folder_type: 'solicitud',
          p_drive_folder_id: 'pending_creation',
          p_folder_name: `SOLICITUD ${ped.pedido_visible}`,
          p_organization_status: 'failed',
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
    const body = await req.json();

    // Validación Server-Side Centralizada de Fechas Operativas (Revisión 3.0)
    const dateValidation = validateSubmissionPayloadDates(body);
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
