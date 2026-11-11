import { describe, it, expect } from 'vitest';
import {
  resolveQaDispatchRouting,
  validateCloudflarePreviewUrl,
  isProdDomainUrl,
  QA_SYNTHETIC_TARGET_EMAIL,
  QA_PHYSICAL_DESTINATION_EMAIL,
  CANONICAL_TEST_PREVIEW_URL,
  CANONICAL_PROD_URL,
} from '../../supabase/functions/_shared/security.ts';

describe('UAT-05: Reenvío Seguro para QA en TEST (Ajustes Finales de Seguridad)', () => {
  const canonicalQaEmails = new Set<string>([
    'pablosaldiviainfo@gmail.com',
    'solicitante.qa@tierradelfuego.gob.ar',
    'qa.pedidos@tierradelfuego.gob.ar',
    'operador.qa@tierradelfuego.gob.ar',
    'admin.qa@tierradelfuego.gob.ar',
  ]);

  const validParams = {
    environment: 'test',
    forwardEnabled: 'true',
    toEmail: QA_SYNTHETIC_TARGET_EMAIL,
    tipoComunicacion: 'magic_link_access',
    originalSubject: '[PEDIDOS] Acceso a Mis Solicitudes',
    appUrl: 'http://localhost:4174', // URL histórica de desarrollo en TEST
    testPreviewUrl: CANONICAL_TEST_PREVIEW_URL,
    canonicalQaEmails,
  };

  it('1. Caso Positivo Autorizado: reenvía a pablosaldiviainfo@gmail.com con URL de Cloudflare Preview TEST', () => {
    const result = resolveQaDispatchRouting(validParams);

    expect(result.isForwardActive).toBe(true);
    expect(result.effectiveTo).toBe(QA_PHYSICAL_DESTINATION_EMAIL);
    expect(result.effectiveSubject).toBe(
      `[QA TEST -> ${QA_SYNTHETIC_TARGET_EMAIL}] [PEDIDOS] Acceso a Mis Solicitudes`
    );
    expect(result.effectiveAppUrl).toBe(CANONICAL_TEST_PREVIEW_URL);
    expect(result.effectiveAppUrl).not.toBe(CANONICAL_PROD_URL);
  });

  it('2. Bloqueo Inmediato PROD_URL_LEAK_PREVENTED: Si la URL configurada (PUBLIC_APP_URL) es PROD, bloquea antes de cualquier sustitución', () => {
    // Si PUBLIC_APP_URL está configurada apuntando a producción en TEST
    expect(() => {
      resolveQaDispatchRouting({
        ...validParams,
        appUrl: 'https://formulariomedios.pages.dev',
      });
    }).toThrowError(/PROD_URL_LEAK_PREVENTED.*apunta a Producción en entorno TEST/);

    expect(() => {
      resolveQaDispatchRouting({
        ...validParams,
        appUrl: 'https://formulariomedios.pages.dev/',
      });
    }).toThrowError(/PROD_URL_LEAK_PREVENTED/);

    expect(() => {
      resolveQaDispatchRouting({
        ...validParams,
        appUrl: 'https://formulariomedios.tierradelfuego.gob.ar',
      });
    }).toThrowError(/PROD_URL_LEAK_PREVENTED/);
  });

  it('3. Exclusividad del Enlace Mágico: Otras comunicaciones NO modifican su URL ni destinatario', () => {
    const nonMagicTypes = [
      'pedido_ingresado',
      'submission_created',
      'informacion_faltante',
      'info_requested',
      'en_proceso',
      'pedido_en_proceso',
      'finalizado',
      'retrabajo',
      'pedido_nuevo_admin',
    ];

    const testAppUrl = 'https://custom-test-url.pages.dev';

    for (const tipo of nonMagicTypes) {
      const result = resolveQaDispatchRouting({
        ...validParams,
        appUrl: testAppUrl,
        tipoComunicacion: tipo,
        originalSubject: `Notificación ${tipo}`,
      });

      expect(result.isForwardActive).toBe(false);
      expect(result.effectiveTo).toBe(QA_SYNTHETIC_TARGET_EMAIL);
      expect(result.effectiveSubject).toBe(`Notificación ${tipo}`);
      expect(result.effectiveAppUrl).toBe(testAppUrl); // URL original intacta sin sustitución
    }
  });

  it('4. Validación Estricta de TEST_PREVIEW_URL: exige HTTPS y subdominio de Cloudflare Pages Preview', () => {
    // Válido: subdominio preview con HTTPS
    const validPreview = 'https://release-test-cam-integral-20.formulariomedios.pages.dev';
    expect(validateCloudflarePreviewUrl(validPreview)).toBe(validPreview);

    // Válido: subdominio hash con HTTPS
    const validHashPreview = 'https://598d782a.formulariomedios.pages.dev';
    expect(validateCloudflarePreviewUrl(validHashPreview)).toBe(validHashPreview);

    // Inválido: Protocolo HTTP no seguro
    expect(() => {
      validateCloudflarePreviewUrl('http://release-test-cam-integral-20.formulariomedios.pages.dev');
    }).toThrowError(/debe usar protocolo HTTPS/);

    // Inválido: Dominio raíz de producción
    expect(() => {
      validateCloudflarePreviewUrl('https://formulariomedios.pages.dev');
    }).toThrowError(/no es un origen válido de Cloudflare Pages Preview/);

    // Inválido: Dominio externo no relacionado
    expect(() => {
      validateCloudflarePreviewUrl('https://malicious-site.example.com');
    }).toThrowError(/no es un origen válido de Cloudflare Pages Preview/);
  });

  it('5. Reversibilidad Total: Al desactivar el flag (false o undefined), se restaura íntegramente el comportamiento original', () => {
    const originalAppUrl = 'https://base-url-test.example.com';

    // Caso undefined
    const resUndefined = resolveQaDispatchRouting({
      ...validParams,
      appUrl: originalAppUrl,
      forwardEnabled: undefined,
    });
    expect(resUndefined.isForwardActive).toBe(false);
    expect(resUndefined.effectiveTo).toBe(QA_SYNTHETIC_TARGET_EMAIL);
    expect(resUndefined.effectiveSubject).toBe('[PEDIDOS] Acceso a Mis Solicitudes');
    expect(resUndefined.effectiveAppUrl).toBe(originalAppUrl);

    // Caso 'false'
    const resFalse = resolveQaDispatchRouting({
      ...validParams,
      appUrl: originalAppUrl,
      forwardEnabled: 'false',
    });
    expect(resFalse.isForwardActive).toBe(false);
    expect(resFalse.effectiveTo).toBe(QA_SYNTHETIC_TARGET_EMAIL);
    expect(resFalse.effectiveSubject).toBe('[PEDIDOS] Acceso a Mis Solicitudes');
    expect(resFalse.effectiveAppUrl).toBe(originalAppUrl);
  });

  it('6. Aislamiento PROD: Si ENVIRONMENT === production, jamás se activa el reenvío', () => {
    const result = resolveQaDispatchRouting({
      ...validParams,
      environment: 'production',
      appUrl: CANONICAL_PROD_URL,
    });

    expect(result.isForwardActive).toBe(false);
    expect(result.effectiveTo).toBe(QA_SYNTHETIC_TARGET_EMAIL);
    expect(result.effectiveSubject).toBe('[PEDIDOS] Acceso a Mis Solicitudes');
    expect(result.effectiveAppUrl).toBe(CANONICAL_PROD_URL);
  });

  it('7. Detección precisa de dominio de Producción (isProdDomainUrl)', () => {
    expect(isProdDomainUrl('https://formulariomedios.pages.dev')).toBe(true);
    expect(isProdDomainUrl('https://formulariomedios.pages.dev/')).toBe(true);
    expect(isProdDomainUrl('https://formulariomedios.tierradelfuego.gob.ar')).toBe(true);
    expect(isProdDomainUrl('https://release-test-cam-integral-20.formulariomedios.pages.dev')).toBe(false);
    expect(isProdDomainUrl('http://localhost:5173')).toBe(false);
  });

  it('8. Destino físico debe estar estrictamente autorizado en la allowlist canónica', () => {
    const restrictedAllowlist = new Set<string>(['solicitante.qa@tierradelfuego.gob.ar']);
    const result = resolveQaDispatchRouting({
      ...validParams,
      canonicalQaEmails: restrictedAllowlist,
    });
    expect(result.isForwardActive).toBe(false);
    expect(result.effectiveTo).toBe(QA_SYNTHETIC_TARGET_EMAIL);
  });

  it('9. Coincidencia insensible a mayúsculas y espacios en el correo del solicitante', () => {
    const result = resolveQaDispatchRouting({
      ...validParams,
      toEmail: '  SOLICITANTE.QA@tierradelfuego.gob.ar  ',
    });
    expect(result.isForwardActive).toBe(true);
    expect(result.effectiveTo).toBe(QA_PHYSICAL_DESTINATION_EMAIL);
  });
});
