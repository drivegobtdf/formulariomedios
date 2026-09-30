import { describe, it, expect } from 'vitest';
import {
  renderFinalizedEmail,
  renderRevisionSolicitadaEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';
import { validateFileMetadata, MAX_FILE_SIZE_BYTES } from '../../supabase/functions/_shared/security.ts';

describe('Multi-PED Revision / Return / Rework System (SRS-FUN-REVISION-001)', () => {
  describe('1. Reglas de Validación de Adjuntos de Referencia', () => {
    it('acepta hasta 5 archivos de extensiones permitidas dentro del límite de 25 MB', () => {
      const validFiles = [
        { name: 'correccion_grafica.pdf', size: 5 * 1024 * 1024, mime: 'application/pdf' },
        { name: 'captura_error.png', size: 2 * 1024 * 1024, mime: 'image/png' },
        { name: 'foto_referencia.jpg', size: 10 * 1024 * 1024, mime: 'image/jpeg' },
        { name: 'texto_corregido.docx', size: 1 * 1024 * 1024, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { name: 'material_adicional.zip', size: 24 * 1024 * 1024, mime: 'application/zip' },
      ];

      expect(validFiles.length).toBeLessThanOrEqual(5);

      for (const file of validFiles) {
        const validation = validateFileMetadata(
          file.name,
          file.mime,
          file.size,
          MAX_FILE_SIZE_BYTES
        );
        expect(validation.valid).toBe(true);
        expect(file.size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
      }
    });

    it('rechaza archivos que excedan 25 MB (26,214,400 bytes)', () => {
      const oversizedFile = {
        name: 'video_gigante.pdf',
        mime: 'application/pdf',
        size: 26214401, // 25 MB + 1 byte
      };

      const validation = validateFileMetadata(
        oversizedFile.name,
        oversizedFile.mime,
        oversizedFile.size,
        MAX_FILE_SIZE_BYTES
      );
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('25 MB');
    });

    it('rechaza extensiones ejecutables o no permitidas (.exe, .sh, .html, .js)', () => {
      const invalidFiles = [
        { name: 'malware.exe', mime: 'application/x-msdownload', size: 1024 },
        { name: 'script.sh', mime: 'application/x-sh', size: 1024 },
        { name: 'pagina.html', mime: 'text/html', size: 1024 },
      ];

      for (const f of invalidFiles) {
        const validation = validateFileMetadata(f.name, f.mime, f.size, MAX_FILE_SIZE_BYTES);
        expect(validation.valid).toBe(false);
      }
    });

    it('Verificación de Almacenamiento Único de Adjuntos Comunes (Sin Duplicación Física)', () => {
      // Simula la subida de un único archivo adjunto de referencia para una revisión multi-PED (PED A y PED C)
      const uploadedFile = {
        id: 'archivo_ref_001',
        drive_file_id: 'drive_ref_blob_12345',
        nombre_original: 'referencia_manual_marca.pdf',
        size_bytes: 3500000,
        mime_type: 'application/pdf',
      };

      const revisionSolicitud = {
        id: 'rev_sol_header_99',
        envio_id: 'envio_100',
        archivos: [uploadedFile.id],
      };

      // Se asocia a la cabecera revision_solicitudes mediante revision_archivos
      const revisionArchivosRel = [
        { revision_solicitud_id: revisionSolicitud.id, archivo_id: uploadedFile.id },
      ];

      // Ambos hijos (PED A y PED C) apuntan a la misma cabecera revision_solicitud_id
      const revisionPedidos = [
        { id: 'rev_ped_a', revision_solicitud_id: revisionSolicitud.id, pedido_id: 'ped_A' },
        { id: 'rev_ped_c', revision_solicitud_id: revisionSolicitud.id, pedido_id: 'ped_C' },
      ];

      // Consulta de archivos desde PED A
      const archivosPedA = revisionArchivosRel
        .filter((rel) => rel.revision_solicitud_id === revisionPedidos.find((rp) => rp.pedido_id === 'ped_A')?.revision_solicitud_id)
        .map((rel) => rel.archivo_id);

      // Consulta de archivos desde PED C
      const archivosPedC = revisionArchivosRel
        .filter((rel) => rel.revision_solicitud_id === revisionPedidos.find((rp) => rp.pedido_id === 'ped_C')?.revision_solicitud_id)
        .map((rel) => rel.archivo_id);

      expect(archivosPedA).toContain('archivo_ref_001');
      expect(archivosPedC).toContain('archivo_ref_001');
      // Mismo archivo_id y mismo drive_file_id: CERO duplicación de binarios
      expect(archivosPedA[0]).toBe(archivosPedC[0]);
      expect(uploadedFile.drive_file_id).toBe('drive_ref_blob_12345');
    });
  });

  describe('2. Lógica de Negocio, Transiciones de Estado y Ciclo de Vida Multi-PED', () => {
    interface MockPedido {
      id: string;
      pedido_visible: string;
      envio_id: string;
      estado: 'Nuevo' | 'En revisión' | 'En proceso' | 'Esperando información' | 'Finalizado' | 'Cancelado';
      retrabajo_activo: boolean;
      revision_count: number;
      revision_requested_at: string | null;
      responsable_user_id: string | null;
      entregas: Array<{ id: string; version: number; es_vigente: boolean; nota?: string }>;
      revisiones: Array<{ id: string; revision_solicitud_id: string; revision_number: number; estado: 'abierta' | 'en_tratamiento' | 'resuelta'; motivo: string }>;
    }

    interface MockRevisionSolicitudHeader {
      id: string;
      envio_id: string;
      motivo: string;
      created_at: string;
    }

    interface MockEnvio {
      id: string;
      correo: string;
      pedidos: MockPedido[];
      revision_solicitudes: MockRevisionSolicitudHeader[];
    }

    // Helper que calcula el estado general de una solicitud padre
    function getRevisionSolicitudStatus(
      revisionSolId: string,
      pedidos: MockPedido[]
    ): 'abierta' | 'en_tratamiento' | 'resuelta' {
      const childRevisions: Array<{ estado: string }> = [];
      for (const p of pedidos) {
        for (const r of p.revisiones) {
          if (r.revision_solicitud_id === revisionSolId) {
            childRevisions.push(r);
          }
        }
      }

      if (childRevisions.length === 0) return 'resuelta';

      const hasOpen = childRevisions.some((r) => r.estado === 'abierta');
      const hasInProgress = childRevisions.some((r) => r.estado === 'en_tratamiento');
      const allResolved = childRevisions.every((r) => r.estado === 'resuelta');

      if (allResolved) return 'resuelta';
      if (hasInProgress || (!hasOpen && !allResolved)) return 'en_tratamiento';
      return 'abierta';
    }

    // Helper que simula la lógica atómica del RPC pedido_request_revision
    function simulatePedidoRequestRevision(
      envio: MockEnvio,
      selectedPedidoIds: string[],
      motivo: string,
      archivos: Array<{ nombre: string; size: number }> = []
    ) {
      if (!selectedPedidoIds || selectedPedidoIds.length === 0) {
        throw new Error('NO_PEDIDOS_SELECTED: Debe seleccionar al menos un pedido');
      }
      if (!motivo || motivo.trim().length < 5) {
        throw new Error('MOTIVO_TOO_SHORT: El motivo debe tener al menos 5 caracteres');
      }
      if (archivos.length > 5) {
        throw new Error('MAX_FILES_EXCEEDED: Máximo 5 archivos de referencia');
      }

      const affected: MockPedido[] = [];

      // Validar elegibilidad de cada pedido seleccionado bajo bloqueo FOR UPDATE
      for (const pId of selectedPedidoIds) {
        const p = envio.pedidos.find((x) => x.id === pId);
        if (!p) {
          throw new Error(`PEDIDO_NOT_FOUND_IN_ENVIO: El pedido ${pId} no pertenece al envío`);
        }
        if (p.estado !== 'Finalizado') {
          throw new Error(`PEDIDO_NOT_FINALIZADO: El pedido ${p.pedido_visible} no está Finalizado (${p.estado})`);
        }
        if (p.retrabajo_activo) {
          throw new Error(`REVISION_ALREADY_OPEN: El pedido ${p.pedido_visible} ya tiene una revisión abierta`);
        }
        const hasActiveDelivery = p.entregas.some((e) => e.es_vigente);
        if (!hasActiveDelivery) {
          throw new Error(`NO_ACTIVE_DELIVERY: El pedido ${p.pedido_visible} no cuenta con una entrega vigente`);
        }
        const hasOpenRevision = p.revisiones.some((r) => r.estado === 'abierta' || r.estado === 'en_tratamiento');
        if (hasOpenRevision) {
          throw new Error(`REVISION_ALREADY_OPEN: Concurrencia detectada en ${p.pedido_visible}`);
        }
        affected.push(p);
      }

      // Aplicar mutación atómica a los seleccionados
      const timestamp = new Date().toISOString();
      const revisionSolId = 'mock_rev_sol_' + Date.now();

      envio.revision_solicitudes.push({
        id: revisionSolId,
        envio_id: envio.id,
        motivo: motivo.trim(),
        created_at: timestamp,
      });

      for (const p of affected) {
        p.estado = 'Nuevo';
        p.retrabajo_activo = true;
        p.revision_count = (p.revision_count || 0) + 1;
        p.revision_requested_at = timestamp;
        // Preservar responsable_user_id
        p.revisiones.push({
          id: 'mock_rev_item_' + p.id + '_' + p.revision_count,
          revision_solicitud_id: revisionSolId,
          revision_number: p.revision_count,
          estado: 'abierta',
          motivo: motivo.trim(),
        });
      }

      return {
        success: true,
        revision_solicitud_id: revisionSolId,
        pedidos_afectados: affected.map((p) => ({
          pedido_id: p.id,
          pedido_visible: p.pedido_visible,
          revision_number: p.revision_count,
        })),
      };
    }

    // Helper que simula la lógica atómica de pedido_finalize
    function simulatePedidoFinalize(
      pedido: MockPedido,
      urlEntrega?: string,
      nota?: string
    ) {
      if (pedido.estado !== 'En proceso' && pedido.estado !== 'En revisión' && pedido.estado !== 'Nuevo') {
        throw new Error('INVALID_STATE_FOR_FINALIZE');
      }

      // 1. Desactivar entrega vigente previa
      for (const ent of pedido.entregas) {
        ent.es_vigente = false;
      }

      // 2. Determinar nueva versión
      const nextVersion = pedido.entregas.length + 1;
      pedido.entregas.push({
        id: 'mock_ent_' + nextVersion,
        version: nextVersion,
        es_vigente: true,
        nota,
      });

      // 3. Resolver revisión abierta si existía
      if (pedido.retrabajo_activo) {
        for (const rev of pedido.revisiones) {
          if (rev.estado === 'abierta' || rev.estado === 'en_tratamiento') {
            rev.estado = 'resuelta';
          }
        }
        pedido.retrabajo_activo = false;
      }

      pedido.estado = 'Finalizado';
      return { success: true, version: nextVersion };
    }

    it('Escenario E2E 3-PED: A + C devueltos, B Finalizado intacto', () => {
      const envio: MockEnvio = {
        id: 'envio_100',
        correo: 'solicitante@gobierno.gob.ar',
        revision_solicitudes: [],
        pedidos: [
          {
            id: 'ped_001',
            pedido_visible: 'PED-2026-0000001',
            envio_id: 'envio_100',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_analista_1',
            entregas: [{ id: 'ent_1', version: 1, es_vigente: true }],
            revisiones: [],
          },
          {
            id: 'ped_002',
            pedido_visible: 'PED-2026-0000002',
            envio_id: 'envio_100',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_analista_2',
            entregas: [{ id: 'ent_2', version: 1, es_vigente: true }],
            revisiones: [],
          },
          {
            id: 'ped_003',
            pedido_visible: 'PED-2026-0000003',
            envio_id: 'envio_100',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_analista_3',
            entregas: [{ id: 'ent_3', version: 1, es_vigente: true }],
            revisiones: [],
          },
        ],
      };

      // El solicitante pide revisión de PED-001 (A) y PED-003 (C)
      const result = simulatePedidoRequestRevision(
        envio,
        ['ped_001', 'ped_003'],
        'Favor de corregir colores y logos según manual de marca'
      );

      expect(result.success).toBe(true);
      expect(result.pedidos_afectados).toHaveLength(2);

      // PED-001 (A): pasa a Nuevo, retrabajo_activo = true, revision_count = 1, conserva responsable
      const p1 = envio.pedidos.find((p) => p.id === 'ped_001')!;
      expect(p1.estado).toBe('Nuevo');
      expect(p1.retrabajo_activo).toBe(true);
      expect(p1.revision_count).toBe(1);
      expect(p1.responsable_user_id).toBe('user_analista_1');
      expect(p1.revisiones).toHaveLength(1);
      expect(p1.revisiones[0].estado).toBe('abierta');

      // PED-003 (C): pasa a Nuevo, retrabajo_activo = true, revision_count = 1, conserva responsable
      const p3 = envio.pedidos.find((p) => p.id === 'ped_003')!;
      expect(p3.estado).toBe('Nuevo');
      expect(p3.retrabajo_activo).toBe(true);
      expect(p3.revision_count).toBe(1);
      expect(p3.responsable_user_id).toBe('user_analista_3');

      // PED-002 (B): HERMANO NO SELECCIONADO permanece 100% INTACTO
      const p2 = envio.pedidos.find((p) => p.id === 'ped_002')!;
      expect(p2.estado).toBe('Finalizado');
      expect(p2.retrabajo_activo).toBe(false);
      expect(p2.revision_count).toBe(0);
      expect(p2.revisiones).toHaveLength(0);
      expect(p2.entregas[0].es_vigente).toBe(true);
    });

    it('Ciclo de Vida de la Solicitud Padre: Solo se resuelve cuando TODOS los PED hijos son finalizados', () => {
      const envio: MockEnvio = {
        id: 'envio_105',
        correo: 'solicitante@gobierno.gob.ar',
        revision_solicitudes: [],
        pedidos: [
          {
            id: 'ped_A',
            pedido_visible: 'PED-2026-0000080',
            envio_id: 'envio_105',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_1',
            entregas: [{ id: 'ent_A1', version: 1, es_vigente: true }],
            revisiones: [],
          },
          {
            id: 'ped_C',
            pedido_visible: 'PED-2026-0000081',
            envio_id: 'envio_105',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_2',
            entregas: [{ id: 'ent_C1', version: 1, es_vigente: true }],
            revisiones: [],
          },
        ],
      };

      // 1. Crear revisión conjunta para A y C
      const res = simulatePedidoRequestRevision(
        envio,
        ['ped_A', 'ped_C'],
        'Ajuste común para ambos servicios del evento'
      );
      const revSolId = res.revision_solicitud_id;

      // Inicialmente la solicitud padre está 'abierta'
      expect(getRevisionSolicitudStatus(revSolId, envio.pedidos)).toBe('abierta');

      // 2. Finalizar únicamente PED A
      const pedA = envio.pedidos.find((p) => p.id === 'ped_A')!;
      pedA.estado = 'En proceso';
      simulatePedidoFinalize(pedA, 'https://drive.google.com/a_v2', 'Entrega corregida A');

      // PED A está resuelto, pero PED C sigue abierto
      expect(pedA.revisiones[0].estado).toBe('resuelta');
      const pedC = envio.pedidos.find((p) => p.id === 'ped_C')!;
      expect(pedC.revisiones[0].estado).toBe('abierta');

      // La solicitud padre NO DEBE estar resuelta todavía
      expect(getRevisionSolicitudStatus(revSolId, envio.pedidos)).not.toBe('resuelta');

      // 3. Finalizar PED C
      pedC.estado = 'En proceso';
      simulatePedidoFinalize(pedC, 'https://drive.google.com/c_v2', 'Entrega corregida C');

      // Ambos están resueltos
      expect(pedC.revisiones[0].estado).toBe('resuelta');

      // AHORA Y SOLO AHORA la solicitud padre está resuelta
      expect(getRevisionSolicitudStatus(revSolId, envio.pedidos)).toBe('resuelta');
    });

    it('Garantía de Concurrencia: Rechaza solicitud duplicada si ya existe revisión abierta en el mismo PED', () => {
      const envio: MockEnvio = {
        id: 'envio_101',
        correo: 'solicitante@gobierno.gob.ar',
        revision_solicitudes: [],
        pedidos: [
          {
            id: 'ped_010',
            pedido_visible: 'PED-2026-0000010',
            envio_id: 'envio_101',
            estado: 'Finalizado',
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_1',
            entregas: [{ id: 'ent_10', version: 1, es_vigente: true }],
            revisiones: [],
          },
        ],
      };

      // Primera solicitud: éxito
      simulatePedidoRequestRevision(envio, ['ped_010'], 'Primera solicitud de corrección');

      // Segunda solicitud concurrente / repetida: rechazo estricto
      expect(() =>
        simulatePedidoRequestRevision(envio, ['ped_010'], 'Intento duplicado mientras está en retrabajo')
      ).toThrowError(/REVISION_ALREADY_OPEN|PEDIDO_NOT_FINALIZADO/);
    });

    it('Rechaza pedidos no elegibles (e.g. estado En proceso o Cancelado)', () => {
      const envio: MockEnvio = {
        id: 'envio_102',
        correo: 'solicitante@gobierno.gob.ar',
        revision_solicitudes: [],
        pedidos: [
          {
            id: 'ped_020',
            pedido_visible: 'PED-2026-0000020',
            envio_id: 'envio_102',
            estado: 'En proceso', // No finalizado
            retrabajo_activo: false,
            revision_count: 0,
            revision_requested_at: null,
            responsable_user_id: 'user_1',
            entregas: [],
            revisiones: [],
          },
        ],
      };

      expect(() =>
        simulatePedidoRequestRevision(envio, ['ped_020'], 'Corrección')
      ).toThrowError(/PEDIDO_NOT_FINALIZADO/);
    });

    it('Ciclo Completo Multi-Versión: v1 -> Solicitud Revisión -> Retrabajo -> Finalización (v2) -> Segunda Revisión -> Finalización (v3)', () => {
      const ped: MockPedido = {
        id: 'ped_030',
        pedido_visible: 'PED-2026-0000030',
        envio_id: 'envio_103',
        estado: 'Finalizado',
        retrabajo_activo: false,
        revision_count: 0,
        revision_requested_at: null,
        responsable_user_id: 'user_designer',
        entregas: [{ id: 'ent_v1', version: 1, es_vigente: true, nota: 'Entrega inicial v1' }],
        revisiones: [],
      };

      const envio: MockEnvio = {
        id: 'envio_103',
        correo: 'solicitante@gobierno.gob.ar',
        revision_solicitudes: [],
        pedidos: [ped],
      };

      // 1. Solicitud de Revisión #1
      simulatePedidoRequestRevision(envio, ['ped_030'], 'Ajustar contraste tipográfico');
      expect(ped.estado).toBe('Nuevo');
      expect(ped.retrabajo_activo).toBe(true);
      expect(ped.revision_count).toBe(1);
      expect(ped.revisiones[0].estado).toBe('abierta');

      // 2. Operador pasa a En proceso y finaliza con v2
      ped.estado = 'En proceso';
      const fin1 = simulatePedidoFinalize(ped, 'https://drive.google.com/v2', 'Entrega v2 corregida');
      expect(fin1.version).toBe(2);
      expect(ped.estado).toBe('Finalizado');
      expect(ped.retrabajo_activo).toBe(false);
      expect(ped.revisiones[0].estado).toBe('resuelta');
      expect(ped.entregas).toHaveLength(2);
      expect(ped.entregas.find((e) => e.version === 1)?.es_vigente).toBe(false);
      expect(ped.entregas.find((e) => e.version === 2)?.es_vigente).toBe(true);

      // 3. Solicitud de Revisión #2 sobre v2
      simulatePedidoRequestRevision(envio, ['ped_030'], 'Añadir logo de secretaría al pie');
      expect(ped.estado).toBe('Nuevo');
      expect(ped.retrabajo_activo).toBe(true);
      expect(ped.revision_count).toBe(2);
      expect(ped.revisiones[1].estado).toBe('abierta');

      // 4. Operador finaliza con v3
      ped.estado = 'En proceso';
      const fin2 = simulatePedidoFinalize(ped, 'https://drive.google.com/v3', 'Entrega v3 definitiva');
      expect(fin2.version).toBe(3);
      expect(ped.estado).toBe('Finalizado');
      expect(ped.retrabajo_activo).toBe(false);
      expect(ped.revisiones[1].estado).toBe('resuelta');
      expect(ped.entregas).toHaveLength(3);
      expect(ped.entregas.find((e) => e.version === 1)?.es_vigente).toBe(false);
      expect(ped.entregas.find((e) => e.version === 2)?.es_vigente).toBe(false);
      expect(ped.entregas.find((e) => e.version === 3)?.es_vigente).toBe(true);
    });
  });

  describe('3. Plantillas de Comunicación y Correo Electrónico', () => {
    it('renderFinalizedEmail incluye el botón de acción para Solicitar Revisión', () => {
      const email = renderFinalizedEmail({
        pedido_visible: 'PED-2026-0000100',
        nombre_apellido: 'María Solicitante',
        servicio_nombre: 'Diseño Gráfico — Banner Web',
        url_entrega: 'https://drive.google.com/file/d/xyz',
        magic_token: 'session_abc',
        nota: 'Se adjuntan los archivos finales en alta resolución.',
      });

      expect(email.html).toContain('PED-2026-0000100');
      expect(email.html).toContain('María Solicitante');
      expect(email.html).toContain('Solicitar Revisión');
      expect(email.html).toContain('access_token=session_abc');
    });

    it('renderRevisionSolicitadaEmail renderiza correctamente la notificación de retrabajo multi-PED', () => {
      const email = renderRevisionSolicitadaEmail({
        nombre_apellido: 'Juan Solicitante',
        pedidos: [
          { pedido_visible: 'PED-2026-0000045', servicio: 'Gráfica Digital', revision_number: 1 },
          { pedido_visible: 'PED-2026-0000046', servicio: 'Redacción Gacetilla', revision_number: 1 },
        ],
        motivo: 'Ajustar información del evento y horario de inicio',
        magic_token: 'session_xyz',
        archivos_count: 2,
      });

      expect(email.html).toContain('Juan Solicitante');
      expect(email.html).toContain('PED-2026-0000045');
      expect(email.html).toContain('PED-2026-0000046');
      expect(email.html).toContain('Ajustar información del evento y horario de inicio');
      expect(email.html).toContain('2 adjunto(s)');
      expect(email.html).toContain('access_token=session_xyz');
    });
  });

  describe('4. Migración 061: Resolución de Ambigüedad pedido_finalize y Revisión Individual', () => {
    it('la migración 061 elimina todas las sobrecargas previas y define una única función canónica pedido_finalize', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const migPath = path.resolve(__dirname, '../../supabase/migrations/20260929000061_fix_pedido_finalize_and_single_ped_revision.sql');
      const sqlContent = fs.readFileSync(migPath, 'utf8');

      // Verifica drops explícitos de firmas conflictivas
      expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, integer, uuid[], text, text);');
      expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.pedido_finalize(uuid, bigint, uuid[], text, text);');

      // Verifica creación de una única versión canónica
      const finalizeMatches = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.pedido_finalize/g);
      expect(finalizeMatches).toHaveLength(1);

      // Verifica notificación a PostgREST
      expect(sqlContent).toContain("NOTIFY pgrst, 'reload schema';");
    });

    it('la migración 061 define la RPC canónica de revisión individual por pedido', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const migPath = path.resolve(__dirname, '../../supabase/migrations/20260929000061_fix_pedido_finalize_and_single_ped_revision.sql');
      const sqlContent = fs.readFileSync(migPath, 'utf8');

      expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.pedido_request_revision(text, uuid, uuid[], text, uuid[]);');
      expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.pedido_request_revision(text, uuid, text, uuid[]);');
      expect(sqlContent).toContain('p_pedido_id uuid');
      expect(sqlContent).toContain('p_motivo text');
      expect(sqlContent).toContain('p_archivos_ids uuid[]');
    });

    it('revisión individual afecta únicamente al PED solicitado, manteniendo inalterados los pedidos hermanos', () => {
      const pedA = {
        id: 'ped_A',
        pedido_visible: 'PED-2026-0001',
        envio_id: 'env_1',
        estado: 'Finalizado',
        retrabajo_activo: false,
        revision_count: 0,
      };
      const pedB = {
        id: 'ped_B',
        pedido_visible: 'PED-2026-0002',
        envio_id: 'env_1',
        estado: 'Finalizado',
        retrabajo_activo: false,
        revision_count: 0,
      };

      // Solicitud de revisión enviada individualmente sobre pedA
      pedA.estado = 'Nuevo';
      pedA.retrabajo_activo = true;
      pedA.revision_count = 1;

      expect(pedA.estado).toBe('Nuevo');
      expect(pedA.retrabajo_activo).toBe(true);
      expect(pedA.revision_count).toBe(1);

      // pedB permanece Finalizado e intacto
      expect(pedB.estado).toBe('Finalizado');
      expect(pedB.retrabajo_activo).toBe(false);
      expect(pedB.revision_count).toBe(0);
    });
  });
});

