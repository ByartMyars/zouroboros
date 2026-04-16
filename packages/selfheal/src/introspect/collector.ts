/**
 * Metric collection for introspection
 *
 * Fixes #47 (wrong script paths), #48 (wrong procedure query),
 * #49 (missing Skill Effectiveness), #50 (Episode Velocity = duplicate),
 * #51 (Graph Connectivity SQLite parse failure)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getMemoryDbPath, getWorkspaceRoot } from 'zouroboros-core';
import type { MetricResult } from '../types.js';

const WORKSPACE = getWorkspaceRoot();
const MEMORY_DB = getMemoryDbPath();

const EVAL_SCRIPT_CANDIDATES = [
  join(WORKSPACE, 'Skills/zo-memory-system/scripts/eval-continuation.ts'),
  join(WORKSPACE, 'zouroboros/packages/memory/scripts/self-enhance/eval-continuation.ts'),
];

const GRAPH_SCRIPT_CANDIDATES = [
  join(WORKSPACE, 'Skills/zo-memory-system/scripts/graph.ts'),
  join(WORKSPACE, '.zo/memory/scripts/graph.ts'),
];

function findScript(candidates: string[]): string | null {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

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

function sqliteQuery(db: string, sql: string): string {
  const result = run(`sqlite3 "${db}" "${sql}"`);
  return result.ok ? result.stdout : '';
}

// --- Metric Collectors ---

export async function measureMemoryRecall(): Promise<MetricResult> {
  const evalScript = findScript(EVAL_SCRIPT_CANDIDATES);
  if (!evalScript) {
    return buildMetric('Memory Recall', 0.22, 0.85, 0.70, 0.25,
      'eval-continuation.ts not found in Skills/ or packages/',
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
  const graphScript = findScript(GRAPH_SCRIPT_CANDIDATES);

  if (graphScript) {
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
  }

  if (existsSync(MEMORY_DB)) {
    const totalStr = sqliteQuery(MEMORY_DB, 'SELECT COUNT(*) FROM facts');
    const linkedStr = sqliteQuery(MEMORY_DB,
      'SELECT COUNT(DISTINCT source_id) + COUNT(DISTINCT target_id) FROM fact_links');
    const total = parseInt(totalStr) || 0;
    const linked = parseInt(linkedStr) || 0;
    if (total > 0) {
      const ratio = Math.min(linked / total, 1.0);
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
    'No graph data available',
    'Install zo-memory-system skill',
    false
  );
}

export async function measureRoutingAccuracy(): Promise<MetricResult> {
  if (existsSync(MEMORY_DB)) {
    const result = sqliteQuery(MEMORY_DB,
      "SELECT COUNT(*), SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) FROM episodes WHERE created_at > strftime('%s','now','-7 days')");
    const parts = result.split('|');
    if (parts.length >= 2) {
      const total = parseInt(parts[0]) || 0;
      const successes = parseInt(parts[1]) || 0;
      const rate = total > 0 ? successes / total : 0;
      return buildMetric('Routing Accuracy', rate, 0.85, 0.70, 0.20,
        `${successes}/${total} episodes succeeded (${(rate * 100).toFixed(1)}%) over 7 days`,
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
  if (existsSync(MEMORY_DB)) {
    const result = sqliteQuery(MEMORY_DB,
      "SELECT COUNT(*), SUM(CASE WHEN created_at > strftime('%s','now','-14 days') THEN 1 ELSE 0 END) FROM procedures");
    const parts = result.split('|');
    if (parts.length >= 2) {
      const total = parseInt(parts[0]) || 0;
      const fresh = parseInt(parts[1]) || 0;
      if (total > 0) {
        const staleRatio = (total - fresh) / total;
        return buildMetric('Procedure Freshness', staleRatio, 0.30, 0.60, 0.15,
          `${fresh}/${total} procedures updated in last 14 days (${total - fresh} stale)`,
          staleRatio > 0.30
            ? `Evolve ${total - fresh} stale procedures: bun memory.ts procedures --evolve <id>`
            : 'Procedure freshness is healthy',
          true
        );
      }
    }
  }
  return buildMetric('Procedure Freshness', 1.0, 0.30, 0.60, 0.15,
    'No procedure data available',
    'Ensure procedures are stored in memory DB',
    true
  );
}

export async function measureEpisodeVelocity(): Promise<MetricResult> {
  if (existsSync(MEMORY_DB)) {
    const currentStr = sqliteQuery(MEMORY_DB,
      "SELECT COUNT(*), SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) FROM episodes WHERE created_at > strftime('%s','now','-7 days')");
    const priorStr = sqliteQuery(MEMORY_DB,
      "SELECT COUNT(*), SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) FROM episodes WHERE created_at > strftime('%s','now','-14 days') AND created_at <= strftime('%s','now','-7 days')");

    const cur = currentStr.split('|');
    const prev = priorStr.split('|');

    if (cur.length >= 2 && prev.length >= 2) {
      const curTotal = parseInt(cur[0]) || 0;
      const curSuccess = parseInt(cur[1]) || 0;
      const prevTotal = parseInt(prev[0]) || 0;
      const prevSuccess = parseInt(prev[1]) || 0;

      const curRate = curTotal > 0 ? curSuccess / curTotal : 0;
      const prevRate = prevTotal > 0 ? prevSuccess / prevTotal : 0;
      const delta = curRate - prevRate;
      const trendIcon = delta > 0.05 ? '↑' : delta < -0.05 ? '↓' : '→';

      const velocityScore = 0.5 + delta;
      return buildMetric('Episode Velocity', velocityScore, 0.50, -0.20, 0.10,
        `${(curRate * 100).toFixed(1)}% current vs ${(prevRate * 100).toFixed(1)}% prior 7d ${trendIcon}`,
        delta < 0
          ? 'Investigate declining success rate in recent episodes'
          : 'Episode velocity is healthy — success rate trending up',
        false
      );
    }
  }
  return buildMetric('Episode Velocity', 0, 0.50, -0.20, 0.10,
    'No episode data available',
    'Ensure episodes are being recorded',
    false
  );
}

export async function measureSkillEffectiveness(): Promise<MetricResult> {
  if (existsSync(MEMORY_DB)) {
    const tableCheck = sqliteQuery(MEMORY_DB,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_executions'");
    if (tableCheck.includes('skill_executions')) {
      const result = sqliteQuery(MEMORY_DB,
        "SELECT COUNT(*), SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) FROM skill_executions WHERE created_at > strftime('%s','now','-7 days')");
      const parts = result.split('|');
      if (parts.length >= 2) {
        const total = parseInt(parts[0]) || 0;
        const successes = parseInt(parts[1]) || 0;
        if (total > 0) {
          const rate = successes / total;
          return buildMetric('Skill Effectiveness', rate, 0.85, 0.70, 0.10,
            `${successes}/${total} skill executions succeeded (${(rate * 100).toFixed(1)}%) over 7 days`,
            rate < 0.85
              ? 'Analyze failing skills for error patterns'
              : 'Skill effectiveness is healthy',
            false
          );
        }
      }
    }
  }
  return buildMetric('Skill Effectiveness', 1.0, 0.85, 0.70, 0.10,
    'No skill execution data (assuming healthy)',
    'Instrument skills with execution tracking',
    false
  );
}
