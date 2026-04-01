import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  loadConfig,
  saveConfig,
  validateConfig,
  mergeConfig,
  createBackup,
  restoreBackup,
  listBackups,
  pruneBackups,
  validateConfigSchema,
  DEFAULT_CONFIG,
} from '../../index.js';
import type { ZouroborosConfig } from '../../types.js';

const TEST_DIR = '/tmp/zouroboros-integration-config';

function setupTestEnvironment(): { config: ZouroborosConfig; configPath: string } {
  const dataDir = join(TEST_DIR, 'data');
  const configDir = join(TEST_DIR, 'config');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  const configPath = join(configDir, 'config.json');
  const config = structuredClone(DEFAULT_CONFIG);
  config.core.dataDir = TEST_DIR;
  config.memory.dbPath = join(dataDir, 'memory.db');
  config.swarm.registryPath = join(dataDir, 'executor-registry.json');
  // Infinity becomes null in JSON, so use finite values for round-trip tests
  config.memory.decayConfig.permanent = 99999;

  // Create realistic test data
  writeFileSync(config.memory.dbPath, 'SQLite format 3\x00test-db-content-v1');
  writeFileSync(config.swarm.registryPath, JSON.stringify({ version: '1.0', executors: { 'claude-code': {} } }));
  saveConfig(config, configPath);

  return { config, configPath };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('Config → Backup → Corrupt → Restore round-trip', () => {
  test('full lifecycle preserves data integrity', () => {
    const { config, configPath } = setupTestEnvironment();

    // 1. Verify initial config is valid
    const issues = validateConfigSchema(config);
    expect(issues).toBeNull();

    // 2. Create backup
    const backup = createBackup({ config, configPath, label: 'pre-upgrade' });
    expect(backup.manifest.files.length).toBe(3); // db + config + registry

    // 3. Simulate corruption: modify DB and config
    writeFileSync(config.memory.dbPath, 'CORRUPTED DATA');
    const corruptedConfig = structuredClone(config);
    corruptedConfig.core.logLevel = 'debug';
    corruptedConfig.swarm.maxConcurrency = 99;
    saveConfig(corruptedConfig, configPath);

    // 4. Verify corruption happened
    expect(readFileSync(config.memory.dbPath, 'utf-8')).toBe('CORRUPTED DATA');
    const loadedCorrupted = loadConfig(configPath);
    expect(loadedCorrupted.core.logLevel).toBe('debug');

    // 5. Restore from backup
    const result = restoreBackup(backup.backupDir);
    expect(result.restoredFiles.length).toBe(3);
    expect(result.skippedFiles.length).toBe(0);

    // 6. Verify restored data matches original
    const restoredDb = readFileSync(config.memory.dbPath, 'utf-8');
    expect(restoredDb).toContain('test-db-content-v1');

    const restoredConfig = loadConfig(configPath);
    expect(restoredConfig.core.logLevel).toBe('info');
    expect(restoredConfig.swarm.maxConcurrency).toBe(DEFAULT_CONFIG.swarm.maxConcurrency);
  });

  test('dry-run restore does not modify any files', () => {
    const { config, configPath } = setupTestEnvironment();
    const backup = createBackup({ config, configPath });

    writeFileSync(config.memory.dbPath, 'CORRUPTED');

    const result = restoreBackup(backup.backupDir, { dryRun: true });
    expect(result.restoredFiles.length).toBeGreaterThan(0);

    // Files should still be corrupted
    expect(readFileSync(config.memory.dbPath, 'utf-8')).toBe('CORRUPTED');
  });

  test('skip-config restores DB but keeps current config', () => {
    const { config, configPath } = setupTestEnvironment();
    const backup = createBackup({ config, configPath });

    // Modify config and corrupt DB
    const newConfig = structuredClone(config);
    newConfig.core.logLevel = 'error';
    saveConfig(newConfig, configPath);
    writeFileSync(config.memory.dbPath, 'CORRUPTED');

    const result = restoreBackup(backup.backupDir, { skipConfig: true });

    // DB should be restored
    expect(readFileSync(config.memory.dbPath, 'utf-8')).toContain('test-db-content-v1');
    // Config should still have the new value
    const loaded = loadConfig(configPath);
    expect(loaded.core.logLevel).toBe('error');
  });
});

describe('Config merge → validate → save → load cycle', () => {
  test('partial config merge preserves defaults and validates', () => {
    const partial = {
      core: { logLevel: 'debug' as const },
      swarm: { maxConcurrency: 10 },
    };
    const merged = mergeConfig(partial as any);

    // Merged config should be valid
    const validated = validateConfig(merged);
    expect(validated.core.logLevel).toBe('debug');
    expect(validated.swarm.maxConcurrency).toBe(10);
    expect(validated.memory.enabled).toBe(true); // default preserved
    expect(validated.selfheal.governorEnabled).toBe(true); // default preserved
  });

  test('save → load round-trip preserves all values', () => {
    const configPath = join(TEST_DIR, 'roundtrip.json');
    const config = structuredClone(DEFAULT_CONFIG);
    config.core.logLevel = 'warn';
    config.memory.captureIntervalMinutes = 15;
    config.swarm.circuitBreaker.failureThreshold = 10;

    saveConfig(config, configPath);
    const loaded = loadConfig(configPath);

    expect(loaded.core.logLevel).toBe('warn');
    expect(loaded.memory.captureIntervalMinutes).toBe(15);
    expect(loaded.swarm.circuitBreaker.failureThreshold).toBe(10);
  });
});

describe('Backup rotation under load', () => {
  test('creates multiple backups and prunes correctly', () => {
    const { config, configPath } = setupTestEnvironment();

    // Create 7 backups
    for (let i = 0; i < 7; i++) {
      createBackup({ config, configPath, label: `v${i}` });
    }

    expect(listBackups(config).length).toBe(7);

    // Prune to 3
    const pruned = pruneBackups(config, 3);
    expect(pruned).toBe(4);

    const remaining = listBackups(config);
    expect(remaining.length).toBe(3);

    // Newest backups should survive
    expect(remaining[0].name).toContain('v6');
    expect(remaining[1].name).toContain('v5');
    expect(remaining[2].name).toContain('v4');

    // Can still restore from surviving backup
    writeFileSync(config.memory.dbPath, 'CORRUPTED');
    const result = restoreBackup(remaining[0].path);
    expect(result.restoredFiles.length).toBeGreaterThan(0);
    expect(readFileSync(config.memory.dbPath, 'utf-8')).toContain('test-db-content-v1');
  });
});
