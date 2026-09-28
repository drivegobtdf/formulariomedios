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

  const isAuthorizedTestEmail =
    normEmail === 'pablosaldiviainfo@gmail.com' ||
    normEmail.endsWith('@tierradelfuego.gob.ar') ||
    normEmail.endsWith('@tdf.gob.ar');

  const env = environment !== undefined ? environment : getEnv('ENVIRONMENT');

  if (!isAuthorizedTestEmail && env !== 'production') {
    return {
      authorized: false,
      reason: `Destinatario '${normEmail}' no está en la allowlist de pruebas autorizadas.`
    };
  }

  return { authorized: true };
}

describe('Prevención y Política de Allowlist por Entorno (comunicaciones-dispatch)', () => {
  const originalEnv = process.env.ENVIRONMENT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENVIRONMENT;
    } else {
      process.env.ENVIRONMENT = originalEnv;
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
      expect(res.reason).toBe("Destinatario 'ezequielr.22.03@gmail.com' no está en la allowlist de pruebas autorizadas.");
    });

    it('rechaza destinatarios externos cuando ENVIRONMENT=staging', () => {
      process.env.ENVIRONMENT = 'staging';
      const res = checkRecipientAuthorization('cualquiera@empresa.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas');
    });

    it('comportamiento fail-safe: rechaza destinatarios externos si ENVIRONMENT está ausente (undefined)', () => {
      delete process.env.ENVIRONMENT;
      const res = checkRecipientAuthorization('usuario@gmail.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas');
    });

    it('comportamiento fail-safe: rechaza destinatarios externos si ENVIRONMENT es cadena vacía', () => {
      process.env.ENVIRONMENT = '';
      const res = checkRecipientAuthorization('usuario@gmail.com');
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('no está en la allowlist de pruebas autorizadas');
    });
  });

  describe('C. Entorno NO PRODUCCIÓN con Destinatarios Autorizados (Allowlist Activa)', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'test';
    });

    it('permite pablosaldiviainfo@gmail.com en cualquier entorno', () => {
      const res = checkRecipientAuthorization('pablosaldiviainfo@gmail.com');
      expect(res.authorized).toBe(true);
    });

    it('permite dominios @tierradelfuego.gob.ar en cualquier entorno', () => {
      const res = checkRecipientAuthorization('contacto@tierradelfuego.gob.ar');
      expect(res.authorized).toBe(true);
    });

    it('permite dominios @tdf.gob.ar en cualquier entorno', () => {
      const res = checkRecipientAuthorization('prensa@tdf.gob.ar');
      expect(res.authorized).toBe(true);
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
