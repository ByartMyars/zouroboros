/**
 * Core autoloop optimization engine
 */

import { $ } from 'bun';
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { randomUUID } from 'crypto';
import type { ProgramConfig, LoopState, ExperimentRecord } from './types.js';

/**
 * Initialize the loop state
 */
export function initState(config: ProgramConfig, branch: string): LoopState {
  return {
    bestMetric: config.metric.direction === 'lower_is_better' ? Infinity : -Infinity,
    bestCommit: '',
    experimentCount: 0,
    stagnationCount: 0,
    totalCostUSD: 0,
    startTime: Date.now(),
    results: [],
    branch
  };
}

/**
 * Check if the loop should continue
 */
export function shouldContinue(state: LoopState, config: ProgramConfig): { continue: boolean; reason?: string } {
  // Check experiment limit
  if (state.experimentCount >= config.constraints.maxExperiments) {
    return { continue: false, reason: `Reached max experiments (${config.constraints.maxExperiments})` };
  }
  
  // Check duration limit
  const elapsedHours = (Date.now() - state.startTime) / (1000 * 60 * 60);
  if (elapsedHours >= config.constraints.maxDurationHours) {
    return { continue: false, reason: `Reached max duration (${config.constraints.maxDurationHours}h)` };
  }
  
  // Check cost limit
  if (state.totalCostUSD >= config.constraints.maxCostUSD) {
    return { continue: false, reason: `Reached max cost ($${config.constraints.maxCostUSD})` };
  }
  
  return { continue: true };
}

/**
 * Check if a metric is better than the current best
 */
export function isBetter(metric: number, best: number, direction: 'lower_is_better' | 'higher_is_better'): boolean {
  if (direction === 'lower_is_better') {
    return metric < best;
  }
  return metric > best;
}

/**
 * Extract metric from command output
 */
export function extractMetric(output: string, extractPattern: string): number | null {
  try {
    // Try to parse as a number directly
    const direct = parseFloat(output.trim());
    if (!isNaN(direct)) return direct;
    
    // Try regex pattern
    const regex = new RegExp(extractPattern);
    const match = output.match(regex);
    if (match) {
      const num = parseFloat(match[1] || match[0]);
      if (!isNaN(num)) return num;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Run the experiment and extract metric
 */
export async function runExperiment(
  config: ProgramConfig,
  workDir: string
): Promise<{ metric: number | null; output: string; durationMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Run the command with timeout
    const result = await $`
      cd ${workDir} && ${config.runCommand}
    `.timeout(config.constraints.timeBudgetSeconds * 1000).nothrow();
    
    const durationMs = Date.now() - startTime;
    const output = result.stdout.toString() + result.stderr.toString();
    
    // Extract metric
    const metric = extractMetric(output, config.metric.extract);
    
    return {
      metric,
      output,
      durationMs,
      error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined
    };
  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    return {
      metric: null,
      output: '',
      durationMs,
      error: e.message
    };
  }
}

/**
 * Format results as TSV
 */
export function formatResultsTSV(results: ExperimentRecord[]): string {
  const lines = ['commit\tmetric\tstatus\tdescription\ttimestamp\tduration_ms'];
  for (const r of results) {
    lines.push(`${r.commit}\t${r.metric}\t${r.status}\t"${r.description}"\t${r.timestamp}\t${r.durationMs}`);
  }
  return lines.join('\n');
}

/**
 * Save loop results to file
 */
export function saveResults(state: LoopState, config: ProgramConfig, outputPath: string): void {
  const tsv = formatResultsTSV(state.results);
  writeFileSync(outputPath, tsv);
}

/**
 * Calculate stagnation level
 */
export function getStagnationLevel(state: LoopState, config: ProgramConfig): 0 | 1 | 2 | 3 {
  if (state.stagnationCount >= config.stagnation.tripleThreshold) return 3;
  if (state.stagnationCount >= config.stagnation.doubleThreshold) return 2;
  if (state.stagnationCount >= config.stagnation.threshold) return 1;
  return 0;
}

/**
 * Get prompt modifier based on stagnation level
 */
export function getStagnationModifier(level: number): string {
  switch (level) {
    case 1:
      return '\n[Stagnation detected — try a more aggressive change or different approach]';
    case 2:
      return '\n[Significant stagnation — consider a completely different strategy]';
    case 3:
      return '\n[Critical stagnation — radical change required, explore very different solutions]';
    default:
      return '';
  }
}
