import { describe, test, expect } from 'bun:test';
import {
  ZOUROBOROS_VERSION,
  DEFAULT_CONFIG,
  DEFAULT_WORKSPACE_ROOT,
  DEFAULT_DATA_DIR,
  DEFAULT_CONFIG_PATH,
  DEFAULT_MEMORY_DB_PATH,
  DEFAULT_OLLAMA_URL,
  DECAY_DAYS,
  COMPLEXITY_THRESHOLDS,
  STATIC_COMBO_MAP,
  VALID_LOG_LEVELS,
  VALID_DECAY_CLASSES,
  VALID_TASK_TYPES,
  DEFAULT_METRIC_THRESHOLDS,
  CIRCUIT_BREAKER_DEFAULTS,
  RETRY_DEFAULTS,
} from '../constants.js';

describe('version constants', () => {
  test('ZOUROBOROS_VERSION matches DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.version).toBe(ZOUROBOROS_VERSION);
  });
});

describe('path constants', () => {
  test('DEFAULT_WORKSPACE_ROOT is absolute', () => {
    expect(DEFAULT_WORKSPACE_ROOT.startsWith('/')).toBe(true);
  });

  test('DEFAULT_DATA_DIR is absolute', () => {
    expect(DEFAULT_DATA_DIR.startsWith('/')).toBe(true);
  });

  test('DEFAULT_CONFIG_PATH is absolute', () => {
    expect(DEFAULT_CONFIG_PATH.startsWith('/')).toBe(true);
  });

  test('DEFAULT_MEMORY_DB_PATH is absolute', () => {
    expect(DEFAULT_MEMORY_DB_PATH.startsWith('/')).toBe(true);
  });
});

describe('decay constants', () => {
  test('permanent decay is Infinity', () => {
    expect(DECAY_DAYS.permanent).toBe(Infinity);
  });

  test('decay values decrease: long > medium > short', () => {
    expect(DECAY_DAYS.long).toBeGreaterThan(DECAY_DAYS.medium);
    expect(DECAY_DAYS.medium).toBeGreaterThan(DECAY_DAYS.short);
  });

  test('all decay values are positive', () => {
    for (const [key, val] of Object.entries(DECAY_DAYS)) {
      expect(val).toBeGreaterThan(0);
    }
  });
});

describe('complexity thresholds', () => {
  test('thresholds are ordered: trivial < simple < moderate < complex', () => {
    expect(COMPLEXITY_THRESHOLDS.trivial).toBeLessThan(COMPLEXITY_THRESHOLDS.simple);
    expect(COMPLEXITY_THRESHOLDS.simple).toBeLessThan(COMPLEXITY_THRESHOLDS.moderate);
    expect(COMPLEXITY_THRESHOLDS.moderate).toBeLessThan(COMPLEXITY_THRESHOLDS.complex);
  });

  test('all tiers have combo mappings', () => {
    for (const tier of Object.keys(COMPLEXITY_THRESHOLDS)) {
      expect(STATIC_COMBO_MAP[tier]).toBeDefined();
    }
  });
});

describe('validation constants', () => {
  test('VALID_LOG_LEVELS has 4 entries', () => {
    expect(VALID_LOG_LEVELS.length).toBe(4);
    expect(VALID_LOG_LEVELS).toContain('debug');
    expect(VALID_LOG_LEVELS).toContain('error');
  });

  test('VALID_DECAY_CLASSES has 4 entries', () => {
    expect(VALID_DECAY_CLASSES.length).toBe(4);
  });

  test('VALID_TASK_TYPES includes common types', () => {
    expect(VALID_TASK_TYPES).toContain('coding');
    expect(VALID_TASK_TYPES).toContain('debugging');
    expect(VALID_TASK_TYPES).toContain('general');
  });
});

describe('DEFAULT_CONFIG structure', () => {
  test('has all required top-level keys', () => {
    expect(DEFAULT_CONFIG.version).toBeDefined();
    expect(DEFAULT_CONFIG.createdAt).toBeDefined();
    expect(DEFAULT_CONFIG.updatedAt).toBeDefined();
    expect(DEFAULT_CONFIG.core).toBeDefined();
    expect(DEFAULT_CONFIG.memory).toBeDefined();
    expect(DEFAULT_CONFIG.swarm).toBeDefined();
    expect(DEFAULT_CONFIG.personas).toBeDefined();
    expect(DEFAULT_CONFIG.selfheal).toBeDefined();
  });

  test('core defaults are sensible', () => {
    expect(DEFAULT_CONFIG.core.logLevel).toBe('info');
    expect(DEFAULT_CONFIG.core.defaultTimezone).toBe('America/Phoenix');
  });

  test('memory defaults are sensible', () => {
    expect(DEFAULT_CONFIG.memory.enabled).toBe(true);
    expect(DEFAULT_CONFIG.memory.vectorEnabled).toBe(true);
    expect(DEFAULT_CONFIG.memory.ollamaUrl).toBe(DEFAULT_OLLAMA_URL);
  });

  test('swarm defaults include circuit breaker and retry', () => {
    expect(DEFAULT_CONFIG.swarm.circuitBreaker).toEqual(CIRCUIT_BREAKER_DEFAULTS);
    expect(DEFAULT_CONFIG.swarm.retryConfig).toEqual(RETRY_DEFAULTS);
  });

  test('selfheal defaults include all metric thresholds', () => {
    expect(DEFAULT_CONFIG.selfheal.metrics).toEqual(DEFAULT_METRIC_THRESHOLDS);
    expect(Object.keys(DEFAULT_CONFIG.selfheal.metrics).length).toBeGreaterThanOrEqual(6);
  });

  test('metric thresholds maintain invariant: critical <= warning <= target', () => {
    for (const [name, metric] of Object.entries(DEFAULT_METRIC_THRESHOLDS)) {
      expect(metric.criticalThreshold).toBeLessThanOrEqual(metric.warningThreshold);
      expect(metric.warningThreshold).toBeLessThanOrEqual(metric.target);
    }
  });

  test('metric weights sum to approximately 1.0', () => {
    const totalWeight = Object.values(DEFAULT_METRIC_THRESHOLDS)
      .reduce((sum, m) => sum + m.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });
});
