import { describe, test, expect } from 'bun:test';
import {
  validateConfigSchema,
  formatValidationErrors,
  ZouroborosConfigSchema,
  CoreConfigSchema,
  MemoryConfigSchema,
  SwarmConfigSchema,
  PersonasConfigSchema,
  SelfHealConfigSchema,
} from '../config/schema.js';
import { DEFAULT_CONFIG } from '../constants.js';

describe('ZouroborosConfigSchema', () => {
  test('accepts valid default config', () => {
    const issues = validateConfigSchema(DEFAULT_CONFIG);
    expect(issues).toBeNull();
  });

  test('rejects null config', () => {
    const result = ZouroborosConfigSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  test('rejects empty object', () => {
    const issues = validateConfigSchema({});
    expect(issues).not.toBeNull();
    expect(issues!.length).toBeGreaterThan(0);
  });

  test('rejects config with missing version', () => {
    const bad = { ...DEFAULT_CONFIG, version: '' };
    const issues = validateConfigSchema(bad);
    expect(issues).not.toBeNull();
  });
});

describe('CoreConfigSchema', () => {
  test('accepts valid core config', () => {
    const result = CoreConfigSchema.safeParse(DEFAULT_CONFIG.core);
    expect(result.success).toBe(true);
  });

  test('rejects invalid logLevel', () => {
    const result = CoreConfigSchema.safeParse({
      ...DEFAULT_CONFIG.core,
      logLevel: 'banana',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('debug, info, warn, error');
    }
  });

  test('rejects relative workspace path', () => {
    const result = CoreConfigSchema.safeParse({
      ...DEFAULT_CONFIG.core,
      workspaceRoot: 'relative/path',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty timezone', () => {
    const result = CoreConfigSchema.safeParse({
      ...DEFAULT_CONFIG.core,
      defaultTimezone: '',
    });
    expect(result.success).toBe(false);
  });

  test('accepts all valid log levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const result = CoreConfigSchema.safeParse({
        ...DEFAULT_CONFIG.core,
        logLevel: level,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('MemoryConfigSchema', () => {
  test('accepts valid memory config', () => {
    const result = MemoryConfigSchema.safeParse(DEFAULT_CONFIG.memory);
    expect(result.success).toBe(true);
  });

  test('rejects non-URL ollamaUrl', () => {
    const result = MemoryConfigSchema.safeParse({
      ...DEFAULT_CONFIG.memory,
      ollamaUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('rejects zero captureIntervalMinutes', () => {
    const result = MemoryConfigSchema.safeParse({
      ...DEFAULT_CONFIG.memory,
      captureIntervalMinutes: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative capture interval', () => {
    const result = MemoryConfigSchema.safeParse({
      ...DEFAULT_CONFIG.memory,
      captureIntervalMinutes: -5,
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty model name', () => {
    const result = MemoryConfigSchema.safeParse({
      ...DEFAULT_CONFIG.memory,
      ollamaModel: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty dbPath', () => {
    const result = MemoryConfigSchema.safeParse({
      ...DEFAULT_CONFIG.memory,
      dbPath: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('SwarmConfigSchema', () => {
  test('accepts valid swarm config', () => {
    const result = SwarmConfigSchema.safeParse(DEFAULT_CONFIG.swarm);
    expect(result.success).toBe(true);
  });

  test('rejects negative maxConcurrency', () => {
    const result = SwarmConfigSchema.safeParse({
      ...DEFAULT_CONFIG.swarm,
      maxConcurrency: -1,
    });
    expect(result.success).toBe(false);
  });

  test('rejects zero localConcurrency', () => {
    const result = SwarmConfigSchema.safeParse({
      ...DEFAULT_CONFIG.swarm,
      localConcurrency: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects fractional maxRetries', () => {
    const result = SwarmConfigSchema.safeParse({
      ...DEFAULT_CONFIG.swarm,
      retryConfig: { ...DEFAULT_CONFIG.swarm.retryConfig, maxRetries: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  test('accepts zero maxRetries', () => {
    const result = SwarmConfigSchema.safeParse({
      ...DEFAULT_CONFIG.swarm,
      retryConfig: { ...DEFAULT_CONFIG.swarm.retryConfig, maxRetries: 0 },
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty defaultCombo', () => {
    const result = SwarmConfigSchema.safeParse({
      ...DEFAULT_CONFIG.swarm,
      defaultCombo: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('PersonasConfigSchema', () => {
  test('accepts valid personas config', () => {
    const result = PersonasConfigSchema.safeParse(DEFAULT_CONFIG.personas);
    expect(result.success).toBe(true);
  });

  test('rejects relative identityDir', () => {
    const result = PersonasConfigSchema.safeParse({
      ...DEFAULT_CONFIG.personas,
      identityDir: 'relative/IDENTITY',
    });
    expect(result.success).toBe(false);
  });
});

describe('SelfHealConfigSchema', () => {
  test('accepts valid selfheal config', () => {
    const result = SelfHealConfigSchema.safeParse(DEFAULT_CONFIG.selfheal);
    expect(result.success).toBe(true);
  });

  test('rejects invalid cron expression', () => {
    const result = SelfHealConfigSchema.safeParse({
      ...DEFAULT_CONFIG.selfheal,
      introspectionInterval: 'every day',
    });
    expect(result.success).toBe(false);
  });

  test('rejects minHealthScore > 100', () => {
    const result = SelfHealConfigSchema.safeParse({
      ...DEFAULT_CONFIG.selfheal,
      minHealthScore: 150,
    });
    expect(result.success).toBe(false);
  });

  test('rejects metric where critical > warning', () => {
    const result = SelfHealConfigSchema.safeParse({
      ...DEFAULT_CONFIG.selfheal,
      metrics: {
        badMetric: {
          target: 0.9,
          weight: 0.5,
          warningThreshold: 0.5,
          criticalThreshold: 0.8, // higher than warning
        },
      },
    });
    expect(result.success).toBe(false);
  });

  test('rejects metric where warning > target', () => {
    const result = SelfHealConfigSchema.safeParse({
      ...DEFAULT_CONFIG.selfheal,
      metrics: {
        badMetric: {
          target: 0.5,
          weight: 0.5,
          warningThreshold: 0.8, // higher than target
          criticalThreshold: 0.3,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  test('accepts valid cron expressions', () => {
    const crons = ['0 5 * * *', '*/15 * * * *', '0 0 1 * *', '30 2 * * 1-5'];
    for (const cron of crons) {
      const result = SelfHealConfigSchema.safeParse({
        ...DEFAULT_CONFIG.selfheal,
        introspectionInterval: cron,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('formatValidationErrors', () => {
  test('formats single error', () => {
    const output = formatValidationErrors([
      { path: 'core.logLevel', message: 'Must be one of: debug, info, warn, error' },
    ]);
    expect(output).toContain('core.logLevel');
    expect(output).toContain('Must be one of');
    expect(output).toContain('zouroboros config');
  });

  test('formats multiple errors', () => {
    const output = formatValidationErrors([
      { path: 'core.logLevel', message: 'Invalid' },
      { path: 'memory.dbPath', message: 'Required' },
    ]);
    expect(output).toContain('core.logLevel');
    expect(output).toContain('memory.dbPath');
  });

  test('handles empty path', () => {
    const output = formatValidationErrors([
      { path: '', message: 'Root error' },
    ]);
    expect(output).toContain('(root)');
  });
});
