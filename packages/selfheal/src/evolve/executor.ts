/**
 * Evolution executor for prescribed improvements
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Prescription, EvolutionResult, ScorecardSnapshot } from '../types.js';

const WORKSPACE = process.env.ZO_WORKSPACE || '/home/workspace';
const RESULTS_DIR = join(WORKSPACE, 'Seeds/zouroboros/results');

function run(cmd: string, timeout = 120000): { stdout: string; ok: boolean; code: number } {
  try {
    const stdout = execSync(cmd, {
      cwd: WORKSPACE,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), ok: true, code: 0 };
  } catch (e: any) {
    return { stdout: (e.stdout || '').toString().trim(), ok: false, code: e.status ?? 1 };
  }
}

function measureMetric(cmd: string): number | null {
  const result = run(cmd, 60000);
  if (!result.ok) return null;
  const num = parseFloat(result.stdout);
  return isNaN(num) ? null : num;
}

async function executeAutoloopMode(prescription: Prescription): Promise<EvolutionResult> {
  const programPath = `/tmp/z-prescription-${prescription.id}.md`;
  
  if (prescription.program) {
    writeFileSync(programPath, prescription.program);
  }

  console.error(`  [evolve] Starting autoloop: ${prescription.playbook.name}`);
  
  const result = run(
    `bun Skills/autoloop/scripts/autoloop.ts --program "${programPath}" 2>&1`,
    8 * 60 * 60 * 1000 // 8 hour timeout
  );

  const success = result.ok && result.stdout.includes('KEEP');

  return {
    prescriptionId: prescription.id,
    success,
    baseline: { composite: prescription.metric.score, metrics: [] },
    postFlight: null, // Would need to parse autoloop results
    delta: 0,
    reverted: !success,
    detail: result.stdout.slice(0, 500),
  };
}

async function executeScriptMode(prescription: Prescription): Promise<EvolutionResult> {
  console.error(`  [evolve] Executing script mode: ${prescription.playbook.name}`);

  // Run setup commands
  if (prescription.playbook.setupCommands) {
    for (const cmd of prescription.playbook.setupCommands) {
      console.error(`  [evolve] Setup: ${cmd.slice(0, 60)}...`);
      const setupResult = run(cmd);
      if (!setupResult.ok) {
        return {
          prescriptionId: prescription.id,
          success: false,
          baseline: { composite: prescription.metric.score, metrics: [] },
          postFlight: null,
          delta: 0,
          reverted: false,
          detail: `Setup failed: ${setupResult.stdout.slice(0, 200)}`,
        };
      }
    }
  }

  // Run main command
  const runCmd = prescription.playbook.runCommand || 'echo "No run command"';
  console.error(`  [evolve] Executing: ${runCmd.slice(0, 60)}...`);
  
  const result = run(runCmd, 300000);

  // Measure post-flight metric
  const postValue = measureMetric(prescription.playbook.metricCommand);
  const baseline = prescription.metric.value;
  const delta = postValue !== null ? postValue - baseline : 0;

  const improved = prescription.playbook.metricDirection === 'higher_is_better'
    ? delta > 0
    : delta < 0;

  return {
    prescriptionId: prescription.id,
    success: result.ok,
    baseline: { composite: baseline, metrics: [{ name: prescription.metric.name, value: baseline, score: prescription.metric.score, status: prescription.metric.status }] },
    postFlight: postValue !== null ? {
      composite: postValue,
      metrics: [{ name: prescription.metric.name, value: postValue, score: postValue, status: improved ? 'HEALTHY' : prescription.metric.status }],
    } : null,
    delta,
    reverted: !improved && result.ok,
    detail: result.stdout.slice(0, 500),
  };
}

export async function executeEvolution(
  prescription: Prescription,
  options: { dryRun?: boolean; skipGovernor?: boolean }
): Promise<EvolutionResult> {
  const { dryRun = false, skipGovernor = false } = options;

  // Governor check
  if (!skipGovernor && !prescription.governor.approved) {
    return {
      prescriptionId: prescription.id,
      success: false,
      baseline: { composite: prescription.metric.score, metrics: [] },
      postFlight: null,
      delta: 0,
      reverted: false,
      detail: `Governor blocked: ${prescription.governor.reason}`,
    };
  }

  if (dryRun) {
    return {
      prescriptionId: prescription.id,
      success: true,
      baseline: { composite: prescription.metric.score, metrics: [] },
      postFlight: null,
      delta: 0,
      reverted: false,
      detail: 'Dry run - no changes made',
    };
  }

  // Ensure results directory
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Execute based on mode
  const result = prescription.program
    ? await executeAutoloopMode(prescription)
    : await executeScriptMode(prescription);

  // Save result
  const resultPath = join(RESULTS_DIR, `${prescription.id}-result.json`);
  writeFileSync(resultPath, JSON.stringify(result, null, 2));

  console.error(`  [evolve] Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (result.delta !== 0) {
    const sign = result.delta > 0 ? '+' : '';
    console.error(`  [evolve] Delta: ${sign}${(result.delta * 100).toFixed(1)}%`);
  }

  return result;
}