import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const PROD_URL = `https://${PROD_REF}.supabase.co`;

const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const prodSecretsPath = path.join(userProfile, '.pedidos', 'prod-secrets.json');
const prodSecrets = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
const SERVICE_KEY = prodSecrets.SUPABASE_SERVICE_ROLE_KEY;

async function testProdAdminPreview() {
  console.log('=== VERIFICANDO PREVIEW ADMIN EN PRODUCCIÓN (' + PROD_REF + ') ===\n');

  const serviceClient = createClient(PROD_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Obtener un usuario administrador aprobado existente en PROD
  const { data: adminUsers, error: uErr } = await serviceClient
    .from('usuarios_acceso')
    .select('user_id, nombre, apellido, app_role, estado_acceso')
    .eq('app_role', 'administrador')
    .eq('estado_acceso', 'aprobado')
    .limit(1);

  if (uErr || !adminUsers || adminUsers.length === 0) {
    throw new Error('No se encontró administrador aprobado en PROD: ' + uErr?.message);
  }

  const adminProfile = adminUsers[0];
  console.log(`✓ Administrador PROD detectado: ${adminProfile.nombre} ${adminProfile.apellido} (${adminProfile.user_id})`);

  // 2. Generar un JWT autenticado para este usuario admin usando admin.generateLink o signIn
  const { data: userAuth, error: authUserErr } = await serviceClient.auth.admin.getUserById(adminProfile.user_id);
  if (authUserErr || !userAuth?.user) {
    throw new Error('Error al obtener auth.user en PROD: ' + authUserErr?.message);
  }

  // 3. Obtener 1 PED real existente para consultar preview
  const { data: samplePeds, error: pErr } = await serviceClient
    .from('pedidos')
    .select('id, pedido_visible')
    .limit(1);

  if (pErr || !samplePeds || samplePeds.length === 0) {
    console.log('No hay pedidos en PROD para probar');
    return;
  }

  const samplePed = samplePeds[0];
  console.log(`✓ PED de muestra para preview (sin modificar): ${samplePed.pedido_visible} (${samplePed.id})`);

  // Probar preview llamando a admin_pedidos_purge_preview RPC con service_role
  const { data: previewData, error: previewErr } = await serviceClient.rpc('admin_pedidos_purge_preview', {
    p_pedido_ids: [samplePed.id],
    p_actor: `${adminProfile.nombre} ${adminProfile.apellido}`,
  });

  if (previewErr) {
    console.error('FAIL en RPC admin_pedidos_purge_preview:', previewErr);
    process.exit(1);
  }

  console.log('✓ RPC admin_pedidos_purge_preview en PROD exitoso:');
  console.log(JSON.stringify(previewData, null, 2));

  console.log('\n=== VERIFICACIÓN EN PRODUCCIÓN COMPLETADA CON ÉXITO ===');
}

testProdAdminPreview().catch((err) => {
  console.error('Error en verificación PROD:', err);
  process.exit(1);
});
