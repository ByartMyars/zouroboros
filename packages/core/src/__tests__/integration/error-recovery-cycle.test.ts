import { describe, test, expect, beforeEach } from 'bun:test';
import {
  recordSuccess,
  recordFailure,
  isAvailable,
  getHealth,
  getRecoveryReport,
  resetAllHealth,
  configureCircuitBreaker,
  withRecovery,
  withRecoverySync,
} from '../../errors.js';
import type { SubsystemName } from '../../errors.js';

beforeEach(() => {
  resetAllHealth();
});

describe('Degradation → Recovery cycle', () => {
  test('subsystem degrades under failures and recovers on success', () => {
    // Phase 1: Healthy
    recordSuccess('memory');
    expect(getHealth('memory').status).toBe('healthy');
    expect(isAvailable('memory')).toBe(true);

    // Phase 2: Degraded (failures below threshold)
    recordFailure('memory', 'timeout');
    recordFailure('memory', 'timeout');
    expect(getHealth('memory').status).toBe('degraded');
    expect(isAvailable('memory')).toBe(true); // still allows calls

    // Phase 3: Unavailable (circuit opens)
    configureCircuitBreaker('memory', { opensAt: 3, resetMs: 50 });
    recordFailure('memory', 'crash');
    expect(getHealth('memory').status).toBe('unavailable');
    expect(getHealth('memory').circuitOpen).toBe(true);
    expect(isAvailable('memory')).toBe(false);

    // Phase 4: Half-open (wait for reset)
    const start = Date.now();
    while (Date.now() - start < 60) {} // wait 60ms
    expect(isAvailable('memory')).toBe(true); // probe allowed

    // Phase 5: Recovery on successful probe
    recordSuccess('memory');
    expect(getHealth('memory').status).toBe('healthy');
    expect(getHealth('memory').circuitOpen).toBe(false);
    expect(getHealth('memory').consecutiveFailures).toBe(0);
  });

  test('half-open probe failure re-opens circuit', () => {
    configureCircuitBreaker('ollama', { opensAt: 1, resetMs: 10 });
    recordFailure('ollama', 'down');
    expect(isAvailable('ollama')).toBe(false);

    // Wait for half-open
    const start = Date.now();
    while (Date.now() - start < 15) {}
    expect(isAvailable('ollama')).toBe(true);

    // Probe fails
    recordFailure('ollama', 'still down');
    expect(getHealth('ollama').circuitOpen).toBe(true);
    expect(getHealth('ollama').status).toBe('unavailable');
  });
});

describe('Multi-subsystem degradation', () => {
  test('report reflects independent subsystem states', () => {
    recordSuccess('memory');
    recordFailure('ollama', 'timeout');
    configureCircuitBreaker('swarm', { opensAt: 1 });
    recordFailure('swarm', 'crash');

    const report = getRecoveryReport();
    expect(report.overallStatus).toBe('unavailable'); // worst-case wins

    const memHealth = report.subsystems.find(s => s.name === 'memory');
    const ollamaHealth = report.subsystems.find(s => s.name === 'ollama');
    const swarmHealth = report.subsystems.find(s => s.name === 'swarm');

    expect(memHealth?.status).toBe('healthy');
    expect(ollamaHealth?.status).toBe('degraded');
    expect(swarmHealth?.status).toBe('unavailable');

    expect(report.degradedCapabilities).toContain('vector search');
    expect(report.degradedCapabilities).toContain('multi-agent orchestration');
    expect(report.degradedCapabilities).not.toContain('fact storage');
  });

  test('system recovers to healthy when all subsystems recover', () => {
    recordFailure('memory', 'err');
    recordFailure('ollama', 'err');
    expect(getRecoveryReport().overallStatus).toBe('degraded');

    recordSuccess('memory');
    recordSuccess('ollama');
    expect(getRecoveryReport().overallStatus).toBe('healthy');
    expect(getRecoveryReport().degradedCapabilities).toEqual([]);
  });
});

describe('withRecovery integration scenarios', () => {
  test('cascading failures trigger circuit breaker via withRecovery', async () => {
    configureCircuitBreaker('ollama', { opensAt: 3, resetMs: 60_000 });

    const failingOp = async () => { throw new Error('connection refused'); };

    // 3 failures should open circuit
    await withRecovery('ollama', failingOp, null);
    await withRecovery('ollama', failingOp, null);
    await withRecovery('ollama', failingOp, null);

    expect(getHealth('ollama').circuitOpen).toBe(true);

    // 4th call should not even attempt the operation
    let attempted = false;
    const result = await withRecovery(
      'ollama',
      async () => { attempted = true; return 'should not run'; },
      'fallback'
    );
    expect(attempted).toBe(false);
    expect(result.value).toBe('fallback');
    expect(result.degraded).toBe(true);
  });

  test('sync recovery works for DB operations', () => {
    let callCount = 0;

    const result1 = withRecoverySync(
      'memory',
      () => { callCount++; return 'data'; },
      'cached-fallback'
    );
    expect(result1.value).toBe('data');
    expect(result1.degraded).toBe(false);
    expect(callCount).toBe(1);

    // Simulate DB failure
    const result2 = withRecoverySync(
      'memory',
      () => { throw new Error('SQLITE_BUSY'); },
      'cached-fallback'
    );
    expect(result2.value).toBe('cached-fallback');
    expect(result2.degraded).toBe(true);
    expect(getHealth('memory').lastError).toBe('SQLITE_BUSY');
  });

  test('mixed async subsystems degrade independently', async () => {
    const ollamaResult = await withRecovery(
      'ollama',
      async () => { throw new Error('model not loaded'); },
      [] as number[]
    );
    expect(ollamaResult.degraded).toBe(true);

    const memResult = withRecoverySync(
      'memory',
      () => ({ facts: 42 }),
      { facts: 0 }
    );
    expect(memResult.degraded).toBe(false);
    expect(memResult.value.facts).toBe(42);

    // Memory healthy, ollama degraded
    expect(getHealth('memory').status).toBe('healthy');
    expect(getHealth('ollama').status).toBe('degraded');
  });
});

describe('Error tracking accuracy', () => {
  test('total counts accumulate correctly across recovery cycles', () => {
    // Cycle 1: 3 failures, 1 success
    recordFailure('memory', 'a');
    recordFailure('memory', 'b');
    recordFailure('memory', 'c');
    recordSuccess('memory');

    // Cycle 2: 2 failures, 1 success
    recordFailure('memory', 'd');
    recordFailure('memory', 'e');
    recordSuccess('memory');

    const health = getHealth('memory');
    expect(health.totalFailures).toBe(5);
    expect(health.totalSuccesses).toBe(2);
    expect(health.consecutiveFailures).toBe(0); // reset by last success
    expect(health.status).toBe('healthy');
  });
});
