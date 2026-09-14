/**
 * Módulo de Utilidades y Validación para Teléfono / WhatsApp Internacional
 * Sistema PEDIDOS — Secretaría de Medios
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

export interface CountryInfo {
  code: string;
  name: string;
  dialCode: string;
  displayDialCode: string;
  placeholder: string;
  helpText: string;
  flag: string;
}

/**
 * Convierte un código ISO 3166-1 alpha-2 en un emoji de bandera local.
 */
export function getCountryFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Lista de países soportados con Argentina (AR) por defecto al inicio.
 */
export const COUNTRIES_LIST: CountryInfo[] = [
  {
    code: 'AR',
    name: 'Argentina',
    dialCode: '+54',
    displayDialCode: '+54 9',
    placeholder: '2964 477578',
    helpText: 'Ingresá código de área y número, sin 0 y sin 15.',
    flag: getCountryFlagEmoji('AR'),
  },
  {
    code: 'CL',
    name: 'Chile',
    dialCode: '+56',
    displayDialCode: '+56',
    placeholder: '9 1234 5678',
    helpText: 'Ingresá el número de teléfono con 9 dígitos.',
    flag: getCountryFlagEmoji('CL'),
  },
  {
    code: 'UY',
    name: 'Uruguay',
    dialCode: '+598',
    displayDialCode: '+598',
    placeholder: '99 123 456',
    helpText: 'Ingresá el número móvil o de línea.',
    flag: getCountryFlagEmoji('UY'),
  },
  {
    code: 'BR',
    name: 'Brasil',
    dialCode: '+55',
    displayDialCode: '+55',
    placeholder: '11 98765 4321',
    helpText: 'Ingresá código de área y número móvil.',
    flag: getCountryFlagEmoji('BR'),
  },
  {
    code: 'PY',
    name: 'Paraguay',
    dialCode: '+595',
    displayDialCode: '+595',
    placeholder: '981 123456',
    helpText: 'Ingresá el número local.',
    flag: getCountryFlagEmoji('PY'),
  },
  {
    code: 'BO',
    name: 'Bolivia',
    dialCode: '+591',
    displayDialCode: '+591',
    placeholder: '71234567',
    helpText: 'Ingresá el número móvil.',
    flag: getCountryFlagEmoji('BO'),
  },
  {
    code: 'PE',
    name: 'Perú',
    dialCode: '+51',
    displayDialCode: '+51',
    placeholder: '912 345 678',
    helpText: 'Ingresá el número de 9 dígitos.',
    flag: getCountryFlagEmoji('PE'),
  },
  {
    code: 'CO',
    name: 'Colombia',
    dialCode: '+57',
    displayDialCode: '+57',
    placeholder: '300 1234567',
    helpText: 'Ingresá el número móvil.',
    flag: getCountryFlagEmoji('CO'),
  },
  {
    code: 'EC',
    name: 'Ecuador',
    dialCode: '+593',
    displayDialCode: '+593',
    placeholder: '99 123 4567',
    helpText: 'Ingresá el número móvil.',
    flag: getCountryFlagEmoji('EC'),
  },
  {
    code: 'VE',
    name: 'Venezuela',
    dialCode: '+58',
    displayDialCode: '+58',
    placeholder: '412 1234567',
    helpText: 'Ingresá código de área y número.',
    flag: getCountryFlagEmoji('VE'),
  },
  {
    code: 'MX',
    name: 'México',
    dialCode: '+52',
    displayDialCode: '+52',
    placeholder: '55 1234 5678',
    helpText: 'Ingresá los 10 dígitos del número.',
    flag: getCountryFlagEmoji('MX'),
  },
  {
    code: 'ES',
    name: 'España',
    dialCode: '+34',
    displayDialCode: '+34',
    placeholder: '612 34 56 78',
    helpText: 'Ingresá los 9 dígitos del teléfono.',
    flag: getCountryFlagEmoji('ES'),
  },
  {
    code: 'US',
    name: 'Estados Unidos / Canadá',
    dialCode: '+1',
    displayDialCode: '+1',
    placeholder: '202 555 0123',
    helpText: 'Ingresá código de área y número de 7 dígitos.',
    flag: getCountryFlagEmoji('US'),
  },
  {
    code: 'IT',
    name: 'Italia',
    dialCode: '+39',
    displayDialCode: '+39',
    placeholder: '312 345 6789',
    helpText: 'Ingresá el número con prefijo nacional.',
    flag: getCountryFlagEmoji('IT'),
  },
  {
    code: 'FR',
    name: 'Francia',
    dialCode: '+33',
    displayDialCode: '+33',
    placeholder: '6 12 34 56 78',
    helpText: 'Ingresá el número sin el 0 inicial.',
    flag: getCountryFlagEmoji('FR'),
  },
  {
    code: 'DE',
    name: 'Alemania',
    dialCode: '+49',
    displayDialCode: '+49',
    placeholder: '151 23456789',
    helpText: 'Ingresá el número sin el 0 inicial.',
    flag: getCountryFlagEmoji('DE'),
  },
];

export const DEFAULT_COUNTRY_CODE = 'AR';

/**
 * Obtiene la configuración de un país por su código ISO.
 */
export function getCountryConfig(countryCode: string = DEFAULT_COUNTRY_CODE): CountryInfo {
  const found = COUNTRIES_LIST.find((c) => c.code.toUpperCase() === countryCode.toUpperCase());
  if (found) return found;
  return {
    code: countryCode.toUpperCase(),
    name: countryCode.toUpperCase(),
    dialCode: '+',
    displayDialCode: '+',
    placeholder: 'Número de teléfono',
    helpText: 'Ingresá el número con código nacional.',
    flag: getCountryFlagEmoji(countryCode),
  };
}

export interface WhatsAppValidationResult {
  isValid: boolean;
  errorMessage?: string;
  canonical?: string;
  formatted?: string;
  waDigits?: string;
  waUrl?: string;
}

/**
 * Valida y normaliza un número de WhatsApp según las reglas del país seleccionado.
 */
export function validateWhatsAppPhone(
  rawInput: string,
  countryCode: string = DEFAULT_COUNTRY_CODE
): WhatsAppValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { isValid: false, errorMessage: 'Ingresá tu número de WhatsApp.' };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { isValid: false, errorMessage: 'Ingresá tu número de WhatsApp.' };
  }

  // Rechazar letras
  if (/[a-zA-Z]/.test(trimmed)) {
    return { isValid: false, errorMessage: 'Ingresá solo números, sin letras.' };
  }

  const country = countryCode.toUpperCase();

  if (country === 'AR') {
    // Limpiar prefijo internacional si el usuario lo pegó accidentalmente
    const clean = trimmed.replace(/^\+54\s*9?/, '').trim();
    const digits = clean.replace(/\D/g, '');

    if (digits.length === 0) {
      return { isValid: false, errorMessage: 'Ingresá tu número de WhatsApp.' };
    }

    // Validación de 0 inicial
    if (digits.startsWith('0')) {
      return { isValid: false, errorMessage: 'Ingresá el número sin el 0 inicial.' };
    }

    // Validación de prefijo 15 móvil
    if (
      digits.startsWith('15') ||
      /[\s\-_.]15[\s\-_.]/.test(clean) ||
      (digits.length > 10 && (digits.slice(2, 4) === '15' || digits.slice(3, 5) === '15' || digits.slice(4, 6) === '15'))
    ) {
      return { isValid: false, errorMessage: 'Ingresá el número sin el prefijo 15.' };
    }

    // Longitud en Argentina: 10 dígitos obligatorios (código de área + número local)
    if (digits.length < 10) {
      return {
        isValid: false,
        errorMessage: 'Ingresá un número de WhatsApp válido (código de área + número, 10 dígitos en total).',
      };
    }

    if (digits.length > 10) {
      return {
        isValid: false,
        errorMessage: 'El número de WhatsApp en Argentina debe tener 10 dígitos (código de área + número).',
      };
    }

    // Construir canonical con +54 9 para WhatsApp móvil en Argentina
    const canonical = `+549${digits}`;
    const parsed = parsePhoneNumberFromString(canonical, 'AR');

    if (!parsed || !parsed.isValid()) {
      return { isValid: false, errorMessage: 'Ingresá un código de área y número de WhatsApp válidos.' };
    }

    const waDigits = `549${digits}`;
    return {
      isValid: true,
      canonical,
      formatted: parsed.formatInternational(),
      waDigits,
      waUrl: `https://wa.me/${waDigits}`,
    };
  } else {
    // Países internacionales
    const parsed = parsePhoneNumberFromString(trimmed, country as CountryCode);
    if (!parsed || !parsed.isValid()) {
      const config = getCountryConfig(country);
      return { isValid: false, errorMessage: `Ingresá un número de WhatsApp válido para ${config.name}.` };
    }

    const canonical = parsed.number; // Formato E.164, ej: +56912345678
    const waDigits = canonical.replace(/\D/g, '');
    return {
      isValid: true,
      canonical,
      formatted: parsed.formatInternational(),
      waDigits,
      waUrl: `https://wa.me/${waDigits}`,
    };
  }
}

/**
 * Parsea un teléfono almacenado (canónico o histórico) para obtener datos de WhatsApp en Gestión.
 * Si el teléfono es histórico o no es un número válido inequívoco, retorna null.
 */
export function getWhatsAppDetails(phoneStr?: string | null): {
  canonical: string;
  formatted: string;
  waDigits: string;
  waUrl: string;
} | null {
  if (!phoneStr || typeof phoneStr !== 'string') return null;
  const clean = phoneStr.trim();
  if (!clean) return null;

  // Intento 1: Parsear como número internacional con +
  let parsed = parsePhoneNumberFromString(clean.startsWith('+') ? clean : `+${clean}`);

  // Intento 2: Parsear asumiendo Argentina si no tiene +
  if (!parsed || !parsed.isValid()) {
    parsed = parsePhoneNumberFromString(clean, 'AR');
  }

  if (!parsed || !parsed.isValid()) {
    return null;
  }

  let canonical = parsed.number;
  let waDigits = canonical.replace(/\D/g, '');

  // Regla especial Argentina: asegurar prefijo 9 después de 54 para chat de WhatsApp
  if (parsed.country === 'AR' && waDigits.startsWith('54') && !waDigits.startsWith('549')) {
    waDigits = `549${waDigits.slice(2)}`;
    canonical = `+549${waDigits.slice(3)}`;
  }

  const formatted = parsed.formatInternational();
  const waUrl = `https://wa.me/${waDigits}`;

  return {
    canonical,
    formatted,
    waDigits,
    waUrl,
  };
}

/**
 * Formatea un teléfono para visualización humana legible.
 */
export function formatPhoneForDisplay(phoneStr?: string | null): string {
  if (!phoneStr || !phoneStr.trim()) return 'N/D';
  const details = getWhatsAppDetails(phoneStr);
  return details ? details.formatted : phoneStr;
}
