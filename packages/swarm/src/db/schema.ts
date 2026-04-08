/**
 * Shared SQLite schema for swarm extensions.
 *
 * Uses bun:sqlite for zero-dependency, in-process storage.
 * Tables: swarm_budget, budget_config, budget_per_executor, swarm_heartbeats, swarm_roles
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_DB_PATH = '/home/workspace/.swarm/swarm.db';

let _db: Database | null = null;

export function getDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA busy_timeout = 5000');
  initSchema(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS swarm_budget (
      swarm_id TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (swarm_id, executor_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS budget_config (
      swarm_id TEXT PRIMARY KEY,
      total_budget_usd REAL NOT NULL,
      alert_threshold_pct REAL DEFAULT 80,
      hard_cap_action TEXT DEFAULT 'downgrade',
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS budget_per_executor (
      swarm_id TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      limit_usd REAL,
      PRIMARY KEY (swarm_id, executor_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS swarm_heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swarm_id TEXT NOT NULL,
      beat_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      tasks_dispatched INTEGER DEFAULT 0,
      tasks_failed INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS swarm_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      model TEXT,
      tags TEXT,
      description TEXT,
      budget_cap_usd REAL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  seedDefaultRoles(db);
}

function seedDefaultRoles(db: Database): void {
  const existing = db.query('SELECT COUNT(*) as cnt FROM swarm_roles').get() as { cnt: number };
  if (existing.cnt > 0) return;

  const roles = [
    { id: 'senior-architect', name: 'Senior Architect', executor_id: 'claude-code', model: 'opus', tags: '["reasoning","planning","architecture","system-design"]', description: 'System design, complex planning, architectural decisions' },
    { id: 'ui-developer', name: 'UI Developer', executor_id: 'gemini', model: 'pro', tags: '["ui","frontend","visual","design","css"]', description: 'Frontend development, UI/UX, visual work' },
    { id: 'backend-developer', name: 'Backend Developer', executor_id: 'codex', model: 'gpt-5.x', tags: '["backend","api","refactor","database","server"]', description: 'API development, refactoring, backend systems' },
    { id: 'researcher', name: 'Researcher', executor_id: 'hermes', model: null, tags: '["research","web","multi-platform","analysis","investigation"]', description: 'Web research, multi-platform analysis, data gathering' },
    { id: 'junior-developer', name: 'Junior Developer', executor_id: 'gemini', model: 'flash', tags: '["simple","quick","edit","fix"]', description: 'Simple edits, quick fixes, low-complexity tasks' },
    { id: 'ops-engineer', name: 'Ops Engineer', executor_id: 'hermes', model: null, tags: '["infrastructure","deployment","devops","monitoring","chat"]', description: 'Infrastructure, deployment, chat delivery, operations' },
  ];

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO swarm_roles (id, name, executor_id, model, tags, description) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const r of roles) {
    stmt.run(r.id, r.name, r.executor_id, r.model, r.tags, r.description);
  }
}
