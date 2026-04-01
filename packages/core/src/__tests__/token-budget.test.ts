import { describe, test, expect, beforeEach } from 'bun:test';
import { TokenBudgetManager, createTokenBudget } from '../token-budget';
import { HookSystem } from '../hooks';

describe('TokenBudgetManager', () => {
  let manager: TokenBudgetManager;

  beforeEach(() => {
    manager = createTokenBudget({ maxTokens: 100000 });
  });

  describe('update', () => {
    test('computes utilization percentage', () => {
      const state = manager.update(50000);
      expect(state.utilizationPercent).toBe(0.5);
      expect(state.level).toBe('normal');
    });

    test('transitions to warning at threshold', () => {
      const state = manager.update(72000);
      expect(state.level).toBe('warning');
    });

    test('transitions to critical at threshold', () => {
      const state = manager.update(87000);
      expect(state.level).toBe('critical');
    });

    test('transitions to emergency at threshold', () => {
      const state = manager.update(96000);
      expect(state.level).toBe('emergency');
    });

    test('returns to normal when tokens decrease', () => {
      manager.update(90000);
      const state = manager.update(30000);
      expect(state.level).toBe('normal');
    });
  });

  describe('checkpoint', () => {
    test('creates checkpoint with token state', () => {
      manager.update(50000);
      const cp = manager.checkpoint({ reason: 'test' }, 'task-1');

      expect(cp.tokenState.currentTokens).toBe(50000);
      expect(cp.activeTaskId).toBe('task-1');
      expect(cp.context.reason).toBe('test');
      expect(cp.timestamp).toBeTruthy();
    });

    test('stores up to 50 checkpoints', () => {
      for (let i = 0; i < 55; i++) {
        manager.checkpoint({ i });
      }
      expect(manager.getCheckpoints().length).toBe(50);
    });

    test('updates lastCheckpoint on state', () => {
      const cp = manager.checkpoint();
      expect(manager.getState().lastCheckpoint).toBe(cp.timestamp);
    });
  });

  describe('recordCompression', () => {
    test('records compression with actual token count', () => {
      manager.update(100000);
      const record = manager.recordCompression(80000, ['section1']);

      expect(record.strategy).toBe('progressive');
      expect(record.saved).toBe(20000);
      expect(record.tokensAfter).toBe(80000);
      expect(manager.getState().currentTokens).toBe(80000);
    });

    test('tracks compression count and saved tokens', () => {
      manager.update(100000);
      manager.recordCompression(80000, ['s1']);
      manager.recordCompression(60000, ['s2']);

      const state = manager.getState();
      expect(state.compressionCount).toBe(2);
      expect(state.savedTokens).toBe(40000); // 20000 + 20000
    });

    test('stores compression history (max 20)', () => {
      for (let i = 0; i < 25; i++) {
        manager.update(100000);
        manager.recordCompression(80000, [`s${i}`]);
      }
      expect(manager.getCompressionHistory().length).toBe(20);
    });

    test('records timestamp', () => {
      manager.update(100000);
      const record = manager.recordCompression(80000, ['s1']);
      expect(record.timestamp).toBeTruthy();
    });

    test('clamps saved to zero if tokensAfter exceeds current', () => {
      manager.update(50000);
      const record = manager.recordCompression(60000, ['s1']);
      expect(record.saved).toBe(0);
    });
  });

  describe('getCompressionTarget', () => {
    test('progressive targets 20% reduction', () => {
      manager.update(100000);
      const target = manager.getCompressionTarget();
      expect(target.targetTokens).toBe(80000);
      expect(target.reductionPercent).toBe(0.20);
    });

    test('aggressive targets 40% reduction', () => {
      const mgr = createTokenBudget({ maxTokens: 100000, compressionStrategy: 'aggressive' });
      mgr.update(100000);
      const target = mgr.getCompressionTarget();
      expect(target.targetTokens).toBe(60000);
    });

    test('selective targets 15% reduction', () => {
      const mgr = createTokenBudget({ maxTokens: 100000, compressionStrategy: 'selective' });
      mgr.update(100000);
      const target = mgr.getCompressionTarget();
      expect(target.targetTokens).toBe(85000);
    });
  });

  describe('getRecommendation', () => {
    test('returns none for normal state', () => {
      manager.update(30000);
      const rec = manager.getRecommendation();
      expect(rec.action).toBe('none');
      expect(rec.urgency).toBe('none');
    });

    test('returns prepare_checkpoint for warning', () => {
      manager.update(72000);
      const rec = manager.getRecommendation();
      expect(rec.action).toBe('prepare_checkpoint');
      expect(rec.urgency).toBe('low');
    });

    test('returns checkpoint_and_compress for critical', () => {
      manager.update(87000);
      const rec = manager.getRecommendation();
      expect(rec.action).toBe('checkpoint_and_compress');
      expect(rec.urgency).toBe('medium');
    });

    test('returns immediate action for emergency', () => {
      manager.update(96000);
      const rec = manager.getRecommendation();
      expect(rec.action).toBe('immediate_checkpoint_and_compress');
      expect(rec.urgency).toBe('high');
    });
  });

  describe('shouldPauseSwarm / shouldCompress', () => {
    test('pauses swarm at critical/emergency', () => {
      manager.update(30000);
      expect(manager.shouldPauseSwarm()).toBe(false);

      manager.update(87000);
      expect(manager.shouldPauseSwarm()).toBe(true);

      manager.update(96000);
      expect(manager.shouldPauseSwarm()).toBe(true);
    });

    test('shouldCompress at critical/emergency', () => {
      manager.update(60000);
      expect(manager.shouldCompress()).toBe(false);

      manager.update(87000);
      expect(manager.shouldCompress()).toBe(true);
    });
  });

  describe('wireHooks', () => {
    test('wires conversation.end checkpoint hook', async () => {
      const hooks = new HookSystem();
      manager.wireHooks(hooks);

      await hooks.emit('conversation.end', { reason: 'done' });
      const checkpoints = manager.getCheckpoints();
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].context.reason).toBe('done');
    });

    test('fires level change events through hooks', async () => {
      const hooks = new HookSystem();
      manager = createTokenBudget({ maxTokens: 100000 }, hooks);

      let warningFired = false;
      hooks.on('context.warning', () => { warningFired = true; });

      manager.update(75000);
      await new Promise(r => setTimeout(r, 10));
      expect(warningFired).toBe(true);
    });

    test('fires emergency event through hooks', async () => {
      const hooks = new HookSystem();
      manager = createTokenBudget({ maxTokens: 100000 }, hooks);

      let emergencyFired = false;
      hooks.on('context.emergency', () => { emergencyFired = true; });

      manager.update(96000);
      await new Promise(r => setTimeout(r, 10));
      expect(emergencyFired).toBe(true);
    });
  });

  describe('getState', () => {
    test('returns copy of state', () => {
      manager.update(50000);
      const state = manager.getState();
      state.currentTokens = 999;
      expect(manager.getState().currentTokens).toBe(50000);
    });
  });
});
