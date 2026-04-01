import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PersonaSwitcher } from '../switcher';

const TEST_DIR = join(import.meta.dir, '../../.test-switcher');
const PERSONAS_DIR = join(TEST_DIR, 'personas');
const STATE_DIR = join(TEST_DIR, 'state');

function createPersonaDir(slug: string) {
  mkdirSync(join(PERSONAS_DIR, slug), { recursive: true });
}

describe('PersonaSwitcher', () => {
  let switcher: PersonaSwitcher;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(PERSONAS_DIR, { recursive: true });
    createPersonaDir('default');
    createPersonaDir('analyst');
    createPersonaDir('advisor');
    switcher = new PersonaSwitcher(PERSONAS_DIR, STATE_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('initial state', () => {
    test('starts with default persona', () => {
      expect(switcher.active).toBe('default');
      expect(switcher.previous).toBeNull();
      expect(switcher.switchCount).toBe(0);
    });

    test('persists state to disk after switch', async () => {
      await switcher.switchTo('analyst');
      expect(existsSync(join(STATE_DIR, 'persona-state.json'))).toBe(true);
    });
  });

  describe('switchTo', () => {
    test('switches to a valid persona', async () => {
      const result = await switcher.switchTo('analyst');
      expect(result.success).toBe(true);
      expect(result.from).toBe('default');
      expect(result.to).toBe('analyst');
      expect(switcher.active).toBe('analyst');
      expect(switcher.previous).toBe('default');
      expect(switcher.switchCount).toBe(1);
    });

    test('no-op when switching to current persona', async () => {
      const result = await switcher.switchTo('default');
      expect(result.success).toBe(true);
      expect(result.from).toBe('default');
      expect(result.to).toBe('default');
      expect(switcher.switchCount).toBe(0);
    });

    test('fails for non-existent persona', async () => {
      const result = await switcher.switchTo('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(switcher.active).toBe('default');
    });

    test('records switch in history', async () => {
      await switcher.switchTo('analyst');
      await switcher.switchTo('advisor');

      const history = switcher.history;
      expect(history.length).toBe(2);
      expect(history[0].from).toBe('default');
      expect(history[0].to).toBe('analyst');
      expect(history[1].from).toBe('analyst');
      expect(history[1].to).toBe('advisor');
    });

    test('records reason in history', async () => {
      await switcher.switchTo('analyst', { reason: 'data analysis task' });
      expect(switcher.history[0].reason).toBe('data analysis task');
    });

    test('carries context when requested', async () => {
      const ctx = { task: 'portfolio review', stage: 'analysis' };
      await switcher.switchTo('analyst', { carryContext: true, context: ctx });

      const carried = switcher.getContextForSwitch('default');
      expect(carried).toEqual(ctx);
    });

    test('calls onSwitch callback', async () => {
      let callbackArgs: [string, string] | null = null;
      await switcher.switchTo('analyst', {
        onSwitch: (from, to) => { callbackArgs = [from, to]; },
      });
      expect(callbackArgs).toEqual(['default', 'analyst']);
    });
  });

  describe('switchBack', () => {
    test('switches back to previous persona', async () => {
      await switcher.switchTo('analyst');
      const result = await switcher.switchBack();

      expect(result.success).toBe(true);
      expect(result.from).toBe('analyst');
      expect(result.to).toBe('default');
      expect(switcher.active).toBe('default');
    });

    test('fails when no previous persona', async () => {
      const result = await switcher.switchBack();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No previous persona');
    });
  });

  describe('onSwitch listener', () => {
    test('notifies listeners on switch', async () => {
      const events: Array<{ from: string; to: string }> = [];
      switcher.onSwitch((from, to) => { events.push({ from, to }); });

      await switcher.switchTo('analyst');
      await switcher.switchTo('advisor');

      expect(events.length).toBe(2);
      expect(events[0]).toEqual({ from: 'default', to: 'analyst' });
    });

    test('unsubscribe removes listener', async () => {
      const events: string[] = [];
      const unsub = switcher.onSwitch((_, to) => { events.push(to); });

      await switcher.switchTo('analyst');
      unsub();
      await switcher.switchTo('advisor');

      expect(events).toEqual(['analyst']);
    });
  });

  describe('state persistence', () => {
    test('persists across instances', async () => {
      await switcher.switchTo('analyst');

      // Create new instance with same dirs
      const switcher2 = new PersonaSwitcher(PERSONAS_DIR, STATE_DIR);
      expect(switcher2.active).toBe('analyst');
      expect(switcher2.switchCount).toBe(1);
    });
  });

  describe('resetState', () => {
    test('resets to default state', async () => {
      await switcher.switchTo('analyst');
      await switcher.switchTo('advisor');

      switcher.resetState();
      expect(switcher.active).toBe('default');
      expect(switcher.previous).toBeNull();
      expect(switcher.switchCount).toBe(0);
      expect(switcher.history).toEqual([]);
    });
  });

  describe('history bounds', () => {
    test('trims history to 100 entries', async () => {
      for (let i = 0; i < 60; i++) {
        await switcher.switchTo(i % 2 === 0 ? 'analyst' : 'advisor');
      }
      expect(switcher.history.length).toBeLessThanOrEqual(100);
    });
  });
});
