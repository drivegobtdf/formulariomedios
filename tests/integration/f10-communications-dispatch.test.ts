/**
 * Test de Integración: F10 Outbox Queue, Plantillas y Despachador de Comunicaciones
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Edge Functions Handlers & Shared Templates
import comunicacionesDispatchHandler from '../../supabase/functions/comunicaciones-dispatch/index.ts';
import {
  renderSubmissionCreatedEmail,
  renderInfoRequestedEmail,
  renderFinalizedEmail,
  renderCancelledEmail,
  renderMagicLinkEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';

const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('F10 Communications Outbox, Templates & Dispatcher - Integration Tests', () => {
  let serviceClient: SupabaseClient;
  const randomSuffix = Math.floor(Math.random() * 800000) + 100000;
  const testEmail = `solicitante.f10.${randomSuffix}@tdf.gob.ar`;

  let envioId: string;
  let pedido1Id: string;
  let pedido1Visible: string;
  let pedido2Id: string;
  let pedido2Visible: string;

  beforeAll(async () => {
    process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create a Multi-PED submission
    const clientRef1 = crypto.randomUUID();
    const clientRef2 = crypto.randomUUID();
    const subPayload = {
      schema_version: 3,
      submission_key: crypto.randomUUID(),
      contacto: {
        nombre_apellido: 'Solicitante F10 Test',
        telefono: '+542901445566',
        correo: testEmail,
        area_solicitante: 'Subsecretaría de Modernización',
      },
      pedidos: [
        {
          client_request_ref: clientRef1,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Campaña F10 Servicio 1' },
        },
        {
          client_request_ref: clientRef2,
          categoria_slug: 'cobertura_eventos',
          tipo_slug: 'cobertura_eventos',
          informacion_especifica: { evento: 'Campaña F10 Servicio 2' },
        },
      ],
    };

    const { data: subData, error: subErr } = await serviceClient.rpc('submission_create_core', {
      p_payload: subPayload,
    });

    expect(subErr).toBeNull();
    expect(subData?.envio_id).toBeDefined();
    expect(subData?.pedidos).toHaveLength(2);

    envioId = subData.envio_id;
    pedido1Id = subData.pedidos[0].id;
    pedido1Visible = subData.pedidos[0].pedido_visible;
    pedido2Id = subData.pedidos[1].id;
    pedido2Visible = subData.pedidos[1].pedido_visible;
  });

  describe('1. Outbox Ledger Enqueue & Multi-PED Grouping (REQ-F10-01, REQ-F10-03)', () => {
    it('automatically created a single grouped outbox communication for the submission', async () => {
      const { data: comms, error } = await serviceClient
        .from('comunicaciones_pedido')
        .select('*')
        .eq('envio_id', envioId)
        .eq('tipo_comunicacion', 'pedido_ingresado');

      expect(error).toBeNull();
      expect(comms).toHaveLength(1);

      const comm = comms![0];
      expect(comm.estado).toBe('pendiente');
      expect(comm.attempts).toBe(0);
      expect(comm.destinatario_email).toBe(testEmail.toLowerCase());
      expect(comm.idempotency_key).toBe(`submission_created:${envioId}`);

      const payload = comm.payload as Record<string, any>;
      expect(payload.pedidos_count).toBe(2);
      expect(Array.isArray(payload.pedidos)).toBe(true);
      expect(payload.pedidos).toHaveLength(2);

      const codes = payload.pedidos.map((p: any) => p.pedido_visible);
      expect(codes).toContain(pedido1Visible);
      expect(codes).toContain(pedido2Visible);
    });
  });

  describe('2. Email Templates Validation (REQ-F10-01, REQ-F10-02, REQ-F10-04)', () => {
    it('renders multi-PED submission created email with visible codes and single primary CTA with access_token', () => {
      const rendered = renderSubmissionCreatedEmail({
        nombre_apellido: 'Pablo Saldivia',
        raw_token: 'tok_access_fake_123',
        pedidos: [
          { id: 'p1', pedido_visible: 'PED-2026-D000001', categoria: 'Diseño Gráfico', tipo: 'Flyer' },
          { id: 'p2', pedido_visible: 'PED-2026-A000002', categoria: 'Audiovisual', tipo: 'Video' },
        ],
      });

      expect(rendered.subject).toContain('[PEDIDOS] Solicitud recibida: PED-2026-D000001, PED-2026-A000002');
      expect(rendered.html).toContain('PED-2026-D000001');
      expect(rendered.html).toContain('PED-2026-A000002');
      expect(rendered.html).toContain('Ver mis solicitudes');
      expect(rendered.html).toContain('mis-solicitudes#access_token=tok_access_fake_123');
      expect(rendered.html).toContain('GOBIERNO DE TIERRA DEL FUEGO AIAS');
      expect(rendered.n8nTipo).toBe('pedido_ingresado');
    });

    it('renders missing info request email with prominent 48h notice', () => {
      const rendered = renderInfoRequestedEmail({
        pedido_id: 'p1',
        pedido_visible: 'PED-2026-D000001',
        nombre_apellido: 'Pablo Saldivia',
        motivo: 'Falta adjuntar el manual de marca en PDF',
        raw_token: 'info_tok_xyz',
      });

      expect(rendered.subject).toContain('[PEDIDOS] Requerimiento de Información (48h): PED-2026-D000001');
      expect(rendered.html).toContain('48 horas corridas');
      expect(rendered.html).toContain('Falta adjuntar el manual de marca en PDF');
      expect(rendered.html).toContain('solicitud-informacion#token=info_tok_xyz');
      expect(rendered.html).toContain('Responder requerimiento');
      expect(rendered.n8nTipo).toBe('informacion_faltante');
    });

    it('renders finalized email with delivery link and completion notes', () => {
      const rendered = renderFinalizedEmail({
        pedido_id: 'p1',
        pedido_visible: 'PED-2026-D000001',
        nombre_apellido: 'Pablo Saldivia',
        url_entrega: 'https://drive.google.com/drive/folders/final_folder_123',
        nota_cierre: 'Entregados archivos editables e impresos.',
      });

      expect(rendered.subject).toContain('[PEDIDOS] Solicitud Finalizada: PED-2026-D000001');
      expect(rendered.html).toContain('https://drive.google.com/drive/folders/final_folder_123');
      expect(rendered.html).toContain('Entregados archivos editables e impresos.');
      expect(rendered.n8nTipo).toBe('finalizado');
    });

    it('renders cancelled email with explicit cancellation reason', () => {
      const rendered = renderCancelledEmail({
        pedido_id: 'p1',
        pedido_visible: 'PED-2026-D000001',
        nombre_apellido: 'Pablo Saldivia',
        motivo_cancelacion: 'Plazo de 48 horas vencido sin respuesta del solicitante',
      });

      expect(rendered.subject).toContain('[PEDIDOS] Solicitud Cancelada: PED-2026-D000001');
      expect(rendered.html).toContain('Plazo de 48 horas vencido sin respuesta del solicitante');
      expect(rendered.n8nTipo).toBe('cancelado');
    });

    it('renders single-use magic link email for citizen portal access', () => {
      const rendered = renderMagicLinkEmail({
        nombre_apellido: 'Pablo Saldivia',
        raw_token: 'magic_token_abc_123',
      });

      expect(rendered.subject).toContain('[PEDIDOS] Enlace Seguro de Acceso a Mis Solicitudes');
      expect(rendered.html).toContain('mis-solicitudes#token=magic_token_abc_123');
      expect(rendered.html).toContain('uso único');
    });
  });

  describe('3. Concurrency Claiming & Result Processing (REQ-F10-03, REQ-F10-06)', () => {
    it('claims pending items atomically with FOR UPDATE SKIP LOCKED', async () => {
      // Create a fresh pending item to test atomic claim
      const freshCommId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: freshCommId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'pedido_ingresado',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 3,
        idempotency_key: `fresh_claim:${freshCommId}`,
        payload: { test: 'fresh_claim' },
      });

      const { data: claimed, error } = await serviceClient.rpc('comunicacion_claim_batch', {
        p_batch_size: 100,
      });

      expect(error).toBeNull();
      expect(claimed).toBeDefined();

      const item = claimed.find((c: any) => c.id === freshCommId);
      expect(item).toBeDefined();
      expect(item.estado).toBe('processing');
      expect(item.attempts).toBe(1);

      // Verify row state in DB
      const { data: dbItem } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, attempts')
        .eq('id', item.id)
        .single();

      expect(dbItem?.estado).toBe('processing');
      expect(dbItem?.attempts).toBe(1);

      // Mark result as sent
      const { data: markRes, error: markErr } = await serviceClient.rpc('comunicacion_mark_result', {
        p_id: item.id,
        p_claim_id: item.claim_id,
        p_success: true,
        p_provider_msg_id: 'provider_msg_test_abc123',
        p_error: null,
        p_retry_seconds: null,
      });

      expect(markErr).toBeNull();
      expect(markRes?.success).toBe(true);
      expect(markRes?.estado).toBe('enviada');

      // Verify in DB
      const { data: sentItem } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, provider_message_id, sent_at')
        .eq('id', item.id)
        .single();

      expect(sentItem?.estado).toBe('enviada');
      expect(sentItem?.provider_message_id).toBe('provider_msg_test_abc123');
      expect(sentItem?.sent_at).toBeDefined();
    });

    it('handles transient errors and exponential backoff via retry_wait and max_attempts', async () => {
      // Clear previous items to isolate test item
      await serviceClient
        .from('comunicaciones_pedido')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Create a test communication row
      const testCommId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: testCommId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'informacion_faltante',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 3,
        idempotency_key: `retry_test:${testCommId}`,
        payload: { motivo: 'Test retry' },
      });

      // Claim it
      const { data: claimed } = await serviceClient.rpc('comunicacion_claim_batch', {
        p_batch_size: 100,
      });
      const found = claimed?.find((c: any) => c.id === testCommId);
      expect(found).toBeDefined();
      expect(found.estado).toBe('processing');
      expect(found.attempts).toBe(1);

      // Mark failure with 300s retry
      await serviceClient.rpc('comunicacion_mark_result', {
        p_id: testCommId,
        p_claim_id: found.claim_id,
        p_success: false,
        p_provider_msg_id: null,
        p_error: 'Simulated 503 Provider Unavailable',
        p_retry_seconds: 300,
      });

      const { data: retryItem } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, error_message, retry_after')
        .eq('id', testCommId)
        .single();

      expect(retryItem?.estado).toBe('retry_wait');
      expect(retryItem?.error_message).toBe('Simulated 503 Provider Unavailable');
      expect(retryItem?.retry_after).toBeDefined();

      // Test max_attempts exhaustion by creating an item with max_attempts: 1
      const finalCommId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: finalCommId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'informacion_faltante',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 1,
        idempotency_key: `retry_final_test:${finalCommId}`,
        payload: { motivo: 'Test final attempt exhaustion' },
      });

      // Claim it (attempts becomes 1)
      const { data: claimedFinal } = await serviceClient.rpc('comunicacion_claim_batch', {
        p_batch_size: 100,
      });
      const foundFinal = claimedFinal?.find((c: any) => c.id === finalCommId);
      expect(foundFinal).toBeDefined();
      expect(foundFinal.attempts).toBe(1);

      // Mark failure -> attempts (1) >= max_attempts (1) -> should transition to fallida
      const { data: markFailRes, error: markFailErr } = await serviceClient.rpc('comunicacion_mark_result', {
        p_id: finalCommId,
        p_success: false,
        p_provider_msg_id: null,
        p_error: 'Final Attempt Failed',
        p_retry_seconds: 300,
        p_claim_id: foundFinal.claim_id,
      });

      expect(markFailErr).toBeNull();
      expect(markFailRes?.status).toBe('fallida');

      const { data: failedItem } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, error_message, attempts, max_attempts')
        .eq('id', finalCommId)
        .single();

      expect(failedItem?.estado).toBe('fallida');
      expect(failedItem?.error_message).toBe('Final Attempt Failed');
    });
  });

  describe('4. Edge Function Handler: comunicaciones-dispatch (REQ-F10-05, REQ-F10-07)', () => {
    it('dispatches communications and handles HTTP responses with valid auth', async () => {
      const testDispatchSecret = 'test_dispatch_secret_32_bytes_long_fixture!';
      process.env.N8N_DISPATCH_SECRET = testDispatchSecret;

      // Clear previous items to isolate test item
      await serviceClient
        .from('comunicaciones_pedido')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Mock global fetch for n8n webhook
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : (input?.url || input?.toString() || '');
        if (urlStr.includes('pedidos-email')) {
          return new Response(
            JSON.stringify({
              success: true,
              message_id: 'n8n_gmail_msg_mock_999',
              id: 'n8n_gmail_msg_mock_999',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      });

      try {
        // Create an item to dispatch
        const commId = crypto.randomUUID();
        await serviceClient.from('comunicaciones_pedido').insert({
          id: commId,
          pedido_id: pedido2Id,
          envio_id: envioId,
          tipo_comunicacion: 'finalizado',
          destinatario_email: testEmail,
          estado: 'pendiente',
          attempts: 0,
          max_attempts: 3,
          idempotency_key: `edge_fn_test:${commId}`,
          payload: { pedido_visible: pedido2Visible, url_entrega: 'https://drive.google.com/test' },
        });

        const req = new Request('http://localhost/comunicaciones-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pedidos-dispatch-secret': testDispatchSecret,
          },
          body: JSON.stringify({ batch_size: 100 }),
        });

        const res = await comunicacionesDispatchHandler(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.processed).toBeGreaterThanOrEqual(1);

        const itemRes = data.results?.find((r: any) => r.id === commId);
        expect(itemRes?.success).toBe(true);
        expect(itemRes?.provider_message_id).toBe('n8n_gmail_msg_mock_999');

        // Check DB
        const { data: dbItem } = await serviceClient
          .from('comunicaciones_pedido')
          .select('estado, provider_message_id')
          .eq('id', commId)
          .single();

        expect(dbItem?.estado).toBe('enviada');
        expect(dbItem?.provider_message_id).toBe('n8n_gmail_msg_mock_999');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('5. Dispatcher Dedicated Authentication & Security Hardening (Tests A–G)', () => {
    const validSecret = 'f10_dedicated_dispatch_secret_fixture_value_123';
    const integrationSecret = 'f10_reverse_n8n_integration_secret_fixture_456';

    beforeAll(() => {
      process.env.N8N_DISPATCH_SECRET = validSecret;
      process.env.N8N_INTEGRATION_SECRET = integrationSecret;
    });

    it('Test A: rejects invocation without authentication header with 401 and zero mutations', async () => {
      // Insert a pending item
      const pendingId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: pendingId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'informacion_faltante',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 3,
        idempotency_key: `test_a:${pendingId}`,
        payload: { test: 'test_a' },
      });

      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('UNAUTHORIZED');

      // Verify zero DB modifications (item still pendiente, attempts = 0, claim_id = null)
      const { data: item } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, attempts, claim_id')
        .eq('id', pendingId)
        .single();

      expect(item?.estado).toBe('pendiente');
      expect(item?.attempts).toBe(0);
      expect(item?.claim_id).toBeNull();
    });

    it('Test B: rejects invocation with empty header with 401 and zero mutations', async () => {
      const pendingId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: pendingId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'informacion_faltante',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 3,
        idempotency_key: `test_b:${pendingId}`,
        payload: { test: 'test_b' },
      });

      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pedidos-dispatch-secret': '   ',
        },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('UNAUTHORIZED');

      const { data: item } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, attempts, claim_id')
        .eq('id', pendingId)
        .single();

      expect(item?.estado).toBe('pendiente');
      expect(item?.attempts).toBe(0);
      expect(item?.claim_id).toBeNull();
    });

    it('Test C: rejects invocation with wrong secret with 403 and zero mutations', async () => {
      const pendingId = crypto.randomUUID();
      await serviceClient.from('comunicaciones_pedido').insert({
        id: pendingId,
        pedido_id: pedido1Id,
        envio_id: envioId,
        tipo_comunicacion: 'informacion_faltante',
        destinatario_email: testEmail,
        estado: 'pendiente',
        attempts: 0,
        max_attempts: 3,
        idempotency_key: `test_c:${pendingId}`,
        payload: { test: 'test_c' },
      });

      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pedidos-dispatch-secret': 'incorrect_malicious_secret_value',
        },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('FORBIDDEN');

      const { data: item } = await serviceClient
        .from('comunicaciones_pedido')
        .select('estado, attempts, claim_id')
        .eq('id', pendingId)
        .single();

      expect(item?.estado).toBe('pendiente');
      expect(item?.attempts).toBe(0);
      expect(item?.claim_id).toBeNull();
    });

    it('Test D: rejects invocation with reverse N8N_INTEGRATION_SECRET with 403', async () => {
      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pedidos-dispatch-secret': integrationSecret,
        },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('FORBIDDEN');
    });

    it('Test E: rejects invocation with Supabase anon key only without dispatch header with 401', async () => {
      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LOCAL_ANON_KEY}`,
          apikey: LOCAL_ANON_KEY,
        },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('UNAUTHORIZED');
    });

    it('Test F: returns 500 CONFIGURATION_ERROR if server secret is not configured', async () => {
      const originalSecret = process.env.N8N_DISPATCH_SECRET;
      delete process.env.N8N_DISPATCH_SECRET;

      try {
        const req = new Request('http://localhost/comunicaciones-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pedidos-dispatch-secret': 'some_secret',
          },
          body: JSON.stringify({ batch_size: 10 }),
        });

        const res = await comunicacionesDispatchHandler(req);
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('CONFIGURATION_ERROR');
      } finally {
        process.env.N8N_DISPATCH_SECRET = originalSecret;
      }
    });

    it('Test G: accepts authorized request with valid secret with 200', async () => {
      const req = new Request('http://localhost/comunicaciones-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pedidos-dispatch-secret': validSecret,
        },
        body: JSON.stringify({ batch_size: 10 }),
      });

      const res = await comunicacionesDispatchHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
