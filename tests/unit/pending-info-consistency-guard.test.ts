import { describe, it, expect } from 'vitest';

describe('Migration 044: Info Concurrency Hardening & Terminal State Guard (H1 & H2)', () => {
  interface SolicitudInfo {
    id: string;
    pedido_id: string;
    estado: 'pendiente' | 'respondida' | 'vencida';
    expires_at: string;
    respuesta_texto?: string;
  }

  interface PedidoState {
    id: string;
    estado: 'Nuevo' | 'En revisión' | 'En proceso' | 'Esperando información' | 'Finalizado' | 'Cancelado';
    version: number;
    responsable_user_id: string | null;
  }

  interface UserAcceso {
    user_id: string;
    nombre: string;
    app_role: 'administrador' | 'equipo' | 'observador';
    estado_acceso: 'aprobado' | 'pendiente' | 'rechazado' | 'revocado';
  }

  const mockUsers: UserAcceso[] = [
    { user_id: 'usr-admin-1', nombre: 'Admin', app_role: 'administrador', estado_acceso: 'aprobado' },
    { user_id: 'usr-equipo-1', nombre: 'Operador', app_role: 'equipo', estado_acceso: 'aprobado' },
    { user_id: 'usr-obs-1', nombre: 'Observador', app_role: 'observador', estado_acceso: 'aprobado' },
  ];

  // Emulación de lógica backend D1 + H1: Respuesta de solicitud de información con serialización sobre PED
  function simulateInfoResponse(params: {
    solicitudId: string;
    pedido: PedidoState;
    solicitudes: SolicitudInfo[];
    currentTime?: Date;
  }) {
    const { solicitudId, pedido, solicitudes, currentTime = new Date() } = params;
    const sol = solicitudes.find((s) => s.id === solicitudId);

    if (!sol) {
      throw new Error('SOLICITUD_NOT_FOUND: Solicitud no encontrada');
    }

    if (sol.estado === 'respondida') {
      return { success: true, idempotent: true, pedido_estado: pedido.estado };
    }

    if (currentTime.getTime() >= new Date(sol.expires_at).getTime()) {
      sol.estado = 'vencida';
      throw new Error('TOKEN_EXPIRED: La solicitud de información ha vencido tras 48 horas corridas');
    }

    // 1. Marcar como respondida
    sol.estado = 'respondida';

    // 2. H1: Serialización en public.pedidos FOR UPDATE
    // Con el lock de pedidos adquirido, evaluar si quedan solicitudes pendientes vigentes (< 48h)
    const hasOtherPendingAndValid = solicitudes.some((s) => {
      if (s.id === solicitudId) return false;
      const isPending = s.estado === 'pendiente';
      const isVigente = currentTime.getTime() < new Date(s.expires_at).getTime();
      return isPending && isVigente;
    });

    // 3. Transición segura: solo si el pedido sigue en 'Esperando información'
    if (!hasOtherPendingAndValid) {
      if (pedido.estado === 'Esperando información') {
        pedido.estado = 'En proceso';
        pedido.version += 1;
      }
    }

    return {
      success: true,
      solicitud_id: sol.id,
      pedido_estado: pedido.estado,
      pedido_version: pedido.version,
    };
  }

  // Emulación de lógica backend H2: info_request_create_atomic
  function simulateInfoRequestCreateAtomic(params: {
    actorUserId: string;
    pedido: PedidoState;
    solicitudId: string;
    mensaje: string;
    expectedVersion?: number | null;
    solicitudes: SolicitudInfo[];
    currentTime?: Date;
  }) {
    const { actorUserId, pedido, solicitudId, mensaje, expectedVersion, solicitudes, currentTime = new Date() } = params;

    const actor = mockUsers.find((u) => u.user_id === actorUserId);
    if (!actor || actor.estado_acceso !== 'aprobado' || !['administrador', 'equipo'].includes(actor.app_role)) {
      throw new Error('ROLE_FORBIDDEN: Rol no autorizado para solicitar información');
    }

    if (!mensaje || mensaje.trim().length < 5) {
      throw new Error('MESSAGE_REQUIRED: El mensaje de solicitud debe tener al menos 5 caracteres');
    }

    // H2 HARD GUARD: Rechazar explícitamente sobre estados terminales
    if (pedido.estado === 'Finalizado' || pedido.estado === 'Cancelado') {
      throw new Error(`INVALID_STATE: No se puede solicitar información sobre un pedido en estado ${pedido.estado}`);
    }

    // Control de concurrencia optimista si se provee expected_version
    if (expectedVersion !== undefined && expectedVersion !== null && pedido.version !== expectedVersion) {
      throw new Error(`VERSION_CONFLICT: El pedido fue modificado concurrentemente (esperada ${expectedVersion}, actual ${pedido.version})`);
    }

    const expiresAt = new Date(currentTime.getTime() + 48 * 3600 * 1000).toISOString();
    const newSol: SolicitudInfo = {
      id: solicitudId,
      pedido_id: pedido.id,
      estado: 'pendiente',
      expires_at: expiresAt,
    };
    solicitudes.push(newSol);

    return {
      success: true,
      solicitud_id: solicitudId,
      expires_at: expiresAt,
    };
  }

  // Emulación de lógica backend D2: Finalización de pedido (pedido_finalize)
  function simulatePedidoFinalize(params: {
    actorUserId: string;
    pedido: PedidoState;
    expectedVersion: number;
    solicitudes: SolicitudInfo[];
    urlEntrega?: string;
    archivosEntrega?: string[];
    currentTime?: Date;
  }) {
    const { actorUserId, pedido, expectedVersion, solicitudes, urlEntrega, archivosEntrega, currentTime = new Date() } = params;

    const actor = mockUsers.find((u) => u.user_id === actorUserId);
    if (!actor || actor.estado_acceso !== 'aprobado') {
      throw new Error('ACCESS_DENIED: Usuario no autenticado o no aprobado');
    }

    if (!['administrador', 'equipo'].includes(actor.app_role)) {
      throw new Error('ROLE_FORBIDDEN: Rol ' + actor.app_role + ' no autorizado para finalizar pedidos');
    }

    if (!urlEntrega && (!archivosEntrega || archivosEntrega.length === 0)) {
      throw new Error('DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega');
    }

    if (pedido.version !== expectedVersion) {
      throw new Error('VERSION_CONFLICT: Versión esperada ' + expectedVersion + ' no coincide con actual ' + pedido.version);
    }

    if (pedido.estado !== 'En proceso') {
      throw new Error('INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: ' + pedido.estado + ')');
    }

    if (!pedido.responsable_user_id) {
      throw new Error('RESPONSABLE_REQUIRED: El pedido debe tener un responsable asignado para avanzar por el circuito operativo');
    }

    const resp = mockUsers.find((u) => u.user_id === pedido.responsable_user_id);
    if (!resp || resp.estado_acceso !== 'aprobado' || !['administrador', 'equipo'].includes(resp.app_role)) {
      throw new Error('RESPONSABLE_REQUIRED: El responsable asignado no es un operador o administrador aprobado válido');
    }

    // D2 HARD GUARD: Rechazar si existen solicitudes de información pendientes y vigentes (< 48h)
    const hasPendingAndValidInfo = solicitudes.some((s) => {
      const isPending = s.estado === 'pendiente';
      const isVigente = currentTime.getTime() < new Date(s.expires_at).getTime();
      return isPending && isVigente;
    });

    if (hasPendingAndValidInfo) {
      throw new Error('PENDING_INFO_REQUEST: No se puede finalizar el pedido porque posee solicitudes de información pendientes y vigentes (48h)');
    }

    pedido.estado = 'Finalizado';
    pedido.version += 1;

    return {
      success: true,
      pedido_id: pedido.id,
      estado: 'Finalizado',
      version: pedido.version,
    };
  }

  // ===========================================================================
  // 11 REGRESSION SCENARIOS (SECCIÓN 11)
  // ===========================================================================

  it('1. Una sola solicitud pendiente -> se responde -> PED vuelve a En proceso', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-1',
      estado: 'Esperando información',
      version: 2,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-1',
        pedido_id: 'ped-reg-1',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
      },
    ];

    const result = simulateInfoResponse({
      solicitudId: 'sol-reg-1',
      pedido,
      solicitudes,
      currentTime: now,
    });

    expect(result.success).toBe(true);
    expect(result.pedido_estado).toBe('En proceso');
    expect(pedido.estado).toBe('En proceso');
    expect(pedido.version).toBe(3);
    expect(solicitudes[0].estado).toBe('respondida');
  });

  it('2. Dos solicitudes pendientes -> se responde solo una -> PED permanece en Esperando información', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-2',
      estado: 'Esperando información',
      version: 4,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-2a',
        pedido_id: 'ped-reg-2',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'sol-reg-2b',
        pedido_id: 'ped-reg-2',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 36 * 3600 * 1000).toISOString(),
      },
    ];

    const result = simulateInfoResponse({
      solicitudId: 'sol-reg-2a',
      pedido,
      solicitudes,
      currentTime: now,
    });

    expect(result.success).toBe(true);
    expect(result.pedido_estado).toBe('Esperando información');
    expect(pedido.estado).toBe('Esperando información');
    expect(pedido.version).toBe(4);
    expect(solicitudes[0].estado).toBe('respondida');
    expect(solicitudes[1].estado).toBe('pendiente');
  });

  it('3. Dos solicitudes respondidas concurrentemente (serialización sobre PED) -> PED vuelve a En proceso', async () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-3',
      estado: 'Esperando información',
      version: 1,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-3a',
        pedido_id: 'ped-reg-3',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
      },
      {
        id: 'sol-reg-3b',
        pedido_id: 'ped-reg-3',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
      },
    ];

    // Simulación de transacción con mutex de fila sobre `pedidos`
    let isPedidoLocked = false;
    const lockPedido = async () => {
      while (isPedidoLocked) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      isPedidoLocked = true;
    };
    const unlockPedido = () => {
      isPedidoLocked = false;
    };

    const runConcurrentResponse = async (solId: string) => {
      // 1. Lock solicitud
      // 2. Lock pedidos FOR UPDATE (serialización)
      await lockPedido();
      try {
        await new Promise((resolve) => setTimeout(resolve, 10)); // simular I/O
        return simulateInfoResponse({
          solicitudId: solId,
          pedido,
          solicitudes,
          currentTime: now,
        });
      } finally {
        unlockPedido();
      }
    };

    // Ejecutar T1 y T2 concurrentemente
    const [res1, res2] = await Promise.all([
      runConcurrentResponse('sol-reg-3a'),
      runConcurrentResponse('sol-reg-3b'),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(solicitudes[0].estado).toBe('respondida');
    expect(solicitudes[1].estado).toBe('respondida');
    expect(pedido.estado).toBe('En proceso');
    expect(pedido.version).toBe(2); // incrementada exactamente una vez
  });

  it('4. Solicitud residual vencida -> No bloquea el retorno a En proceso', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-4',
      estado: 'Esperando información',
      version: 5,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-4-expired',
        pedido_id: 'ped-reg-4',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() - 10 * 3600 * 1000).toISOString(), // expirada
      },
      {
        id: 'sol-reg-4-valid',
        pedido_id: 'ped-reg-4',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 10 * 3600 * 1000).toISOString(), // activa
      },
    ];

    const result = simulateInfoResponse({
      solicitudId: 'sol-reg-4-valid',
      pedido,
      solicitudes,
      currentTime: now,
    });

    expect(result.success).toBe(true);
    expect(result.pedido_estado).toBe('En proceso');
    expect(pedido.estado).toBe('En proceso');
    expect(pedido.version).toBe(6);
  });

  it('5. Respuesta tardía sobre PED que ya no está en Esperando información -> No modifica indebidamente el estado', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-5',
      estado: 'Finalizado',
      version: 7,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-5',
        pedido_id: 'ped-reg-5',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 5 * 3600 * 1000).toISOString(),
      },
    ];

    const result = simulateInfoResponse({
      solicitudId: 'sol-reg-5',
      pedido,
      solicitudes,
      currentTime: now,
    });

    expect(result.success).toBe(true);
    expect(solicitudes[0].estado).toBe('respondida');
    expect(pedido.estado).toBe('Finalizado'); // NO se modifica
    expect(pedido.version).toBe(7); // Versión NO incrementada indebidamente
  });

  it('6. Crear solicitud de información sobre PED Finalizado -> REJECT con INVALID_STATE', () => {
    const pedido: PedidoState = {
      id: 'ped-reg-6',
      estado: 'Finalizado',
      version: 3,
      responsable_user_id: 'usr-equipo-1',
    };

    expect(() =>
      simulateInfoRequestCreateAtomic({
        actorUserId: 'usr-equipo-1',
        pedido,
        solicitudId: 'sol-new-6',
        mensaje: 'Requerimiento de prueba sobre finalizado',
        solicitudes: [],
      })
    ).toThrowError(/INVALID_STATE.*Finalizado/i);
  });

  it('7. Crear solicitud de información sobre PED Cancelado -> REJECT con INVALID_STATE', () => {
    const pedido: PedidoState = {
      id: 'ped-reg-7',
      estado: 'Cancelado',
      version: 2,
      responsable_user_id: 'usr-equipo-1',
    };

    expect(() =>
      simulateInfoRequestCreateAtomic({
        actorUserId: 'usr-equipo-1',
        pedido,
        solicitudId: 'sol-new-7',
        mensaje: 'Requerimiento de prueba sobre cancelado',
        solicitudes: [],
      })
    ).toThrowError(/INVALID_STATE.*Cancelado/i);
  });

  it('8. Crear solicitud de información sobre estado permitido (Nuevo, En revisión, En proceso, Esperando información) -> PASS', () => {
    const allowedStates: Array<PedidoState['estado']> = ['Nuevo', 'En revisión', 'En proceso', 'Esperando información'];
    const solicitudes: SolicitudInfo[] = [];

    for (const st of allowedStates) {
      const pedido: PedidoState = {
        id: `ped-reg-8-${st}`,
        estado: st,
        version: 1,
        responsable_user_id: 'usr-equipo-1',
      };

      const result = simulateInfoRequestCreateAtomic({
        actorUserId: 'usr-equipo-1',
        pedido,
        solicitudId: `sol-reg-8-${st}`,
        mensaje: `Mensaje de solicitud válido para estado ${st}`,
        solicitudes,
      });

      expect(result.success).toBe(true);
      expect(result.solicitud_id).toBe(`sol-reg-8-${st}`);
    }
    expect(solicitudes.length).toBe(4);
  });

  it('9. Finalize vs info-request-create concurrente -> Preservar serialización confirmada', async () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-9',
      estado: 'En proceso',
      version: 2,
      responsable_user_id: 'usr-equipo-1',
    };
    const solicitudes: SolicitudInfo[] = [];

    let isPedidoLocked = false;
    const lockPedido = async () => {
      while (isPedidoLocked) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      isPedidoLocked = true;
    };
    const unlockPedido = () => {
      isPedidoLocked = false;
    };

    // Caso A: Finalize gana el lock primero
    await lockPedido();
    const finalizeRes = simulatePedidoFinalize({
      actorUserId: 'usr-equipo-1',
      pedido,
      expectedVersion: 2,
      solicitudes,
      urlEntrega: 'https://drive.google.com/entrega-ok',
      currentTime: now,
    });
    unlockPedido();

    expect(finalizeRes.success).toBe(true);
    expect(pedido.estado).toBe('Finalizado');
    expect(pedido.version).toBe(3);

    // Luego T2 (crear info) intenta ejecutarse tras desbloqueo
    expect(() =>
      simulateInfoRequestCreateAtomic({
        actorUserId: 'usr-equipo-1',
        pedido,
        solicitudId: 'sol-late-9',
        mensaje: 'Intento de crear info tras finalización',
        expectedVersion: 2,
        solicitudes,
      })
    ).toThrowError(/(INVALID_STATE|VERSION_CONFLICT)/i);
  });

  it('10. pedido_finalize con solicitud pendiente vigente -> REJECT con PENDING_INFO_REQUEST', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-10',
      estado: 'En proceso',
      version: 3,
      responsable_user_id: 'usr-equipo-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-10',
        pedido_id: 'ped-reg-10',
        estado: 'pendiente',
        expires_at: new Date(now.getTime() + 15 * 3600 * 1000).toISOString(),
      },
    ];

    expect(() =>
      simulatePedidoFinalize({
        actorUserId: 'usr-equipo-1',
        pedido,
        expectedVersion: 3,
        solicitudes,
        urlEntrega: 'https://drive.google.com/folder-123',
        currentTime: now,
      })
    ).toThrowError(/PENDING_INFO_REQUEST/i);
  });

  it('11. pedido_finalize sin solicitudes pendientes vigentes -> PASS y pasa a Finalizado', () => {
    const now = new Date();
    const pedido: PedidoState = {
      id: 'ped-reg-11',
      estado: 'En proceso',
      version: 1,
      responsable_user_id: 'usr-admin-1',
    };

    const solicitudes: SolicitudInfo[] = [
      {
        id: 'sol-reg-11-answered',
        pedido_id: 'ped-reg-11',
        estado: 'respondida',
        expires_at: new Date(now.getTime() + 10 * 3600 * 1000).toISOString(),
      },
    ];

    const result = simulatePedidoFinalize({
      actorUserId: 'usr-admin-1',
      pedido,
      expectedVersion: 1,
      solicitudes,
      urlEntrega: 'https://drive.google.com/folder-done',
      currentTime: now,
    });

    expect(result.success).toBe(true);
    expect(result.estado).toBe('Finalizado');
    expect(pedido.estado).toBe('Finalizado');
    expect(pedido.version).toBe(2);
  });
});
