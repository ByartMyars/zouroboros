import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  validateConfig,
  validateConfigSchema,
  mergeConfig,
  DEFAULT_CONFIG,
  createBackup,
  listBackups,
  createMigrationRunner,
  MIGRATIONS,
  recordSuccess,
  recordFailure,
  isAvailable,
  getRecoveryReport,
  resetAllHealth,
  withRecoverySync,
  configureCircuitBreaker,
} from '../../index.js';

const BENCH_DIR = '/tmp/zouroboros-bench';

function measure(name: string, fn: () => void, iterations: number = 1000): { avgMs: number; p99Ms: number; opsPerSec: number } {
  const times: number[] = [];
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
  const p99Ms = times[Math.floor(times.length * 0.99)];
  const opsPerSec = 1000 / avgMs;

  return { avgMs, p99Ms, opsPerSec };
}

async function measureAsync(name: string, fn: () => Promise<void>, iterations: number = 100): Promise<{ avgMs: number; p99Ms: number; opsPerSec: number }> {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
  const p99Ms = times[Math.floor(times.length * 0.99)];
  const opsPerSec = 1000 / avgMs;

  return { avgMs, p99Ms, opsPerSec };
}

beforeEach(() => {
  resetAllHealth();
  mkdirSync(BENCH_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(BENCH_DIR)) {
    rmSync(BENCH_DIR, { recursive: true, force: true });
  }
});

describe('Config validation performance', () => {
  test('Zod schema validation < 1ms average', () => {
    const result = measure('validateConfigSchema', () => {
      validateConfigSchema(DEFAULT_CONFIG);
    });

    console.log(`  validateConfigSchema: avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(1);
  });

  test('validateConfig (full) < 1ms average', () => {
    const result = measure('validateConfig', () => {
      validateConfig(DEFAULT_CONFIG);
    });

    console.log(`  validateConfig: avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(1);
  });

  test('mergeConfig < 0.1ms average', () => {
    const partial = { core: { logLevel: 'debug' as const } };
    const result = measure('mergeConfig', () => {
      mergeConfig(partial as any);
    });

    console.log(`  mergeConfig: avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(0.1);
  });

  test('invalid config rejection < 1ms average', () => {
    const bad = { ...DEFAULT_CONFIG, core: { ...DEFAULT_CONFIG.core, logLevel: 'bad' } };
    const result = measure('validateConfigSchema (invalid)', () => {
      validateConfigSchema(bad);
    });

    console.log(`  validateConfigSchema (invalid): avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(1);
  });
});

describe('Backup performance', () => {
  test('backup creation < 50ms for 1MB DB', () => {
    const dataDir = join(BENCH_DIR, 'data');
    mkdirSync(dataDir, { recursive: true });
    const configPath = join(BENCH_DIR, 'config.json');
    const config = structuredClone(DEFAULT_CONFIG);
    config.core.dataDir = BENCH_DIR;
    config.memory.dbPath = join(dataDir, 'memory.db');
    config.swarm.registryPath = join(dataDir, 'registry.json');

    // Create ~1MB test DB
    writeFileSync(config.memory.dbPath, Buffer.alloc(1024 * 1024, 'x'));
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = measure('createBackup (1MB)', () => {
      createBackup({ config, configPath, label: `bench-${Date.now()}` });
    }, 20);

    console.log(`  createBackup (1MB): avg=${result.avgMs.toFixed(1)}ms p99=${result.p99Ms.toFixed(1)}ms`);
    expect(result.avgMs).toBeLessThan(50);
  });

  test('listBackups < 10ms with 20 backups', () => {
    const dataDir = join(BENCH_DIR, 'data2');
    mkdirSync(dataDir, { recursive: true });
    const configPath = join(BENCH_DIR, 'config2.json');
    const config = structuredClone(DEFAULT_CONFIG);
    config.core.dataDir = BENCH_DIR;
    config.memory.dbPath = join(dataDir, 'memory.db');
    config.swarm.registryPath = join(dataDir, 'registry.json');
    writeFileSync(config.memory.dbPath, 'test');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    for (let i = 0; i < 20; i++) {
      createBackup({ config, configPath, label: `b${i}` });
    }

    const result = measure('listBackups (20)', () => {
      listBackups(config);
    }, 100);

    console.log(`  listBackups (20): avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms`);
    expect(result.avgMs).toBeLessThan(10);
  });
});

describe('Migration performance', () => {
  test('full migration suite < 5ms on empty DB', () => {
    const result = measure('migrate (all)', () => {
      const db = new Database(':memory:');
      db.exec(`
        CREATE TABLE facts (id TEXT PRIMARY KEY, persona TEXT, entity TEXT, key TEXT, value TEXT, text TEXT, confidence REAL);
        CREATE TABLE episodes (id TEXT PRIMARY KEY, summary TEXT, outcome TEXT, happened_at INTEGER, procedure_id TEXT);
        CREATE TABLE open_loops (id TEXT PRIMARY KEY, summary TEXT, entity TEXT, status TEXT, priority INTEGER);
      `);
      const runner = createMigrationRunner(db);
      runner.migrate();
      db.close();
    }, 100);

    console.log(`  migrate (all ${MIGRATIONS.length}): avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms`);
    expect(result.avgMs).toBeLessThan(5);
  });

  test('getStatus < 1ms', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE facts (id TEXT PRIMARY KEY, persona TEXT, entity TEXT, key TEXT, value TEXT, text TEXT, confidence REAL);
      CREATE TABLE episodes (id TEXT PRIMARY KEY, summary TEXT, outcome TEXT, happened_at INTEGER, procedure_id TEXT);
      CREATE TABLE open_loops (id TEXT PRIMARY KEY, summary TEXT, entity TEXT, status TEXT, priority INTEGER);
    `);
    const runner = createMigrationRunner(db);
    runner.migrate();

    const result = measure('getStatus', () => {
      runner.getStatus();
    });

    console.log(`  getStatus: avg=${result.avgMs.toFixed(3)}ms p99=${result.p99Ms.toFixed(3)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(1);
    db.close();
  });
});

describe('Error recovery performance', () => {
  test('recordSuccess/recordFailure < 0.01ms', () => {
    const result = measure('recordSuccess', () => {
      recordSuccess('memory');
    }, 10_000);

    console.log(`  recordSuccess: avg=${result.avgMs.toFixed(4)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(0.01);
  });

  test('isAvailable < 0.01ms', () => {
    recordSuccess('memory');
    const result = measure('isAvailable', () => {
      isAvailable('memory');
    }, 10_000);

    console.log(`  isAvailable: avg=${result.avgMs.toFixed(4)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(0.01);
  });

  test('getRecoveryReport < 0.1ms with 5 subsystems', () => {
    const names: ('memory' | 'ollama' | 'swarm' | 'selfheal')[] = ['memory', 'ollama', 'swarm', 'selfheal'];
    for (const name of names) {
      recordSuccess(name);
      recordFailure(name, 'test');
    }

    const result = measure('getRecoveryReport', () => {
      getRecoveryReport();
    }, 5_000);

    console.log(`  getRecoveryReport: avg=${result.avgMs.toFixed(4)}ms ops=${result.opsPerSec.toFixed(0)}/s`);
    expect(result.avgMs).toBeLessThan(0.1);
  });

  test('withRecoverySync < 0.05ms overhead', () => {
    const baseline = measure('baseline', () => {
      const x = 1 + 1;
    }, 10_000);

    const wrapped = measure('withRecoverySync', () => {
      withRecoverySync('memory', () => 1 + 1, 0);
    }, 10_000);

    const overhead = wrapped.avgMs - baseline.avgMs;
    console.log(`  withRecoverySync overhead: ${overhead.toFixed(4)}ms`);
    expect(overhead).toBeLessThan(0.05);
  });
});
