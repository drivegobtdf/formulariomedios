/** CAM-07B static safety / contract guards and delivery download hardening tests. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import handler from '../../supabase/functions/solicitante-delivery-download/index.ts';
import { setDriveAdapter } from '../../supabase/functions/_shared/drive-adapter.ts';

const repo = process.cwd();
const sql = readFileSync(join(repo, 'supabase/migrations/20261104211500_cam07b_internal_solicitante_portal.sql'), 'utf8');
const edge = readFileSync(join(repo, 'supabase/functions/solicitante-delivery-download/index.ts'), 'utf8');

interface MockDataConfig {
  session?: any;
  pedido?: any;
  entrega?: any;
  archivo?: any;
}

let mockConfig: MockDataConfig = {};
const mockDownloadFileStream = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (tableName: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (tableName === 'solicitante_sesiones') {
            return { data: mockConfig.session ?? null, error: null };
          }
          if (tableName === 'pedidos') {
            return { data: mockConfig.pedido ?? null, error: null };
          }
          if (tableName === 'entregas_pedido') {
            return { data: mockConfig.entrega ?? null, error: null };
          }
          if (tableName === 'archivos') {
            return { data: mockConfig.archivo ?? null, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    },
  })),
}));

describe('CAM-07B: sesión de solicitante interno y privacidad', () => {
  it('amplía acceso sin exponer tokens en SQL', () => {
    expect(sql).toContain("p.origen = 'interno'");
    expect(sql).toContain('private.validate_solicitante_session(p_session_token)');
    expect(sql).toContain('encrypted_envelope');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.solicitante_request_access(text, jsonb) TO service_role;');
  });
  it('listado conserva control de sesión, paginación y aislamiento por origen', () => {
    expect(sql).toContain('v_eff_limit integer := LEAST');
    expect(sql).toContain("p.origen = 'publico'");
    expect(sql).toContain("p.informacion_especifica->'solicitante'->>'correo'");
  });
  it('detalle interno tiene proyección permitida, no entrega notas ni adjuntos internos', () => {
    expect(sql).toContain('solicitante_get_internal_pedido_detail');
    expect(sql).toContain("'notas', '[]'::jsonb");
    expect(sql).toContain("'nota_final', NULL");
    expect(sql).toContain("af.contexto = 'entrega'");
    expect(sql).toContain("'informacion_especifica', jsonb_build_object(");
  });
  it('descarga valida owner y pertenencia a entrega vigente', () => {
    expect(edge).toContain("ped.origen === 'interno'");
    expect(edge).toContain(".eq('es_vigente', true)");
    expect(edge).toContain('entregaArchivoIds.has(archivoId)');
    expect(edge).toContain("archivo.contexto === 'interno'");
    expect(edge).toContain("ped.origen === 'interno' && archivo.contexto !== 'entrega'");
    expect(edge).toContain("error: 'FILE_FORBIDDEN'");
  });
  it('no da EXECUTE directo a anon o authenticated para helper privilegiado', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.solicitante_get_internal_pedido_detail(text, text) TO service_role;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.solicitante_get_internal_pedido_detail\(text, text\) TO (?:anon|authenticated)/);
  });
});

describe('CAM-07B: solicitante-delivery-download hardening de archivos y contextos', () => {
  const validSession = {
    correo: 'solicitante@tdf.gob.ar',
    expires_at: '2099-01-01T00:00:00.000Z',
    revoked_at: null,
  };

  const internalPedido = {
    id: 'e7b1a0e2-8924-4d89-b57f-178b66861d85',
    pedido_visible: 'PED-2026-I00001',
    origen: 'interno',
    informacion_especifica: { solicitante: { correo: 'solicitante@tdf.gob.ar' } },
    envios_formulario: null,
  };

  const publicPedido = {
    id: 'f8c2b1e3-9035-5e90-c68e-289c77972e96',
    pedido_visible: 'PED-2026-D00001',
    origen: 'publico',
    informacion_especifica: {},
    envios_formulario: { correo: 'publico@gmail.com' },
  };

  function buildRequest(pedidoId: string, archivoId: string, token: string = 'token-valido-123') {
    return new Request(
      `https://example.com/functions/v1/solicitante-delivery-download?pedido_id=${pedidoId}&archivo_id=${archivoId}`,
      {
        method: 'GET',
        headers: {
          'x-solicitante-session': token,
        },
      }
    );
  }

  beforeEach(() => {
    mockDownloadFileStream.mockReset();
    mockDownloadFileStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
      mimeType: 'application/pdf',
      size: 3,
      name: 'archivo-descargado.pdf',
    });
    setDriveAdapter({
      downloadFileStream: mockDownloadFileStream,
    } as any);
  });

  it('rechaza con HTTP 403 FILE_FORBIDDEN si el archivo tiene contexto="interno", incluso vinculado a entrega vigente (CAM-11 leak guard)', async () => {
    mockConfig = {
      session: validSession,
      pedido: internalPedido,
      entrega: {
        id: 'ent-1',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-leak-interno',
        entrega_archivos: [{ archivo_id: 'arch-leak-interno' }],
      },
      archivo: {
        id: 'arch-leak-interno',
        contexto: 'interno',
        estado: 'verified',
        drive_file_id: 'drive-file-leak',
        nombre_original: 'referencia_interna_confidencial.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      },
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-leak-interno'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FILE_FORBIDDEN');
    expect(body.message).toBe('Este archivo no es un entregable autorizado');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });

  it('rechaza con HTTP 403 FILE_FORBIDDEN si un pedido público tiene erróneamente un archivo contexto="interno"', async () => {
    mockConfig = {
      session: { correo: 'publico@gmail.com', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null },
      pedido: publicPedido,
      entrega: {
        id: 'ent-2',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-leak-pub',
        entrega_archivos: [{ archivo_id: 'arch-leak-pub' }],
      },
      archivo: {
        id: 'arch-leak-pub',
        contexto: 'interno',
        estado: 'verified',
        drive_file_id: 'drive-file-pub-leak',
        nombre_original: 'interno_en_publico.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      },
    };

    const res = await handler(buildRequest(publicPedido.id, 'arch-leak-pub'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FILE_FORBIDDEN');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });

  it('rechaza con HTTP 403 FILE_FORBIDDEN en pedido interno si contexto no es "entrega" (ej: contexto="referencia")', async () => {
    mockConfig = {
      session: validSession,
      pedido: internalPedido,
      entrega: {
        id: 'ent-1',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-ref',
        entrega_archivos: [{ archivo_id: 'arch-ref' }],
      },
      archivo: {
        id: 'arch-ref',
        contexto: 'referencia',
        estado: 'verified',
        drive_file_id: 'drive-ref-id',
        nombre_original: 'referencia.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      },
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-ref'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FILE_FORBIDDEN');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });

  it('permite descarga con HTTP 200 para entregable legítimo (contexto="entrega", verified) en pedido interno propio', async () => {
    mockConfig = {
      session: validSession,
      pedido: internalPedido,
      entrega: {
        id: 'ent-1',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-legit-int',
        entrega_archivos: [{ archivo_id: 'arch-legit-int' }],
      },
      archivo: {
        id: 'arch-legit-int',
        contexto: 'entrega',
        estado: 'verified',
        drive_file_id: 'drive-legit-int-id',
        nombre_original: 'entregable_final_interno.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
      },
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-legit-int'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('entregable_final_interno.pdf');
    expect(mockDownloadFileStream).toHaveBeenCalledWith('drive-legit-int-id');
  });

  it('permite descarga con HTTP 200 para entregable legítimo en pedido público propio (sin regresión en público)', async () => {
    mockConfig = {
      session: { correo: 'publico@gmail.com', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null },
      pedido: publicPedido,
      entrega: {
        id: 'ent-2',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-legit-pub',
        entrega_archivos: [{ archivo_id: 'arch-legit-pub' }],
      },
      archivo: {
        id: 'arch-legit-pub',
        contexto: 'entrega',
        estado: 'verified',
        drive_file_id: 'drive-legit-pub-id',
        nombre_original: 'folleto_publico.pdf',
        mime_type: 'application/pdf',
        size_bytes: 4096,
      },
    };

    const res = await handler(buildRequest(publicPedido.id, 'arch-legit-pub'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('folleto_publico.pdf');
    expect(mockDownloadFileStream).toHaveBeenCalledWith('drive-legit-pub-id');
  });

  it('rechaza con HTTP 403 FORBIDDEN si el solicitante autenticado no es el dueño del pedido interno', async () => {
    mockConfig = {
      session: validSession, // correo: 'solicitante@tdf.gob.ar'
      pedido: {
        ...internalPedido,
        informacion_especifica: { solicitante: { correo: 'otro_solicitante@tdf.gob.ar' } },
      },
      entrega: {
        id: 'ent-1',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-legit-int',
        entrega_archivos: [{ archivo_id: 'arch-legit-int' }],
      },
      archivo: {
        id: 'arch-legit-int',
        contexto: 'entrega',
        estado: 'verified',
        drive_file_id: 'drive-legit-int-id',
      },
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-legit-int'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });

  it('rechaza con HTTP 401 SESSION_INVALID si la sesión no existe, está revocada o expiró', async () => {
    mockConfig = {
      session: null,
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-legit-int'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('SESSION_INVALID');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });

  it('rechaza con HTTP 410 FILE_NOT_AVAILABLE si el archivo no está verificado o no tiene drive_file_id', async () => {
    mockConfig = {
      session: validSession,
      pedido: internalPedido,
      entrega: {
        id: 'ent-1',
        version: 1,
        es_vigente: true,
        archivo_id: 'arch-unverified',
        entrega_archivos: [{ archivo_id: 'arch-unverified' }],
      },
      archivo: {
        id: 'arch-unverified',
        contexto: 'entrega',
        estado: 'pending',
        drive_file_id: null,
      },
    };

    const res = await handler(buildRequest(internalPedido.id, 'arch-unverified'));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe('FILE_NOT_AVAILABLE');
    expect(mockDownloadFileStream).not.toHaveBeenCalled();
  });
});
