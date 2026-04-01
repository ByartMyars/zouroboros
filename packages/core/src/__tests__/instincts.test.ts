import { describe, test, expect, beforeEach } from 'bun:test';
import { InstinctEngine, createInstinctEngine } from '../instincts';
import type { Instinct, PatternEvidence } from '../instincts';

function makeInstinct(id: string, overrides: Partial<Instinct> = {}): Instinct {
  return {
    id,
    name: `Instinct ${id}`,
    description: `Description for ${id}`,
    confidence: 0.8,
    pattern: { type: 'error_repeat', signature: 'timeout error retry', frequency: 5, windowSize: 10 },
    trigger: { event: '*', condition: 'timeout', cooldownMs: 1000 },
    resolution: 'Add exponential backoff',
    evidenceCount: 5,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'active',
    tags: ['error-handling'],
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<PatternEvidence> = {}): PatternEvidence {
  return {
    timestamp: new Date().toISOString(),
    context: 'timeout error in API call',
    matchStrength: 0.8,
    ...overrides,
  };
}

describe('InstinctEngine', () => {
  let engine: InstinctEngine;

  beforeEach(() => {
    engine = createInstinctEngine();
  });

  describe('register / get', () => {
    test('registers and retrieves an instinct', () => {
      engine.register(makeInstinct('i-1'));
      const inst = engine.get('i-1');
      expect(inst).not.toBeNull();
      expect(inst!.name).toBe('Instinct i-1');
    });

    test('returns null for unknown id', () => {
      expect(engine.get('nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    test('lists all instincts sorted by confidence', () => {
      engine.register(makeInstinct('low', { confidence: 0.3 }));
      engine.register(makeInstinct('high', { confidence: 0.9 }));

      const list = engine.list();
      expect(list.length).toBe(2);
      expect(list[0].id).toBe('high');
    });

    test('filters by status', () => {
      engine.register(makeInstinct('active', { status: 'active' }));
      engine.register(makeInstinct('suspended', { status: 'suspended' }));

      expect(engine.list({ status: 'active' }).length).toBe(1);
    });

    test('filters by minimum confidence', () => {
      engine.register(makeInstinct('low', { confidence: 0.3 }));
      engine.register(makeInstinct('high', { confidence: 0.9 }));

      expect(engine.list({ minConfidence: 0.5 }).length).toBe(1);
    });

    test('filters by tag', () => {
      engine.register(makeInstinct('tagged', { tags: ['memory'] }));
      engine.register(makeInstinct('other', { tags: ['routing'] }));

      expect(engine.list({ tag: 'memory' }).length).toBe(1);
    });
  });

  describe('addEvidence', () => {
    test('adds evidence and updates instinct', () => {
      engine.register(makeInstinct('i-1', { evidenceCount: 0 }));
      const added = engine.addEvidence('i-1', makeEvidence());

      expect(added).toBe(true);
      expect(engine.get('i-1')!.evidenceCount).toBe(1);
    });

    test('returns false for unknown instinct', () => {
      expect(engine.addEvidence('bad', makeEvidence())).toBe(false);
    });

    test('auto-promotes candidate to active', () => {
      engine.register(makeInstinct('cand', { status: 'candidate', confidence: 0.5, evidenceCount: 0 }));

      for (let i = 0; i < 4; i++) {
        engine.addEvidence('cand', makeEvidence({ matchStrength: 0.9 }));
      }

      expect(engine.get('cand')!.status).toBe('active');
    });

    test('caps evidence at 100 items', () => {
      engine.register(makeInstinct('i-1'));
      for (let i = 0; i < 110; i++) {
        engine.addEvidence('i-1', makeEvidence());
      }
      // Evidence count reflects stored count (capped at 100)
      expect(engine.get('i-1')!.evidenceCount).toBe(100);
    });
  });

  describe('rejectMatch', () => {
    test('adds negative evidence', () => {
      engine.register(makeInstinct('i-1', { confidence: 0.8 }));
      expect(engine.rejectMatch('i-1')).toBe(true);
      // Confidence should decrease with negative evidence
      expect(engine.get('i-1')!.confidence).toBeLessThan(0.8);
    });

    test('returns false for unknown instinct', () => {
      expect(engine.rejectMatch('bad')).toBe(false);
    });

    test('auto-suspends when confidence drops too low', () => {
      engine.register(makeInstinct('i-1', { confidence: 0.4, status: 'active', evidenceCount: 0 }));
      // Repeated rejections should drop confidence and suspend
      for (let i = 0; i < 10; i++) {
        engine.rejectMatch('i-1');
      }
      expect(engine.get('i-1')!.status).toBe('suspended');
    });
  });

  describe('match', () => {
    test('matches active instincts by context', () => {
      engine.register(makeInstinct('i-1', {
        pattern: { type: 'error_repeat', signature: 'timeout error retry', frequency: 5, windowSize: 10 },
        trigger: { event: '*', condition: 'timeout', cooldownMs: 0 },
      }));

      const matches = engine.match('Got a timeout error during retry');
      expect(matches.length).toBe(1);
      expect(matches[0].instinct.id).toBe('i-1');
    });

    test('does not match suspended instincts', () => {
      engine.register(makeInstinct('i-1', { status: 'suspended' }));
      expect(engine.match('timeout error').length).toBe(0);
    });

    test('respects cooldown', () => {
      engine.register(makeInstinct('i-1', {
        trigger: { event: '*', condition: 'timeout', cooldownMs: 60000 },
      }));

      engine.fire('i-1');
      const matches = engine.match('timeout error');
      expect(matches.length).toBe(0);
    });

    test('filters by event', () => {
      engine.register(makeInstinct('i-1', {
        trigger: { event: 'task.fail', condition: 'timeout', cooldownMs: 0 },
      }));

      expect(engine.match('timeout error', 'task.start').length).toBe(0);
      expect(engine.match('timeout error', 'task.fail').length).toBe(1);
    });
  });

  describe('fire', () => {
    test('records firing time', () => {
      engine.register(makeInstinct('i-1'));
      expect(engine.fire('i-1')).toBe(true);
    });

    test('returns false for non-active instinct', () => {
      engine.register(makeInstinct('i-1', { status: 'suspended' }));
      expect(engine.fire('i-1')).toBe(false);
    });

    test('emits instinct.fired hook event', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      engine.wireHooks(hooks);

      let emitted: Record<string, unknown> | null = null;
      hooks.on('instinct.fired', (payload) => {
        emitted = payload.data;
      });

      engine.register(makeInstinct('i-1'));
      engine.fire('i-1');

      await new Promise(r => setTimeout(r, 10));
      expect(emitted).not.toBeNull();
      expect(emitted!.instinctId).toBe('i-1');
    });
  });

  describe('extract', () => {
    test('creates instincts from recurring observations', () => {
      const observations = [
        { context: 'memory cache failed stale lookup error', outcome: 'clear cache and retry', timestamp: new Date().toISOString() },
        { context: 'memory cache failed expired lookup error', outcome: 'clear cache and retry', timestamp: new Date().toISOString() },
        { context: 'memory cache failed stale lookup timeout', outcome: 'clear cache and retry', timestamp: new Date().toISOString() },
      ];

      const result = engine.extract(observations);
      expect(result.instinctsCreated).toBe(1);
      expect(result.patternsDetected).toBe(1);
    });

    test('updates existing instincts on re-extract', () => {
      // Use identical contexts so Jaccard similarity = 1.0 and signatures match
      const obs1 = [
        { context: 'API timeout error in retry loop', outcome: 'retry with backoff', timestamp: new Date().toISOString() },
        { context: 'API timeout error in retry loop', outcome: 'retry with backoff', timestamp: new Date().toISOString() },
      ];
      engine.extract(obs1);

      const obs2 = [
        { context: 'API timeout error in retry loop', outcome: 'retry with backoff', timestamp: new Date().toISOString() },
        { context: 'API timeout error in retry loop', outcome: 'retry with backoff', timestamp: new Date().toISOString() },
      ];
      const result = engine.extract(obs2);
      expect(result.instinctsUpdated).toBe(1);
      expect(result.instinctsCreated).toBe(0);
    });

    test('skips groups with insufficient observations', () => {
      const observations = [
        { context: 'unique error xyz', outcome: 'unique fix abc', timestamp: new Date().toISOString() },
      ];

      const result = engine.extract(observations);
      expect(result.instinctsCreated).toBe(0);
      expect(result.details[0].action).toBe('skipped');
    });
  });

  describe('recordObservation', () => {
    test('accumulates pending observations', () => {
      // 4 observations should not trigger auto-extract yet
      for (let i = 0; i < 4; i++) {
        engine.recordObservation({
          context: 'connection timeout error',
          outcome: 'retry',
          timestamp: new Date().toISOString(),
        });
      }
      expect(engine.getStats().total).toBe(0);
    });

    test('auto-extracts at 5 observations', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({
          context: 'connection timeout error in handler',
          outcome: 'retry with backoff',
          timestamp: new Date().toISOString(),
        });
      }
      // Should have created at least one instinct from the batch
      expect(engine.getStats().total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('status management', () => {
    test('suspend / activate / retire', () => {
      engine.register(makeInstinct('i-1'));

      expect(engine.suspend('i-1')).toBe(true);
      expect(engine.get('i-1')!.status).toBe('suspended');

      expect(engine.activate('i-1')).toBe(true);
      expect(engine.get('i-1')!.status).toBe('active');

      expect(engine.retire('i-1')).toBe(true);
      expect(engine.get('i-1')!.status).toBe('retired');
    });

    test('returns false for unknown id', () => {
      expect(engine.suspend('bad')).toBe(false);
    });
  });

  describe('remove', () => {
    test('removes instinct and evidence', () => {
      engine.register(makeInstinct('i-1'));
      engine.addEvidence('i-1', makeEvidence());

      expect(engine.remove('i-1')).toBe(true);
      expect(engine.get('i-1')).toBeNull();
    });
  });

  describe('getStats', () => {
    test('returns aggregate statistics', () => {
      engine.register(makeInstinct('a', { status: 'active', confidence: 0.8 }));
      engine.register(makeInstinct('b', { status: 'candidate', confidence: 0.4 }));
      engine.register(makeInstinct('c', { status: 'active', confidence: 0.6 }));

      const stats = engine.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byStatus.active).toBe(2);
      expect(stats.byStatus.candidate).toBe(1);
      expect(stats.avgConfidence).toBeCloseTo(0.6, 1);
    });
  });

  describe('export / import', () => {
    test('exports instinct with evidence', () => {
      engine.register(makeInstinct('i-1'));
      engine.addEvidence('i-1', makeEvidence());

      const exported = engine.exportInstinct('i-1') as any;
      expect(exported.id).toBe('i-1');
      expect(exported.evidence.length).toBe(1);
    });

    test('returns null for unknown instinct', () => {
      expect(engine.exportInstinct('bad')).toBeNull();
    });

    test('imports instinct with evidence', () => {
      const data = {
        ...makeInstinct('imported'),
        evidence: [makeEvidence()],
      };

      engine.importInstinct(data);
      expect(engine.get('imported')).not.toBeNull();
    });
  });

  describe('hook wiring', () => {
    test('auto-extracts from task.fail events', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      engine.wireHooks(hooks);

      // Emit 5 task.fail events to trigger auto-extraction
      for (let i = 0; i < 5; i++) {
        await hooks.emit('task.fail', {
          error: 'connection refused on database query',
          resolution: 'retry connection',
        });
      }

      expect(engine.getStats().total).toBeGreaterThanOrEqual(1);
    });

    test('auto-extracts from error.recovery events', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      engine.wireHooks(hooks);

      for (let i = 0; i < 5; i++) {
        await hooks.emit('error.recovery', {
          error: 'memory allocation failure in cache layer',
          recovery: 'cleared and rebuilt cache',
        });
      }

      expect(engine.getStats().total).toBeGreaterThanOrEqual(1);
    });
  });
});
