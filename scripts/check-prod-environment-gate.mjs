import { execSync } from 'node:child_process';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const TEST_REF = 'yqfkzgqvezarzhlwiilo';

function getSecrets(projectRef) {
  try {
    const raw = execSync(`npx supabase secrets list --project-ref ${projectRef} --output json`, {
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

export function checkEnvironmentGate() {
  console.log('========================================================');
  console.log(' GATE DE DESPLIEGUE: VALIDACIÓN DE SECRETS POR ENTORNO  ');
  console.log('========================================================\n');

  let passed = true;

  // 1. Validar PROD
  console.log(`[1] Verificando secretos en PRODUCCIÓN (${PROD_REF})...`);
  const prodSecrets = getSecrets(PROD_REF);
  const prodEnvSecret = prodSecrets.find(s => s.name === 'ENVIRONMENT');

  if (!prodEnvSecret) {
    console.error('❌ FALLO CRÍTICO: El secret ENVIRONMENT no está configurado en PROD.');
    console.error('   Esto provocará que comunicaciones-dispatch rechace destinatarios legítimos como PERMANENT_RECIPIENT_REJECTED.');
    console.error('   Solución: npx supabase secrets set ENVIRONMENT=production --project-ref ' + PROD_REF);
    passed = false;
  } else {
    console.log(`✓ Secret ENVIRONMENT detectado en PROD (última actualización: ${prodEnvSecret.updated_at})`);
  }

  const prodAppUrlSecret = prodSecrets.find(s => s.name === 'PUBLIC_APP_URL');
  if (!prodAppUrlSecret) {
    console.error('❌ FALLO CRÍTICO: PUBLIC_APP_URL ausente en PROD.');
    passed = false;
  } else {
    console.log(`✓ Secret PUBLIC_APP_URL detectado en PROD`);
  }

  // 2. Validar TEST
  console.log(`\n[2] Verificando secretos en TEST (${TEST_REF})...`);
  const testSecrets = getSecrets(TEST_REF);
  const testEnvSecret = testSecrets.find(s => s.name === 'ENVIRONMENT');

  if (testEnvSecret) {
    console.log(`ℹ Secret ENVIRONMENT presente en TEST: ${testEnvSecret.name}`);
  } else {
    console.log(`✓ TEST mantiene comportamiento seguro (ENVIRONMENT no configurado como production, allowlist de prueba activa)`);
  }

  console.log('\n========================================================');
  if (passed) {
    console.log('✓ RESULTADO: Gate superado exitosamente. Entorno PROD apto para despacho.');
    console.log('========================================================');
    return true;
  } else {
    console.error('❌ RESULTADO: Gate fallido. Corregir secrets antes de operar.');
    console.log('========================================================');
    process.exit(1);
  }
}

// Run directly if invoked via node
if (process.argv[1]?.endsWith('check-prod-environment-gate.mjs')) {
  checkEnvironmentGate();
}
