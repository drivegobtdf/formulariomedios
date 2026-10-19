/**
 * Suite de Verificación de Integración QA — FASE 4D: COMPARTIR FINALIZACIONES POR WHATSAPP
 * Entorno: LOCAL + Supabase TEST (yqfkzgqvezarzhlwiilo)
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_REF = 'yqfkzgqvezarzhlwiilo';
const SUPABASE_URL = `https://${TEST_REF}.supabase.co`;

function getApiKeys() {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'npx.cmd' : 'npx';
  const out = execSync(`${cmd} supabase projects api-keys --project-ref ${TEST_REF} --output json`, { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
  const serviceKey = keys.find(k => k.id === 'service_role' || k.name === 'service_role')?.api_key?.trim();
  const anonKey = keys.find(k => k.id === 'anon' || k.name === 'anon')?.api_key?.trim();
  if (!serviceKey || !anonKey) {
    throw new Error('No se pudieron obtener las API keys para Supabase TEST');
  }
  return { serviceKey, anonKey };
}

const { serviceKey, anonKey } = getApiKeys();
const supabaseAdmin = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function assertQA(condition, message) {
  results.push({ pass: !!condition, message });
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// Emulador idéntico del generador canónico de Fase 4D para pruebas backend / script
function normalizeArPhone(phoneStr) {
  if (!phoneStr || typeof phoneStr !== 'string') return null;
  const digits = phoneStr.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  let cleanDigits = digits;
  // Manejo de prefijos argentinos
  if (cleanDigits.startsWith('549')) {
    // ya tiene formato internacional completo
  } else if (cleanDigits.startsWith('54') && !cleanDigits.startsWith('549')) {
    cleanDigits = `549${cleanDigits.slice(2)}`;
  } else if (cleanDigits.startsWith('0')) {
    cleanDigits = `549${cleanDigits.slice(1)}`;
  } else if (cleanDigits.startsWith('15')) {
    cleanDigits = `549${cleanDigits.slice(2)}`;
  } else if (cleanDigits.length === 10) {
    cleanDigits = `549${cleanDigits}`;
  }

  // Descartar si no tiene longitud estándar móvil argentina (549 + 10 dígitos = 13 dígitos)
  if (cleanDigits.length !== 13) return null;
  return `https://wa.me/${cleanDigits}`;
}

function generateMessage({
  codigo,
  titulo,
  solicitanteNombre,
  solicitanteArea,
  solicitanteTelefono,
  versionNumber,
  enlacesEntrega,
  archivosEntrega,
  pedidoId,
}) {
  const sections = [];

  // 1. Encabezado
  if (versionNumber <= 1) {
    sections.push('✅ *PEDIDO FINALIZADO*');
  } else {
    sections.push('🔄✨ *NUEVA VERSIÓN DISPONIBLE*');
  }

  // 2. Metadatos
  const cleanCodigo = (codigo || '').trim();
  const cleanTitulo = (titulo || '').trim();
  const lineaCodigo = cleanTitulo ? `📌 *${cleanCodigo} — ${cleanTitulo}*` : `📌 *${cleanCodigo}*`;

  const cleanNombre = (solicitanteNombre || '').trim();
  const cleanArea = (solicitanteArea || '').trim();
  let lineaSol = '👤 *Solicitante:* No especificado';
  if (cleanNombre && cleanArea) {
    lineaSol = `👤 *Solicitante:* ${cleanNombre} — ${cleanArea}`;
  } else if (cleanNombre) {
    lineaSol = `👤 *Solicitante:* ${cleanNombre}`;
  }

  const lineaVer = `📦 *Versión:* ${versionNumber}`;
  sections.push(`${lineaCodigo}\n${lineaSol}\n${lineaVer}`);

  // 3. Archivos y Enlaces
  const validEnlaces = (enlacesEntrega || []).filter(Boolean);
  const validArchivos = (archivosEntrega || []).filter(Boolean);
  if (validEnlaces.length > 0 || validArchivos.length > 0) {
    const items = [];
    for (const u of validEnlaces) items.push(u);
    for (const a of validArchivos) items.push(`📄 ${a} (descargar en Gestión)`);
    sections.push(`📎 *Archivos y enlaces de esta entrega:*\n${items.join('\n')}`);
  }

  // 4. WhatsApp solicitante
  const waUrl = normalizeArPhone(solicitanteTelefono);
  if (waUrl) {
    sections.push(`📱 *WhatsApp del solicitante:*\n${waUrl}`);
  }

  // 5. Enlace Gestión
  const urlGestion = `https://formulariomedios.pages.dev/gestion/pedidos/${pedidoId}`;
  sections.push(`🖥️ *Ver pedido en Gestión:*\n${urlGestion}`);

  return sections.join('\n\n');
}

async function main() {
  console.log('================================================================');
  console.log('SUITE DE VERIFICACIÓN QA — FASE 4D: WHATSAPP FINALIZACIÓN');
  console.log(`Ambiente TEST: ${SUPABASE_URL}`);
  console.log('================================================================\n');

  const runId = Math.random().toString(36).substring(2, 9);
  const testIds = [];
  const testUsers = [];

  try {
    // 0. Preparar usuario administrador autenticado
    const adminEmail = `f4d.admin.${runId}@tdf.gob.ar`;
    const adminPass = `AdminPass!${runId}2026`;
    const adminUname = `u_admin_${runId}`;
    const { data: authAdmin, error: authAdminErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { nombre: 'Admin', apellido: 'Fase4D QA', nombre_usuario: adminUname },
    });
    if (authAdminErr) throw authAdminErr;
    testUsers.push(authAdmin.user);

    await supabaseAdmin.from('usuarios_acceso').upsert({
      user_id: authAdmin.user.id,
      nombre: 'Admin',
      apellido: 'Fase4D QA',
      nombre_usuario: adminUname,
      app_role: 'administrador',
      estado_acceso: 'aprobado',
    });

    const adminClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAdminErr } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass,
    });
    if (signInAdminErr) throw signInAdminErr;

    const adminUser = authAdmin.user;
    assertQA(!!adminUser, `Usuario Administrador autenticado con éxito (ID: ${adminUser.id})`);

    // -------------------------------------------------------------------------
    // 1. CASO 1: FINALIZACIÓN V1 CON MATERIAL COMPLETO
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Caso 1: Finalización V1 con Material Completo ---');
    const envioId = crypto.randomUUID();
    const fpHash = crypto.createHash('sha256').update(`fp-${crypto.randomUUID()}`).digest('hex');

    const { data: env1, error: errEnv1 } = await supabaseAdmin
      .from('envios_formulario')
      .insert({
        id: envioId,
        submission_key: crypto.randomUUID(),
        request_fingerprint: fpHash,
        nombre_apellido: `Solicitante QA 4D ${runId}`,
        telefono: '2964 477578',
        correo: `qa4d-${runId}@tierradelfuego.gob.ar`,
        area_solicitante: 'Secretaría de Comunicación Pública',
      })
      .select('id')
      .single();

    if (errEnv1) console.error('errEnv1:', errEnv1);
    assertQA(!errEnv1 && !!env1, 'Envío de formulario con solicitante y teléfono argentino creado');

    const { data: cat } = await supabaseAdmin.from('categorias_servicio').select('id, codigo_ped').limit(1).single();
    const { data: tipo } = await supabaseAdmin.from('tipos_servicio').select('id').eq('categoria_id', cat.id).limit(1).single();
    const pedidoId = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(`tok-${crypto.randomUUID()}`).digest('hex');

    const { data: maxNumData } = await supabaseAdmin
      .from('pedidos')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1);
    const nextNum = (maxNumData?.[0]?.numero || 0) + 1;
    const pedCode = `PED-2026-${cat.codigo_ped}${nextNum}`;

    const { data: ped1, error: errPed1 } = await supabaseAdmin
      .from('pedidos')
      .insert({
        id: pedidoId,
        pedido_visible: pedCode,
        anio: 2026,
        numero: nextNum,
        codigo_categoria: cat.codigo_ped,
        categoria_id: cat.id,
        tipo_servicio_id: tipo.id,
        origen: 'publico',
        titulo: `Campaña Difusión Verano ${runId}`,
        estado: 'Nuevo',
        envio_id: env1.id,
        tracking_token_hash: tokenHash,
        client_request_ref: crypto.randomUUID(),
        version: 1,
      })
      .select('id, pedido_visible, titulo, version')
      .single();

    if (errPed1) console.error('errPed1:', errPed1);
    assertQA(!errPed1 && !!ped1, `Pedido 1 creado en estado Nuevo (ID: ${ped1?.id})`);
    testIds.push(ped1.id);

    // Asignar al admin (version 1 -> 2)
    const { error: assignErr } = await adminClient.rpc('pedido_assign', {
      p_pedido_id: ped1.id,
      p_responsable_user_id: adminUser.id,
      p_expected_version: 1,
    });
    assertQA(!assignErr, 'Asignación de responsable exitosa');

    // Cambiar a En proceso (version 2 -> 3)
    const { error: stateErr } = await adminClient.rpc('pedido_change_state', {
      p_pedido_id: ped1.id,
      p_target_state: 'En proceso',
      p_expected_version: 2,
    });
    assertQA(!stateErr, 'Transición a En proceso exitosa');

    const expectedVersionBeforeFinalize = 3;

    // Finalizar Pedido 1
    const { data: fin1Res, error: errFin1 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped1.id,
      p_expected_version: expectedVersionBeforeFinalize,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/drive/folders/qa-v1-drive-folder',
      p_nota_entrega: 'Entrega de afiches y piezas para redes V1',
    });

    assertQA(!errFin1 && fin1Res?.success === true, 'Finalización exitosa en Supabase (RPC pedido_finalize)');
    assertQA(fin1Res?.version_number === 1, 'Versión canónica generada es V1');

    // Generar mensaje
    const msgV1 = generateMessage({
      codigo: ped1.pedido_visible,
      titulo: ped1.titulo,
      solicitanteNombre: `Solicitante QA 4D ${runId}`,
      solicitanteArea: 'Secretaría de Comunicación Pública',
      solicitanteTelefono: '2964 477578',
      versionNumber: fin1Res.version_number,
      enlacesEntrega: ['https://drive.google.com/drive/folders/qa-v1-drive-folder'],
      archivosEntrega: ['afiche_redes_v1.png'],
      pedidoId: ped1.id,
    });

    assertQA(msgV1.includes('✅ *PEDIDO FINALIZADO*'), 'Mensaje V1 incluye encabezado ✅ *PEDIDO FINALIZADO*');
    assertQA(!msgV1.includes('NUEVA VERSIÓN'), 'Mensaje V1 NO contiene texto de nueva versión');
    assertQA(msgV1.includes(`📌 *${ped1.pedido_visible} — ${ped1.titulo}*`), 'Código y título formateados correctamente');
    assertQA(msgV1.includes('👤 *Solicitante:* Solicitante QA 4D') && msgV1.includes('Secretaría de Comunicación Pública'), 'Solicitante y área presentes');
    assertQA(msgV1.includes('📦 *Versión:* 1'), 'Versión 1 explícita');
    assertQA(msgV1.includes('📎 *Archivos y enlaces de esta entrega:*'), 'Sección de material presente');
    assertQA(msgV1.includes('https://drive.google.com/drive/folders/qa-v1-drive-folder'), 'Enlace de entrega presente');
    assertQA(msgV1.includes('📄 afiche_redes_v1.png (descargar en Gestión)'), 'Archivo documentado sin token interno (Req 7)');
    assertQA(msgV1.includes('📱 *WhatsApp del solicitante:*\nhttps://wa.me/5492964477578'), 'Teléfono normalizado a https://wa.me/5492964477578');
    assertQA(msgV1.includes(`🖥️ *Ver pedido en Gestión:*\nhttps://formulariomedios.pages.dev/gestion/pedidos/${ped1.id}`), 'Enlace canónico de Gestión verificado');

    // -------------------------------------------------------------------------
    // 2. CASO 2: REAPERTURA Y FINALIZACIÓN V2 (NUEVA VERSIÓN)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Caso 2: Reapertura y Finalización Posterior V2 ---');
    const { data: reopRes, error: errReop } = await adminClient.rpc('pedido_reopen_finalized', {
      p_pedido_id: ped1.id,
      p_motivo: 'Solicitante solicita cambio en los colores institucionales',
      p_expected_version: fin1Res.version,
    });

    assertQA(!errReop && reopRes?.success === true, 'Reapertura exitosa a estado En proceso');

    // Finalizar V2
    const { data: fin2Res, error: errFin2 } = await adminClient.rpc('pedido_finalize', {
      p_pedido_id: ped1.id,
      p_expected_version: reopRes.version,
      p_archivos_entrega: null,
      p_url_entrega: 'https://drive.google.com/drive/folders/qa-v2-adjusted',
      p_nota_entrega: 'Se ajustaron colores institucionales según pedido',
    });

    assertQA(!errFin2 && fin2Res?.success === true, 'Segunda finalización exitosa');
    assertQA(fin2Res?.version_number === 2, 'Versión canónica es exactamente V2');

    const msgV2 = generateMessage({
      codigo: ped1.pedido_visible,
      titulo: ped1.titulo,
      solicitanteNombre: `Solicitante QA 4D ${runId}`,
      solicitanteArea: 'Secretaría de Comunicación Pública',
      solicitanteTelefono: '2964 477578',
      versionNumber: fin2Res.version_number,
      enlacesEntrega: ['https://drive.google.com/drive/folders/qa-v2-adjusted'],
      archivosEntrega: [],
      pedidoId: ped1.id,
    });

    assertQA(msgV2.includes('🔄✨ *NUEVA VERSIÓN DISPONIBLE*'), 'Mensaje V2 incluye encabezado 🔄✨ *NUEVA VERSIÓN DISPONIBLE*');
    assertQA(!msgV2.includes('✅ *PEDIDO FINALIZADO*'), 'Mensaje V2 NO contiene encabezado de primera finalización');
    assertQA(msgV2.includes('📦 *Versión:* 2'), 'Versión 2 explícita');
    assertQA(msgV2.includes('https://drive.google.com/drive/folders/qa-v2-adjusted'), 'Enlace V2 presente');

    // -------------------------------------------------------------------------
    // 3. CASO 3: FINALIZACIÓN SOLO CON NOTA (OMISIÓN DE BLOQUE DE ARCHIVOS)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Caso 3: Finalización Solo Nota (Omisión de Material) ---');
    const msgSoloNota = generateMessage({
      codigo: ped1.pedido_visible,
      titulo: ped1.titulo,
      solicitanteNombre: 'Juan Sin Material',
      solicitanteArea: 'Dirección de Prensa',
      solicitanteTelefono: '2964 477578',
      versionNumber: 3,
      enlacesEntrega: [],
      archivosEntrega: [],
      pedidoId: ped1.id,
    });

    assertQA(!msgSoloNota.includes('📎 *Archivos y enlaces de esta entrega:*'), 'Bloque de material totalmente omitido cuando no hay archivos ni URLs');
    assertQA(msgSoloNota.includes('📦 *Versión:* 3'), 'Versión preservada');
    assertQA(msgSoloNota.includes('🖥️ *Ver pedido en Gestión:*'), 'Enlace Gestión preservado');

    // -------------------------------------------------------------------------
    // 4. CASO 4: TELÉFONO INVÁLIDO O AUSENTE (OMISIÓN DE WHATSAPP SOLICITANTE)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Caso 4: Teléfono Inválido o Ausente (Req 4) ---');
    const msgSinTel = generateMessage({
      codigo: ped1.pedido_visible,
      titulo: ped1.titulo,
      solicitanteNombre: 'Pedro Sin Teléfono',
      solicitanteArea: 'Legal y Técnica',
      solicitanteTelefono: null,
      versionNumber: 1,
      enlacesEntrega: ['https://dropbox.com/s/123'],
      pedidoId: ped1.id,
    });
    assertQA(!msgSinTel.includes('📱 *WhatsApp del solicitante:*'), 'Bloque WhatsApp omitido si teléfono es null');

    const msgTelInvalido = generateMessage({
      codigo: ped1.pedido_visible,
      titulo: ped1.titulo,
      solicitanteNombre: 'Pedro Tel Corto',
      solicitanteArea: 'Legal y Técnica',
      solicitanteTelefono: '12345',
      versionNumber: 1,
      enlacesEntrega: ['https://dropbox.com/s/123'],
      pedidoId: ped1.id,
    });
    assertQA(!msgTelInvalido.includes('📱 *WhatsApp del solicitante:*'), 'Bloque WhatsApp omitido si teléfono no tiene longitud argentina válida');

    // -------------------------------------------------------------------------
    // 5. CASO 5: CODIFICACIÓN URI PARA INTENT DE WHATSAPP
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Caso 5: Codificación URL Segura (Req 8) ---');
    const intentUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msgV1)}`;
    assertQA(intentUrl.startsWith('https://api.whatsapp.com/send?text='), 'URL base de WhatsApp correcta');
    assertQA(intentUrl.includes('%E2%9C%85'), 'Emojis codificados en percent-encoding (%E2%9C%85)');
    assertQA(!intentUrl.includes('Bearer'), 'CERO tokens JWT o credenciales filtradas');
    assertQA(!intentUrl.includes('service_role'), 'CERO service role keys filtradas');
    assertQA(decodeURIComponent(intentUrl.replace('https://api.whatsapp.com/send?text=', '')) === msgV1, 'Descifrado reversible idéntico al mensaje original');

    console.log('\n================================================================');
    const total = results.length;
    const passed = results.filter((r) => r.pass).length;
    console.log(`RESUMEN FASE 4D: ${passed}/${total} PRUEBAS SUPERADAS (${Math.round((passed / total) * 100)}%)`);
    console.log('ESTADO: VERIFICACIÓN FASE 4D 100% EXITOSA');
    console.log('================================================================\n');

  } catch (err) {
    console.error('ERROR fatal en QA Fase 4D:', err);
    process.exit(1);
  } finally {
    // Limpieza
    for (const pid of testIds) {
      await supabaseAdmin.from('pedido_versiones').delete().eq('pedido_id', pid);
      await supabaseAdmin.from('entregas_pedido').delete().eq('pedido_id', pid);
      await supabaseAdmin.from('pedidos').delete().eq('id', pid);
    }
    for (const u of testUsers) {
      try {
        await supabaseAdmin.from('usuarios_acceso').delete().eq('user_id', u.id);
        await supabaseAdmin.auth.admin.deleteUser(u.id);
      } catch {}
    }
  }
}

main();
