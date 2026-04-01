import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  createMigrationRunner,
  MIGRATIONS,
} from '../../migrations.js';

let db: Database;

function createSchemaDb(): Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      persona TEXT,
      entity TEXT NOT NULL,
      key TEXT,
      value TEXT NOT NULL,
      text TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      decay_class TEXT DEFAULT 'medium',
      importance REAL DEFAULT 1.0,
      source TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER,
      last_accessed INTEGER DEFAULT (strftime('%s', 'now')),
      confidence REAL DEFAULT 1.0,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      outcome TEXT NOT NULL,
      happened_at INTEGER NOT NULL,
      duration_ms INTEGER,
      procedure_id TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS open_loops (
      id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      entity TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      priority INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      resolved_at INTEGER
    );
  `);
  return database;
}

beforeEach(() => {
  db = createSchemaDb();
});

afterEach(() => {
  db.close();
});

describe('Migration → Rollback → Re-migrate lifecycle', () => {
  test('full up → down → up cycle preserves schema integrity', () => {
    const runner = createMigrationRunner(db);

    // Step 1: Migrate all
    const up1 = runner.migrate();
    expect(up1.applied.length).toBe(MIGRATIONS.length);
    expect(up1.errors.length).toBe(0);

    // Verify all indexes exist
    const indexesBefore = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[];
    expect(indexesBefore.length).toBeGreaterThanOrEqual(4);

    // Step 2: Rollback to migration 1 (keep only _migrations table)
    const down = runner.rollback(1);
    expect(down.errors.length).toBe(0);
    expect(down.applied.length).toBe(MIGRATIONS.length - 1);

    // Verify indexes were removed
    const indexesAfter = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_facts_persona'"
    ).all();
    expect(indexesAfter.length).toBe(0);

    // Step 3: Re-migrate — should apply same migrations cleanly
    const up2 = runner.migrate();
    expect(up2.applied.length).toBe(MIGRATIONS.length - 1);
    expect(up2.errors.length).toBe(0);

    // Verify indexes are back
    const indexesFinal = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[];
    expect(indexesFinal.length).toBe(indexesBefore.length);
  });

  test('partial migrate → complete migrate works correctly', () => {
    const runner = createMigrationRunner(db);

    // Migrate to ID 3 only
    const partial = runner.migrate(3);
    expect(partial.applied.length).toBe(3);

    const status1 = runner.getStatus();
    expect(status1.current).toBe(3);
    expect(status1.pending.length).toBe(MIGRATIONS.length - 3);

    // Complete the rest
    const rest = runner.migrate();
    expect(rest.applied.length).toBe(MIGRATIONS.length - 3);
    expect(rest.errors.length).toBe(0);

    const status2 = runner.getStatus();
    expect(status2.pending.length).toBe(0);
    expect(status2.current).toBe(MIGRATIONS[MIGRATIONS.length - 1].id);
  });

  test('data survives migration cycle', () => {
    const runner = createMigrationRunner(db);
    runner.migrate();

    // Insert test data
    db.run(
      "INSERT INTO facts (id, entity, key, value, text, persona) VALUES (?, ?, ?, ?, ?, ?)",
      ['f1', 'user', 'name', 'test-user', 'test-user', 'alaric']
    );

    // Rollback indexes (data tables untouched)
    runner.rollback(1);

    // Data should still be there
    const row = db.query("SELECT value FROM facts WHERE id = 'f1'").get() as { value: string } | null;
    expect(row).not.toBeNull();
    expect(row!.value).toBe('test-user');

    // Re-migrate
    runner.migrate();

    // Data still intact
    const row2 = db.query("SELECT value FROM facts WHERE id = 'f1'").get() as { value: string } | null;
    expect(row2).not.toBeNull();
    expect(row2!.value).toBe('test-user');
  });
});

describe('Migration with existing data', () => {
  test('indexes work on pre-existing data', () => {
    // Insert data BEFORE migrations
    db.run(
      "INSERT INTO facts (id, entity, key, value, text, persona, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['f1', 'user', 'pref', 'dark-mode', 'dark-mode', 'alaric', 0.95]
    );
    db.run(
      "INSERT INTO facts (id, entity, key, value, text, persona, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['f2', 'system', 'version', '2.0', '2.0', 'alaric', 1.0]
    );
    db.run(
      "INSERT INTO episodes (id, summary, outcome, happened_at, procedure_id) VALUES (?, ?, ?, ?, ?)",
      ['e1', 'test episode', 'success', Date.now(), 'proc1']
    );

    // Now run migrations
    const runner = createMigrationRunner(db);
    const result = runner.migrate();
    expect(result.errors.length).toBe(0);

    // Verify indexes work for queries on existing data
    const byPersona = db.query("SELECT id FROM facts WHERE persona = 'alaric'").all();
    expect(byPersona.length).toBe(2);

    const byConfidence = db.query("SELECT id FROM facts WHERE confidence >= 0.95").all();
    expect(byConfidence.length).toBe(2);

    const byProcedure = db.query("SELECT id FROM episodes WHERE procedure_id = 'proc1'").all();
    expect(byProcedure.length).toBe(1);
  });
});
