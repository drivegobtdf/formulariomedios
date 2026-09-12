/**
 * Test de Integración de Almacenamiento Google Drive, Sesiones, Upload Directo y Descarga Segura
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 *
 * Ejecuta pruebas completas contra Supabase local y adaptadores de Google Drive:
 * - Ciclo de sesión previa y capability tokens.
 * - Reservas de subida, límites (10 archivos x 10 MB) y formatos permitidos.
 * - Verificación server-side de subida en Google Drive.
 * - Creación multi-PED transaccional con vinculación N:M de archivos.
 * - Descarga autorizada por streaming (Admin, Equipo, Observador) con headers seguros.
 * - Rechazo de roles no autorizados (anon, pendiente, rechazado, revocado).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SUBMISSION,
} from '../../supabase/functions/_shared/security.ts';
import {
  MockDriveAdapter,
  setDriveAdapter,
} from '../../supabase/functions/_shared/drive-adapter.ts';

// Edge function handlers
import sessionPrepareHandler from '../../supabase/functions/submission-session-prepare/index.ts';
import uploadPrepareHandler from '../../supabase/functions/drive-upload-prepare/index.ts';
import uploadCompleteHandler from '../../supabase/functions/drive-upload-complete/index.ts';
import submissionCreateHandler from '../../supabase/functions/submission-create/index.ts';
import driveDownloadHandler from '../../supabase/functions/drive-download/index.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

function assertLocalEnvironment(urlStr: string): void {
  const parsed = new URL(urlStr);
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (!isLocal) {
    throw new Error(
      `[SECURITY GUARD ABORT] Los tests de almacenamiento solo pueden ejecutarse contra Supabase local. Host: ${parsed.hostname}`
    );
  }
}

describe('F5 Google Drive & Upload/Download Integration Tests', () => {
  let serviceClient: SupabaseClient;
  let mockDrive: MockDriveAdapter;

  const testUserIds = {
    admin: 'e5000000-0000-0000-0000-000000000001',
    equipo: 'e5000000-0000-0000-0000-000000000002',
    observador: 'e5000000-0000-0000-0000-000000000003',
    pendiente: 'e5000000-0000-0000-0000-000000000004',
    revocado: 'e5000000-0000-0000-0000-000000000005',
  };

  const testTokens: Record<string, string> = {};
  const createdSessionIds: string[] = [];
  const createdEnvioIds: string[] = [];
  const createdArchivoIds: string[] = [];

  beforeAll(async () => {
    assertLocalEnvironment(LOCAL_SUPABASE_URL);

    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mockDrive = new MockDriveAdapter();
    setDriveAdapter(mockDrive);

    // Crear/actualizar usuarios de prueba con contraseñas conocidas
    const password = 'TestPassword123!';
    for (const [role] of Object.entries(testUserIds)) {
      const email = `test.${role}.f5@tierradelfuego.gob.ar`;

      // Intentar eliminar si ya existe
      const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u) => u.email === email);
      if (existing) {
        await serviceClient.auth.admin.deleteUser(existing.id).catch(() => {});
      }

      const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nombre: `User`,
          apellido: role.toUpperCase(),
          nombre_usuario: `user_${role}_f5`,
        },
      });

      if (createErr || !createData?.user) {
        throw new Error(`Error creating user ${email}: ${createErr?.message}`);
      }

      const actualUserId = createData.user.id;
      const estado = role === 'pendiente' ? 'pendiente' : role === 'revocado' ? 'revocado' : 'aprobado';
      const appRole = role === 'admin' ? 'administrador' : role === 'equipo' ? 'equipo' : 'observador';

      await serviceClient.from('usuarios_acceso').upsert({
        user_id: actualUserId,
        nombre: `User ${role}`,
        apellido: 'F5',
        nombre_usuario: `user_${role}_f5`,
        estado_acceso: estado,
        app_role: appRole,
        aprobado_at: estado === 'aprobado' ? new Date().toISOString() : null,
      });

      // Iniciar sesión para obtener tokens JWT
      const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: authData } = await anon.auth.signInWithPassword({
        email,
        password,
      });

      if (authData?.session?.access_token) {
        testTokens[role] = authData.session.access_token;
      }
    }
  });

  afterAll(async () => {
    if (serviceClient) {
      for (const envioId of createdEnvioIds) {
        const { data: peds } = await serviceClient.from('pedidos').select('id').eq('envio_id', envioId);
        const pedIds = peds?.map((p) => p.id) || [];
        if (pedIds.length > 0) {
          await serviceClient.from('archivo_pedido').delete().in('pedido_id', pedIds);
          await serviceClient.from('enlace_pedido').delete().in('pedido_id', pedIds);
        }
        await serviceClient.from('upload_reservations').delete().eq('envio_id', envioId);
        await serviceClient.from('enlaces_material').delete().eq('envio_id', envioId);
        await serviceClient.from('pedidos').delete().eq('envio_id', envioId);
        await serviceClient.from('domain_events').delete().eq('aggregate_id', envioId);
        await serviceClient.from('audit_log').delete().eq('recurso_id', envioId);
        await serviceClient.from('envios_formulario').delete().eq('id', envioId);
      }

      for (const sessionId of createdSessionIds) {
        await serviceClient.from('upload_reservations').delete().eq('session_id', sessionId);
        await serviceClient.from('submission_sessions').delete().eq('id', sessionId);
      }

      if (createdArchivoIds.length > 0) {
        await serviceClient.from('archivo_pedido').delete().in('archivo_id', createdArchivoIds);
        await serviceClient.from('upload_reservations').delete().in('archivo_id', createdArchivoIds);
        await serviceClient.from('archivos').delete().in('id', createdArchivoIds);
      }
    }
  });

  it('Caso 1: Flujo completo de sesión previa, subida resumible directa, verificación y envío multi-PED atómico', async () => {
    // 1. Iniciar sesión previa de envío (submission-session-prepare)
    const submissionKey = crypto.randomUUID();
    const prepareReq = new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_key: submissionKey }),
    });

    const sessionRes = await sessionPrepareHandler(prepareReq);
    expect(sessionRes.status).toBe(201);
    const sessionData = await sessionRes.json();
    expect(sessionData.session_id).toBeDefined();
    expect(sessionData.capability_token).toBeDefined();
    expect(sessionData.max_files).toBe(10);
    expect(sessionData.max_file_size_bytes).toBe(10485760);

    const sessionId = sessionData.session_id;
    const capabilityToken = sessionData.capability_token;
    createdSessionIds.push(sessionId);

    // 2. Preparar subida de Archivo 1 (General: PDF 2 MB)
    const file1Content = Buffer.from('%PDF-1.4 Mock PDF Content with bytes 12345');
    const uploadPrepareReq1 = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        expected_name: 'documento_adjunto.pdf',
        expected_size: file1Content.length,
        mime_type: 'application/pdf',
        targets: 'all',
      }),
    });

    const uploadRes1 = await uploadPrepareHandler(uploadPrepareReq1);
    expect(uploadRes1.status).toBe(201);
    const uploadData1 = await uploadRes1.json();
    expect(uploadData1.reservation_id).toBeDefined();
    expect(uploadData1.upload_url).toBeDefined();
    createdArchivoIds.push(uploadData1.archivo_id);

    // 3. Preparar subida de Archivo 2 (Específico: PNG 512 KB)
    const clientRefPedido1 = crypto.randomUUID();
    const clientRefPedido2 = crypto.randomUUID();

    const file2Content = Buffer.from('MOCK_PNG_IMAGE_DATA_BYTES_67890');
    const uploadPrepareReq2 = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        expected_name: 'imagen_especifica.png',
        expected_size: file2Content.length,
        mime_type: 'image/png',
        targets: [clientRefPedido1],
      }),
    });

    const uploadRes2 = await uploadPrepareHandler(uploadPrepareReq2);
    expect(uploadRes2.status).toBe(201);
    const uploadData2 = await uploadRes2.json();
    createdArchivoIds.push(uploadData2.archivo_id);

    // 4. Simular subida directa a Google Drive vía Mock Adapter
    const driveFileId1 = `drive_file_${crypto.randomUUID()}`;
    mockDrive.storeFileBuffer(
      driveFileId1,
      'documento_adjunto.pdf',
      'application/pdf',
      file1Content,
      {
        submission_key: submissionKey,
        client_file_ref: uploadData1.client_file_ref,
        reservation_id: uploadData1.reservation_id,
      }
    );

    const driveFileId2 = `drive_file_${crypto.randomUUID()}`;
    mockDrive.storeFileBuffer(
      driveFileId2,
      'imagen_especifica.png',
      'image/png',
      file2Content,
      {
        submission_key: submissionKey,
        client_file_ref: uploadData2.client_file_ref,
        reservation_id: uploadData2.reservation_id,
      }
    );

    // 5. Completar y verificar subida en servidor (drive-upload-complete)
    const completeReq1 = new Request('http://localhost/functions/v1/drive-upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        reservation_id: uploadData1.reservation_id,
        client_file_ref: uploadData1.client_file_ref,
        drive_file_id: driveFileId1,
      }),
    });

    const completeRes1 = await uploadCompleteHandler(completeReq1);
    expect(completeRes1.status).toBe(200);
    const completeData1 = await completeRes1.json();
    expect(completeData1.verified).toBe(true);

    const completeReq2 = new Request('http://localhost/functions/v1/drive-upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        capability_token: capabilityToken,
        reservation_id: uploadData2.reservation_id,
        client_file_ref: uploadData2.client_file_ref,
        drive_file_id: driveFileId2,
      }),
    });

    const completeRes2 = await uploadCompleteHandler(completeReq2);
    expect(completeRes2.status).toBe(200);
    const completeData2 = await completeRes2.json();
    expect(completeData2.verified).toBe(true);

    // 6. Confirmación de envío público con multi-PED (submission-create)
    const submissionPayload = {
      schema_version: 3,
      submission_key: submissionKey,
      contacto: {
        nombre_apellido: 'Luciana Beltrán',
        telefono: '+542901556677',
        correo: 'luciana.beltran@tierradelfuego.gob.ar',
        area_solicitante: 'Subsecretaría de Comunicación',
      },
      pedidos: [
        {
          client_request_ref: clientRefPedido1,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Flyer Campaña Salud' },
        },
        {
          client_request_ref: clientRefPedido2,
          categoria_slug: 'gacetilla',
          tipo_slug: 'gacetilla',
          informacion_especifica: { titulo: 'Gacetilla Campaña Salud' },
        },
      ],
      file_bindings: [
        {
          client_file_ref: uploadData1.client_file_ref,
          expected_name: 'documento_adjunto.pdf',
          expected_size: file1Content.length,
          mime_type: 'application/pdf',
          targets: 'all',
        },
        {
          client_file_ref: uploadData2.client_file_ref,
          expected_name: 'imagen_especifica.png',
          expected_size: file2Content.length,
          mime_type: 'image/png',
          targets: [clientRefPedido1],
        },
      ],
    };

    const submitReq = new Request('http://localhost/functions/v1/submission-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submissionPayload),
    });

    const submitRes = await submissionCreateHandler(submitReq);
    expect(submitRes.status).toBe(201);
    const submitData = await submitRes.json();

    expect(submitData.envio_id).toBeDefined();
    expect(submitData.idempotent_replay).toBe(false);
    expect(submitData.pedidos).toHaveLength(2);
    expect(submitData.archivos).toHaveLength(2);

    const envioId = submitData.envio_id;
    createdEnvioIds.push(envioId);

    // 7. Verificar estado en Base de Datos PostgreSQL
    const { data: dbSession } = await serviceClient
      .from('submission_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    expect(dbSession.estado).toBe('confirmada');
    expect(dbSession.envio_id).toBe(envioId);

    const { data: dbReservations } = await serviceClient
      .from('upload_reservations')
      .select('*')
      .eq('session_id', sessionId);
    expect(dbReservations).toHaveLength(2);
    expect(dbReservations?.every((r: { state: string; envio_id: string }) => r.state === 'completed' && r.envio_id === envioId)).toBe(true);

    // Verificar asociaciones N:M en archivo_pedido
    const { data: dbLinks1 } = await serviceClient
      .from('archivo_pedido')
      .select('*')
      .eq('archivo_id', uploadData1.archivo_id);
    expect(dbLinks1).toHaveLength(2); // Archivo general asociado a ambos PEDs

    const { data: dbLinks2 } = await serviceClient
      .from('archivo_pedido')
      .select('*')
      .eq('archivo_id', uploadData2.archivo_id);
    expect(dbLinks2).toHaveLength(1); // Archivo específico asociado únicamente al PED 1

    // 8. Replay idempotente del mismo payload
    const replayReq = new Request('http://localhost/functions/v1/submission-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submissionPayload),
    });

    const replayRes = await submissionCreateHandler(replayReq);
    expect(replayRes.status).toBe(200);
    const replayData = await replayRes.json();
    expect(replayData.envio_id).toBe(envioId);
    expect(replayData.idempotent_replay).toBe(true);
    expect(replayData.archivos).toHaveLength(2);
  });

  it('Caso 2: Descarga streaming interna segura con roles autorizados (Admin, Equipo, Observador)', async () => {
    // Crear archivo verificado
    const fileContent = Buffer.from('CONTENIDO_CONFIDENCIAL_DESCARGA_STREAMING_123');
    const driveFileId = `drive_dl_${crypto.randomUUID()}`;
    const archivoId = crypto.randomUUID();
    createdArchivoIds.push(archivoId);

    mockDrive.storeFileBuffer(
      driveFileId,
      'informe_revisado.pdf',
      'application/pdf',
      fileContent
    );

    await serviceClient.from('archivos').insert({
      id: archivoId,
      provider: 'google_drive',
      drive_file_id: driveFileId,
      nombre_original: 'informe_revisado.pdf',
      mime_type: 'application/pdf',
      size_bytes: fileContent.length,
      contexto: 'solicitud',
      estado: 'verified',
    });

    // 1. Descarga como Administrador -> 200 OK + Attachment Headers + Stream Content
    const adminReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.admin}` },
    });

    const adminRes = await driveDownloadHandler(adminReq);
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get('Content-Disposition')).toContain('attachment; filename="informe_revisado.pdf"');
    expect(adminRes.headers.get('Content-Type')).toBe('application/pdf');
    expect(adminRes.headers.get('Cache-Control')).toBe('private, no-store');
    expect(adminRes.headers.get('X-Content-Type-Options')).toBe('nosniff');

    // 2. Descarga como Equipo -> 200 OK
    const equipoReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.equipo}` },
    });

    const equipoRes = await driveDownloadHandler(equipoReq);
    expect(equipoRes.status).toBe(200);

    // 3. Descarga como Observador -> 200 OK
    const obsReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.observador}` },
    });

    const obsRes = await driveDownloadHandler(obsReq);
    expect(obsRes.status).toBe(200);

    // 4. Descarga sin autenticación (Anon) -> 401 Unauthorized
    const anonReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
    });

    const anonRes = await driveDownloadHandler(anonReq);
    expect(anonRes.status).toBe(401);

    // 5. Descarga con usuario Pendiente -> 403 Forbidden
    const penReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.pendiente}` },
    });

    const penRes = await driveDownloadHandler(penReq);
    expect(penRes.status).toBe(403);

    // 6. Descarga con usuario Revocado -> 403 Forbidden
    const revReq = new Request(`http://localhost/functions/v1/drive-download?archivo_id=${archivoId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.revocado}` },
    });

    const revRes = await driveDownloadHandler(revReq);
    expect(revRes.status).toBe(403);
  });

  it('Caso 3: Validación y rechazo de límites contractuales (MIME no permitido, >10MB, >10 archivos)', async () => {
    // 1. Iniciar sesión previa
    const submissionKey = crypto.randomUUID();
    const sessionRes = await sessionPrepareHandler(new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_key: submissionKey }),
    }));
    const { session_id, capability_token } = await sessionRes.json();
    createdSessionIds.push(session_id);

    // 2. Rechazar archivo mayor a 10 MB (10,485,761 bytes)
    const bigFileReq = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        capability_token,
        expected_name: 'archivo_pesado.zip',
        expected_size: MAX_FILE_SIZE_BYTES + 1,
        mime_type: 'application/zip',
      }),
    });

    const bigFileRes = await uploadPrepareHandler(bigFileReq);
    expect(bigFileRes.status).toBe(400);
    const bigData = await bigFileRes.json();
    expect(bigData.message).toContain('10 MB');

    // 3. Rechazar tipo MIME no baseline (video/mp4 reservado en OPEN-014)
    const videoReq = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        capability_token,
        expected_name: 'video_institucional.mp4',
        expected_size: 5000000,
        mime_type: 'video/mp4',
      }),
    });

    const videoRes = await uploadPrepareHandler(videoReq);
    expect(videoRes.status).toBe(400);
    const videoData = await videoRes.json();
    expect(videoData.message).toContain('Tipo MIME no permitido');

    // 4. Rechazar capability token falso / inválido
    const invalidTokenReq = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        capability_token: 'forged_token_123456',
        expected_name: 'doc.pdf',
        expected_size: 1000,
        mime_type: 'application/pdf',
      }),
    });

    const invalidTokenRes = await uploadPrepareHandler(invalidTokenReq);
    expect(invalidTokenRes.status).toBe(403);

    // 5. Crear 10 reservas y verificar que la 11va es rechazada con MAX_FILES_EXCEEDED
    for (let i = 1; i <= MAX_FILES_PER_SUBMISSION; i++) {
      const res = await uploadPrepareHandler(new Request('http://localhost/functions/v1/drive-upload-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id,
          capability_token,
          expected_name: `archivo_${i}.pdf`,
          expected_size: 1000,
          mime_type: 'application/pdf',
        }),
      }));
      expect(res.status).toBe(201);
      const data = await res.json();
      createdArchivoIds.push(data.archivo_id);
    }

    // La reserva número 11 debe ser rechazada
    const eleventhReq = new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        capability_token,
        expected_name: 'archivo_11.pdf',
        expected_size: 1000,
        mime_type: 'application/pdf',
      }),
    });

    const eleventhRes = await uploadPrepareHandler(eleventhReq);
    expect(eleventhRes.status).toBe(400);
    const eleventhData = await eleventhRes.json();
    expect(eleventhData.error).toBe('MAX_FILES_EXCEEDED');
  });

  it('Caso 4: Rechazo y rollback transaccional ante intento de confirmación con archivo no verificado', async () => {
    // 1. Iniciar sesión previa
    const submissionKey = crypto.randomUUID();
    const sessionRes = await sessionPrepareHandler(new Request('http://localhost/functions/v1/submission-session-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_key: submissionKey }),
    }));
    const { session_id, capability_token } = await sessionRes.json();
    createdSessionIds.push(session_id);

    // 2. Preparar subida de archivo pero NUNCA llamar a drive-upload-complete (queda reserved/pending)
    const prepRes = await uploadPrepareHandler(new Request('http://localhost/functions/v1/drive-upload-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        capability_token,
        expected_name: 'nunca_subido.pdf',
        expected_size: 1000,
        mime_type: 'application/pdf',
      }),
    }));
    const prepData = await prepRes.json();
    createdArchivoIds.push(prepData.archivo_id);

    // 3. Intentar crear el envío con la referencia de archivo no verificado
    const submitReq = new Request('http://localhost/functions/v1/submission-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: 3,
        submission_key: submissionKey,
        contacto: {
          nombre_apellido: 'Esteban Test',
          telefono: '123456',
          correo: 'esteban@tierradelfuego.gob.ar',
          area_solicitante: 'Prensa',
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'gacetilla',
            tipo_slug: 'gacetilla',
            informacion_especifica: { titulo: 'Gacetilla Test Rollback' },
          },
        ],
        file_bindings: [
          {
            client_file_ref: prepData.client_file_ref,
            expected_name: 'nunca_subido.pdf',
            expected_size: 1000,
            mime_type: 'application/pdf',
          },
        ],
      }),
    });

    const submitRes = await submissionCreateHandler(submitReq);
    expect(submitRes.status).toBe(422); // Prerequisite failed
    const submitData = await submitRes.json();
    expect(submitData.message).toContain('FILE_NOT_VERIFIED');

    // 4. Verificar que se ejecutó ROLLBACK total (no existe fila en envios_formulario ni pedidos)
    const { data: dbEnvios } = await serviceClient
      .from('envios_formulario')
      .select('*')
      .eq('submission_key', submissionKey);
    expect(dbEnvios).toHaveLength(0);
  });
});
