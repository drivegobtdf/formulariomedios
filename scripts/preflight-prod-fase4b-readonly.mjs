import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const PROD_PROJECT_REF = 'uwzgyirilafgnbpmrkic';
const SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3emd5aXJpbGFmZ25icG1ya2ljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc1NjQyMiwiZXhwIjoyMTA1MzMyNDIyfQ.OSAOkhF_PZ1RYWeygtxXNpWosjYJZl2NNsAS8mG1bAs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('================================================================');
  console.log('PREFLIGHT PROD DE SOLO LECTURA — FASE 4B');
  console.log(`Proyecto: ${PROD_PROJECT_REF} (${SUPABASE_URL})`);
  console.log('================================================================\n');

  // 1. Obtener todos los pedidos de PROD
  let allPedidos = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, pedido_visible, etiqueta_interna, created_at')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Error consultando pedidos en PROD: ' + error.message);
    allPedidos.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Total pedidos en PROD: ${allPedidos.length}`);

  // Pedidos con etiqueta_interna
  const pedidosConEtiqueta = allPedidos.filter(
    (p) => p.etiqueta_interna !== null && String(p.etiqueta_interna).trim() !== ''
  );
  console.log(`- Cantidad de pedidos con etiqueta_interna: ${pedidosConEtiqueta.length}`);

  // Cantidad de etiquetas que se crearían por backfill
  // El backfill hace: INSERT INTO pedido_etiquetas (pedido_id, texto, color) SELECT p.id, trim(p.etiqueta_interna), 'azul' FROM pedidos p WHERE ...
  // Como cada pedido tiene máximo 1 etiqueta_interna histórica:
  const etiquetasBackfill = pedidosConEtiqueta.map((p) => ({
    pedido_id: p.id,
    pedido_visible: p.pedido_visible,
    texto: String(p.etiqueta_interna).trim(),
  }));
  console.log(`- Cantidad de etiquetas que se crearían por backfill: ${etiquetasBackfill.length}`);

  // Cantidad de etiquetas que exceden el límite nuevo de 30 caracteres
  const etiquetasExceden30 = etiquetasBackfill.filter((e) => e.texto.length > 30);
  console.log(`- Cantidad de etiquetas que exceden el límite de 30 caracteres: ${etiquetasExceden30.length}`);
  if (etiquetasExceden30.length > 0) {
    console.log('  Detalle de etiquetas excedentes:', etiquetasExceden30);
  }

  // Conflictos potenciales:
  // - Conflictos de clave única (pedido_id, lower(trim(texto))):
  // Dado que cada pedido en pedidos solo tiene 1 etiqueta_interna, no puede haber duplicados intra-pedido en el backfill.
  // - Etiquetas vacías tras trim:
  const etiquetasVacias = pedidosConEtiqueta.filter((p) => String(p.etiqueta_interna).trim().length === 0);
  console.log(`- Conflictos potenciales (etiquetas vacías o inválidas): ${etiquetasVacias.length}`);

  // Verificar si la tabla pedido_etiquetas o pedido_checklist_items ya existen en PROD
  const { data: dataEtq, error: errEtqTable } = await supabase.from('pedido_etiquetas').select('id').limit(1);
  const { data: dataChk, error: errChkTable } = await supabase.from('pedido_checklist_items').select('id').limit(1);

  const tablaEtiquetasExiste = !errEtqTable && Array.isArray(dataEtq);
  const tablaChecklistExiste = !errChkTable && Array.isArray(dataChk);

  console.log(`- Tabla public.pedido_etiquetas existe en PROD: ${tablaEtiquetasExiste ? 'SÍ' : 'NO'}`);
  console.log(`- Tabla public.pedido_checklist_items existe en PROD: ${tablaChecklistExiste ? 'SÍ' : 'NO'}`);

  // 2. Migraciones pendientes
  console.log('\n--- Consultando migraciones pendientes en PROD ---');
  try {
    const listOut = execSync(`npx.cmd supabase migration list --project-ref ${PROD_PROJECT_REF}`, { encoding: 'utf8' });
    const idx = listOut.indexOf('{"migrations":');
    if (idx === -1) throw new Error('No se encontró bloque {"migrations": en la salida');
    const jsonLine = listOut.slice(idx).split(/\r?\n/)[0];
    const parsed = JSON.parse(jsonLine);
    const migs = Array.isArray(parsed) ? parsed : parsed.migrations || [];
    const pending = migs.filter((m) => m.local && !m.remote);
    console.log(`Total migraciones registradas: ${migs.length}`);
    console.log(`Migraciones pendientes en PROD (${pending.length}):`);
    pending.forEach((m) => console.log(`  • ${m.local}`));
  } catch (err) {
    console.error('Error consultando migration list:', err.message);
  }
}

main().catch((err) => {
  console.error('Error en preflight PROD:', err);
  process.exit(1);
});
