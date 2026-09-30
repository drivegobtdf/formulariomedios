import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;

function getProdServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const prodSecretsPath = path.join(os.homedir(), '.pedidos', 'prod-secrets.json');
  if (fs.existsSync(prodSecretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(prodSecretsPath, 'utf8'));
      if (parsed.SUPABASE_SERVICE_ROLE_KEY) return parsed.SUPABASE_SERVICE_ROLE_KEY.trim();
    } catch {}
  }
  try {
    const out = execSync(`npx supabase projects api-keys --project-ref ${PROD_PROJECT_REF} --output json`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const item = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
    if (item && item.api_key) return item.api_key.trim();
  } catch {}
  return null;
}

const serviceKey = getProdServiceKey();
if (!serviceKey) {
  console.error('ERROR: No se pudo obtener service_role key para PROD');
  process.exit(1);
}

async function queryRest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`REST Error [${res.status}] ${url}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function redactEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const redactedName = name.length <= 2 ? `${name[0]}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return `${redactedName}@${domain}`;
}

async function run() {
  console.log('=== DIAGNÓSTICO FORENSE EN PRODUCCIÓN (PROD: uwzgyirilafgnbpmrkic) ===');

  // 1. Buscar pedidos con revision_count > 0 o retrabajo_activo = true o solicitante hotmail
  console.log('\n--- 1. BUSCAR PEDIDOS RECIENTES CON RETRABAJO / REVISIÓN ---');
  const enviosHotmail = await queryRest('envios_formulario?correo=ilike.*hotmail*&select=id,correo,nombre_apellido,area_solicitante,created_at&order=created_at.desc&limit=10');
  console.log(`Envíos con solicitante hotmail encontrados: ${enviosHotmail.length}`);
  for (const e of enviosHotmail) {
    console.log(`  - Envio ID: ${e.id}, Correo: ${redactEmail(e.correo)}, Fecha: ${e.created_at}`);
  }

  const pedidosRetrabajo = await queryRest('pedidos?or=(retrabajo_activo.eq.true,revision_count.gt.0)&select=id,pedido_visible,estado,revision_count,retrabajo_activo,responsable_user_id,revision_requested_at,envio_id,created_at,updated_at&order=updated_at.desc&limit=10');
  console.log(`\nPedidos con retrabajo_activo = true o revision_count > 0 encontrados: ${pedidosRetrabajo.length}`);
  for (const p of pedidosRetrabajo) {
    console.log(`  - Pedido ID: ${p.id} | Visible: ${p.pedido_visible} | Estado: ${p.estado} | RevCount: ${p.revision_count} | RetrabajoActivo: ${p.retrabajo_activo} | Responsable: ${p.responsable_user_id} | RevReqAt: ${p.revision_requested_at}`);
  }

  // Tomar los IDs de pedidos relevantes para análisis profundo
  const targetPedidos = pedidosRetrabajo.length > 0 ? pedidosRetrabajo : [];

  for (const p of targetPedidos) {
    console.log(`\n==================================================`);
    console.log(`ANÁLISIS DETALLADO DEL PEDIDO: ${p.pedido_visible} (${p.id})`);
    console.log(`==================================================`);

    // Obtener envio_formulario
    const envio = await queryRest(`envios_formulario?id=eq.${p.envio_id}&select=id,correo,nombre_apellido,area_solicitante,created_at`);
    console.log('Envío Formulario:');
    if (envio.length > 0) {
      console.log(`  - Solicitante Correo: ${redactEmail(envio[0].correo)}`);
      console.log(`  - Solicitante Nombre: ${envio[0].nombre_apellido}`);
    }

    // 2. Consultar entregas_pedido
    console.log('\n--- 2. ENTREGAS DEL PEDIDO (public.entregas_pedido) ---');
    const entregas = await queryRest(`entregas_pedido?pedido_id=eq.${p.id}&order=version.asc`);
    console.log(`Total de entregas: ${entregas.length}`);
    for (const ent of entregas) {
      console.log(`  - Entrega ID: ${ent.id} | Version: ${ent.version} | EsVigente: ${ent.es_vigente} | EntregadoPor: ${ent.entregado_por} | Fecha: ${ent.created_at}`);

      if (ent.entregado_por) {
        // Consultar usuarios_acceso
        const ua = await queryRest(`usuarios_acceso?user_id=eq.${ent.entregado_por}&select=user_id,nombre,apellido,app_role,estado_acceso`);
        console.log(`    * Usuario Acceso:`, ua.length > 0 ? ua[0] : 'NO ENCONTRADO EN usuarios_acceso');
      }
    }

    if (p.responsable_user_id) {
      console.log(`\nResponsable User ID (${p.responsable_user_id}):`);
      const uaResp = await queryRest(`usuarios_acceso?user_id=eq.${p.responsable_user_id}&select=user_id,nombre,apellido,app_role,estado_acceso`);
      console.log(`  * Usuario Acceso Responsable:`, uaResp.length > 0 ? uaResp[0] : 'NO ENCONTRADO EN usuarios_acceso');
    }

    // 3. Consultar revision_solicitudes y revision_pedidos
    console.log('\n--- 3. REVISIONES REGISTRADAS ---');
    const revPedidos = await queryRest(`revision_pedidos?pedido_id=eq.${p.id}&order=revision_number.asc`);
    console.log(`revision_pedidos (${revPedidos.length}):`);
    for (const rp of revPedidos) {
      console.log(`  - RevPed ID: ${rp.id} | SolicitudID: ${rp.revision_solicitud_id} | EntregaID: ${rp.entrega_id} | RevNum: ${rp.revision_number} | Estado: ${rp.estado} | RequestedAt: ${rp.requested_at}`);

      const revSol = await queryRest(`revision_solicitudes?id=eq.${rp.revision_solicitud_id}`);
      if (revSol.length > 0) {
        console.log(`    * Cabecera Solicitud: ID: ${revSol[0].id}, Email: ${redactEmail(revSol[0].solicitante_email)}, Motivo: "${revSol[0].motivo}", CreatedAt: ${revSol[0].created_at}`);
      }
    }

    // 4. Consultar comunicaciones_pedido
    console.log('\n--- 4. COMUNICACIONES DEL PEDIDO (public.comunicaciones_pedido) ---');
    const comms = await queryRest(`comunicaciones_pedido?pedido_id=eq.${p.id}&order=created_at.asc`);
    console.log(`Total comunicaciones: ${comms.length}`);
    for (const c of comms) {
      console.log(`  - Comm ID: ${c.id}`);
      console.log(`    Tipo: ${c.tipo_comunicacion}`);
      console.log(`    Destinatario: ${redactEmail(c.destinatario_email)}`);
      console.log(`    Estado: ${c.estado}`);
      console.log(`    Attempts: ${c.attempts}/${c.max_attempts}`);
      console.log(`    SentAt: ${c.sent_at}`);
      console.log(`    ProviderMessageId: ${c.provider_message_id}`);
      console.log(`    ErrorMessage: ${c.error_message}`);
      console.log(`    IdempotencyKey: ${c.idempotency_key}`);
      console.log(`    CreatedAt: ${c.created_at}`);
      console.log(`    UpdatedAt: ${c.updated_at}`);
      console.log(`    Payload:`, JSON.stringify(c.payload));
    }

    // 5. Consultar audit_log
    console.log('\n--- 5. AUDIT LOG DEL PEDIDO (public.audit_log) ---');
    const audits = await queryRest(`audit_log?recurso_id=eq.${p.id}&order=created_at.asc`);
    console.log(`Total auditorías: ${audits.length}`);
    for (const a of audits) {
      console.log(`  - Accion: ${a.accion} | Actor: ${a.actor_user_id} | CreatedAt: ${a.created_at} | Metadata:`, JSON.stringify(a.metadata));
    }

    // 6. Consultar domain_events
    console.log('\n--- 6. DOMAIN EVENTS DEL PEDIDO (public.domain_events) ---');
    const events = await queryRest(`domain_events?aggregate_id=eq.${p.id}&order=created_at.asc`);
    console.log(`Total domain events: ${events.length}`);
    for (const ev of events) {
      console.log(`  - EventName: ${ev.event_name} | CreatedAt: ${ev.created_at} | Payload:`, JSON.stringify(ev.payload));
    }
  }
}

run().catch((err) => {
  console.error('ERROR EN DIAGNÓSTICO:', err);
  process.exit(1);
});
