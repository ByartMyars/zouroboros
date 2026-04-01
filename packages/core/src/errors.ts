/**
 * Error recovery and graceful degradation for Zouroboros subsystems.
 *
 * Tracks subsystem health, provides circuit-breaker behavior,
 * and enables fallback paths when dependencies are unavailable.
 */

export type SubsystemName = 'memory' | 'ollama' | 'omniroute' | 'swarm' | 'selfheal';

export type SubsystemStatus = 'healthy' | 'degraded' | 'unavailable';

export interface SubsystemHealth {
  name: SubsystemName;
  status: SubsystemStatus;
  lastCheck: string;
  lastError?: string;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  circuitOpen: boolean;
  circuitOpensAt: number; // failure count threshold
  circuitResetMs: number; // ms before half-open retry
  circuitOpenedAt?: number; // epoch ms when circuit opened
}

export interface RecoveryReport {
  timestamp: string;
  subsystems: SubsystemHealth[];
  overallStatus: SubsystemStatus;
  degradedCapabilities: string[];
}

const DEFAULT_CIRCUIT_OPENS_AT = 5;
const DEFAULT_CIRCUIT_RESET_MS = 30_000;

const subsystems = new Map<SubsystemName, SubsystemHealth>();

function getOrCreate(name: SubsystemName): SubsystemHealth {
  if (!subsystems.has(name)) {
    subsystems.set(name, {
      name,
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpen: false,
      circuitOpensAt: DEFAULT_CIRCUIT_OPENS_AT,
      circuitResetMs: DEFAULT_CIRCUIT_RESET_MS,
    });
  }
  return subsystems.get(name)!;
}

/**
 * Record a successful operation for a subsystem.
 */
export function recordSuccess(name: SubsystemName): void {
  const health = getOrCreate(name);
  health.consecutiveFailures = 0;
  health.totalSuccesses++;
  health.status = 'healthy';
  health.lastCheck = new Date().toISOString();
  health.circuitOpen = false;
  health.circuitOpenedAt = undefined;
}

/**
 * Record a failed operation for a subsystem.
 */
export function recordFailure(name: SubsystemName, error: string): void {
  const health = getOrCreate(name);
  health.consecutiveFailures++;
  health.totalFailures++;
  health.lastError = error;
  health.lastCheck = new Date().toISOString();

  if (health.consecutiveFailures >= health.circuitOpensAt) {
    health.circuitOpen = true;
    health.circuitOpenedAt = Date.now();
    health.status = 'unavailable';
  } else {
    health.status = 'degraded';
  }
}

/**
 * Check if a subsystem's circuit breaker allows a call.
 * Returns true if the call should proceed, false if circuit is open.
 * Implements half-open: after resetMs, allows one probe call.
 */
export function isAvailable(name: SubsystemName): boolean {
  const health = getOrCreate(name);

  if (!health.circuitOpen) return true;

  // Half-open check: allow a probe after reset interval
  if (health.circuitOpenedAt) {
    const elapsed = Date.now() - health.circuitOpenedAt;
    if (elapsed >= health.circuitResetMs) {
      return true; // allow probe — caller must recordSuccess/recordFailure
    }
  }

  return false;
}

/**
 * Get the current health of a subsystem.
 */
export function getHealth(name: SubsystemName): SubsystemHealth {
  return { ...getOrCreate(name) };
}

/**
 * Get a full recovery report across all tracked subsystems.
 */
export function getRecoveryReport(): RecoveryReport {
  const all = Array.from(subsystems.values()).map((h) => ({ ...h }));

  const degradedCapabilities: string[] = [];
  let overallStatus: SubsystemStatus = 'healthy';

  for (const h of all) {
    if (h.status === 'unavailable') {
      overallStatus = 'unavailable';
      degradedCapabilities.push(...getDegradedCapabilities(h.name));
    } else if (h.status === 'degraded' && overallStatus !== 'unavailable') {
      overallStatus = 'degraded';
      degradedCapabilities.push(...getDegradedCapabilities(h.name));
    }
  }

  return {
    timestamp: new Date().toISOString(),
    subsystems: all,
    overallStatus,
    degradedCapabilities: [...new Set(degradedCapabilities)],
  };
}

/**
 * Reset a subsystem's health tracking (e.g., after manual recovery).
 */
export function resetHealth(name: SubsystemName): void {
  subsystems.delete(name);
}

/**
 * Reset all subsystem health tracking.
 */
export function resetAllHealth(): void {
  subsystems.clear();
}

/**
 * Configure circuit breaker thresholds for a subsystem.
 */
export function configureCircuitBreaker(
  name: SubsystemName,
  options: { opensAt?: number; resetMs?: number }
): void {
  const health = getOrCreate(name);
  if (options.opensAt !== undefined) health.circuitOpensAt = options.opensAt;
  if (options.resetMs !== undefined) health.circuitResetMs = options.resetMs;
}

/**
 * Wrap an async operation with error recovery.
 * Records success/failure and returns fallback value when circuit is open.
 */
export async function withRecovery<T>(
  name: SubsystemName,
  operation: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; degraded: boolean }> {
  if (!isAvailable(name)) {
    return { value: fallback, degraded: true };
  }

  try {
    const value = await operation();
    recordSuccess(name);
    return { value, degraded: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFailure(name, message);
    return { value: fallback, degraded: true };
  }
}

/**
 * Wrap a synchronous operation with error recovery.
 */
export function withRecoverySync<T>(
  name: SubsystemName,
  operation: () => T,
  fallback: T,
): { value: T; degraded: boolean } {
  if (!isAvailable(name)) {
    return { value: fallback, degraded: true };
  }

  try {
    const value = operation();
    recordSuccess(name);
    return { value, degraded: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFailure(name, message);
    return { value: fallback, degraded: true };
  }
}

function getDegradedCapabilities(name: SubsystemName): string[] {
  const map: Record<SubsystemName, string[]> = {
    memory: ['fact storage', 'episodic memory', 'memory search'],
    ollama: ['vector search', 'semantic similarity', 'HyDE expansion'],
    omniroute: ['intelligent routing', 'complexity analysis'],
    swarm: ['multi-agent orchestration', 'DAG execution'],
    selfheal: ['auto-introspection', 'self-improvement'],
  };
  return map[name] ?? [];
}
