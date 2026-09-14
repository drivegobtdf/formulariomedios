import { describe, it, expect } from 'vitest';
import { mapSubmissionResponse } from '../services/formApi';

describe('Submission Response Mapper (mapSubmissionResponse)', () => {
  it('Caso A y B: debe mapear id -> pedido_id y pedido_visible -> codigo_ped correctamente', () => {
    const rawBackendResponse = {
      envio_id: '17c7a91e-34e6-4109-ad4a-8fa987456b25',
      idempotent_replay: false,
      pedidos: [
        {
          id: '574ad98f-007b-4981-937b-0f4ec1fcc14d',
          client_request_ref: '83d431a3-ed69-4ccc-a4e8-52ad7a0b0a9c',
          pedido_visible: 'PED-2026-D001613',
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
          tracking_token: 'secret_token_123',
          tracking_recovery_required: false,
        },
      ],
      archivos: [],
    };

    const mapped = mapSubmissionResponse(rawBackendResponse);

    expect(mapped.envio_id).toBe('17c7a91e-34e6-4109-ad4a-8fa987456b25');
    expect(mapped.idempotent_replay).toBe(false);
    expect(mapped.pedidos).toHaveLength(1);
    expect(mapped.pedidos[0]).toEqual({
      pedido_id: '574ad98f-007b-4981-937b-0f4ec1fcc14d',
      codigo_ped: 'PED-2026-D001613',
      client_request_ref: '83d431a3-ed69-4ccc-a4e8-52ad7a0b0a9c',
      categoria_slug: 'diseno_grafico',
      tipo_slug: 'flyer_rrss',
    });
  });

  it('Caso C: debe mapear respuesta con 1 PED y archivos adjuntos', () => {
    const raw = {
      envio_id: 'e1',
      submission_key: 's1',
      idempotent_replay: true,
      pedidos: [
        {
          id: 'p1',
          client_request_ref: 'r1',
          pedido_visible: 'PED-2026-C000101',
          categoria_slug: 'cobertura_eventos',
          tipo_slug: 'cobertura_eventos',
        },
      ],
      archivos: [
        {
          id: 'a1',
          client_file_ref: 'f1',
          nombre_original: 'cronograma.pdf',
        },
      ],
    };

    const res = mapSubmissionResponse(raw);
    expect(res.pedidos[0].codigo_ped).toBe('PED-2026-C000101');
    expect(res.pedidos[0].pedido_id).toBe('p1');
    expect(res.idempotent_replay).toBe(true);
    expect(res.archivos).toHaveLength(1);
    expect(res.archivos![0]).toEqual({
      archivo_id: 'a1',
      client_file_ref: 'f1',
      nombre: 'cronograma.pdf',
    });
  });

  it('Caso D: debe mapear Multi-PED preservando todos los códigos visibles y referencias', () => {
    const raw = {
      envio_id: 'env-multi',
      idempotent_replay: false,
      pedidos: [
        {
          id: 'p-flyer',
          client_request_ref: 'ref-flyer',
          pedido_visible: 'PED-2026-D000201',
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
        },
        {
          id: 'p-gacetilla',
          client_request_ref: 'ref-gacetilla',
          pedido_visible: 'PED-2026-G000202',
          categoria_slug: 'gacetilla',
          tipo_slug: 'gacetilla',
        },
        {
          id: 'p-redes',
          client_request_ref: 'ref-redes',
          pedido_visible: 'PED-2026-R000203',
          categoria_slug: 'redes_sociales',
          tipo_slug: 'redes_sociales',
        },
      ],
    };

    const res = mapSubmissionResponse(raw);
    expect(res.pedidos).toHaveLength(3);
    expect(res.pedidos[0].codigo_ped).toBe('PED-2026-D000201');
    expect(res.pedidos[1].codigo_ped).toBe('PED-2026-G000202');
    expect(res.pedidos[2].codigo_ped).toBe('PED-2026-R000203');
  });

  it('Caso E: debe lanzar error controlado si pedido_visible viene null, undefined o vacío', () => {
    const rawMissingCode = {
      envio_id: 'e1',
      pedidos: [
        {
          id: 'p1',
          client_request_ref: 'r1',
          pedido_visible: '',
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
        },
      ],
    };

    expect(() => mapSubmissionResponse(rawMissingCode)).toThrow(
      /el servidor no retornó el código identificador visible \(pedido_visible\)/i
    );

    const rawNullCode = {
      envio_id: 'e1',
      pedidos: [
        {
          id: 'p1',
          client_request_ref: 'r1',
          pedido_visible: null,
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
        },
      ],
    };

    expect(() => mapSubmissionResponse(rawNullCode)).toThrow(
      /el servidor no retornó el código identificador visible \(pedido_visible\)/i
    );
  });

  it('Caso F: debe lanzar error controlado si falta id de pedido o la estructura es inválida', () => {
    const rawMissingId = {
      envio_id: 'e1',
      pedidos: [
        {
          pedido_visible: 'PED-2026-D000101',
          client_request_ref: 'r1',
          categoria_slug: 'diseno_grafico',
          tipo_slug: 'flyer_rrss',
        },
      ],
    };
    expect(() => mapSubmissionResponse(rawMissingId)).toThrow(
      /el servidor no retornó el identificador del pedido/i
    );

    expect(() => mapSubmissionResponse(null)).toThrow(/no retornó un objeto/i);
    expect(() => mapSubmissionResponse({})).toThrow(/falta envio_id/i);
    expect(() => mapSubmissionResponse({ envio_id: 'e1', pedidos: [] })).toThrow(
      /no se registraron pedidos/i
    );
  });
});
