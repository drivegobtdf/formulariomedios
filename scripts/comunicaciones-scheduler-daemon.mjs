import fs from 'fs';
import path from 'path';
import { dispatchBatch } from './comunicaciones-dispatch.mjs';
import { createClient } from '@supabase/supabase-js';

// Load environment
function loadEnv() {
  const env = { ...process.env };
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const pedidosEnvPath = path.join(userProfile, '.pedidos', 'n8n-antigravity.env');
  if (fs.existsSync(pedidosEnvPath)) {
    const raw = fs.readFileSync(pedidosEnvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }

  const localEnvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(localEnvPath)) {
    const raw = fs.readFileSync(localEnvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || 'https://yqfkzgqvezakzhlwiilo.supabase.co';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

const reportsDir = path.join(process.cwd(), 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}
const statusFilePath = path.join(reportsDir, 'scheduler-status.json');

const supabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

// Parse arguments
const args = process.argv.slice(2);
const isOnce = args.includes('--once');
const isStatusQuery = args.includes('--status');
const intervalArgIdx = args.indexOf('--interval');
const intervalMs = intervalArgIdx >= 0 && args[intervalArgIdx + 1] ? parseInt(args[intervalArgIdx + 1], 10) : parseInt(env.SCHEDULER_INTERVAL_MS || '5000', 10);
const batchSize = parseInt(env.SCHEDULER_BATCH_SIZE || '10', 10);
const leaseSeconds = parseInt(env.SCHEDULER_LEASE_SECONDS || '300', 10);

if (isStatusQuery) {
  if (fs.existsSync(statusFilePath)) {
    try {
      const statusData = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
      console.log(JSON.stringify(statusData, null, 2));
      process.exit(0);
    } catch (e) {
      console.error('Error leyendo estado:', e.message);
      process.exit(1);
    }
  } else {
    console.log(JSON.stringify({ status: 'not_running', message: 'No status file found' }, null, 2));
    process.exit(0);
  }
}

let isRunning = true;
let totalCycles = 0;
let totalProcessed = 0;
let totalSuccess = 0;
let totalFailed = 0;
let totalUncertain = 0;
let totalSwept = 0;
const startedAt = new Date().toISOString();

function updateStatusFile(extra = {}) {
  try {
    const statusPayload = {
      daemon_pid: process.pid,
      status: isRunning ? 'active' : 'stopped',
      started_at: startedAt,
      last_heartbeat: new Date().toISOString(),
      interval_ms: intervalMs,
      batch_size: batchSize,
      lease_seconds: leaseSeconds,
      metrics: {
        total_cycles: totalCycles,
        total_processed: totalProcessed,
        total_success: totalSuccess,
        total_failed: totalFailed,
        total_uncertain: totalUncertain,
        total_swept: totalSwept,
      },
      ...extra,
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(statusPayload, null, 2), 'utf8');
  } catch (err) {
    console.error('[SCHEDULER] Failed to write status file:', err.message);
  }
}

async function runCycle() {
  totalCycles++;
  const cycleStart = new Date().toISOString();
  console.log(`\n[SCHEDULER] [${cycleStart}] Cycle #${totalCycles} started...`);

  let sweptInCycle = 0;
  let processedInCycle = 0;

  // 1. Sweep expired leases to uncertain (C08 / C10)
  if (supabase) {
    try {
      const { data: sweptCount, error: sweepErr } = await supabase.rpc('comunicacion_sweep_expired_leases');
      if (sweepErr) {
        console.warn('[SCHEDULER] Sweep RPC warning:', sweepErr.message);
      } else {
        sweptInCycle = typeof sweptCount === 'number' ? sweptCount : 0;
        if (sweptInCycle > 0) {
          totalSwept += sweptInCycle;
          console.log(`[SCHEDULER] Swept ${sweptInCycle} expired leases to uncertain.`);
        }
      }
    } catch (sweepEx) {
      console.warn('[SCHEDULER] Error during lease sweep:', sweepEx.message);
    }
  }

  // 2. Dispatch pending communications batch
  try {
    const dispatchResult = await dispatchBatch(batchSize, leaseSeconds);
    if (dispatchResult?.success) {
      processedInCycle = dispatchResult.processed || 0;
      totalProcessed += processedInCycle;

      for (const res of dispatchResult.results || []) {
        if (res.success) {
          totalSuccess++;
        } else if (res.status === 'uncertain') {
          totalUncertain++;
        } else {
          totalFailed++;
        }
      }

      if (processedInCycle > 0) {
        console.log(`[SCHEDULER] Processed ${processedInCycle} communications in cycle #${totalCycles}.`);
      }
    }
  } catch (dispErr) {
    console.error('[SCHEDULER] Dispatch execution error:', dispErr.message);
  }

  updateStatusFile({
    last_cycle_at: cycleStart,
    last_cycle_processed: processedInCycle,
    last_cycle_swept: sweptInCycle,
  });

  return { processedInCycle, sweptInCycle };
}

async function main() {
  console.log('=================================================================');
  console.log('  PEDIDOS — COMMUNICATIONS OUTBOX SCHEDULER DAEMON (F10)');
  console.log(`[SCHEDULER] PID] ${process.pid}`);
  console.log(`[SCHEDULER] Interval] ${intervalMs}ms`);
  console.log(`[SCHEDULER] Batch Size] ${batchSize}`);
  console.log(`[SCHEDULER] Mode] ${isOnce ? 'SINGLE-RUN (--once)' : 'CONTINUOUS DAEMON'}`);
  console.log(`[SCHEDULER] Target] ${supabaseUrl}`);
  console.log('================================================================');

  updateStatusFile();

  // Setup graceful shutdown
  const shutdown = () => {
    console.log('\n[SCHEDULER] Shutting down gracefully...');
    isRunning = false;
    updateStatusFile({ status: 'stopped', stopped_at: new Date().toISOString() });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (isOnce) {
    const result = await runCycle();
    console.log('[SCHEDULER] Single run completed:', result);
    isRunning = false;
    updateStatusFile({ status: 'completed_once', completed_at: new Date().toISOString() });
    process.exitCode = 0;
    return;
  }

  // Continuous loop
  while (isRunning) {
    try {
      await runCycle();
    } catch (err) {
      console.error('[SCHEDULER] Uncaught cycle error:', err.message);
    }
    if (!isRunning) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((err) => {
  console.error('[SCHEDULER] Fatal daemon error:', err);
  isRunning = false;
  updateStatusFile({ status: 'fatal_error', error: err.message });
  process.exit(1);
});
