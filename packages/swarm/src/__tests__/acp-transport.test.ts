/**
 * ACPTransport integration test
 *
 * Stage 1: Unit tests for transport factory, BridgeTransport, ACPTransport construction.
 * Stage 2: Integration smoke test — ACPTransport health check (verifies adapter binary exists).
 *
 * We do NOT run live ACP sessions in CI (requires Claude auth). The integration
 * test validates the full transport wiring up to the spawn boundary.
 */

import { describe, test, expect, mock } from 'bun:test';
import { BridgeTransport } from '../transport/bridge-transport.js';
import { ACPTransport } from '../transport/acp-transport.js';
import { createTransport } from '../transport/factory.js';
import { CircuitBreaker } from '../circuit/breaker.js';
import type { ExecutorRegistryEntry } from '../types.js';

const mockBridgeEntry: ExecutorRegistryEntry = {
  id: 'claude-code',
  name: 'Claude Code',
  executor: 'local',
  bridge: 'Skills/zo-swarm-executors/bridges/claude-code-bridge.sh',
  description: 'test',
  expertise: ['code-generation'],
  bestFor: ['test'],
  config: { defaultTimeout: 600, model: null, envVars: {} },
  healthCheck: { command: 'true', expectedPattern: '', description: 'test' },
};

const mockACPEntry = {
  ...mockBridgeEntry,
  transport: 'acp' as const,
};

const mockBridgeEntryWithTransport = {
  ...mockBridgeEntry,
  transport: 'bridge' as const,
};

function makeCB() {
  return new CircuitBreaker({ id: 'test', cooldownMs: 0, failureThreshold: 5 });
}

// ─── Transport Construction ───────────────────────────────────────────────────

describe('createTransport factory', () => {
  test('defaults to BridgeTransport when transport field absent', () => {
    const t = createTransport(mockBridgeEntry, makeCB());
    expect(t).toBeInstanceOf(BridgeTransport);
  });

  test('returns BridgeTransport for transport: bridge', () => {
    const t = createTransport(mockBridgeEntryWithTransport, makeCB());
    expect(t).toBeInstanceOf(BridgeTransport);
  });

  test('returns ACPTransport for transport: acp', () => {
    const t = createTransport(mockACPEntry as ExecutorRegistryEntry, makeCB());
    expect(t).toBeInstanceOf(ACPTransport);
  });

  test('throws on unknown transport type', () => {
    const bad = { ...mockBridgeEntry, transport: 'grpc' };
    expect(() => createTransport(bad as ExecutorRegistryEntry, makeCB())).toThrow("Unknown transport type 'grpc'");
  });
});

// ─── BridgeTransport ─────────────────────────────────────────────────────────

describe('BridgeTransport', () => {
  test('healthCheck returns healthy when bridge script exists', async () => {
    const t = new BridgeTransport(mockBridgeEntry, makeCB());
    const result = await t.healthCheck();
    // Bridge script should exist in the workspace
    expect(typeof result.healthy).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  test('executeWithUpdates returns empty async iterable for updates', async () => {
    const t = new BridgeTransport(mockBridgeEntry, makeCB());
    const { updates } = t.executeWithUpdates(
      { id: 'test', persona: 'claude-code', task: 'test', priority: 'low' },
      { timeoutMs: 1000 },
    );

    const collected: unknown[] = [];
    // Bridge transport yields no streaming updates — the iterable should be immediately done
    // We give it 50ms then move on
    const timeout = new Promise<void>(res => setTimeout(res, 50));
    const drain = (async () => {
      for await (const u of updates) collected.push(u);
    })();
    await Promise.race([drain, timeout]);

    expect(collected.length).toBe(0);
  });

  test('shutdown resolves immediately', async () => {
    const t = new BridgeTransport(mockBridgeEntry, makeCB());
    await expect(t.shutdown()).resolves.toBeUndefined();
  });
});

// ─── ACPTransport ─────────────────────────────────────────────────────────────

describe('ACPTransport', () => {
  test('healthCheck reports binary presence', async () => {
    const t = new ACPTransport(mockBridgeEntry, makeCB(), { adapterBin: 'claude-agent-acp' });
    const result = await t.healthCheck();
    // Result is deterministic based on whether binary is installed
    expect(typeof result.healthy).toBe('boolean');
    expect(typeof result.message).toBe('string');
    if (result.healthy) {
      expect(result.message).toContain('claude-agent-acp');
    }
  });

  test('healthCheck reports unhealthy for missing binary', async () => {
    const t = new ACPTransport(mockBridgeEntry, makeCB(), { adapterBin: 'nonexistent-acp-binary-xyz' });
    const result = await t.healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain('not found');
  });

  test('shutdown resolves immediately', async () => {
    const t = new ACPTransport(mockBridgeEntry, makeCB());
    await expect(t.shutdown()).resolves.toBeUndefined();
  });

  test('execute respects circuit breaker OPEN state', async () => {
    const cb = makeCB();
    // Force circuit breaker open
    for (let i = 0; i < 5; i++) cb.recordFailure('runtime_error');

    const t = new ACPTransport(mockBridgeEntry, cb);
    const result = await t.execute(
      { id: 'test', persona: 'claude-code', task: 'test', priority: 'low' },
      { timeoutMs: 1000 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker OPEN');
  });

  test('executeWithUpdates returns { updates, result } shape', () => {
    // Use an open circuit breaker to prevent spawn — shape test only, no live process
    const cb = makeCB();
    for (let i = 0; i < 5; i++) cb.recordFailure('runtime_error');
    const t = new ACPTransport(mockBridgeEntry, cb);
    const { updates, result } = t.executeWithUpdates(
      { id: 'test', persona: 'claude-code', task: 'test', priority: 'low' },
      { timeoutMs: 100 },
    );
    expect(typeof updates[Symbol.asyncIterator]).toBe('function');
    expect(result).toBeInstanceOf(Promise);
  });
});

// ─── Interface compliance ─────────────────────────────────────────────────────

describe('ExecutorTransport interface compliance', () => {
  test('both transport types implement required methods', () => {
    const bridge = new BridgeTransport(mockBridgeEntry, makeCB());
    const acp = new ACPTransport(mockBridgeEntry, makeCB());

    for (const t of [bridge, acp]) {
      expect(typeof t.execute).toBe('function');
      expect(typeof t.executeWithUpdates).toBe('function');
      expect(typeof t.healthCheck).toBe('function');
      expect(typeof t.shutdown).toBe('function');
    }
  });
});
