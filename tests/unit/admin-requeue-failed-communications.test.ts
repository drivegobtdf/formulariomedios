import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const prodSecretsPath = path.join(os.homedir(), '.pedidos', 'prod-secrets.json');

describe('F10 Admin Requeue Mechanism for Failed Communications (Migration 052)', () => {
  let supabaseAdmin: SupabaseClient;
  let supabaseAnon: SupabaseClient;
  let hasCloudCredentials = false;

  beforeAll(() => {
    if (fs.existsSync(prodSecretsPath)) {
      try {
        const secrets = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
        if (secrets.SUPABASE_SERVICE_ROLE_KEY) {
          supabaseAdmin = createClient(PROD_URL, secrets.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const configPath = path.join(process.cwd(), 'pedidos-medios', 'frontend', 'public', 'pedidos-config.js');
          let anonKey = '';
          if (fs.existsSync(configPath)) {
            const cfg = fs.readFileSync(configPath, 'utf8');
            const match = cfg.match(/supabaseAnonKey:\s*'([^']+)'/);
            if (match) anonKey = match[1];
          }
          supabaseAnon = createClient(PROD_URL, anonKey || 'anon-key-placeholder', {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          hasCloudCredentials = true;
        }
      } catch {
        hasCloudCredentials = false;
      }
    }
  });

  it('1. Usuario anónimo o no autorizado es rechazado con 42501 (PoLP)', async () => {
    if (!hasCloudCredentials) return;

    const dummyId = crypto.randomUUID();
    const { data, error } = await supabaseAnon.rpc('comunicacion_admin_requeue', {
      p_communication_id: dummyId,
      p_reason: 'Intento no autorizado de requeue',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/UNAUTHORIZED|se requiere rol de administrador|permission denied/i);
    expect(data).toBeNull();
  });

  it('2. Rechaza argumentos inválidos (ID nulo o motivo demasiado corto)', async () => {
    if (!hasCloudCredentials) return;

    const { error: err1 } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
      p_communication_id: null,
      p_reason: 'Motivo valido',
    });
    expect(err1).not.toBeNull();

    const dummyId = crypto.randomUUID();
    const { error: err2 } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
      p_communication_id: dummyId,
      p_reason: 'abc', // menor a 5 caracteres
    });
    expect(err2).not.toBeNull();
    expect(err2?.message).toMatch(/INVALID_ARGUMENT|mínimo 5 caracteres/i);
  });

  it('3. Comunicación inexistente es rechazada con P0002', async () => {
    if (!hasCloudCredentials) return;

    const nonExistentId = crypto.randomUUID();
    const { error } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
      p_communication_id: nonExistentId,
      p_reason: 'Reprocesar inexistente para testing',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/COMMUNICATION_NOT_FOUND/i);
  });

  it('4. Comunicación en estado "enviada" es rechazada estrictamente (no reenvío ciego)', async () => {
    if (!hasCloudCredentials) return;

    // Buscar una comunicación enviada real en la base de datos
    const { data: sentRows } = await supabaseAdmin
      .from('comunicaciones_pedido')
      .select('id, estado')
      .eq('estado', 'enviada')
      .not('sent_at', 'is', null)
      .limit(1);

    if (sentRows && sentRows.length > 0) {
      const sentId = sentRows[0].id;
      const { error } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
        p_communication_id: sentId,
        p_reason: 'Intento de reenviar comunicación ya enviada',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/CANNOT_REQUEUE_SENT/i);
    }
  });

  it('5. Flujo integral: comunicación fallida sin entrega -> requeue exitoso + audit log + bloqueo de duplicados', async () => {
    if (!hasCloudCredentials) return;

    const testFailedId = crypto.randomUUID();
    const testIdempotencyKey = `test_requeue_fixture:${Date.now()}`;
    const testEmail = 'test.requeue.fixture@tdf.gob.ar';

    // 1. Crear fila de prueba en estado 'fallida'
    const { error: insertErr } = await supabaseAdmin
      .from('comunicaciones_pedido')
      .insert({
        id: testFailedId,
        tipo_comunicacion: 'acceso_aprobado',
        destinatario_email: testEmail,
        estado: 'fallida',
        attempts: 1,
        max_attempts: 3,
        error_message: "Destinatario 'test.requeue.fixture@tdf.gob.ar' no está en la allowlist de pruebas autorizadas.",
        idempotency_key: testIdempotencyKey,
        sent_at: null,
        provider_message_id: null,
        payload: {
          user_id: '6c193ba5-13b5-4f34-b234-bfdc5a9522c6', // usuario Ezequiel (aprobado)
          nombre: 'Fixture',
          apellido: 'Requeue Test',
          app_role: 'administrador',
          nombre_usuario: 'fixture_requeue',
        },
      });

    expect(insertErr).toBeNull();

    try {
      // 2. Ejecutar requeue administrativo
      const reason = 'Resolución de allowlist de entorno — Reintento controlado de QA';
      const { data: requeueData, error: requeueErr } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
        p_communication_id: testFailedId,
        p_reason: reason,
      });

      expect(requeueErr).toBeNull();
      expect(requeueData?.success).toBe(true);
      expect(requeueData?.original_id).toBe(testFailedId);
      expect(requeueData?.requeued_id).toBeDefined();
      expect(requeueData?.estado).toBe('pendiente');

      const newCommId = requeueData.requeued_id;

      // 3. Verificar que la nueva fila fue creada como pendiente con trazabilidad
      const { data: newRow } = await supabaseAdmin
        .from('comunicaciones_pedido')
        .select('*')
        .eq('id', newCommId)
        .single();

      expect(newRow?.estado).toBe('pendiente');
      expect(newRow?.attempts).toBe(0);
      expect(newRow?.payload?.requeue_from_id).toBe(testFailedId);
      expect(newRow?.payload?.requeue_reason).toBe(reason);

      // 4. Verificar que la fila original preserva estado 'fallida' y registra requeued_as
      const { data: origRow } = await supabaseAdmin
        .from('comunicaciones_pedido')
        .select('*')
        .eq('id', testFailedId)
        .single();

      expect(origRow?.estado).toBe('fallida');
      expect(origRow?.payload?.requeued_as).toBe(newCommId);

      // 5. Verificar que se registró la acción en public.audit_log
      const { data: auditEntries } = await supabaseAdmin
        .from('audit_log')
        .select('*')
        .eq('recurso_id', testFailedId)
        .eq('accion', 'comunicacion.admin_requeue');

      expect(auditEntries).toBeDefined();
      expect(auditEntries?.length).toBeGreaterThanOrEqual(1);
      expect(auditEntries?.[0].metadata?.new_id).toBe(newCommId);

      // 6. Verificar salvaguarda anti-duplicados: un segundo requeue debe ser rechazado
      const { error: duplicateErr } = await supabaseAdmin.rpc('comunicacion_admin_requeue', {
        p_communication_id: testFailedId,
        p_reason: 'Segundo intento duplicado de requeue',
      });

      expect(duplicateErr).not.toBeNull();
      expect(duplicateErr?.message).toMatch(/DUPLICATE_REQUEUE/i);

      // Limpieza de fixture
      await supabaseAdmin.from('comunicaciones_pedido').delete().eq('id', newCommId);
    } finally {
      await supabaseAdmin.from('comunicaciones_pedido').delete().eq('id', testFailedId);
      await supabaseAdmin.from('audit_log').delete().eq('recurso_id', testFailedId);
    }
  });
});
