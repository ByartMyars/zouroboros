import { describe, test, expect, beforeEach } from 'bun:test';
import {
  recordSuccess,
  recordFailure,
  isAvailable,
  getHealth,
  getRecoveryReport,
  resetHealth,
  resetAllHealth,
  configureCircuitBreaker,
  withRecovery,
  withRecoverySync,
} from '../errors.js';

beforeEach(() => {
  resetAllHealth();
});

describe('recordSuccess', () => {
  test('sets status to healthy', () => {
    recordSuccess('memory');
    expect(getHealth('memory').status).toBe('healthy');
  });

  test('resets consecutive failures', () => {
    recordFailure('memory', 'err');
    recordFailure('memory', 'err');
    recordSuccess('memory');
    expect(getHealth('memory').consecutiveFailures).toBe(0);
  });

  test('increments total successes', () => {
    recordSuccess('memory');
    recordSuccess('memory');
    expect(getHealth('memory').totalSuccesses).toBe(2);
  });

  test('clears circuit open state', () => {
    configureCircuitBreaker('memory', { opensAt: 1 });
    recordFailure('memory', 'err');
    expect(getHealth('memory').circuitOpen).toBe(true);
    recordSuccess('memory');
    expect(getHealth('memory').circuitOpen).toBe(false);
  });
});

describe('recordFailure', () => {
  test('increments consecutive failures', () => {
    recordFailure('ollama', 'timeout');
    recordFailure('ollama', 'timeout');
    expect(getHealth('ollama').consecutiveFailures).toBe(2);
  });

  test('sets status to degraded below threshold', () => {
    recordFailure('ollama', 'err');
    expect(getHealth('ollama').status).toBe('degraded');
  });

  test('opens circuit at threshold', () => {
    configureCircuitBreaker('ollama', { opensAt: 3 });
    recordFailure('ollama', 'err');
    recordFailure('ollama', 'err');
    expect(getHealth('ollama').circuitOpen).toBe(false);
    recordFailure('ollama', 'err');
    expect(getHealth('ollama').circuitOpen).toBe(true);
    expect(getHealth('ollama').status).toBe('unavailable');
  });

  test('records last error message', () => {
    recordFailure('memory', 'disk full');
    expect(getHealth('memory').lastError).toBe('disk full');
  });

  test('increments total failures', () => {
    recordFailure('memory', 'a');
    recordSuccess('memory');
    recordFailure('memory', 'b');
    expect(getHealth('memory').totalFailures).toBe(2);
  });
});

describe('isAvailable', () => {
  test('returns true for new subsystem', () => {
    expect(isAvailable('swarm')).toBe(true);
  });

  test('returns true when healthy', () => {
    recordSuccess('swarm');
    expect(isAvailable('swarm')).toBe(true);
  });

  test('returns false when circuit is open', () => {
    configureCircuitBreaker('swarm', { opensAt: 1, resetMs: 60_000 });
    recordFailure('swarm', 'err');
    expect(isAvailable('swarm')).toBe(false);
  });

  test('allows probe after reset interval (half-open)', () => {
    configureCircuitBreaker('swarm', { opensAt: 1, resetMs: 1 });
    recordFailure('swarm', 'err');
    // Wait for reset
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait 5ms
    expect(isAvailable('swarm')).toBe(true);
  });
});

describe('getHealth', () => {
  test('returns default health for untracked subsystem', () => {
    const health = getHealth('selfheal');
    expect(health.status).toBe('healthy');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.circuitOpen).toBe(false);
  });

  test('returns a copy (not mutable reference)', () => {
    const h1 = getHealth('memory');
    h1.consecutiveFailures = 999;
    expect(getHealth('memory').consecutiveFailures).toBe(0);
  });
});

describe('getRecoveryReport', () => {
  test('returns healthy when no failures', () => {
    recordSuccess('memory');
    recordSuccess('ollama');
    const report = getRecoveryReport();
    expect(report.overallStatus).toBe('healthy');
    expect(report.degradedCapabilities).toEqual([]);
  });

  test('reports degraded status', () => {
    recordFailure('ollama', 'timeout');
    const report = getRecoveryReport();
    expect(report.overallStatus).toBe('degraded');
    expect(report.degradedCapabilities).toContain('vector search');
  });

  test('reports unavailable when circuit open', () => {
    configureCircuitBreaker('memory', { opensAt: 1 });
    recordFailure('memory', 'crash');
    const report = getRecoveryReport();
    expect(report.overallStatus).toBe('unavailable');
    expect(report.degradedCapabilities).toContain('fact storage');
  });

  test('unavailable takes priority over degraded', () => {
    recordFailure('ollama', 'slow'); // degraded
    configureCircuitBreaker('memory', { opensAt: 1 });
    recordFailure('memory', 'crash'); // unavailable
    const report = getRecoveryReport();
    expect(report.overallStatus).toBe('unavailable');
  });
});

describe('resetHealth', () => {
  test('clears single subsystem', () => {
    recordFailure('memory', 'err');
    resetHealth('memory');
    expect(getHealth('memory').totalFailures).toBe(0);
  });
});

describe('configureCircuitBreaker', () => {
  test('sets custom threshold', () => {
    configureCircuitBreaker('swarm', { opensAt: 10 });
    expect(getHealth('swarm').circuitOpensAt).toBe(10);
  });

  test('sets custom reset interval', () => {
    configureCircuitBreaker('swarm', { resetMs: 5000 });
    expect(getHealth('swarm').circuitResetMs).toBe(5000);
  });
});

describe('withRecovery (async)', () => {
  test('returns value on success', async () => {
    const result = await withRecovery('memory', async () => 42, -1);
    expect(result.value).toBe(42);
    expect(result.degraded).toBe(false);
  });

  test('returns fallback on failure', async () => {
    const result = await withRecovery(
      'memory',
      async () => { throw new Error('boom'); },
      -1
    );
    expect(result.value).toBe(-1);
    expect(result.degraded).toBe(true);
  });

  test('returns fallback when circuit open', async () => {
    configureCircuitBreaker('memory', { opensAt: 1, resetMs: 60_000 });
    recordFailure('memory', 'err');

    let called = false;
    const result = await withRecovery(
      'memory',
      async () => { called = true; return 42; },
      -1
    );
    expect(result.value).toBe(-1);
    expect(result.degraded).toBe(true);
    expect(called).toBe(false); // operation was not attempted
  });

  test('records success on successful call', async () => {
    await withRecovery('ollama', async () => 'ok', 'fallback');
    expect(getHealth('ollama').totalSuccesses).toBe(1);
  });

  test('records failure on thrown error', async () => {
    await withRecovery('ollama', async () => { throw new Error('fail'); }, 'fallback');
    expect(getHealth('ollama').totalFailures).toBe(1);
    expect(getHealth('ollama').lastError).toBe('fail');
  });
});

describe('withRecoverySync', () => {
  test('returns value on success', () => {
    const result = withRecoverySync('memory', () => 'hello', 'fallback');
    expect(result.value).toBe('hello');
    expect(result.degraded).toBe(false);
  });

  test('returns fallback on failure', () => {
    const result = withRecoverySync(
      'memory',
      () => { throw new Error('sync boom'); },
      'fallback'
    );
    expect(result.value).toBe('fallback');
    expect(result.degraded).toBe(true);
  });

  test('returns fallback when circuit open', () => {
    configureCircuitBreaker('memory', { opensAt: 1, resetMs: 60_000 });
    recordFailure('memory', 'err');

    const result = withRecoverySync('memory', () => 42, -1);
    expect(result.value).toBe(-1);
    expect(result.degraded).toBe(true);
  });
});
