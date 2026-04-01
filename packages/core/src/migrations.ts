/**
 * Versioned database migration system for Zouroboros.
 *
 * Migrations are defined as numbered entries with up/down SQL.
 * The system tracks which migrations have been applied in a
 * `_migrations` table and applies them in order.
 */

export interface Migration {
  id: number;
  name: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: number;
}

export interface MigrationStatus {
  applied: MigrationRecord[];
  pending: Migration[];
  current: number; // highest applied migration ID, 0 if none
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  errors: { name: string; error: string }[];
}

/**
 * Built-in migrations registry.
 * New migrations are appended here with incrementing IDs.
 * IDs must be sequential and never reused.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: '001_add_migrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `,
    down: `DROP TABLE IF EXISTS _migrations;`,
  },
  {
    id: 2,
    name: '002_add_facts_persona_index',
    up: `CREATE INDEX IF NOT EXISTS idx_facts_persona ON facts(persona);`,
    down: `DROP INDEX IF EXISTS idx_facts_persona;`,
  },
  {
    id: 3,
    name: '003_add_facts_confidence_index',
    up: `CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence);`,
    down: `DROP INDEX IF EXISTS idx_facts_confidence;`,
  },
  {
    id: 4,
    name: '004_add_episodes_procedure_index',
    up: `CREATE INDEX IF NOT EXISTS idx_episodes_procedure ON episodes(procedure_id);`,
    down: `DROP INDEX IF EXISTS idx_episodes_procedure;`,
  },
  {
    id: 5,
    name: '005_add_open_loops_priority_index',
    up: `CREATE INDEX IF NOT EXISTS idx_open_loops_priority ON open_loops(priority, status);`,
    down: `DROP INDEX IF EXISTS idx_open_loops_priority;`,
  },
];

export interface MigrationRunner {
  ensureMigrationsTable(): void;
  getApplied(): MigrationRecord[];
  getStatus(): MigrationStatus;
  migrate(targetId?: number): MigrationResult;
  rollback(targetId: number): MigrationResult;
}

/**
 * Create a migration runner for a given database.
 * The `db` parameter must support `.exec(sql)`, `.query(sql).all()`,
 * and `.run(sql, params)` — matching bun:sqlite's Database API.
 */
export function createMigrationRunner(db: {
  exec(sql: string): void;
  query(sql: string): { all(): unknown[] };
  run(sql: string, params?: unknown[]): void;
}): MigrationRunner {
  function ensureMigrationsTable(): void {
    db.exec(MIGRATIONS[0].up);
  }

  function getApplied(): MigrationRecord[] {
    ensureMigrationsTable();
    return db.query('SELECT id, name, applied_at FROM _migrations ORDER BY id')
      .all() as MigrationRecord[];
  }

  function getStatus(): MigrationStatus {
    const applied = getApplied();
    const appliedIds = new Set(applied.map((m) => m.id));
    const pending = MIGRATIONS.filter((m) => !appliedIds.has(m.id));
    const current = applied.length > 0 ? Math.max(...applied.map((m) => m.id)) : 0;
    return { applied, pending, current };
  }

  function migrate(targetId?: number): MigrationResult {
    const { pending } = getStatus();
    const target = targetId ?? Math.max(...MIGRATIONS.map((m) => m.id));
    const toApply = pending
      .filter((m) => m.id <= target)
      .sort((a, b) => a.id - b.id);

    const result: MigrationResult = { applied: [], skipped: [], errors: [] };

    for (const migration of toApply) {
      try {
        db.exec(migration.up);
        db.run(
          'INSERT OR IGNORE INTO _migrations (id, name) VALUES (?, ?)',
          [migration.id, migration.name]
        );
        result.applied.push(migration.name);
      } catch (err) {
        result.errors.push({
          name: migration.name,
          error: err instanceof Error ? err.message : String(err),
        });
        break; // stop on first error
      }
    }

    return result;
  }

  function rollback(targetId: number): MigrationResult {
    const { applied } = getStatus();
    const toRollback = applied
      .filter((m) => m.id > targetId)
      .sort((a, b) => b.id - a.id); // reverse order

    const result: MigrationResult = { applied: [], skipped: [], errors: [] };

    for (const record of toRollback) {
      const migration = MIGRATIONS.find((m) => m.id === record.id);
      if (!migration) {
        result.skipped.push(`${record.name} (no migration definition found)`);
        continue;
      }

      try {
        db.exec(migration.down);
        db.run('DELETE FROM _migrations WHERE id = ?', [migration.id]);
        result.applied.push(migration.name);
      } catch (err) {
        result.errors.push({
          name: migration.name,
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    return result;
  }

  return { ensureMigrationsTable, getApplied, getStatus, migrate, rollback };
}
