/**
 * Tests de Validación Server-Side para Fechas Operativas (Revisión 3.0)
 * Proyecto: PEDIDOS — Secretaría de Medios
 *
 * Verifica la capa backend y Edge Function submission-create:
 * 1. Rechazo de fechas operativas pasadas (< hoy civil).
 * 2. Aceptación de fecha de hoy (= hoy civil) y futuras (> hoy civil).
 * 3. Matriz completa de validación sobre los 9 campos de fecha operativos.
 * 4. Invariante de fecha civil sin desfasaje por UTC.
 * 5. No interferencia con fechas históricas, filtros de gestión o auditoría.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  getCivilDateString,
  validateSubmissionPayloadDates,
  OPERATIONAL_DATE_RULES,
  DEFAULT_PAST_DATE_ERROR_MESSAGE,
} from '../../supabase/functions/_shared/payloadValidation.ts';
import submissionCreateHandler from '../../supabase/functions/submission-create/index.ts';

describe('Validación Server-Side de Fechas Operativas (Backend & Edge Functions)', () => {
  const refDate = new Date(2026, 8, 14, 12, 0, 0); // 14 Septiembre 2026 12:00 local (UTC-3)
  const todayStr = '2026-09-14';
  const yesterdayStr = '2026-09-13';
  const tomorrowStr = '2026-09-15';

  describe('1. Función Canónica validateSubmissionPayloadDates', () => {
    it('getCivilDateString debe calcular la fecha civil en America/Argentina/Ushuaia sin desfasajes UTC', () => {
      // 23:30 en Argentina (UTC-3) -> UTC es 02:30 del día 15
      const lateNightUTC = new Date('2026-09-15T02:30:00Z');
      expect(getCivilDateString(lateNightUTC)).toBe('2026-09-14');

      // 00:15 en Argentina (UTC-3) -> UTC es 03:15 del día 15
      const earlyMorningUTC = new Date('2026-09-15T03:15:00Z');
      expect(getCivilDateString(earlyMorningUTC)).toBe('2026-09-15');
    });

    it('Cobertura de Eventos: ayer debe ser rechazada, hoy y futuro deben ser aceptadas', () => {
      // Payload con Cobertura y fecha de ayer
      const payloadYesterday = {
        schema_version: 3,
        submission_key: crypto.randomUUID(),
        contacto: {
          nombre_apellido: 'Carlos Gómez',
          telefono: '+5492901445566',
          correo: 'carlos@tierradelfuego.gob.ar',
          area_solicitante: 'Protocolo',
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'cobertura_eventos',
            tipo_slug: 'cobertura_eventos',
            informacion_especifica: {
              fecha: yesterdayStr,
              hora_inicio: '10:00',
              lugar: 'Gimnasio Petrina',
              ciudad: 'Ushuaia',
              autoridades: 'Gobernador',
              requerimientos: 'Cobertura fotográfica',
            },
          },
        ],
      };

      const resultYesterday = validateSubmissionPayloadDates(payloadYesterday, refDate);
      expect(resultYesterday.isValid).toBe(false);
      expect(resultYesterday.error).toContain(DEFAULT_PAST_DATE_ERROR_MESSAGE);
      expect(resultYesterday.field).toBe('cobertura_eventos.fecha');

      // Payload con fecha de hoy -> VÁLIDA
      const payloadToday = {
        ...payloadYesterday,
        pedidos: [
          {
            ...payloadYesterday.pedidos[0],
            informacion_especifica: {
              ...payloadYesterday.pedidos[0].informacion_especifica,
              fecha: todayStr,
            },
          },
        ],
      };
      const resultToday = validateSubmissionPayloadDates(payloadToday, refDate);
      expect(resultToday.isValid).toBe(true);
      expect(resultToday.error).toBeUndefined();

      // Payload con fecha de mañana -> VÁLIDA
      const payloadTomorrow = {
        ...payloadYesterday,
        pedidos: [
          {
            ...payloadYesterday.pedidos[0],
            informacion_especifica: {
              ...payloadYesterday.pedidos[0].informacion_especifica,
              fecha: tomorrowStr,
            },
          },
        ],
      };
      const resultTomorrow = validateSubmissionPayloadDates(payloadTomorrow, refDate);
      expect(resultTomorrow.isValid).toBe(true);
    });

    it('Matriz Server-Side: debe validar los 9 campos de fecha operativos en todas las categorías', () => {
      expect(OPERATIONAL_DATE_RULES.length).toBe(9);

      for (const rule of OPERATIONAL_DATE_RULES) {
        // 1. Caso fecha = ayer -> debe fallar
        const infoPast: Record<string, unknown> = {
          [rule.field_name]: yesterdayStr,
        };
        if (rule.field_name === 'grabacion_fecha') {
          infoPast.requiere_grabacion = true;
        }

        const payloadPast = {
          schema_version: 3,
          submission_key: crypto.randomUUID(),
          contacto: {
            nombre_apellido: 'Test',
            telefono: '+5492901445566',
            correo: 'test@tdf.gob.ar',
            area_solicitante: 'Test',
          },
          pedidos: [
            {
              client_request_ref: crypto.randomUUID(),
              categoria_slug: rule.categoria_slug,
              tipo_slug: rule.tipo_slug || rule.categoria_slug,
              informacion_especifica: infoPast,
            },
          ],
        };

        const resPast = validateSubmissionPayloadDates(payloadPast, refDate);
        expect(resPast.isValid).toBe(false);
        expect(resPast.field).toBe(`${rule.categoria_slug}.${rule.field_name}`);
        expect(resPast.error).toContain(DEFAULT_PAST_DATE_ERROR_MESSAGE);

        // 2. Caso fecha = hoy -> debe ser válido
        infoPast[rule.field_name] = todayStr;
        const resToday = validateSubmissionPayloadDates(payloadPast, refDate);
        expect(resToday.isValid).toBe(true);

        // 3. Caso fecha = mañana -> debe ser válido
        infoPast[rule.field_name] = tomorrowStr;
        const resTomorrow = validateSubmissionPayloadDates(payloadPast, refDate);
        expect(resTomorrow.isValid).toBe(true);
      }
    });

    it('Asesoramiento: no debe exigir ni validar fechas técnicas si requiere_asesoramiento es true', () => {
      const payloadAsesoramiento = {
        schema_version: 3,
        submission_key: crypto.randomUUID(),
        contacto: {
          nombre_apellido: 'Laura',
          telefono: '+5492901445566',
          correo: 'laura@tdf.gob.ar',
          area_solicitante: 'Cultura',
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'produccion_audiovisual',
            tipo_slug: 'produccion_audiovisual',
            informacion_especifica: {
              requiere_asesoramiento: true,
              objetivo_asesoramiento: 'Necesito asesoramiento para video institucional',
            },
          },
        ],
      };

      const res = validateSubmissionPayloadDates(payloadAsesoramiento, refDate);
      expect(res.isValid).toBe(true);
    });
  });

  describe('2. Invocación HTTP Edge Function submission-create', () => {
    it('debe rechazar con HTTP 400 Bad Request y código VALIDATION_ERROR cuando la fecha es anterior a hoy', async () => {
      const payload = {
        schema_version: 3,
        submission_key: crypto.randomUUID(),
        contacto: {
          nombre_apellido: 'Esteban Martínez',
          telefono: '+5492901445566',
          correo: 'esteban@tierradelfuego.gob.ar',
          area_solicitante: 'Protocolo',
        },
        pedidos: [
          {
            client_request_ref: crypto.randomUUID(),
            categoria_slug: 'cobertura_eventos',
            tipo_slug: 'cobertura_eventos',
            informacion_especifica: {
              fecha: '2026-09-01', // Pasado evidente
              hora_inicio: '10:00',
              lugar: 'Casa de Gobierno',
              ciudad: 'Ushuaia',
              autoridades: 'Gobernador',
              requerimientos: 'Cobertura audiovisual',
            },
          },
        ],
      };

      const req = new Request('http://localhost/functions/v1/submission-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const res = await submissionCreateHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('VALIDATION_ERROR');
      expect(json.message).toContain('La fecha no puede ser anterior a hoy.');
      expect(json.field).toBe('cobertura_eventos.fecha');
    });

    it('las fechas históricas fuera del submit (búsquedas, filtros o timeline) no deben verse afectadas', () => {
      // Simular payload o consulta de filtro de tablero de gestión con fechas pasadas
      const filtroGestion = {
        desde: '2026-01-01',
        hasta: '2026-09-01',
        estado: 'Finalizado',
      };

      // No es un payload de presentación pública -> no pasa por validateSubmissionPayloadDates
      const res = validateSubmissionPayloadDates(filtroGestion, refDate);
      expect(res.isValid).toBe(true);
    });
  });
});
