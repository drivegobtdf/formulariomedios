import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  getCorsHeaders,
  getSupabaseConfig,
  getEnv,
  timingSafeEqualString,
  verifyUserRole,
} from '../_shared/security.ts';
import { getDriveAdapter } from '../_shared/drive-adapter.ts';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Autenticación del despachador / reconciliador
    const authHeader = req.headers.get('authorization') || '';
    const dispatchSecret = req.headers.get('x-pedidos-dispatch-secret') || '';
    const apiKey = (req.headers.get('apikey') || '').trim();
    const expectedSecret = getEnv('N8N_DISPATCH_SECRET');
    const directServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SECRET_KEY') || '';

    const bearerToken = (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader).trim();
    let isAuthorized = false;

    // A. Clave de servicio
    if (
      (bearerToken && serviceRoleKey && timingSafeEqualString(bearerToken, serviceRoleKey)) ||
      (apiKey && serviceRoleKey && timingSafeEqualString(apiKey, serviceRoleKey)) ||
      (bearerToken && directServiceKey && timingSafeEqualString(bearerToken, directServiceKey)) ||
      (apiKey && directServiceKey && timingSafeEqualString(apiKey, directServiceKey))
    ) {
      isAuthorized = true;
    }

    // B. Secreto de despacho n8n / scheduler
    if (!isAuthorized && expectedSecret && dispatchSecret && timingSafeEqualString(dispatchSecret, expectedSecret)) {
      isAuthorized = true;
    }

    // C. JWT de usuario administrador autenticado
    if (!isAuthorized && bearerToken) {
      try {
        const { data: { user }, error: userErr } = await adminClient.auth.getUser(bearerToken);
        if (!userErr && user) {
          const roleCheck = await verifyUserRole(adminClient, user.id);
          if (roleCheck.approved && roleCheck.role === 'administrador') {
            isAuthorized = true;
          }
        }
      } catch {
        // Fallback a no autorizado
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'No autorizado para ejecutar reconciliación de Drive' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'reconcile';
    const driveAdapter = getDriveAdapter();

    // -------------------------------------------------------------------------
    // ACCIÓN: DIAGNOSTICAR ANOMALÍAS EN GOOGLE DRIVE Y BASE DE DATOS
    // -------------------------------------------------------------------------
    if (action === 'diagnose') {
      const rootFolderId = await driveAdapter.ensureRootFolder();
      const token = await driveAdapter.getAccessToken();

      // Listar todas las carpetas en Google Drive bajo root
      const query = encodeURIComponent(`'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&pageSize=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!listRes.ok) {
        throw new Error(`Error al listar carpetas en Drive: ${listRes.status} ${await listRes.text()}`);
      }

      const listData = (await listRes.json()) as { files: Array<{ id: string; name: string; createdTime: string }> };
      const driveFolders = listData.files || [];

      // Detectar nombres duplicados en Drive
      const nameMap = new Map<string, Array<{ id: string; name: string; createdTime: string }>>();
      for (const f of driveFolders) {
        const existing = nameMap.get(f.name) || [];
        existing.push(f);
        nameMap.set(f.name, existing);
      }

      const duplicateFoldersInDrive: Array<{ name: string; count: number; instances: Array<{ id: string; createdTime: string }> }> = [];
      for (const [name, instances] of nameMap.entries()) {
        if (instances.length > 1) {
          duplicateFoldersInDrive.push({
            name,
            count: instances.length,
            instances: instances.map(i => ({ id: i.id, createdTime: i.createdTime })),
          });
        }
      }

      // Obtener mapeos en PostgreSQL
      const { data: dbFolders, error: dbErr } = await adminClient
        .from('pedido_drive_folders')
        .select('*');

      if (dbErr) throw dbErr;

      const dbMapByDriveId = new Map<string, any>();
      for (const row of dbFolders || []) {
        if (row.drive_folder_id) {
          dbMapByDriveId.set(row.drive_folder_id, row);
        }
      }

      // Carpetas en Drive sin mapeo en BD (excluyendo _incoming)
      const unmappedDriveFolders = driveFolders.filter(f => f.name !== '_incoming' && !dbMapByDriveId.has(f.id));

      // Mapeos en BD cuyo folder ID no existe en Drive
      const driveIdSet = new Set(driveFolders.map(f => f.id));
      const missingInDrive = (dbFolders || []).filter(row => row.organization_status === 'completed' && row.drive_folder_id && !driveIdSet.has(row.drive_folder_id));

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'diagnose',
          total_drive_folders: driveFolders.length,
          total_db_mappings: (dbFolders || []).length,
          anomalies: {
            duplicate_folders_in_drive: duplicateFoldersInDrive,
            unmapped_drive_folders: unmappedDriveFolders,
            db_completed_missing_in_drive: missingInDrive,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // ACCIÓN: RECONCILIAR / REINTENTAR CARPETAS FALLIDAS O STUCK
    // -------------------------------------------------------------------------
    const { data: claimBatch, error: claimErr } = await adminClient.rpc('reconcile_fetch_failed_drive_folders', {
      p_max_retries: 5,
      p_limit: 10,
      p_lease_seconds: 120,
    });

    if (claimErr) throw claimErr;

    const items = (claimBatch?.items || []) as Array<{
      id: string;
      pedido_id: string;
      pedido_visible: string;
      folder_type: 'solicitud' | 'enviado';
      folder_name: string;
      claim_token: string;
      retry_count: number;
    }>;

    const results: Array<{ id: string; pedido_visible: string; folder_type: string; success: boolean; error?: string }> = [];

    const rootFolderId = await driveAdapter.ensureRootFolder();
    const stagingFolderId = await driveAdapter.ensureStagingFolder(rootFolderId, '_incoming');

    for (const item of items) {
      try {
        if (item.folder_type === 'solicitud') {
          const folderName = item.folder_name || `SOLICITUD ${item.pedido_visible}`;
          const targetFolderId = await driveAdapter.ensureFolder(rootFolderId, folderName);

          // Buscar archivos del pedido en public.archivo_pedido
          const { data: archRel } = await adminClient
            .from('archivo_pedido')
            .select('archivo_id, archivos(id, drive_file_id, estado, contexto)')
            .eq('pedido_id', item.pedido_id);

          const filesToMove = (archRel || [])
            .map((r: any) => r.archivos)
            .filter((a: any) => a && a.drive_file_id && a.contexto === 'solicitud');

          for (const file of filesToMove) {
            try {
              await driveAdapter.moveFile(file.drive_file_id, targetFolderId, stagingFolderId);
            } catch (moveErr) {
              console.warn(`[RECONCILE] Advertencia al mover archivo ${file.drive_file_id}:`, (moveErr as Error)?.message);
            }
          }

          await adminClient.rpc('complete_pedido_drive_folder', {
            p_pedido_id: item.pedido_id,
            p_folder_type: 'solicitud',
            p_claim_token: item.claim_token,
            p_drive_folder_id: targetFolderId,
            p_folder_name: folderName,
          });

          results.push({ id: item.id, pedido_visible: item.pedido_visible, folder_type: item.folder_type, success: true });
        } else if (item.folder_type === 'enviado') {
          const folderName = item.folder_name || `ENVIADO-${item.pedido_visible}`;
          const targetFolderId = await driveAdapter.ensureFolder(rootFolderId, folderName);

          await adminClient.rpc('complete_pedido_drive_folder', {
            p_pedido_id: item.pedido_id,
            p_folder_type: 'enviado',
            p_claim_token: item.claim_token,
            p_drive_folder_id: targetFolderId,
            p_folder_name: folderName,
          });

          results.push({ id: item.id, pedido_visible: item.pedido_visible, folder_type: item.folder_type, success: true });
        }
      } catch (err: unknown) {
        const errMsg = (err as Error)?.message || 'Error durante reconciliación';
        console.error(`[RECONCILE] Fallo reconciliando ${item.pedido_visible} (${item.folder_type}):`, errMsg);

        await adminClient.rpc('fail_pedido_drive_folder', {
          p_pedido_id: item.pedido_id,
          p_folder_type: item.folder_type,
          p_claim_token: item.claim_token,
          p_last_error: errMsg,
        });

        results.push({ id: item.id, pedido_visible: item.pedido_visible, folder_type: item.folder_type, success: false, error: errMsg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'reconcile',
        processed: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error)?.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
