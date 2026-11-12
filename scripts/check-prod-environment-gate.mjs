import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROD_REF = 'uwzgyirilafgnbpmrkic';
export const TEST_REF = 'yqfkzgqvezarzhlwiilo';

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toLowerCase();
}

export function isSha256Hex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
}

export const CANONICAL_PROD_ENV_DIGEST = sha256Hex('production');

export const CANONICAL_PROD_APP_URLS = [
  'https://formulariomedios.pages.dev',
  'https://formulariomedios.pages.dev/',
  'https://pedidos.gobiernotdf.gob.ar',
  'https://pedidos.gobiernotdf.gob.ar/',
];

export const FORBIDDEN_HTTP_APP_URLS = [
  'http://formulariomedios.pages.dev',
  'http://formulariomedios.pages.dev/',
  'http://pedidos.gobiernotdf.gob.ar',
  'http://pedidos.gobiernotdf.gob.ar/',
];

export const FORBIDDEN_LOCALHOST_APP_URLS = [
  'http://localhost',
  'https://localhost',
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:5173',
  'https://localhost:5173',
  'http://127.0.0.1',
  'https://127.0.0.1',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export const FORBIDDEN_SUPABASE_APP_URLS = [
  `https://${PROD_REF}.supabase.co`,
  `https://${PROD_REF}.supabase.co/`,
  `https://${TEST_REF}.supabase.co`,
  `https://${TEST_REF}.supabase.co/`,
];

export function defaultGetSecrets(projectRef, runner = execSync) {
  try {
    const raw = runner(`npx supabase secrets list --project-ref ${projectRef} --output json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];
    const jsonStr = raw.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : (parsed.secrets || []);
  } catch (err) {
    throw new Error(`Error consultando secretos de Supabase (${projectRef}): ${err.message}`);
  }
}

/**
 * Normaliza la lista de secretos distinguiendo entre valores en texto plano
 * y digests SHA-256 de 64 caracteres hexadecimales devueltos por Supabase CLI
 * en el campo `value` o `digest`. Nunca expone valores secretos.
 */
export function normalizeSecrets(input) {
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (input && typeof input === 'object') {
    rawList = Object.entries(input).map(([name, val]) => {
      if (val && typeof val === 'object' && ('value' in val || 'digest' in val)) {
        return { name, ...val };
      }
      return { name, value: String(val), isPlaintextInput: true };
    });
  }

  return rawList.map(item => {
    if (!item || typeof item !== 'object') return item;
    const rawValue = item.value !== undefined && item.value !== null && item.value !== ''
      ? String(item.value).trim()
      : null;
    const rawDigest = item.digest !== undefined && item.digest !== null && item.digest !== ''
      ? String(item.digest).trim()
      : null;

    // Supabase CLI devuelve el hash SHA-256 (64 hex chars) dentro de la propiedad `value`.
    if (rawValue && isSha256Hex(rawValue) && !item.isPlaintextInput) {
      return {
        ...item,
        value: null,
        digest: rawValue.toLowerCase(),
        isSha256Digest: true,
      };
    }

    const effectiveDigest = rawDigest
      ? (isSha256Hex(rawDigest) ? rawDigest.toLowerCase() : rawDigest)
      : (rawValue ? sha256Hex(rawValue) : null);

    return {
      ...item,
      value: rawValue,
      digest: effectiveDigest,
      isSha256Digest: Boolean(rawDigest && isSha256Hex(rawDigest)) || Boolean(rawValue),
    };
  });
}

function parseTokenRole(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return claims.role || null;
  } catch {
    return null;
  }
}

/**
 * Valida de forma pura los secretos de PROD y TEST sin exponer jamás valores secretos.
 * Diferencia estrictamente entre:
 *  - VERIFIED_OK: Secreto presente y valor o digest SHA-256 validado con éxito.
 *  - UNVERIFIABLE: Secreto presente en proveedor, pero sin valor ni digest SHA-256 verificable.
 *  - FAILED: Secreto ausente o valor/digest inválido o colisionante.
 *
 * REGLA FAIL-CLOSED: Nunca declara APTO (passed=true) con datos insuficientes.
 * Retorna { status, passed, checks, errors, unverifiable, warnings }.
 */
export function validateEnvironmentSecrets(rawProdSecrets = [], rawTestSecrets = [], options = {}) {
  const prodSecrets = normalizeSecrets(rawProdSecrets);
  const testSecrets = normalizeSecrets(rawTestSecrets);
  const knownValues = options.knownSecretValues || {};
  const allowedProdAppUrls = [
    ...CANONICAL_PROD_APP_URLS,
    ...(Array.isArray(options.allowedProdAppUrls) ? options.allowedProdAppUrls : []),
  ];
  const allowedProdAppUrlDigests = new Set(allowedProdAppUrls.map(u => sha256Hex(u)));
  const forbiddenHttpDigests = new Set(FORBIDDEN_HTTP_APP_URLS.map(u => sha256Hex(u)));
  const forbiddenLocalhostDigests = new Set(FORBIDDEN_LOCALHOST_APP_URLS.map(u => sha256Hex(u)));
  const forbiddenSupabaseDigests = new Set(FORBIDDEN_SUPABASE_APP_URLS.map(u => sha256Hex(u)));

  const checks = [];
  const errors = [];
  const unverifiable = [];
  const warnings = [];

  function recordCheck(name, status, message) {
    checks.push({ name, status, message });
    if (status === 'FAILED') errors.push(message);
    if (status === 'UNVERIFIABLE') unverifiable.push(message);
    if (status === 'WARNING') warnings.push(message);
  }

  function resolveValue(secret, knownEnvName) {
    if (secret?.value !== undefined && secret?.value !== null && secret.value !== '') {
      return secret.value;
    }
    const known = knownValues[secret?.name || knownEnvName];
    if (known !== undefined && known !== null && known !== '') {
      return String(known);
    }
    return null;
  }

  function resolveSha256Digest(secret, knownEnvName) {
    if (secret?.digest && isSha256Hex(secret.digest)) {
      return secret.digest.toLowerCase();
    }
    const val = resolveValue(secret, knownEnvName);
    if (val !== null) {
      return sha256Hex(val);
    }
    return null;
  }

  // ==========================================
  // 1. VALIDACIÓN EN PRODUCCIÓN
  // ==========================================

  // 1.1 ENVIRONMENT en PROD
  const prodEnv = prodSecrets.find(s => s.name === 'ENVIRONMENT');
  if (!prodEnv) {
    recordCheck('PROD_ENVIRONMENT', 'FAILED', 'FALLO CRÍTICO: El secret ENVIRONMENT está ausente en PRODUCCIÓN.');
  } else {
    const val = resolveValue(prodEnv, 'ENVIRONMENT');
    const shaDigest = resolveSha256Digest(prodEnv, 'ENVIRONMENT');
    if (val !== null) {
      if (val === 'production') {
        recordCheck('PROD_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT verificado exitosamente como "production" en PROD.');
      } else {
        recordCheck('PROD_ENVIRONMENT', 'FAILED', "FALLO CRÍTICO: ENVIRONMENT must be set to 'production' in PRODUCCIÓN.");
      }
    } else if (shaDigest !== null) {
      if (shaDigest === CANONICAL_PROD_ENV_DIGEST) {
        recordCheck('PROD_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT verificado criptográficamente (SHA-256) como "production" en PROD.');
      } else {
        recordCheck('PROD_ENVIRONMENT', 'FAILED', "FALLO CRÍTICO: ENVIRONMENT must be set to 'production' in PRODUCCIÓN (digest SHA-256 divergente).");
      }
    } else {
      recordCheck('PROD_ENVIRONMENT', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: ENVIRONMENT existe en PROD pero su valor no es legible desde el proveedor. Imposible certificar.');
    }
  }

  // 1.2 PUBLIC_APP_URL en PROD
  const prodAppUrl = prodSecrets.find(s => s.name === 'PUBLIC_APP_URL');
  const testAppUrl = testSecrets.find(s => s.name === 'PUBLIC_APP_URL');
  if (!prodAppUrl) {
    recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL está ausente en PRODUCCIÓN.');
  } else {
    const val = resolveValue(prodAppUrl, 'PUBLIC_APP_URL');
    const shaDigest = resolveSha256Digest(prodAppUrl, 'PUBLIC_APP_URL');
    const testUrlDigest = testAppUrl ? (resolveSha256Digest(testAppUrl, 'PUBLIC_APP_URL') || testAppUrl.digest) : null;

    if (val !== null) {
      const trimmed = String(val).trim();
      let hasUrlError = false;
      if (!trimmed.startsWith('https://')) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL must use https://.');
        hasUrlError = true;
      }
      if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL must not point to localhost.');
        hasUrlError = true;
      }
      if (trimmed.includes('supabase.co')) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL en PRODUCCIÓN no puede apuntar a Supabase.');
        hasUrlError = true;
      }
      if (!hasUrlError) {
        recordCheck('PROD_PUBLIC_APP_URL', 'VERIFIED_OK', 'PUBLIC_APP_URL verificada con dominio HTTPS productivo válido.');
      }
    } else if (shaDigest !== null) {
      let hasDigestError = false;
      if (forbiddenHttpDigests.has(shaDigest)) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL must use https:// (digest SHA-256 coincide con URL HTTP).');
        hasDigestError = true;
      }
      if (forbiddenLocalhostDigests.has(shaDigest)) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL must not point to localhost (digest SHA-256 coincide con localhost).');
        hasDigestError = true;
      }
      if (forbiddenSupabaseDigests.has(shaDigest)) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL en PRODUCCIÓN no puede apuntar a Supabase.');
        hasDigestError = true;
      }
      if (testUrlDigest && shaDigest === testUrlDigest) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL en PRODUCCIÓN colisiona con TEST.');
        hasDigestError = true;
      }
      if (!hasDigestError) {
        if (allowedProdAppUrlDigests.has(shaDigest)) {
          recordCheck('PROD_PUBLIC_APP_URL', 'VERIFIED_OK', 'PUBLIC_APP_URL verificada criptográficamente (SHA-256) contra dominio HTTPS productivo canónico.');
        } else {
          recordCheck('PROD_PUBLIC_APP_URL', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: PUBLIC_APP_URL existe en PROD pero su digest SHA-256 no corresponde a un dominio productivo canónico registrado.');
        }
      }
    } else {
      recordCheck('PROD_PUBLIC_APP_URL', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: PUBLIC_APP_URL existe en PROD pero su valor no es legible desde el proveedor.');
    }
  }

  // 1.3 SUPABASE_ANON_KEY en PROD (Rol de credencial / no colisión con service_role)
  const prodAnon = prodSecrets.find(s => s.name === 'SUPABASE_ANON_KEY');
  const prodServiceRole = prodSecrets.find(s => s.name === 'SUPABASE_SERVICE_ROLE_KEY');
  const testAnon = testSecrets.find(s => s.name === 'SUPABASE_ANON_KEY');
  if (prodAnon) {
    const val = resolveValue(prodAnon, 'SUPABASE_ANON_KEY');
    const anonDigest = resolveSha256Digest(prodAnon, 'SUPABASE_ANON_KEY');
    const serviceDigest = prodServiceRole ? resolveSha256Digest(prodServiceRole, 'SUPABASE_SERVICE_ROLE_KEY') : null;
    const testAnonDigest = testAnon ? resolveSha256Digest(testAnon, 'SUPABASE_ANON_KEY') : null;

    if (val !== null) {
      const role = parseTokenRole(val);
      if (role === 'service_role') {
        recordCheck('PROD_ANON_KEY_ROLE', 'FAILED', 'FALLO CRÍTICO: SUPABASE_ANON_KEY carries service_role in PRODUCCIÓN.');
      } else {
        recordCheck('PROD_ANON_KEY_ROLE', 'VERIFIED_OK', `SUPABASE_ANON_KEY validada con rol seguro: "${role || 'anon'}".`);
      }
    } else if (anonDigest !== null && serviceDigest !== null) {
      if (anonDigest === serviceDigest) {
        recordCheck('PROD_ANON_KEY_ROLE', 'FAILED', 'FALLO CRÍTICO: SUPABASE_ANON_KEY carries service_role in PRODUCCIÓN (digest SHA-256 idéntico a SUPABASE_SERVICE_ROLE_KEY).');
      } else if (testAnonDigest && anonDigest === testAnonDigest) {
        recordCheck('PROD_ANON_KEY_ROLE', 'FAILED', 'FALLO CRÍTICO: SUPABASE_ANON_KEY en PROD colisiona con TEST.');
      } else {
        recordCheck('PROD_ANON_KEY_ROLE', 'VERIFIED_OK', 'SUPABASE_ANON_KEY verificada criptográficamente (SHA-256): distinta de SUPABASE_SERVICE_ROLE_KEY y aislada.');
      }
    } else {
      recordCheck('PROD_ANON_KEY_ROLE', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: SUPABASE_ANON_KEY existe en PROD pero el JWT no puede decodificarse ni contrastarse sin SUPABASE_SERVICE_ROLE_KEY.');
    }
  }

  // ==========================================
  // 2. VALIDACIÓN EN TEST
  // ==========================================

  // 2.1 ENVIRONMENT en TEST (Prevención de envío a ciudadanos)
  const testEnv = testSecrets.find(s => s.name === 'ENVIRONMENT');
  if (testEnv) {
    const val = resolveValue(testEnv, 'ENVIRONMENT');
    const shaDigest = resolveSha256Digest(testEnv, 'ENVIRONMENT');
    if (val !== null) {
      if (val === 'production') {
        recordCheck('TEST_ENVIRONMENT', 'FAILED', "FALLO CRÍTICO DE SEGURIDAD: TEST environment must NOT have ENVIRONMENT='production'.");
      } else {
        recordCheck('TEST_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT en TEST verificado correctamente como entorno no productivo.');
      }
    } else if (shaDigest !== null) {
      if (shaDigest === CANONICAL_PROD_ENV_DIGEST) {
        recordCheck('TEST_ENVIRONMENT', 'FAILED', "FALLO CRÍTICO DE SEGURIDAD: TEST environment must NOT have ENVIRONMENT='production' (digest SHA-256 coincide con production).");
      } else {
        recordCheck('TEST_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT en TEST verificado criptográficamente (SHA-256): distinto de "production".');
      }
    } else {
      recordCheck('TEST_ENVIRONMENT', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: ENVIRONMENT existe en TEST pero su valor no es legible.');
    }
  } else {
    recordCheck('TEST_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT no está configurado en TEST (comportamiento seguro por defecto, allowlist activa).');
  }

  // ==========================================
  // 3. AISLAMIENTO ESTRICTO PROD vs TEST
  // ==========================================

  // 3.1 SUPABASE_URL
  const prodSupabaseUrl = prodSecrets.find(s => s.name === 'SUPABASE_URL');
  const testSupabaseUrl = testSecrets.find(s => s.name === 'SUPABASE_URL');
  if (prodSupabaseUrl && testSupabaseUrl) {
    const pVal = resolveValue(prodSupabaseUrl, 'SUPABASE_URL');
    const tVal = resolveValue(testSupabaseUrl, 'SUPABASE_URL');
    if (pVal !== null && tVal !== null) {
      if (pVal === tVal) {
        recordCheck('ISOLATION_SUPABASE_URL', 'FAILED', 'FALLO CRÍTICO: SUPABASE_URL cannot be identical between PROD and TEST.');
      } else {
        recordCheck('ISOLATION_SUPABASE_URL', 'VERIFIED_OK', 'SUPABASE_URL validada: endpoints aislados e independientes.');
      }
    } else if (prodSupabaseUrl.digest && testSupabaseUrl.digest) {
      if (prodSupabaseUrl.digest === testSupabaseUrl.digest) {
        recordCheck('ISOLATION_SUPABASE_URL', 'FAILED', 'FALLO CRÍTICO: SUPABASE_URL posee el mismo digest en PROD y TEST (colisión de secretos).');
      } else {
        recordCheck('ISOLATION_SUPABASE_URL', 'VERIFIED_OK', 'SUPABASE_URL posee digests distintos entre PROD y TEST.');
      }
    } else {
      recordCheck('ISOLATION_SUPABASE_URL', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: No es posible comparar SUPABASE_URL entre PROD y TEST.');
    }
  }

  // 3.2 GOOGLE_DRIVE_FOLDER_ID / GOOGLE_DRIVE_ROOT_FOLDER_ID
  const prodDrive = prodSecrets.find(
    s => s.name === 'GOOGLE_DRIVE_FOLDER_ID' || s.name === 'GOOGLE_DRIVE_ROOT_FOLDER_ID'
  );
  const testDrive = testSecrets.find(
    s => s.name === 'GOOGLE_DRIVE_FOLDER_ID' || s.name === 'GOOGLE_DRIVE_ROOT_FOLDER_ID'
  );
  if (prodDrive && testDrive) {
    const pVal = resolveValue(prodDrive, prodDrive.name);
    const tVal = resolveValue(testDrive, testDrive.name);
    if (pVal !== null && tVal !== null) {
      if (pVal === tVal) {
        recordCheck('ISOLATION_DRIVE_FOLDER', 'FAILED', 'FALLO CRÍTICO: GOOGLE_DRIVE_FOLDER_ID cannot be identical between PROD and TEST.');
      } else {
        recordCheck('ISOLATION_DRIVE_FOLDER', 'VERIFIED_OK', 'GOOGLE_DRIVE_FOLDER_ID validada: carpetas de Drive aisladas.');
      }
    } else if (prodDrive.digest && testDrive.digest) {
      if (prodDrive.digest === testDrive.digest) {
        recordCheck('ISOLATION_DRIVE_FOLDER', 'FAILED', 'FALLO CRÍTICO: GOOGLE_DRIVE_FOLDER_ID posee el mismo digest en PROD y TEST (colisión de almacenamiento).');
      } else {
        recordCheck('ISOLATION_DRIVE_FOLDER', 'VERIFIED_OK', 'GOOGLE_DRIVE_FOLDER_ID posee digests distintos entre PROD y TEST.');
      }
    } else {
      recordCheck('ISOLATION_DRIVE_FOLDER', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: No es posible comparar GOOGLE_DRIVE_FOLDER_ID entre PROD y TEST.');
    }
  }

  // ==========================================
  // DETERMINACIÓN FINAL DE ESTADO (FAIL-CLOSED)
  // ==========================================
  let status = 'PASSED';
  let passed = true;

  if (errors.length > 0) {
    status = 'FAILED';
    passed = false;
  } else if (unverifiable.length > 0) {
    if (options.allowUnverifiedPresence === true) {
      status = 'PRESENCE_ONLY_UNVERIFIED';
      passed = true;
    } else {
      // REGLA CRÍTICA: Nunca declarar APTO con datos insuficientes
      status = 'INSUFFICIENT_DATA';
      passed = false;
    }
  }

  return {
    status,
    passed,
    checks,
    errors,
    unverifiable,
    warnings,
  };
}

/**
 * Extrae automáticamente el catálogo canónico de Edge Functions desde `supabase/config.toml`
 * y contrasta su paridad 1:1 con los directorios reales en `supabase/functions/*` (excluyendo `_shared`).
 * Falla de forma determinista (fail-closed) si existe cualquier discrepancia de nombres o falta `index.ts`.
 */
export function extractEdgeFunctionsCatalog(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const configTomlPath = options.configTomlPath || path.join(repoRoot, 'supabase', 'config.toml');
  const functionsDir = options.functionsDir || path.join(repoRoot, 'supabase', 'functions');

  if (!fs.existsSync(configTomlPath)) {
    throw new Error(`[CATALOG_ERROR] No existe supabase/config.toml en: ${configTomlPath}`);
  }
  if (!fs.existsSync(functionsDir)) {
    throw new Error(`[CATALOG_ERROR] No existe directorio supabase/functions en: ${functionsDir}`);
  }

  const configContent = fs.readFileSync(configTomlPath, 'utf8');
  const blockRegex = /\[functions\.([a-z0-9-]+)\]\s*\r?\nverify_jwt\s*=\s*(true|false)/g;
  const configEntries = [];
  const configMap = new Map();

  for (const match of configContent.matchAll(blockRegex)) {
    const slug = match[1];
    const verifyJwt = match[2] === 'true';
    if (configMap.has(slug)) {
      throw new Error(`[CATALOG_ERROR] Función duplicada en supabase/config.toml: ${slug}`);
    }
    const entry = {
      slug,
      verifyJwt,
      deployFlag: verifyJwt ? '' : '--no-verify-jwt',
      entrypoint: `supabase/functions/${slug}/index.ts`,
    };
    configEntries.push(entry);
    configMap.set(slug, entry);
  }

  const dirSlugs = fs
    .readdirSync(functionsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort();

  const missingInDirectories = configEntries
    .map(e => e.slug)
    .filter(slug => !dirSlugs.includes(slug));
  const missingInConfigToml = dirSlugs.filter(slug => !configMap.has(slug));
  const missingEntrypoint = dirSlugs.filter(
    slug => !fs.existsSync(path.join(functionsDir, slug, 'index.ts'))
  );

  if (
    missingInDirectories.length > 0 ||
    missingInConfigToml.length > 0 ||
    missingEntrypoint.length > 0
  ) {
    throw new Error(
      `[CATALOG_MISMATCH] Discrepancia entre supabase/config.toml y supabase/functions/*: ` +
      `missingInDirectories=${JSON.stringify(missingInDirectories)}, ` +
      `missingInConfigToml=${JSON.stringify(missingInConfigToml)}, ` +
      `missingEntrypoint=${JSON.stringify(missingEntrypoint)}`
    );
  }

  return {
    totalCount: configEntries.length,
    entries: configEntries,
    verifyJwtTrue: configEntries.filter(e => e.verifyJwt).map(e => e.slug),
    verifyJwtFalse: configEntries.filter(e => !e.verifyJwt).map(e => e.slug),
  };
}

export function checkEnvironmentGate(options = {}) {
  const getSecretsFn = options.getSecretsFn || defaultGetSecrets;
  console.log('========================================================');
  console.log(' GATE DE DESPLIEGUE: VALIDACIÓN DE SECRETS POR ENTORNO  ');
  console.log('========================================================\n');

  console.log(`[1] Verificando secretos en PRODUCCIÓN (${PROD_REF})...`);
  const prodSecrets = getSecretsFn(PROD_REF);

  console.log(`\n[2] Verificando secretos en TEST (${TEST_REF})...`);
  const testSecrets = getSecretsFn(TEST_REF);

  const result = validateEnvironmentSecrets(prodSecrets, testSecrets, options);

  for (const check of result.checks) {
    const icon = check.status === 'VERIFIED_OK' ? '✓' : check.status === 'UNVERIFIABLE' ? '⚠️' : '❌';
    console.log(`${icon} [${check.status}] ${check.message}`);
  }

  console.log('\n========================================================');
  if (result.passed) {
    console.log('✓ RESULTADO: Gate superado exitosamente. Entornos verificados y aislados.');
    console.log('========================================================');
    return true;
  } else if (result.status === 'INSUFFICIENT_DATA') {
    console.error('⚠️ RESULTADO: Gate BLOQUEADO (INSUFFICIENT_DATA).');
    console.error('   Existen secretos con valores no legibles en la salida de Supabase CLI.');
    console.error('   Por directiva de seguridad fail-closed, no se declara APTO sin verificación de valores.');
    console.log('========================================================');
    if (options.exitOnError !== false) {
      process.exit(1);
    }
    return false;
  } else {
    console.error('❌ RESULTADO: Gate FALLIDO. Se detectaron errores o colisiones críticas.');
    console.log('========================================================');
    if (options.exitOnError !== false) {
      process.exit(1);
    }
    return false;
  }
}

// Run directly if invoked via node
if (process.argv[1]?.endsWith('check-prod-environment-gate.mjs')) {
  checkEnvironmentGate();
}
