import { createClient } from '@supabase/supabase-js';

const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3emd5aXJpbGFmZ25icG1ya2ljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc1NjQyMiwiZXhwIjoyMTA1MzMyNDIyfQ.OSAOkhF_PZ1RYWeygtxXNpWosjYJZl2NNsAS8mG1bAs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('--- STARTING PROD PREFLIGHT READ-ONLY SIMULATION ---');
  console.log(`Target: ${SUPABASE_URL}`);

  // 1. Fetch domain_events for pedido.finalized
  let allEvents = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('domain_events')
      .select('id, event_name, aggregate_id, payload, actor_user_id, created_at')
      .eq('event_name', 'pedido.finalized')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Error fetching domain_events: ' + error.message);
    allEvents.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allEvents.length} 'pedido.finalized' events from PROD.`);

  // 2. Fetch pedidos
  let allPedidos = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, pedido_visible, estado, responsable_user_id, finalizado_at, updated_at, created_at')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Error fetching pedidos: ' + error.message);
    allPedidos.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allPedidos.length} pedidos from PROD.`);
  const pedidosMap = new Map(allPedidos.map(p => [p.id, p]));

  // 3. Fetch entregas_pedido
  let allEntregas = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('entregas_pedido')
      .select('id, pedido_id, version, es_vigente, nota')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Error fetching entregas_pedido: ' + error.message);
    allEntregas.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allEntregas.length} entregas_pedido from PROD.`);
  const entregasById = new Map(allEntregas.map(e => [e.id, e]));

  // 4. Fetch auth users
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (userError) throw new Error('Error listing auth users: ' + userError.message);
  const userSet = new Set((userData?.users || []).map(u => u.id));
  console.log(`Fetched ${userSet.size} auth users.`);

  // 5. Fetch notas_pedido
  let allNotas = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('notas_pedido')
      .select('id, pedido_id, texto, visibilidad, created_at')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Error fetching notas_pedido: ' + error.message);
    allNotas.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allNotas.length} notas_pedido.`);

  // --- SIMULATION ---
  // Step 2.1: Reconstruct versions from domain_events
  // Filter events where aggregate_id matches an existing pedido
  const validEvents = allEvents.filter(e => pedidosMap.has(e.aggregate_id));
  const orphanEvents = allEvents.filter(e => !pedidosMap.has(e.aggregate_id));

  // Group by aggregate_id
  const eventsByPedido = new Map();
  for (const e of validEvents) {
    if (!eventsByPedido.has(e.aggregate_id)) {
      eventsByPedido.set(e.aggregate_id, []);
    }
    eventsByPedido.get(e.aggregate_id).push(e);
  }

  const simulatedVersions = [];
  const versionsKeySet = new Set();
  let duplicateCount = 0;

  for (const [pedidoId, pEvents] of eventsByPedido.entries()) {
    // Sort ascending by created_at
    pEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let verNum = 1;
    for (const de of pEvents) {
      let entregaId = null;
      const rawEntregaId = de.payload?.entrega_id;
      const rawEntregaVersion = de.payload?.entrega_version;

      if (rawEntregaId && entregasById.has(rawEntregaId)) {
        entregaId = rawEntregaId;
      } else if (rawEntregaVersion !== undefined && rawEntregaVersion !== null) {
        const matchingEntrega = allEntregas.find(ep => ep.pedido_id === pedidoId && ep.version === Number(rawEntregaVersion));
        if (matchingEntrega) {
          entregaId = matchingEntrega.id;
        }
      }

      let notaCierre = (de.payload?.nota && String(de.payload.nota).trim()) || null;
      let finalizadoPor = (de.actor_user_id && userSet.has(de.actor_user_id)) ? de.actor_user_id : null;

      const key = `${pedidoId}:${verNum}`;
      if (versionsKeySet.has(key)) {
        duplicateCount++;
      } else {
        versionsKeySet.add(key);
        simulatedVersions.push({
          pedido_id: pedidoId,
          version_number: verNum,
          entrega_id: entregaId,
          nota_cierre: notaCierre,
          finalizado_por: finalizadoPor,
          finalizado_at: de.created_at,
          created_at: de.created_at,
          source: 'domain_events'
        });
      }
      verNum++;
    }
  }

  // Step 2.2: Coverage for pedidos currently Finalizado without prior versions
  const pedidosConVersiones = new Set(simulatedVersions.map(v => v.pedido_id));
  const finalizadosSinVersion = allPedidos.filter(p => p.estado === 'Finalizado' && !pedidosConVersiones.has(p.id));

  for (const p of finalizadosSinVersion) {
    const epVigente = allEntregas.find(ep => ep.pedido_id === p.id && ep.es_vigente === true);
    const entregaId = epVigente ? epVigente.id : null;

    let notaCierre = epVigente?.nota || null;
    if (!notaCierre) {
      const publicNotas = allNotas
        .filter(n => n.pedido_id === p.id && (n.visibilidad === 'solicitante' || n.visibilidad === 'para_solicitante'))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (publicNotas.length > 0) {
        notaCierre = publicNotas[0].texto;
      }
    }

    const finalizadoPor = (p.responsable_user_id && userSet.has(p.responsable_user_id)) ? p.responsable_user_id : null;
    const finalizadoAt = p.finalizado_at || p.updated_at || p.created_at;

    const key = `${p.id}:1`;
    if (versionsKeySet.has(key)) {
      duplicateCount++;
    } else {
      versionsKeySet.add(key);
      simulatedVersions.push({
        pedido_id: p.id,
        version_number: 1,
        entrega_id: entregaId,
        nota_cierre: notaCierre,
        finalizado_por: finalizadoPor,
        finalizado_at: finalizadoAt,
        created_at: finalizadoAt,
        source: 'pedidos_finalizados_fallback'
      });
    }
  }

  // Analytics
  const distinctPedidosWithEvents = eventsByPedido.size;
  const totalEvents = allEvents.length;
  const totalCreated = simulatedVersions.length;

  const versionCountsPerPedido = new Map();
  for (const v of simulatedVersions) {
    versionCountsPerPedido.set(v.pedido_id, (versionCountsPerPedido.get(v.pedido_id) || 0) + 1);
  }

  let count1Ver = 0;
  let count2Ver = 0;
  let count3PlusVer = 0;
  for (const count of versionCountsPerPedido.values()) {
    if (count === 1) count1Ver++;
    else if (count === 2) count2Ver++;
    else if (count >= 3) count3PlusVer++;
  }

  const entregaNullCount = simulatedVersions.filter(v => v.entrega_id === null).length;
  const entregaAssociatedCount = simulatedVersions.filter(v => v.entrega_id !== null).length;
  const finalizadoPorNullCount = simulatedVersions.filter(v => v.finalizado_por === null).length;
  const finalizadoPorSetCount = simulatedVersions.filter(v => v.finalizado_por !== null).length;

  // Verify all foreign keys exist
  let invalidPedidoFks = simulatedVersions.filter(v => !pedidosMap.has(v.pedido_id)).length;
  let invalidEntregaFks = simulatedVersions.filter(v => v.entrega_id && !entregasById.has(v.entrega_id)).length;
  let invalidUserFks = simulatedVersions.filter(v => v.finalizado_por && !userSet.has(v.finalizado_por)).length;

  console.log('\n=== RESULTADOS PREFLIGHT READ-ONLY PROD ===');
  console.log(`1. Pedidos con eventos 'pedido.finalized': ${distinctPedidosWithEvents}`);
  console.log(`2. Total eventos 'pedido.finalized' históricos: ${totalEvents}`);
  console.log(`   (Eventos huérfanos sin pedido existente: ${orphanEvents.length})`);
  console.log(`3. Total filas pedido_versiones que se crearían: ${totalCreated}`);
  console.log(`   - Desde domain_events: ${simulatedVersions.filter(v => v.source === 'domain_events').length}`);
  console.log(`   - Desde fallback pedidos Finalizados: ${simulatedVersions.filter(v => v.source === 'pedidos_finalizados_fallback').length}`);
  console.log(`4. Distribución de versiones por pedido:`);
  console.log(`   - 1 versión: ${count1Ver} pedidos`);
  console.log(`   - 2 versiones: ${count2Ver} pedidos`);
  console.log(`   - 3+ versiones: ${count3PlusVer} pedidos`);
  console.log(`5. entregas_pedido:`);
  console.log(`   - Versiones con entrega_id NULL: ${entregaNullCount}`);
  console.log(`   - Versiones con entrega_id asociada válida: ${entregaAssociatedCount}`);
  console.log(`6. finalizado_por:`);
  console.log(`   - Versiones con finalizado_por NULL: ${finalizadoPorNullCount}`);
  console.log(`   - Versiones con finalizado_por informado: ${finalizadoPorSetCount}`);
  console.log(`7. Integridad referencial y unicidad:`);
  console.log(`   - Conflictos de unicidad (pedido_id, version_number): ${duplicateCount}`);
  console.log(`   - FKs inválidas a pedidos: ${invalidPedidoFks}`);
  console.log(`   - FKs inválidas a entregas_pedido: ${invalidEntregaFks}`);
  console.log(`   - FKs inválidas a auth.users: ${invalidUserFks}`);
  console.log('=== FIN PREFLIGHT ===');
}

main().catch(err => {
  console.error('Preflight error:', err);
  process.exit(1);
});
