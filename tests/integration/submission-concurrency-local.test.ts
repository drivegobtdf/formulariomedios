/**
 * Test de Integración de Concurrencia, Idempotencia y Secuencia Global
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 *
 * Ejecuta pruebas de concurrencia real (20 workers concurrentes) con @supabase/supabase-js
 * contra la base de datos local Supabase.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuración local Supabase
const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54351';
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Guard obligatorio de seguridad
function assertLocalEnvironment(urlStr: string): void {
  const parsed = new URL(urlStr);
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (!isLocal) {
    throw new Error(
      `[SECURITY GUARD ABORT] Los tests de concurrencia solo pueden ejecutarse contra Supabase local (127.0.0.1 / localhost). Host detectado: ${parsed.hostname}`
    );
  }
}

describe('F4 Concurrency, Sequence & Idempotency Integration Tests', () => {
  let serviceClient: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(() => {
    assertLocalEnvironment(LOCAL_SUPABASE_URL);

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    anonClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('Caso 1: 20 creaciones concurrentes con submission_keys distintas -> 60 PEDs atómicos únicos sin colisiones', async () => {
    const N_WORKERS = 20;
    const promises = Array.from({ length: N_WORKERS }, (_, i) => {
      const submissionKey = crypto.randomUUID();
      const payload = {
        schema_version: 3,
        submission_key: submissionKey,
        contacto: {
          nombre_apellido: `Solicitante Concurrente ${i}`,
          telefono: `+5429014000${i.toString().padStart(2, '0')}`,
          correo: `concurrente.${i}@tierradelfuego.gob.ar`,
          area_solicitante: `Área Test ${i}`,
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'diseno_grafico',
            tipo_slug: 'flyer_rrss',
            informacion_especifica: { titulo: `Flyer C-${i}` },
          },
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'cobertura_eventos',
            tipo_slug: 'cobertura_eventos',
            informacion_especifica: { evento: `Evento C-${i}` },
          },
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'gacetilla',
            tipo_slug: 'gacetilla',
            informacion_especifica: { tema: `Gacetilla C-${i}` },
          },
        ],
      };

      return serviceClient.rpc('submission_create_core', { p_payload: payload });
    });

    const results = await Promise.all(promises);

    // Todas las creaciones deben ser exitosas
    for (const res of results) {
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
      expect(res.data.idempotent_replay).toBe(false);
      expect(res.data.pedidos).toHaveLength(3);
    }

    // Extraer todos los pedido_visible retornados (20 * 3 = 60)
    const allVisibles: string[] = [];
    for (const res of results) {
      for (const ped of res.data.pedidos) {
        allVisibles.push(ped.pedido_visible);
        expect(ped.tracking_token).toHaveLength(64);
        expect(ped.tracking_recovery_required).toBe(false);
      }
    }

    expect(allVisibles).toHaveLength(60);

    // Comprobar que todos los 60 identificadores visibles son únicos
    const uniqueVisibles = new Set(allVisibles);
    expect(uniqueVisibles.size).toBe(60);
  });

  it('Caso 2: 20 llamadas concurrentes con el MISMO submission_key y MISMO payload -> 1 creación + 19 replays idempotentes', async () => {
    const N_WORKERS = 20;
    const sameSubmissionKey = crypto.randomUUID();
    const clientRef1 = crypto.randomUUID();
    const clientRef2 = crypto.randomUUID();
    const clientRef3 = crypto.randomUUID();

    const canonicalPayload = {
      schema_version: 3,
      submission_key: sameSubmissionKey,
      contacto: {
        nombre_apellido: 'Idempotente Concurrente',
        telefono: '+542901999999',
        correo: 'idempotente.concurrente@tierradelfuego.gob.ar',
        area_solicitante: 'Dirección General de Tecnología',
      },
      pedidos: [
        {
          client_request_ref: clientRef1,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Flyer Idempotente' },
        },
        {
          client_request_ref: clientRef2,
          categoria_slug: 'cobertura_eventos',
          tipo_slug: 'cobertura_eventos',
          informacion_especifica: { evento: 'Evento Idempotente' },
        },
        {
          client_request_ref: clientRef3,
          categoria_slug: 'gacetilla',
          tipo_slug: 'gacetilla',
          informacion_especifica: { tema: 'Prensa Idempotente' },
        },
      ],
      material_links: [
        {
          url: 'https://drive.google.com/drive/folders/idempotente-test',
          descripcion: 'Materiales concurrentes',
          targets: 'all',
        },
      ],
    };

    const promises = Array.from({ length: N_WORKERS }, () =>
      serviceClient.rpc('submission_create_core', { p_payload: canonicalPayload })
    );

    const results = await Promise.all(promises);

    // Ninguna llamada debe arrojar error (advisory lock serializa y atiende replay sin errores)
    for (const res of results) {
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
    }

    const creations = results.filter((r) => r.data.idempotent_replay === false);
    const replays = results.filter((r) => r.data.idempotent_replay === true);

    // Exactamente 1 creación inicial y 19 replays
    expect(creations).toHaveLength(1);
    expect(replays).toHaveLength(N_WORKERS - 1);

    // La creación inicial tiene tracking_token de 64 caracteres
    const initialEnvioId = creations[0].data.envio_id;
    for (const ped of creations[0].data.pedidos) {
      expect(ped.tracking_token).toHaveLength(64);
      expect(ped.tracking_recovery_required).toBe(false);
    }

    // Los replays tienen tracking_token = null y tracking_recovery_required = true
    for (const rep of replays) {
      expect(rep.data.envio_id).toBe(initialEnvioId);
      expect(rep.data.pedidos).toHaveLength(3);
      for (const ped of rep.data.pedidos) {
        expect(ped.tracking_token).toBeNull();
        expect(ped.tracking_recovery_required).toBe(true);
      }
    }

    // Verificar en DB: exactamente 1 envío, 3 pedidos, 1 domain_event, 1 audit_log
    const { count: envioCount } = await serviceClient
      .from('envios_formulario')
      .select('*', { count: 'exact', head: true })
      .eq('submission_key', sameSubmissionKey);
    expect(envioCount).toBe(1);

    const { count: pedidosCount } = await serviceClient
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('envio_id', initialEnvioId);
    expect(pedidosCount).toBe(3);

    const { count: eventsCount } = await serviceClient
      .from('domain_events')
      .select('*', { count: 'exact', head: true })
      .eq('aggregate_id', initialEnvioId)
      .eq('event_name', 'submission.created');
    expect(eventsCount).toBe(1);

    const { count: auditCount } = await serviceClient
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('recurso_id', initialEnvioId)
      .eq('accion', 'submission.created');
    expect(auditCount).toBe(1);
  });

  it('Caso 3: Conflicto de Idempotencia con mismo submission_key pero payload diferente -> IDEMPOTENCY_CONFLICT', async () => {
    const conflictSubmissionKey = crypto.randomUUID();

    const originalPayload = {
      schema_version: 3,
      submission_key: conflictSubmissionKey,
      contacto: {
        nombre_apellido: 'Original Contenido',
        telefono: '+542901111111',
        correo: 'original@tierradelfuego.gob.ar',
        area_solicitante: 'Secretaría de Modernización',
      },
      pedidos: [
        {
          client_request_ref: crypto.randomUUID(),
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          informacion_especifica: { titulo: 'Flyer Original' },
        },
      ],
    };

    const conflictingPayload = {
      schema_version: 3,
      submission_key: conflictSubmissionKey,
      contacto: {
        nombre_apellido: 'Contenido Conflictivo Distinto',
        telefono: '+542901222222',
        correo: 'conflicto@tierradelfuego.gob.ar',
        area_solicitante: 'Secretaría de Modernización',
      },
      pedidos: [
        {
          client_request_ref: crypto.randomUUID(),
          categoria_slug: 'cobertura_eventos',
          tipo_slug: 'cobertura_eventos',
          informacion_especifica: { evento: 'Evento Distinto' },
        },
      ],
    };

    // 1. Envío original exitoso
    const res1 = await serviceClient.rpc('submission_create_core', { p_payload: originalPayload });
    expect(res1.error).toBeNull();
    expect(res1.data.idempotent_replay).toBe(false);

    // 2. Envío conflictivo con misma key -> Error IDEMPOTENCY_CONFLICT
    const res2 = await serviceClient.rpc('submission_create_core', { p_payload: conflictingPayload });
    expect(res2.error).toBeDefined();
    expect(res2.error?.message).toContain('IDEMPOTENCY_CONFLICT');
  });

  it('Caso 4: Replay Canónico Determinista (orden de keys, array o whitespace no alteran fingerprint)', async () => {
    const canonicalKey = crypto.randomUUID();
    const refA = crypto.randomUUID();
    const refB = crypto.randomUUID();

    // Payload A: orden normal
    const payloadA = {
      schema_version: 3,
      submission_key: canonicalKey,
      contacto: {
        nombre_apellido: 'Ana Gomez',
        telefono: '+542901333333',
        correo: 'ana.gomez@tierradelfuego.gob.ar',
        area_solicitante: 'Cultura',
      },
      pedidos: [
        {
          client_request_ref: refA,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
        },
        {
          client_request_ref: refB,
          categoria_slug: 'gacetilla',
          tipo_slug: 'gacetilla',
        },
      ],
    };

    // Payload B: diferente orden de array, mayúsculas y espacios en correo y contacto
    const payloadB = {
      pedidos: [
        {
          tipo_slug: 'gacetilla',
          categoria_slug: 'gacetilla',
          client_request_ref: refB,
        },
        {
          categoria_slug: 'diseno_grafico',
          client_request_ref: refA,
          tipo_slug: 'flyer_rrss',
        },
      ],
      contacto: {
        area_solicitante: 'Cultura',
        correo: '  ANA.GOMEZ@TIERRADELFUEGO.GOB.AR  ',
        telefono: '+542901333333',
        nombre_apellido: 'Ana Gomez',
      },
      submission_key: canonicalKey,
      schema_version: 3,
    };

    const resA = await serviceClient.rpc('submission_create_core', { p_payload: payloadA });
    expect(resA.error).toBeNull();
    expect(resA.data.idempotent_replay).toBe(false);

    const resB = await serviceClient.rpc('submission_create_core', { p_payload: payloadB });
    expect(resB.error).toBeNull();
    expect(resB.data.idempotent_replay).toBe(true);
    expect(resB.data.envio_id).toBe(resA.data.envio_id);
  });

  it('Caso 5: Browser roles (anon / public) tienen prohibido invocar submission_create_core (DENY)', async () => {
    const res = await anonClient.rpc('submission_create_core', {
      p_payload: { schema_version: 3 },
    });

    expect(res.error).toBeDefined();
    // PostgREST retorna 404 o 401/403/42501 cuando una función está revocada para el rol anon
    expect(res.data).toBeNull();
  });
});
