import { describe, it, expect } from 'vitest';

describe('Mandatory Responsable Guard & Hardened Finalize — Reglas de Asignación y Circuito Operativo', () => {
  interface UserAcceso {
    user_id: string;
    nombre: string;
    app_role: 'administrador' | 'equipo' | 'observador';
    estado_acceso: 'aprobado' | 'pendiente' | 'rechazado' | 'revocado';
  }

  interface ArchivoMock {
    id: string;
    estado: 'pending_scan' | 'verified' | 'quarantined';
    pedido_id?: string;
  }

  const mockUsers: UserAcceso[] = [
    { user_id: 'usr-admin-1', nombre: 'Admin', app_role: 'administrador', estado_acceso: 'aprobado' },
    { user_id: 'usr-equipo-1', nombre: 'Operador', app_role: 'equipo', estado_acceso: 'aprobado' },
    { user_id: 'usr-obs-1', nombre: 'Observador', app_role: 'observador', estado_acceso: 'aprobado' },
    { user_id: 'usr-pend-1', nombre: 'Pendiente', app_role: 'equipo', estado_acceso: 'pendiente' },
    { user_id: 'usr-rev-1', nombre: 'Revocado', app_role: 'equipo', estado_acceso: 'revocado' },
  ];

  const mockArchivos: ArchivoMock[] = [
    { id: 'arch-verified-ped1', estado: 'verified', pedido_id: 'ped-1' },
    { id: 'arch-pending-ped1', estado: 'pending_scan', pedido_id: 'ped-1' },
    { id: 'arch-other-ped2', estado: 'verified', pedido_id: 'ped-2' },
  ];

  // Emulación fiel de private.validate_operational_assignee
  function validateOperationalAssignee(userId: string | null | undefined, users: UserAcceso[]): boolean {
    if (!userId) {
      throw new Error('RESPONSABLE_REQUIRED: El pedido debe tener un responsable asignado para avanzar por el circuito operativo');
    }

    const user = users.find((u) => u.user_id === userId);
    if (!user || user.estado_acceso !== 'aprobado' || !['administrador', 'equipo'].includes(user.app_role)) {
      throw new Error('RESPONSABLE_REQUIRED: El responsable asignado no es un operador o administrador aprobado válido');
    }

    return true;
  }

  // Emulación fiel del flujo de validación de pedido_change_state
  function simulatePedidoChangeState(params: {
    currentState: string;
    targetState: string;
    responsableUserId?: string | null;
    motivo?: string;
  }) {
    const { currentState, targetState, responsableUserId, motivo } = params;

    const operationalStates = ['En revisión', 'En proceso', 'Esperando información'];

    // Hard guard si el estado objetivo es operativo
    if (operationalStates.includes(targetState)) {
      validateOperationalAssignee(responsableUserId, mockUsers);
    }

    // Matriz de transiciones
    if (currentState === 'Nuevo') {
      if (targetState === 'En revisión') {
        return { success: true, estado: 'En revisión' };
      } else if (targetState === 'Cancelado') {
        if (!motivo || motivo.trim().length < 3) {
          throw new Error('CANCEL_REASON_REQUIRED');
        }
        return { success: true, estado: 'Cancelado' };
      } else {
        throw new Error(`INVALID_TRANSITION: No se permite transición directa de ${currentState} a ${targetState}`);
      }
    }

    if (currentState === 'En revisión') {
      if (!['En proceso', 'Esperando información', 'Cancelado'].includes(targetState)) {
        throw new Error(`INVALID_TRANSITION: No se permite transición directa de ${currentState} a ${targetState}`);
      }
      return { success: true, estado: targetState };
    }

    if (currentState === 'En proceso') {
      if (targetState === 'Finalizado') {
        throw new Error('USE_PEDIDO_FINALIZE');
      }
      if (!['En revisión', 'Esperando información', 'Cancelado'].includes(targetState)) {
        throw new Error(`INVALID_TRANSITION: No se permite transición directa de ${currentState} a ${targetState}`);
      }
      return { success: true, estado: targetState };
    }

    if (currentState === 'Esperando información') {
      if (!['En revisión', 'En proceso', 'Cancelado'].includes(targetState)) {
        throw new Error(`INVALID_TRANSITION: No se permite transición directa de ${currentState} a ${targetState}`);
      }
      return { success: true, estado: targetState };
    }

    throw new Error('UNKNOWN_STATE');
  }

  // Emulación fiel de pedido_finalize (Hardened Migration 040)
  function simulatePedidoFinalize(params: {
    pedidoId?: string;
    currentState: string;
    responsableUserId?: string | null;
    archivosEntrega?: string[] | null;
    urlEntrega?: string | null;
    notaEntrega?: string | null;
  }) {
    const {
      pedidoId = 'ped-1',
      currentState,
      responsableUserId,
      archivosEntrega,
      urlEntrega,
      notaEntrega,
    } = params;

    const cleanUrl = urlEntrega && urlEntrega.trim().length > 0 ? urlEntrega.trim() : null;

    if ((!archivosEntrega || archivosEntrega.length === 0) && !cleanUrl) {
      throw new Error('DELIVERY_REQUIRED: La finalización exige al menos un archivo o una URL de entrega');
    }

    if (cleanUrl && !/^https?:\/\/.+/i.test(cleanUrl)) {
      throw new Error('INVALID_DELIVERY_URL: La URL de entrega debe ser un enlace válido HTTP o HTTPS');
    }

    // Regla Canónica: Únicamente desde 'En proceso'
    if (currentState !== 'En proceso') {
      throw new Error(`INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso (actual: ${currentState})`);
    }

    // Hard Guard de Responsable
    validateOperationalAssignee(responsableUserId, mockUsers);

    // Validar integridad de archivos de entrega
    if (archivosEntrega && archivosEntrega.length > 0) {
      for (const archId of archivosEntrega) {
        const file = mockArchivos.find((f) => f.id === archId);
        if (!file) {
          throw new Error(`FILE_NOT_FOUND: El archivo de entrega ${archId} no existe`);
        }
        if (file.estado !== 'verified') {
          throw new Error(`FILE_NOT_VERIFIED: El archivo de entrega ${archId} no está verificado en almacenamiento`);
        }
        if (file.pedido_id && file.pedido_id !== pedidoId) {
          throw new Error(`FILE_PEDIDO_MISMATCH: El archivo ${archId} pertenece a otro pedido`);
        }
      }
    }

    return {
      success: true,
      estado: 'Finalizado',
      entrega_version: 1,
      nota: notaEntrega ? notaEntrega.trim() : null,
    };
  }

  // Emulación fiel de pedido_assign (Hardened Migration 040 con p_motivo)
  function simulatePedidoAssign(params: {
    targetUserId: string;
    motivo?: string | null;
  }) {
    validateOperationalAssignee(params.targetUserId, mockUsers);
    return {
      success: true,
      responsable_id: params.targetUserId,
      motivo: params.motivo ? params.motivo.trim() : null,
    };
  }

  describe('1. Validación de Responsable Operativo (validateOperationalAssignee)', () => {
    it('Rechaza si responsable_user_id es NULL o indefinido', () => {
      expect(() => validateOperationalAssignee(null, mockUsers)).toThrow(/RESPONSABLE_REQUIRED/);
      expect(() => validateOperationalAssignee(undefined, mockUsers)).toThrow(/RESPONSABLE_REQUIRED/);
    });

    it('Rechaza si el usuario tiene rol "observador" aunque esté aprobado', () => {
      expect(() => validateOperationalAssignee('usr-obs-1', mockUsers)).toThrow(/no es un operador o administrador aprobado/);
    });

    it('Rechaza si el usuario no está aprobado (pendiente o revocado)', () => {
      expect(() => validateOperationalAssignee('usr-pend-1', mockUsers)).toThrow(/no es un operador o administrador aprobado/);
      expect(() => validateOperationalAssignee('usr-rev-1', mockUsers)).toThrow(/no es un operador o administrador aprobado/);
    });

    it('Rechaza si el usuario no existe en usuarios_acceso', () => {
      expect(() => validateOperationalAssignee('usr-inexistente', mockUsers)).toThrow(/no es un operador o administrador aprobado/);
    });

    it('Acepta usuario con rol "administrador" y estado "aprobado"', () => {
      expect(validateOperationalAssignee('usr-admin-1', mockUsers)).toBe(true);
    });

    it('Acepta usuario con rol "equipo" y estado "aprobado"', () => {
      expect(validateOperationalAssignee('usr-equipo-1', mockUsers)).toBe(true);
    });
  });

  describe('2. Transiciones de Estado (pedido_change_state)', () => {
    it('Nuevo -> En revisión: Bloqueado sin responsable (REJECT)', () => {
      expect(() =>
        simulatePedidoChangeState({
          currentState: 'Nuevo',
          targetState: 'En revisión',
          responsableUserId: null,
        })
      ).toThrow(/RESPONSABLE_REQUIRED/);
    });

    it('Nuevo -> En revisión: Permitido con responsable del equipo aprobado (PASS)', () => {
      const res = simulatePedidoChangeState({
        currentState: 'Nuevo',
        targetState: 'En revisión',
        responsableUserId: 'usr-equipo-1',
      });
      expect(res.success).toBe(true);
      expect(res.estado).toBe('En revisión');
    });

    it('En revisión -> En proceso: Permitido con responsable (PASS)', () => {
      const res = simulatePedidoChangeState({
        currentState: 'En revisión',
        targetState: 'En proceso',
        responsableUserId: 'usr-equipo-1',
      });
      expect(res.success).toBe(true);
      expect(res.estado).toBe('En proceso');
    });

    it('Nuevo -> Cancelado: Permitido sin responsable si provee motivo válido', () => {
      const res = simulatePedidoChangeState({
        currentState: 'Nuevo',
        targetState: 'Cancelado',
        responsableUserId: null,
        motivo: 'Duplicado por el solicitante',
      });
      expect(res.success).toBe(true);
      expect(res.estado).toBe('Cancelado');
    });

    it('En revisión -> En proceso: Bloqueado si no tiene responsable asignado', () => {
      expect(() =>
        simulatePedidoChangeState({
          currentState: 'En revisión',
          targetState: 'En proceso',
          responsableUserId: null,
        })
      ).toThrow(/RESPONSABLE_REQUIRED/);
    });

    it('En proceso -> Esperando información: Bloqueado si no tiene responsable asignado', () => {
      expect(() =>
        simulatePedidoChangeState({
          currentState: 'En proceso',
          targetState: 'Esperando información',
          responsableUserId: null,
        })
      ).toThrow(/RESPONSABLE_REQUIRED/);
    });
  });

  describe('3. Finalización de Pedido (pedido_finalize Hardened)', () => {
    it('En revisión con responsable -> pedido_finalize = REJECT (Solo desde En proceso)', () => {
      expect(() =>
        simulatePedidoFinalize({
          currentState: 'En revisión',
          responsableUserId: 'usr-admin-1',
          urlEntrega: 'https://drive.google.com/test',
        })
      ).toThrow(/INVALID_TRANSITION: Solo se pueden finalizar pedidos en estado En proceso/);
    });

    it('En proceso sin responsable -> pedido_finalize = REJECT RESPONSABLE_REQUIRED', () => {
      expect(() =>
        simulatePedidoFinalize({
          currentState: 'En proceso',
          responsableUserId: null,
          urlEntrega: 'https://drive.google.com/test',
        })
      ).toThrow(/RESPONSABLE_REQUIRED/);
    });

    it('En proceso con responsable + entrega válida -> Finalizado = PASS', () => {
      const res = simulatePedidoFinalize({
        currentState: 'En proceso',
        responsableUserId: 'usr-admin-1',
        urlEntrega: 'https://drive.google.com/drive/folders/final-assets',
        notaEntrega: 'Entrega final aprobada',
      });
      expect(res.success).toBe(true);
      expect(res.estado).toBe('Finalizado');
    });

    it('Finalize con archivo verificado y perteneciente al pedido = PASS', () => {
      const res = simulatePedidoFinalize({
        pedidoId: 'ped-1',
        currentState: 'En proceso',
        responsableUserId: 'usr-equipo-1',
        archivosEntrega: ['arch-verified-ped1'],
      });
      expect(res.success).toBe(true);
      expect(res.estado).toBe('Finalizado');
    });

    it('Archivo inexistente -> finalize = REJECT FILE_NOT_FOUND', () => {
      expect(() =>
        simulatePedidoFinalize({
          pedidoId: 'ped-1',
          currentState: 'En proceso',
          responsableUserId: 'usr-admin-1',
          archivosEntrega: ['arch-non-existent-999'],
        })
      ).toThrow(/FILE_NOT_FOUND/);
    });

    it('Archivo no verified -> finalize = REJECT FILE_NOT_VERIFIED', () => {
      expect(() =>
        simulatePedidoFinalize({
          pedidoId: 'ped-1',
          currentState: 'En proceso',
          responsableUserId: 'usr-admin-1',
          archivosEntrega: ['arch-pending-ped1'],
        })
      ).toThrow(/FILE_NOT_VERIFIED/);
    });

    it('Archivo perteneciente a otro pedido -> finalize = REJECT FILE_PEDIDO_MISMATCH', () => {
      expect(() =>
        simulatePedidoFinalize({
          pedidoId: 'ped-1',
          currentState: 'En proceso',
          responsableUserId: 'usr-admin-1',
          archivosEntrega: ['arch-other-ped2'],
        })
      ).toThrow(/FILE_PEDIDO_MISMATCH/);
    });

    it('URL inválida (sin http/https) -> finalize = REJECT INVALID_DELIVERY_URL', () => {
      expect(() =>
        simulatePedidoFinalize({
          currentState: 'En proceso',
          responsableUserId: 'usr-admin-1',
          urlEntrega: 'ftp://invalido.com/file',
        })
      ).toThrow(/INVALID_DELIVERY_URL/);
    });
  });

  describe('4. Asignación de Responsable (pedido_assign Hardened)', () => {
    it('Observador como responsable -> assignment = REJECT', () => {
      expect(() => simulatePedidoAssign({ targetUserId: 'usr-obs-1' })).toThrow(/no es un operador o administrador aprobado/);
    });

    it('Usuario revocado -> assignment = REJECT', () => {
      expect(() => simulatePedidoAssign({ targetUserId: 'usr-rev-1' })).toThrow(/no es un operador o administrador aprobado/);
    });

    it('Permite asignar a un operador del equipo aprobado y preserva p_motivo', () => {
      const res = simulatePedidoAssign({
        targetUserId: 'usr-equipo-1',
        motivo: 'Reasignación por licencia médica',
      });
      expect(res.success).toBe(true);
      expect(res.responsable_id).toBe('usr-equipo-1');
      expect(res.motivo).toBe('Reasignación por licencia médica');
    });
  });
});
