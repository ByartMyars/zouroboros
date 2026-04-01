/**
 * Integration tests: SelfHeal ↔ HookSystem
 *
 * Verifies that selfheal lifecycle phases can be observed via the core hook system.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { HookSystem, type LifecycleEvent, type HookPayload } from 'zouroboros-core';

// Mock all filesystem/subsystem dependencies so SelfHeal runs in isolation
mock.module('../introspect/scorecard.js', () => ({
  buildScorecard: async () => ({
    timestamp: new Date().toISOString(),
    composite: 72,
    weakest: 'test_coverage',
    metrics: [
      { name: 'test_coverage', score: 45, weight: 1, threshold: 70, status: 'fail' },
      { name: 'type_safety', score: 90, weight: 1, threshold: 80, status: 'pass' },
    ],
  }),
  formatScorecard: () => 'Scorecard: composite=72',
}));

mock.module('../prescribe/playbook.js', () => ({
  getPlaybook: (metric: any) => ({
    id: 'playbook-test',
    metric: metric.name,
    steps: ['Add tests'],
    priority: 'high',
  }),
}));

mock.module('../prescribe/governor.js', () => ({
  evaluatePrescription: () => ({
    approved: true,
    reason: 'Within safety bounds',
    riskLevel: 'low',
  }),
}));

mock.module('../prescribe/seed.js', () => ({
  generateSeed: () => ({ tasks: [{ id: 't1', task: 'Write tests' }] }),
  generateProgram: () => ({ steps: ['Run tests'], iterations: 1 }),
}));

mock.module('../evolve/executor.js', () => ({
  executeEvolution: async () => ({
    success: true,
    iterations: 1,
    improvements: [{ metric: 'test_coverage', before: 45, after: 70 }],
    duration: 1234,
  }),
}));

import { SelfHeal } from '../index.js';

/**
 * HookableSelfHeal wraps lifecycle phases to emit hook events.
 * This pattern demonstrates how integrators wire selfheal → hooks.
 */
class HookableSelfHeal extends SelfHeal {
  constructor(private hooks: HookSystem) {
    super();
  }

  override async introspect(options: any = {}) {
    const scorecard = await super.introspect(options);
    await this.hooks.emit('task.complete' as LifecycleEvent, {
      phase: 'introspect',
      composite: scorecard.composite,
      weakest: scorecard.weakest,
    }, 'selfheal');
    return scorecard;
  }

  override async prescribe(options: any = {}) {
    const prescription = await super.prescribe(options);
    await this.hooks.emit('task.complete' as LifecycleEvent, {
      phase: 'prescribe',
      metric: prescription.metric.name,
      approved: prescription.governor.approved,
    }, 'selfheal');
    return prescription;
  }

  override async evolve(options: any = {}) {
    const result = await super.evolve(options);
    await this.hooks.emit('task.complete' as LifecycleEvent, {
      phase: 'evolve',
      success: result.success,
      iterations: result.iterations,
    }, 'selfheal');
    return result;
  }
}

describe('SelfHeal ↔ HookSystem integration', () => {
  let hooks: HookSystem;
  let selfheal: HookableSelfHeal;
  let captured: HookPayload[];

  beforeEach(() => {
    hooks = new HookSystem();
    selfheal = new HookableSelfHeal(hooks);
    captured = [];
  });

  describe('introspect', () => {
    it('emits task.complete with phase=introspect', async () => {
      hooks.on('task.complete', (p) => { captured.push(p); });
      const scorecard = await selfheal.introspect();
      expect(captured).toHaveLength(1);
      expect(captured[0].data.phase).toBe('introspect');
      expect(captured[0].data.composite).toBe(72);
      expect(captured[0].data.weakest).toBe('test_coverage');
      expect(captured[0].source).toBe('selfheal');
      expect(scorecard.composite).toBe(72);
    });
  });

  describe('prescribe', () => {
    it('emits task.complete with phase=prescribe', async () => {
      hooks.on('task.complete', (p) => { captured.push(p); });
      const prescription = await selfheal.prescribe();
      expect(captured).toHaveLength(1);
      expect(captured[0].data.phase).toBe('prescribe');
      expect(captured[0].data.metric).toBe('test_coverage');
      expect(captured[0].data.approved).toBe(true);
    });
  });

  describe('evolve', () => {
    it('emits task.complete with phase=evolve (after internal prescribe)', async () => {
      hooks.on('task.complete', (p) => { captured.push(p); });
      const result = await selfheal.evolve({ dryRun: true });
      // evolve() calls prescribe() internally, so we get prescribe + evolve events
      expect(captured).toHaveLength(2);
      expect(captured[0].data.phase).toBe('prescribe');
      expect(captured[1].data.phase).toBe('evolve');
      expect(captured[1].data.success).toBe(true);
      expect(captured[1].data.iterations).toBe(1);
    });
  });

  describe('full lifecycle observation', () => {
    it('captures introspect → prescribe → evolve in order', async () => {
      hooks.on('task.complete', (p) => { captured.push(p); });
      await selfheal.introspect();
      await selfheal.prescribe();
      await selfheal.evolve({ dryRun: true });

      // evolve() internally calls prescribe(), so we get 4 events total
      expect(captured).toHaveLength(4);
      expect(captured.map(c => c.data.phase)).toEqual(['introspect', 'prescribe', 'prescribe', 'evolve']);
    });

    it('multiple listeners all receive events', async () => {
      const secondary: HookPayload[] = [];
      hooks.on('task.complete', (p) => { captured.push(p); });
      hooks.on('task.complete', (p) => { secondary.push(p); });
      await selfheal.introspect();

      expect(captured).toHaveLength(1);
      expect(secondary).toHaveLength(1);
    });

    it('once listener fires only for first phase', async () => {
      hooks.once('task.complete', (p) => { captured.push(p); });
      await selfheal.introspect();
      await selfheal.prescribe();

      expect(captured).toHaveLength(1);
      expect(captured[0].data.phase).toBe('introspect');
    });

    it('disabled hooks do not fire', async () => {
      const id = hooks.on('task.complete', (p) => { captured.push(p); });
      hooks.disable(id);
      await selfheal.introspect();
      expect(captured).toHaveLength(0);
    });

    it('off removes hook permanently', async () => {
      const id = hooks.on('task.complete', (p) => { captured.push(p); });
      hooks.off(id);
      await selfheal.introspect();
      expect(captured).toHaveLength(0);
    });

    it('priority ordering is respected', async () => {
      const order: number[] = [];
      hooks.on('task.complete', () => { order.push(2); }, { priority: 200 });
      hooks.on('task.complete', () => { order.push(1); }, { priority: 10 });
      hooks.on('task.complete', () => { order.push(3); }, { priority: 300 });
      await selfheal.introspect();
      expect(order).toEqual([1, 2, 3]);
    });

    it('stats track fired events', async () => {
      hooks.on('task.complete', () => {});
      await selfheal.introspect();
      await selfheal.prescribe();

      const stats = hooks.getStats();
      expect(stats.totalFired).toBe(2);
      expect(stats.byEvent['task.complete'].fired).toBe(2);
      expect(stats.byEvent['task.complete'].registered).toBe(1);
    });
  });
});
