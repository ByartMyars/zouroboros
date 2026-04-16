#!/usr/bin/env bun
/**
 * daily-rag-maintenance.ts — Unified daily RAG maintenance
 * 
 * Single daily job that maintains all 4 RAG areas:
 * 1. Swarm memory capture (backfill any missed episodes)
 * 2. Autoloop experiment storage (capture results from program.md runs)
 * 3. Eval result archival (store three-stage-eval outcomes)
 * 4. Vault re-index (new/modified files in scoped directories)
 * 
 * Usage:
 *   bun daily-rag-maintenance.ts run        Execute maintenance
 *   bun daily-rag-maintenance.ts setup      Show agent creation command
 *   bun daily-rag-maintenance.ts status     Show what's pending
 * 
 * Schedule: Daily at 02:00 (2 AM) when system is quiet
 * Idempotent: Safe to run multiple times, uses deduplication
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { Database } from "bun:sqlite";

// ============================================================================
// CONFIG
// ============================================================================

const __scripts = dirname(fileURLToPath(import.meta.url));

const DIRS = {
  swarmResults: `${process.env.HOME || "/root"}/.swarm/results`,
  autoloopRuns: `${process.env.HOME || "/root"}/.autoloop/runs`,
  evalResults: `${process.env.HOME || "/root"}/.three-stage-eval/results`,
};

const SCRIPTS = {
  swarm: join(__scripts, "rag-swarm-retrieval.ts"),
  autoloop: join(__scripts, "autoloop-memory.ts"),
  eval: join(__scripts, "eval-memory.ts"),
  vault: join(__scripts, "vault-hybrid.ts"),
};

const DB_PATH = "/home/workspace/.zo/memory/shared-facts.db";
const LOG_FILE = `${process.env.HOME || "/root"}/.z/logs/daily-rag-maintenance.log`;

// ============================================================================
// UTILITIES
// ============================================================================

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  
  // Ensure log directory exists
  const logDir = join(LOG_FILE, "..");
  await Bun.write(Bun.file(LOG_FILE), line, { append: true, createPath: true });
}

async function runScript(script: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [script, ...args], { stdio: "pipe" });
    
    let output = "";
    proc.stdout?.on("data", (d) => output += d);
    proc.stderr?.on("data", (d) => output += d);
    
    proc.on("close", (code) => resolve(code === 0));
  });
}

// ============================================================================
// 1. SWARM MEMORY CAPTURE
// ============================================================================

interface SwarmResult {
  filename: string;
  swarmId: string;
  mtime: Date;
}

async function getRecentSwarmResults(hours: number = 25): Promise<SwarmResult[]> {
  try {
    const files = await readdir(DIRS.swarmResults);
    const sinceTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const results: SwarmResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") || !file.startsWith("swarm_")) continue;
      
      const path = join(DIRS.swarmResults, file);
      const s = await stat(path);
      
      if (s.mtime.getTime() >= sinceTime) {
        results.push({
          filename: file,
          swarmId: file.replace(".json", ""),
          mtime: s.mtime,
        });
      }
    }
    return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

async function isSwarmInMemory(swarmId: string): Promise<boolean> {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.query(`SELECT COUNT(*) as c FROM episodes WHERE entity = ?`).get(`swarm.${swarmId}`) as { c: number } | null;
    db.close();
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

async function captureSwarm(swarmId: string): Promise<boolean> {
  const resultsPath = join(DIRS.swarmResults, `${swarmId}.json`);
  return runScript(SCRIPTS.swarm, ["--post-swarm", resultsPath]);
}

async function maintainSwarmMemory(): Promise<{ captured: number; skipped: number; errors: number }> {
  await log("📦 Swarm Memory Capture");
  
  const swarms = await getRecentSwarmResults(25);
  await log(`   Found ${swarms.length} recent swarm(s)`);
  
  let captured = 0, skipped = 0, errors = 0;
  
  for (const swarm of swarms) {
    const exists = await isSwarmInMemory(swarm.swarmId);
    
    if (exists) {
      skipped++;
      continue;
    }
    
    const success = await captureSwarm(swarm.swarmId);
    if (success) {
      captured++;
      await log(`   ✅ ${swarm.swarmId}`);
    } else {
      errors++;
      await log(`   ❌ ${swarm.swarmId}`);
    }
  }
  
  await log(`   Summary: ${captured} captured, ${skipped} skipped, ${errors} errors`);
  return { captured, skipped, errors };
}

// ============================================================================
// 2. AUTOLOOP EXPERIMENT CAPTURE
// ============================================================================

interface AutoloopRun {
  filename: string;
  runId: string;
  mtime: Date;
}

async function getRecentAutoloopRuns(hours: number = 25): Promise<AutoloopRun[]> {
  try {
    const files = await readdir(DIRS.autoloopRuns);
    const sinceTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const results: AutoloopRun[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      
      const path = join(DIRS.autoloopRuns, file);
      const s = await stat(path);
      
      if (s.mtime.getTime() >= sinceTime) {
        results.push({
          filename: file,
          runId: file.replace(".json", ""),
          mtime: s.mtime,
        });
      }
    }
    return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

async function isExperimentStored(runId: string): Promise<boolean> {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.query(`SELECT COUNT(*) as c FROM experiments WHERE run_id = ?`).get(runId) as { c: number } | null;
    db.close();
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

async function storeExperiment(runId: string): Promise<boolean> {
  const runPath = join(DIRS.autoloopRuns, `${runId}.json`);
  return runScript(SCRIPTS.autoloop, ["--store", runPath]);
}

async function maintainAutoloopMemory(): Promise<{ stored: number; skipped: number; errors: number }> {
  await log("🔬 Autoloop Experiment Capture");
  
  const runs = await getRecentAutoloopRuns(25);
  await log(`   Found ${runs.length} recent run(s)`);
  
  let stored = 0, skipped = 0, errors = 0;
  
  for (const run of runs) {
    const exists = await isExperimentStored(run.runId);
    
    if (exists) {
      skipped++;
      continue;
    }
    
    const success = await storeExperiment(run.runId);
    if (success) {
      stored++;
      await log(`   ✅ ${run.runId}`);
    } else {
      errors++;
      await log(`   ❌ ${run.runId}`);
    }
  }
  
  await log(`   Summary: ${stored} stored, ${skipped} skipped, ${errors} errors`);
  return { stored, skipped, errors };
}

// ============================================================================
// 3. EVAL RESULT ARCHIVAL
// ============================================================================

interface EvalResult {
  filename: string;
  evalId: string;
  mtime: Date;
}

async function getRecentEvalResults(hours: number = 25): Promise<EvalResult[]> {
  try {
    const files = await readdir(DIRS.evalResults);
    const sinceTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const results: EvalResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      
      const path = join(DIRS.evalResults, file);
      const s = await stat(path);
      
      if (s.mtime.getTime() >= sinceTime) {
        results.push({
          filename: file,
          evalId: file.replace(".json", ""),
          mtime: s.mtime,
        });
      }
    }
    return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

async function isEvalStored(evalId: string): Promise<boolean> {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.query(`SELECT COUNT(*) as c FROM evals WHERE id LIKE ?`).get(`%${evalId}%`) as { c: number } | null;
    db.close();
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

async function storeEval(evalId: string): Promise<boolean> {
  const evalPath = join(DIRS.evalResults, `${evalId}.json`);
  return runScript(SCRIPTS.eval, ["--store", evalPath]);
}

async function maintainEvalMemory(): Promise<{ stored: number; skipped: number; errors: number }> {
  await log("✅ Eval Result Archival");
  
  const evals = await getRecentEvalResults(25);
  await log(`   Found ${evals.length} recent eval(s)`);
  
  let stored = 0, skipped = 0, errors = 0;
  
  for (const e of evals) {
    const exists = await isEvalStored(e.evalId);
    
    if (exists) {
      skipped++;
      continue;
    }
    
    const success = await storeEval(e.evalId);
    if (success) {
      stored++;
      await log(`   ✅ ${e.evalId}`);
    } else {
      errors++;
      await log(`   ❌ ${e.evalId}`);
    }
  }
  
  await log(`   Summary: ${stored} stored, ${skipped} skipped, ${errors} errors`);
  return { stored, skipped, errors };
}

// ============================================================================
// 4. VAULT RE-INDEX
// ============================================================================

async function maintainVaultIndex(): Promise<{ indexed: number; unchanged: number; errors: number }> {
  await log("📚 Vault Re-Index");
  
  // Run incremental index (only new/changed files)
  // Note: vault-hybrid.ts index does incremental by default
  const success = await runScript(SCRIPTS.vault, ["index"]);
  
  if (success) {
    await log("   ✅ Vault index updated");
    return { indexed: 1, unchanged: 0, errors: 0 }; // vault script handles details
  } else {
    await log("   ❌ Vault index failed");
    return { indexed: 0, unchanged: 0, errors: 1 };
  }
}

// ============================================================================
// STATUS CHECK
// ============================================================================

async function showStatus() {
  console.log("📊 Daily RAG Maintenance Status\n");
  
  // Swarm
  const swarms = await getRecentSwarmResults(48);
  let swarmCaptured = 0, swarmPending = 0;
  for (const s of swarms) {
    if (await isSwarmInMemory(s.swarmId)) swarmCaptured++;
    else swarmPending++;
  }
  console.log(`📦 Swarm Memory:`);
  console.log(`   Recent (48h): ${swarms.length}`);
  console.log(`   In memory: ${swarmCaptured} ✅ | Pending: ${swarmPending} ⏳`);
  
  // Autoloop
  const runs = await getRecentAutoloopRuns(48);
  console.log(`\n🔬 Autoloop:`);
  console.log(`   Recent runs (48h): ${runs.length}`);
  console.log(`   Status: Not yet captured (no data directory exists)`);
  
  // Evals
  const evals = await getRecentEvalResults(48);
  console.log(`\n✅ Eval Results:`);
  console.log(`   Recent (48h): ${evals.length}`);
  console.log(`   Status: Not yet captured (no data directory exists)`);
  
  // Vault
  console.log(`\n📚 Vault Index:`);
  console.log(`   Files indexed: Run 'bun vault-hybrid.ts stats' for details`);
  
  console.log(`\n💡 Run 'bun daily-rag-maintenance.ts run' to capture pending items`);
}

// ============================================================================
// SETUP
// ============================================================================

function showSetup() {
  console.log("📅 Daily RAG Maintenance Agent Setup\n");
  console.log("This creates a single scheduled agent that maintains all 4 RAG areas daily.\n");
  
  console.log("What it does every day at 2 AM:");
  console.log("  1. Captures any missed swarm runs to memory");
  console.log("  2. Stores autoloop experiment results");
  console.log("  3. Archives three-stage-eval outcomes");
  console.log("  4. Re-indexes vault for new/modified files\n");
  
  console.log("Create the agent:");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`bun /home/workspace/.z/tools/create-agent.ts \\\n  --label "daily-rag-maintenance" \\\n  --rrule "FREQ=DAILY;BYHOUR=2;BYMINUTE=0" \\\n  --instruction "cd /home/workspace/zouroboros/packages/rag && bun scripts/daily-rag-maintenance.ts run"`);
  console.log("─────────────────────────────────────────────────────────────\n");
  
  console.log("Or create manually at: [Settings > Automations](/?t=automations)\n");
  
  console.log("Schedule details:");
  console.log(`   Frequency: Daily`);
  console.log(`   Time: 02:00 (2 AM)`);
  console.log(`   Timezone: System local time`);
  console.log(`   Log file: ~/.z/logs/daily-rag-maintenance.log`);
}

// ============================================================================
// MAIN
// ============================================================================

async function runMaintenance() {
  await log("\n═══════════════════════════════════════════════════════════════");
  await log("🚀 Daily RAG Maintenance Started");
  await log("═══════════════════════════════════════════════════════════════\n");
  
  const startTime = Date.now();
  
  // Run all 4 maintenance tasks
  const swarm = await maintainSwarmMemory();
  const autoloop = await maintainAutoloopMemory();
  const evals = await maintainEvalMemory();
  const vault = await maintainVaultIndex();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Summary
  await log("\n═══════════════════════════════════════════════════════════════");
  await log(`✅ Daily RAG Maintenance Complete (${duration}s)`);
  await log("═══════════════════════════════════════════════════════════════");
  await log(`   Swarm:    ${swarm.captured} captured, ${swarm.skipped} skipped, ${swarm.errors} errors`);
  await log(`   Autoloop: ${autoloop.stored} stored, ${autoloop.skipped} skipped, ${autoloop.errors} errors`);
  await log(`   Evals:    ${evals.stored} stored, ${evals.skipped} skipped, ${evals.errors} errors`);
  await log(`   Vault:    ${vault.indexed} indexed, ${vault.unchanged} unchanged, ${vault.errors} errors`);
  
  const totalErrors = swarm.errors + autoloop.errors + evals.errors + vault.errors;
  if (totalErrors > 0) {
    await log(`\n⚠️  ${totalErrors} errors occurred - check log for details`);
    process.exit(1);
  }
}

async function main() {
  const cmd = process.argv[2] || "status";
  
  switch (cmd) {
    case "run":
      await runMaintenance();
      break;
      
    case "setup":
      showSetup();
      break;
      
    case "status":
      await showStatus();
      break;
      
    default:
      console.log("Usage:");
      console.log("  bun daily-rag-maintenance.ts run     # Execute maintenance now");
      console.log("  bun daily-rag-maintenance.ts setup   # Show agent creation command");
      console.log("  bun daily-rag-maintenance.ts status  # Show current status");
  }
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await log(`FATAL: ${err.message}`);
  process.exit(1);
});
