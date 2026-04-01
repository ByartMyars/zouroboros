import { describe, test, expect, afterEach } from 'bun:test';
import {
  initDatabase,
  getDatabase,
  closeDatabase,
  isInitialized,
  getDbStats,
} from '../database.js';
import type { MemoryConfig } from 'zouroboros-core';

const TEST_CONFIG: MemoryConfig = {
  enabled: true,
  dbPath: ':memory:',
  vectorEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  autoCapture: false,
  captureIntervalMinutes: 30,
  graphBoost: false,
  hydeExpansion: false,
  decayConfig: { permanent: 99999, long: 365, medium: 90, short: 30 },
};

afterEach(() => {
  closeDatabase();
});

describe('initDatabase', () => {
  test('creates all expected tables', () => {
    initDatabase(TEST_CONFIG);
    const db = getDatabase();
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);

    expect(names).toContain('facts');
    expect(names).toContain('fact_embeddings');
    expect(names).toContain('episodes');
    expect(names).toContain('episode_entities');
    expect(names).toContain('procedures');
    expect(names).toContain('open_loops');
    expect(names).toContain('cognitive_profiles');
  });

  test('is idempotent', () => {
    initDatabase(TEST_CONFIG);
    initDatabase(TEST_CONFIG); // should not throw
    expect(isInitialized()).toBe(true);
  });
});

describe('isInitialized', () => {
  test('returns false before init', () => {
    expect(isInitialized()).toBe(false);
  });

  test('returns true after init', () => {
    initDatabase(TEST_CONFIG);
    expect(isInitialized()).toBe(true);
  });

  test('returns false after close', () => {
    initDatabase(TEST_CONFIG);
    closeDatabase();
    expect(isInitialized()).toBe(false);
  });
});

describe('getDatabase', () => {
  test('throws when not initialized', () => {
    expect(() => getDatabase()).toThrow('not initialized');
  });

  test('returns database after init', () => {
    initDatabase(TEST_CONFIG);
    const db = getDatabase();
    expect(db).toBeDefined();
  });
});

describe('getDbStats', () => {
  test('returns zero counts on fresh DB', () => {
    initDatabase(TEST_CONFIG);
    const stats = getDbStats(TEST_CONFIG);
    expect(stats.facts).toBe(0);
    expect(stats.episodes).toBe(0);
    expect(stats.procedures).toBe(0);
    expect(stats.openLoops).toBe(0);
    expect(stats.embeddings).toBe(0);
  });

  test('reflects inserted data', () => {
    initDatabase(TEST_CONFIG);
    const db = getDatabase();
    db.run("INSERT INTO facts (id, entity, value, text) VALUES ('f1', 'test', 'val', 'test val')");
    db.run("INSERT INTO episodes (id, summary, outcome, happened_at) VALUES ('e1', 'test', 'success', 1000)");

    const stats = getDbStats(TEST_CONFIG);
    expect(stats.facts).toBe(1);
    expect(stats.episodes).toBe(1);
  });
});
