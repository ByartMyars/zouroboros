import { describe, test, expect } from 'bun:test';
import { MultiMetricOptimizer } from '../multi-metric';
import type { Scorecard, MetricResult } from '../types';

function makeMetric(name: string, score: number, weight = 0.15): MetricResult {
  return {
    name, value: score, target: 0.90, critical: 0.50, weight, score,
    status: score >= 0.70 ? 'HEALTHY' : score >= 0.50 ? 'WARNING' : 'CRITICAL',
    trend: '→', detail: '', recommendation: '',
  };
}

function makeScorecard(metrics: MetricResult[]): Scorecard {
  const composite = metrics.reduce((s, m) => s + m.score * m.weight, 0) /
    metrics.reduce((s, m) => s + m.weight, 0);
  return {
    timestamp: new Date().toISOString(),
    composite,
    metrics,
    weakest: metrics.reduce((min, m) => m.score < min.score ? m : min, metrics[0]).name,
    topOpportunities: [],
  };
}

describe('MultiMetricOptimizer', () => {
  let optimizer: MultiMetricOptimizer;

  describe('weighted_sum strategy', () => {
    test('computes weighted sum composite', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.60, direction: 'maximize', threshold: 0.70 },
          { metricName: 'B', weight: 0.40, direction: 'maximize', threshold: 0.70 },
        ],
        strategy: 'weighted_sum',
      });

      const score = optimizer.computeComposite({ A: 0.80, B: 0.60 });
      // (0.80*0.60 + 0.60*0.40) / (0.60+0.40) = (0.48+0.24)/1.0 = 0.72
      expect(score).toBeCloseTo(0.72, 4);
    });
  });

  describe('min_regret strategy', () => {
    test('penalizes worst gap from target', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.50, direction: 'maximize', threshold: 0.90 },
          { metricName: 'B', weight: 0.50, direction: 'maximize', threshold: 0.80 },
        ],
        strategy: 'min_regret',
      });

      // A at 0.50 → gap = 0.90-0.50 = 0.40 (worst gap)
      // B at 0.75 → gap = 0.80-0.75 = 0.05
      const score = optimizer.computeComposite({ A: 0.50, B: 0.75 });
      expect(score).toBeCloseTo(0.60, 4); // 1 - 0.40
    });
  });

  describe('buildPlan', () => {
    test('prioritizes metrics by weighted impact', () => {
      optimizer = new MultiMetricOptimizer();
      const scorecard = makeScorecard([
        makeMetric('Memory Recall', 0.90, 0.20),
        makeMetric('Graph Connectivity', 0.30, 0.15),
        makeMetric('Routing Accuracy', 0.60, 0.20),
      ]);

      const plan = optimizer.buildPlan(scorecard, {
        'Memory Recall': 0.20,
        'Graph Connectivity': 0.15,
        'Routing Accuracy': 0.20,
      });

      expect(plan.prioritizedMetrics[0].name).toBe('Routing Accuracy'); // highest weighted gap
      expect(plan.constraints.length).toBeGreaterThan(0); // Below-threshold warnings
    });

    test('identifies below-threshold metrics', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.50, direction: 'maximize', threshold: 0.80 },
        ],
        strategy: 'weighted_sum',
      });

      const scorecard = makeScorecard([makeMetric('A', 0.50, 0.50)]);
      const plan = optimizer.buildPlan(scorecard, { A: 0.50 });

      expect(plan.constraints.some(c => c.includes('below threshold'))).toBe(true);
    });
  });

  describe('findParetoFront', () => {
    test('identifies non-dominated points', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.50, direction: 'maximize', threshold: 0.70 },
          { metricName: 'B', weight: 0.50, direction: 'maximize', threshold: 0.70 },
        ],
        strategy: 'pareto',
      });

      const points = [
        { A: 0.90, B: 0.80 }, // Pareto front (best)
        { A: 0.40, B: 0.90 }, // Pareto front
        { A: 0.30, B: 0.50 }, // Dominated by point 0 (A:0.90>0.30, B:0.80>0.50)
      ];

      const result = optimizer.findParetoFront(points);
      const frontCount = result.filter(p => p.rank === 1).length;
      expect(frontCount).toBe(2);
      expect(result[2].rank).toBe(2); // Dominated
    });

    test('handles single point', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [{ metricName: 'A', weight: 1, direction: 'maximize', threshold: 0.5 }],
        strategy: 'pareto',
      });

      const result = optimizer.findParetoFront([{ A: 0.80 }]);
      expect(result.length).toBe(1);
      expect(result[0].rank).toBe(1);
    });
  });

  describe('wouldImproveComposite', () => {
    test('detects improvement', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.50, direction: 'maximize', threshold: 0.70 },
          { metricName: 'B', weight: 0.50, direction: 'maximize', threshold: 0.70 },
        ],
        strategy: 'weighted_sum',
      });

      const result = optimizer.wouldImproveComposite(
        { A: 0.60, B: 0.60 },
        { A: 0.80, B: 0.60 },
        { A: 0.50, B: 0.50 }
      );

      expect(result.improved).toBe(true);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.regressions.length).toBe(0);
    });

    test('detects regressions', () => {
      optimizer = new MultiMetricOptimizer({
        targets: [
          { metricName: 'A', weight: 0.50, direction: 'maximize', threshold: 0.70 },
          { metricName: 'B', weight: 0.50, direction: 'maximize', threshold: 0.70 },
        ],
        strategy: 'weighted_sum',
      });

      const result = optimizer.wouldImproveComposite(
        { A: 0.60, B: 0.80 },
        { A: 0.90, B: 0.50 },
        { A: 0.50, B: 0.50 }
      );

      expect(result.regressions.length).toBe(1);
      expect(result.regressions[0]).toContain('B');
    });
  });
});
