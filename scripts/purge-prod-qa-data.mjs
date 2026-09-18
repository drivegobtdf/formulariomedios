import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'uwzgyirilafgnbpmrkic';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const prodSecrets = JSON.parse(fs.readFileSync(path.join(userProfile, '.pedidos', 'prod-secrets.json'), 'utf8'));
const SERVICE_KEY = prodSecrets.SUPABASE_SERVICE_ROLE_KEY;

const serviceClient = createClient(PROD_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INITIAL_ADMIN_EMAIL = 'pablosaldiviainfo@gmail.com';
const INITIAL_ADMIN_ID = '29a14dc3-6be4-47fa-8451-f7cd894b04a1';

async function main() {
  console.log('========================================================');
  console.log('    PURGA Y RESETEO POST-TEST — PRODUCCIÓN LIMPIA       ');
  console.log('    Target: https://uwzgyirilafgnbpmrkic.supabase.co     ');
  console.log('========================================================\n');

  // 1. Limpieza de tablas operativas en orden de dependencias
  console.log('1. Purgando registros operativos de prueba...');

  const tablesToTruncate = [
    'comunicaciones_pedido',
    'domain_events',
    'solicitudes_informacion',
    'notas_pedido',
    'pedido_historial',
    'archivos_adjuntos',
    'archivos_entrega',
    'archivos_solicitud_info',
    'solicitante_access_tokens',
    'solicitante_sesiones',
    'pedidos',
    'envios_solicitud',
    'envios_formulario',
    'solicitantes',
  ];

  for (const table of tablesToTruncate) {
    const { error } = await serviceClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`  - Tabla ${table}: error al borrar: ${error.message}`);
    } else {
      console.log(`  ✓ Tabla ${table}: purgada exitosamente.`);
    }
  }

  // 2. Limpieza de usuarios temporales de prueba en auth.users y usuarios_acceso
  console.log('\n2. Purgando usuarios temporales de prueba QA...');
  const { data: userList } = await serviceClient.auth.admin.listUsers();
  for (const u of userList?.users || []) {
    if (u.email !== INITIAL_ADMIN_EMAIL && u.id !== INITIAL_ADMIN_ID) {
      console.log(`  - Eliminando usuario QA: ${u.email} (${u.id})`);
      await serviceClient.from('usuarios_acceso').delete().eq('user_id', u.id);
      await serviceClient.auth.admin.deleteUser(u.id);
    }
  }

  // Asegurar administrador inicial
  await serviceClient.from('usuarios_acceso').upsert({
    user_id: INITIAL_ADMIN_ID,
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombre_usuario: 'pablosaldivia',
    app_role: 'administrador',
    estado_acceso: 'aprobado',
  });
  console.log(`  ✓ Administrador inicial asegurado: ${INITIAL_ADMIN_EMAIL} (rol: administrador, estado: aprobado)`);

  // 3. Resetear secuencia anual de pedidos a 0 para el año 2026
  console.log('\n3. Reseteando secuencia anual de pedidos a 0 para 2026...');
  const { error: seqErr } = await serviceClient
    .from('secuencia_pedidos_anual')
    .upsert({ anio: 2026, ultimo_numero: 0 });
  if (seqErr) console.warn('  Error al resetear secuencia_pedidos_anual:', seqErr.message);
  else console.log('  ✓ Secuencia anual 2026 reseteada a 0.');

  // 4. Verificación exhaustiva de conteos en base de datos
  console.log('\n4. Verificación de conteos finales en Producción:');
  const verifyTables = [
    'pedidos',
    'envios_solicitud',
    'envios_formulario',
    'solicitantes',
    'archivos_adjuntos',
    'comunicaciones_pedido',
    'domain_events',
    'solicitudes_informacion',
    'notas_pedido',
    'pedido_historial',
    'solicitante_access_tokens',
    'solicitante_sesiones',
    'usuarios_acceso',
    'categorias_servicio',
    'tipos_servicio',
    'configuracion_sistema',
    'secuencia_pedidos_anual',
  ];

  const counts = {};
  for (const t of verifyTables) {
    const { count, error } = await serviceClient.from(t).select('*', { count: 'exact', head: true });
    counts[t] = error ? `ERROR: ${error.message}` : count;
  }

  console.table(counts);

  // Validaciones críticas
  if (counts.pedidos !== 0 || counts.comunicaciones_pedido !== 0 || counts.domain_events !== 0) {
    throw new Error('FALLO DE LIMPIEZA: Tablas operativas contienen registros residuales.');
  }

  if (counts.usuarios_acceso !== 1) {
    throw new Error(`FALLO DE USUARIOS: Se esperaba exactamente 1 usuario administrador, encontrados: ${counts.usuarios_acceso}`);
  }

  if (counts.categorias_servicio !== 8 || counts.tipos_servicio !== 11) {
    throw new Error('FALLO DE CATÁLOGOS: Catálogos oficiales no coinciden.');
  }

  console.log('\n✅ BASE DE DATOS DE PRODUCCIÓN PURGADA, RESETEADA Y 100% LIMPIA.');
}

main().catch(err => {
  console.error('\n❌ ERROR EN PURGA:', err);
  process.exit(1);
});
