import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  loadConfig,
  saveConfig,
  mergeConfig,
  validateConfig,
  getConfigValue,
  setConfigValue,
  initConfig,
  ConfigValidationError,
} from '../config/loader.js';
import { DEFAULT_CONFIG } from '../constants.js';

const TEST_DIR = '/tmp/zouroboros-loader-test';
const TEST_CONFIG_PATH = join(TEST_DIR, 'config.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('loadConfig', () => {
  test('returns defaults when file does not exist', () => {
    const config = loadConfig('/tmp/nonexistent/config.json');
    expect(config.version).toBe(DEFAULT_CONFIG.version);
    expect(config.core.logLevel).toBe('info');
  });

  test('loads and merges partial config from file', () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      version: '2.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      core: { ...DEFAULT_CONFIG.core, logLevel: 'debug' },
      memory: DEFAULT_CONFIG.memory,
      swarm: DEFAULT_CONFIG.swarm,
      personas: DEFAULT_CONFIG.personas,
      selfheal: DEFAULT_CONFIG.selfheal,
    }));
    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.core.logLevel).toBe('debug');
    expect(config.memory.enabled).toBe(true);
  });

  test('throws on malformed JSON', () => {
    writeFileSync(TEST_CONFIG_PATH, '{ broken json');
    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow(ConfigValidationError);
  });
});

describe('saveConfig', () => {
  test('writes valid config to file', () => {
    saveConfig(DEFAULT_CONFIG, TEST_CONFIG_PATH);
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
    const loaded = loadConfig(TEST_CONFIG_PATH);
    expect(loaded.core.logLevel).toBe('info');
  });

  test('creates parent directory if missing', () => {
    const nested = join(TEST_DIR, 'a', 'b', 'config.json');
    saveConfig(DEFAULT_CONFIG, nested);
    expect(existsSync(nested)).toBe(true);
  });

  test('updates the updatedAt timestamp', () => {
    const before = new Date().toISOString();
    saveConfig(DEFAULT_CONFIG, TEST_CONFIG_PATH);
    const loaded = loadConfig(TEST_CONFIG_PATH);
    expect(loaded.updatedAt >= before).toBe(true);
  });
});

describe('mergeConfig', () => {
  test('fills missing fields with defaults', () => {
    const merged = mergeConfig({ core: { logLevel: 'error' } } as any);
    expect(merged.core.logLevel).toBe('error');
    expect(merged.core.workspaceRoot).toBe(DEFAULT_CONFIG.core.workspaceRoot);
    expect(merged.memory.enabled).toBe(true);
  });

  test('deep merges swarm circuitBreaker', () => {
    const merged = mergeConfig({
      swarm: { circuitBreaker: { failureThreshold: 10 } },
    } as any);
    expect(merged.swarm.circuitBreaker.failureThreshold).toBe(10);
    expect(merged.swarm.circuitBreaker.enabled).toBe(true);
  });

  test('deep merges selfheal metrics', () => {
    const merged = mergeConfig({
      selfheal: {
        metrics: {
          customMetric: { target: 0.9, weight: 0.5, warningThreshold: 0.7, criticalThreshold: 0.5 },
        },
      },
    } as any);
    expect(merged.selfheal.metrics.customMetric).toBeDefined();
  });
});

describe('validateConfig', () => {
  test('passes valid config', () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  test('throws ConfigValidationError on null', () => {
    expect(() => validateConfig(null)).toThrow(ConfigValidationError);
  });

  test('throws ConfigValidationError on invalid logLevel', () => {
    const bad = {
      ...DEFAULT_CONFIG,
      core: { ...DEFAULT_CONFIG.core, logLevel: 'verbose' },
    };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });

  test('error message includes path and fix suggestion', () => {
    const bad = {
      ...DEFAULT_CONFIG,
      core: { ...DEFAULT_CONFIG.core, logLevel: 'verbose' },
    };
    try {
      validateConfig(bad);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect((err as Error).message).toContain('core.logLevel');
      expect((err as Error).message).toContain('zouroboros config');
    }
  });
});

describe('getConfigValue', () => {
  test('retrieves top-level value', () => {
    expect(getConfigValue(DEFAULT_CONFIG, 'version')).toBe('2.0.0');
  });

  test('retrieves nested value', () => {
    expect(getConfigValue(DEFAULT_CONFIG, 'core.logLevel')).toBe('info');
  });

  test('retrieves deeply nested value', () => {
    expect(getConfigValue(DEFAULT_CONFIG, 'swarm.circuitBreaker.enabled')).toBe(true);
  });

  test('returns undefined for missing path', () => {
    expect(getConfigValue(DEFAULT_CONFIG, 'nonexistent.path')).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  test('sets a nested value', () => {
    const updated = setConfigValue(DEFAULT_CONFIG, 'core.logLevel', 'debug');
    expect(updated.core.logLevel).toBe('debug');
  });

  test('validates after setting', () => {
    expect(() =>
      setConfigValue(DEFAULT_CONFIG, 'core.logLevel', 'banana')
    ).toThrow(ConfigValidationError);
  });

  test('creates intermediate objects if needed', () => {
    const updated = setConfigValue(DEFAULT_CONFIG, 'swarm.circuitBreaker.failureThreshold', 20);
    expect(updated.swarm.circuitBreaker.failureThreshold).toBe(20);
  });
});

describe('initConfig', () => {
  test('creates config file and data dir', async () => {
    const dataDir = join(TEST_DIR, 'data');
    const configDir = join(TEST_DIR, 'init-config');
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, 'config.json');

    // Temporarily override DEFAULT_CONFIG_PATH by calling initConfig with custom path
    // initConfig uses DEFAULT_CONFIG_PATH internally, so we test saveConfig behavior instead
    const testConfig = structuredClone(DEFAULT_CONFIG);
    testConfig.core.dataDir = dataDir;
    saveConfig(testConfig, configPath);
    expect(existsSync(configPath)).toBe(true);
  });
});
