/**
 * Metric collection for introspection
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { MetricResult } from '../types.js';

const WORKSPACE = process.env.ZO_WORKSPACE || '/home/workspace';
const MEMORY_SCRIPTS = join(WORKSPACE, 'Skills/zo-memory-system/scripts');
const MEMORY_DB = join(WORKSPACE, '.zo/memory/shared-facts.db');

interface RunResult {
  stdout: string;
  ok: boolean;
  code: number;
}

function run(cmd: string, cwd?: string, timeout = 60000): RunResult {
  try {
    const stdout = execSync(cmd, {
      cwd: cwd || WORKSPACE,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), ok: true, code: 0 };
  } catch (e: any) {
    return {
      stdout: (e.stdout || '').toString().trim(),
      ok: false,
      code: e.status ?? 1,
    };
  }
}

function normalize(value: number, target: number, critical: number, inverted = false): number {
  if (inverted) {
    if (value <= target) return 1.0;
    if (value >= critical) return 0.0;
    return 1.0 - (value - target) / (critical - target);
  }
  if (value >= target) return 1.0;
  if (value <= critical) return 0.0;
  return (value - critical) / (target - critical);
}

function status(score: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (score >= 0.85) return 'HEALTHY';
  if (score >= 0.3) return 'WARNING';
  return 'CRITICAL';
}

function buildMetric(
  name: string,
  value: number,
  target: number,
  critical: number,
  weight: number,
  detail: string,
  recommendation: string,
  inverted = false
): MetricResult {
  const score = normalize(value, target, critical, inverted);
  return {
    name,
    value,
    target,
    critical,
    weight,
    score,
    status: status(score),
    trend: '—',
    detail,
    recommendation,
  };
}

// --- Metric Collectors ---

export async function measureMemoryRecall(): Promise<MetricResult> {
  const evalScript = join(MEMORY_SCRIPTS, 'eval-continuation.ts');
  if (!existsSync(evalScript)) {
    return buildMetric('Memory Recall', 0.22, 0.85, 0.70, 0.25,
      'eval-continuation.ts not found',
      'Install zo-memory-system skill',
      false
    );
  }

  const result = run(`bun "${evalScript}" 2>&1`);
  const rateMatch = result.stdout.match(/Rate:\s*([\d.]+)%/);
  const passRate = rateMatch ? parseFloat(rateMatch[1]) / 100 : -1;

  if (passRate < 0) {
    const casesMatch = result.stdout.match(/Cases:\s*(\d+)/);
    const passedMatch = result.stdout.match(/Passed:\s*(\d+)/);
    if (casesMatch && passedMatch) {
      const cases = parseInt(casesMatch[1]);
      const passed = parseInt(passedMatch[1]);
      const rate = cases > 0 ? passed / cases : 0;
      return buildMetric('Memory Recall', rate, 0.85, 0.70, 0.25,
        `${passed}/${cases} fixtures passed (${(rate * 100).toFixed(1)}%)`,
        rate < 0.85
          ? 'Add continuation fixtures for missed cases; tune graph-boost weights'
          : 'Recall is healthy — consider tightening target to 90%',
        false
      );
    }
    return buildMetric('Memory Recall', 0.25, 0.85, 0.70, 0.25,
      `Could not parse eval output: ${result.stdout.slice(0, 200)}`,
      'Check eval-continuation.ts output format',
      false
    );
  }

  return buildMetric('Memory Recall', passRate, 0.85, 0.70, 0.25,
    `${(passRate * 100).toFixed(1)}% fixture pass rate`,
    passRate < 0.85
      ? 'Add continuation fixtures for missed cases; tune graph-boost weights'
      : 'Recall is healthy — consider tightening target to 90%',
    false
  );
}

export async function measureGraphConnectivity(): Promise<MetricResult> {
  const graphScript = join(MEMORY_SCRIPTS, 'graph.ts');
  if (!existsSync(graphScript)) {
    if (existsSync(MEMORY_DB)) {
      const dbResult = run(`sqlite3 "${MEMORY_DB}" "SELECT COUNT(*) FROM facts; SELECT COUNT(DISTINCT source_id) + COUNT(DISTINCT target_id) FROM fact_links;"`);
      const lines = dbResult.stdout.split('\n').filter(Boolean);
      if (lines.length >= 2) {
        const total = parseInt(lines[0]);
        const linked = parseInt(lines[1]);
        const ratio = total > 0 ? Math.min(linked / total, 1.0) : 0;
        return buildMetric('Graph Connectivity', ratio, 0.80, 0.60, 0.15,
          `${linked}/${total} facts have graph links (${(ratio * 100).toFixed(1)}%)`,
          ratio < 0.80
            ? 'Run wikilink auto-capture on orphan entities'
            : 'Graph connectivity is healthy',
          false
        );
      }
    }
    return buildMetric('Graph Connectivity', 0.14, 0.80, 0.60, 0.15,
      'graph.ts not found and DB not available',
      'Install zo-memory-system skill',
      false
    );
  }

  const result = run(`bun "${graphScript}" knowledge-gaps 2>&1`);
  const linkedMatch = result.stdout.match(/Linked facts:\s*(\d+)\s*\(([\d.]+)%\)/);
  const orphanMatch = result.stdout.match(/Orphan facts:\s*(\d+)/);

  if (linkedMatch) {
    const linkedPct = parseFloat(linkedMatch[2]) / 100;
    const orphanCount = orphanMatch ? parseInt(orphanMatch[1]) : 0;
    return buildMetric('Graph Connectivity', linkedPct, 0.80, 0.60, 0.15,
      `${(linkedPct * 100).toFixed(1)}% linked (${orphanCount} orphans)`,
      linkedPct < 0.80
        ? `Link ${orphanCount} orphan facts; run wikilink auto-capture`
        : 'Graph connectivity is healthy',
      false
    );
  }

  return buildMetric('Graph Connectivity', 0.5, 0.80, 0.60, 0.15,
    'Could not parse graph output',
    'Check graph.ts knowledge-gaps output format',
    false
  );
}

export async function measureRoutingAccuracy(): Promise<MetricResult> {
  // Query episode outcomes from memory DB
  if (existsSync(MEMORY_DB)) {
    const result = run(`sqlite3 "${MEMORY_DB}" "SELECT COUNT(*) as total, SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) as successes FROM episodes WHERE created_at > strftime('%s','now','-14 days');"`);
    const parts = result.stdout.split('|');
    if (parts.length >= 2) {
      const total = parseInt(parts[0]) || 0;
      const successes = parseInt(parts[1]) || 0;
      const rate = total > 0 ? successes / total : 0;
      return buildMetric('Routing Accuracy', rate, 0.85, 0.70, 0.20,
        `${successes}/${total} episodes succeeded (${(rate * 100).toFixed(1)}%) over 14 days`,
        rate < 0.85
          ? 'Review failed episodes for routing mismatches'
          : 'Routing accuracy is healthy',
        false
      );
    }
  }
  return buildMetric('Routing Accuracy', 0, 0.85, 0.70, 0.20,
    'No episode data available',
    'Ensure episodes are being recorded to memory DB',
    false
  );
}

export async function measureEvalCalibration(): Promise<MetricResult> {
  // Check Stage 3 override rate from evaluation report files
  const evalDir = join(WORKSPACE, '.zo/evaluations');
  if (existsSync(evalDir)) {
    const result = run(`find "${evalDir}" -name "*.json" -mtime -14 -exec grep -l '"stage3Override"' {} \\; | wc -l`);
    const overrideResult = run(`find "${evalDir}" -name "*.json" -mtime -14 | wc -l`);
    const overrides = parseInt(result.stdout) || 0;
    const total = parseInt(overrideResult.stdout) || 0;
    const rate = total > 0 ? overrides / total : 0;
    return buildMetric('Eval Calibration', rate, 0.15, 0.25, 0.15,
      `${overrides}/${total} evals had Stage 3 overrides (${(rate * 100).toFixed(1)}%)`,
      rate > 0.15
        ? 'High override rate — review mechanical/semantic checks for false positives'
        : 'Override rate is within acceptable range',
      true
    );
  }
  return buildMetric('Eval Calibration', 0, 0.15, 0.25, 0.15,
    'No evaluation data found',
    'Run evaluations to establish calibration baseline',
    true
  );
}

export async function measureProcedureFreshness(): Promise<MetricResult> {
  // Check stale procedure ratio from memory DB
  if (existsSync(MEMORY_DB)) {
    const result = run(`sqlite3 "${MEMORY_DB}" "SELECT COUNT(*) as total, SUM(CASE WHEN last_accessed > strftime('%s','now','-14 days') THEN 1 ELSE 0 END) as fresh FROM facts WHERE category='convention' OR category='reference';"`);
    const parts = result.stdout.split('|');
    if (parts.length >= 2) {
      const total = parseInt(parts[0]) || 0;
      const fresh = parseInt(parts[1]) || 0;
      const rate = total > 0 ? fresh / total : 0;
      return buildMetric('Procedure Freshness', rate, 0.70, 0.50, 0.15,
        `${fresh}/${total} procedures accessed in last 14 days (${(rate * 100).toFixed(1)}%)`,
        rate < 0.70
          ? 'Review and update stale procedures'
          : 'Procedure freshness is healthy',
        false
      );
    }
  }
  return buildMetric('Procedure Freshness', 0, 0.70, 0.50, 0.15,
    'No procedure data available',
    'Ensure procedures are stored in memory DB',
    false
  );
}

export async function measureEpisodeVelocity(): Promise<MetricResult> {
  // Analyze 14-day success trend from episodes
  if (existsSync(MEMORY_DB)) {
    const result = run(`sqlite3 "${MEMORY_DB}" "SELECT COUNT(*) as total, SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) as successes FROM episodes WHERE created_at > strftime('%s','now','-14 days');"`);
    const parts = result.stdout.split('|');
    if (parts.length >= 2) {
      const total = parseInt(parts[0]) || 0;
      const successes = parseInt(parts[1]) || 0;
      const rate = total > 0 ? successes / total : 0;
      return buildMetric('Episode Velocity', rate, 0.75, 0.60, 0.10,
        `${successes}/${total} episodes succeeded over 14 days (${(rate * 100).toFixed(1)}%)`,
        rate < 0.75
          ? 'Investigate recurring failure patterns in recent episodes'
          : 'Episode velocity is healthy',
        false
      );
    }
  }
  return buildMetric('Episode Velocity', 0, 0.75, 0.60, 0.10,
    'No episode data available',
    'Ensure episodes are being recorded',
    false
  );
}
