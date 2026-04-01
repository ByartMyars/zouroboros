import { describe, test, expect, beforeEach } from 'bun:test';
import { HookSystem, createHookSystem, getHookSystem, resetGlobalHooks } from '../hooks';
import type { LifecycleEvent, HookPayload } from '../hooks';

describe('HookSystem', () => {
  let hooks: HookSystem;

  beforeEach(() => {
    hooks = createHookSystem();
    resetGlobalHooks();
  });

  describe('register and emit', () => {
    test('registers and fires a hook', async () => {
      let fired = false;
      hooks.on('task.start', () => { fired = true; });
      await hooks.emit('task.start', { taskId: 'test' });
      expect(fired).toBe(true);
    });

    test('passes payload to handler', async () => {
      let received: HookPayload | null = null;
      hooks.on('task.complete', (payload) => { received = payload; });
      await hooks.emit('task.complete', { result: 'ok' }, 'test-source');

      expect(received).not.toBeNull();
      expect(received!.event).toBe('task.complete');
      expect(received!.data.result).toBe('ok');
      expect(received!.source).toBe('test-source');
      expect(received!.timestamp).toBeTruthy();
    });

    test('fires hooks in priority order', async () => {
      const order: number[] = [];
      hooks.on('task.start', () => { order.push(2); }, { priority: 20 });
      hooks.on('task.start', () => { order.push(1); }, { priority: 10 });
      hooks.on('task.start', () => { order.push(3); }, { priority: 30 });

      await hooks.emit('task.start');
      expect(order).toEqual([1, 2, 3]);
    });

    test('does not fire for unmatched events', async () => {
      let fired = false;
      hooks.on('task.start', () => { fired = true; });
      await hooks.emit('task.complete');
      expect(fired).toBe(false);
    });

    test('handles multiple events', async () => {
      let count = 0;
      hooks.on(['task.start', 'task.complete'], () => { count++; });

      await hooks.emit('task.start');
      await hooks.emit('task.complete');
      expect(count).toBe(2);
    });
  });

  describe('once', () => {
    test('fires only once then auto-removes', async () => {
      let count = 0;
      hooks.once('task.start', () => { count++; });

      await hooks.emit('task.start');
      await hooks.emit('task.start');
      expect(count).toBe(1);
    });
  });

  describe('off', () => {
    test('removes a hook', async () => {
      let fired = false;
      const id = hooks.on('task.start', () => { fired = true; });
      hooks.off(id);

      await hooks.emit('task.start');
      expect(fired).toBe(false);
    });

    test('returns false for non-existent hook', () => {
      expect(hooks.off('nonexistent')).toBe(false);
    });
  });

  describe('enable/disable', () => {
    test('disable prevents hook from firing', async () => {
      let fired = false;
      const id = hooks.on('task.start', () => { fired = true; });
      hooks.disable(id);

      await hooks.emit('task.start');
      expect(fired).toBe(false);
    });

    test('re-enable restores hook', async () => {
      let fired = false;
      const id = hooks.on('task.start', () => { fired = true; });
      hooks.disable(id);
      hooks.enable(id);

      await hooks.emit('task.start');
      expect(fired).toBe(true);
    });
  });

  describe('emitSync', () => {
    test('fires synchronous handlers', () => {
      let fired = false;
      hooks.on('task.start', () => { fired = true; });
      hooks.emitSync('task.start');
      expect(fired).toBe(true);
    });
  });

  describe('loadDefinitions', () => {
    test('loads hook definitions', () => {
      const ids = hooks.loadDefinitions([
        { id: 'def-1', event: 'task.start', action: 'log', description: 'Test log' },
        { id: 'def-2', event: 'task.complete', action: 'checkpoint' },
      ]);

      expect(ids.length).toBe(2);
      const list = hooks.listHooks();
      expect(list.length).toBe(2);
    });
  });

  describe('stats', () => {
    test('tracks fired count and errors', async () => {
      hooks.on('task.start', () => {});
      hooks.on('task.start', () => { throw new Error('boom'); });

      await hooks.emit('task.start');
      const stats = hooks.getStats();

      expect(stats.totalFired).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.totalRegistered).toBe(2);
    });

    test('tracks per-event stats', async () => {
      hooks.on('task.start', () => {});
      hooks.on('task.complete', () => {});

      await hooks.emit('task.start');
      await hooks.emit('task.start');
      await hooks.emit('task.complete');

      const stats = hooks.getStats();
      expect(stats.byEvent['task.start'].fired).toBe(2);
      expect(stats.byEvent['task.complete'].fired).toBe(1);
    });
  });

  describe('listHooks', () => {
    test('lists all registered hooks', () => {
      hooks.on('task.start', () => {}, { description: 'Hook A' });
      hooks.on('task.complete', () => {}, { description: 'Hook B' });

      const list = hooks.listHooks();
      expect(list.length).toBe(2);
      expect(list.some(h => h.description === 'Hook A')).toBe(true);
    });
  });

  describe('clear', () => {
    test('removes all hooks', async () => {
      hooks.on('task.start', () => {});
      hooks.on('task.complete', () => {});
      hooks.clear();

      expect(hooks.listHooks().length).toBe(0);
    });
  });

  describe('global hooks', () => {
    test('getHookSystem returns singleton', () => {
      const a = getHookSystem();
      const b = getHookSystem();
      expect(a).toBe(b);
    });

    test('resetGlobalHooks creates new instance', () => {
      const a = getHookSystem();
      resetGlobalHooks();
      const b = getHookSystem();
      expect(a).not.toBe(b);
    });
  });
});
