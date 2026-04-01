import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  createBackup,
  restoreBackup,
  listBackups,
  pruneBackups,
  getBackupDir,
  formatBytes,
} from '../backup.js';
import { DEFAULT_CONFIG } from '../constants.js';
import type { ZouroborosConfig } from '../types.js';

const TEST_DIR = '/tmp/zouroboros-backup-test';

function makeTestConfig(): { config: ZouroborosConfig; configPath: string } {
  const dataDir = join(TEST_DIR, 'data');
  const configDir = join(TEST_DIR, 'config');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  const configPath = join(configDir, 'config.json');
  const config: ZouroborosConfig = {
    ...DEFAULT_CONFIG,
    core: { ...DEFAULT_CONFIG.core, dataDir: TEST_DIR },
    memory: { ...DEFAULT_CONFIG.memory, dbPath: join(dataDir, 'memory.db') },
    swarm: { ...DEFAULT_CONFIG.swarm, registryPath: join(dataDir, 'executor-registry.json') },
  };

  writeFileSync(config.memory.dbPath, 'test-db-data-here');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

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

describe('getBackupDir', () => {
  test('uses config dataDir', () => {
    const config = { ...DEFAULT_CONFIG, core: { ...DEFAULT_CONFIG.core, dataDir: '/custom/data' } };
    expect(getBackupDir(config)).toBe('/custom/data/backups');
  });

  test('falls back to default when no config', () => {
    const dir = getBackupDir();
    expect(dir).toContain('backups');
  });
});

describe('createBackup', () => {
  test('creates backup with manifest', () => {
    const { config, configPath } = makeTestConfig();
    const result = createBackup({ config, configPath });

    expect(existsSync(result.backupDir)).toBe(true);
    expect(existsSync(join(result.backupDir, 'manifest.json'))).toBe(true);
    expect(result.manifest.files.length).toBeGreaterThanOrEqual(2); // db + config
    expect(result.totalSizeBytes).toBeGreaterThan(0);
  });

  test('includes memory db in backup', () => {
    const { config, configPath } = makeTestConfig();
    const result = createBackup({ config, configPath });

    const dbFile = result.manifest.files.find((f) => f.name === 'memory.db');
    expect(dbFile).toBeDefined();
    expect(dbFile!.sizeBytes).toBeGreaterThan(0);
  });

  test('includes config.json in backup', () => {
    const { config, configPath } = makeTestConfig();
    const result = createBackup({ config, configPath });

    const configFile = result.manifest.files.find((f) => f.name === 'config.json');
    expect(configFile).toBeDefined();
  });

  test('uses label in directory name', () => {
    const { config, configPath } = makeTestConfig();
    const result = createBackup({ config, configPath, label: 'pre-migration' });

    expect(result.backupDir).toContain('pre-migration');
  });

  test('backs up WAL file if present', () => {
    const { config, configPath } = makeTestConfig();
    writeFileSync(config.memory.dbPath + '-wal', 'wal-data');

    const result = createBackup({ config, configPath });
    const walFile = result.manifest.files.find((f) => f.name === 'memory.db-wal');
    expect(walFile).toBeDefined();
  });

  test('backs up executor registry if present', () => {
    const { config, configPath } = makeTestConfig();
    writeFileSync(config.swarm.registryPath, JSON.stringify({ executors: {} }));

    const result = createBackup({ config, configPath });
    const regFile = result.manifest.files.find((f) => f.name === 'executor-registry.json');
    expect(regFile).toBeDefined();
  });
});

describe('restoreBackup', () => {
  test('restores files to original locations', () => {
    const { config, configPath } = makeTestConfig();
    const backup = createBackup({ config, configPath });

    // Corrupt the original DB
    writeFileSync(config.memory.dbPath, 'corrupted');

    const result = restoreBackup(backup.backupDir);
    expect(result.restoredFiles.length).toBeGreaterThan(0);

    // Verify restored content
    const restored = readFileSync(config.memory.dbPath, 'utf-8');
    expect(restored).toBe('test-db-data-here');
  });

  test('dry run does not modify files', () => {
    const { config, configPath } = makeTestConfig();
    const backup = createBackup({ config, configPath });

    writeFileSync(config.memory.dbPath, 'corrupted');

    const result = restoreBackup(backup.backupDir, { dryRun: true });
    expect(result.restoredFiles.length).toBeGreaterThan(0);

    // File should still be corrupted
    const content = readFileSync(config.memory.dbPath, 'utf-8');
    expect(content).toBe('corrupted');
  });

  test('skip-config omits config.json', () => {
    const { config, configPath } = makeTestConfig();
    const backup = createBackup({ config, configPath });

    const result = restoreBackup(backup.backupDir, { skipConfig: true });
    expect(result.skippedFiles.some((f) => f.includes('config.json'))).toBe(true);
  });

  test('throws on missing manifest', () => {
    expect(() => restoreBackup('/tmp/nonexistent-backup')).toThrow('No manifest.json');
  });

  test('skips files missing from backup dir', () => {
    const { config, configPath } = makeTestConfig();
    const backup = createBackup({ config, configPath });

    // Remove DB from backup
    rmSync(join(backup.backupDir, 'memory.db'));

    const result = restoreBackup(backup.backupDir);
    expect(result.skippedFiles.some((f) => f.includes('missing from backup'))).toBe(true);
  });
});

describe('listBackups', () => {
  test('returns empty array when no backups', () => {
    const config = { ...DEFAULT_CONFIG, core: { ...DEFAULT_CONFIG.core, dataDir: TEST_DIR } };
    const backups = listBackups(config);
    expect(backups).toEqual([]);
  });

  test('lists backups sorted newest first', () => {
    const { config, configPath } = makeTestConfig();

    createBackup({ config, configPath, label: 'first' });
    // Small delay to ensure different timestamps
    createBackup({ config, configPath, label: 'second' });

    const backups = listBackups(config);
    expect(backups.length).toBe(2);
    expect(backups[0].name).toContain('second');
    expect(backups[1].name).toContain('first');
  });

  test('includes size and file count', () => {
    const { config, configPath } = makeTestConfig();
    createBackup({ config, configPath });

    const backups = listBackups(config);
    expect(backups[0].sizeBytes).toBeGreaterThan(0);
    expect(backups[0].fileCount).toBeGreaterThanOrEqual(2);
  });
});

describe('pruneBackups', () => {
  test('prunes old backups beyond keep limit', () => {
    const { config, configPath } = makeTestConfig();

    for (let i = 0; i < 5; i++) {
      createBackup({ config, configPath, label: `b${i}` });
    }

    expect(listBackups(config).length).toBe(5);

    const pruned = pruneBackups(config, 2);
    expect(pruned).toBe(3);
    expect(listBackups(config).length).toBe(2);
  });

  test('does nothing when under keep limit', () => {
    const { config, configPath } = makeTestConfig();
    createBackup({ config, configPath });

    const pruned = pruneBackups(config, 10);
    expect(pruned).toBe(0);
  });
});

describe('formatBytes', () => {
  test('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  test('formats with decimals', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});
