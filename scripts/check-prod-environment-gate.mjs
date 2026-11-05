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
    return Object.entries(input).map(([name, value]) => ({ name, value }));
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
 * Retorna { passed: boolean, errors: string[], warnings: string[] }.
 */
export function validateEnvironmentSecrets(rawProdSecrets = [], rawTestSecrets = []) {
  const prodSecrets = normalizeSecrets(rawProdSecrets);
  const testSecrets = normalizeSecrets(rawTestSecrets);

  const errors = [];
  const warnings = [];

  // 1. Validar PROD
  const prodEnv = prodSecrets.find(s => s.name === 'ENVIRONMENT');
  if (!prodEnv || !prodEnv.value) {
    errors.push('FALLO CRÍTICO: ENVIRONMENT must be set to \'production\' in PRODUCCIÓN.');
  } else if (prodEnv.value !== 'production') {
    errors.push(`FALLO CRÍTICO: ENVIRONMENT must be set to 'production' in PRODUCCIÓN. Valor detectado: "${prodEnv.value}".`);
  }

  const prodAppUrl = prodSecrets.find(s => s.name === 'PUBLIC_APP_URL');
  if (!prodAppUrl) {
    errors.push('FALLO CRÍTICO: PUBLIC_APP_URL está ausente en PRODUCCIÓN.');
  } else if (prodAppUrl.value) {
    const val = prodAppUrl.value.trim();
    if (!val.startsWith('https://')) {
      errors.push(`FALLO CRÍTICO: PUBLIC_APP_URL must use https://. Valor detectado: "${val}".`);
    }
    if (val.includes('localhost') || val.includes('127.0.0.1')) {
      errors.push(`FALLO CRÍTICO: PUBLIC_APP_URL must not point to localhost.`);
    }
    if (val.includes('supabase.co')) {
      errors.push(`FALLO CRÍTICO: PUBLIC_APP_URL en PRODUCCIÓN no puede apuntar a Supabase.`);
    }
  }

  // Validar claves en PROD
  const prodAnon = prodSecrets.find(s => s.name === 'SUPABASE_ANON_KEY');
  if (prodAnon && prodAnon.value) {
    const role = parseTokenRole(prodAnon.value);
    if (role === 'service_role') {
      errors.push('FALLO CRÍTICO: SUPABASE_ANON_KEY carries service_role in PRODUCCIÓN.');
    }
  }

  // 2. Validar TEST
  const testEnv = testSecrets.find(s => s.name === 'ENVIRONMENT');
  if (testEnv && testEnv.value === 'production') {
    errors.push('FALLO CRÍTICO DE SEGURIDAD: TEST environment must NOT have ENVIRONMENT=\'production\'. Esto provocaría el envío de correos reales a ciudadanos desde el entorno de pruebas.');
  }

  // 3. Validar Aislamiento PROD vs TEST
  const prodSupabaseUrl = prodSecrets.find(s => s.name === 'SUPABASE_URL');
  const testSupabaseUrl = testSecrets.find(s => s.name === 'SUPABASE_URL');
  if (prodSupabaseUrl?.value && testSupabaseUrl?.value && prodSupabaseUrl.value === testSupabaseUrl.value) {
    errors.push('FALLO CRÍTICO: SUPABASE_URL cannot be identical between PROD and TEST.');
  }

  const prodDrive = prodSecrets.find(s => s.name === 'GOOGLE_DRIVE_FOLDER_ID');
  const testDrive = testSecrets.find(s => s.name === 'GOOGLE_DRIVE_FOLDER_ID');
  if (prodDrive?.value && testDrive?.value && prodDrive.value === testDrive.value) {
    errors.push('FALLO CRÍTICO: GOOGLE_DRIVE_FOLDER_ID cannot be identical between PROD and TEST.');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings
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

  const result = validateEnvironmentSecrets(prodSecrets, testSecrets);

  for (const err of result.errors) {
    console.error(`❌ ${err}`);
  }
  for (const warn of result.warnings) {
    console.warn(`⚠️ ${warn}`);
  }

  console.log('\n========================================================');
  if (result.passed) {
    console.log('✓ RESULTADO: Gate superado exitosamente. Entornos debidamente aislados.');
    console.log('========================================================');
    return true;
  } else {
    console.error('❌ RESULTADO: Gate fallido. Corregir secrets antes de operar.');
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
