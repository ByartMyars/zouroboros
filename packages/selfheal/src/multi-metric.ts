/**
 * Multi-Metric Optimization
 *
 * Optimize for composite scores instead of single metrics.
 * Uses Pareto-front analysis to find non-dominated improvements.
 */

import type { MetricResult, Scorecard, Playbook } from './types.js';

export interface OptimizationTarget {
  metricName: string;
  weight: number;
  direction: 'maximize' | 'minimize';
  threshold: number; // minimum acceptable value
}

export interface CompositeObjective {
  targets: OptimizationTarget[];
  strategy: 'weighted_sum' | 'pareto' | 'min_regret';
}

export interface ParetoPoint {
  metrics: Record<string, number>;
  dominated: boolean;
  rank: number;
}

export interface OptimizationPlan {
  objective: CompositeObjective;
  currentScores: Record<string, number>;
  compositeScore: number;
  prioritizedMetrics: Array<{
    name: string;
    currentScore: number;
    gap: number;
    weightedImpact: number;
    priority: number;
  }>;
  constraints: string[];
}

export class MultiMetricOptimizer {
  private objective: CompositeObjective;

  constructor(objective?: CompositeObjective) {
    this.objective = objective || this.defaultObjective();
  }

  computeComposite(scores: Record<string, number>): number {
    switch (this.objective.strategy) {
      case 'weighted_sum':
        return this.weightedSum(scores);
      case 'min_regret':
        return this.minRegret(scores);
      case 'pareto':
        return this.weightedSum(scores); // Pareto uses ranking, not scalar
      default:
        return this.weightedSum(scores);
    }
  }

  buildPlan(scorecard: Scorecard, weights: Record<string, number>): OptimizationPlan {
    const currentScores: Record<string, number> = {};
    for (const m of scorecard.metrics) {
      currentScores[m.name] = m.score;
    }

    const compositeScore = this.computeComposite(currentScores);

    const prioritized = scorecard.metrics
      .map(m => {
        const target = this.objective.targets.find(t => t.metricName === m.name);
        const weight = weights[m.name] || target?.weight || 0.10;
        const gap = (target?.threshold || 1.0) - m.score;
        const weightedImpact = gap * weight;

        return {
          name: m.name,
          currentScore: m.score,
          gap: Math.max(0, gap),
          weightedImpact,
          priority: 0,
        };
      })
      .sort((a, b) => b.weightedImpact - a.weightedImpact)
      .map((item, idx) => ({ ...item, priority: idx + 1 }));

    const constraints: string[] = [];

    // Check for metrics below threshold
    for (const target of this.objective.targets) {
      const score = currentScores[target.metricName];
      if (score !== undefined && score < target.threshold) {
        constraints.push(`${target.metricName} is below threshold (${(score * 100).toFixed(1)}% < ${(target.threshold * 100).toFixed(1)}%)`);
      }
    }

    return {
      objective: this.objective,
      currentScores,
      compositeScore,
      prioritizedMetrics: prioritized,
      constraints,
    };
  }

  findParetoFront(points: Array<Record<string, number>>): ParetoPoint[] {
    const metricNames = this.objective.targets.map(t => t.metricName);

    const paretoPoints: ParetoPoint[] = points.map(p => ({
      metrics: p,
      dominated: false,
      rank: 0,
    }));

    // Check dominance
    for (let i = 0; i < paretoPoints.length; i++) {
      for (let j = 0; j < paretoPoints.length; j++) {
        if (i === j) continue;
        if (this.dominates(paretoPoints[j].metrics, paretoPoints[i].metrics, metricNames)) {
          paretoPoints[i].dominated = true;
          break;
        }
      }
    }

    // Assign ranks (non-dominated = rank 1)
    let rank = 1;
    const remaining = new Set(paretoPoints.map((_, i) => i));

    while (remaining.size > 0) {
      const nonDominated: number[] = [];

      for (const i of remaining) {
        let isDominated = false;
        for (const j of remaining) {
          if (i === j) continue;
          if (this.dominates(paretoPoints[j].metrics, paretoPoints[i].metrics, metricNames)) {
            isDominated = true;
            break;
          }
        }
        if (!isDominated) {
          nonDominated.push(i);
        }
      }

      for (const i of nonDominated) {
        paretoPoints[i].rank = rank;
        remaining.delete(i);
      }
      rank++;

      if (nonDominated.length === 0) {
        // Prevent infinite loop
        for (const i of remaining) {
          paretoPoints[i].rank = rank;
        }
        break;
      }
    }

    return paretoPoints;
  }

  wouldImproveComposite(
    current: Record<string, number>,
    proposed: Record<string, number>,
    weights: Record<string, number>
  ): { improved: boolean; delta: number; regressions: string[] } {
    const currentComposite = this.computeCompositeWithWeights(current, weights);
    const proposedComposite = this.computeCompositeWithWeights(proposed, weights);
    const delta = proposedComposite - currentComposite;

    const regressions: string[] = [];
    for (const target of this.objective.targets) {
      const before = current[target.metricName] || 0;
      const after = proposed[target.metricName] || 0;
      if (target.direction === 'maximize' && after < before) {
        regressions.push(`${target.metricName}: ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%`);
      }
      if (target.direction === 'minimize' && after > before) {
        regressions.push(`${target.metricName}: ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%`);
      }
    }

    return { improved: delta > 0, delta, regressions };
  }

  private weightedSum(scores: Record<string, number>): number {
    let total = 0;
    let weightSum = 0;
    for (const target of this.objective.targets) {
      const score = scores[target.metricName] || 0;
      total += score * target.weight;
      weightSum += target.weight;
    }
    return weightSum > 0 ? total / weightSum : 0;
  }

  private computeCompositeWithWeights(scores: Record<string, number>, weights: Record<string, number>): number {
    let total = 0;
    let weightSum = 0;
    for (const target of this.objective.targets) {
      const score = scores[target.metricName] || 0;
      const weight = weights[target.metricName] || target.weight;
      total += score * weight;
      weightSum += weight;
    }
    return weightSum > 0 ? total / weightSum : 0;
  }

  private minRegret(scores: Record<string, number>): number {
    // Min-regret: minimize the worst gap from target
    let worstGap = 0;
    for (const target of this.objective.targets) {
      const score = scores[target.metricName] || 0;
      const gap = target.threshold - score;
      if (gap > worstGap) worstGap = gap;
    }
    return 1 - worstGap;
  }

  private dominates(a: Record<string, number>, b: Record<string, number>, metricNames: string[]): boolean {
    let strictlyBetter = false;
    for (const name of metricNames) {
      const target = this.objective.targets.find(t => t.metricName === name);
      const aVal = a[name] || 0;
      const bVal = b[name] || 0;

      if (target?.direction === 'minimize') {
        if (aVal > bVal) return false;
        if (aVal < bVal) strictlyBetter = true;
      } else {
        if (aVal < bVal) return false;
        if (aVal > bVal) strictlyBetter = true;
      }
    }
    return strictlyBetter;
  }

  private defaultObjective(): CompositeObjective {
    return {
      targets: [
        { metricName: 'Memory Recall', weight: 0.20, direction: 'maximize', threshold: 0.70 },
        { metricName: 'Graph Connectivity', weight: 0.15, direction: 'maximize', threshold: 0.50 },
        { metricName: 'Routing Accuracy', weight: 0.20, direction: 'maximize', threshold: 0.80 },
        { metricName: 'Eval Calibration', weight: 0.15, direction: 'minimize', threshold: 0.15 },
        { metricName: 'Procedure Freshness', weight: 0.15, direction: 'maximize', threshold: 0.70 },
        { metricName: 'Episode Velocity', weight: 0.15, direction: 'maximize', threshold: 0.60 },
      ],
      strategy: 'weighted_sum',
    };
  }
}

export function createOptimizer(objective?: CompositeObjective): MultiMetricOptimizer {
  return new MultiMetricOptimizer(objective);
}
