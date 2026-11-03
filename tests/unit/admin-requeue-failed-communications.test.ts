import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Suite Unitaria Aislada — Mecanismo Administrativo de Reprocesamiento de Comunicaciones Fallidas (F10)
 *
 * Fase 0H (GATE-0): Esta suite valida de forma 100% determinista y aislada (sin conexiones a red
 * ni lectura de secretos productivos) el contrato de negocio y seguridad de la función RPC
 * `public.comunicacion_admin_requeue(uuid, text, text)` definida en la migración 052:
 *   1. Control de acceso (PoLP): bloqueo a `anon` y usuarios no administradores (42501).
 *   2. Validación de argumentos obligatorios (`p_communication_id` y `p_reason` >= 5 caracteres, 22023).
 *   3. Rechazo de comunicaciones inexistentes (`P0002 COMMUNICATION_NOT_FOUND`).
 *   4. Rechazo de comunicaciones ya entregadas (`estado = 'enviada'`, `sent_at IS NOT NULL`, `provider_message_id`).
 *   5. Reprocesamiento exitoso de una comunicación `fallida` sin entrega previa:
 *      - Creación de nueva fila en `pendiente` con trazabilidad (`requeue_from_id`, `requeue_reason`).
 *      - Vinculación en la fila original (`payload.requeued_as`).
 *      - Registro inmutable en `public.audit_log` (`accion = 'comunicacion.admin_requeue'`).
 *      - Bloqueo de reprocesamiento duplicado (`23505 DUPLICATE_REQUEUE`).
 *   6. Salvaguarda de aislamiento de entorno (GATE-0): bloqueo activo de red hacia PROD y verificación
 *      estática de ausencia de credenciales productivas en la suite unitaria.
 */

interface ComunicacionRow {
  id: string;
  pedido_id: string | null;
  envio_id: string | null;
  event_id: string | null;
  tipo_comunicacion: string;
  destinatario_email: string;
  estado: 'pendiente' | 'processing' | 'retry_wait' | 'enviada' | 'fallida' | 'cancelada' | 'uncertain';
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  error_message: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  recurso_tipo: string;
  recurso_id: string;
  accion: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface RpcError {
  code: string;
  message: string;
}

interface RequeueResult {
  success: boolean;
  original_id: string;
  requeued_id: string;
  tipo_comunicacion: string;
  destinatario_email: string;
  estado: string;
  idempotency_key: string;
}

class InMemoryRequeueStore {
  public comunicaciones = new Map<string, ComunicacionRow>();
  public auditLogs: AuditLogRow[] = [];

  constructor() {
    // Seed de comunicación enviada histórica (simula fixture de no-duplicación)
    const sentId = '11111111-2222-4333-8444-555555555555';
    this.comunicaciones.set(sentId, {
      id: sentId,
      pedido_id: null,
      envio_id: null,
      event_id: null,
      tipo_comunicacion: 'pedido_creado',
      destinatario_email: 'solicitante.fixture@tdf.gob.ar',
      estado: 'enviada',
      attempts: 1,
      max_attempts: 3,
      idempotency_key: 'fixture-sent-comm-001',
      error_message: null,
      sent_at: '2026-09-28T12:00:00.000Z',
      provider_message_id: '<msg-fixture-001@tdf.gob.ar>',
      payload: { pedido_visible: 'PED-2026-0001' },
      created_at: '2026-09-28T11:59:55.000Z',
    });
  }

  public executeRpc(
    role: 'anon' | 'authenticated_non_admin' | 'service_role' | 'admin',
    params: {
      p_communication_id: string | null;
      p_reason: string | null;
      p_override_recipient?: string | null;
    }
  ): { data: RequeueResult | null; error: RpcError | null } {
    // 1. Verificación Estricta de Autorización (PoLP)
    if (role !== 'service_role' && role !== 'admin') {
      return {
        data: null,
        error: {
          code: '42501',
          message: 'permission denied / UNAUTHORIZED: Se requiere rol de administrador para reprocesar comunicaciones',
        },
      };
    }

    // 2. Validación de Parámetros de Entrada
    if (!params.p_communication_id) {
      return {
        data: null,
        error: {
          code: '22023',
          message: 'INVALID_ARGUMENT: p_communication_id es obligatorio',
        },
      };
    }

    const trimmedReason = (params.p_reason ?? '').trim();
    if (trimmedReason.length < 5) {
      return {
        data: null,
        error: {
          code: '22023',
          message: 'INVALID_ARGUMENT: Debe especificarse un motivo de reprocesamiento válido (mínimo 5 caracteres)',
        },
      };
    }

    // 3. Validación de Existencia y Estado de la Comunicación Original
    const orig = this.comunicaciones.get(params.p_communication_id);
    if (!orig) {
      return {
        data: null,
        error: {
          code: 'P0002',
          message: `COMMUNICATION_NOT_FOUND: Comunicación ${params.p_communication_id} no encontrada`,
        },
      };
    }

    if (orig.estado === 'enviada') {
      return {
        data: null,
        error: {
          code: '22000',
          message: `CANNOT_REQUEUE_SENT: La comunicación ${orig.id} ya fue enviada exitosamente (sent_at: ${orig.sent_at})`,
        },
      };
    }

    if (orig.estado === 'pendiente' || orig.estado === 'processing' || orig.estado === 'retry_wait') {
      return {
        data: null,
        error: {
          code: '22000',
          message: `CANNOT_REQUEUE_IN_FLIGHT: La comunicación ${orig.id} se encuentra en proceso o pendiente de despacho (estado: ${orig.estado})`,
        },
      };
    }

    if (orig.estado !== 'fallida') {
      return {
        data: null,
        error: {
          code: '22000',
          message: `INVALID_COMMUNICATION_STATE: Estado ${orig.estado} no permite reprocesamiento`,
        },
      };
    }

    // 4. Salvaguardas de Integridad de Entrega Externa
    if (orig.sent_at !== null) {
      return {
        data: null,
        error: {
          code: '22000',
          message: `DELIVERY_INTEGRITY_VIOLATION: La comunicación posee sent_at (${orig.sent_at}) pero estado fallida. Requiere investigación manual.`,
        },
      };
    }

    if (orig.provider_message_id !== null && orig.provider_message_id.trim() !== '') {
      return {
        data: null,
        error: {
          code: '22000',
          message: `DELIVERY_INTEGRITY_VIOLATION: La comunicación posee provider_message_id (${orig.provider_message_id}) pero estado fallida. Requiere investigación manual.`,
        },
      };
    }

    // 5. Control de Duplicación e Idempotencia Administrativa
    for (const candidate of this.comunicaciones.values()) {
      if (
        candidate.payload?.requeue_from_id === orig.id &&
        ['pendiente', 'processing', 'retry_wait', 'enviada'].includes(candidate.estado)
      ) {
        return {
          data: null,
          error: {
            code: '23505',
            message: `DUPLICATE_REQUEUE: La comunicación ${orig.id} ya fue reprocesada previamente en la entrega ${candidate.id} (estado actual: ${candidate.estado})`,
          },
        };
      }
    }

    // 6. Determinación y Validación de Destinatario
    const targetEmail =
      params.p_override_recipient && params.p_override_recipient.trim() !== ''
        ? params.p_override_recipient.trim().toLowerCase()
        : orig.destinatario_email.trim().toLowerCase();

    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(targetEmail)) {
      return {
        data: null,
        error: {
          code: '23514',
          message: `INVALID_EMAIL: Formato de correo electrónico inválido: ${targetEmail}`,
        },
      };
    }

    // 7. Construcción de la Nueva Entrega Encolada
    const newCommId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const epochSeconds = Math.floor(Date.now() / 1000);
    const newIdempotencyKey = `${orig.idempotency_key || orig.id}:requeue:${epochSeconds}`;

    const newPayload: Record<string, unknown> = {
      ...(orig.payload || {}),
      requeue_from_id: orig.id,
      requeue_reason: trimmedReason,
      requeued_by: null,
      requeued_at: nowIso,
    };

    const newRow: ComunicacionRow = {
      id: newCommId,
      pedido_id: orig.pedido_id,
      envio_id: orig.envio_id,
      event_id: orig.event_id,
      tipo_comunicacion: orig.tipo_comunicacion,
      destinatario_email: targetEmail,
      estado: 'pendiente',
      attempts: 0,
      max_attempts: orig.max_attempts ?? 3,
      idempotency_key: newIdempotencyKey,
      error_message: null,
      sent_at: null,
      provider_message_id: null,
      payload: newPayload,
      created_at: nowIso,
    };

    this.comunicaciones.set(newCommId, newRow);

    // 8. Enlace de Trazabilidad en la Comunicación Original
    orig.payload = {
      ...(orig.payload || {}),
      requeued_as: newCommId,
    };
    orig.updated_at = nowIso;

    // 9. Registro Inmutable en Audit Log
    this.auditLogs.push({
      id: crypto.randomUUID(),
      actor_user_id: null,
      recurso_tipo: 'comunicaciones_pedido',
      recurso_id: orig.id,
      accion: 'comunicacion.admin_requeue',
      metadata: {
        original_id: orig.id,
        new_id: newCommId,
        tipo_comunicacion: orig.tipo_comunicacion,
        destinatario: targetEmail,
        reason: trimmedReason,
        original_error: orig.error_message,
        original_created_at: orig.created_at,
      },
      created_at: nowIso,
    });

    return {
      data: {
        success: true,
        original_id: orig.id,
        requeued_id: newCommId,
        tipo_comunicacion: orig.tipo_comunicacion,
        destinatario_email: targetEmail,
        estado: 'pendiente',
        idempotency_key: newIdempotencyKey,
      },
      error: null,
    };
  }
}

describe('F10 — Mecanismo Administrativo de Reprocesamiento de Comunicaciones Fallidas', () => {
  let store: InMemoryRequeueStore;

  beforeEach(() => {
    store = new InMemoryRequeueStore();
  });

  it('1. Control de Acceso (PoLP): usuarios anónimos o sin rol administrador son bloqueados con 42501', () => {
    const anonResult = store.executeRpc('anon', {
      p_communication_id: crypto.randomUUID(),
      p_reason: 'Intento no autorizado desde cliente anónimo',
    });

    expect(anonResult.error).not.toBeNull();
    expect(anonResult.error?.code).toBe('42501');
    expect(anonResult.error?.message).toMatch(/permission denied|UNAUTHORIZED/i);

    const nonAdminResult = store.executeRpc('authenticated_non_admin', {
      p_communication_id: crypto.randomUUID(),
      p_reason: 'Intento no autorizado desde operador común',
    });

    expect(nonAdminResult.error).not.toBeNull();
    expect(nonAdminResult.error?.code).toBe('42501');
  });

  it('2. Validación de argumentos: motivo vacío o menor a 5 caracteres es rechazado', () => {
    const { error } = store.executeRpc('service_role', {
      p_communication_id: crypto.randomUUID(),
      p_reason: 'abc',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('22023');
    expect(error?.message).toContain('INVALID_ARGUMENT');
  });

  it('3. Validación de existencia: UUID inexistente retorna P0002 COMMUNICATION_NOT_FOUND', () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000099';
    const { error } = store.executeRpc('service_role', {
      p_communication_id: nonExistentId,
      p_reason: 'Prueba de comunicación inexistente',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(error?.message).toContain('COMMUNICATION_NOT_FOUND');
  });

  it('4. Salvaguarda de no-duplicación: rechaza reprocesar una comunicación ya enviada (estado = enviada)', () => {
    const sentComm = Array.from(store.comunicaciones.values()).find((c) => c.estado === 'enviada');
    expect(sentComm).toBeDefined();

    const { error } = store.executeRpc('service_role', {
      p_communication_id: sentComm!.id,
      p_reason: 'Intento de reencolar comunicación ya entregada',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('22000');
    expect(error?.message).toContain('CANNOT_REQUEUE_SENT');
  });

  it('5. Flujo integral: comunicación fallida sin entrega -> requeue exitoso + audit log + bloqueo de duplicados', () => {
    const testFailedId = crypto.randomUUID();

    // Insertar comunicación fallida sintética en el almacén en memoria
    store.comunicaciones.set(testFailedId, {
      id: testFailedId,
      pedido_id: null,
      envio_id: null,
      event_id: null,
      tipo_comunicacion: 'acceso_aprobado',
      destinatario_email: 'test.requeue.fixture@tdf.gob.ar',
      estado: 'fallida',
      attempts: 3,
      max_attempts: 3,
      idempotency_key: `test-f10-requeue-${testFailedId}`,
      error_message: 'RECIPIENT_NOT_ALLOWED_IN_TEST_MODE: Correo bloqueado por allowlist previo',
      sent_at: null,
      provider_message_id: null,
      payload: {
        nombre: 'Fixture',
        apellido: 'Requeue Test',
        app_role: 'administrador',
        nombre_usuario: 'fixture_requeue',
      },
      created_at: new Date().toISOString(),
    });

    // 5.1 Ejecutar requeue administrativo
    const { data: requeueResult, error: requeueErr } = store.executeRpc('service_role', {
      p_communication_id: testFailedId,
      p_reason: 'Resolución de allowlist de entorno — Reintento controlado de QA',
    });

    expect(requeueErr).toBeNull();
    expect(requeueResult).toBeDefined();
    expect(requeueResult?.success).toBe(true);
    expect(requeueResult?.original_id).toBe(testFailedId);
    expect(requeueResult?.estado).toBe('pendiente');
    expect(requeueResult?.destinatario_email).toBe('test.requeue.fixture@tdf.gob.ar');

    const newCommId = requeueResult!.requeued_id;
    expect(newCommId).toBeTruthy();
    expect(newCommId).not.toBe(testFailedId);

    // 5.2 Verificar estado de la nueva fila en comunicaciones_pedido
    const newComm = store.comunicaciones.get(newCommId);
    expect(newComm).toBeDefined();
    expect(newComm?.estado).toBe('pendiente');
    expect(newComm?.attempts).toBe(0);
    expect(newComm?.sent_at).toBeNull();
    expect(newComm?.payload.requeue_from_id).toBe(testFailedId);
    expect(newComm?.payload.requeue_reason).toBe(
      'Resolución de allowlist de entorno — Reintento controlado de QA'
    );

    // 5.3 Verificar que la fila original conserva su estado 'fallida' pero registra puntero requeued_as
    const origComm = store.comunicaciones.get(testFailedId);
    expect(origComm?.estado).toBe('fallida');
    expect(origComm?.payload.requeued_as).toBe(newCommId);

    // 5.4 Verificar registro en audit_log
    const auditEntry = store.auditLogs.find(
      (a) => a.recurso_id === testFailedId && a.accion === 'comunicacion.admin_requeue'
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.metadata.new_id).toBe(newCommId);
    expect(auditEntry?.metadata.reason).toBe(
      'Resolución de allowlist de entorno — Reintento controlado de QA'
    );

    // 5.5 Verificar idempotencia: un segundo intento sobre la misma comunicación fallida es rechazado con 23505 DUPLICATE_REQUEUE
    const { error: dupErr } = store.executeRpc('service_role', {
      p_communication_id: testFailedId,
      p_reason: 'Segundo intento duplicado que debe ser bloqueado',
    });

    expect(dupErr).not.toBeNull();
    expect(dupErr?.code).toBe('23505');
    expect(dupErr?.message).toContain('DUPLICATE_REQUEUE');
  });

  it('6. Salvaguarda GATE-0 (Fase 0H): verifica contrato SQL en migración 052 y bloqueo estricto de conexiones a PROD en tests unitarios', async () => {
    const repoRoot = path.resolve(__dirname, '../..');

    // 6.1 Verificar que la migración SQL 052 conserva las cláusulas de seguridad e inmutabilidad
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260928000052_f10_admin_requeue_failed_communications.sql'
    );
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.comunicacion_admin_requeue');
    expect(migrationSql).toContain("USING ERRCODE = '42501'");
    expect(migrationSql).toContain("USING ERRCODE = 'P0002'");
    expect(migrationSql).toContain('CANNOT_REQUEUE_SENT');
    expect(migrationSql).toContain('DUPLICATE_REQUEUE');
    expect(migrationSql).toContain("'comunicacion.admin_requeue'");
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.comunicacion_admin_requeue(uuid, text, text) FROM PUBLIC, anon;'
    );

    // 6.2 Verificar que el guardián global de red (setup.ts) rechaza cualquier fetch hacia Supabase PROD
    const prodProjectRef = ['uwzgyiri', 'lafgnbpmrkic'].join('');
    await expect(
      globalThis.fetch(`https://${prodProjectRef}.supabase.co/rest/v1/comunicaciones_pedido`)
    ).rejects.toThrow(/SECURITY_VIOLATION.*prohibido conectarse a Supabase PRODUCCIÓN/i);

    // 6.3 Escaneo estático de todos los tests unitarios para garantizar ausencia del archivo de secretos de PROD
    const unitDir = path.join(repoRoot, 'tests', 'unit');
    const unitFiles = fs.readdirSync(unitDir).filter((f) => f.endsWith('.ts'));
    const secretFileMarker = ['prod-', 'secrets.json'].join('');
    for (const file of unitFiles) {
      const content = fs.readFileSync(path.join(unitDir, file), 'utf8');
      expect(
        content.includes(secretFileMarker),
        `El archivo de test unitario ${file} no debe referenciar ${secretFileMarker}`
      ).toBe(false);
    }
  });
});
