import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEnv } from '../../supabase/functions/_shared/env.ts';

// Helper that isolates the allowlist evaluation logic matching comunicaciones-dispatch/index.ts
function checkRecipientAuthorization(toEmail: string, environment?: string): { authorized: boolean; reason?: string } {
  const normEmail = (toEmail || '').trim().toLowerCase();
  
  // Basic validation check
  const basicEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmail.test(normEmail)) {
    return { authorized: false, reason: 'INVALID_EMAIL_FORMAT' };
  }

  const customQaEmails = (getEnv('TEST_QA_ALLOWLIST') || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const canonicalQaEmails = new Set<string>([
    'pablosaldiviainfo@gmail.com',
    'solicitante.qa@tierradelfuego.gob.ar',
    'qa.pedidos@tierradelfuego.gob.ar',
    'operador.qa@tierradelfuego.gob.ar',
    'admin.qa@tierradelfuego.gob.ar',
    ...customQaEmails,
  ]);

  const isAuthorizedTestEmail = canonicalQaEmails.has(normEmail);

  const env = environment !== undefined ? environment : getEnv('ENVIRONMENT');

  if (!isAuthorizedTestEmail && env !== 'production') {
    return {
      authorized: false,
      reason: `Destinatario '${normEmail}' no está en la allowlist de pruebas autorizadas (QA específico).`
    };
  }

  return { authorized: true };
}

describe('Prevención y Política de Allowlist por Entorno (comunicaciones-dispatch)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  const originalQaAllowlist = process.env.TEST_QA_ALLOWLIST;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENVIRONMENT;
    } else {
      process.env.ENVIRONMENT = originalEnv;
    }
    if (originalQaAllowlist === undefined) {
      delete process.env.TEST_QA_ALLOWLIST;
    } else {
      process.env.TEST_QA_ALLOWLIST = originalQaAllowlist;
    }
  });

  describe('A. Entorno PRODUCCIÓN (ENVIRONMENT=production)', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'production';
    });

    it('permite destinatarios externos de Gmail válidos (desactiva la allowlist de prueba)', () => {
      const res1 = checkRecipientAuthorization('ezequielr.22.03@gmail.com');
      expect(res1.authorized).toBe(true);

      const res2 = checkRecipientAuthorization('idaliaplazaa@gmail.com');
      expect(res2.authorized).toBe(true);

      const res3 = checkRecipientAuthorization('keilajurnet@gmail.com');
      expect(res3.authorized).toBe(true);
    });

    it('permite destinatarios institucionales oficiales en producción', () => {
      const res = checkRecipientAuthorization('funcionario@tierradelfuego.gob.ar');
      expect(res.authorized).toBe(true);
    });

    it('permite la cuenta histórica de pruebas en producción', () => {
      const res = checkRecipientAuthorization('pablosaldiviainfo@gmail.com');
      expect(res.authorized).toBe(true);
    });
  });

  describe('B. Entorno NO PRODUCCIÓN (ENVIRONMENT=test, staging, o ausente)', () => {
    it('rechaza destinatarios externos cuando ENVIRONMENT=test', () => {
      process.env.ENVIRONMENT = 'test';
      const res = checkRecipientAuthorization('ezequielr.22.03@gmail.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas (QA específico)');
    });

    it('rechaza destinatarios externos cuando ENVIRONMENT=staging', () => {
      process.env.ENVIRONMENT = 'staging';
      const res = checkRecipientAuthorization('cualquiera@empresa.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas (QA específico)');
    });

    it('BLOQUEANTE 2: rechaza correos institucionales genéricos o de usuarios reales en TEST', () => {
      process.env.ENVIRONMENT = 'test';
      const res1 = checkRecipientAuthorization('gobernador@tierradelfuego.gob.ar');
      expect(res1.authorized).toBe(false);
      expect(res1.reason).toContain('no está en la allowlist de pruebas autorizadas (QA específico)');

      const res2 = checkRecipientAuthorization('ministro@tierradelfuego.gob.ar');
      expect(res2.authorized).toBe(false);

      const res3 = checkRecipientAuthorization('contacto@tierradelfuego.gob.ar');
      expect(res3.authorized).toBe(false);

      const res4 = checkRecipientAuthorization('prensa@tdf.gob.ar');
      expect(res4.authorized).toBe(false);
    });

    it('comportamiento fail-safe: rechaza destinatarios si ENVIRONMENT está ausente (undefined)', () => {
      delete process.env.ENVIRONMENT;
      const res = checkRecipientAuthorization('usuario@gmail.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas (QA específico)');
    });

    it('comportamiento fail-safe: rechaza destinatarios si ENVIRONMENT es cadena vacía', () => {
      process.env.ENVIRONMENT = '';
      const res = checkRecipientAuthorization('usuario@gmail.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas (QA específico)');
    });
  });

  describe('C. Entorno NO PRODUCCIÓN con Destinatarios Autorizados de QA (Allowlist Específica)', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'test';
    });

    it('permite pablosaldiviainfo@gmail.com en TEST', () => {
      const res = checkRecipientAuthorization('pablosaldiviainfo@gmail.com');
      expect(res.authorized).toBe(true);
    });

    it('permite buzones canónicos designados para QA', () => {
      expect(checkRecipientAuthorization('solicitante.qa@tierradelfuego.gob.ar').authorized).toBe(true);
      expect(checkRecipientAuthorization('qa.pedidos@tierradelfuego.gob.ar').authorized).toBe(true);
      expect(checkRecipientAuthorization('operador.qa@tierradelfuego.gob.ar').authorized).toBe(true);
      expect(checkRecipientAuthorization('admin.qa@tierradelfuego.gob.ar').authorized).toBe(true);
    });

    it('permite direcciones añadidas mediante TEST_QA_ALLOWLIST', () => {
      process.env.TEST_QA_ALLOWLIST = 'tester1@tierradelfuego.gob.ar, qa.externo@gmail.com';
      expect(checkRecipientAuthorization('tester1@tierradelfuego.gob.ar').authorized).toBe(true);
      expect(checkRecipientAuthorization('qa.externo@gmail.com').authorized).toBe(true);
      expect(checkRecipientAuthorization('otro@tierradelfuego.gob.ar').authorized).toBe(false);
    });
  });

  describe('D. Destinatarios con Formato Inválido', () => {
    it('rechaza emails mal formados tanto en PROD como en TEST', () => {
      process.env.ENVIRONMENT = 'production';
      expect(checkRecipientAuthorization('email-sin-arroba').authorized).toBe(false);
      expect(checkRecipientAuthorization('sin-dominio@').authorized).toBe(false);
      expect(checkRecipientAuthorization('').authorized).toBe(false);

      process.env.ENVIRONMENT = 'test';
      expect(checkRecipientAuthorization('email-sin-arroba').authorized).toBe(false);
    });
  });
});
