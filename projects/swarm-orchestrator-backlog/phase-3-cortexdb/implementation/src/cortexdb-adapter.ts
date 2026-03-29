/**
 * CortexDB Adapter Layer
 * 
 * Provides feature parity with SQLite+Ollama backend while using CortexDB WASM.
 * This adapter allows seamless migration without changing existing code.
 */

import { Database as SQLiteDB } from 'bun:sqlite';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  type: 'episodic' | 'semantic' | 'procedural';
  entity?: string;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface Episode {
  id: string;
  name: string;
  outcome: 'success' | 'partial' | 'failure';
  summary: string;
  entities: string[];
  tasksCompleted: number;
  durationMs: number;
  executorIds: string[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  successRate: number;
  totalRuns: number;
  avgDurationMs: number;
  lastRunAt: number;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  type?: 'episodic' | 'semantic' | 'procedural';
  entity?: string;
  limit?: number;
  minSimilarity?: number;
  since?: number;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  distance?: number;
}

export interface CortexDBConfig {
  path?: string;           // Path to WASM binary
  dimension?: number;      // Embedding dimension (default: 384)
  metric?: 'cosine' | 'euclidean';
  backend?: 'sqlite' | 'wasm';
  debug?: boolean;
}

export interface AdapterStats {
  totalMemories: number;
  totalEpisodes: number;
  totalAgents: number;
  lastBackup?: string;
  backend: 'sqlite' | 'cortexdb';
}

// ============================================================================
// Mock CortexDB Implementation (Production uses @dooor-ai/cortexdb)
// ============================================================================

class MockCortexDB {
  private dimension: number;
  private metric: 'cosine' | 'euclidean';
  private memories: Map<string, Memory> = new Map();
  private episodes: Map<string, Episode> = new Map();
  private agents: Map<string, Agent> = new Map();
  private vectors: Map<string, number[]> = new Map();

  constructor(config: CortexDBConfig = {}) {
    this.dimension = config.dimension || 384;
    this.metric = config.metric || 'cosine';
  }

  // Simple cosine similarity for mock
  private cosine(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Embedding generation (mock - production uses Ollama)
  async generateEmbedding(text: string): Promise<number[]> {
    // Generate deterministic mock embedding based on text hash
    const hash = text.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const seed = Math.abs(hash);
    const vec = new Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      vec[i] = Math.sin(seed * (i + 1) * 0.1) * 0.5 + 0.5;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
    return vec.map(v => v / norm);
  }

  // Memory operations
  async insertMemory(memory: Omit<Memory, 'id'>): Promise<string> {
    const id = randomUUID();
    const embedding = await this.generateEmbedding(memory.content);
    this.memories.set(id, { ...memory, id, embedding });
    this.vectors.set(id, embedding);
    return id;
  }

  async searchMemories(query: string, options: SearchOptions = {}): Promise<SearchResult<Memory>[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const results: SearchResult<Memory>[] = [];

    for (const [id, memory] of this.memories) {
      if (options.type && memory.type !== options.type) continue;
      if (options.entity && memory.entity !== options.entity) continue;
      if (options.since && memory.createdAt < options.since) continue;

      const vector = this.vectors.get(id)!;
      const score = this.metric === 'cosine' ? this.cosine(queryEmbedding, vector) : 0;
      const minSim = options.minSimilarity || 0;

      if (score >= minSim) {
        results.push({ item: memory, score, distance: 1 - score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);
  }

  // Episode operations
  async insertEpisode(episode: Omit<Episode, 'id'>): Promise<string> {
    const id = randomUUID();
    this.episodes.set(id, { ...episode, id });
    return id;
  }

  async getEpisode(id: string): Promise<Episode | null> {
    return this.episodes.get(id) || null;
  }

  async getEpisodes(options: { entity?: string; limit?: number; since?: number } = {}): Promise<Episode[]> {
    let results = Array.from(this.episodes.values());
    
    if (options.entity) {
      results = results.filter(e => e.entities.includes(options.entity!));
    }
    if (options.since) {
      results = results.filter(e => e.createdAt >= options.since!);
    }
    
    return results
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, options.limit || 10);
  }

  // Agent operations
  async upsertAgent(agent: Omit<Agent, 'id'>): Promise<string> {
    const existing = Array.from(this.agents.values()).find(a => a.name === agent.name);
    if (existing) {
      const updated = { ...existing, ...agent, id: existing.id };
      this.agents.set(existing.id, updated);
      return existing.id;
    }
    const id = randomUUID();
    this.agents.set(id, { ...agent, id });
    return id;
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.agents.get(id) || null;
  }

  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  // Stats
  getStats(): { memories: number; episodes: number; agents: number } {
    return {
      memories: this.memories.size,
      episodes: this.episodes.size,
      agents: this.agents.size,
    };
  }
}

// ============================================================================
// Adapter Layer
// ============================================================================

export class CortexDBAdapter {
  private cortexdb: MockCortexDB;
  private sqlite?: SQLiteDB;
  private backend: 'sqlite' | 'cortexdb';
  private config: CortexDBConfig;

  constructor(config: CortexDBConfig = {}) {
    this.config = { dimension: 384, metric: 'cosine', backend: 'sqlite', ...config };
    this.backend = this.config.backend || 'sqlite';
    this.cortexdb = new MockCortexDB(this.config);
    
    if (this.backend === 'sqlite') {
      this.sqlite = new SQLiteDB(':memory:');
      this.initSQLite();
    }
  }

  private initSQLite(): void {
    this.sqlite!.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        type TEXT NOT NULL,
        entity TEXT,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        outcome TEXT NOT NULL,
        summary TEXT NOT NULL,
        entities TEXT NOT NULL,
        tasks_completed INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        executor_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        success_rate REAL DEFAULT 0,
        total_runs INTEGER DEFAULT 0,
        avg_duration_ms INTEGER DEFAULT 0,
        last_run_at INTEGER DEFAULT 0,
        metadata TEXT
      );
    `);
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  async insertMemory(content: string, type: Memory['type'], metadata?: Record<string, unknown>): Promise<string> {
    const now = Date.now();
    const id = randomUUID();

    if (this.backend === 'cortexdb') {
      return this.cortexdb.insertMemory({
        content,
        embedding: [],
        type,
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
        metadata,
      });
    }

    // SQLite fallback
    this.sqlite!.prepare(`
      INSERT INTO memories (id, content, type, access_count, created_at, updated_at, metadata)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `).run(id, content, type, now, now, JSON.stringify(metadata || {}));

    return id;
  }

  async searchMemories(query: string, options: SearchOptions = {}): Promise<SearchResult<Memory>[]> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.searchMemories(query, options);
    }

    // SQLite: simple text search (no vector similarity)
    const rows = this.sqlite!.prepare(`
      SELECT * FROM memories
      WHERE content LIKE ? ${options.type ? 'AND type = ?' : ''} ${options.entity ? 'AND entity = ?' : ''}
      ORDER BY access_count DESC
      LIMIT ?
    `).all(
      `%${query}%`,
      ...(options.type ? [options.type] : []),
      ...(options.entity ? [options.entity] : []),
      options.limit || 10
    ) as any[];

    return rows.map(row => ({
      item: {
        id: row.id,
        content: row.content,
        embedding: [],
        type: row.type,
        entity: row.entity,
        accessCount: row.access_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: JSON.parse(row.metadata || '{}'),
      },
      score: row.content.includes(query) ? 0.8 : 0.5,
    }));
  }

  // ============================================================================
  // Episode Operations
  // ============================================================================

  async insertEpisode(data: Omit<Episode, 'id'>): Promise<string> {
    const id = randomUUID();

    if (this.backend === 'cortexdb') {
      return this.cortexdb.insertEpisode(data);
    }

    this.sqlite!.prepare(`
      INSERT INTO episodes (id, name, outcome, summary, entities, tasks_completed, duration_ms, executor_ids, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.outcome, data.summary,
      JSON.stringify(data.entities), data.tasksCompleted, data.durationMs,
      JSON.stringify(data.executorIds), data.createdAt, JSON.stringify(data.metadata || {})
    );

    return id;
  }

  async getEpisode(id: string): Promise<Episode | null> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.getEpisode(id);
    }

    const row = this.sqlite!.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      outcome: row.outcome,
      summary: row.summary,
      entities: JSON.parse(row.entities),
      tasksCompleted: row.tasks_completed,
      durationMs: row.duration_ms,
      executorIds: JSON.parse(row.executor_ids),
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  async getEpisodes(options: { entity?: string; limit?: number; since?: number } = {}): Promise<Episode[]> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.getEpisodes(options);
    }

    let query = 'SELECT * FROM episodes WHERE 1=1';
    const params: any[] = [];

    if (options.entity) {
      query += ' AND entities LIKE ?';
      params.push(`%${options.entity}%`);
    }
    if (options.since) {
      query += ' AND created_at >= ?';
      params.push(options.since);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(options.limit || 10);

    const rows = this.sqlite!.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      outcome: row.outcome,
      summary: row.summary,
      entities: JSON.parse(row.entities),
      tasksCompleted: row.tasks_completed,
      durationMs: row.duration_ms,
      executorIds: JSON.parse(row.executor_ids),
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  async upsertAgent(data: Omit<Agent, 'id'>): Promise<string> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.upsertAgent(data);
    }

    const existing = this.sqlite!.prepare('SELECT id FROM agents WHERE name = ?').get(data.name) as any;
    if (existing) {
      this.sqlite!.prepare(`
        UPDATE agents SET success_rate = ?, total_runs = ?, avg_duration_ms = ?, last_run_at = ?, metadata = ?
        WHERE id = ?
      `).run(data.successRate, data.totalRuns, data.avgDurationMs, data.lastRunAt, JSON.stringify(data.metadata || {}), existing.id);
      return existing.id;
    }

    const id = randomUUID();
    this.sqlite!.prepare(`
      INSERT INTO agents (id, name, type, success_rate, total_runs, avg_duration_ms, last_run_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.type, data.successRate, data.totalRuns, data.avgDurationMs, data.lastRunAt, JSON.stringify(data.metadata || {}));

    return id;
  }

  async getAgent(id: string): Promise<Agent | null> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.getAgent(id);
    }

    const row = this.sqlite!.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      successRate: row.success_rate,
      totalRuns: row.total_runs,
      avgDurationMs: row.avg_duration_ms,
      lastRunAt: row.last_run_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  async getAgents(): Promise<Agent[]> {
    if (this.backend === 'cortexdb') {
      return this.cortexdb.getAgents();
    }

    const rows = this.sqlite!.prepare('SELECT * FROM agents').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      successRate: row.success_rate,
      totalRuns: row.total_runs,
      avgDurationMs: row.avg_duration_ms,
      lastRunAt: row.last_run_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  // ============================================================================
  // Stats & Management
  // ============================================================================

  getStats(): AdapterStats {
    const stats = this.backend === 'cortexdb' 
      ? this.cortexdb.getStats()
      : {
          memories: (this.sqlite!.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c,
          episodes: (this.sqlite!.prepare('SELECT COUNT(*) as c FROM episodes').get() as any).c,
          agents: (this.sqlite!.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c,
        };

    return {
      ...stats,
      backend: this.backend,
    };
  }

  // Rollback: Export current state
  export(): { memories: any[]; episodes: any[]; agents: any[] } {
    if (this.backend === 'cortexdb') {
      // For CortexDB, we'd need to implement export differently
      return { memories: [], episodes: [], agents: [] };
    }

    return {
      memories: this.sqlite!.prepare('SELECT * FROM memories').all(),
      episodes: this.sqlite!.prepare('SELECT * FROM episodes').all(),
      agents: this.sqlite!.prepare('SELECT * FROM agents').all(),
    };
  }

  // Switch backend (for testing)
  switchBackend(backend: 'sqlite' | 'cortexdb'): void {
    this.backend = backend;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCortexDBAdapter(config?: CortexDBConfig): CortexDBAdapter {
  return new CortexDBAdapter(config);
}

export default CortexDBAdapter;
