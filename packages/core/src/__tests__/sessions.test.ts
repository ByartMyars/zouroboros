import { describe, test, expect, beforeEach } from 'bun:test';
import { SessionManager, createSessionManager } from '../sessions';

describe('SessionManager', () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = createSessionManager();
  });

  describe('create', () => {
    test('creates a session with defaults', () => {
      const session = mgr.create('Test Session');
      expect(session.id).toStartWith('session-');
      expect(session.name).toBe('Test Session');
      expect(session.status).toBe('active');
      expect(session.metrics.totalTokens).toBe(0);
    });

    test('accepts metadata', () => {
      const session = mgr.create('Test', { key: 'value' });
      expect(session.metadata.key).toBe('value');
    });
  });

  describe('get / list', () => {
    test('retrieves session by id', () => {
      const session = mgr.create('Test');
      expect(mgr.get(session.id)).not.toBeNull();
      expect(mgr.get(session.id)!.name).toBe('Test');
    });

    test('returns null for unknown id', () => {
      expect(mgr.get('nonexistent')).toBeNull();
    });

    test('lists all sessions', () => {
      mgr.create('A');
      mgr.create('B');
      expect(mgr.list().length).toBe(2);
    });

    test('filters by status', () => {
      const s1 = mgr.create('Active');
      const s2 = mgr.create('Done');
      mgr.updateStatus(s2.id, 'completed');

      expect(mgr.list({ status: 'active' }).length).toBe(1);
      expect(mgr.list({ status: 'completed' }).length).toBe(1);
    });
  });

  describe('addEntry', () => {
    test('adds entry to session', () => {
      const session = mgr.create('Test');
      const entry = mgr.addEntry(session.id, {
        timestamp: new Date().toISOString(),
        type: 'message',
        content: 'Hello',
        tokens: 5,
      });

      expect(entry).not.toBeNull();
      expect(entry!.id).toStartWith('entry-');
    });

    test('returns null for unknown session', () => {
      expect(mgr.addEntry('bad-id', {
        timestamp: new Date().toISOString(),
        type: 'message',
        content: 'Hello',
      })).toBeNull();
    });

    test('updates metrics on entry add', () => {
      const session = mgr.create('Test');
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: 'Hi', tokens: 10 });
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'tool_call', content: 'read file', tokens: 20 });
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'checkpoint', content: 'cp', tokens: 5 });

      const metrics = mgr.getMetrics(session.id)!;
      expect(metrics.entryCount).toBe(3);
      expect(metrics.totalTokens).toBe(35);
      expect(metrics.toolCalls).toBe(1);
      expect(metrics.checkpoints).toBe(1);
    });
  });

  describe('branch', () => {
    test('creates branch from session', () => {
      const parent = mgr.create('Parent');
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg1', tokens: 10 });
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg2', tokens: 15 });

      const branch = mgr.branch(parent.id, 'Branch');
      expect(branch).not.toBeNull();
      expect(branch!.parentId).toBe(parent.id);
      expect(branch!.entries.length).toBe(2);
      expect(branch!.metadata.branchedFrom).toBe(parent.id);
    });

    test('branches from specific entry index via options', () => {
      const parent = mgr.create('Parent');
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg1', tokens: 10 });
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg2', tokens: 15 });
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg3', tokens: 20 });

      const branch = mgr.branch(parent.id, 'Partial', { fromEntryIndex: 2 });
      expect(branch!.entries.length).toBe(2);
      expect(branch!.metrics.totalTokens).toBe(25);
    });

    test('does not freeze parent by default', () => {
      const parent = mgr.create('Parent');
      mgr.branch(parent.id, 'Branch');
      expect(mgr.get(parent.id)!.status).toBe('active');
    });

    test('freezes parent when explicitly requested', () => {
      const parent = mgr.create('Parent');
      mgr.branch(parent.id, 'Branch', { freezeParent: true });
      expect(mgr.get(parent.id)!.status).toBe('branched');
    });

    test('returns null for non-existent session', () => {
      expect(mgr.branch('bad-id', 'Branch')).toBeNull();
    });
  });

  describe('search', () => {
    test('finds entries by keyword', () => {
      const session = mgr.create('Test');
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: 'The quick brown fox' });
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: 'The lazy dog' });

      const results = mgr.search('fox');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('fox');
    });

    test('searches within specific session', () => {
      const s1 = mgr.create('S1');
      const s2 = mgr.create('S2');
      mgr.addEntry(s1.id, { timestamp: new Date().toISOString(), type: 'message', content: 'hello world' });
      mgr.addEntry(s2.id, { timestamp: new Date().toISOString(), type: 'message', content: 'hello universe' });

      const results = mgr.search('hello', { sessionId: s1.id });
      expect(results.length).toBe(1);
      expect(results[0].sessionId).toBe(s1.id);
    });

    test('respects limit', () => {
      const session = mgr.create('Test');
      for (let i = 0; i < 30; i++) {
        mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: `entry number ${i}` });
      }

      const results = mgr.search('entry', { limit: 5 });
      expect(results.length).toBe(5);
    });

    test('ranks by match quality', () => {
      const session = mgr.create('Test');
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: 'memory recall fix bug' });
      mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: 'memory issues found' });

      const results = mgr.search('memory recall');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe('compact', () => {
    test('compacts old entries into summary', () => {
      const session = mgr.create('Test');
      for (let i = 0; i < 20; i++) {
        mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: `message ${i}`, tokens: 10 });
      }

      const result = mgr.compact(session.id);
      expect(result).not.toBeNull();
      expect(result!.entriesAfter).toBeLessThan(result!.entriesBefore);
      expect(result!.tokensAfter).toBeLessThan(result!.tokensBefore);
    });

    test('returns null for empty session', () => {
      const session = mgr.create('Empty');
      expect(mgr.compact(session.id)).toBeNull();
    });

    test('accepts custom summarizer', () => {
      const session = mgr.create('Test');
      for (let i = 0; i < 10; i++) {
        mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: `msg ${i}`, tokens: 5 });
      }

      const result = mgr.compact(session.id, () => 'Custom summary');
      expect(result!.summary).toBe('Custom summary');
    });
  });

  describe('metrics', () => {
    test('returns null for unknown session', () => {
      expect(mgr.getMetrics('bad')).toBeNull();
    });

    test('aggregate metrics across sessions', () => {
      const s1 = mgr.create('S1');
      const s2 = mgr.create('S2');
      mgr.addEntry(s1.id, { timestamp: new Date().toISOString(), type: 'message', content: 'a', tokens: 100 });
      mgr.addEntry(s2.id, { timestamp: new Date().toISOString(), type: 'message', content: 'b', tokens: 200 });

      const agg = mgr.getAggregateMetrics();
      expect(agg.totalSessions).toBe(2);
      expect(agg.totalTokens).toBe(300);
      expect(agg.avgTokensPerSession).toBe(150);
    });
  });

  describe('updateStatus / delete / clear', () => {
    test('updates session status', () => {
      const session = mgr.create('Test');
      expect(mgr.updateStatus(session.id, 'paused')).toBe(true);
      expect(mgr.get(session.id)!.status).toBe('paused');
    });

    test('returns false for unknown session', () => {
      expect(mgr.updateStatus('bad', 'paused')).toBe(false);
    });

    test('deletes session', () => {
      const session = mgr.create('Test');
      expect(mgr.delete(session.id)).toBe(true);
      expect(mgr.get(session.id)).toBeNull();
    });

    test('clear removes all sessions', () => {
      mgr.create('A');
      mgr.create('B');
      mgr.clear();
      expect(mgr.list().length).toBe(0);
    });
  });

  describe('hook integration', () => {
    test('emits session.branch hook event', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      mgr.wireHooks(hooks);

      let emitted: Record<string, unknown> | null = null;
      hooks.on('session.branch', (payload) => {
        emitted = payload.data;
      });

      const parent = mgr.create('Parent');
      mgr.addEntry(parent.id, { timestamp: new Date().toISOString(), type: 'message', content: 'msg', tokens: 5 });
      mgr.branch(parent.id, 'Branch');

      // Allow async emit to settle
      await new Promise(r => setTimeout(r, 10));
      expect(emitted).not.toBeNull();
      expect(emitted!.parentId).toBe(parent.id);
      expect(emitted!.branchName).toBe('Branch');
    });

    test('emits session.compact hook event', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      mgr.wireHooks(hooks);

      let emitted: Record<string, unknown> | null = null;
      hooks.on('session.compact', (payload) => {
        emitted = payload.data;
      });

      const session = mgr.create('Test');
      for (let i = 0; i < 20; i++) {
        mgr.addEntry(session.id, { timestamp: new Date().toISOString(), type: 'message', content: `msg ${i}`, tokens: 10 });
      }
      mgr.compact(session.id);

      await new Promise(r => setTimeout(r, 10));
      expect(emitted).not.toBeNull();
      expect(emitted!.sessionId).toBe(session.id);
    });
  });
});
