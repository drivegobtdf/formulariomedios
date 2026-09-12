/**
 * Test de Integración Real de Autenticación y RLS contra Supabase Local
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 *
 * Utiliza @supabase/supabase-js contra el stack real de Supabase local (PostgREST + Auth).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

// Guard obligatorio: Asegurar que NUNCA se ejecute contra un entorno que no sea localhost / 127.0.0.1
function assertLocalEnvironment(urlStr: string): void {
  const parsed = new URL(urlStr);
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (!isLocal) {
    throw new Error(
      `[SECURITY GUARD ABORT] Los tests de integración solo pueden ejecutarse contra Supabase local (127.0.0.1 / localhost). Host detectado: ${parsed.hostname}`
    );
  }
}

describe('Auth & RLS Integration Tests contra Supabase Local Real', () => {
  let serviceClient: SupabaseClient;
  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  const testPassword = 'TestSecurePassword2026!';

  // Emails sintéticos para la corrida
  const adminEmail = `admin.integration.${runId}@example.invalid`;
  const teamEmail = `team.integration.${runId}@example.invalid`;
  const observerEmail = `observer.integration.${runId}@example.invalid`;
  const pendingEmail = `pending.integration.${runId}@example.invalid`;

  let adminUserId: string;
  let teamUserId: string;
  let observerUserId: string;
  let pendingUserId: string;

  const testEnvioId = crypto.randomUUID();
  const testPedidoId = crypto.randomUUID();
  const testNotaSolId = crypto.randomUUID();
  const testNotaIntId = crypto.randomUUID();

  beforeAll(async () => {
    assertLocalEnvironment(LOCAL_SUPABASE_URL);

    serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Crear usuario Admin sintético
    const { data: adminUser, error: errAdmin } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        nombre: 'Admin',
        apellido: 'Integ',
        nombre_usuario: `admin.integ.${runId}`,
      },
    });
    if (errAdmin || !adminUser.user) throw new Error(`Error creando admin fixture: ${errAdmin?.message}`);
    adminUserId = adminUser.user.id;

    // Aprobar admin en usuarios_acceso
    await serviceClient
      .from('usuarios_acceso')
      .update({ estado_acceso: 'aprobado', app_role: 'administrador' })
      .eq('user_id', adminUserId);

    // 2. Crear usuario Equipo sintético
    const { data: teamUser, error: errTeam } = await serviceClient.auth.admin.createUser({
      email: teamEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        nombre: 'Equipo',
        apellido: 'Integ',
        nombre_usuario: `team.integ.${runId}`,
      },
    });
    if (errTeam || !teamUser.user) throw new Error(`Error creando equipo fixture: ${errTeam?.message}`);
    teamUserId = teamUser.user.id;

    await serviceClient
      .from('usuarios_acceso')
      .update({ estado_acceso: 'aprobado', app_role: 'equipo' })
      .eq('user_id', teamUserId);

    // 3. Crear usuario Observador sintético
    const { data: obsUser, error: errObs } = await serviceClient.auth.admin.createUser({
      email: observerEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        nombre: 'Observador',
        apellido: 'Integ',
        nombre_usuario: `obs.integ.${runId}`,
      },
    });
    if (errObs || !obsUser.user) throw new Error(`Error creando observador fixture: ${errObs?.message}`);
    observerUserId = obsUser.user.id;

    await serviceClient
      .from('usuarios_acceso')
      .update({ estado_acceso: 'aprobado', app_role: 'observador' })
      .eq('user_id', observerUserId);

    // 4. Crear datos sintéticos de pedido y notas para lectura de tests
    const testFingerprint = crypto.createHash('sha256').update(`integ_${runId}`).digest('hex');

    await serviceClient.from('envios_formulario').upsert({
      id: testEnvioId,
      submission_key: crypto.randomUUID(),
      request_fingerprint: testFingerprint,
      nombre_apellido: 'Solicitante Integration',
      telefono: '+542901999999',
      correo: 'solicitante.integ@tierradelfuego.gob.ar',
      area_solicitante: 'Secretaría de Medios',
    });

    await serviceClient.from('pedidos').upsert({
      id: testPedidoId,
      envio_id: testEnvioId,
      client_request_ref: crypto.randomUUID(),
      pedido_visible: `PED-2026-D${Math.floor(100000 + Math.random() * 900000)}`,
      anio: 2026,
      numero: Math.floor(100000 + Math.random() * 900000),
      categoria_id: 'a0000001-0000-0000-0000-000000000001',
      tipo_servicio_id: 'b0000001-0000-0000-0000-000000000001',
      codigo_categoria: 'D',
      estado: 'Nuevo',
      tracking_token_hash: crypto.createHash('sha256').update(`tok_${runId}`).digest('hex'),
    });

    await serviceClient.from('notas_pedido').upsert([
      {
        id: testNotaSolId,
        pedido_id: testPedidoId,
        autor_user_id: teamUserId,
        visibilidad: 'solicitante',
        texto: 'Nota publica solicitante integ',
      },
      {
        id: testNotaIntId,
        pedido_id: testPedidoId,
        autor_user_id: teamUserId,
        visibilidad: 'interna',
        texto: 'Nota interna confidencial integ',
      },
    ]);
  });

  afterAll(async () => {
    // Limpieza de fixtures sintéticos
    if (serviceClient) {
      await serviceClient.from('notas_pedido').delete().eq('pedido_id', testPedidoId);
      await serviceClient.from('pedidos').delete().eq('id', testPedidoId);
      await serviceClient.from('envios_formulario').delete().eq('id', testEnvioId);

      if (adminUserId) await serviceClient.auth.admin.deleteUser(adminUserId);
      if (teamUserId) await serviceClient.auth.admin.deleteUser(teamUserId);
      if (observerUserId) await serviceClient.auth.admin.deleteUser(observerUserId);
      if (pendingUserId) await serviceClient.auth.admin.deleteUser(pendingUserId);
    }
  });

  function createAnonClient(): SupabaseClient {
    return createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: `sb_test_${crypto.randomUUID()}`,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Flujo A: Signup Real con Anon Key y Trigger de Base de Datos
  // ---------------------------------------------------------------------------
  it('Flujo A — Signup real: crea auth.user, trigger inicializa usuarios_acceso en estado pendiente', async () => {
    const anonClient = createAnonClient();
    const signupUsername = `signup.user.${runId}`;

    const { data, error } = await anonClient.auth.signUp({
      email: pendingEmail,
      password: testPassword,
      options: {
        data: {
          nombre: 'Pendiente',
          apellido: 'Integ',
          nombre_usuario: signupUsername,
        },
      },
    });

    expect(error).toBeNull();
    expect(data.user).toBeDefined();
    pendingUserId = data.user!.id;

    // Verificar en la base de datos (con serviceClient) que el trigger creó la fila en usuarios_acceso
    const { data: profile, error: profError } = await serviceClient
      .from('usuarios_acceso')
      .select('*')
      .eq('user_id', pendingUserId)
      .single();

    expect(profError).toBeNull();
    expect(profile).toBeDefined();
    expect(profile.estado_acceso).toBe('pendiente');
    expect(profile.app_role).toBe('observador');
    expect(profile.nombre_usuario).toBe(signupUsername);
    // Confirmar que la password no existe en usuarios_acceso
    expect(profile.password).toBeUndefined();
    expect(profile.encrypted_password).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Flujo B: Login Real con Usuario Aprobado
  // ---------------------------------------------------------------------------
  it('Flujo B — Login real: obtiene sesión JWT real y permite SELECT de pedidos', async () => {
    const client = createAnonClient();

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: teamEmail,
      password: testPassword,
    });

    expect(authError).toBeNull();
    expect(authData.session).toBeDefined();
    expect(authData.session?.user.id).toBe(teamUserId);

    // Con la sesión activa, realizar SELECT a pedidos
    const { data: pedidos, error: pedidosError } = await client
      .from('pedidos')
      .select('id, pedido_visible, estado')
      .eq('id', testPedidoId);

    expect(pedidosError).toBeNull();
    expect(pedidos).toBeDefined();
    expect(Array.isArray(pedidos)).toBe(true);
    expect(pedidos!.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Flujo C: Usuario en Estado Pendiente (Aislamiento de Perfil y Denegación de Pedidos)
  // ---------------------------------------------------------------------------
  it('Flujo C — Usuario pendiente: puede ver únicamente su propio perfil y tiene denegado el acceso a pedidos', async () => {
    const client = createAnonClient();

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: pendingEmail,
      password: testPassword,
    });

    expect(authError).toBeNull();
    expect(authData.session).toBeDefined();

    // 1. Puede consultar su propio perfil
    const { data: myProfile, error: profError } = await client
      .from('usuarios_acceso')
      .select('user_id, estado_acceso, app_role')
      .eq('user_id', pendingUserId);

    expect(profError).toBeNull();
    expect(myProfile).toBeDefined();
    expect(myProfile!.length).toBe(1);
    expect(myProfile![0].estado_acceso).toBe('pendiente');

    // 2. Consulta a pedidos devuelve 0 filas por RLS
    const { data: pedidos, error: pedidosError } = await client
      .from('pedidos')
      .select('id')
      .eq('id', testPedidoId);

    expect(pedidosError).toBeNull();
    expect(pedidos).toBeDefined();
    expect(pedidos!.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Flujo D: Observador Aprobado (Lectura Restringida y Denegación de Notas Internas y Mutaciones)
  // ---------------------------------------------------------------------------
  it('Flujo D — Observador: lee pedidos y notas de solicitante, pero no ve notas internas ni puede mutar', async () => {
    const obsClient = createAnonClient();

    const { error: authError } = await obsClient.auth.signInWithPassword({
      email: observerEmail,
      password: testPassword,
    });
    expect(authError).toBeNull();

    // 1. Lee pedidos (ALLOW)
    const { data: pedidos, error: pedError } = await obsClient
      .from('pedidos')
      .select('id, pedido_visible')
      .eq('id', testPedidoId);
    expect(pedError).toBeNull();
    expect(pedidos!.length).toBe(1);

    // 2. Lee notas de solicitante (ALLOW)
    const { data: notasSol, error: notSolError } = await obsClient
      .from('notas_pedido')
      .select('id, visibilidad, texto')
      .eq('id', testNotaSolId);
    expect(notSolError).toBeNull();
    expect(notasSol!.length).toBe(1);

    // 3. Lee notas internas (DENY / 0 filas visibles)
    const { data: notasInt, error: notIntError } = await obsClient
      .from('notas_pedido')
      .select('id, visibilidad, texto')
      .eq('id', testNotaIntId);
    expect(notIntError).toBeNull();
    expect(notasInt!.length).toBe(0);

    // 4. Intento de mutación directa en pedidos (DENY)
    const { error: insertError } = await obsClient
      .from('pedidos')
      .insert({
        pedido_visible: 'PED-2026-D999999',
        anio: 2026,
        numero: 999999,
        categoria_id: 'a0000001-0000-0000-0000-000000000001',
        tipo_servicio_id: 'b0000001-0000-0000-0000-000000000001',
        codigo_categoria: 'D',
        estado: 'Nuevo',
        tracking_token_hash: 'hash_test_obs',
      });
    expect(insertError).toBeDefined();
    expect(insertError?.code).toBe('42501');
  });

  // ---------------------------------------------------------------------------
  // Flujo E: Revocación Inmediata con el MISMO JWT (Sin Logout ni Refresh)
  // ---------------------------------------------------------------------------
  it('Flujo E — Revocación con MISMO JWT: usuario pierde acceso a pedidos inmediatamente tras ser revocado en DB', async () => {
    // 1. Login como Equipo
    const teamClient = createAnonClient();
    const { error: teamAuthErr } = await teamClient.auth.signInWithPassword({
      email: teamEmail,
      password: testPassword,
    });
    expect(teamAuthErr).toBeNull();

    // 2. Comprobar que inicialmente PUEDE leer pedidos
    const { data: pedidosAntes, error: errAntes } = await teamClient
      .from('pedidos')
      .select('id')
      .eq('id', testPedidoId);
    expect(errAntes).toBeNull();
    expect(pedidosAntes!.length).toBe(1);

    // 3. Login como Admin y revocar al usuario Equipo mediante la RPC administrativa
    const adminClient = createAnonClient();
    const { error: adminAuthErr } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: testPassword,
    });
    expect(adminAuthErr).toBeNull();

    const { data: rpcResult, error: rpcError } = await adminClient.rpc('admin_revoke_user', {
      p_user_id: teamUserId,
      p_motivo: 'Revocacion inmediata en test de integracion real',
    });
    expect(rpcError).toBeNull();
    expect(rpcResult?.estado_acceso).toBe('revocado');

    // 4. CON EL MISMO CLIENTE Y MISMO TOKEN JWT (sin signOut, sin refresh), repetir la consulta
    const { data: pedidosDespues, error: errDespues } = await teamClient
      .from('pedidos')
      .select('id')
      .eq('id', testPedidoId);

    expect(errDespues).toBeNull();
    // Debe devolver 0 filas: el RLS verifica en tiempo real usuarios_acceso.estado_acceso = 'aprobado'
    expect(pedidosDespues).toBeDefined();
    expect(pedidosDespues!.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Flujo F: Logout Real
  // ---------------------------------------------------------------------------
  it('Flujo F — Logout: signOut invalida la sesión local del cliente', async () => {
    const client = createAnonClient();

    await client.auth.signInWithPassword({
      email: observerEmail,
      password: testPassword,
    });

    const { error: signOutErr } = await client.auth.signOut();
    expect(signOutErr).toBeNull();

    const { data: sessionData } = await client.auth.getSession();
    expect(sessionData.session).toBeNull();
  });
});
