import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync } from 'fs';
import { join } from 'path';
import { EvolutionHistory } from '../history';
import type { EvolutionResult, ScorecardSnapshot } from '../types';

const TEST_DIR = join(import.meta.dir, '../../.test-history');

function makeResult(success: boolean, delta: number, id = 'rx-1'): EvolutionResult {
  return {
    prescriptionId: id,
    success,
    baseline: { composite: 0.70, metrics: [{ name: 'Memory Recall', value: 0.70, score: 0.70, status: 'HEALTHY' }] },
    postFlight: { composite: 0.70 + delta, metrics: [{ name: 'Memory Recall', value: 0.70 + delta, score: 0.70 + delta, status: 'HEALTHY' }] },
    delta,
    reverted: !success,
    detail: 'test',
  };
}

describe('EvolutionHistory', () => {
  let history: EvolutionHistory;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    history = new EvolutionHistory(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('record', () => {
    test('records an evolution entry', () => {
      const entry = history.record({
        timestamp: new Date().toISOString(),
        prescriptionId: 'rx-1',
        playbookId: 'pb-1',
        playbookName: 'Test Playbook',
        metricName: 'Memory Recall',
        baseline: { composite: 0.70, metrics: [] },
        postFlight: { composite: 0.75, metrics: [] },
        delta: 0.05,
        success: true,
        reverted: false,
        tags: ['test'],
      });

      expect(entry.id).toStartWith('evo-');
      expect(entry.success).toBe(true);
    });

    test('adds trend point from postFlight', () => {
      history.record({
        timestamp: new Date().toISOString(),
        prescriptionId: 'rx-1',
        playbookId: 'pb-1',
        playbookName: 'Test',
        metricName: 'Memory Recall',
        baseline: { composite: 0.70, metrics: [] },
        postFlight: { composite: 0.75, metrics: [{ name: 'Memory Recall', value: 0.75, score: 0.75, status: 'HEALTHY' }] },
        delta: 0.05,
        success: true,
        reverted: false,
        tags: [],
      });

      const trends = history.getTrends();
      expect(trends.length).toBe(1);
      expect(trends[0].composite).toBe(0.75);
    });
  });

  describe('recordFromResult', () => {
    test('convenience method creates entry', () => {
      const result = makeResult(true, 0.05);
      const entry = history.recordFromResult(result, 'pb-1', 'Test Playbook', 'Memory Recall');

      expect(entry.playbookId).toBe('pb-1');
      expect(entry.delta).toBe(0.05);
    });
  });

  describe('getStats', () => {
    test('returns empty stats for no entries', () => {
      const stats = history.getStats();
      expect(stats.totalEvolutions).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    test('computes success rate', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'Memory Recall');
      history.recordFromResult(makeResult(true, 0.03), 'pb-1', 'PB1', 'Memory Recall');
      history.recordFromResult(makeResult(false, 0), 'pb-1', 'PB1', 'Memory Recall');

      const stats = history.getStats();
      expect(stats.totalEvolutions).toBe(3);
      expect(stats.successRate).toBeCloseTo(0.667, 2);
    });

    test('tracks best and worst evolution', () => {
      history.recordFromResult(makeResult(true, 0.10), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(true, -0.05), 'pb-2', 'PB2', 'M2');
      history.recordFromResult(makeResult(true, 0.03), 'pb-3', 'PB3', 'M3');

      const stats = history.getStats();
      expect(stats.bestEvolution!.delta).toBe(0.10);
      expect(stats.worstEvolution!.delta).toBe(-0.05);
    });

    test('tracks success streaks', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(true, 0.03), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(false, 0), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(true, 0.02), 'pb-1', 'PB1', 'M1');

      const stats = history.getStats();
      expect(stats.streakBest).toBe(2);
      expect(stats.streakCurrent).toBe(1);
    });

    test('breaks down by metric', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'Memory Recall');
      history.recordFromResult(makeResult(false, 0), 'pb-2', 'PB2', 'Graph Connectivity');

      const stats = history.getStats();
      expect(stats.byMetric['Memory Recall'].successRate).toBe(1.0);
      expect(stats.byMetric['Graph Connectivity'].successRate).toBe(0.0);
    });

    test('breaks down by playbook', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-a', 'PB A', 'M1');
      history.recordFromResult(makeResult(true, 0.03), 'pb-a', 'PB A', 'M1');
      history.recordFromResult(makeResult(false, 0), 'pb-b', 'PB B', 'M2');

      const stats = history.getStats();
      expect(stats.byPlaybook['pb-a'].count).toBe(2);
      expect(stats.byPlaybook['pb-b'].successRate).toBe(0.0);
    });
  });

  describe('getTrends', () => {
    test('returns trend points', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(true, 0.08), 'pb-1', 'PB1', 'M1');

      const trends = history.getTrends();
      expect(trends.length).toBe(2);
    });

    test('limits trend output', () => {
      for (let i = 0; i < 10; i++) {
        history.recordFromResult(makeResult(true, 0.01 * i), 'pb-1', 'PB1', 'M1');
      }

      const trends = history.getTrends(3);
      expect(trends.length).toBe(3);
    });
  });

  describe('getEntries', () => {
    test('filters by metricName', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'Memory Recall');
      history.recordFromResult(makeResult(true, 0.03), 'pb-2', 'PB2', 'Graph Connectivity');

      const entries = history.getEntries({ metricName: 'Memory Recall' });
      expect(entries.length).toBe(1);
    });

    test('filters by successOnly', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'M1');
      history.recordFromResult(makeResult(false, 0), 'pb-1', 'PB1', 'M1');

      const entries = history.getEntries({ successOnly: true });
      expect(entries.length).toBe(1);
    });
  });

  describe('clear', () => {
    test('removes all entries and trends', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'M1');
      history.clear();

      expect(history.getStats().totalEvolutions).toBe(0);
      expect(history.getTrends().length).toBe(0);
    });
  });

  describe('persistence', () => {
    test('persists across instances', () => {
      history.recordFromResult(makeResult(true, 0.05), 'pb-1', 'PB1', 'M1');

      const history2 = new EvolutionHistory(TEST_DIR);
      expect(history2.getStats().totalEvolutions).toBe(1);
    });
  });
});
