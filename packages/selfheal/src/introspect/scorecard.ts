/**
 * Scorecard builder for introspection
 */

import type { Scorecard, MetricResult } from '../types.js';
import {
  measureMemoryRecall,
  measureGraphConnectivity,
  measureRoutingAccuracy,
  measureEvalCalibration,
  measureProcedureFreshness,
  measureEpisodeVelocity,
} from './collector.js';

export async function buildScorecard(): Promise<Scorecard> {
  const timestamp = new Date().toISOString();

  const metrics = await Promise.all([
    measureMemoryRecall(),
    measureGraphConnectivity(),
    measureRoutingAccuracy(),
    measureEvalCalibration(),
    measureProcedureFreshness(),
    measureEpisodeVelocity(),
  ]);

  // Calculate composite score (weighted average)
  const composite = metrics.reduce((sum, m) => sum + m.score * m.weight, 0) /
    metrics.reduce((sum, m) => sum + m.weight, 0);

  // Find weakest metric
  const weakest = metrics.reduce((min, m) => m.score < min.score ? m : min, metrics[0]);

  // Build opportunities list (sorted by impact potential)
  const opportunities = metrics
    .filter(m => m.status !== 'HEALTHY')
    .map(m => ({
      metric: m.name,
      action: m.recommendation,
      impact: (m.target - m.value) * m.weight,
    }))
    .sort((a, b) => b.impact - a.impact);

  return {
    timestamp,
    composite,
    metrics,
    weakest: weakest.name,
    topOpportunities: opportunities.slice(0, 3),
  };
}

export function formatScorecard(scorecard: Scorecard): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║           Zouroboros Self-Diagnostic Scorecard                   ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${scorecard.timestamp}`);
  lines.push(`Composite Health: ${(scorecard.composite * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('┌──────────────────────────────────────────────────────────────────┐');
  lines.push('│ Metrics                                                          │');
  lines.push('├──────────────────────────────────────────────────────────────────┤');

  for (const m of scorecard.metrics) {
    const statusIcon = m.status === 'HEALTHY' ? '✅' : m.status === 'WARNING' ? '⚠️' : '❌';
    const scoreStr = `${(m.score * 100).toFixed(0)}%`.padStart(4);
    lines.push(`│ ${statusIcon} ${m.name.padEnd(20)} ${scoreStr} ${m.trend} │`);
    lines.push(`│    ${m.detail.slice(0, 50).padEnd(52)} │`);
    lines.push('├──────────────────────────────────────────────────────────────────┤');
  }

  lines.push('');
  lines.push('┌──────────────────────────────────────────────────────────────────┐');
  lines.push('│ Top Improvement Opportunities                                    │');
  lines.push('├──────────────────────────────────────────────────────────────────┤');

  if (scorecard.topOpportunities.length === 0) {
    lines.push('│ No critical opportunities — all metrics healthy!                 │');
  } else {
    for (const opp of scorecard.topOpportunities) {
      lines.push(`│ ${opp.metric.padEnd(20)} Impact: ${opp.impact.toFixed(3).padStart(6)} │`);
      lines.push(`│    ${opp.action.slice(0, 50).padEnd(52)} │`);
      lines.push('├──────────────────────────────────────────────────────────────────┤');
    }
  }

  lines.push('└──────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push(`Weakest Subsystem: ${scorecard.weakest}`);
  lines.push('');

  return lines.join('\n');
}