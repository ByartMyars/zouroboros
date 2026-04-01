import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync } from 'fs';
import { join } from 'path';
import { FeedbackTuner } from '../feedback';
import type { MetricResult, EvolutionResult } from '../types';

const TEST_DIR = join(import.meta.dir, '../../.test-feedback');

function makeMetric(name: string, score: number): MetricResult {
  return {
    name,
    value: score,
    target: 0.90,
    critical: 0.50,
    weight: 0.15,
    score,
    status: score >= 0.70 ? 'HEALTHY' : score >= 0.50 ? 'WARNING' : 'CRITICAL',
    trend: '→',
    detail: `${name} at ${(score * 100).toFixed(0)}%`,
    recommendation: 'Improve',
  };
}

function makeResult(success: boolean, delta: number, prescriptionId = 'test-rx'): EvolutionResult {
  return {
    prescriptionId,
    success,
    baseline: { composite: 0.70, metrics: [] },
    postFlight: delta !== 0 ? { composite: 0.70 + delta, metrics: [] } : null,
    delta,
    reverted: !success,
    detail: 'test result',
  };
}

describe('FeedbackTuner', () => {
  let tuner: FeedbackTuner;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    tuner = new FeedbackTuner(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('initial state', () => {
    test('has default weights', () => {
      const weights = tuner.weights;
      expect(weights['Memory Recall']).toBe(0.20);
      expect(weights['Graph Connectivity']).toBe(0.15);
    });

    test('starts at version 0', () => {
      expect(tuner.version).toBe(0);
    });
  });

  describe('recordOutcome', () => {
    test('increases weight for successful positive improvement', () => {
      const metric = makeMetric('Memory Recall', 0.65);
      const result = makeResult(true, 0.10);

      const record = tuner.recordOutcome(metric, result);
      expect(record.weightAfter).not.toBe(record.weightBefore);
      expect(record.success).toBe(true);
      expect(tuner.version).toBe(1);
    });

    test('decreases weight for failed evolution', () => {
      const metric = makeMetric('Memory Recall', 0.65);
      const result = makeResult(false, 0);

      const record = tuner.recordOutcome(metric, result);
      // Weight should decrease (before normalization)
      expect(record.weightAfter).toBeLessThanOrEqual(record.weightBefore);
    });

    test('normalizes weights to sum to 1', () => {
      const metric = makeMetric('Memory Recall', 0.65);
      const result = makeResult(true, 0.10);
      tuner.recordOutcome(metric, result);

      const weights = tuner.weights;
      const total = Object.values(weights).reduce((s, w) => s + w, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    test('clamps weights within bounds', () => {
      // Trigger many positive outcomes for one metric
      const metric = makeMetric('Memory Recall', 0.65);
      for (let i = 0; i < 50; i++) {
        tuner.recordOutcome(metric, makeResult(true, 0.20));
      }

      const weights = tuner.weights;
      for (const w of Object.values(weights)) {
        expect(w).toBeGreaterThanOrEqual(0.04); // slightly below min due to normalization
        expect(w).toBeLessThanOrEqual(0.50); // slightly above max due to normalization
      }
    });

    test('increments version on each outcome', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.05));
      tuner.recordOutcome(makeMetric('Graph Connectivity', 0.40), makeResult(false, 0));

      expect(tuner.version).toBe(2);
    });
  });

  describe('getHistory', () => {
    test('returns recorded outcomes', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.05));
      tuner.recordOutcome(makeMetric('Graph Connectivity', 0.40), makeResult(false, 0));

      const history = tuner.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].metricName).toBe('Memory Recall');
    });
  });

  describe('getSuccessRate', () => {
    test('computes overall success rate', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.05));
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.03));
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(false, 0));

      expect(tuner.getSuccessRate()).toBeCloseTo(0.667, 2);
    });

    test('computes per-metric success rate', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.05));
      tuner.recordOutcome(makeMetric('Graph Connectivity', 0.40), makeResult(false, 0));

      expect(tuner.getSuccessRate('Memory Recall')).toBe(1.0);
      expect(tuner.getSuccessRate('Graph Connectivity')).toBe(0.0);
    });
  });

  describe('getAvgDelta', () => {
    test('computes average delta', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.10));
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.06));

      expect(tuner.getAvgDelta()).toBeCloseTo(0.08, 2);
    });
  });

  describe('resetWeights', () => {
    test('restores default weights', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.20));
      tuner.resetWeights();

      expect(tuner.weights['Memory Recall']).toBe(0.20);
    });
  });

  describe('persistence', () => {
    test('persists across instances', () => {
      tuner.recordOutcome(makeMetric('Memory Recall', 0.65), makeResult(true, 0.10));

      const tuner2 = new FeedbackTuner(TEST_DIR);
      expect(tuner2.version).toBe(1);
      expect(tuner2.getHistory().length).toBe(1);
    });
  });
});
