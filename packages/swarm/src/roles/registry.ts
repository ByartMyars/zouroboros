/**
 * Role Registry — named roles mapped to executor + model + capabilities.
 *
 * Stored in SQLite for dynamic CRUD, queryable, survives restarts.
 * Resolves role→executor before task dispatch.
 */

import { getDb } from '../db/schema.js';
import type { Database } from 'bun:sqlite';

export interface Role {
  id: string;
  name: string;
  executorId: string;
  model?: string | null;
  tags: string[];
  description: string;
  budgetCapUSD?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface RoleResolution {
  executorId: string;
  model?: string;
  roleId: string;
  roleName: string;
}

export class RoleRegistry {
  private db: Database;

  constructor(dbPath?: string) {
    this.db = getDb(dbPath);
  }

  create(role: Omit<Role, 'createdAt' | 'updatedAt'>): Role {
    const tags = JSON.stringify(role.tags);
    this.db.run(
      `INSERT INTO swarm_roles (id, name, executor_id, model, tags, description, budget_cap_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [role.id, role.name, role.executorId, role.model ?? null, tags, role.description, role.budgetCapUSD ?? null]
    );
    return this.get(role.id)!;
  }

  get(id: string): Role | null {
    const row = this.db.query(
      'SELECT * FROM swarm_roles WHERE id = ?'
    ).get(id) as RoleRow | null;
    return row ? rowToRole(row) : null;
  }

  list(): Role[] {
    const rows = this.db.query(
      'SELECT * FROM swarm_roles ORDER BY name'
    ).all() as RoleRow[];
    return rows.map(rowToRole);
  }

  update(id: string, updates: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>): Role | null {
    const existing = this.get(id);
    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const executorId = updates.executorId ?? existing.executorId;
    const model = updates.model !== undefined ? updates.model : existing.model;
    const tags = updates.tags ? JSON.stringify(updates.tags) : JSON.stringify(existing.tags);
    const description = updates.description ?? existing.description;
    const budgetCap = updates.budgetCapUSD !== undefined ? updates.budgetCapUSD : existing.budgetCapUSD;

    this.db.run(
      `UPDATE swarm_roles SET name=?, executor_id=?, model=?, tags=?, description=?, budget_cap_usd=?, updated_at=unixepoch()
       WHERE id=?`,
      [name, executorId, model ?? null, tags, description, budgetCap ?? null, id]
    );

    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM swarm_roles WHERE id = ?', [id]);
    return result.changes > 0;
  }

  resolve(roleId: string): RoleResolution | null {
    const role = this.get(roleId);
    if (!role) return null;
    return {
      executorId: role.executorId,
      model: role.model ?? undefined,
      roleId: role.id,
      roleName: role.name,
    };
  }

  findByTag(tag: string): Role[] {
    const all = this.list();
    return all.filter(r => r.tags.some(t => t.toLowerCase().includes(tag.toLowerCase())));
  }

  bulkCreate(roles: Omit<Role, 'createdAt' | 'updatedAt'>[]): number {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO swarm_roles (id, name, executor_id, model, tags, description, budget_cap_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const role of roles) {
      const result = stmt.run(
        role.id, role.name, role.executorId, role.model ?? null,
        JSON.stringify(role.tags), role.description, role.budgetCapUSD ?? null
      );
      if (result.changes > 0) count++;
    }
    return count;
  }

  count(): number {
    return (this.db.query('SELECT COUNT(*) as cnt FROM swarm_roles').get() as { cnt: number }).cnt;
  }
}

interface RoleRow {
  id: string;
  name: string;
  executor_id: string;
  model: string | null;
  tags: string;
  description: string;
  budget_cap_usd: number | null;
  created_at: number;
  updated_at: number;
}

function rowToRole(row: RoleRow): Role {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags); } catch {}
  return {
    id: row.id,
    name: row.name,
    executorId: row.executor_id,
    model: row.model,
    tags,
    description: row.description,
    budgetCapUSD: row.budget_cap_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
