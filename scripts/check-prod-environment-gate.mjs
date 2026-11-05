import { execSync } from 'node:child_process';

export const PROD_REF = 'uwzgyirilafgnbpmrkic';
export const TEST_REF = 'yqfkzgqvezarzhlwiilo';

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

function normalizeSecrets(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    return Object.entries(input).map(([name, val]) => {
      if (val && typeof val === 'object' && ('value' in val || 'digest' in val)) {
        return { name, ...val };
      }
      return { name, value: String(val) };
    });
  }
  return [];
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
 * Valida de forma pura los secretos de PROD y TEST.
 * Diferencia estrictamente entre:
 *  - VERIFIED_OK: Secreto presente y valor validado con éxito.
 *  - UNVERIFIABLE: Secreto presente en proveedor, pero valor no accesible en 'secrets list'.
 *  - FAILED: Secreto ausente o valor inválido/colisionante.
 *
 * REGLA FAIL-CLOSED: Nunca declara APTO (passed=true) con datos insuficientes.
 * Retorna { status, passed, checks, errors, unverifiable, warnings }.
 */
export function validateEnvironmentSecrets(rawProdSecrets = [], rawTestSecrets = [], options = {}) {
  const prodSecrets = normalizeSecrets(rawProdSecrets);
  const testSecrets = normalizeSecrets(rawTestSecrets);
  const knownValues = options.knownSecretValues || {};

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

  // Helper para resolver valor de un secreto (objeto o knownValues)
  function resolveValue(secret, knownEnvName) {
    if (secret?.value !== undefined && secret?.value !== null && secret.value !== '') {
      return secret.value;
    }
    if (knownValues[secret?.name || knownEnvName]) {
      return knownValues[secret?.name || knownEnvName];
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
    if (val !== null) {
      if (val === 'production') {
        recordCheck('PROD_ENVIRONMENT', 'VERIFIED_OK', 'ENVIRONMENT verificado exitosamente como "production" en PROD.');
      } else {
        recordCheck('PROD_ENVIRONMENT', 'FAILED', `FALLO CRÍTICO: ENVIRONMENT must be set to 'production' in PRODUCCIÓN. Valor detectado: "${val}".`);
      }
    } else {
      recordCheck('PROD_ENVIRONMENT', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: ENVIRONMENT existe en PROD pero su valor no es legible desde el proveedor. Imposible certificar.');
    }
  }

  // 1.2 PUBLIC_APP_URL en PROD
  const prodAppUrl = prodSecrets.find(s => s.name === 'PUBLIC_APP_URL');
  if (!prodAppUrl) {
    recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', 'FALLO CRÍTICO: PUBLIC_APP_URL está ausente en PRODUCCIÓN.');
  } else {
    const val = resolveValue(prodAppUrl, 'PUBLIC_APP_URL');
    if (val !== null) {
      const trimmed = String(val).trim();
      let hasUrlError = false;
      if (!trimmed.startsWith('https://')) {
        recordCheck('PROD_PUBLIC_APP_URL', 'FAILED', `FALLO CRÍTICO: PUBLIC_APP_URL must use https://. Valor detectado: "${trimmed}".`);
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
        recordCheck('PROD_PUBLIC_APP_URL', 'VERIFIED_OK', `PUBLIC_APP_URL verificada con HTTPS válido: "${trimmed}".`);
      }
    } else {
      recordCheck('PROD_PUBLIC_APP_URL', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: PUBLIC_APP_URL existe en PROD pero su valor no es legible desde el proveedor.');
    }
  }

  // 1.3 SUPABASE_ANON_KEY en PROD (Rol de credencial)
  const prodAnon = prodSecrets.find(s => s.name === 'SUPABASE_ANON_KEY');
  if (prodAnon) {
    const val = resolveValue(prodAnon, 'SUPABASE_ANON_KEY');
    if (val !== null) {
      const role = parseTokenRole(val);
      if (role === 'service_role') {
        recordCheck('PROD_ANON_KEY_ROLE', 'FAILED', 'FALLO CRÍTICO: SUPABASE_ANON_KEY carries service_role in PRODUCCIÓN.');
      } else {
        recordCheck('PROD_ANON_KEY_ROLE', 'VERIFIED_OK', `SUPABASE_ANON_KEY validada con rol seguro: "${role || 'anon'}".`);
      }
    } else {
      recordCheck('PROD_ANON_KEY_ROLE', 'UNVERIFIABLE', 'INSUFFICIENT_DATA: SUPABASE_ANON_KEY existe en PROD pero el JWT no puede decodificarse sin el valor.');
    }
  }

  // ==========================================
  // 2. VALIDACIÓN EN TEST
  // ==========================================

  // 2.1 ENVIRONMENT en TEST (Prevención de envío a ciudadanos)
  const testEnv = testSecrets.find(s => s.name === 'ENVIRONMENT');
  if (testEnv) {
    const val = resolveValue(testEnv, 'ENVIRONMENT');
    if (val !== null) {
      if (val === 'production') {
        recordCheck('TEST_ENVIRONMENT', 'FAILED', 'FALLO CRÍTICO DE SEGURIDAD: TEST environment must NOT have ENVIRONMENT=\'production\'.');
      } else {
        recordCheck('TEST_ENVIRONMENT', 'VERIFIED_OK', `ENVIRONMENT en TEST verificado correctamente como "${val}".`);
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

  // 3.2 GOOGLE_DRIVE_FOLDER_ID
  const prodDrive = prodSecrets.find(s => s.name === 'GOOGLE_DRIVE_FOLDER_ID');
  const testDrive = testSecrets.find(s => s.name === 'GOOGLE_DRIVE_FOLDER_ID');
  if (prodDrive && testDrive) {
    const pVal = resolveValue(prodDrive, 'GOOGLE_DRIVE_FOLDER_ID');
    const tVal = resolveValue(testDrive, 'GOOGLE_DRIVE_FOLDER_ID');
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
